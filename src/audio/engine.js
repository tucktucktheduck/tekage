// ═══════════════════════════════════════════════════════════
//  AUDIO ENGINE
//  Synthesizer using Web Audio API — instrument presets
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import { DEBUG } from '../core/constants.js';

// ── Instrument Presets ──────────────────────────────────────
export const INSTRUMENTS = {
  grandPiano: {
    label: 'Grand Piano',
    icon: '🎹',
    description: 'Warm concert grand with rich harmonics',
    releaseTime: 0.3,
    build(ctx, freq, dest) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
      o1.type = 'triangle'; o2.type = 'sine'; o3.type = 'sine';
      o1.frequency.value = freq; o2.frequency.value = freq * 2; o3.frequency.value = freq * 3;
      const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
      const t = ctx.currentTime;
      g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.30, t + 0.01); g1.gain.linearRampToValueAtTime(0.21, t + 0.11);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.10, t + 0.01); g2.gain.linearRampToValueAtTime(0.07, t + 0.11);
      g3.gain.setValueAtTime(0, t); g3.gain.linearRampToValueAtTime(0.05, t + 0.01); g3.gain.linearRampToValueAtTime(0.035, t + 0.11);
      o1.connect(g1).connect(dest); o2.connect(g2).connect(dest); o3.connect(g3).connect(dest);
      o1.start(); o2.start(); o3.start();
      return { oscs: [o1, o2, o3], gains: [g1, g2, g3] };
    },
  },

  uprightPiano: {
    label: 'Upright Piano',
    icon: '🎵',
    description: 'Honky-tonk upright with slightly detuned tone',
    releaseTime: 0.2,
    build(ctx, freq, dest) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'sine';
      o1.frequency.value = freq; o2.frequency.value = freq * 1.008; o3.frequency.value = freq * 2;
      const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 2000;
      const t = ctx.currentTime;
      g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.18, t + 0.005); g1.gain.exponentialRampToValueAtTime(0.10, t + 0.12);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.14, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
      g3.gain.setValueAtTime(0, t); g3.gain.linearRampToValueAtTime(0.06, t + 0.01); g3.gain.exponentialRampToValueAtTime(0.03, t + 0.12);
      o1.connect(g1).connect(filter); o2.connect(g2).connect(filter); o3.connect(g3).connect(filter);
      filter.connect(dest);
      o1.start(); o2.start(); o3.start();
      return { oscs: [o1, o2, o3], gains: [g1, g2, g3] };
    },
  },

  electricPiano: {
    label: 'Electric Piano',
    icon: '⚡',
    description: 'Rhodes-style FM bell tones with warm sustain',
    releaseTime: 0.5,
    build(ctx, freq, dest) {
      // FM synthesis
      const carrier = ctx.createOscillator();
      const modulator = ctx.createOscillator();
      const modGain = ctx.createGain();
      const outGain = ctx.createGain();
      carrier.type = 'sine'; modulator.type = 'sine';
      carrier.frequency.value = freq;
      modulator.frequency.value = freq * 3.5;
      const t = ctx.currentTime;
      modGain.gain.setValueAtTime(freq * 5, t); modGain.gain.exponentialRampToValueAtTime(freq * 0.5, t + 0.4);
      outGain.gain.setValueAtTime(0, t); outGain.gain.linearRampToValueAtTime(0.4, t + 0.01); outGain.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
      modulator.connect(modGain).connect(carrier.frequency);
      carrier.connect(outGain).connect(dest);
      carrier.start(); modulator.start();
      return { oscs: [carrier, modulator], gains: [outGain, modGain] };
    },
  },

  synthLead: {
    label: 'Synth Lead',
    icon: '🌊',
    description: 'Analog-style sawtooth with filter sweep',
    releaseTime: 0.15,
    build(ctx, freq, dest) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'sawtooth';
      o1.frequency.value = freq; o2.frequency.value = freq * 1.005;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const g1 = ctx.createGain(), g2 = ctx.createGain();
      const t = ctx.currentTime;
      filter.frequency.setValueAtTime(800, t); filter.frequency.linearRampToValueAtTime(3500, t + 0.08); filter.frequency.linearRampToValueAtTime(1200, t + 0.3);
      g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.25, t + 0.01);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.20, t + 0.01);
      o1.connect(g1).connect(filter); o2.connect(g2).connect(filter);
      filter.connect(dest);
      o1.start(); o2.start();
      return { oscs: [o1, o2], gains: [g1, g2] };
    },
  },

  pipeOrgan: {
    label: 'Pipe Organ',
    icon: '⛪',
    description: 'Hammond drawbars — 5 harmonic registers',
    releaseTime: 0.05,
    build(ctx, freq, dest) {
      const ratios = [1, 2, 3, 4, 8];
      const amps   = [0.25, 0.15, 0.10, 0.08, 0.05];
      const oscs = [], gains = [];
      const t = ctx.currentTime;
      for (let i = 0; i < ratios.length; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq * ratios[i];
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amps[i], t + 0.015);
        o.connect(g).connect(dest); o.start();
        oscs.push(o); gains.push(g);
      }
      return { oscs, gains };
    },
  },

  vibraphone: {
    label: 'Vibraphone',
    icon: '✨',
    description: 'Metallic bell tones with tremolo shimmer',
    releaseTime: 1.5,
    build(ctx, freq, dest) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sine'; o2.type = 'sine';
      o1.frequency.value = freq; o2.frequency.value = freq * 2.756; // Inharmonic partial
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 5.5;
      lfoGain.gain.value = 0.3;
      const g1 = ctx.createGain(), g2 = ctx.createGain();
      const t = ctx.currentTime;
      g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.35, t + 0.005); g1.gain.exponentialRampToValueAtTime(0.18, t + 0.3);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.10, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.02, t + 0.5);
      lfo.connect(lfoGain).connect(g1.gain);
      o1.connect(g1).connect(dest); o2.connect(g2).connect(dest);
      o1.start(); o2.start(); lfo.start();
      return { oscs: [o1, o2, lfo], gains: [g1, g2, lfoGain] };
    },
  },

  softPad: {
    label: 'Soft Pad',
    icon: '☁️',
    description: 'Slow-attack ambient pad, smooth and warm',
    releaseTime: 0.8,
    build(ctx, freq, dest) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
      o1.type = 'sine'; o2.type = 'triangle'; o3.type = 'sine';
      o1.frequency.value = freq; o2.frequency.value = freq * 1.003; o3.frequency.value = freq * 0.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 1500; filter.Q.value = 0.5;
      const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
      const t = ctx.currentTime;
      g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.20, t + 0.3);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.15, t + 0.3);
      g3.gain.setValueAtTime(0, t); g3.gain.linearRampToValueAtTime(0.08, t + 0.3);
      o1.connect(g1).connect(filter); o2.connect(g2).connect(filter); o3.connect(g3).connect(filter);
      filter.connect(dest);
      o1.start(); o2.start(); o3.start();
      return { oscs: [o1, o2, o3], gains: [g1, g2, g3] };
    },
  },

  harpsichord: {
    label: 'Harpsichord',
    icon: '🎼',
    description: 'Plucked baroque strings, fast percussive attack',
    releaseTime: 0.1,
    build(ctx, freq, dest) {
      const ratios = [1, 2, 3, 4, 6, 8];
      const amps   = [0.22, 0.18, 0.12, 0.08, 0.04, 0.02];
      const oscs = [], gains = [];
      const t = ctx.currentTime;
      for (let i = 0; i < ratios.length; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq * ratios[i];
        g.gain.setValueAtTime(amps[i], t);
        g.gain.exponentialRampToValueAtTime(amps[i] * 0.01, t + 0.6);
        o.connect(g).connect(dest); o.start();
        oscs.push(o); gains.push(g);
      }
      return { oscs, gains };
    },
  },
};

