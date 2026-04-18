// ═══════════════════════════════════════════════════════════
//  SFZ VOICE ARCHITECTURE
//
//  A Voice is a modular signal graph: an ordered array of
//  "stages" (Web Audio nodes, connected source → ... → dest)
//  plus a collection of "modulators" (envelope/LFO objects
//  that automate AudioParams on those nodes).
//
//  Adding a v2 feature = inserting a stage and/or a modulator.
//  No existing code needs changing:
//    Filter stage: push between 'amp_envelope' and output
//    EQ stages:    push after filter
//    PitchEG:      new modulator targeting source.playbackRate
//    FilterEG:     new modulator targeting filter.frequency
//    AmpLFO:       new modulator targeting ampGain.gain (additive)
// ═══════════════════════════════════════════════════════════

import { noteNameToMidi } from '../audio/salamander.js';

// ── Velocity → linear gain ─────────────────────────────────
// amp_veltrack 100 = full velocity sensitivity (MIDI vel 127 → 1.0, vel 1 → ~0.008)
// amp_veltrack 0   = velocity has no effect (always 1.0)
function _velToGain(velocity, ampVeltrack) {
  const vel = Math.max(1, Math.min(127, velocity));
  const sensitivity = Math.max(0, Math.min(100, ampVeltrack)) / 100;
  // SFZ spec: linear velocity curve unless overridden by amp_velcurve_N
  // TODO v2: support amp_velcurve_N table interpolation
  const linear = vel / 127;
  return 1 - sensitivity + sensitivity * linear;
}

// ── AmpEnvelopeModulator ───────────────────────────────────
//
// General-purpose modulation source that targets an AudioParam.
// In v1 it only targets amp gain, but the interface (schedule /
// release) is designed to be reused by PitchEG, FilterEG, etc.
//
// v2: To add PitchEG, create:
//   new EnvelopeModulator(source.playbackRate, region._parsed, pitchDepthSemitones, isPitch=true)
// v2: To add FilterEG, create:
//   new EnvelopeModulator(filter.frequency, region._parsed, filterEgDepth, isFilter=true)

class AmpEnvelopeModulator {
  /**
   * @param {AudioParam} param      - The GainNode.gain AudioParam to automate
   * @param {object}     parsed     - region._parsed
   * @param {number}     peakGain   - Peak gain value (linear, accounting for volume + velocity)
   */
  constructor(param, parsed, peakGain) {
    this._param    = param;
    this._parsed   = parsed;   // kept for noteOff access to ampeg_release
    this._peak     = peakGain;
  }

  schedule(ctx, t) {
    const p = this._parsed;
    const delay   = Math.max(0, p.ampeg_delay);
    const attack  = Math.max(0.0005, p.ampeg_attack);
    const hold    = Math.max(0, p.ampeg_hold);
    const decay   = Math.max(0.0005, p.ampeg_decay);
    const sustain = Math.max(0, Math.min(100, p.ampeg_sustain)) / 100;
    const param   = this._param;
    const peak    = this._peak;

    param.cancelScheduledValues(t);
    param.setValueAtTime(0, t);

    if (delay > 0) {
      param.setValueAtTime(0, t + delay);
    }

    // Attack ramp
    const attackEnd = t + delay + attack;
    param.linearRampToValueAtTime(peak, attackEnd);

    // Hold
    const holdEnd = attackEnd + hold;
    if (hold > 0) {
      param.setValueAtTime(peak, holdEnd);
    }

    // Decay → sustain level
    const sustainGain = peak * sustain;
    const decayEnd = holdEnd + decay;
    // Use exponential for more natural-sounding decay; floor at 0.0001 to avoid log(0)
    param.setTargetAtTime(Math.max(0.0001, sustainGain), holdEnd, decay / 3);
  }

  release(ctx, t) {
    const release = Math.max(0.005, this._parsed.ampeg_release);
    const param   = this._param;
    try {
      param.cancelScheduledValues(t);
      param.setValueAtTime(Math.max(0, param.value), t);
      param.linearRampToValueAtTime(0, t + release);
    } catch (_) {}
    this._releaseEnd = t + release;
  }

  get releaseEnd() { return this._releaseEnd || 0; }
}

// ── SfzVoice ───────────────────────────────────────────────

class SfzVoice {
  /**
   * @param {AudioContext} ctx
   * @param {object}       region      - Full region object from parser
   * @param {AudioBuffer}  audioBuffer
   * @param {AudioNode}    dest        - Output destination
   * @param {number}       velocity    - MIDI velocity 0–127
   */
  constructor(ctx, region, audioBuffer, dest, velocity) {
    this.stages    = [];  // { type, node }  — signal path
    this.modulators = []; // { schedule, release, releaseEnd }

    this._ctx      = ctx;
    this._released = false;
    this._ampMod   = null;

    this._build(ctx, region, audioBuffer, dest, velocity);
  }

