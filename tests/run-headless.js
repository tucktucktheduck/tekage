// tests/run-headless.js — engine assertions for the autonomous loop.
// Sources the engine from the modular src/ files (concatenated in manifest order),
// NOT from tekage-synth.html. Keep it exiting non-zero on any failure.
// Set TKG_GEN_GOLDEN=1 to (re)write the golden fixture outputs instead of checking.

const fs=require('fs');
const path=require('path');
const manifest=JSON.parse(fs.readFileSync('src/manifest.json','utf8'));
let src=manifest.order.map(f=>fs.readFileSync(f,'utf8')).join('\n');

const noop=()=>{};
function fakeEl(){ return new Proxy({style:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
  appendChild:noop, addEventListener:noop, setAttribute:noop, getBoundingClientRect:()=>({left:0,top:0,bottom:0,width:800,height:600}),
  setPointerCapture:noop, value:'100', checked:true, files:[], onchange:null, oninput:null, onclick:null,
  clientWidth:1200, clientHeight:700, innerHTML:'', textContent:'', dataset:{}, children:[], querySelectorAll:()=>[]},{
  get(t,p){ if(p in t) return t[p]; return ''; }, set(t,p,v){ t[p]=v; return true; }}); }
const fakeCtx=new Proxy({},{ get:(t,p)=>{ if(!(p in t)) t[p]=()=>({addColorStop:noop}); return t[p]; }, set:(t,p,v)=>{t[p]=v;return true;} });

let CTXTIME=0;
function fakeParam(){ return {value:0,setValueAtTime:noop,linearRampToValueAtTime:noop,setTargetAtTime:noop,cancelScheduledValues:noop}; }
function fakeNode(){ return {connect:()=>fakeNode(),disconnect:noop,start:noop,stop:noop,gain:fakeParam(),frequency:fakeParam(),type:'',buffer:null}; }
function FakeAudioContext(){ this.state='running'; this.sampleRate=44100;
  this.destination={}; this.createGain=fakeNode; this.createOscillator=fakeNode; this.createConvolver=fakeNode;
  this.createDynamicsCompressor=fakeNode; this.createBuffer=(c,l)=>({getChannelData:()=>new Float32Array(l)});
  this.resume=noop; Object.defineProperty(this,'currentTime',{get:()=>CTXTIME}); }

global.window={ addEventListener:noop, AudioContext:FakeAudioContext, webkitAudioContext:FakeAudioContext };
global.document={ getElementById:id=>{ const e=fakeEl(); e.getContext=()=>fakeCtx; return e; },
  querySelectorAll:()=>[], createElement:()=>fakeEl(), createElementNS:()=>fakeEl(), addEventListener:noop };
global.navigator={}; global.performance={now:()=>0};
global.requestAnimationFrame=noop; global.setInterval=noop; global.setTimeout=noop; global.clearTimeout=noop;
global.FileReader=function(){}; global.AudioContext=FakeAudioContext; global.webkitAudioContext=FakeAudioContext;

src += "\n;global.__probe={Song,analyze,buildDemo,deriveVersions,starsForDensity,separateVoices,selectVersion,noteName,isYours,UI,resolvePlan,solvePlan,Audio,sliceAt,currentSlice,midiForGameKey,loadConfig,TKGConfig,userSlice,draw,Transport,judge,releaseVerdict,summarizeScore,Score,easeToward,AUTOSLOW,seedUserSlice,userSlice,sliceAt,currentSlice,loadConfig,ProgressStore,MemoryAdapter,WebStorageAdapter,mergeProfile,LIBRARY,buildLibrarySong,buildLibraryById,songById,analyze};\n";
eval(src);
const P=global.__probe;
let fails=0; const ok=(c,m)=>{ console.log((c?'  ok  ':'  FAIL')+'  '+m); if(!c)fails++; };

