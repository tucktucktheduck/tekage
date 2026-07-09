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
if(typeof buildPresetPicker==='function') buildPresetPicker();   // docs/14 §4: layout preset picker
loadDemo();
if(typeof ProgressStore!=='undefined'){
  ProgressStore.load();
  // ?fresh=1 (or ?reset=1) wipes the profile so the first-run experience shows again
  try{ if(typeof location!=='undefined' && /[?&](fresh|reset)=1/.test(location.search||'')) ProgressStore.reset(); }catch(e){}
  applyPersistedSettings();   // T23: restore settings + best scores
}
frame();
// A song requested from the library page: tkg.html?song=<id> (baked, offline) or
// ?mutopia=<midi-url> (online). Load it and skip the first-visit landing.
let _songReq=null, _mutopiaReq=null, _uploadReq=null;
try{ const p=new URLSearchParams(location.search||''); _songReq=p.get('song'); _mutopiaReq=p.get('mutopia'); _uploadReq=p.get('upload'); }catch(e){}
if(_uploadReq && typeof loadUploadFromSession==='function') loadUploadFromSession();
else if(_songReq && _songReq.indexOf('os:')===0 && typeof loadFromOnlineSequencer==='function') loadFromOnlineSequencer(_songReq.slice(3));
else if(_songReq && _songReq.indexOf('lib:')===0 && typeof loadLibrarySong==='function') loadLibrarySong(_songReq.slice(4));
else if(_songReq && typeof loadBakedSong==='function') loadBakedSong(_songReq);
else if(_mutopiaReq && typeof loadFromUrl==='function') loadFromUrl(_mutopiaReq);
else if(typeof Onboarding!=='undefined') Onboarding.maybeStart();   // T25: first-visit landing + Blurt walkthrough
setTimeout(()=>flash('<b>PLAY mode</b> · press the letter on each note · move your two hands with <b>Tab/⏎</b> (up) &amp; <b>⇧L/⇧R</b> (down) · tap <b>MAP</b> to see the keyboard', true), 800);
