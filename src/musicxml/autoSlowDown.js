// ═══════════════════════════════════════════════════════════
//  AUTO SLOW DOWN — engine module
//  Computes a per-frame speed multiplier (0.15–1.0) that slows
//  mxCurTime when notes are overdue at the hit line.
//
//  Recovery rate is driven by recent hit accuracy (the same
//  quality signal that sizes the keyboard glow flash):
//    perfect hits → fast recovery (~1.7s)
//    all misses   → slow recovery (~12s)
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';

const MIN_MULT      = 0.15;   // slowest speed when fully blocked
const MAX_MULT      = 1.0;
const WINDOW_SIZE   = 8;      // rolling window of recent hit qualities
const QUALITY_SCORE = { perfect: 1.0, great: 0.67, good: 0.33, miss: 0.0 };

let _speedMult       = 1.0;
let _recentQualities = [];   // rolling window, max WINDOW_SIZE entries

/**
 * Called each frame (when settings.autoSlowDownOn is true).
 * @param {number} dtMs - frame delta in milliseconds
 * @returns {number} speed multiplier to apply to mxCurTime advance
 */
export function getAutoSlowDownMult(dtMs) {
  // Any note that has reached the hit line but hasn't been pressed or played yet
  const hasOverdue = state.mxFallingNotes.some(fn =>
    !fn.deleted && !fn.playerHit && !fn.audioStarted &&
    state.mxCurTime >= fn.startSec
  );

  // Recovery rate scales with recent accuracy
  const avgScore = _recentQualities.length
    ? _recentQualities.reduce((s, q) => s + (QUALITY_SCORE[q] ?? 0), 0) / _recentQualities.length
    : 0.5;
  const recoveryRate = 0.08 + avgScore * 0.52; // [0.08, 0.60]

  const target   = hasOverdue ? MIN_MULT : MAX_MULT;
  const lerpRate = hasOverdue ? 0.5 : recoveryRate;

  _speedMult += (target - _speedMult) * Math.min(1, lerpRate * dtMs / 1000);
  // Clamp to avoid floating-point drift
  _speedMult = Math.max(MIN_MULT, Math.min(MAX_MULT, _speedMult));

  return _speedMult;
}

/**
 * Call this when a note is judged (after judgeNote() in MainScene keydown).
 * @param {'perfect'|'great'|'good'|'miss'} quality
 */
export function notifyAutoSlowHit(quality) {
  _recentQualities.push(quality);
  if (_recentQualities.length > WINDOW_SIZE) _recentQualities.shift();
}

/**
 * Reset state — call on song load and scrubber seek.
 */
export function resetAutoSlowDown() {
  _speedMult       = 1.0;
  _recentQualities = [];
}