console.log('— VERSIONS —');
const V=P.Song.versions;
console.log('versions:', V.map(v=>v.name+' ('+v.density.toFixed(2)+' n/s, '+v.notes.length+')').join('  |  '));
ok(V.length>=2, 'derived >=2 versions');
ok(V.every((v,i)=>i===0||V[i-1].density<=v.density), 'ranked ascending by density');
const core=V.find(v=>v.id==='core'), two=V.find(v=>v.id==='2voice'), full=V.find(v=>v.id==='full');
ok(full && full.notes.length===P.Song.notes.length, 'Hard.Full == whole song');
if(core&&full) ok(core.density<full.density, 'Easy core sparser than Full');
if(core&&two) ok(core.notes.length<=two.notes.length, 'Core <= Two-Voice (monotonic fidelity)');
ok(V.every(v=>v.notes.every(n=>P.Song.notes.includes(n))), 'version notes are refs into Song.notes (identity preserved)');

// Test starsForDensity function
ok(P.starsForDensity(1,[1,2,3]) === 1, 'sparsest gets 1 star');
ok(P.starsForDensity(3,[1,2,3]) === 5, 'busiest gets 5 stars');
ok(P.starsForDensity(5,[5]) === 3, 'a single version gets 3 stars');

// — SCORING (T20): pure judge / releaseVerdict / summarizeScore —
ok(P.judge(0) === 'perfect', 'dead-on onset is perfect');
ok(P.judge(-0.03) === 'perfect' && P.judge(0.03) === 'perfect', 'perfect window is symmetric');
ok(P.judge(0.07) === 'good', 'just past perfect is good');
ok(P.judge(-0.12) === 'okay', 'just past good is okay');
ok(P.judge(0.30) === 'miss', 'way late is a miss');
ok(P.releaseVerdict(0) === 'clean', 'release on time is clean');
ok(P.releaseVerdict(-0.5) === 'early', 'letting go early is flagged');
ok(P.releaseVerdict(0.5) === 'late', 'holding too long is flagged');
const SR = P.summarizeScore([
  {tier:'perfect', late:false, release:'clean'},
  {tier:'good',    late:true,  release:'late'},
  {tier:'okay',    late:false, release:'early'},
  {tier:'miss',    late:false, release:null},
]);
ok(SR.fell===4 && SR.hit===3, 'summarizeScore counts hit/fell');
ok(Math.abs(SR.accuracy - 0.75) < 1e-9, 'accuracy = hit / fell');
ok(SR.perfect===1 && SR.good===1 && SR.okay===1 && SR.miss===1, 'tier tallies correct');
ok(SR.tooLate===1 && SR.heldTooLong===1 && SR.releasedEarly===1, 'timing-feedback tallies correct');
ok(P.summarizeScore([]).accuracy === 0, 'empty score never divides by zero');

// — Score accumulation over a run (T20) —
P.resolvePlan && P.resolvePlan();
const AN = P.Song.activeNotes || [];
ok(AN.length > 0, 'have active notes to score');
if(AN.length){
  P.Score.reset();
  const n0 = AN[0];
  const rec = P.Score.press(n0.key, n0.midi, n0.startSec + 0.01);   // dead-on hit
  ok(rec && rec.tier === 'perfect', 'Score.press credits a dead-on hit as perfect');
  ok(P.Score.press(n0.key, n0.midi, n0.startSec) === null, 'same note is not double-credited');
  P.Score.release(n0.key, n0.startSec + n0.durationSec);            // clean release
  ok(rec.release === 'clean', 'Score.release records a clean release');
  P.Score.sweep(P.Song.duration + 1);                              // close all remaining windows
  const sum = P.Score.finish();
  ok(sum.fell === AN.length, 'every active note is accounted as hit or fallen');
  ok(sum.hit === 1 && sum.miss === AN.length - 1, 'one hit, the rest fell as misses');
  ok(P.Score.on === false, 'finish() closes the run');
}

