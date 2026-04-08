// ═══════════════════════════════════════════════════════════
//  SCORE TRACKER
//  Computes and exposes real-time stats for the stats panel.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';

/** Get current accuracy as a percentage string */
export function getAccuracy() {
  const total = state.score.perfectHits + state.score.greatHits + state.score.goodHits + state.score.misses;
  if (total === 0) return '0.0';
  return ((state.score.notesHit / total) * 100).toFixed(1);
}

/** Get all stats as a plain object (for the panel) */
export function getStats() {
  return {
    accuracy: getAccuracy(),
    notesHit: state.score.notesHit,
    totalNotes: state.score.totalNotes,
    streak: state.score.streak,
    longestStreak: state.score.longestStreak,
    perfect: state.score.perfectHits,
    great: state.score.greatHits,
    good: state.score.goodHits,
    misses: state.score.misses,
  };
}
