/* ════════════════════════════════════════════════════════════
   1.6 · DIFFICULTY DESCRIPTORS  (pure; no DOM/audio)
   Instrument-agnostic score-difficulty features, after Sébastien
   et al. 2012 ("Score Analyzer", ~7 PCA descriptors) and Chiu &
   Chen 2012 (up to 17 features). We compute the descriptors that
   matter on a uniform QWERTY layout — where black/white-key
   geometry vanishes and HAND DISPLACEMENT + STRETCH dominate
   (Nakamura et al. on transposition/fingering): note density,
   playing speed (peak local onset rate), pitch entropy, hand-
   displacement rate, simultaneity/stretch, and rhythmic
   irregularity. Combined into an ORDINAL difficulty in [0,1]
   (Ramoneda et al. 2024 treat difficulty as ordinal, not flat
   classes) and mapped to 1–5 stars. Used for tiering, the library
   stars, and the ingest confidence/auto-rating.
   ════════════════════════════════════════════════════════════ */

/* ── QWERTY typing-strain model ──────────────────────────────
   The founder's rule: "as a typer I'm going to feel like a typer, so that's
   what the difficulty score should be rated against." Peak speed is a weak
   proxy; what actually hurts is the FINGER SHAPE — u+i then y+; is brutal,
   j+m is fine. Because the standard TKG layout maps each pitch class to a
   fixed key (mirrored on both hands), typing strain is computable straight
   from pitch classes, before any hand assignment.
   Per pitch class: [finger 1=index…4=pinky, row 0=top/1=home/2=bottom, col]
   (right-hand geometry; the left hand mirrors it, same strain). */
const _KEYGEO = {
  0:[1,1,0],  /* C  j  */ 2:[2,1,1],  /* D  k */ 4:[3,1,2], /* E l  */ 5:[4,1,3], /* F ; */
  7:[1,2,0],  /* G  n  */ 9:[1,2,1],  /* A  m */ 11:[2,2,2],/* B ,  */
  1:[1,0,0],  /* C# y  */ 3:[1,0,1],  /* D# u */ 6:[2,0,2], /* F# i */ 8:[3,0,3], /* G# o */ 10:[4,0,4] /* A# p */
};
function _geo(midi){ return _KEYGEO[((midi%12)+12)%12]; }
// strain of pressing one chord (same-window notes) as a single hand shape
function _chordStrain(ev){
  if(ev.length<2) return 0;
  const g=ev.map(n=>_geo(n.midi));
  let s=0;
  for(let i=0;i<g.length;i++) for(let j=i+1;j<g.length;j++){
    const [fa,ra,ca]=g[i], [fb,rb,cb]=g[j];
    if(fa===fb) s+=0.6;                                   // same finger, two keys
    const rowSpan=Math.abs(ra-rb), fingerSpread=Math.abs(fa-fb);
    if(rowSpan>=2) s+=0.5;                                // top+bottom row claw
    else if(rowSpan===1) s+=0.15;                         // verticality (u over j)
    if(Math.abs(ca-cb)<=0.5 && rowSpan>=1) s+=0.25;       // stacked same column
    s += 0.10*fingerSpread*rowSpan;                       // wide + uneven (y + ;)
  }
  return s;
}
// strain of moving between two consecutive chords in the same short window
function _bigramStrain(prev, cur, gapSec){
  if(gapSec>0.6) return 0;
  const speed = 1 - gapSec/0.6;                            // faster = harsher
  let s=0;
  for(const a of prev) for(const b of cur){
    const [fa,ra]=_geo(a.midi), [fb,rb]=_geo(b.midi);
    if(fa===fb && ((a.midi-b.midi)%12+12)%12!==0) s+=0.5;  // same-finger bigram
    if(fa===fb && Math.abs(ra-rb)>=2) s+=0.3;              // same finger, row leap
  }
  return s*speed/Math.max(1,prev.length*cur.length);
}
// mean per-event typing strain over a note set, normalized to ~[0,1]
function typingStrain(events){
  if(!events.length) return 0;
  let total=0;
  for(let i=0;i<events.length;i++){
    total += _chordStrain(events[i]);
    if(i>0) total += _bigramStrain(events[i-1], events[i],
      events[i][0].startSec - events[i-1][0].startSec);
  }
  return clamp((total/events.length)/1.6, 0, 1);           // ~1.6 strain/event = max
}

