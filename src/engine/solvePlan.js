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

// Which computer key plays `midi` in slice `sliceId` at an explicit `anchor`
// (or null). Works for ANY slice shape: a key matches when its OFFSET from the
// anchor equals the note's distance from the anchor — offsets may exceed 11 for
// wide custom slices (e.g. an 18-key right hand).
function keyForMidi(midi, sliceId, anchor){
  const s = currentSlices().find(x=>x.id===sliceId);
  if(!s) return null;
  const f = s.keys.find(k=>k.off === (midi - anchor));
  return f ? f.key : null;
}

/* currentSlices() — THE authoritative slice list. Returns the config's SLICES
   (built by normalizeSlices/applyConfig) when present; falls back to building
   the two legacy slices from MAP for the pure-engine test harness (which loads
   no config layer). */
function currentSlices(){
  if(typeof SLICES!=='undefined' && SLICES && SLICES.length) return SLICES;
  const out=[];
  if(LKEYS.length) out.push(makeSlice('left',  Object.fromEntries(LKEYS.map(k=>[k.key,k.off])), {order:0, minAnchor:12, maxAnchor:96, step:12}));
  if(RKEYS.length) out.push(makeSlice('right', Object.fromEntries(RKEYS.map(k=>[k.key,k.off])), {order:1, minAnchor:12, maxAnchor:96, step:12}));
  return out;
}

/* solvePlan(notes) — runs the generalized N-slice solver (slices.js) on the
   current slice config and speaks ANCHORS keyed by slice id. Shift entries carry
   the slice's configured shift-key cue (key/glyph/tag). Thin LEGACY aliases
   (initialState / handsUsed / plan[].hand / timeline.leftOctave|rightOctave) are
   also attached for the two standard slices, so the golden harness and any
   not-yet-ported two-hand reader keep working during the migration (docs/14 §6.1). */
function solvePlan(notes){
  const empty={ plan:[], initialAnchors:{}, initialState:{leftOctave:4,rightOctave:5}, stateTimeline:[], slicesUsed:new Set(), handsUsed:new Set() };
  if(!notes.length) return empty;
  const slices=currentSlices();
  if(!slices.length) return empty;
  const r=solvePlanSlices(notes, slices);
  const byId={}; for(const s of slices) byId[s.id]=s;
  const cueLabel = code => (!code) ? '' : (typeof codeLabel==='function') ? codeLabel(code)
                         : (typeof keyLabel==='function') ? keyLabel(code) : code;
  const plan=r.plan.map(e=>{
    if(e.type==='note') return { type:'note', noteIndex:e.noteIndex, slice:e.slice, hand:e.slice,
                                 key:e.key, midi:e.midi, startSec:e.startSec, durationSec:e.durationSec };
    if(e.type==='shift'){
      const sk=(byId[e.slice] && byId[e.slice].shiftKeys) || {};
      const arr = e.dir>0 ? sk.up : sk.down;
      const code = Array.isArray(arr) ? arr[0] : arr;
      return { type:'shift', slice:e.slice, hand:e.slice, dir:e.dir, timeSec:e.timeSec,
               key: code||null, glyph: e.dir>0?'⭡':'⭣', tag: code?cueLabel(code):(e.dir>0?'▲':'▼') };
    }
    return e; // skip
  });
  const octOf=(a,id,d)=> (a && a[id]!=null) ? a[id]/12-1 : d;
  const initialState={ leftOctave:octOf(r.initialAnchors,'left',4), rightOctave:octOf(r.initialAnchors,'right',5) };
  const stateTimeline=r.stateTimeline.map(s=>({ timeSec:s.timeSec, anchors:s.anchors,
    leftOctave:octOf(s.anchors,'left',initialState.leftOctave),
    rightOctave:octOf(s.anchors,'right',initialState.rightOctave) }));
  return { plan, initialAnchors:r.initialAnchors, initialState, stateTimeline,
           slicesUsed:r.slicesUsed, handsUsed:r.slicesUsed };
}

/* Run the solver on whatever notes are currently "yours" and write the
   slice/key labels + the anchor timeline + shift cues back onto Song. */
