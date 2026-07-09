/* ════════════════════════════════════════════════════════════
   3 · AUDIO ENGINE + VoiceManager
   Every sounding note is a Voice with a UNIQUE id (never keyed by
   MIDI, so a re-press can't orphan the previous one). A per-frame
   watchdog force-releases any voice past its end or older than a
   hard ceiling; allNotesOff() is the panic button. Together these
   kill stuck/ghost notes regardless of missed key-ups, tab blur,
   or seek/pause races.

   A voice's SOUND is either the built-in 3-oscillator synth OR, when
   the player loads a SoundFont (.sf2), the matching sampled instrument
   (parseSoundFont below). Voice bookkeeping is source-agnostic: a voice
   just holds `srcs` (the nodes to stop) + `g` (its gain), so the sampler
   and the synth share every teardown/watchdog path.
   ════════════════════════════════════════════════════════════ */

// ── minimal SoundFont (SF2) reader ───────────────────────────────────
// Parses just enough of the SF2 "hydra" to sample-play a piano: the smpl
// PCM pool + one instrument's key-range -> sample zones. Returns
// { name, zones:[{lo,hi,root,tuneCents,loop,rate,pcm,loopStart,loopEnd,sampleId}] }
// or null on ANY problem (the caller keeps the synth — never throws).
function _sfStr(u8,o,n){ let s=''; for(let i=0;i<n;i++){ const c=u8[o+i]; if(!c) break; s+=String.fromCharCode(c); } return s; }
function parseSoundFont(buffer){
  try{
    const dv=new DataView(buffer), u8=new Uint8Array(buffer);
    const tag=o=>String.fromCharCode(u8[o],u8[o+1],u8[o+2],u8[o+3]);
    if(buffer.byteLength<12 || tag(0)!=='RIFF' || tag(8)!=='sfbk') return null;
    // walk top-level chunks; collect smpl (sdta) + the pdta sub-chunks
    let smplOff=0, smplLen=0; const pdta={};
    let p=12;
    while(p+8<=buffer.byteLength){
      const id=tag(p), sz=dv.getUint32(p+4,true), body=p+8;
      if(id==='LIST'){
        const listType=tag(body); let q=body+4;
        while(q+8<=body+sz){
          const cid=tag(q), csz=dv.getUint32(q+4,true), cbody=q+8;
          if(listType==='sdta' && cid==='smpl'){ smplOff=cbody; smplLen=csz; }
          else if(listType==='pdta'){ pdta[cid]={off:cbody,len:csz}; }
          q=cbody+csz+(csz&1);
        }
      }
      p=body+sz+(sz&1);
    }
    if(!smplOff || !pdta.shdr || !pdta.inst || !pdta.ibag || !pdta.igen) return null;

    // 16-bit LE PCM -> Float32 pool
    const nSamp=smplLen>>1, pool=new Float32Array(nSamp);
    for(let i=0;i<nSamp;i++) pool[i]=dv.getInt16(smplOff+i*2,true)/32768;

    const recs=(c,size,fn)=>{ const out=[]; if(!c) return out; const n=Math.floor(c.len/size);
      for(let i=0;i<n;i++) out.push(fn(c.off+i*size)); return out; };
    const shdr=recs(pdta.shdr,46,b=>({ name:_sfStr(u8,b,20),
      start:dv.getUint32(b+20,true), end:dv.getUint32(b+24,true),
      startLoop:dv.getUint32(b+28,true), endLoop:dv.getUint32(b+32,true),
      rate:dv.getUint32(b+36,true), pitch:u8[b+40], corr:dv.getInt8(b+41),
      type:dv.getUint16(b+44,true) }));
    const inst=recs(pdta.inst,22,b=>({ name:_sfStr(u8,b,20), bag:dv.getUint16(b+20,true) }));
    const ibag=recs(pdta.ibag,4,b=>({ gen:dv.getUint16(b,true) }));
    const igen=recs(pdta.igen,4,b=>({ op:dv.getUint16(b,true), amt:dv.getUint16(b+2,true),
      samt:dv.getInt16(b+2,true), lo:u8[b+2], hi:u8[b+3] }));

    // choose an instrument: follow preset 0 -> its instrument gen (op 41) if the
    // preset chunks exist, else instrument 0.
    let instIndex=0;
    if(pdta.phdr && pdta.pbag && pdta.pgen){
      const phdr=recs(pdta.phdr,38,b=>({ name:_sfStr(u8,b,20), bag:dv.getUint16(b+24,true) }));
      const pbag=recs(pdta.pbag,4,b=>({ gen:dv.getUint16(b,true) }));
      const pgen=recs(pdta.pgen,4,b=>({ op:dv.getUint16(b,true), amt:dv.getUint16(b+2,true) }));
      if(phdr.length>=2){
        for(let bi=phdr[0].bag; bi<phdr[1].bag && bi<pbag.length; bi++){
          const gs=pbag[bi].gen, ge=(pbag[bi+1]?pbag[bi+1].gen:pgen.length);
          for(let gi=gs; gi<ge; gi++) if(pgen[gi] && pgen[gi].op===41) instIndex=pgen[gi].amt;
        }
      }
    }
    instIndex=clamp(instIndex,0,Math.max(0,inst.length-2));
    if(instIndex>=inst.length-1) return null;

    // instrument zones: each bag's generators -> a key-range mapped to a sample.
    // A leading bag with no sampleID is a global zone (running defaults).
    const zones=[];
    let gLo=0,gHi=127,gRoot=-1,gCoarse=0,gFine=0,gMode=0;
    const bg0=inst[instIndex].bag, bg1=inst[instIndex+1]?inst[instIndex+1].bag:ibag.length;
    for(let bi=bg0; bi<bg1 && bi<ibag.length; bi++){
      const gs=ibag[bi].gen, ge=(ibag[bi+1]?ibag[bi+1].gen:igen.length);
      let lo=gLo,hi=gHi,root=gRoot,coarse=gCoarse,fine=gFine,mode=gMode,sampleId=-1;
      for(let gi=gs; gi<ge; gi++){ const g=igen[gi]; if(!g) continue;
        switch(g.op){
          case 43: lo=g.lo; hi=g.hi; break;   // keyRange
          case 58: root=g.amt; break;         // overridingRootKey
          case 51: coarse=g.samt; break;      // coarseTune (semitones)
          case 52: fine=g.samt; break;        // fineTune (cents)
          case 54: mode=g.amt; break;         // sampleModes (1|3 = loop)
          case 53: sampleId=g.amt; break;     // sampleID (terminal generator)
        }
      }
      if(sampleId<0){ gLo=lo; gHi=hi; if(root>=0)gRoot=root; gCoarse=coarse; gFine=fine; gMode=mode; continue; }
      const sh=shdr[sampleId]; if(!sh || sh.end<=sh.start) continue;
      zones.push({ lo, hi, root:(root>=0?root:sh.pitch), tuneCents:coarse*100+fine+sh.corr,
        loop:(mode===1||mode===3), rate:sh.rate||44100, pcm:pool.subarray(sh.start, sh.end),
        loopStart:(sh.startLoop-sh.start)/(sh.rate||44100), loopEnd:(sh.endLoop-sh.start)/(sh.rate||44100),
        sampleId });
    }
    if(!zones.length) return null;
    return { name:(inst[instIndex].name||'SoundFont'), zones };
  }catch(e){ return null; }
}