  _build(ctx, region, buf, dest, velocity) {
    const p = region._parsed;
    const t = ctx.currentTime;

    // ── Stage 0: BufferSource ─────────────────────────────
    const source = ctx.createBufferSource();
    source.buffer = buf;

    // Pitch: combine keytrack, fine tune (cents), and coarse transpose (semitones)
    // pitch_keytrack 100 = normal tracking; 0 = no pitch change across keys
    const keyDiff   = (p._playMidi - p.pitch_keycenter) * (p.pitch_keytrack / 100);
    const semiTotal = keyDiff + p.transpose + p.tune / 100;
    source.playbackRate.value = Math.pow(2, semiTotal / 12);

    // Loop configuration
    if (p.loop_mode === 'loop_continuous' || p.loop_mode === 'loop_sustain') {
      source.loop = true;
      if (p.loop_start > 0) source.loopStart = p.loop_start / buf.sampleRate;
      if (p.loop_end   > 0) source.loopEnd   = p.loop_end   / buf.sampleRate;
    }

    // Start position (offset = sample frames from beginning)
    const startOffset = p.offset > 0 ? p.offset / buf.sampleRate : 0;
    source.start(t, startOffset);

    this.stages.push({ type: 'source', node: source });

    // ── Stage 1: Amp envelope (GainNode) ──────────────────
    const ampGain = ctx.createGain();
    ampGain.gain.setValueAtTime(0, t);
    this.stages.push({ type: 'amp_envelope', node: ampGain });

    // TODO v2: Stage 2 — filter node (BiquadFilterNode)
    //   const filter = ctx.createBiquadFilter();
    //   filter.type = p.fil_type.replace('lpf_2p','lowpass').replace('hpf_2p','highpass')...;
    //   filter.frequency.value = p.cutoff ?? (ctx.sampleRate / 2);
    //   filter.Q.value = p.resonance ?? 0;
    //   this.stages.push({ type: 'filter', node: filter });

    // TODO v2: Stages 3-5 — EQ bands (BiquadFilterNode × 3, type 'peaking')

    // ── Connect stages in order → dest ───────────────────
    for (let i = 0; i < this.stages.length - 1; i++) {
      this.stages[i].node.connect(this.stages[i + 1].node);
    }
    this.stages[this.stages.length - 1].node.connect(dest);

    // ── Modulator 0: AmpEG → amp_envelope.gain ────────────
    const velGain  = _velToGain(velocity, p.amp_veltrack);
    const dbGain   = Math.pow(10, p.volume / 20) * velGain;
    const ampMod   = new AmpEnvelopeModulator(ampGain.gain, p, dbGain);
    ampMod.schedule(ctx, t);
    this.modulators.push(ampMod);
    this._ampMod = ampMod;

    // TODO v2: push PitchEG modulator targeting source.playbackRate
    // TODO v2: push FilterEG modulator targeting filter.frequency
    // TODO v2: push AmpLFO (OscillatorNode → GainNode → ampGain.gain)
    // TODO v2: push PitchLFO targeting source.playbackRate
    // TODO v2: push FilterLFO targeting filter.frequency

    this._source  = source;
    this._ampGain = ampGain;
  }

  /** Trigger note release (key-up). */
  noteOff(ctx) {
    if (this._released) return;
    this._released = true;
    const t = ctx.currentTime;
    this.modulators.forEach(m => m.release(ctx, t));

    const release = Math.max(0.005, this._ampMod._parsed.ampeg_release);
    // loop_sustain mode: disable loop on release so sample plays to end
    if (this._ampMod._parsed.loop_mode === 'loop_sustain') {
      this._source.loop = false;
    }
    try { this._source.stop(t + release + 0.05); } catch (_) {}
  }

  /** Immediate cut (retrigger / steal). */
  kill(ctx) {
    const t = ctx.currentTime;
    try {
      this._ampGain.gain.cancelScheduledValues(t);
      this._ampGain.gain.setValueAtTime(this._ampGain.gain.value, t);
      this._ampGain.gain.linearRampToValueAtTime(0, t + 0.01);
      this._source.stop(t + 0.02);
    } catch (_) {}
  }
}

// ── Region matching ────────────────────────────────────────

/**
 * Return all regions from `instrument` that match the given play parameters.
 * Mutates rrCounters (round-robin state) and keyswitchState object.
 *
 * @param {object}   instrument      - SfzInstrument from loader
 * @param {number}   midi            - MIDI note number
 * @param {number}   velocity        - 0–127
 * @param {string}   trigger         - 'attack' | 'release' | 'first' | 'legato'
 * @param {object}   keyswitchState  - { note: number|null }  (mutated in place)
 * @param {Map}      rrCounters      - groupKey → counter  (mutated in place)
 */
