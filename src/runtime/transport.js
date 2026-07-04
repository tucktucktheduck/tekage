/* ════════════════════════════════════════════════════════════
   5 · TRANSPORT  (audio-locked clock + lookahead scheduler)
   ════════════════════════════════════════════════════════════ */
const Transport = {
  playing:false, rate:1.0, songTime:0,
  anchorCtx:0, anchorSong:0, schedPtr:0, schedTimer:null,
  targetRate:1.0, autoSlow:false, waiting:false, _gatePtr:0, gateNote:null,

  // Auto-Slow (T21, "wait only when you're late"): the song WAITS FOR YOU, but
  // only if you don't play in time. A yours-note falls at full speed through its
  // whole hit window; the clock brakes only in the last moment before that note
  // would pass its LATE (miss) edge unpressed, then parks at the line and holds
  // until the press credits it. "It only slows if you are not pressing the note"
  // — timely play never stutters, and the first note never freezes before it
  // falls. Hooks kept as no-ops for API compatibility (input.js calls them); the
  // gate is recomputed from Score state every tick, so hit/miss events need no
  // bookkeeping here.
  noteMissed(){}, noteHit(){},
  // the earliest yours-note the player hasn't played yet = the gate
  _gateNote(){
    if(!this.autoSlow || UI.mode!=='play' || !Score.on) return null;
    const N=Song.notes;
    while(this._gatePtr<N.length){
      const n=N[this._gatePtr];
      // skip engine notes, already-judged notes, and long-past notes (a seek
      // or toggling the assist mid-song must never deadlock on history)
      if(!isYours(n) || Score.byNote.has(n) || n.startSec < this.songTime - JUDGE_WINDOWS.okay){ this._gatePtr++; continue; }
      return n;
    }
    return null;
  },

  play(){
    if(!Song.notes.length) return;
    Audio.resume();
    if(this.songTime>=Song.duration) this.songTime=0;
    // Start a fresh scored run when PLAY begins from the top (T20).
    if(typeof UI!=='undefined' && UI.mode==='play' && this.songTime<=0.01) Score.reset();
    // reset the Auto-Slow gate and lock in the SPEED target as the rate
    this.waiting=false; this._gatePtr=0; this.gateNote=null;
    this.rate = clamp(this.targetRate, 0.05, 4);
    // Defer the clock anchor until the AudioContext is actually advancing.
    // A freshly-created context reports currentTime===0 until its audio thread
    // spins up; anchoring + scheduling against that frozen clock strands the
    // first notes in the past (their gain envelopes elapse) -> silent playback.
    // _tick() sets the anchor once Audio.now() goes live.
    this.playing=true; this._pendingAnchor=true; this._resetPtr();
    if(!this.schedTimer) this.schedTimer=setInterval(()=>this._tick(),25);
    setPlayBtn(true);
  },
  pause(){ this.playing=false; this.gateNote=null; setPlayBtn(false); Audio.allNotesOff(); },
  toggle(){ this.playing?this.pause():this.play(); },
  restart(){ Audio.allNotesOff(); this.seek(0); if(!this.playing) draw(); },
  seek(t){ Audio.allNotesOff(); this.songTime=clamp(t,0,Song.duration||0); this._gatePtr=0; this.waiting=false; if(this.playing){this._anchor();this._resetPtr();} if(typeof UI!=='undefined'&&UI.mode==='play') seedUserSlice(this.songTime); },

  _anchor(){ this.anchorCtx=Audio.now(); this.anchorSong=this.songTime; },
  // change the effective rate continuously: re-anchor so songTime stays unbroken
  // across the change (the clock integral has no discontinuity).
  _setRate(r){ if(Math.abs(r-this.rate)<1e-4) return; this.anchorSong=this.songTime; this.anchorCtx=Audio.now(); this.rate=r; },
  _resetPtr(){ this.schedPtr=0; while(this.schedPtr<Song.notes.length && Song.notes[this.schedPtr].startSec < this.songTime) this.schedPtr++; },
  _ctxTime(start){ return this.anchorCtx + (start - this.anchorSong)/this.rate; },

  _tick(){
    if(!this.playing) return;
    // Wait for the audio clock to be STEADILY advancing before anchoring/scheduling
    // (see play()). A just-started AudioContext reports currentTime===0, then a first
    // tiny unstable reading; notes scheduled at that edge are dropped by the audio
    // device (silent playback). Require the clock to advance a stabilization margin
    // past its first live reading so the output is truly running.
    if(this._pendingAnchor){
      const n=Audio.now();
      if(n<=0) return;                                       // clock still frozen at 0
      if(this._warmAt===undefined){ this._warmAt=n; return; } // first live reading; keep waiting
      if(n-this._warmAt<0.08) return;                        // let the audio output stabilize
      this._warmAt=undefined; this._anchor(); this._pendingAnchor=false;
    }
    this.songTime = this.anchorSong + (Audio.now()-this.anchorCtx)*this.rate;
    if(UI.mode==='play') Score.sweep(this.songTime);   // fallen yours-notes -> miss
    // Auto-Slow (wait only when late): the gated note falls at full speed through
    // its entire hit window. The clock brakes only over the last `pre` seconds
    // before the `hold` point (just inside the late/miss edge) and then parks
    // there at rate 0 until the press credits it. So a note pressed in time is
    // gone from the gate before any braking, and nothing stutters; only a note
    // you're about to MISS eases to a stop and waits. rate = base·rem/pre decays
    // the remaining gap geometrically per tick (a smooth swoop that cannot
    // overshoot at any tick spacing); `creep` guarantees arrival, `eps` snaps the
    // final hold. Everything is driven off songTime, so audio + falling notes
    // stay in lock-step (docs/09: no wall-time timers). Crediting the note
    // advances the gate and the rate law releases to base next tick — instant.
    const base = clamp(this.targetRate, 0.05, 4);
    let rate = base;
    this.waiting = false;
    const g = this._gateNote();
    this.gateNote = g;                                   // render pins this note at the line so it stays visible
    if(g){
      const rem = (g.startSec + AUTOSLOW.hold) - this.songTime;   // time until the hold point
      if(rem <= AUTOSLOW.eps){ rate = 0; this.waiting = true; }
      else if(rem < AUTOSLOW.pre){ rate = Math.max(base*rem/AUTOSLOW.pre, AUTOSLOW.creep); }
    }
    this._setRate(rate);
    const nowCtx=Audio.now();
    const ahead = nowCtx+0.12;
    while(this.schedPtr<Song.notes.length){
      const n=Song.notes[this.schedPtr];
      const when=this._ctxTime(n.startSec);
      if(when>ahead) break;
      // ENGINE plays a note when:
      //  • LISTEN → everything (full song auto-plays), OR
      //  • PLAY  → it's backing (not in your version) or a note two hands
      //            couldn't reach (n.skip) — so the song stays whole while you
      //            play your version's notes yourself.
      if(UI.mode==='listen' || n.backing || n.skip){
        // Length the note by the STEADY target rate, not the instantaneous rate:
        // an Auto-Slow brake/park (rate → 0) must never stretch an engine note to
        // a droning multi-second smear (the old glitch). base already folds in a
        // genuine SPEED-slider slowdown, so slow playback still lengthens notes.
        Audio.strike(n.midi, when, n.durationSec/Math.max(base,0.05), clamp((n.vel||90)/127,0.2,1));
      }
      this.schedPtr++;
    }
    if(this.songTime>=Song.duration+0.5){
      this.pause(); this.songTime=Song.duration;
      if(Score.on && typeof showReport==='function') showReport(Score.finish());   // end-of-song report
    }
  }
};

/* a note is "yours to play" if it's in the selected version and not a skip */
function isYours(n){ return !n.backing && !n.skip; }
