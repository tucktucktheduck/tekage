/* ════════════════════════════════════════════════════════════
   5 · TRANSPORT  (audio-locked clock + lookahead scheduler)
   ════════════════════════════════════════════════════════════ */
const Transport = {
  playing:false, rate:1.0, songTime:0,
  anchorCtx:0, anchorSong:0, schedPtr:0, schedTimer:null,

  play(){
    if(!Song.notes.length) return;
    Audio.resume();
    if(this.songTime>=Song.duration) this.songTime=0;
    this.playing=true; this._anchor(); this._resetPtr();
    if(!this.schedTimer) this.schedTimer=setInterval(()=>this._tick(),25);
    setPlayBtn(true);
  },
  pause(){ this.playing=false; setPlayBtn(false); Audio.allNotesOff(); },
  toggle(){ this.playing?this.pause():this.play(); },
  restart(){ Audio.allNotesOff(); this.seek(0); if(!this.playing) draw(); },
  seek(t){ Audio.allNotesOff(); this.songTime=clamp(t,0,Song.duration||0); if(this.playing){this._anchor();this._resetPtr();} if(typeof UI!=='undefined'&&UI.mode==='play') seedUserSlice(this.songTime); },

  _anchor(){ this.anchorCtx=Audio.now(); this.anchorSong=this.songTime; },
  _resetPtr(){ this.schedPtr=0; while(this.schedPtr<Song.notes.length && Song.notes[this.schedPtr].startSec < this.songTime) this.schedPtr++; },
  _ctxTime(start){ return this.anchorCtx + (start - this.anchorSong)/this.rate; },

  _tick(){
    if(!this.playing) return;
    this.songTime = this.anchorSong + (Audio.now()-this.anchorCtx)*this.rate;
    const ahead = Audio.now()+0.12;
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
        Audio.strike(n.midi, when, n.durationSec/this.rate, clamp((n.vel||90)/127,0.2,1));
      }
      this.schedPtr++;
    }
    if(this.songTime>=Song.duration+0.5){ this.pause(); this.songTime=Song.duration; }
  }
};

/* a note is "yours to play" if it's in the selected version and not a skip */
function isYours(n){ return !n.backing && !n.skip; }
