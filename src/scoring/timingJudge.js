// ═══════════════════════════════════════════════════════════
//  TIMING JUDGE
//  Determines hit quality based on timing offset.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';

/** Timing windows in seconds */
export const PERFECT_WINDOW = 0.100; // ±100ms
export const GREAT_WINDOW   = 0.200; // ±200ms
export const GOOD_WINDOW    = 0.300; // ±300ms

/**
 * Judge a note hit (or miss).
 * @param {number} noteIndex - index into mxNotes
 * @param {number|null} hitTimeSec - when the player pressed (null = missed)
 * @returns {'perfect'|'great'|'good'|'miss'}
 */
export function judgeNote(noteIndex, hitTimeSec) {
  const note = state.mxNotes[noteIndex];
  if (!note) return 'miss';

  if (hitTimeSec === null) {
    state.score.misses++;
    state.score.streak = 0;
    state.score.hitDetails.set(noteIndex, { offset: null, quality: 'miss' });
    return 'miss';
  }

  const offset = Math.abs(hitTimeSec - note.startSec);
  let quality;

  if (offset <= PERFECT_WINDOW) {
    quality = 'perfect';
    state.score.perfectHits++;
    state.score.notesHit++;
    state.score.streak++;
  } else if (offset <= GREAT_WINDOW) {
    quality = 'great';
    state.score.greatHits++;
    state.score.notesHit++;
    state.score.streak++;
  } else if (offset <= GOOD_WINDOW) {
    quality = 'good';
    state.score.goodHits++;
    state.score.notesHit++;
    state.score.streak++;
  } else {
    quality = 'miss';
    state.score.misses++;
    state.score.streak = 0;
  }

  if (state.score.streak > state.score.longestStreak) {
    state.score.longestStreak = state.score.streak;
  }

  state.score.hitDetails.set(noteIndex, { offset, quality });
  return quality;
}

/**
 * Returns a 0–1 value representing how "off" the timing was.
 * 0 = perfect, 1 = at the edge of GOOD_WINDOW.
 * Used by glow effect for gradient.
 */
export function getTimingGradient(offset) {
  if (offset <= PERFECT_WINDOW) return 0;
  if (offset >= GOOD_WINDOW) return 1;
  return (offset - PERFECT_WINDOW) / (GOOD_WINDOW - PERFECT_WINDOW);
}
