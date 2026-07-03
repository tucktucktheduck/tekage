
"use strict";
/* ════════════════════════════════════════════════════════════
   0 · SMALL HELPERS
   ════════════════════════════════════════════════════════════ */
const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK = new Set([1,3,6,8,10]);
const noteName = m => NAMES[((m%12)+12)%12];
const octaveOf = m => Math.floor(m/12) - 1;
const isBlack = m => BLACK.has(((m%12)+12)%12);
const midiToFreq = m => 440 * Math.pow(2,(m-69)/12);
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp = (a,b,t)=>a+(b-a)*t;

/* ── Scoring (pure) — T20 ──────────────────────────────────────
   The note is the star: judge() grades the ONSET of a yours-to-play
   note, releaseVerdict() grades how the key release lines up with the
   note's end, and summarizeScore() folds per-note records into the
   end-of-song report (notes hit / notes that fell = pure accuracy).
   All pure: the runtime decides whether to punish or forgive. */
const JUDGE_WINDOWS = { perfect:0.04, good:0.09, okay:0.15 };   // |seconds| around onset
const RELEASE_TOL = 0.15;                                        // seconds around note end

// offsetSec = pressTime - noteStart  (negative = early, positive = late)
function judge(offsetSec){
  const d = Math.abs(offsetSec);
  if(d <= JUDGE_WINDOWS.perfect) return 'perfect';
  if(d <= JUDGE_WINDOWS.good)    return 'good';
  if(d <= JUDGE_WINDOWS.okay)    return 'okay';
  return 'miss';
}
// offsetSec = releaseTime - noteEnd  (negative = let go early, positive = held too long)
function releaseVerdict(offsetSec){
  if(offsetSec < -RELEASE_TOL) return 'early';
  if(offsetSec >  RELEASE_TOL) return 'late';
  return 'clean';
}
/* ── Auto-Slow easing (pure) — T21 ────────────────────────────
   Move a value toward a target by at most maxDelta this step. Drives the
   smooth playback-rate ramp (slow on a miss, recover on hits) without ever
   overshooting. maxDelta is computed by the caller from the audio-clock dt,
   so the ramp is clock-driven, never wall-time. */
// Auto-Slow (T21, wait mode): the clock BRAKES over the last `pre` song-seconds
// before an unpressed yours-note and parks AT the hit line until it's pressed.
// eps = "parked" threshold (sub-pixel), creep = minimum brake rate so the
// approach reaches the line in finite time instead of asymptoting short of it.
const AUTOSLOW = { pre:0.12, eps:0.004, creep:0.02 };
function easeToward(cur, target, maxDelta){
  if(maxDelta<=0) return cur;
  if(cur < target) return Math.min(target, cur+maxDelta);
  if(cur > target) return Math.max(target, cur-maxDelta);
  return cur;
}

// records: [{ tier:'perfect'|'good'|'okay'|'miss', late:bool, release:'early'|'clean'|'late'|null }]
function summarizeScore(records){
  const r = { fell:records.length, hit:0, accuracy:0,
              perfect:0, good:0, okay:0, miss:0,
              tooLate:0, releasedEarly:0, heldTooLong:0 };
  for(const rec of records){
    const tier = rec.tier || 'miss';
    if(tier!=='miss') r.hit++;
    if(r[tier]!==undefined) r[tier]++;
    if(tier!=='miss' && rec.late) r.tooLate++;
    if(rec.release==='early') r.releasedEarly++;
    if(rec.release==='late')  r.heldTooLong++;
  }
  r.accuracy = r.fell ? r.hit/r.fell : 0;
  return r;
}
