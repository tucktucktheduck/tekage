// ═══════════════════════════════════════════════════════════
//  SALAMANDER GRAND PIANO — Sample Player
//  Yamaha C5, Salamander Grand Piano V3 by Alexander Holm
//  Public domain (2022). Samples hosted via Tone.js CDN.
// ═══════════════════════════════════════════════════════════

const CDN_BASE = 'https://tonejs.github.io/audio/salamander/';

// Every 3 semitones from A0 (midi 21) to C8 (midi 108)
const SAMPLE_MIDI  = [21,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96,99,102,105,108];
const SAMPLE_NAMES = ['A0','C1','Ds1','Fs1','A1','C2','Ds2','Fs2',
  'A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4',
  'C5','Ds5','Fs5','A5','C6','Ds6','Fs6','A6','C7',
  'Ds7','Fs7','A7','C8'];

/** Parse "C4", "C#4", "Ds1", "Bb3" → MIDI number, or null. */
export function noteNameToMidi(note) {
  const NAT = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  const FLAT = { Cb:11, Db:1, Eb:3, Fb:4, Gb:6, Ab:8, Bb:10 };
  const SHARPS = { Cs:1, Ds:3, Es:5, Fs:6, Gs:8, As:10, Bs:0 };
  let m;
  // "Ds1", "Fs4" style (Salamander CDN)
  m = note.match(/^([A-G]s)(\d)$/);
  if (m && SHARPS[m[1]] !== undefined) return (parseInt(m[2]) + 1) * 12 + SHARPS[m[1]];
  // "Bb3" flat style
  m = note.match(/^([A-G]b)(\d)$/);
  if (m && FLAT[m[1]] !== undefined) return (parseInt(m[2]) + 1) * 12 + FLAT[m[1]];
  // "C4", "C#4", "A#3" standard style
  m = note.match(/^([A-G]#?)(\d)$/);
  if (m) {
    const pc = m[1].length === 2 ? NAT[m[1][0]] + 1 : NAT[m[1]];
    if (pc !== undefined) return (parseInt(m[2]) + 1) * 12 + pc;
  }
  return null;
}

// ── Salamander Player ──────────────────────────────────────

class SalamanderPlayer {
  constructor() {
    this.releaseTime = 0.5;
    this._arrayBuffers = new Map();   // midi → ArrayBuffer
    this._buffers      = new Map();   // midi → AudioBuffer (decoded)
    this._decoding     = new Map();   // midi → Promise<AudioBuffer>
    this._activeSources = new Map();  // key  → { source, gain, ctx }
    this._loading = false;
    this._loaded  = false;
    this._progress = 0;
  }

  isLoaded()   { return this._loaded; }
  isLoading()  { return this._loading; }
  getProgress(){ return this._progress; }

  /** Fetch all 30 MP3 ArrayBuffers. No AudioContext needed. */
  async preload(onProgress) {
    if (this._loading || this._loaded) return;
    this._loading = true;
    let done = 0;
    const total = SAMPLE_MIDI.length;

    for (let i = 0; i < total; i += 6) {
      await Promise.all(
        SAMPLE_MIDI.slice(i, i + 6).map(async (midi, j) => {
          const name = SAMPLE_NAMES[i + j];
          try {
            const resp = await fetch(CDN_BASE + name + '.mp3');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            this._arrayBuffers.set(midi, await resp.arrayBuffer());
          } catch (e) {
            console.warn('[Salamander] Could not load', name, e.message);
          }
          done++;
          this._progress = done / total;
          if (onProgress) onProgress(this._progress, done, total);
        })
      );
    }
    this._loading = false;
    this._loaded  = this._arrayBuffers.size > 0;
  }

  hasAnyBuffers() {
    return this._arrayBuffers.size > 0 || this._buffers.size > 0;
  }

  _findNearest(midi) {
    let best = null, bestDist = Infinity;
    for (const m of this._arrayBuffers.keys()) {
      const d = Math.abs(m - midi);
      if (d < bestDist) { bestDist = d; best = m; }
    }
    return best;
  }

  /** Decode a raw ArrayBuffer into an AudioBuffer and cache it. */
  async _getBuffer(ctx, nearest) {
    if (this._buffers.has(nearest)) return this._buffers.get(nearest);
    if (this._decoding.has(nearest)) return this._decoding.get(nearest);
    const ab = this._arrayBuffers.get(nearest);
    if (!ab) return null;
    const promise = ctx.decodeAudioData(ab.slice(0)).then(buf => {
      this._buffers.set(nearest, buf);
      this._decoding.delete(nearest);
      return buf;
    }).catch(() => null);
    this._decoding.set(nearest, promise);
    return promise;
  }

  /** Play a note. Falls back silently if not loaded. Returns true if started. */
  play(ctx, note, dest, key) {
    const midi = noteNameToMidi(note);
    if (midi === null) return false;
    const nearest = this._findNearest(midi);
    if (nearest === null) return false;

    // If already decoded: play synchronously
    const buf = this._buffers.get(nearest);
    if (buf) {
      this._stopSource(key, true);
      this._startSource(ctx, buf, midi, nearest, dest, key);
      return true;
    }

    // Otherwise decode async and play when ready
    this._getBuffer(ctx, nearest).then(b => {
      if (!b) return;
      this._stopSource(key, true);
      this._startSource(ctx, b, midi, nearest, dest, key);
    });
    return true;
  }

  _startSource(ctx, buf, midi, nearest, dest, key) {
    const source = ctx.createBufferSource();
    const gain   = ctx.createGain();
    source.buffer = buf;
    source.playbackRate.value = Math.pow(2, (midi - nearest) / 12);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.006);
    source.connect(gain).connect(dest);
    source.start();
    this._activeSources.set(key, { source, gain, ctx });
  }

  _stopSource(key, immediate = false) {
    const entry = this._activeSources.get(key);
    if (!entry) return;
    const { source, gain, ctx } = entry;
    const t = ctx.currentTime;
    const r = immediate ? 0.01 : this.releaseTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + r);
      source.stop(t + r + 0.05);
    } catch (_) {}
    this._activeSources.delete(key);
  }

  stop(key, immediate = false) { this._stopSource(key, immediate); }
  stopAll() { for (const k of [...this._activeSources.keys()]) this._stopSource(k, true); }
}

