/* ════════════════════════════════════════════════════════════
   2 · CORE-OF-SONG EXTRACTION  (pure; no DOM/audio)
   Turns a parsed song into density-ranked, beginner-playable
   "versions": Easy·Core / Medium·Two-Voice / Hard·Full (+ a
   baked-in simple part when the file ships one). Six stages,
   per the research handoff: meter grid → voice separation →
   (single-segment) → per-note salience → ≤2 monophonic lines →
   difficulty thinning. Each version's .notes feeds solvePlan()
   unchanged. Notes are references to the originals (identity
   preserved) so the engine can play the backing in tandem.
   ════════════════════════════════════════════════════════════ */

// ── Stage 1 · meter grid → metricWeight ∈ [0,1] per note ──
function estimateMeterGrid(notes){
  const onsets=[...new Set(notes.map(n=>+n.startSec.toFixed(3)))].sort((a,b)=>a-b);
  const iois=[];
  for(let i=1;i<onsets.length;i++){ const d=onsets[i]-onsets[i-1]; if(d>0.06&&d<2) iois.push(d); }
  let beat=0.5;
  if(iois.length){
    // histogram in 20ms buckets; dominant small interval ≈ beat/subdivision
    const bucket=new Map();
    for(const d of iois){ const b=Math.round(d/0.02); bucket.set(b,(bucket.get(b)||0)+1); }
    let best=0,bb=25; for(const [b,c] of bucket){ if(c>best){best=c;bb=b;} }
    beat=Math.min(1.0,Math.max(0.2,bb*0.02));
  }
  // phase: offset that lands the most onsets on grid points
  let bestPhase=0,bestHit=-1;
  for(let p=0;p<beat;p+=beat/8){
    let hit=0; for(const o of onsets){ const r=((o-p)/beat); if(Math.abs(r-Math.round(r))<0.15) hit++; }
    if(hit>bestHit){bestHit=hit;bestPhase=p;}
  }
  const metricWeight=(t)=>{
    const r=(t-bestPhase)/beat;
    const frac=Math.abs(r-Math.round(r));            // 0 on a beat
    const onGrid=Math.max(0,1-frac/0.5);             // 1 on beat → 0 mid
    const bar=Math.abs((Math.round(r))%4);           // strong every 4 beats
    const strong=(bar===0)?1:(bar===2?0.6:0.3);
    return Math.max(0,Math.min(1, 0.55*onGrid + 0.45*onGrid*strong));
  };
  for(const n of notes) n._metric=metricWeight(n.startSec);
  return {beat, phase:bestPhase};
}

// ── Stage 2 · greedy pitch-proximity voice separation ──
function separateVoices(notes){
  const sorted=[...notes].sort((a,b)=> a.startSec-b.startSec || b.midi-a.midi);
  const voices=[];
  const LEAP=14;
  for(const n of sorted){
    let best=null,bestD=1e9;
    for(const v of voices){
      const last=v.notes[v.notes.length-1];
      if(last.startSec+last.durationSec <= n.startSec+0.04){   // voice is free
        const d=Math.abs(last.midi-n.midi);
        if(d<bestD && d<=LEAP){ bestD=d; best=v; }
      }
    }
    if(best) best.notes.push(n);
    else voices.push({notes:[n]});
  }
  for(const v of voices){
    const ms=v.notes.map(x=>x.midi);
    v.meanPitch=ms.reduce((a,b)=>a+b,0)/ms.length;
    v.span=Math.max(...ms)-Math.min(...ms);
    v.onsetRate=v.notes.length / Math.max(0.5,(v.notes[v.notes.length-1].startSec - v.notes[0].startSec)||1);
  }
  return voices;
}