function resolvePlan(){
  for(const n of Song.notes){ n.hand=null; n.slice=null; n.key=null; n.skip=false; n.backing=false; }
  const ver = Song.version;
  const active = (ver? ver.notes : Song.notes).slice().sort((a,b)=>a.startSec-b.startSec);
  const activeSet = new Set(active);
  if(!active.length){
    Song.activeNotes=[]; Song.slicePlan=[]; Song.initAnchors=defaultAnchors(); Song.initSlice={L:4,R:5};
    Song.shiftCues=[]; Song.slicesUsed=new Set(); Song.handsUsed=new Set(['left','right']); seedUserAnchors(0); return;
  }
  const {plan, initialAnchors, initialState, stateTimeline, slicesUsed} = solvePlan(active);
  for(const e of plan){
    if(e.type==='note'){ const n=active[e.noteIndex]; n.slice=e.slice; n.hand=e.slice; n.key=e.key; }
    else if(e.type==='skip'){ const n=active[e.noteIndex]; if(n) n.skip=true; }
  }
  Song.slicePlan = stateTimeline;
  Song.initAnchors = initialAnchors;
  Song.initSlice = {L:initialState.leftOctave, R:initialState.rightOctave};   // legacy alias
  Song.shiftCues = plan.filter(e=>e.type==='shift');
  Song.slicesUsed = (slicesUsed && slicesUsed.size) ? slicesUsed : new Set(currentSlices().map(s=>s.id));
  Song.handsUsed = Song.slicesUsed;                                           // legacy alias
  // Notes the slices can't reach (dense inner voices) are left to the engine —
  // they don't fall and you're not asked to play them, but they still sound.
  Song.activeNotes = active.filter(n=>!n.skip);
  // Backing = the rest of the full song + the notes the solver had to skip. The
  // engine plays these in tandem with you so the song always sounds whole.
  for(const n of Song.notes){ if(!activeSet.has(n)) n.backing=true; }
  seedUserAnchors(Transport.songTime);
}

/* Each slice's boot anchor (before a song seeds the timeline). */
function defaultAnchors(){
  const o={};
  for(const s of currentSlices())
    o[s.id] = (s.initialAnchor!=null) ? s.initialAnchor
            : clamp(Math.round((s.minAnchor+s.maxAnchor)/2/s.step)*s.step, s.minAnchor, s.maxAnchor);
  return o;
}
/* Anchors object at time t from the solved timeline (step function). */
function anchorsAt(t){
  let cur = { ...(Song.initAnchors || defaultAnchors()) };
  if(Song.slicePlan) for(const s of Song.slicePlan){ if(s.timeSec<=t+1e-6){ if(s.anchors) cur={...s.anchors}; } else break; }
  return cur;
}
let userAnchors = {};
function seedUserAnchors(t){ userAnchors = anchorsAt(t); }
/* ONE source of truth for each slice's anchor — what you SEE highlighted is what
   will SOUND. In PLAY you drive it; in LISTEN / Auto-Shift it follows the solved
   plan (userAnchors kept synced so a stray key still sounds at the shown anchor). */
function currentAnchors(){
  const drive = (typeof UI==='undefined') || (UI.mode!=='play') || UI.autoShift;
  if(!drive) return userAnchors;
  const a = anchorsAt(Transport.songTime); userAnchors = {...a}; return a;
}

// ── legacy two-slice shims: an octave view over the left/right anchors. Kept
//    only while callers are migrated to anchors (docs/14 §2.1); then deleted. ──
const _octOf = a => (a!=null) ? a/12-1 : null;
function sliceAt(t){ const a=anchorsAt(t); const L=_octOf(a.left), R=_octOf(a.right); return { L:L==null?4:L, R:R==null?5:R }; }
function seedUserSlice(t){ seedUserAnchors(t); }
function currentSlice(){ const a=currentAnchors(); const L=_octOf(a.left), R=_octOf(a.right); return { L:L==null?4:L, R:R==null?5:R }; }
const userSlice = {
  get L(){ const v=_octOf(userAnchors.left);  return v==null?4:v; }, set L(o){ userAnchors.left  = (o+1)*12; },
  get R(){ const v=_octOf(userAnchors.right); return v==null?5:v; }, set R(o){ userAnchors.right = (o+1)*12; },
};
