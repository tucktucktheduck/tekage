// ═══════════════════════════════════════════════════════════
//  MUSICXML PARSER
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import { MIDI_A0, MIDI_C8 } from '../core/constants.js';

export function mxGetMidi(n) {
  const p = n.querySelector('pitch');
  if (!p) return null;
  const step = p.querySelector('step')?.textContent;
  const oct = +p.querySelector('octave')?.textContent;
  const alt = +(p.querySelector('alter')?.textContent) || 0;
  if (!step || isNaN(oct)) return null;
  const sm = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return sm[step] !== undefined ? (oct + 1) * 12 + sm[step] + Math.round(alt) : null;
}

export function mxParseMusicXML(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid XML');
  state.mxRawXmlDoc = doc;

  const partListEls = doc.querySelectorAll('part-list score-part');
  const partEls = doc.querySelectorAll('part');
  if (!partEls.length) throw new Error('No <part> found');

  const tmap = [];
  let defDiv = 1, defTempo = 120;
  {
    let tick = 0, cDiv = null, cTempo = null;
    for (const ms of partEls[0].querySelectorAll('measure')) {
      const dEl = ms.querySelector('attributes>divisions');
      if (dEl) { const v = +dEl.textContent; if (v > 0) { if (!cDiv) defDiv = v; cDiv = v; } }
      for (const ch of ms.children) {
        if (ch.tagName === 'direction') {
          const snd = ch.querySelector('sound');
          if (snd) {
            const t = +snd.getAttribute('tempo');
            if (t > 0) { if (!cTempo) defTempo = t; cTempo = t; tmap.push({ tick, tempo: cTempo, div: cDiv || defDiv }); }
          }
        }
        if (ch.tagName === 'note' && !ch.querySelector('chord')) {
          const d = +(ch.querySelector('duration')?.textContent); if (d > 0) tick += d;
        } else if (ch.tagName === 'forward') {
          const d = +(ch.querySelector('duration')?.textContent); if (d > 0) tick += d;
        } else if (ch.tagName === 'backup') {
          const d = +(ch.querySelector('duration')?.textContent); if (d > 0) tick -= d;
        }
      }
    }
  }
  if (!tmap.length) tmap.push({ tick: 0, tempo: defTempo, div: defDiv });
  tmap.sort((a, b) => a.tick - b.tick);

  function t2s(target) {
    let s = 0, prev = 0, tempo = tmap[0].tempo, div = tmap[0].div;
    for (const e of tmap) {
      if (e.tick >= target) break;
      if (e.tick > prev) { s += (e.tick - prev) / div * (60 / tempo); prev = e.tick; }
      tempo = e.tempo; div = e.div;
    }
    if (target > prev) s += (target - prev) / div * (60 / tempo);
    return s;
  }

  const allParts = [];
  for (let pi = 0; pi < partEls.length; pi++) {
    const part = partEls[pi];
    const partId = part.getAttribute('id') || `part-${pi}`;
    let partName = partId;
    if (partListEls[pi]) {
      const pn = partListEls[pi].querySelector('part-name');
      if (pn && pn.textContent.trim()) partName = pn.textContent.trim();
    }

    const evts = [];
    let msTick = 0, cDiv = defDiv;
    for (const ms of part.querySelectorAll('measure')) {
      const dEl = ms.querySelector('attributes>divisions');
      if (dEl) { const v = +dEl.textContent; if (v > 0) cDiv = v; }
      const vc = new Map(), vl = new Map();
      for (const ch of ms.children) {
        if (ch.tagName === 'note') {
          const voice = +(ch.querySelector('voice')?.textContent) || 1;
          if (!vc.has(voice)) vc.set(voice, msTick);
          const isChord = !!ch.querySelector('chord'), isRest = !!ch.querySelector('rest');
          const dur = +(ch.querySelector('duration')?.textContent) || 0;
          const st = isChord ? (vl.get(voice) ?? vc.get(voice)) : vc.get(voice);
          if (!isRest && !isChord) vl.set(voice, st);
          if (!isRest) {
            const midi = mxGetMidi(ch);
            if (midi !== null && midi >= MIDI_A0 && midi <= MIDI_C8) evts.push({ st, dur, midi });
          }
          if (!isChord) { vc.set(voice, vc.get(voice) + dur); if (!isRest) vl.set(voice, st); }
        } else if (ch.tagName === 'forward') {
          const d = +(ch.querySelector('duration')?.textContent) || 0;
          for (const [k, v] of vc) vc.set(k, v + d);
        } else if (ch.tagName === 'backup') {
          const d = +(ch.querySelector('duration')?.textContent) || 0;
          for (const [k, v] of vc) vc.set(k, v - d);
        }
      }
      let mx = msTick; for (const [, v] of vc) if (v > mx) mx = v;
      msTick = mx;
    }

    const parsedNotes = evts
      .map(e => ({
        midi: e.midi,
        startSec: t2s(e.st),
        durationSec: Math.max(t2s(e.st + e.dur) - t2s(e.st), 0.05),
        partId,
      }))
      .sort((a, b) => a.startSec - b.startSec);

    allParts.push({ id: partId, name: partName, notes: parsedNotes });
  }

  return allParts;
}