// ── Stage 4 · per-note salience (+ per-voice prominence) ──
function repetitionScores(voice){
  // encode each note by relative (Δpitch, Δonset-bucket) to its predecessor,
  // count recurring 3-grams (transposition-invariant) → motif membership.
  const ns=voice.notes; const N=ns.length;
  const tup=[];
  for(let i=1;i<N;i++){
    const dp=Math.max(-12,Math.min(12, ns[i].midi-ns[i-1].midi));
    const dob=Math.round(Math.min(2,(ns[i].startSec-ns[i-1].startSec))/0.12);
    tup.push(dp+','+dob);
  }
  const gramCount=new Map();
  for(let i=0;i+2<tup.length;i++){ const g=tup[i]+'|'+tup[i+1]+'|'+tup[i+2]; gramCount.set(g,(gramCount.get(g)||0)+1); }
  const score=new Array(N).fill(0);
  for(let i=0;i+2<tup.length;i++){ const c=gramCount.get(tup[i]+'|'+tup[i+1]+'|'+tup[i+2])||1;
    const s=Math.log2(c+1); for(let k=i;k<=i+3 && k<N;k++) score[k]=Math.max(score[k],s); }
  const mx=Math.max(1,...score);
  return score.map(s=>s/mx);
}
function scoreNotes(notes, voices){
  let durMax=0, velMin=127, velMax=0, velVar=0, velMean=0;
  for(const n of notes){ durMax=Math.max(durMax,n.durationSec); const v=n.vel??80; velMin=Math.min(velMin,v); velMax=Math.max(velMax,v); velMean+=v; }
  velMean/=Math.max(1,notes.length);
  for(const n of notes){ const v=n.vel??80; velVar+=(v-velMean)**2; } velVar/=Math.max(1,notes.length);
  const velFlat = velVar < 6;                      // quantized/exported MIDI → ignore velocity
  for(const v of voices){
    const rep=repetitionScores(v);
    const regular = 1 - Math.min(1, voiceIOIstd(v));
    v._repMean = rep.reduce((a,b)=>a+b,0)/Math.max(1,rep.length);
    v._regular = regular;
    v.notes.forEach((n,i)=>{ n._rep=rep[i]; });
  }
  // per-voice prominence: which voice is "the tune" this song. Register is
  // RANK-based (top line ≈ lead — the skyline insight) so a high melody isn't
  // out-voted by a repetitive mid/low accompaniment; repetition & regularity
  // break ties. Bass-as-hook still survives — it's selected as the 2nd line.
  const sortedByPitch=[...voices].sort((a,b)=>a.meanPitch-b.meanPitch);
  const denom=Math.max(1,sortedByPitch.length-1);
  sortedByPitch.forEach((v,i)=>{ v._regRank=i/denom; });   // 0 = lowest, 1 = highest
  for(const v of voices){
    v.prominence = 0.48*v._regRank + 0.24*v._repMean + 0.28*v._regular;
  }
  for(const v of voices){
    const vm=v.meanPitch, vsp=Math.max(6,v.span);
    for(const n of v.notes){
      const reg = Math.min(1, Math.abs(n.midi-vm)/vsp);     // contour extremity within voice
      const dur = durMax>0 ? Math.min(1,n.durationSec/durMax) : 0.5;
      const vel = velFlat ? 0.5 : ( (velMax>velMin) ? (((n.vel??80)-velMin)/(velMax-velMin)) : 0.5 );
      n._salience =
          0.20*(n._metric??0.4)
        + 0.28*(n._rep??0)
        + 0.15*reg
        + 0.12*dur
        + (velFlat?0.0:0.10)*vel
        + 0.15*v.prominence;
      n._voiceRef=v;
    }
  }
  // normalize to [0,1]
  let smn=1e9,smx=-1e9; for(const n of notes){ smn=Math.min(smn,n._salience); smx=Math.max(smx,n._salience); }
  for(const n of notes){ n.salience = smx>smn ? (n._salience-smn)/(smx-smn) : 0.5; }
}
function voiceIOIstd(v){
  if(v.notes.length<3) return 1;
  const io=[]; for(let i=1;i<v.notes.length;i++) io.push(v.notes[i].startSec-v.notes[i-1].startSec);
  const m=io.reduce((a,b)=>a+b,0)/io.length; const sd=Math.sqrt(io.reduce((a,b)=>a+(b-m)**2,0)/io.length);
  return m>0 ? Math.min(1.5, sd/m) : 1;
}