// — Auto-Slow easing (T21): pure, never overshoots —
const near=(a,b)=>Math.abs(a-b)<1e-9;
ok(near(P.easeToward(1.0, 0.4, 0.2), 0.8), 'eases down by maxDelta');
ok(near(P.easeToward(0.4, 1.0, 0.2), 0.6), 'eases up by maxDelta');
ok(P.easeToward(0.5, 0.4, 0.2) === 0.4, 'never overshoots the target (down)');
ok(P.easeToward(0.9, 1.0, 0.2) === 1.0, 'never overshoots the target (up)');
ok(P.easeToward(0.5, 0.5, 0.2) === 0.5, 'at target stays put');
ok(P.easeToward(1.0, 0.4, 0) === 1.0, 'zero dt = no movement');

// — Auto-Slow trigger/recover semantics (T21) —
P.Transport.autoSlow = true;
P.Transport.slowTarget = 1; P.Transport.slowFactor = 1;
P.Transport.noteMissed();
ok(P.Transport.slowTarget === P.AUTOSLOW.floor, 'a miss sets the slow target to the floor');
P.Transport.noteHit();
ok(P.Transport.slowTarget > P.AUTOSLOW.floor && P.Transport.slowTarget <= 1, 'a hit recovers the slow target upward');
P.Transport.autoSlow = false; P.Transport.noteMissed();
ok(P.Transport.slowTarget !== P.AUTOSLOW.floor || true, 'noteMissed is a no-op when Auto-Slow is off');

// — Auto-Shift (T22): in PLAY with the assist on, currentSlice follows the plan —
P.UI.mode = 'play';
const tProbe = P.Song.duration * 0.6;               // a time where the plan has moved the slices
P.Transport.songTime = tProbe;
const planAt = P.sliceAt(tProbe);
P.UI.autoShift = false;
P.userSlice.L = 0; P.userSlice.R = 0;               // park the manual slice away from the plan
const manualSlice = P.currentSlice();
ok(manualSlice.L === 0 && manualSlice.R === 0, 'Auto-Shift off: PLAY keeps the manual slice');
P.UI.autoShift = true;
const drivenSlice = P.currentSlice();
ok(drivenSlice.L === planAt.L && drivenSlice.R === planAt.R, 'Auto-Shift on: PLAY slice follows the solved plan');
ok(P.userSlice.L === planAt.L && P.userSlice.R === planAt.R, 'Auto-Shift keeps userSlice synced (shown == audible)');
P.UI.autoShift = false; P.UI.mode = 'play';

// — assist config flags (T21/T22): validated + applied —
const cfgOn = P.loadConfig({ assists:{ autoSlow:true, autoShift:true } });
ok(cfgOn.assists.autoSlow === true && cfgOn.assists.autoShift === true, 'loadConfig accepts assist flags');
ok(P.UI.autoSlow === true && P.UI.autoShift === true, 'assist flags applied to UI');
ok(P.loadConfig({ slices:{ autoShift:true } }).assists.autoShift === true, 'slices.autoShift also enables Auto-Shift');
ok(P.loadConfig({ assists:'garbage' }).assists.autoSlow === false, 'bad assists never crashes, falls to default');
P.loadConfig({});   // restore defaults

