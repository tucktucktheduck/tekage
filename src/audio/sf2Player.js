// ═══════════════════════════════════════════════════════════
//  SF2 SOUNDFONT PLAYER
//  Parses a SoundFont 2 (.sf2) binary file, extracts audio
//  zones, and plays notes with pitch-shifting + looping.
//  Implements the same play/stop/hasAnyBuffers interface as
//  SalamanderPlayer / CustomSamplePlayer.
// ═══════════════════════════════════════════════════════════

import { noteNameToMidi } from './salamander.js';

// ── RIFF/SF2 binary parser ─────────────────────────────────

function _str4(u8, offset) {
  return String.fromCharCode(u8[offset], u8[offset+1], u8[offset+2], u8[offset+3]);
}

function _readStr(u8, offset, maxLen) {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    if (u8[offset + i] === 0) break;
    s += String.fromCharCode(u8[offset + i]);
  }
  return s.trim();
}

/**
 * Walk a RIFF tree and collect all sub-chunks into a flat map.
 * For SF2, every sub-chunk ID is unique within its LIST scope, so
 * a flat map (last-wins) is safe and sufficient.
 */
function _walkChunks(ab) {
  const u8   = new Uint8Array(ab);
  const view = new DataView(ab);

  if (_str4(u8, 0) !== 'RIFF' || _str4(u8, 8) !== 'sfbk') {
    throw new Error('Not a valid SF2 file — missing RIFF/sfbk header');
  }

  const chunks = {};

  function walk(start, end) {
    let p = start;
    while (p + 8 <= end) {
      const id   = _str4(u8, p);
      const size = view.getUint32(p + 4, true);
      if (p + 8 + size > u8.length) break;

      if (id === 'LIST') {
        walk(p + 12, p + 8 + size);
      } else {
        chunks[id] = { offset: p + 8, size };
      }

      p += 8 + size;
      if (size & 1) p++; // RIFF word-alignment pad
    }
  }

  walk(12, u8.length);
  return chunks;
}

/**
 * Parse the pdta sub-chunks and return an array of raw zone
 * descriptors (key range, sample reference, loop info, etc.).
 * Only uses bank=0 / preset=0 (the default preset).
 */
