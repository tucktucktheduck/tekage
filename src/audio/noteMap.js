// ═══════════════════════════════════════════════════════════
//  NOTE MAPPING — keyboard key → musical note
//
//  KEY BINDING FIX: Keys bind to note NAMES permanently.
//  When octave shifts, W still plays "C" — just in a different
//  octave. Semitone shifts adjust the octave's tuning offset
//  but do NOT rebind which key plays which note name.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import { noteNamesArr } from '../core/constants.js';
import { leftMap, rightMap, isLeftKey } from '../core/keyMapping.js';

/**
 * Given a keyboard key, returns the note string (e.g. "C4")
 * based on current octave + semitone state.
 */
export function getNote(k) {
  const noteName = leftMap[k] || rightMap[k];
  if (!noteName) return null;
  const isLeft = isLeftKey(k);
  const oct = isLeft ? state.octaveLeft : state.octaveRight;
  const offset = isLeft ? state.semitoneLeft : state.semitoneRight;

  const noteIdx = noteNamesArr.indexOf(noteName);
  let midi = (oct + 1) * 12 + noteIdx + offset;

  // Clamp to A0 (21) – C8 (108)
  midi = Math.max(21, Math.min(108, midi));

  const clampedOct = Math.floor(midi / 12) - 1;
  const clampedNoteName = noteNamesArr[midi % 12];
  return `${clampedNoteName}${clampedOct}`;
}