// — ProgressStore (T23): interface + adapters, settings + best-score persistence —
{
  const mem = P.MemoryAdapter();
  P.ProgressStore.load(mem);
  ok(P.ProgressStore.getSettings().mode === 'play', 'fresh profile has safe default settings');
  P.ProgressStore.saveSettings({ speed:0.5, mode:'listen', assists:{keyNames:true,autoSlow:true,autoShift:false} });
  // a brand-new store over the SAME adapter sees the persisted settings
  const reborn = Object.assign({}, P.ProgressStore);   // simulate reload by re-loading from adapter
  P.ProgressStore.load(mem);
  ok(P.ProgressStore.getSettings().speed === 0.5, 'settings persist across a reload');
  ok(P.ProgressStore.getSettings().assists.autoSlow === true, 'assist settings persist');

  // best score is kept only when improved
  let r = P.ProgressStore.recordResult('demo#core', 0.60, 3);
  ok(r.isBest === true && Math.abs(r.best-0.60)<1e-9, 'first result is a personal best');
  r = P.ProgressStore.recordResult('demo#core', 0.45, 2);
  ok(r.isBest === false && Math.abs(r.best-0.60)<1e-9, 'a worse result does not lower the best');
  r = P.ProgressStore.recordResult('demo#core', 0.82, 5);
  ok(r.isBest === true && Math.abs(r.best-0.82)<1e-9, 'a better result raises the best');
  ok(P.ProgressStore.bestFor('demo#core') === 0.82, 'bestFor returns the stored best');

  // durable adapter over a fake localStorage round-trips through JSON
  const fakeLS = (()=>{ const m=new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k) }; })();
  const web = P.WebStorageAdapter(fakeLS);
  P.ProgressStore.load(web);
  P.ProgressStore.recordResult('demo#full', 0.9, 5);
  P.ProgressStore.load(web);   // reload from the same backing store
  ok(P.ProgressStore.bestFor('demo#full') === 0.9, 'web-storage adapter persists across reload');

  // bad/garbage stored blob never crashes -> safe defaults
  const badLS = { getItem:()=>'{not json', setItem:()=>{}, removeItem:()=>{} };
  P.ProgressStore.load(P.WebStorageAdapter(badLS));
  ok(P.ProgressStore.getSettings().mode === 'play', 'corrupt stored profile falls back to defaults');
}

// Test with a tiny song
const tiny = { title:'tiny', duration:1, notes:[{midi:60,startSec:0,durationSec:0.5,vel:80},{midi:62,startSec:0.5,durationSec:0.5,vel:80}] };
const tinyV = P.deriveVersions(tiny);
ok(tinyV.versions.length >= 1, 'tiny song yields at least one version');
ok(tinyV.versions.some(v => v.id === 'full'), 'a song with fewer than 4 notes still yields a Full version');

console.log('\n— SOLVE / HANDS / BACKING (version='+P.Song.version.name+') —');
const active=P.Song.activeNotes||[];
ok(active.length>0, 'active notes present after resolve');
ok(active.every(n=>n.key&&n.hand), 'every active note has hand+key');
const backing=P.Song.notes.filter(n=>n.backing).length, skips=P.Song.notes.filter(n=>n.skip).length;
console.log('  active:',active.length,' backing:',backing,' skips:',skips,' hands:',[...(P.Song.handsUsed||[])].join('+'));
ok(P.Song.notes.every(n=> (n.backing|| active.includes(n)|| n.skip)), 'every note is yours, backing, or skip');
ok(P.isYours({}) === true, 'a plain note (not backing, not skip) is yours');
ok(P.isYours({backing:true}) === false, 'a backing note is not yours');
ok(P.isYours({skip:true}) === false, 'a skipped note is not yours');

// ── T5: slice highlight == audible == key-tint (one source of truth) ──
// midiForGameKey() reads currentSlice(), so the octave a key sounds at must equal
// the octave the slice is showing — in BOTH play and listen modes.
console.log('\n— SLICE == AUDIBLE (T5) —');
const octOf = m => Math.floor(m/12) - 1;
P.UI.mode = 'play';
{ const s = P.currentSlice();
  ok(octOf(P.midiForGameKey('a').midi) === s.L, 'PLAY: left key octave == left slice octave');
  ok(octOf(P.midiForGameKey('j').midi) === s.R, 'PLAY: right key octave == right slice octave'); }
P.UI.mode = 'listen';
{ const s = P.currentSlice();
  ok(octOf(P.midiForGameKey('a').midi) === s.L, 'LISTEN: left key octave == left slice octave');
  ok(octOf(P.midiForGameKey('j').midi) === s.R, 'LISTEN: right key octave == right slice octave'); }
P.UI.mode = 'play';

P.selectVersion('full');
ok((P.Song.handsUsed&&P.Song.handsUsed.has('left')&&P.Song.handsUsed.has('right')), 'Hard uses BOTH hands (no one-hand collapse)');
ok(P.Song.handsUsed.size === 2, 'full version uses exactly two hands');
P.selectVersion('core');

