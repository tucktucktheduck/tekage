// ═══════════════════════════════════════════════════════════
//  AUTO SLOW DOWN — engine module
//
//  State machine:
//    IDLE      → speed = 1.0, watching for overdue notes
//    SLOWING   → lerp toward MIN_MULT (fast, ~0.5s real time)
//    HOLDING   → locked at MIN_MULT for up to 3s real time
//    RECOVERING→ lerp back toward 1.0 (~0.8s real time)
//
//  Release triggers (HOLDING → RECOVERING):
//    • Player presses the note  (fn.playerHit = true)
//    • 3-second real-time timeout → also marks note as forgiven
//      (sets fn.playerHit so the same note doesn't re-trigger)
//
//  Re-trigger: if a NEW overdue note appears while RECOVERING,
//  immediately re-enter SLOWING.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';

const MIN_MULT         = 0.15;
const MAX_MULT         = 1.0;
const SLOW_RATE        = 4.0;    // lerp rate toward MIN_MULT  (~0.5s to reach min)
const RECOVER_RATE     = 2.0;    // lerp rate toward MAX_MULT  (~0.8s to reach max)
const HOLD_DURATION_MS = 3000;   // real-time ms to hold before auto-release

const IDLE       = 0;
const SLOWING    = 1;
const HOLDING    = 2;
const RECOVERING = 3;

let _state     = IDLE;
let _speedMult = 1.0;
let _holdMs    = 0;
let _recentQualities = [];

function hasOverdueNote() {
  return state.mxFallingNotes.some(fn => {
    if (fn.deleted || fn.playerHit) return false;
    if (state.mxCurTime < fn.startSec) return false;
    // Only count notes the player can actually press.
    // Solver-skipped notes have no keyboard key — they can never be playerHit,
    // so counting them would keep hasOverdue permanently true.
    if (state.solverReady && state.solverNoteMap && !state.solverNoteMap.has(fn.noteIndex)) return false;
    return true;
  });
}

/**
 * Called each frame (when settings.autoSlowDownOn is true).
 * @param {number} dtMs - frame delta in milliseconds
 * @returns {number} speed multiplier to apply to mxCurTime advance
 */
export function getAutoSlowDownMult(dtMs) {
  const overdue = hasOverdueNote();

  switch (_state) {

    case IDLE:
      if (overdue) {
        _state = SLOWING;
        _holdMs = 0;
      }
      break;

    case SLOWING:
      if (!overdue) {
        // Note was hit before we fully slowed — start recovering
        _state = RECOVERING;
      } else {
        _speedMult += (MIN_MULT - _speedMult) * Math.min(1, SLOW_RATE * dtMs / 1000);
        if (_speedMult <= MIN_MULT + 0.005) {
          _speedMult = MIN_MULT;
          _state = HOLDING;
          _holdMs = 0;
        }
      }
      break;

    case HOLDING:
      if (!overdue) {
        // All due notes hit — recover
        _state = RECOVERING;
      } else {
        _holdMs += dtMs;
        if (_holdMs >= HOLD_DURATION_MS) {
          // 3s passed without the note being played — forgive it and resume.
          // Mark currently-overdue notes as playerHit so they don't immediately
          // re-trigger the slow-down (avoids ping-pong with long-duration notes).
          for (const fn of state.mxFallingNotes) {
            if (!fn.deleted && !fn.playerHit && state.mxCurTime >= fn.startSec) {
              fn.playerHit = true;
            }
          }
          _state = RECOVERING;
        }
      }
      break;

    case RECOVERING:
      _speedMult += (MAX_MULT - _speedMult) * Math.min(1, RECOVER_RATE * dtMs / 1000);
      if (_speedMult >= MAX_MULT - 0.005) {
        _speedMult = MAX_MULT;
        _state = IDLE;
      }
      // If a new overdue note appears while recovering, slow back down immediately.
      // Check AFTER potentially transitioning to IDLE so any state is covered.
      if (overdue) {
        _state = SLOWING;
        _holdMs = 0;
      }
      break;
  }

  _speedMult = Math.max(MIN_MULT, Math.min(MAX_MULT, _speedMult));
  return _speedMult;
}

/**
 * Call this when a note is judged (after judgeNote() in MainScene keydown).
 * @param {'perfect'|'great'|'good'|'miss'} quality
 */
export function notifyAutoSlowHit(quality) {
  _recentQualities.push(quality);
  if (_recentQualities.length > 8) _recentQualities.shift();
}

/**
 * Reset state — call on song load and scrubber seek.
 */
export function resetAutoSlowDown() {
  _state     = IDLE;
  _speedMult = 1.0;
  _holdMs    = 0;
  _recentQualities = [];
}