export const salamanderPlayer = new SalamanderPlayer();

// ── Custom Sample Player ───────────────────────────────────

export class CustomSamplePlayer {
  constructor() {
    this.releaseTime = 0.3;
    this._buffers       = new Map();  // midi → AudioBuffer
    this._activeSources = new Map();  // key  → { source, gain, ctx }
  }

  addBuffer(midi, audioBuf) { this._buffers.set(midi, audioBuf); }
  hasSamples() { return this._buffers.size > 0; }
  getCount()   { return this._buffers.size; }
  hasAnyBuffers() { return this._buffers.size > 0; }

  _findNearest(midi) {
    let best = null, bestDist = Infinity;
    for (const m of this._buffers.keys()) {
      const d = Math.abs(m - midi);
      if (d < bestDist) { bestDist = d; best = m; }
    }
    return best;
  }

  play(ctx, note, dest, key) {
    const midi = noteNameToMidi(note);
    if (midi === null) return false;
    const nearest = this._findNearest(midi);
    if (nearest === null) return false;
    const buf = this._buffers.get(nearest);
    if (!buf) return false;

    this.stop(key, true);

    const source = ctx.createBufferSource();
    const gain   = ctx.createGain();
    source.buffer = buf;
    source.playbackRate.value = Math.pow(2, (midi - nearest) / 12);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.006);
    source.connect(gain).connect(dest);
    source.start();
    this._activeSources.set(key, { source, gain, ctx });
    return true;
  }

  stop(key, immediate = false) {
    const entry = this._activeSources.get(key);
    if (!entry) return;
    const { source, gain, ctx } = entry;
    const t = ctx.currentTime;
    const r = immediate ? 0.01 : this.releaseTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + r);
      source.stop(t + r + 0.05);
    } catch (_) {}
    this._activeSources.delete(key);
  }

  stopAll() { for (const k of [...this._activeSources.keys()]) this.stop(k, true); }
}

// Shared custom player instance (null until user uploads samples)
let _customPlayer = null;
export function getCustomPlayer() { return _customPlayer; }
export function setCustomPlayer(p) { _customPlayer = p; }

/** Parse a filename like "C4.mp3", "As3.wav", "Bb2.mp3" → MIDI or null */
export function filenameToMidi(filename) {
  const base = filename.replace(/\.[^.]+$/, ''); // strip extension
  return noteNameToMidi(base);
}
