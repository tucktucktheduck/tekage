// ═══════════════════════════════════════════════════════════
//  NOTE VISUAL RESOLVER
//  Resolves which visual to use for a falling note based on
//  a per-key → per-hand → null fallback chain.
//
//  Usage:
//    import { resolveNoteVisual } from '../skin/NoteVisualResolver.js';
//    const visual = resolveNoteVisual('w', 'left');
//    // → { type: 'image', bitmap, mode, frames, frameDuration }
//    // → or null (use default color rectangle)
// ═══════════════════════════════════════════════════════════

import skinManager from './SkinManager.js';
import { noteKeyId } from './skinConstants.js';

/**
 * Resolve the visual for a note played by a specific computer key.
 *
 * Fallback chain:
 *   1. Per-key override:  note_key_{computerKey}
 *   2. Per-hand default:  note_block_left or note_block_right
 *   3. null → use color rectangle (existing Phaser behavior)
 *
 * @param {string} computerKey - The computer key (e.g., 'w', 'e', 'y')
 * @param {'left'|'right'} hand - Which hand plays this key
 * @returns {{ type: string, bitmap?: ImageBitmap, mode?: string, frames?: number, frameDuration?: number } | null}
 */
export function resolveNoteVisual(computerKey, hand) {
  return skinManager.getPerKeyVisual(computerKey, hand);
}

/**
 * Check if any custom note visuals exist at all (for optimization —
 * skip texture loading if everything is default).
 */
export function hasAnyNoteVisuals() {
  const hasLeft = skinManager.getImage('note_block_left') !== null;
  const hasRight = skinManager.getImage('note_block_right') !== null;
  const hasPerKey = skinManager.getPerKeyVisualKeys().length > 0;
  return hasLeft || hasRight || hasPerKey;
}

/**
 * Get the current note display mode.
 * @returns {'stretch'|'tile'|'mask-global'|'mask-per-note'}
 */
export function getNoteDisplayMode() {
  return skinManager.getNoteDisplayMode();
}