// Default instrument
let _currentInstrument = 'grandPiano';

export function setInstrument(key) {
  if (INSTRUMENTS[key]) _currentInstrument = key;
}

export function getCurrentInstrument() {
  return _currentInstrument;
}

// ── Core Audio ──────────────────────────────────────────────

export function initAudio() {
  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

export function noteToFreq(note) {
  const notes = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const m = note.match(/^([A-G]#?)(\d)$/);
  if (!m) return null;
  return 440 * Math.pow(2, (((parseInt(m[2]) - 4) * 12) + notes[m[1]] - 9) / 12);
}

export function midiToNoteName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const oct = Math.floor(midi / 12) - 1;
  return names[midi % 12] + oct;
}

export function playNote(key, note) {
  if (!state.audioContext) return;
  const freq = noteToFreq(note);
  if (!freq) return;

  if (state.activeAudio.has(key)) {
    const { oscs, gains } = state.activeAudio.get(key);
    oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
    gains.forEach(g => { try { g.disconnect(); } catch (e) {} });
    state.activeAudio.delete(key);
  }

  const ctx = state.audioContext;
  const dest = (typeof key === 'string' && key.startsWith('mx:') && state.mxMasterGain)
    ? state.mxMasterGain : ctx.destination;

  const preset = INSTRUMENTS[_currentInstrument] || INSTRUMENTS.grandPiano;
  const result = preset.build(ctx, freq, dest);

  state.activeAudio.set(key, result);
}

export function stopNote(key, immediate = false) {
  if (!state.activeAudio.has(key)) return;
  const data = state.activeAudio.get(key);
  const { oscs, gains } = data;
  const t = state.audioContext.currentTime;
  const preset = INSTRUMENTS[_currentInstrument] || INSTRUMENTS.grandPiano;
  const r = immediate ? 0.01 : (preset.releaseTime || 0.1);
  gains.forEach(g => {
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + r);
    } catch (e) {}
  });
  setTimeout(() => {
    oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
    gains.forEach(g => { try { g.disconnect(); } catch (e) {} });
    if (state.activeAudio.get(key) === data) state.activeAudio.delete(key);
  }, r * 1000 + 20);
}