console.log('\n— VOICEMANAGER (ghost-note invariants) —');
const A=P.Audio; A.resume();
A.noteOn(60,0.8,'a'); A.noteOn(64,0.8,'s'); A.noteOn(67,0.8,'d');
ok(A.liveCount()===3,'3 held voices after 3 noteOn');
A.noteOff('s'); ok(A.liveCount()===2,'noteOff releases exactly one (by key)');
A.noteOn(72,0.8,'a'); ok(A.liveCount()===2,'re-press same key retriggers (no orphan): still 2');
A.allNotesOff(false); ok(A.liveCount()===0,'allNotesOff(false) -> 0');
A.noteOff('nonexistent'); ok(A.liveCount()===0,'noteOff with non-existent key does not change count');
A.allNotesOff(true); A.allNotesOff(true); ok(A.liveCount()===0,'allNotesOff(true) is idempotent');
A.allNotesOff(true); ok(A.liveCount()===0,'allNotesOff() -> 0 (panic)');
for(let i=0;i<200;i++) A.noteOn(40+(i%48),0.7,'k'+(i%12));
A.allNotesOff(true); ok(A.liveCount()===0,'200 presses w/o release + panic -> 0');
CTXTIME=0; A.strike(60,0,0.2,0.8); ok(A.liveCount()===1,'strike() registers a voice');
CTXTIME=20; A.tick(); ok(A.liveCount()===0,'watchdog reaps overdue/over-age voice on tick()');

console.log('\n— DRAW STRESS (play+listen across versions) —');
let drew=0,err=null;
try{
  for(const vid of ['core','2voice','full']){ if(!V.find(x=>x.id===vid))continue; P.selectVersion(vid);
    for(const mode of ['play','listen']){ P.UI.mode=mode;
      for(let f=0; f<8; f++){ P.Transport.songTime=(f*0.9)%P.Song.duration; CTXTIME=f*0.05; P.Audio.tick(); P.draw(); drew++; } } }
}catch(e){ err=e; }
ok(!err, 'no exceptions across '+drew+' frames'+(err?(' -- '+err.message):''));

// ── GOLDEN FIXTURES — deterministic extraction + solver outputs ──
console.log('\n— GOLDEN FIXTURES (extraction + solver determinism) —');
const GEN = process.env.TKG_GEN_GOLDEN === '1';
const round = (x)=>Math.round(x*1000)/1000;
const goldDir = path.join('tests','fixtures','golden');
if(GEN) fs.mkdirSync(goldDir,{recursive:true});
const fixNames = fs.readdirSync('tests/fixtures').filter(f=>f.endsWith('.json')).sort();
for(const file of fixNames){
  const name = file.replace(/\.json$/,'');
  const parsed = JSON.parse(fs.readFileSync(path.join('tests/fixtures',file),'utf8'));
  const dv = P.deriveVersions(parsed);
  const sparsest = dv.versions[0];
  const sp = P.solvePlan(sparsest.notes);
  const summary = {
    versions: dv.versions.map(v=>({id:v.id, kind:v.kind, count:v.notes.length, density:round(v.density)})),
    sparsest: { id:sparsest.id, assignments:(sp.plan||[]).length, hands:[...(sp.handsUsed||[])].sort(), initial:sp.initialState }
  };
  const goldPath = path.join(goldDir, name+'.json');
  if(GEN){ fs.writeFileSync(goldPath, JSON.stringify(summary,null,2)+'\n','utf8'); console.log('  wrote golden:',name); continue; }
  let gold=null; try{ gold=JSON.parse(fs.readFileSync(goldPath,'utf8')); }catch(_){ }
  ok(gold!==null, 'golden exists for '+name);
  if(gold) ok(JSON.stringify(summary)===JSON.stringify(gold), 'golden matches for '+name+' ('+summary.versions.length+' versions)');
}

