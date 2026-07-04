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
  // backdrop (skin-driven: a color, or a cover image with a contrast scrim)
  g.fillStyle=Skin.bg; g.fillRect(0,0,W,H);
  if(Skin.bgImage && _bgReady(_bgMedia)){
    drawCover(_bgMedia); g.fillStyle='rgba(3,5,11,.62)'; g.fillRect(0,0,W,H);   // darken for note contrast
  }
  drawLaneGuides();

  const t = Transport.songTime;
  const laneTop=0, hitY=pianoTop;
  const anchors = currentAnchors();

  drawSliceLanes(anchors);        // faint corridors showing where each slice sits

  // gather currently sounding (for key glow)
  activeKeys.clear();

  // ── falling notes: ONLY the notes that are "yours" drop ──
  const onscreen=[];
  const list = Song.activeNotes || [];
  const gateNote = (typeof Transport!=='undefined' && Transport.autoSlow) ? Transport.gateNote : null;
  for(const n of list){
    const by = hitY - (n.startSec - t)*FALL;            // bottom edge
    const ty = by - n.durationSec*FALL;                 // top edge
    // keep the Auto-Slow gated note drawable even after it slips past the line,
    // so a short note you're being asked to play never hides under the piano.
    if(n!==gateNote && (by < laneTop-40 || ty > hitY+4)) continue;   // offscreen
    onscreen.push({n,ty,by});
    if(t>=n.startSec && t<=n.startSec+n.durationSec) activeKeys.set(n.midi, n.hand||'right');
  }
  for(const o of onscreen) drawNote(o.n,o.ty,o.by);

  // hit line (skin primary = right hand)
  g.save();
  g.shadowBlur=14; g.shadowColor=Skin.HAND.right.glow;
  g.fillStyle=Skin.HAND.right.glow; g.fillRect(0,hitY-1.5,W,3);
  g.restore();

  drawNotePulses();               // the note is the star: lights & pulses on a hit

  drawPiano(anchors);
  drawSliceTabs(anchors);         // per-slice markers sitting on the keys
  if(UI.mode==='play') drawShiftCues(t);
  if(Song.duration) drawProgress(t);
}

// hand palette now lives on Skin (skin.js), derived from the skin's colors so
// every note/glow/key tint follows the config. Read Skin.HAND[hand] everywhere.
const HAND = Skin.HAND;

// background MEDIA (skin) — a still image OR a looping video. Loaded lazily when
// a skin sets one; the frame loop already calls draw() every frame, so a video
// animates for free. Persisted media is session-only (too big for storage).
let _bgMedia = null, _bgSrc = null, _bgKind = null;
function setBgMedia(src, kind){
  if(src===_bgSrc && kind===_bgKind) return;
  if(_bgMedia && _bgMedia.tagName==='VIDEO'){ try{ _bgMedia.pause(); }catch(e){} }
  _bgSrc=src; _bgKind=kind;
  if(!src){ _bgMedia=null; return; }
  if(kind==='video'){
    const v=document.createElement('video');
    v.muted=true; v.loop=true; v.autoplay=true; v.playsInline=true; v.setAttribute('playsinline','');
    v.oncanplay=()=>{ try{ v.play(); }catch(e){} };
    v.onloadeddata=()=>{ try{ draw(); }catch(e){} };
    v.src=src; _bgMedia=v;
  } else {
    const img=new Image(); img.onload=()=>{ try{ draw(); }catch(e){} }; img.src=src; _bgMedia=img;
  }
}
function setBgImage(src){ setBgMedia(src, 'image'); }   // back-compat (config/boot)
function _bgReady(m){
  if(!m) return false;
  if(m.tagName==='VIDEO') return m.readyState>=2 && m.videoWidth>0;
  return m.complete && m.naturalWidth>0;
}
// draw an image/video covering the whole canvas (object-fit: cover)
function drawCover(img){
  const iw=img.naturalWidth||img.videoWidth, ih=img.naturalHeight||img.videoHeight; if(!iw||!ih) return;
  const scale=Math.max(W/iw, H/ih), dw=iw*scale, dh=ih*scale;
  g.drawImage(img, (W-dw)/2, (H-dh)/2, dw, dh);
}