function _parseZones(ab, chunks) {
  const u8   = new Uint8Array(ab);
  const view = new DataView(ab);

  const need = ['phdr','pbag','pgen','inst','ibag','igen','shdr'];
  for (const c of need) {
    if (!chunks[c]) throw new Error(`SF2 missing required chunk: ${c}`);
  }

  // ── phdr (38 bytes each) ──
  const phdrCount = Math.floor(chunks.phdr.size / 38);
  const phdr = [];
  for (let i = 0; i < phdrCount; i++) {
    const b = chunks.phdr.offset + i * 38;
    phdr.push({
      name:   _readStr(u8, b, 20),
      preset: view.getUint16(b + 20, true),
      bank:   view.getUint16(b + 22, true),
      bagIdx: view.getUint16(b + 24, true),
    });
  }

  // ── pbag (4 bytes each) ──
  const pbagCount = Math.floor(chunks.pbag.size / 4);
  const pbag = [];
  for (let i = 0; i < pbagCount; i++) {
    const b = chunks.pbag.offset + i * 4;
    pbag.push({ genIdx: view.getUint16(b, true) });
  }

  // ── pgen (4 bytes each): oper + amount.lo/hi ──
  const pgenCount = Math.floor(chunks.pgen.size / 4);
  const pgen = [];
  for (let i = 0; i < pgenCount; i++) {
    const b = chunks.pgen.offset + i * 4;
    pgen.push({ oper: view.getUint16(b, true), lo: u8[b+2], hi: u8[b+3] });
  }

  // ── inst (22 bytes each) ──
  const instCount = Math.floor(chunks.inst.size / 22);
  const inst = [];
  for (let i = 0; i < instCount; i++) {
    const b = chunks.inst.offset + i * 22;
    inst.push({ name: _readStr(u8, b, 20), bagIdx: view.getUint16(b + 20, true) });
  }

  // ── ibag (4 bytes each) ──
  const ibagCount = Math.floor(chunks.ibag.size / 4);
  const ibag = [];
  for (let i = 0; i < ibagCount; i++) {
    const b = chunks.ibag.offset + i * 4;
    ibag.push({ genIdx: view.getUint16(b, true) });
  }

  // ── igen (4 bytes each) ──
  const igenCount = Math.floor(chunks.igen.size / 4);
  const igen = [];
  for (let i = 0; i < igenCount; i++) {
    const b = chunks.igen.offset + i * 4;
    igen.push({ oper: view.getUint16(b, true), lo: u8[b+2], hi: u8[b+3] });
  }

  // ── shdr (46 bytes each) ──
  const shdrCount = Math.floor(chunks.shdr.size / 46);
  const shdr = [];
  for (let i = 0; i < shdrCount; i++) {
    const b = chunks.shdr.offset + i * 46;
    shdr.push({
      name:            _readStr(u8, b, 20),
      start:           view.getUint32(b + 20, true),
      end:             view.getUint32(b + 24, true),
      loopStart:       view.getUint32(b + 28, true),
      loopEnd:         view.getUint32(b + 32, true),
      sampleRate:      view.getUint32(b + 36, true),
      originalPitch:   u8[b + 40],
      pitchCorrection: view.getInt8(b + 41),
      sampleType:      view.getUint16(b + 44, true),
    });
  }

  // ── Resolve preset → instrument ──
  // Prefer bank=0 preset=0; fall back to the first non-EOP entry.
  let pi = phdr.findIndex(p => p.bank === 0 && p.preset === 0);
  if (pi < 0) pi = 0;
  const thisPreset = phdr[pi];
  const nextPreset = phdr[pi + 1] || phdr[pi];

  const instrIds = [];
  for (let bi = thisPreset.bagIdx; bi < nextPreset.bagIdx; bi++) {
    if (bi >= pbagCount - 1) break;
    const gEnd = pbag[bi + 1]?.genIdx ?? pgenCount;
    for (let gi = pbag[bi].genIdx; gi < gEnd; gi++) {
      if (pgen[gi].oper === 41) { // sfGenOper_instrument
        instrIds.push(pgen[gi].lo | (pgen[gi].hi << 8));
      }
    }
  }
  if (instrIds.length === 0) instrIds.push(0);

  // ── Walk instrument zones ──
  const rawZones = [];
  for (const iid of instrIds) {
    if (iid >= inst.length - 1) continue; // last inst record is EOP terminator
    const thisInst = inst[iid];
    const nextInst = inst[iid + 1];

    for (let bi = thisInst.bagIdx; bi < nextInst.bagIdx; bi++) {
      if (bi >= ibagCount - 1) break;
      const gEnd = ibag[bi + 1]?.genIdx ?? igenCount;

      let keyLo = 0, keyHi = 127, sampleId = -1, sampleModes = 0;

      for (let gi = ibag[bi].genIdx; gi < gEnd; gi++) {
        const g = igen[gi];
        if      (g.oper === 43) { keyLo = g.lo; keyHi = g.hi; } // sfGenOper_keyRange
        else if (g.oper === 53) { sampleId = g.lo | (g.hi << 8); } // sfGenOper_sampleID
        else if (g.oper === 54) { sampleModes = g.lo | (g.hi << 8); } // sfGenOper_sampleModes
      }

      if (sampleId < 0 || sampleId >= shdr.length) continue;
      const s = shdr[sampleId];
      if (s.sampleType & 0x8000) continue; // ROM sample — skip
      if (s.end <= s.start) continue;       // empty sample — skip

      // originalPitch=255 means "unspecified"; default to middle of key range
      const rootPitch = s.originalPitch === 255
        ? Math.round((keyLo + keyHi) / 2)
        : s.originalPitch;

      rawZones.push({
        keyLo, keyHi, sampleId, sampleModes,
        originalPitch:   rootPitch,
        pitchCorrection: s.pitchCorrection,
        sampleRate:      s.sampleRate,
        start:           s.start,
        end:             s.end,
        loopStart:       s.loopStart,
        loopEnd:         s.loopEnd,
      });
    }
  }

  return { rawZones, presetName: thisPreset.name };
}

/**
 * Convert raw zone descriptors into Web Audio AudioBuffers.
 * Caches buffers by sampleId so shared samples aren't decoded twice.
 * Yields to the event loop every 8 zones so the UI can update.
 */
