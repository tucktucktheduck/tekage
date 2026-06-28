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

src += "\n;global.__probe={Song,analyze,buildDemo,deriveVersions,separateVoices,selectVersion,noteName,isYours,UI,resolvePlan,solvePlan,Audio,sliceAt,currentSlice,userSlice,draw,Transport};\n";
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

P.selectVersion('full');
ok((P.Song.handsUsed&&P.Song.handsUsed.has('left')&&P.Song.handsUsed.has('right')), 'Hard uses BOTH hands (no one-hand collapse)');
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

console.log('\n'+(GEN?'golden files written.':(fails?('x '+fails+' CHECK(S) FAILED'):'ALL CHECKS PASSED')));
process.exit(fails?1:0);
