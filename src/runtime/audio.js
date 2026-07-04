/* ════════════════════════════════════════════════════════════
   3 · AUDIO ENGINE + VoiceManager
   Every sounding note is a Voice with a UNIQUE id (never keyed by
   MIDI, so a re-press can't orphan the previous one). A per-frame
   watchdog force-releases any voice past its end or older than a
   hard ceiling; allNotesOff() is the panic button. Together these
   kill stuck/ghost notes regardless of missed key-ups, tab blur,
   or seek/pause races.
   ════════════════════════════════════════════════════════════ */
const Audio = (()=>{
  let ctx=null, master=null, verb=null;
  const voices=new Map();         // voiceId -> Voice
  const keyVoice=new Map();       // input key (or midi) -> voiceId  (held notes)
  let nextId=1;
  const MAX_VOICE_SEC=12;         // absolute ceiling — nothing rings longer

  function ensure(){
    if(ctx) return;
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value=0.75;
    const comp = ctx.createDynamicsCompressor();
    verb = ctx.createConvolver(); verb.buffer = makeImpulse(1.4, 2.2);
    const verbGain = ctx.createGain(); verbGain.gain.value=0.18;
    master.connect(comp); comp.connect(ctx.destination);
    master.connect(verb); verb.connect(verbGain); verbGain.connect(ctx.destination);
  }
  function makeImpulse(seconds, decay){
    const rate=ctx.sampleRate, len=rate*seconds, buf=ctx.createBuffer(2,len,rate);
    for(let c=0;c<2;c++){ const d=buf.getChannelData(c);
      for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay); }
    return buf;
  }
  function resume(){ ensure(); if(ctx.state==='suspended') ctx.resume(); }
  function now(){ ensure(); return ctx.currentTime; }
  function setVolume(v){ ensure(); master.gain.value=v; }

  // build the oscillator stack for one voice
  function build(midi, vel){
    const f=midiToFreq(midi), t=ctx.currentTime;
    const o1=ctx.createOscillator(),o2=ctx.createOscillator(),o3=ctx.createOscillator();
    o1.type='triangle';o2.type='sine';o3.type='sine';
    o1.frequency.value=f;o2.frequency.value=f*2;o3.frequency.value=f*3;
    const g=ctx.createGain(); const a=clamp(vel,0.05,1)*0.32;
    // fade-in (~12ms) so the onset doesn't click, then settle to sustain
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(a,t+0.012);
    g.gain.linearRampToValueAtTime(a*0.75,t+0.12);
    const g2=ctx.createGain();g2.gain.value=0.30;const g3=ctx.createGain();g3.gain.value=0.13;
    o1.connect(g);o2.connect(g2).connect(g);o3.connect(g3).connect(g);g.connect(master);
    o1.start(t);o2.start(t);o3.start(t);
    return {o1,o2,o3,g};
  }
  function hardStop(v, when){ try{ const s=when??ctx.currentTime; v.o1.stop(s);v.o2.stop(s);v.o3.stop(s);
    v.o1.disconnect();v.o2.disconnect();v.o3.disconnect();v.g.disconnect(); }catch(e){} }

  function release(voiceId, immediate){
    const v=voices.get(voiceId); if(!v) return; voices.delete(voiceId);
    if(v.key!=null && keyVoice.get(v.key)===voiceId) keyVoice.delete(v.key);
    const t=ctx.currentTime, rel=immediate?0.03:0.16;
    try{ v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value,t);
         v.g.gain.linearRampToValueAtTime(0.0001,t+rel); }catch(e){}
    hardStop(v, t+rel+0.05);
  }

  // scheduled playback note (known start + duration): self-terminating + watchdog-guarded
  function strike(midi, when, dur, vel=0.8){
    ensure();
    const t=Math.max(when, ctx.currentTime);
    const f=midiToFreq(midi);
    const o1=ctx.createOscillator(),o2=ctx.createOscillator(),o3=ctx.createOscillator();
    o1.type='triangle';o2.type='sine';o3.type='sine';
    o1.frequency.value=f;o2.frequency.value=f*2;o3.frequency.value=f*3;
    const g=ctx.createGain(); const a=clamp(vel,0.05,1)*0.32;
    // click-free envelope: ~12ms fade-in, then a sustain hold that ALWAYS ends
    // before the release starts (short notes used to overlap the two ramps -> a
    // pop on note-out), then an exponential fade-out.
    const atk=0.012, rel=Math.max(dur,0.10), hold=Math.min(0.10, Math.max(dur,0.03));
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(a,t+atk);
    g.gain.linearRampToValueAtTime(a*0.7,t+hold);
    g.gain.setTargetAtTime(0.0001, t+rel, 0.14);
    const g2=ctx.createGain();g2.gain.value=0.30;const g3=ctx.createGain();g3.gain.value=0.13;
    o1.connect(g);o2.connect(g2).connect(g);o3.connect(g3).connect(g);g.connect(master);
    o1.start(t);o2.start(t);o3.start(t);
    const id=nextId++; const v={o1,o2,o3,g,key:null,held:false,endByCtx:t+rel+1.2,bornCtx:ctx.currentTime};
    voices.set(id,v);
    // Schedule an absolute safety stop, but DON'T disconnect now: hardStop()
    // disconnects synchronously, which would rip the just-started oscillators out
    // of the graph before any sound reaches master (silent playback). The per-frame
    // watchdog + release() free the nodes after the note has finished.
    try{ const s=t+rel+1.2; o1.stop(s); o2.stop(s); o3.stop(s); }catch(e){}
    return id;
  }

  // live held note (user playing). `key` = the input key id so re-press releases the prior voice.
  function noteOn(midi, vel=0.85, key=null){
    ensure(); resume();
    if(key!=null && keyVoice.has(key)) release(keyVoice.get(key), true);   // retrigger: kill prior
    const built=build(midi, vel);
    const id=nextId++; const v={...built, key, held:true, endByCtx:Infinity, bornCtx:ctx.currentTime};
    voices.set(id,v); if(key!=null) keyVoice.set(key,id);
    return id;
  }
  function noteOff(key){
    if(key!=null && keyVoice.has(key)){ release(keyVoice.get(key), false); return; }
  }
  function allNotesOff(immediate=true){
    for(const id of [...voices.keys()]) release(id, immediate);
    keyVoice.clear();
  }
  // per-frame watchdog: nothing held rings past its end; nothing rings past the ceiling
  function tick(){
    if(!ctx) return; const tc=ctx.currentTime;
    for(const [id,v] of voices){
      if((!v.held && tc>v.endByCtx+0.1) || (tc - v.bornCtx > MAX_VOICE_SEC)) release(id, true);
    }
  }
  function liveCount(){ return voices.size; }
  return {resume,now,setVolume,strike,noteOn,noteOff,allNotesOff,tick,liveCount};
})();
