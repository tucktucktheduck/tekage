/* ════════════════════════════════════════════════════════════
   2.5 · TKG KEYBOARD MAP + DAG SOLVER + SLICES
   The heart of TKG. Each hand is a one-octave "slice" you move
   independently with the shift keys. The DAG solver assigns every
   note a hand + the COMPUTER KEY you press, plus the schedule of
   slice shifts — never letting the hands cross. The letter that
   rides each falling note is that computer key, not the pitch.
   Standard mapping ported verbatim from the original repo.
   ════════════════════════════════════════════════════════════ */
const NOTE_IDX = {C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
// Standard TKG layout — both hands span a full chromatic octave.
// The built-in standard layout (the default when no config overrides it).
const BUILTIN_MAP = {
  left:  { q:'C#', w:'D#', e:'F#', r:'G#', t:'A#', a:'C', s:'D', d:'E', f:'F', x:'G', c:'A', v:'B' },
  right: { y:'C#', u:'D#', i:'F#', o:'G#', p:'A#', j:'C', k:'D', l:'E', ';':'F', n:'G', m:'A', ',':'B' },
};
// MAP and its derived lookups are LET so loadConfig() (see config.js) can swap in
// a custom or one-hand mapping at runtime. applyMapping() rederives the lookups.
let MAP = JSON.parse(JSON.stringify(BUILTIN_MAP));
let KEY_HAND = {};                           // computer key → 'left'|'right'
let LKEYS = [], RKEYS = [];
function applyMapping(){
  KEY_HAND = {};
  for(const k in MAP.left)  KEY_HAND[k]='left';
  for(const k in MAP.right) KEY_HAND[k]='right';
  LKEYS = Object.entries(MAP.left ).map(([key,n])=>({key,ni:NOTE_IDX[n]}));
  RKEYS = Object.entries(MAP.right).map(([key,n])=>({key,ni:NOTE_IDX[n]}));
}
applyMapping();
// Shift keys that move each slice (octave only — both hands are full-range).
const SHIFT = {
  leftUp:  {key:'tab',     hand:'left',  dir:+1, glyph:'⭡', tag:'TAB'},
  leftDn:  {key:'shift_l', hand:'left',  dir:-1, glyph:'⭣', tag:'⇧L'},
  rightUp: {key:'enter',   hand:'right', dir:+1, glyph:'⭡', tag:'⏎'},
  rightDn: {key:'shift_r', hand:'right', dir:-1, glyph:'⭣', tag:'⇧R'},
};
const KEY_LABEL = {tab:'TAB', shift_l:'⇧', shift_r:'⇧', enter:'⏎', ';':';', ',':','};
const keyLabel = k => KEY_LABEL[k] || k.toUpperCase();

// Lowest playable key for a midi note in `hand` at octave `oct` (or null).
function keyForMidi(midi, hand, oct){
  const keys = hand==='left'?LKEYS:RKEYS;
  const target = midi - (oct+1)*12;          // semitone within the octave window
  if(target<0 || target>11) return null;
  const f = keys.find(k=>k.ni===target);
  return f ? f.key : null;
}

/* Beam-search Viterbi over (leftOctave, rightOctave) state — the original
   dagSolver cost model, trimmed to octave shifts since both hands are
   full-range. No crossing: right-hand lowest ≥ left-hand highest. */
function solvePlan(notes){
  const BEAM_K=200;
  if(!notes.length) return {plan:[], initialState:{leftOctave:4,rightOctave:5}, stateTimeline:[], handsUsed:new Set()};

  // group onsets within 30ms
  const events=[]; let cur={notes:[{...notes[0],origIdx:0}]};
  for(let i=1;i<notes.length;i++){
    if(notes[i].startSec - cur.notes[0].startSec < 0.03) cur.notes.push({...notes[i],origIdx:i});
    else { events.push(cur); cur={notes:[{...notes[i],origIdx:i}]}; }
  }
  events.push(cur);
  for(const ev of events){ if(ev.notes.length>9){ ev.notes.sort((a,b)=>a.midi-b.midi); ev.notes=ev.notes.slice(0,9); } }

  function handStates(handNotes, hand){
    if(!handNotes.length) return [{oct:-1, assigns:[]}];
    const out=[];
    for(let oct=0;oct<=7;oct++){
      const assigns=[]; const used=new Set(); let ok=true;
      for(const note of handNotes){
        const k=keyForMidi(note.midi,hand,oct);
        if(!k || used.has(k)){ ok=false; break; }
        used.add(k); assigns.push({origIdx:note.origIdx, hand, key:k, midi:note.midi, startSec:note.startSec, durationSec:note.durationSec});
      }
      if(ok) out.push({oct, assigns});
    }
    return out;
  }
  function eventSolutions(ev){
    const n=ev.notes.length, out=[], lim=1<<n;
    for(let mask=0;mask<lim;mask++){
      const L=[],R=[];
      for(let i=0;i<n;i++){ (mask&(1<<i))?R.push(ev.notes[i]):L.push(ev.notes[i]); }
      if(L.length>5||R.length>5) continue;
      if(L.length&&R.length){ if(Math.min(...R.map(x=>x.midi)) < Math.max(...L.map(x=>x.midi))) continue; } // no crossing
      const ls=handStates(L,'left'), rs=handStates(R,'right');
      for(const a of ls) for(const b of rs){
        out.push({ leftOct:a.oct, rightOct:b.oct, needsLeft:L.length>0, needsRight:R.length>0,
          assigns:[...a.assigns,...b.assigns], leftMidis:L.map(x=>x.midi), rightMidis:R.map(x=>x.midi) });
      }
    }
    return out;
  }
  const sols = events.map(eventSolutions);

  const midis=notes.map(n=>n.midi);
  const mid=Math.round((Math.min(...midis)+Math.max(...midis))/2);
  const initLO=Math.max(0,Math.min(7,Math.floor(mid/12)-2)), initRO=Math.min(7,initLO+1);
  const sk=(lo,ro)=>lo+','+ro;

  let beam=new Map([[sk(initLO,initRO),{cost:0,bt:null}]]);
  for(let lo=Math.max(0,initLO-1);lo<=Math.min(7,initLO+1);lo++)
    for(let ro=Math.max(0,initRO-1);ro<=Math.min(7,initRO+1);ro++){
      const key=sk(lo,ro); if(!beam.has(key)) beam.set(key,{cost:5,bt:null}); }

  const hist=[beam];
  for(let ei=0;ei<events.length;ei++){
    const cands=sols[ei];
    const prevT=ei>0?events[ei-1].notes[0].startSec:0, curT=events[ei].notes[0].startSec, gap=curT-prevT;
    const next=new Map();
    if(!cands.length){
      for(const [key,en] of beam) next.set(key,{cost:en.cost,bt:{prevKey:key,sol:null}});
    } else {
      for(const [pk,pe] of beam){
        const [plo,pro]=pk.split(',').map(Number);
        for(const s of cands){
          const nlo=s.needsLeft?s.leftOct:plo, nro=s.needsRight?s.rightOct:pro;
          const shifts=Math.abs(nlo-plo)+Math.abs(nro-pro);
          let cost=shifts*10;
          if(shifts>0 && gap<0.5) cost+=1000;
          if(shifts>1 && gap<0.5*shifts) cost+=500*shifts;
          if(s.needsLeft&&!s.needsRight){ for(const m of s.leftMidis) if(m>mid) cost+=20; }
          else if(!s.needsLeft&&s.needsRight){ for(const m of s.rightMidis) if(m<mid) cost+=20; }
          if(s.needsLeft&&s.needsRight && Math.max(...s.leftMidis)===Math.min(...s.rightMidis)) cost+=5;
          const tot=pe.cost+cost, nk=sk(nlo,nro);
          if(!next.has(nk)||next.get(nk).cost>tot) next.set(nk,{cost:tot,bt:{prevKey:pk,sol:s}});
        }
      }
    }
    beam = next.size>BEAM_K ? new Map([...next.entries()].sort((a,b)=>a[1].cost-b[1].cost).slice(0,BEAM_K)) : next;
    hist.push(beam);
  }

  let bestKey=null,bestCost=Infinity;
  for(const [k,e] of beam) if(e.cost<bestCost){bestCost=e.cost;bestKey=k;}
  if(!bestKey) return {plan:[], initialState:{leftOctave:initLO,rightOctave:initRO}, stateTimeline:[], handsUsed:new Set()};

  const path=[]; let ck=bestKey;
  for(let ei=events.length-1;ei>=0;ei--){
    const e=hist[ei+1].get(ck); if(!e||!e.bt) break;
    path.unshift({stateKey:ck, sol:e.bt.sol, ei}); ck=e.bt.prevKey;
  }
  const [slo,sro]=ck.split(',').map(Number);
  const initialState={leftOctave:slo,rightOctave:sro};
  const plan=[], timeline=[{timeSec:0,leftOctave:slo,rightOctave:sro}];
  const covered=new Set(); let pLO=slo,pRO=sro;

  for(const step of path){
    const [nlo,nro]=step.stateKey.split(',').map(Number);
    const curT=events[step.ei].notes[0].startSec;
    const shifts=[]; let t;
    t=pLO; while(t<nlo){ shifts.push({...SHIFT.leftUp }); t++; } while(t>nlo){ shifts.push({...SHIFT.leftDn }); t--; }
    t=pRO; while(t<nro){ shifts.push({...SHIFT.rightUp}); t++; } while(t>nro){ shifts.push({...SHIFT.rightDn}); t--; }
    shifts.forEach((sh,si)=>{ sh.type='shift'; sh.timeSec=Math.max(0,curT-(shifts.length-si)*0.45); plan.push(sh); });
    if(step.sol) for(const a of step.sol.assigns){ plan.push({type:'note',noteIndex:a.origIdx,hand:a.hand,key:a.key,midi:a.midi,startSec:a.startSec,durationSec:a.durationSec}); covered.add(a.origIdx); }
    timeline.push({timeSec:curT,leftOctave:nlo,rightOctave:nro}); pLO=nlo; pRO=nro;
  }
  for(let i=0;i<notes.length;i++) if(!covered.has(i)) plan.push({type:'skip',noteIndex:i,midi:notes[i].midi,startSec:notes[i].startSec});
  plan.sort((a,b)=>(a.timeSec??a.startSec??0)-(b.timeSec??b.startSec??0));
  const handsUsed = new Set(plan.filter(e=>e.type==='note').map(e=>e.hand));
  return {plan, initialState, stateTimeline:timeline, handsUsed};
}

/* Run the solver on whatever notes are currently "yours" and write the
   hand/key labels + the slice timeline + shift cues back onto Song. */
function resolvePlan(){
  for(const n of Song.notes){ n.hand=null; n.key=null; n.skip=false; n.backing=false; }
  const ver = Song.version;
  const active = (ver? ver.notes : Song.notes).slice().sort((a,b)=>a.startSec-b.startSec);
  const activeSet = new Set(active);
  if(!active.length){ Song.activeNotes=[]; Song.slicePlan=[]; Song.initSlice={L:4,R:5}; Song.shiftCues=[]; Song.handsUsed=new Set(['left','right']); return; }
  const {plan, initialState, stateTimeline, handsUsed} = solvePlan(active);
  for(const e of plan){
    if(e.type==='note'){ const n=active[e.noteIndex]; n.hand=e.hand; n.key=e.key; }
    else if(e.type==='skip'){ const n=active[e.noteIndex]; if(n) n.skip=true; }
  }
  Song.slicePlan = stateTimeline;
  Song.initSlice = {L:initialState.leftOctave, R:initialState.rightOctave};
  Song.shiftCues = plan.filter(e=>e.type==='shift');
  Song.handsUsed = handsUsed && handsUsed.size ? handsUsed : new Set(['left','right']);
  // Notes two hands can't reach (dense inner voices) are left to the engine —
  // they don't fall and you're not asked to play them, but they still sound.
  Song.activeNotes = active.filter(n=>!n.skip);
  // Backing = the rest of the full song (everything not in your version) + the
  // notes the solver had to skip. The engine plays these in tandem with you so
  // the song always sounds whole.
  for(const n of Song.notes){ if(!activeSet.has(n)) n.backing=true; }
  seedUserSlice(Transport.songTime);
}

/* Slice position from the solved timeline (step function) at time t. */
function sliceAt(t){
  let L=Song.initSlice?Song.initSlice.L:4, R=Song.initSlice?Song.initSlice.R:5;
  if(Song.slicePlan) for(const s of Song.slicePlan){ if(s.timeSec<=t+1e-6){ L=s.leftOctave; R=s.rightOctave; } else break; }
  return {L,R};
}
const userSlice={L:4,R:5};
function seedUserSlice(t){ const s=sliceAt(t); userSlice.L=s.L; userSlice.R=s.R; }
// ONE source of truth for a hand's octave — what you SEE highlighted is exactly
// what will SOUND. In PLAY you drive it; in LISTEN it follows the solved plan
// (and userSlice is kept synced so a stray key still sounds at the shown octave).
function currentSlice(){
  // Auto-Shift (T22): in PLAY the engine drives the slices along the solved plan
  // (like LISTEN's motion) while you still press the keys. userSlice is kept synced
  // so the shown octave == the audible octave.
  const drive = (UI.mode!=='play') || (typeof UI!=='undefined' && UI.autoShift);
  if(!drive) return userSlice;
  const s=sliceAt(Transport.songTime); userSlice.L=s.L; userSlice.R=s.R; return s;
}