// group note onsets into chord "events" (notes within 30ms = simultaneous)
function _onsetEvents(sorted){
  const events=[]; if(!sorted.length) return events;
  let cur=[sorted[0]];
  for(let i=1;i<sorted.length;i++){
    if(sorted[i].startSec - cur[0].startSec < 0.03) cur.push(sorted[i]);
    else { events.push(cur); cur=[sorted[i]]; }
  }
  events.push(cur);
  return events;
}

// raw difficulty features for a note set over durationSec
function difficultyFeatures(notes, durationSec){
  const N = notes.length;
  const dur = Math.max(0.5, durationSec || 0);
  if(!N) return { density:0, speed:0, entropy:0, displacement:0, stretch:0, polyphony:1, span:0, irregularity:0, typing:0 };
  const sorted=[...notes].sort((a,b)=>a.startSec-b.startSec || a.midi-b.midi);

  // density — notes per second
  const density = N/dur;

  // playing speed — peak onsets within any 1.0s window (fast-passage detector)
  const onsets = sorted.map(n=>n.startSec);
  let peak=0, j=0;
  for(let i=0;i<onsets.length;i++){ while(onsets[i]-onsets[j] > 1.0) j++; peak=Math.max(peak, i-j+1); }
  const speed = peak;

  // pitch entropy — Shannon entropy of the pitch-class histogram, normalized
  const pc=new Array(12).fill(0);
  for(const n of notes) pc[((n.midi%12)+12)%12]++;
  let H=0; for(const c of pc){ if(c){ const p=c/N; H -= p*Math.log2(p); } }
  const entropy = H/Math.log2(12);                         // 0..1

  // events: simultaneity (stretch/polyphony) + the top line for displacement
  const events=_onsetEvents(sorted);
  let maxPoly=1, sumSpread=0;
  const tops=[];
  for(const ev of events){
    maxPoly=Math.max(maxPoly, ev.length);
    const ms=ev.map(n=>n.midi);
    sumSpread += (Math.max(...ms)-Math.min(...ms));
    tops.push(Math.max(...ms));
  }
  const stretch = sumSpread/Math.max(1,events.length)/12;  // mean chord span in octaves

  // hand displacement — mean |octave change| of the top line between events
  let disp=0;
  for(let i=1;i<tops.length;i++) disp += Math.abs(tops[i]-tops[i-1])/12;
  const displacement = disp/Math.max(1,tops.length-1);

  // pitch span in octaves
  const midis=notes.map(n=>n.midi);
  const span=(Math.max(...midis)-Math.min(...midis))/12;

  // rhythmic irregularity — coefficient of variation of inter-onset intervals
  let irregularity=0;
  if(events.length>2){
    const io=[]; for(let i=1;i<events.length;i++) io.push(events[i][0].startSec-events[i-1][0].startSec);
    const m=io.reduce((a,b)=>a+b,0)/io.length;
    const sd=Math.sqrt(io.reduce((a,b)=>a+(b-m)**2,0)/io.length);
    irregularity = m>0 ? Math.min(1.5, sd/m)/1.5 : 0;
  }

  // typing strain — the "feels like a typer" descriptor (finger shapes)
  const typing = typingStrain(events);

  return { density, speed, entropy, displacement, stretch, polyphony:maxPoly, span, irregularity, typing };
}

// ordinal difficulty in [0,1] from the descriptors (soft-capped + weighted).
// Weights follow the founder's feel calibration: typing strain (finger shapes)
// matters a lot; raw peak speed matters much less than it used to.
function scoreDifficulty(notes, durationSec){
  const f = difficultyFeatures(notes, durationSec);
  const nd   = clamp(f.density/8, 0, 1);          // ~8 n/s = very busy
  const ns   = clamp(f.speed/10, 0, 1);           // 10 onsets in 1s peak
  const ne   = f.entropy;                          // already 0..1
  const ndi  = clamp(f.displacement/2, 0, 1);     // 2 octaves/step = wild leaps
  const nst  = clamp(f.stretch/1.5, 0, 1);        // 1.5-octave chords
  const npo  = clamp((f.polyphony-1)/4, 0, 1);    // 5+ simultaneous = max
  const nir  = f.irregularity;                      // 0..1
  const nty  = f.typing;                            // 0..1 finger-shape strain
  const score = 0.26*nd + 0.10*ns + 0.08*ne + 0.14*ndi + 0.10*nst + 0.08*npo + 0.06*nir + 0.18*nty;
  return { score: clamp(score,0,1), ...f };
}

// absolute 1–5 stars from an ordinal difficulty score
function starsFromDifficulty(score){ return clamp(Math.round(1 + 4*clamp(score,0,1)), 1, 5); }
