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
  if(!N) return { density:0, speed:0, entropy:0, displacement:0, stretch:0, polyphony:1, span:0, irregularity:0 };
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

  return { density, speed, entropy, displacement, stretch, polyphony:maxPoly, span, irregularity };
}

// ordinal difficulty in [0,1] from the descriptors (soft-capped + weighted)
function scoreDifficulty(notes, durationSec){
  const f = difficultyFeatures(notes, durationSec);
  const nd   = clamp(f.density/8, 0, 1);          // ~8 n/s = very busy
  const ns   = clamp(f.speed/10, 0, 1);           // 10 onsets in 1s peak
  const ne   = f.entropy;                          // already 0..1
  const ndi  = clamp(f.displacement/2, 0, 1);     // 2 octaves/step = wild leaps
  const nst  = clamp(f.stretch/1.5, 0, 1);        // 1.5-octave chords
  const npo  = clamp((f.polyphony-1)/4, 0, 1);    // 5+ simultaneous = max
  const nir  = f.irregularity;                      // 0..1
  const score = 0.28*nd + 0.20*ns + 0.10*ne + 0.16*ndi + 0.12*nst + 0.08*npo + 0.06*nir;
  return { score: clamp(score,0,1), ...f };
}

// absolute 1–5 stars from an ordinal difficulty score
function starsFromDifficulty(score){ return clamp(Math.round(1 + 4*clamp(score,0,1)), 1, 5); }
