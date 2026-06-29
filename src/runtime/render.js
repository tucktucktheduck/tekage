/* ════════════════════════════════════════════════════════════
   6 · PIANO GEOMETRY + CANVAS RENDERER
   ════════════════════════════════════════════════════════════ */
const cvs = document.getElementById('stage');
const g = cvs.getContext('2d');
let W=0,H=0,DPR=1;
let pianoTop=0, pianoH=0, whiteW=0, blackW=0, blackH=0;
let geom = {};      // midi -> {cx, noteW, x, w, h, isBlk}
const LO=21, HI=108;
let FALL=200;       // px per song-second at rate 1 (recomputed on resize)

function layout(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  const wrap=document.getElementById('stageWrap');
  W=wrap.clientWidth; H=wrap.clientHeight;
  cvs.width=W*DPR; cvs.height=H*DPR; cvs.style.width=W+'px'; cvs.style.height=H+'px';
  g.setTransform(DPR,0,0,DPR,0,0);

  pianoH = clamp(H*0.16, 84, 150);
  pianoTop = H - pianoH;
  // count white keys
  let whites=0; for(let m=LO;m<=HI;m++) if(!isBlack(m)) whites++;
  whiteW = W/whites; blackW = whiteW*0.62; blackH=pianoH*0.62;

  geom={}; let wi=0;
  for(let m=LO;m<=HI;m++){
    if(!isBlack(m)){
      const x=wi*whiteW;
      geom[m]={isBlk:false, x, w:whiteW, y:pianoTop, h:pianoH, cx:x+whiteW/2, noteW:whiteW*0.84};
      wi++;
    } else {
      const x=wi*whiteW - blackW/2;
      geom[m]={isBlk:true, x, w:blackW, y:pianoTop, h:blackH, cx:x+blackW/2, noteW:blackW*0.92};
    }
  }
  // travel time ~ 3.0s at rate 1 across the lane above the piano
  FALL = pianoTop / 3.0;
}

const activeKeys = new Map();   // midi -> {color, until} currently sounding (from song)
const pressed = new Map();      // midi -> true (user)
const hitFlash = new Map();     // midi -> ts of correct hit
const notePulse = new Map();    // note(obj) -> {ts, tier} — the note lights & pulses on a hit
const PULSE_COL = { perfect:'90,240,170', good:'90,180,255', okay:'255,200,90' };

function draw(){
  g.clearRect(0,0,W,H);
  // backdrop
  g.fillStyle='#050810'; g.fillRect(0,0,W,H);
  drawLaneGuides();

  const t = Transport.songTime;
  const laneTop=0, hitY=pianoTop;
  const slice = currentSlice();

  drawSliceLanes(slice);          // faint corridors showing where each hand sits

  // gather currently sounding (for key glow)
  activeKeys.clear();

  // ── falling notes: ONLY the notes that are "yours" drop ──
  const onscreen=[];
  const list = Song.activeNotes || [];
  for(const n of list){
    const by = hitY - (n.startSec - t)*FALL;            // bottom edge
    const ty = by - n.durationSec*FALL;                 // top edge
    if(by < laneTop-40 || ty > hitY+4) continue;        // offscreen
    onscreen.push({n,ty,by});
    if(t>=n.startSec && t<=n.startSec+n.durationSec) activeKeys.set(n.midi, n.hand||'right');
  }
  for(const o of onscreen) drawNote(o.n,o.ty,o.by);

  // hit line
  g.save();
  g.shadowBlur=14; g.shadowColor='rgba(255,138,43,.5)';
  g.fillStyle='rgba(255,138,43,.55)'; g.fillRect(0,hitY-1.5,W,3);
  g.restore();

  drawNotePulses();               // the note is the star: lights & pulses on a hit

  drawPiano(slice);
  drawSliceTabs(slice);           // the L / R hand markers sitting on the keys
  if(UI.mode==='play') drawShiftCues(t);
  if(Song.duration) drawProgress(t);
}

const HAND = {
  left:  { fill:'#1a8fff', fillBright:'#5bb8ff', glow:'rgba(26,143,255,.55)', glowBright:'rgba(59,165,255,.85)', edge:'#bfe0ff', ink:'#04101f' },
  right: { fill:'#ff8a2b', fillBright:'#ffb060', glow:'rgba(255,138,43,.55)', glowBright:'rgba(255,170,85,.85)', edge:'#ffd9b0', ink:'#1a0e02' },
};

