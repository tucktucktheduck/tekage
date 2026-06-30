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
if(typeof buildSongMenu==='function') buildSongMenu();   // T24: populate the library menu
loadDemo();
if(typeof ProgressStore!=='undefined'){
  ProgressStore.load();
  // ?fresh=1 (or ?reset=1) wipes the profile so the first-run experience shows again
  try{ if(typeof location!=='undefined' && /[?&](fresh|reset)=1/.test(location.search||'')) ProgressStore.reset(); }catch(e){}
  applyPersistedSettings();   // T23: restore settings + best scores
}
frame();
if(typeof Onboarding!=='undefined') Onboarding.maybeStart();   // T25: first-visit landing + Blurt walkthrough
setTimeout(()=>flash('<b>PLAY mode</b> · press the letter on each note · move your two hands with <b>Tab/⏎</b> (up) &amp; <b>⇧L/⇧R</b> (down) · tap <b>MAP</b> to see the keyboard', true), 800);