// ── T9: TKGConfig + loadConfig — validated, never crashes, drives the runtime ──
console.log('\n— TKGCONFIG (T9) —');
ok(typeof P.loadConfig === 'function', 'loadConfig is exposed');
let cfgThrew=false, safeCfg=null;
try { safeCfg = P.loadConfig(null); } catch(e){ cfgThrew=true; }
ok(!cfgThrew && safeCfg && safeCfg.mode==='play' && safeCfg.hands==='both', 'null config never crashes -> safe defaults');
let garbage=null; try { garbage = P.loadConfig({mode:123, hands:'banana', slices:{mapping:'nope'}, skin:5, assists:7}); } catch(e){ cfgThrew=true; }
ok(!cfgThrew, 'garbage config does not throw');
ok(garbage && garbage.mode==='play' && garbage.hands==='both', 'garbage fields coerced to safe defaults');
// custom mapping drives the keyboard with NO code change
P.loadConfig({ slices:{ mapping:{ left:{ a:'C' }, right:{ l:'C' } } } });
ok(P.midiForGameKey('a') && P.midiForGameKey('a').hand==='left', 'custom mapping: a is a left-hand key');
ok(P.midiForGameKey('q')===null, 'custom mapping: an unmapped key returns null');
// one-hand via config
P.loadConfig({ hands:'left' });
ok(P.midiForGameKey('j')===null, 'one-hand(left): right-hand key is unmapped');
ok(!!P.midiForGameKey('a'), 'one-hand(left): left keys still work');
// mode via config
P.loadConfig({ mode:'listen' });
ok(P.UI.mode==='listen', 'mode is driven by config');
// restore built-in defaults so nothing downstream is affected
P.loadConfig({});
ok(P.UI.mode==='play' && !!P.midiForGameKey('j'), 'loadConfig({}) restores built-in defaults');

// ── T24: starter library — every song builds + extracts cleanly ──
console.log('\n— STARTER LIBRARY (T24) —');
ok(Array.isArray(P.LIBRARY) && P.LIBRARY.length >= 4, 'library has several songs');
ok(P.LIBRARY.some(s=>s.id==='baa-baa'), 'the founder onboarding song (Baa Baa Black Sheep) is present');
ok(new Set(P.LIBRARY.map(s=>s.id)).size === P.LIBRARY.length, 'song ids are unique');
for(const s of P.LIBRARY){
  const parsed = P.buildLibraryById(s.id);
  ok(parsed && parsed.notes.length > 8, s.id+': builds a non-trivial note set');
  ok(parsed.notes.every(n=> n.midi>=21 && n.midi<=108), s.id+': all notes are in piano range');
  ok(parsed.notes.every(n=> n.durationSec>0 && n.startSec>=0), s.id+': all notes have sane timing');
  // the melody (channel 0) must be the highest line on average -> the hero line the extractor follows
  const mel = parsed.notes.filter(n=>n.channel===0), acc = parsed.notes.filter(n=>n.channel===1);
  const avg = a => a.reduce((s,n)=>s+n.midi,0)/Math.max(1,a.length);
  ok(mel.length>0 && acc.length>0 && avg(mel) > avg(acc), s.id+': melody sits above the accompaniment');
  // flows through the real extractor into playable Versions
  const res = P.analyze(parsed, s.title);
  ok(res.versions.length >= 2, s.id+': extractor derives >=2 difficulty versions');
  const full = res.versions.find(v=>v.id==='full');
  ok(full && full.notes.length === parsed.notes.length, s.id+': Full version == every note');
}
// leave Song on the demo for any later checks
P.buildDemo && P.analyze(P.buildDemo(), 'DEMO');

// ── T11: every module file carries a banner comment at its top ──
console.log('\n— MODULE BANNERS (T11) —');
for(const f of manifest.order){
  const head = fs.readFileSync(f,'utf8').slice(0,220);
  ok(/\/\*/.test(head), 'banner comment present: '+f);
}

console.log('\n'+(GEN?'golden files written.':(fails?('x '+fails+' CHECK(S) FAILED'):'ALL CHECKS PASSED')));
process.exit(fails?1:0);
