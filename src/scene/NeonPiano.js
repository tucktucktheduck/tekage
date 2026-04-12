// ═══════════════════════════════════════════════════════════
//  NEON PIANO OVERLAY
//  Draws a clean blue neon border around the piano.
//  No internal key dividers — outer border only.
// ═══════════════════════════════════════════════════════════

import { PIANO_LEFT, PIANO_HEIGHT, pianoData } from '../core/constants.js';

// ── Must match piano.js exactly ──────────────────────────────
const ww = Math.round(18 * 1.5);  // white key width = 27
const bw = Math.round(11 * 1.5);  // black key width = 17

const WHITE_COUNT = pianoData.filter(d => !d.isBlack).length; // 52

const PL  = PIANO_LEFT;
const PR  = PL + WHITE_COUNT * ww;   // actual right edge
const PY  = 1080 - 40 - PIANO_HEIGHT - 1;  // +1 for stroke
const PB  = 1080 - 40 + 1;                 // +1 for stroke

const GLOW_COLOR      = 0x1a8fff;   // blue to match teklet
const GLOW_ALPHA_FAT  = 0.18;
const GLOW_ALPHA_THIN = 0.80;
const FAT_WIDTH       = 4;
const THIN_WIDTH      = 1.3;

export function drawNeonPianoOverlay(scene) {
  const gfx = scene.add.graphics();
  gfx.setDepth(3);

  // ── Outer border only ─────────────────────────────────────
  _neonLine(gfx, PL, PY, PR, PY);   // top
  _neonLine(gfx, PL, PB, PR, PB);   // bottom
  _neonLine(gfx, PL, PY, PL, PB);   // left
  _neonLine(gfx, PR, PY, PR, PB);   // right

  // ── Scrubber neon track ───────────────────────────────────
  gfx.lineStyle(1, 0x3b9eff, 0.3);
  gfx.lineBetween(PL, PB + 20, PR, PB + 20);

  return gfx;
}

function _neonLine(gfx, x1, y1, x2, y2) {
  gfx.lineStyle(FAT_WIDTH,  GLOW_COLOR, GLOW_ALPHA_FAT);
  gfx.lineBetween(x1, y1, x2, y2);
  gfx.lineStyle(THIN_WIDTH, GLOW_COLOR, GLOW_ALPHA_THIN);
  gfx.lineBetween(x1, y1, x2, y2);
}