function matchRegions(instrument, midi, velocity, trigger, keyswitchState, rrCounters) {
  const matched = [];

  for (const region of instrument.regions) {
    const p = region._parsed;

    // ── Note range ─────────────────────────────────────────
    if (midi < p.lokey || midi > p.hikey) continue;

    // ── Velocity range ─────────────────────────────────────
    if (velocity < p.lovel || velocity > p.hivel) continue;

    // ── Trigger type ───────────────────────────────────────
    if (p.trigger !== trigger) continue;

    // ── Keyswitch (sw_last) ────────────────────────────────
    if (p.sw_last !== null) {
      if (keyswitchState.note !== p.sw_last) continue;
    }

    // ── Random variation (lorand / hirand) ─────────────────
    if (p.lorand > 0 || p.hirand < 1) {
      const r = Math.random();
      if (r < p.lorand || r > p.hirand) continue;
    }

    // ── Round-robin (seq_length / seq_position) ────────────
    if (p.seq_length > 1) {
      // Group key: use group-level opcodes or fall back to lokey/hikey/lovel
      const groupKey = `${p.lokey}_${p.hikey}_${p.lovel}_${p.hivel}_${p.seq_length}`;
      const count = (rrCounters.get(groupKey) || 0);
      const pos = (count % p.seq_length) + 1;
      if (pos !== p.seq_position) continue;
    }

    matched.push(region);
  }

  // ── Increment RR counters for matched regions ─────────────
  for (const region of matched) {
    const p = region._parsed;
    if (p.seq_length > 1) {
      const groupKey = `${p.lokey}_${p.hikey}_${p.lovel}_${p.hivel}_${p.seq_length}`;
      rrCounters.set(groupKey, (rrCounters.get(groupKey) || 0) + 1);
    }
  }

  return matched;
}

/** Check if a MIDI note is in the keyswitch zone of an instrument. */
function _isKeyswitchNote(instrument, midi) {
  for (const region of instrument.regions) {
    const p = region._parsed;
    if (p.sw_lokey !== null && p.sw_hikey !== null) {
      if (midi >= p.sw_lokey && midi <= p.sw_hikey) return true;
    }
  }
  return false;
}

// ── SfzPlayer ──────────────────────────────────────────────

export class SfzPlayer {
  constructor(instrument) {
    this._instrument     = instrument;   // SfzInstrument from loader
    this._voices         = new Map();    // voiceKey → SfzVoice
    this._rrCounters     = new Map();    // groupKey → counter
    this._keyswitchState = { note: null };
    // releaseTime exposed for compatibility with engine.js _stopActive fallback
    this.releaseTime = 0.3;
  }

  hasAnyBuffers() { return !!this._instrument && this._instrument.audioBuffers.size > 0; }

  /**
   * Play a note. Called by engine.js playNote().
   * @param {AudioContext} ctx
   * @param {string}       note   - Note name e.g. "C4", "A#3"
   * @param {AudioNode}    dest   - Output destination
   * @param {string|*}     key    - Unique voice key (keyboard key or mx:... string)
   * @param {number}       [velocity=100]
   */
  play(ctx, note, dest, key, velocity = 100) {
    const midi = noteNameToMidi(note);
    if (midi === null) return false;

    // Store ctx for stop() calls
    this._ctx = ctx;

    // Update keyswitch state if this note is in the keyswitch zone
    if (_isKeyswitchNote(this._instrument, midi)) {
      this._keyswitchState.note = midi;
      // Keyswitch notes don't produce sound
      return true;
    }

    const regions = matchRegions(
      this._instrument, midi, velocity, 'attack',
      this._keyswitchState, this._rrCounters
    );

    if (regions.length === 0) return false;

    // Kill any existing voice on this key before starting new one
    const existing = this._voices.get(key);
    if (existing) existing.kill(ctx);

    // For v1: use the first matched region only (polyphony per-key is 1)
    // TODO v2: support off_by / group-based voice stealing
    const region = regions[0];
    const buf = this._instrument.audioBuffers.get(region._resolved_sample);
    if (!buf) return false;

    // Stamp the played MIDI note onto _parsed so the voice can compute pitch
    region._parsed._playMidi = midi;

    const voice = new SfzVoice(ctx, region, buf, dest, velocity);
    this._voices.set(key, voice);
    return true;
  }

  stop(key, immediate = false) {
    const voice = this._voices.get(key);
    if (!voice) return;
    const ctx = this._ctx;
    if (!ctx) return;
    if (immediate) voice.kill(ctx);
    else           voice.noteOff(ctx);
    this._voices.delete(key);
  }

  stopAll() {
    for (const k of [...this._voices.keys()]) this.stop(k, true);
  }
}