const Audio = (()=>{
  let ctx=null, master=null, verb=null;
  const voices=new Map();         // voiceId -> Voice
  const keyVoice=new Map();       // input key (or midi) -> voiceId  (held notes)
  let nextId=1;
  const MAX_VOICE_SEC=12;         // absolute ceiling — nothing rings longer
  let instrument=null;            // loaded SoundFont { name, zones:[...,.buffer] } or null (synth)

  // ── Core piano VOICES (built-in synth flavours) ────────────────────
  // The default sound is an additive, inharmonic, per-partial-decaying piano
  // model (see voiceSources). A "voice" is just the timbre knobs:
  //   N=partial count, tilt=spectral roll-off exponent, inharm=string stretch,
  //   decay=base ring time, decaySpread=how much faster high partials fade,
  //   attack=onset (s), body=overall loudness-decay time constant,
  //   sustainFloor=how far a partial fades toward while ringing,
  //   hammer=felt-thunk level, hammerCut=hammer low-pass (Hz).
  const VOICES={
    grand:  {name:'Grand',  N:8, tilt:1.15, inharm:0.0007, decay:2.8, decaySpread:0.55, attack:0.006, body:2.4, sustainFloor:0.06, hammer:0.16, hammerCut:3800},
    bright: {name:'Bright', N:9, tilt:0.95, inharm:0.0009, decay:2.4, decaySpread:0.42, attack:0.005, body:2.0, sustainFloor:0.05, hammer:0.24, hammerCut:5400},
    mellow: {name:'Mellow', N:6, tilt:1.45, inharm:0.0005, decay:3.4, decaySpread:0.70, attack:0.009, body:2.8, sustainFloor:0.07, hammer:0.09, hammerCut:2400},
  };
  let voiceKey='grand', VOICE=VOICES.grand;
  function setVoice(key){ if(VOICES[key]){ voiceKey=key; VOICE=VOICES[key]; return VOICES[key].name; } return null; }
  function voiceName(){ return VOICE.name; }
  function currentVoice(){ return voiceKey; }

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

  // ── SoundFont API ──────────────────────────────────────────────
  // Load an uploaded .sf2 as the instrument. Returns its name, or null (kept
  // synth). AudioBuffers are built once here (ctx exists); reused per sample.
  function loadSoundfont(buffer){
    ensure();
    const sf=parseSoundFont(buffer); if(!sf) return null;
    const cache={};
    for(const z of sf.zones){
      let buf=cache[z.sampleId];
      if(!buf){ const n=Math.max(1,z.pcm.length); buf=ctx.createBuffer(1,n,z.rate||44100); buf.getChannelData(0).set(z.pcm); cache[z.sampleId]=buf; }
      z.buffer=buf;
    }
    instrument=sf; return sf.name;
  }
  function useSynth(){ instrument=null; }
  function instrumentName(){ return instrument ? instrument.name : null; }
  function zoneFor(midi){ if(!instrument) return null; for(const z of instrument.zones){ if(midi>=z.lo && midi<=z.hi && z.buffer) return z; } return null; }

  // Create (but DON'T start) the source nodes for one voice, connected to `g`.
  // Sampler when a SoundFont covers this note; otherwise the built-in piano model:
  // an inharmonic partial stack where every partial has its OWN decay (brightness
  // fades as the note rings — the essence of a real piano) plus a short low-passed
  // noise burst for the felt-hammer thunk. `t`=start, `vel`=0..1. Every source node
  // is returned in `srcs`, so teardown/watchdog stay source-agnostic.
  function voiceSources(midi, g, t, vel){
    const z=zoneFor(midi);
    if(z){
      const src=ctx.createBufferSource(); src.buffer=z.buffer;
      src.playbackRate.value=Math.pow(2,(midi - z.root)/12 + z.tuneCents/1200);
      if(z.loop && z.loopEnd>z.loopStart){ src.loop=true; src.loopStart=z.loopStart; src.loopEnd=z.loopEnd; }
      src.connect(g); return [src];
    }
    const V=VOICE, f=midiToFreq(midi), v=clamp(vel,0.05,1), srcs=[];
    const lowFactor=clamp(Math.pow(2,(60-midi)/24),0.4,2.6);   // bass rings longer
    const bright=0.55+0.45*v;                                  // harder hits are brighter
    const amps=[]; let sum=0;
    for(let n=1;n<=V.N;n++){ let a=1/Math.pow(n,V.tilt); if(n>=3) a*=Math.pow(bright,n-2); amps.push(a); sum+=a; }
    for(let n=1;n<=V.N;n++){
      const partial=amps[n-1]/sum;
      const o=ctx.createOscillator(); o.type='sine';
      o.frequency.value=f*n*Math.sqrt(1+V.inharm*n*n);         // inharmonic (stretched) partial
      const pg=ctx.createGain(), tau=Math.max(0.05, V.decay*lowFactor/(1+V.decaySpread*(n-1)));
      pg.gain.setValueAtTime(0,t);
      pg.gain.linearRampToValueAtTime(partial, t+V.attack);
      pg.gain.setTargetAtTime(partial*V.sustainFloor, t+V.attack, tau);   // per-partial decay
      o.connect(pg).connect(g); srcs.push(o);
    }
    if(V.hammer>0){                                            // felt-hammer transient
      const len=Math.max(1,Math.ceil(ctx.sampleRate*0.03));
      const nb=ctx.createBuffer(1,len,ctx.sampleRate), d=nb.getChannelData(0);
      for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
      const ns=ctx.createBufferSource(); ns.buffer=nb;
      const lp=ctx.createBiquadFilter(); lp.type='lowpass';
      lp.frequency.value=clamp(V.hammerCut*(0.5+0.7*v),300,12000);
      const ng=ctx.createGain();
      ng.gain.setValueAtTime(0,t);
      ng.gain.linearRampToValueAtTime(V.hammer*v, t+0.002);
      ng.gain.setTargetAtTime(0.0001, t+0.004, 0.012);
      ns.connect(lp).connect(ng).connect(g); srcs.push(ns);
    }
    return srcs;
  }

  // build the voice for a LIVE held note
  function build(midi, vel){
    const t=ctx.currentTime;
    const g=ctx.createGain(); const a=clamp(vel,0.05,1)*0.30;
    // click-free onset (ramp from ~0), then a slow body decay as a real piano fades
    // even while the key is held; the per-partial decays add the brightness falloff.
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(a,t+VOICE.attack);
    g.gain.setTargetAtTime(a*0.32, t+VOICE.attack, VOICE.body);
    const srcs=voiceSources(midi, g, t, vel); g.connect(master);
    for(const s of srcs) s.start(t);
    return {srcs,g};
  }
  function hardStop(v, when){ try{ const s=when??ctx.currentTime;
    if(v.srcs) for(const n of v.srcs){ try{n.stop(s);}catch(e){} try{n.disconnect();}catch(e){} }
    v.g.disconnect(); }catch(e){} }

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
    const g=ctx.createGain(); const a=clamp(vel,0.05,1)*0.30;
    // click-free onset (ramp from ~0) + slow body decay; all decays use
    // setTargetAtTime (smooth exponentials) so nothing pops. The release begins
    // after the note's own length and lets the tail ring out naturally.
    const rel=Math.max(dur,0.10);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(a,t+VOICE.attack);
    g.gain.setTargetAtTime(a*0.32, t+VOICE.attack, VOICE.body);
    g.gain.setTargetAtTime(0.00008, t+rel, 0.12);
    const srcs=voiceSources(midi, g, t, vel); g.connect(master);
    for(const s of srcs){ try{ s.start(t); }catch(e){} }
    const id=nextId++; const v={srcs,g,key:null,held:false,endByCtx:t+rel+1.6,bornCtx:ctx.currentTime};
    voices.set(id,v);
    // Schedule an absolute safety stop, but DON'T disconnect now: hardStop()
    // disconnects synchronously, which would rip the just-started nodes out of the
    // graph before any sound reaches master (silent playback). The per-frame
    // watchdog + release() free the nodes after the note has finished.
    try{ const s=t+rel+1.6; for(const n of srcs) n.stop(s); }catch(e){}
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
  return {resume,now,setVolume,strike,noteOn,noteOff,allNotesOff,tick,liveCount,
          loadSoundfont,useSynth,instrumentName,setVoice,voiceName,currentVoice,VOICES};
})();
