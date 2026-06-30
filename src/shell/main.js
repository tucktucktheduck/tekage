/* ════════════════════════════════════════════════════════════
   10 · MAIN LOOP + CLOCK
   ════════════════════════════════════════════════════════════ */
function frame(){ Audio.tick(); draw(); requestAnimationFrame(frame); }   // tick() = ghost-note watchdog
window.addEventListener('resize', ()=>{ layout(); draw(); });

function tickClock(){ const n=new Date();
  $('clock').textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'); }
tickClock(); setInterval(tickClock,10000);

// boot
layout();
loadDemo();
if(typeof ProgressStore!=='undefined'){ ProgressStore.load(); applyPersistedSettings(); }   // T23: restore settings + best scores
frame();
setTimeout(()=>flash('<b>PLAY mode</b> · press the letter on each note · move your two hands with <b>Tab/⏎</b> (up) &amp; <b>⇧L/⇧R</b> (down) · tap <b>MAP</b> to see the keyboard', true), 800);