/* faint vertical corridor for each hand's current one-octave slice */
function drawSliceLanes(slice){
  const used = Song.handsUsed || new Set(['left','right']);
  g.save();
  for(const hand of ['left','right']){
    if(!used.has(hand)) continue;
    const oct = hand==='left'?slice.L:slice.R;
    const lo=clamp((oct+1)*12,LO,HI), hi=clamp((oct+1)*12+11,LO,HI);
    if(!geom[lo]||!geom[hi]) continue;
    const x0=geom[lo].x, x1=geom[hi].x + geom[hi].w;
    const grad=g.createLinearGradient(0,0,0,pianoTop);
    const c=hand==='left'?'26,143,255':'255,138,43';
    grad.addColorStop(0,`rgba(${c},0)`); grad.addColorStop(1,`rgba(${c},.07)`);
    g.fillStyle=grad; g.fillRect(x0,0,x1-x0,pianoTop);
    g.strokeStyle=`rgba(${c},.10)`; g.lineWidth=1;
    g.beginPath(); g.moveTo(x0,0); g.lineTo(x0,pianoTop); g.moveTo(x1,0); g.lineTo(x1,pianoTop); g.stroke();
  }
  g.restore();
}

function drawLaneGuides(){
  // faint vertical "tracks": a line at every C, octave shading
  g.save();
  for(let m=LO;m<=HI;m++){
    if(noteName(m)==='C'){
      const x=geom[m].x;
      g.strokeStyle='rgba(26,143,255,.05)'; g.lineWidth=1;
      g.beginPath(); g.moveTo(x,0); g.lineTo(x,pianoTop); g.stroke();
    }
  }
  g.restore();
}

function roundRect(x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  g.beginPath();
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
}

function drawNote(n, ty, by){
  const ge=geom[n.midi]; if(!ge) return;
  const hitY=pianoTop;
  const w=ge.noteW, x=ge.cx - w/2;
  const sounding = (Transport.songTime>=n.startSec && Transport.songTime<=n.startSec+n.durationSec);
  const drawBy = Math.min(by, hitY);
  const top = Math.max(ty, -20);
  const h = drawBy - top;
  if(h<=0.5) return;

  const hand = n.hand || 'right';
  const pal = HAND[hand];
  let fill, glow;
  if(n.skip){ fill='rgba(120,130,150,.30)'; glow='rgba(120,130,150,.18)'; }
  else { fill = sounding ? pal.fillBright : pal.fill; glow = sounding ? pal.glowBright : pal.glow; }

  g.save();
  g.shadowBlur = sounding?16:11; g.shadowColor=glow;
  g.fillStyle=fill; roundRect(x,top,w,h,Math.min(7,w/2)); g.fill();
  g.shadowBlur=0;
  g.lineWidth=1; g.strokeStyle=pal.edge; g.globalAlpha=n.skip?0.4:0.9;
  roundRect(x,top,w,h,Math.min(7,w/2)); g.stroke();
  g.restore();

  // ── the COMPUTER KEY rides the note, pinned at both ends, moving with it ──
  const label = n.skip ? '·' : keyLabel(n.key);
  const fs = clamp(w*0.66, 9, 16);
  g.save();
  g.font=`700 ${fs}px 'Share Tech Mono', monospace`;
  g.textAlign='center'; g.textBaseline='middle';
  const ink = n.skip ? 'rgba(220,228,240,.7)' : pal.ink;
  const enoughRoom = (drawBy - ty) > fs*2.4;   // tall enough to show both ends
  const drawLetterAt=(yy)=>{
    if(yy<2 || yy>hitY-1) return;
    g.shadowBlur=5; g.shadowColor='rgba(0,0,0,.5)';
    g.fillStyle = ink;
    g.fillText(label, ge.cx, yy);
  };
  if(enoughRoom){
    drawLetterAt(ty + fs*0.85);                 // beginning of the note
    drawLetterAt(Math.min(by,hitY) - fs*0.85);  // end of the note
  } else {
    drawLetterAt((Math.max(ty,0)+Math.min(by,hitY))/2);
  }
  g.restore();
}

