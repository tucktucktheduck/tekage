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
  const off=n=> (typeof n==='number') ? n : NOTE_IDX[n];   // names OR numeric semitone offsets
  LKEYS = Object.entries(MAP.left ).map(([key,n])=>({key,off:off(n),ni:off(n)})).filter(k=>Number.isFinite(k.off));
  RKEYS = Object.entries(MAP.right).map(([key,n])=>({key,off:off(n),ni:off(n)})).filter(k=>Number.isFinite(k.off));
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
// Works for ANY slice shape: a key matches when its OFFSET from the slice
// anchor ((oct+1)*12) equals the note's distance from that anchor — offsets
// may exceed 11 for wide custom slices (e.g. an 18-key right hand).
function keyForMidi(midi, hand, oct){
  const keys = hand==='left'?LKEYS:RKEYS;
  const target = midi - (oct+1)*12;          // semitones above the slice anchor
  const f = keys.find(k=>k.off===target);
  return f ? f.key : null;
}

/* solvePlan(notes) — legacy two-hand entry point, now a thin ADAPTER over the
   generalized N-slice solver (slices.js). It builds the two current slices from
   MAP (arbitrary key sets and offsets — 12+12 standard, 2+18 asymmetric, or one
   mega hand), runs solvePlanSlices, and converts anchors back to the
   left/right-OCTAVE shape the runtime and tests speak. Same cost model as the
   old solver: shift count, time pressure, register preference, soft crossing,
   soft srcHand (12/note) and melody-continuity (6/note) penalties. */
function currentSlices(){
  const out=[];
  if(LKEYS.length) out.push(makeSlice('left',  Object.fromEntries(LKEYS.map(k=>[k.key,k.off])), {order:0, minAnchor:12, maxAnchor:96, step:12}));
  if(RKEYS.length) out.push(makeSlice('right', Object.fromEntries(RKEYS.map(k=>[k.key,k.off])), {order:1, minAnchor:12, maxAnchor:96, step:12}));
  return out;
}
function solvePlan(notes){
  const fallback={plan:[], initialState:{leftOctave:4,rightOctave:5}, stateTimeline:[], handsUsed:new Set()};
  if(!notes.length) return fallback;
  const slices=currentSlices();
  if(!slices.length) return fallback;
  const r=solvePlanSlices(notes, slices);
  const octOf=(anchors,id,dflt)=> anchors && anchors[id]!=null ? anchors[id]/12-1 : dflt;
  const initialState={ leftOctave: octOf(r.initialAnchors,'left',4), rightOctave: octOf(r.initialAnchors,'right',5) };
  const plan=r.plan.map(e=>{
    if(e.type==='note') return {type:'note', noteIndex:e.noteIndex, hand:e.slice, key:e.key, midi:e.midi, startSec:e.startSec, durationSec:e.durationSec};
    if(e.type==='shift'){
      const sh = e.slice==='left' ? (e.dir>0?SHIFT.leftUp:SHIFT.leftDn) : (e.dir>0?SHIFT.rightUp:SHIFT.rightDn);
      return {...sh, type:'shift', timeSec:e.timeSec};
    }
    return e; // skip
  });
  const stateTimeline=r.stateTimeline.map(s=>({ timeSec:s.timeSec,
    leftOctave: octOf(s.anchors,'left',initialState.leftOctave),
    rightOctave: octOf(s.anchors,'right',initialState.rightOctave) }));
  return {plan, initialState, stateTimeline, handsUsed:r.slicesUsed};
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