// ── Stage 5 · select ≤2 monophonic lines (lead + bass) ──
function selectLines(voices){
  const usable=voices.filter(v=>v.notes.length>=3);
  if(!usable.length){ const any=voices.slice().sort((a,b)=>b.notes.length-a.notes.length)[0];
    return { lead: any?[...any.notes].sort((a,b)=>a.startSec-b.startSec):[], bass:[] }; }
  const maxN=Math.max(...usable.map(v=>v.notes.length));
  // LEAD = the highest-register voice substantial enough to carry the tune.
  // Register is decisive (the melody is almost always the top line — the
  // skyline insight); the density floor rejects a sparse high blip (octave
  // bleed). Prominence (repetition/regularity) only breaks near-ties in pitch.
  const leadPool=usable.filter(v=>v.notes.length>=Math.max(4,0.25*maxN));
  const pool=leadPool.length?leadPool:usable;
  let leadV=pool[0];
  for(const v of pool){
    if(v.meanPitch > leadV.meanPitch+1.5) leadV=v;                       // clearly higher → lead
    else if(Math.abs(v.meanPitch-leadV.meanPitch)<=1.5 && v.prominence>leadV.prominence) leadV=v; // tie → more prominent
  }
  // BASS = the lowest substantial voice that isn't the lead (its own rhythm kept)
  const others=usable.filter(v=>v!==leadV);
  const bassV=others.length ? others.reduce((lo,v)=>v.meanPitch<lo.meanPitch?v:lo) : null;
  let lead=[...leadV.notes].sort((a,b)=>a.startSec-b.startSec);
  let bass=bassV ? [...bassV.notes].sort((a,b)=>a.startSec-b.startSec) : [];
  for(const n of lead) n.voice='right';
  for(const n of bass) n.voice='left';
  // no-cross: drop a bass note sounding above a concurrent lead note
  if(bass.length && lead.length){
    bass=bass.filter(b=>{
      const concurrent=lead.find(l=> l.startSec<=b.startSec+0.03 && l.startSec+l.durationSec>b.startSec );
      return !concurrent || b.midi < concurrent.midi;
    });
  }
  return {lead, bass};
}

// ── Stage 6 · difficulty thinning (the knob) ──
function thin(notes, difficulty, durationSec){
  if(difficulty==='hard' || !notes.length) return [...notes].sort((a,b)=>a.startSec-b.startSec);
  const target = (difficulty==='easy'?2.1:4.0) * durationSec;     // notes target
  // rhythmic skeleton: strong-beat or strongly-repeated notes always survive
  const keep=new Set();
  for(const n of notes){ if((n._metric??0)>0.72 || (n._rep??0)>0.6) keep.add(n); }
  const rest=notes.filter(n=>!keep.has(n)).sort((a,b)=>(b.salience??0)-(a.salience??0));
  let i=0; while(keep.size<target && i<rest.length){ keep.add(rest[i++]); }
  return [...keep].sort((a,b)=>a.startSec-b.startSec);
}

function densityOf(notes, dur){ return dur>0 ? notes.length/dur : 0; }

function detectBaked(parsed){
  const out=[];
  for(const p of (parsed.parts||[])){
    if(/melody|lead|vocal|easy|simple/i.test(p.name||'') && p.notes && p.notes.length){
      out.push({ kind:'baked-melody', name:'File · '+p.name, notes:[...p.notes].sort((a,b)=>a.startSec-b.startSec) });
    }
  }
  return out;
}

function deriveVersions(parsed){
  const base=(parsed.notes||[]).slice().sort((a,b)=>a.startSec-b.startSec);
  const durationSec = parsed.duration || (base.length? Math.max(...base.map(n=>n.startSec+n.durationSec)) : 0) || 1;
  if(base.length<4){
    return { title:parsed.title, durationSec, versions:[
      { id:'full', name:'Full', kind:'full', density:densityOf(base,durationSec), notes:base } ]};
  }
  estimateMeterGrid(base);
  const voices=separateVoices(base);
  scoreNotes(base, voices);
  const {lead, bass}=selectLines(voices);
  const core = thin(lead, 'easy', durationSec);
  const two  = thin([...lead, ...bass].sort((a,b)=>a.startSec-b.startSec), 'medium', durationSec);

  let versions=[];
  if(core.length) versions.push({ id:'core', name:'Easy · Core', kind:'derived-core', notes:core });
  if(two.length && two.length>core.length) versions.push({ id:'2voice', name:'Medium · Two-Voice', kind:'derived-2voice', notes:two });
  versions.push({ id:'full', name:'Hard · Full', kind:'full', notes:base });
  versions.push(...detectBaked(parsed));

  // de-dup degenerate versions (same count), compute density, rank ascending
  const seen=new Set();
  versions = versions.filter(v=>{ const k=v.kind+':'+v.notes.length; if(seen.has(k))return false; seen.add(k); return true; });
  for(const v of versions){ v.density=densityOf(v.notes,durationSec); }
  versions.sort((a,b)=>a.density-b.density);
  return { title:parsed.title, durationSec, versions };
}