async function _decodeZones(ab, rawZones, smplChunk, ctx, onProgress) {
  // RIFF guarantees even alignment, but guard to be safe
  const smplOffset = smplChunk.offset & ~1;
  const i16 = new Int16Array(ab, smplOffset, Math.floor(smplChunk.size / 2));

  const bufCache  = new Map(); // sampleId → AudioBuffer
  const decoded   = [];

  for (let i = 0; i < rawZones.length; i++) {
    const z = rawZones[i];

    let audioBuf = bufCache.get(z.sampleId);
    if (!audioBuf) {
      const len = z.end - z.start;
      audioBuf = ctx.createBuffer(1, len, z.sampleRate);
      const f32 = audioBuf.getChannelData(0);
      const slice = i16.subarray(z.start, z.end);
      for (let j = 0; j < slice.length; j++) f32[j] = slice[j] / 32768;
      bufCache.set(z.sampleId, audioBuf);
    }

    decoded.push({
      keyLo:           z.keyLo,
      keyHi:           z.keyHi,
      audioBuffer:     audioBuf,
      originalPitch:   z.originalPitch,
      pitchCorrection: z.pitchCorrection,
      loopStart:       z.loopStart - z.start, // relative to zone start
      loopEnd:         z.loopEnd  - z.start,
      loopMode:        z.sampleModes & 3,
    });

    if (onProgress) onProgress(Math.round((i + 1) / rawZones.length * 100));

    // Yield every 8 zones so the browser doesn't stall
    if ((i & 7) === 7) await new Promise(r => setTimeout(r, 0));
  }

  return decoded;
}

// ── SF2Player ──────────────────────────────────────────────

class SF2Player {
  constructor() {
    this.zones       = [];  // decoded zone descriptors
    this.name        = '';  // preset name from SF2
    this.releaseTime = 0.4;
    this._activeSources = new Map(); // key → {source, gain, ctx}
  }

  /**
   * Parse + decode an SF2 ArrayBuffer.
   * @param {ArrayBuffer} arrayBuffer
   * @param {AudioContext} ctx
   * @param {function(pct: number): void} [onProgress]  0–100
   */
  async load(arrayBuffer, ctx, onProgress) {
    const chunks = _walkChunks(arrayBuffer);
    const { rawZones, presetName } = _parseZones(arrayBuffer, chunks);
    this.name = presetName;

    if (!chunks.smpl) throw new Error('SF2 has no smpl (sample data) chunk');
    if (rawZones.length === 0) throw new Error('No playable zones found in SF2');

    this.zones = await _decodeZones(arrayBuffer, rawZones, chunks.smpl, ctx, onProgress);
  }

  hasAnyBuffers() {
    return this.zones.length > 0;
  }

  /**
   * Play a note. Same signature as SalamanderPlayer.play().
   * @returns {boolean} true if a zone was found and playback started
   */
  play(ctx, note, dest, key) {
    const midi = noteNameToMidi(note);
    if (midi === null) return false;

    const zone = this.zones.find(z => z.keyLo <= midi && midi <= z.keyHi);
    if (!zone) return false;

    // Stop any existing note at this key first
    this.stop(key, true);

    const source = ctx.createBufferSource();
    source.buffer = zone.audioBuffer;

    // Pitch-shift: ratio = 2^(semitoneOffset / 12)
    const semitones = midi - (zone.originalPitch + zone.pitchCorrection / 100);
    source.playbackRate.value = Math.pow(2, semitones / 12);

    // Loop while key held (loopMode bit 0)
    if ((zone.loopMode & 1) && zone.loopEnd > zone.loopStart) {
      source.loop      = true;
      source.loopStart = zone.loopStart / zone.audioBuffer.sampleRate;
      source.loopEnd   = zone.loopEnd   / zone.audioBuffer.sampleRate;
    }

    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.006); // short attack

    source.connect(gain);
    gain.connect(dest);
    source.start();

    this._activeSources.set(key, { source, gain, ctx });
    return true;
  }

  /**
   * Release a note. Same signature as SalamanderPlayer.stop().
   */
  stop(key, immediate = false) {
    const active = this._activeSources.get(key);
    if (!active) return;
    const { source, gain, ctx } = active;
    const t = ctx.currentTime;
    const r = immediate ? 0.01 : this.releaseTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + r);
    } catch (e) {}
    setTimeout(() => {
      try { source.stop(); source.disconnect(); } catch (e) {}
      try { gain.disconnect(); } catch (e) {}
      if (this._activeSources.get(key) === active) this._activeSources.delete(key);
    }, r * 1000 + 20);
  }
}

export const sf2Player = new SF2Player();