/* slice markers + key tint live in drawPiano/drawSliceTabs below */
function drawSliceTabs(slice){
  const used = Song.handsUsed || new Set(['left','right']);
  for(const hand of ['left','right']){
    if(!used.has(hand)) continue;
    const oct = hand==='left'?slice.L:slice.R;
    const lo=clamp((oct+1)*12,LO,HI), hi=clamp((oct+1)*12+11,LO,HI);
    if(!geom[lo]||!geom[hi]) continue;
    const x0=geom[lo].x, x1=geom[hi].x+geom[hi].w, cx=(x0+x1)/2;
    const pal=HAND[hand]; const y=pianoTop-12;
    // bracket spanning the octave
    g.save();
    g.strokeStyle=pal.fill; g.lineWidth=2; g.shadowBlur=8; g.shadowColor=pal.glow;
    g.beginPath(); g.moveTo(x0+1,y+8); g.lineTo(x0+1,y); g.lineTo(x1-1,y); g.lineTo(x1-1,y+8); g.stroke();
    // label pill
    const txt = (hand==='left'?'L ':'R ')+'C'+(oct);
    g.font="700 10px 'Orbitron', sans-serif"; g.textAlign='center'; g.textBaseline='middle';
    const tw=g.measureText(txt).width+12;
    g.fillStyle=pal.fill; g.shadowBlur=10;
    roundRect(cx-tw/2,y-13,tw,13,6); g.fill();
    g.shadowBlur=0; g.fillStyle=pal.ink; g.fillText(txt,cx,y-6.5);
    g.restore();
  }
}

/* falling shift cues — left-hand on the left rail, right-hand on the right.
   When one reaches the line it's your signal to shift that slice. */
function drawShiftCues(t){
  const cues=Song.shiftCues||[]; const hitY=pianoTop;
  for(const c of cues){
    const by = hitY - (c.timeSec - t)*FALL;
    if(by<-30 || by>hitY+30) continue;
    const left = c.hand==='left';
    const railX = left ? 22 : W-22;
    const pal=HAND[c.hand];
    const near = Math.abs(by-hitY)<14;
    g.save();
    g.translate(railX, by);
    g.shadowBlur=near?16:9; g.shadowColor=pal.glow;
    g.fillStyle=near?pal.fillBright:pal.fill;
    roundRect(-16,-11,32,22,7); g.fill();
    g.shadowBlur=0; g.fillStyle=pal.ink;
    g.font="700 13px 'Share Tech Mono', monospace"; g.textAlign='center'; g.textBaseline='middle';
    g.fillText(c.dir>0?'▲':'▼', 0, -0.5);
    g.font="700 7px 'Orbitron',sans-serif"; g.fillText(c.tag, 0, 7);
    g.restore();
  }
  // rail labels (only for hands this arrangement actually uses)
  const used = Song.handsUsed || new Set(['left','right']);
  g.save();
  g.font="700 8px 'Orbitron',sans-serif"; g.textAlign='center'; g.globalAlpha=.5;
  if(used.has('left')) { g.fillStyle=HAND.left.fill;  g.fillText('SHIFT L', 22, 14); }
  if(used.has('right')){ g.fillStyle=HAND.right.fill; g.fillText('SHIFT R', W-22, 14); }
  g.restore();
}