/* ── N-slice palette + geometry helpers (docs/14 §2.3/§2.5) ───────────
   Slice colors come from Skin.sliceColor(slice) — the per-slice palette
   (explicit color / legacy left-right / accessible cycle by order). The
   two-hand HAND table is only a fallback for an unresolved id. */
function usedSlices(){
  const all = (typeof currentSlices==='function') ? currentSlices() : [];
  const used = Song.slicesUsed || Song.handsUsed;
  return (used && used.size) ? all.filter(s=>used.has(s.id)) : all;
}
function slicePal(slice){ return (Skin.sliceColor && slice) ? Skin.sliceColor(slice) : (HAND[slice&&slice.id]||HAND.right); }
function palById(id){
  const all = (typeof currentSlices==='function') ? currentSlices() : [];
  const s = all.find(x=>x.id===id);
  return s ? slicePal(s) : (HAND[id]||HAND.right);
}
// pitch window a slice covers at `anchor` = [anchor+lowestOffset, anchor+highestOffset]
function sliceWindow(slice, anchor){
  const o0 = (slice.offs&&slice.offs.length) ? slice.offs[0] : 0;
  const o1 = (slice.offs&&slice.offs.length) ? slice.offs[slice.offs.length-1] : 11;
  return { lo: clamp(anchor+o0, LO, HI), hi: clamp(anchor+o1, LO, HI) };
}
// rail x-positions for N slices: 2 -> classic left/right; N -> evenly spread; cap 4
function railPositions(n){
  const N=Math.min(Math.max(n,1),4);
  if(N===1) return [W-22];
  const L=22, R=W-22, out=[];
  for(let i=0;i<N;i++) out.push(L + (R-L)*i/(N-1));
  return out;
}

