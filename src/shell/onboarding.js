/* ════════════════════════════════════════════════════════════
   8.8 · ONBOARDING + BLURT  (the guaranteed first win) — T25
   The most common quit is "tried a too-hard song, missed, left."
   This removes it: a chess.com-style landing, then Blurt walks the
   player through the system (keyboard->note->hit line), one-note
   practice, a guaranteed-win pass of Baa Baa Black Sheep with the
   hands driven for them, then reveals the easy buttons (docs/08).
   Shown only on first visit (ProgressStore.onboarded); baked exports
   skip it. Built as dynamic overlays so it carries the retro identity
   without touching the template.
   ════════════════════════════════════════════════════════════ */
const Onboarding = (()=>{
  let root=null, spot=null, stepIdx=0, waitingKey=false;

  const FONT="'Orbitron',sans-serif";

  function clear(){ if(root){ root.remove(); root=null; } removeSpot(); waitingKey=false; }
  function removeSpot(){ if(spot){ spot.remove(); spot=null; } }

  // a glowing ring around a target element, to "point" at it
  function spotlight(id){
    removeSpot();
    const t=document.getElementById(id); if(!t) return;
    const r=t.getBoundingClientRect();
    spot=document.createElement('div');
    spot.style.cssText='position:fixed;z-index:9600;pointer-events:none;border:2px solid #ff8a2b;border-radius:10px;'
      +'box-shadow:0 0 0 3px rgba(255,138,43,.25),0 0 22px rgba(255,138,43,.6);transition:all .25s;'
      +`left:${r.left-6}px;top:${r.top-6}px;width:${r.width+12}px;height:${r.height+12}px;`;
    document.body.appendChild(spot);
  }

  // ── landing (chess.com-style) ──────────────────────────────
  function landing(){
    clear();
    root=document.createElement('div'); root.id='obLanding';
    root.style.cssText='position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;'
      +'background:radial-gradient(ellipse at 50% 35%,#0b1428,#03050b 70%);font-family:'+FONT+';';
    root.innerHTML=
      `<div style="display:flex;gap:48px;align-items:center;flex-wrap:wrap;justify-content:center;padding:24px">`
      + `<div style="max-width:420px">`
      +   `<div style="font-size:13px;letter-spacing:3px;color:#7f93b0">PIANO RHYTHM GAME ON YOUR QWERTY KEYBOARD</div>`
      +   `<div style="font-family:${FONT};font-weight:900;font-size:74px;letter-spacing:6px;color:#ff8a2b;text-shadow:0 0 26px rgba(255,138,43,.45);margin:6px 0">TKG</div>`
      +   `<div style="font-size:15px;color:#bcd0ea;line-height:1.5">Play the piano on your computer like no one ever has.</div>`
      + `</div>`
      + `<div style="display:flex;flex-direction:column;gap:14px;min-width:240px">`
      +   `<button id="obFirst" style="cursor:pointer;border:0;border-radius:12px;padding:18px 22px;font-family:${FONT};font-weight:700;font-size:15px;letter-spacing:1px;background:#ff8a2b;color:#1a0e02;box-shadow:0 10px 30px rgba(255,138,43,.25)">First time playing</button>`
      +   `<button id="obPro" style="cursor:pointer;border:1px solid #2a3a55;border-radius:12px;padding:18px 22px;font-family:${FONT};font-weight:700;font-size:15px;letter-spacing:1px;background:#0d1526;color:#cdd9ea">I'm already a pro</button>`
      + `</div></div>`;
    document.body.appendChild(root);
    root.querySelector('#obFirst').onclick=()=>{ stepIdx=0; runWalkthrough(); };
    root.querySelector('#obPro').onclick=()=>finish();
  }

  // ── Blurt text box (a small guide that points + talks) ──────
  function blurt(text, opts){
    opts=opts||{};
    clear();
    if(opts.spotlight) spotlight(opts.spotlight);
    root=document.createElement('div'); root.id='obBlurt';
    root.style.cssText='position:fixed;left:24px;bottom:96px;z-index:9550;max-width:420px;'
      +'display:flex;gap:12px;align-items:flex-end;font-family:'+FONT+';';
    const btnLabel = opts.waitKey ? '' :
      `<button id="obNext" style="margin-top:10px;cursor:pointer;border:0;border-radius:8px;padding:8px 16px;font-weight:700;font-size:12px;letter-spacing:1px;background:#ff8a2b;color:#1a0e02">${opts.last?'LET’S PLAY':'NEXT ▸'}</button>`;
    root.innerHTML=
      `<div style="flex:0 0 auto;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#5bb8ff,#0d4a8a);`
      +  `box-shadow:0 0 18px rgba(26,143,255,.5);display:flex;align-items:center;justify-content:center;font-weight:900;color:#eaf4ff;font-size:20px">B</div>`
      + `<div style="background:#0b1220;border:1px solid #1d2b44;border-radius:12px;padding:14px 16px;box-shadow:0 14px 44px #000a">`
      +   `<div style="font-size:11px;letter-spacing:2px;color:#5ab8ff">BLURT</div>`
      +   `<div style="margin-top:5px;font-family:'Rajdhani',sans-serif;font-weight:600;font-size:15px;color:#dfe8f4;line-height:1.45">${text}</div>`
      +   (opts.waitKey?`<div style="margin-top:8px;font-size:11px;color:#7f93b0">(press any letter key)</div>`:'')
      +   btnLabel
      + `</div>`;
    document.body.appendChild(root);
    if(opts.waitKey){ waitingKey=true; }
    else { const b=root.querySelector('#obNext'); if(b) b.onclick=()=>{ (opts.onNext||next)(); }; }
  }

  // the walkthrough script (docs/08 beats)
  const script = [
    ()=> blurt("Welcome to TKG — the best way to play piano on your computer. Let’s play your first song.", { onNext: next }),
    ()=>{ // set up the guaranteed-win song: simplest version, hands driven for them
      if(typeof loadLibrarySong==='function') loadLibrarySong('baa-baa');
      if(typeof Song!=='undefined' && Song.versions && Song.versions[0] && typeof selectVersion==='function'){
        selectVersion(Song.versions[0].id);
        document.querySelectorAll('#verRow .ver').forEach(x=>x.classList.toggle('sel', x.dataset.id===Song.versions[0].id));
      }
      UI.mode='play'; UI.autoShift=true; if(typeof Transport!=='undefined') Transport.autoShift=false;
      if(typeof syncAssistUI==='function') syncAssistUI();
      blurt("Letters fall onto the piano. When a note reaches the glowing line, press that letter. Try pressing one now.", { waitKey:true });
    },
    ()=> blurt("Perfect — that’s the whole game. Now play the song through; I’ll move your hands for you, just press the letters.", {
      onNext: ()=>{ if(typeof Transport!=='undefined'){ Transport.seek(0); Transport.play(); } next(); } }),
    ()=> blurt("Awesome — you just played piano. When a song feels too hard, these buttons make it 10× easier.", { spotlight:'shiftChk', onNext: next }),
    ()=> blurt("<b>Auto-Shift</b> moves your hands along the song for you — you only press the keys.", { spotlight:'shiftChk', onNext: next }),
    ()=> blurt("<b>Auto-Slow</b> eases the song down when you miss, then speeds back up as you hit. The “thank god” button.", { spotlight:'slowChk', onNext: next }),
    ()=> blurt("Pick any song here — or load your own MIDI.", { spotlight:'songSel', onNext: next }),
    ()=> blurt("And slow things down with SPEED while you practice.", { spotlight:'speed', onNext: next }),
    ()=> blurt("That’s it — you’re playing piano on your keyboard. Have fun.", { last:true, onNext: finish }),
  ];

  function runWalkthrough(){ stepIdx=0; script[0](); }
  function next(){ stepIdx++; if(stepIdx>=script.length){ finish(); return; } script[stepIdx](); }

  // called by the input layer when the player presses a key during the practice gate
  function noteKeyPressed(){ if(waitingKey){ waitingKey=false; next(); } }

  function finish(){
    clear();
    if(typeof ProgressStore!=='undefined') ProgressStore.markOnboarded();
    if(typeof flash==='function') flash('Tip: the keyboard <b>MAP</b> button shows every key. Have fun.', true);
  }

  // public: show on first visit (unless a baked export, or already onboarded)
  function maybeStart(){
    if(typeof document==='undefined' || !document.body) return false;   // headless / no real DOM
    if(typeof window!=='undefined' && window.__TKG_CONFIG__) return false;
    if(typeof ProgressStore==='undefined') return false;
    if(ProgressStore.isOnboarded()) return false;
    landing();
    return true;
  }

  return { maybeStart, landing, finish, noteKeyPressed, _script:script };
})();