function inSlice(m, slice){
  const used = Song.handsUsed || new Set(['left','right']);
  if(used.has('left')  && m>= (slice.L+1)*12 && m<=(slice.L+1)*12+11) return 'left';
  if(used.has('right') && m>= (slice.R+1)*12 && m<=(slice.R+1)*12+11) return 'right';
  return null;
}
function drawPiano(slice){
  const namesOn = UI.keyNames;
  // white keys
  for(let m=LO;m<=HI;m++){
    const ge=geom[m]; if(ge.isBlk) continue;
    const act=activeKeys.get(m), pr=pressed.get(m), hand=act||pr;
    let topCol='#f3f6fb', botCol='#c4ccd8';
    if(hand==='right'){ topCol='#ffd9b0'; botCol='#ff8a2b'; }
    else if(hand==='left'){ topCol='#bfe0ff'; botCol='#1a8fff'; }
    const grad=g.createLinearGradient(0,ge.y,0,ge.y+ge.h);
    grad.addColorStop(0,topCol); grad.addColorStop(1,botCol);
    g.fillStyle=grad; g.fillRect(ge.x,ge.y,ge.w-1,ge.h);
    // slice tint (only when key isn't already lit)
    const sl=inSlice(m,slice);
    if(sl && !hand){ g.fillStyle = sl==='left'?'rgba(26,143,255,.13)':'rgba(255,138,43,.13)'; g.fillRect(ge.x,ge.y,ge.w-1,ge.h); }
    if(hand){ g.save(); g.shadowBlur=18; g.shadowColor=(hand==='left')?'rgba(26,143,255,.8)':'rgba(255,138,43,.85)';
      g.fillStyle='rgba(255,255,255,0.001)'; g.fillRect(ge.x,ge.y,ge.w-1,6); g.restore(); }
    g.strokeStyle='#2a3242'; g.lineWidth=1; g.strokeRect(ge.x+0.5,ge.y+0.5,ge.w-1,ge.h-1);
    if(namesOn && noteName(m)==='C'){
      g.fillStyle='rgba(40,55,80,.8)'; g.font="600 9px 'Share Tech Mono', monospace";
      g.textAlign='center'; g.textBaseline='alphabetic';
      g.fillText('C'+octaveOf(m), ge.cx, ge.y+ge.h-6);
    }
  }
  // black keys on top
  for(let m=LO;m<=HI;m++){
    const ge=geom[m]; if(!ge.isBlk) continue;
    const act=activeKeys.get(m), pr=pressed.get(m), hand=act||pr;
    let top='#23282f', bot='#05070b';
    if(hand==='right'){ top='#ffb060'; bot='#a8500f'; }
    else if(hand==='left'){ top='#5bb8ff'; bot='#0d4a8a'; }
    else { const sl=inSlice(m,slice); if(sl){ top = sl==='left'?'#1d3550':'#4a3320'; bot='#05070b'; } }
    const grad=g.createLinearGradient(0,ge.y,0,ge.y+ge.h);
    grad.addColorStop(0,top); grad.addColorStop(1,bot);
    if(hand){ g.save(); g.shadowBlur=16; g.shadowColor=(hand==='left')?'rgba(26,143,255,.8)':'rgba(255,138,43,.85)'; }
    g.fillStyle=grad; roundRect(ge.x,ge.y,ge.w,ge.h,2); g.fill();
    if(hand) g.restore();
    g.strokeStyle='#000'; g.lineWidth=1; roundRect(ge.x,ge.y,ge.w,ge.h,2); g.stroke();
  }
  // top felt strip
  g.fillStyle='#1a0e0e'; g.fillRect(0,pianoTop-2,W,2);
}

/* On a hit, the struck note flares a ring + tier word at the hit line and fades. */
function drawNotePulses(){
  const now=performance.now(), DUR=480, hitY=pianoTop;
  for(const [n,p] of notePulse){
    const age=now-p.ts;
    if(age>DUR){ notePulse.delete(n); continue; }
    const ge=geom[n.midi]; if(!ge) continue;
    const k=age/DUR;                                  // 0..1
    const r=ge.noteW*0.7 + k*26;
    const col=PULSE_COL[p.tier]||'255,255,255';
    g.save();
    g.globalAlpha=(1-k)*0.9;
    g.lineWidth=3; g.shadowBlur=16; g.shadowColor=`rgba(${col},.9)`;
    g.strokeStyle=`rgba(${col},1)`;
    g.beginPath(); g.arc(ge.cx, hitY, r, 0, Math.PI*2); g.stroke();
    g.globalAlpha=(1-k);
    g.fillStyle=`rgba(${col},1)`;
    g.font="700 11px 'Orbitron', sans-serif"; g.textAlign='center'; g.textBaseline='alphabetic';
    g.fillText(p.tier.toUpperCase(), ge.cx, hitY-20-k*16);
    g.restore();
  }
}

function drawProgress(t){
  const frac=clamp(t/Song.duration,0,1);
  g.fillStyle='rgba(26,143,255,.12)'; g.fillRect(0,0,W,2);
  g.save(); g.shadowBlur=8; g.shadowColor='rgba(255,138,43,.6)';
  g.fillStyle='#ff8a2b'; g.fillRect(0,0,W*frac,2); g.restore();
}
