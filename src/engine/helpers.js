
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
