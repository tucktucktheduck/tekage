/* ════════════════════════════════════════════════════════════
   7 · INPUT  (click piano · computer keys · Web MIDI)
   ════════════════════════════════════════════════════════════ */
function midiAtPoint(px,py){
  if(py<pianoTop) return null;
  // black keys first (on top)
  for(let m=LO;m<=HI;m++){ const ge=geom[m]; if(!ge.isBlk) continue;
    if(px>=ge.x && px<=ge.x+ge.w && py<=ge.y+ge.h) return m; }
  for(let m=LO;m<=HI;m++){ const ge=geom[m]; if(ge.isBlk) continue;
    if(px>=ge.x && px<=ge.x+ge.w) return m; }
  return null;
}
function userOn(midi, hand, voiceKey){
  if(midi==null) return;
  pressed.set(midi, hand||'right'); Audio.noteOn(midi, 0.85, voiceKey ?? ('m'+midi));
  // hit credit: did you press the right KEY near a falling note's onset?
  const t=Transport.songTime;
  for(const n of (Song.activeNotes||[])){
    const match = (voiceKey && KEY_HAND[voiceKey]) ? (n.key===voiceKey) : (n.midi===midi);
    if(match && Math.abs(n.startSec-t)<0.18){ hitFlash.set(midi,performance.now()); break; }
  }
}
function userOff(midi, voiceKey){ if(midi!=null) pressed.delete(midi); Audio.noteOff(voiceKey ?? ('m'+midi)); }

let mouseDownMidi=null;
cvs.addEventListener('pointerdown',e=>{
  Audio.resume();
  const r=cvs.getBoundingClientRect();
  const py=e.clientY-r.top;
  if(py<pianoTop) return;   // clicks above the keys are handled by the scrub strip
  const m=midiAtPoint(e.clientX-r.left, py);
  if(m!=null){ mouseDownMidi=m; userOn(m,null,'mouse'); cvs.setPointerCapture(e.pointerId); }
});
cvs.addEventListener('pointerup',e=>{ if(mouseDownMidi!=null){ userOff(mouseDownMidi,'mouse'); mouseDownMidi=null; } });
cvs.addEventListener('pointercancel',()=>{ if(mouseDownMidi!=null){ userOff(mouseDownMidi,'mouse'); mouseDownMidi=null; } });
// click the very top strip to scrub
cvs.addEventListener('click',e=>{
  const r=cvs.getBoundingClientRect(), py=e.clientY-r.top;
  if(py<=10 && Song.duration){ Transport.seek((e.clientX-r.left)/W*Song.duration); if(!Transport.playing) draw(); }
});

/* Computer keyboard = the TKG instrument. You press the key shown on the
   falling note; it sounds at your slice's CURRENT octave for that hand. The
   shift keys move each slice independently — the whole point of TKG. */
function shiftSlice(hand, dir){
  if(hand==='left')  userSlice.L = clamp(userSlice.L+dir, 0, 7);
  else               userSlice.R = clamp(userSlice.R+dir, 0, 7);
}
function midiForGameKey(k){
  const hand = KEY_HAND[k]; if(!hand) return null;
  const name = (hand==='left'?MAP.left:MAP.right)[k];
  const s = currentSlice();                       // displayed == audible
  const oct = hand==='left'?s.L:s.R;
  return { midi: clamp((oct+1)*12 + NOTE_IDX[name], 21, 108), hand };
}
const down=new Map();         // key → midi currently held (for release + visuals)
window.addEventListener('keydown',e=>{
  if(e.code==='Space'){ e.preventDefault(); Transport.toggle(); return; }
  if(e.code==='Escape'){ if(MapView.open){ MapView.hide(); } return; }
  // shift keys (always live so you can position before pressing play)
  if(e.code==='Tab'){        e.preventDefault(); if(!e.repeat) shiftSlice('left', +1);  return; }
  if(e.code==='Enter'){      e.preventDefault(); if(!e.repeat) shiftSlice('right',+1);  return; }
  if(e.code==='ShiftLeft'){  e.preventDefault(); if(!e.repeat) shiftSlice('left', -1);  return; }
  if(e.code==='ShiftRight'){ e.preventDefault(); if(!e.repeat) shiftSlice('right',-1);  return; }
  if(e.repeat) return;
  const k=e.key.toLowerCase();
  if(KEY_HAND[k] && !down.has(k)){
    Audio.resume();
    const r=midiForGameKey(k); if(!r) return;
    down.set(k, r.midi); userOn(r.midi, r.hand, k);
    if(MapView.open) MapView.light(k, r.midi, true);
  }
});
window.addEventListener('keyup',e=>{
  const k=e.key.toLowerCase();
  if(down.has(k)){ userOff(down.get(k), k); if(MapView.open) MapView.light(k, down.get(k), false); down.delete(k); }
});
// Panic: never let a note ring after focus/visibility loss (eaten key-ups).
function panicRelease(){ Audio.allNotesOff(); pressed.clear(); down.clear(); mouseDownMidi=null; }
window.addEventListener('blur', panicRelease);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) panicRelease(); });
window.addEventListener('pagehide', panicRelease);

// Web MIDI (real keyboard = truest "physical piano on your computer")
if(navigator.requestMIDIAccess){
  navigator.requestMIDIAccess().then(acc=>{
    const bind=p=>p.onmidimessage=ev=>{
      const [st,d1,d2]=ev.data, cmd=st&0xf0;
      if(cmd===0x90 && d2>0) userOn(d1,null,'midi'+d1);
      else if(cmd===0x80 || (cmd===0x90&&d2===0)) userOff(d1,'midi'+d1);
    };
    acc.inputs.forEach(bind);
    acc.onstatechange=e=>{ if(e.port.type==='input'&&e.port.state==='connected') bind(e.port); };
    if(acc.inputs.size) flash('MIDI device ready');
  }).catch(()=>{});
}