/* faint vertical corridor for each slice's current pitch window */
function drawSliceLanes(anchors){
  g.save();
  for(const s of usedSlices()){
    const a = anchors[s.id]; if(a==null) continue;
    const {lo,hi} = sliceWindow(s, a);
    if(!geom[lo]||!geom[hi]) continue;
    const x0=geom[lo].x, x1=geom[hi].x + geom[hi].w;
    const grad=g.createLinearGradient(0,0,0,pianoTop);
    const c=slicePal(s).rgb;                              // overlapping lanes add up -> both tints
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
  // Auto-Slow gate: while the clock waits on this note past the line, pin it just
  // above the hit line (min height) so it stays visible instead of sliding under
  // the piano — you can always see the note you're asked to play.
  const isGate = (typeof Transport!=='undefined' && Transport.autoSlow && Transport.gateNote===n);
  if(isGate && by > hitY){ const hh=Math.max(n.durationSec*FALL, 26); by=hitY; ty=hitY-hh; }
  const drawBy = Math.min(by, hitY);
  const top = Math.max(ty, -20);
  const h = drawBy - top;
  if(h<=0.5) return;

  const pal = palById(n.slice || n.hand || 'right');
  let fill, glow;
  if(n.skip){ fill='rgba(120,130,150,.30)'; glow='rgba(120,130,150,.18)'; }
  else { fill = sounding ? pal.fillBright : pal.fill; glow = (sounding||isGate) ? pal.glowBright : pal.glow; }

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
function drawSliceTabs(anchors){
  const y0 = pianoTop-12;
  g.font="700 10px 'Orbitron', sans-serif";
  // measure every used slice's bracket + pill, then pack pills into vertical
  // levels so overlapping slice windows never overprint (docs/14 §2.3).
  const items = [];
  for(const s of usedSlices()){
    const a = anchors[s.id]; if(a==null) continue;
    const {lo,hi} = sliceWindow(s, a);
    if(!geom[lo]||!geom[hi]) continue;
    const x0=geom[lo].x, x1=geom[hi].x+geom[hi].w, cx=(x0+x1)/2;
    const txt = s.label+' '+noteName(a)+octaveOf(a);
    const tw=g.measureText(txt).width+12;
    items.push({ s, x0, x1, cx, txt, tw, pillL:cx-tw/2, pillR:cx+tw/2 });
  }
  items.sort((p,q)=>p.pillL-q.pillL);
  const levelRight=[];                        // greedy interval coloring -> stagger level
  for(const it of items){
    let lvl=0; while(lvl<levelRight.length && levelRight[lvl] > it.pillL-6) lvl++;
    it.level=lvl; levelRight[lvl]=it.pillR;
  }
  for(const it of items){
    const pal=slicePal(it.s); const py=y0 - it.level*15;
    g.save();
    // bracket sits on the keys; only the pill stacks upward
    g.strokeStyle=pal.fill; g.lineWidth=2; g.shadowBlur=8; g.shadowColor=pal.glow;
    g.beginPath(); g.moveTo(it.x0+1,y0+8); g.lineTo(it.x0+1,y0); g.lineTo(it.x1-1,y0); g.lineTo(it.x1-1,y0+8); g.stroke();
    g.textAlign='center'; g.textBaseline='middle';
    g.fillStyle=pal.fill; g.shadowBlur=10;
    roundRect(it.cx-it.tw/2, py-13, it.tw, 13, 6); g.fill();
    g.shadowBlur=0; g.fillStyle=pal.ink; g.fillText(it.txt, it.cx, py-6.5);
    g.restore();
  }
}

/* falling shift cues on per-slice rails: lowest order -> far left, highest ->
   far right (2 slices = the classic left/right rails). When a cue reaches the
   line it's your signal to shift that slice. Rails cap at 4; extra slices share
   the nearest rail (docs/14 §2.3). */
function drawShiftCues(t){
  const cues=Song.shiftCues||[]; const hitY=pianoTop;
  const slices = usedSlices().slice().sort((a,b)=>a.order-b.order);
  const rails = railPositions(slices.length);
  const railOf={}; slices.forEach((s,i)=>{ railOf[s.id]=rails[Math.min(i, rails.length-1)]; });
  for(const c of cues){
    const by = hitY - (c.timeSec - t)*FALL;
    if(by<-30 || by>hitY+30) continue;
    const railX = (railOf[c.slice] != null) ? railOf[c.slice] : (c.hand==='left'?22:W-22);
    const pal=palById(c.slice || c.hand);
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
  // rail labels — one per used slice, at its rail
  g.save();
  g.font="700 8px 'Orbitron',sans-serif"; g.textAlign='center'; g.globalAlpha=.5;
  slices.forEach((s,i)=>{ g.fillStyle=slicePal(s).fill; g.fillText('SHIFT '+s.label, rails[Math.min(i, rails.length-1)], 14); });
  g.restore();
}

// which used slice's window covers `midi` at the current anchors (first by
// config order on overlap) — drives the faint per-slice key tint.
function sliceIdAt(m, anchors){
  for(const s of usedSlices()){
    const a=anchors[s.id]; if(a==null) continue;
    const {lo,hi}=sliceWindow(s, a);
    if(m>=lo && m<=hi) return s.id;
  }
  return null;
}
function drawPiano(anchors){
  const namesOn = UI.keyNames;
  // white keys
  for(let m=LO;m<=HI;m++){
    const ge=geom[m]; if(ge.isBlk) continue;
    const act=activeKeys.get(m), pr=pressed.get(m), hand=act||pr;
    let topCol='#f3f6fb', botCol='#c4ccd8';
    if(hand){ const p=palById(hand); topCol=p.keyTop; botCol=p.keyBot; }
    const grad=g.createLinearGradient(0,ge.y,0,ge.y+ge.h);
    grad.addColorStop(0,topCol); grad.addColorStop(1,botCol);
    g.fillStyle=grad; g.fillRect(ge.x,ge.y,ge.w-1,ge.h);
    // slice tint (only when key isn't already lit)
    const sid=sliceIdAt(m,anchors);
    if(sid && !hand){ g.fillStyle = palById(sid).tint; g.fillRect(ge.x,ge.y,ge.w-1,ge.h); }
    if(hand){ g.save(); g.shadowBlur=18; g.shadowColor=palById(hand).glowBright;
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
    if(hand){ const p=palById(hand); top=p.fillBright; bot=p.fill; }
    else { const sid=sliceIdAt(m,anchors); if(sid){ top = palById(sid).tint; bot='#05070b'; } }
    const grad=g.createLinearGradient(0,ge.y,0,ge.y+ge.h);
    grad.addColorStop(0,top); grad.addColorStop(1,bot);
    if(hand){ g.save(); g.shadowBlur=16; g.shadowColor=palById(hand).glowBright; }
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
