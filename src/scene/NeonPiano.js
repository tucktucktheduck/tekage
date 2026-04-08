// ═══════════════════════════════════════════════════════════
//  NEON PIANO
//  Draws the piano outline in the JSX reference style:
//  double-stroke neon lines (fat translucent + thin bright).
//  This draws ON TOP of the standard piano for the glow effect.
//
//  Usage:
//    import { drawNeonPianoOverlay } from './NeonPiano.js';
//    drawNeonPianoOverlay(scene);  // call after drawPiano()
// ═══════════════════════════════════════════════════════════

import { PIANO_LEFT, PIANO_WIDTH, PIANO_HEIGHT, pianoData } from '../core/constants.js';

const PL = PIANO_LEFT;
const PR = PIANO_LEFT + PIANO_WIDTH;
const PY = 1080 - 40 - PIANO_HEIGHT; // top of piano
const PB = 1080 - 40;                // bottom of piano
const PIH = PIANO_HEIGHT;

// Neon line color: cool white/blue
const GLOW_COLOR = 0xd2dcf0;
const GLOW_ALPHA_FAT = 0.12;
const GLOW_ALPHA_THIN = 0.7;
const FAT_WIDTH = 4;
const THIN_WIDTH = 1.3;

/**
 * Draw the neon piano overlay matching tekage-ui.jsx `lpp()` style.
 * @param {Phaser.Scene} scene
 */
export function drawNeonPianoOverlay(scene) {
  const gfx = scene.add.graphics();
  gfx.setDepth(3); // above piano keys

  // ── Outer border (neon lines) ──
  _neonLine(gfx, PL, PY, PR, PY);  // top
  _neonLine(gfx, PL, PB, PR, PB);  // bottom
  _neonLine(gfx, PL, PY, PL, PB);  // left
  _neonLine(gfx, PR, PY, PR, PB);  // right

  // ── Internal key dividers ──
  const ww = Math.round(18 * 1.5); // white key width
  const bw = Math.round(11 * 1.5); // black key width
  const bkH = PIH * 0.62;
  const bkHf = ww * 0.3;

  // Track which white keys have black keys on their right/left
  const ws = [];
  const bs = [];
  pianoData.forEach((d, i) => {
    if (!d.isBlack) ws.push(d);
  });

  // Map black key positions
  const blackAfter = new Set(); // indices in ws that have a black key after
  let wIdx = 0;
  pianoData.forEach((d, i) => {
    if (!d.isBlack) {
      if (i + 1 < pianoData.length && pianoData[i + 1].isBlack) {
        blackAfter.add(wIdx);
      }
      wIdx++;
    }
  });

  // Draw white key dividers
  const wkW = (PR - PL) / ws.length;
  for (let i = 1; i < ws.length; i++) {
    const x = PL + i * wkW;
    const hasBlackLeft = blackAfter.has(i - 1);
    const hasBlackRight = blackAfter.has(i);

    if (hasBlackLeft || hasBlackRight) {
      // Black key straddles this divider — draw partial lines
      if (hasBlackLeft) {
        const bX = x;
        const bL = bX - bkHf;
        const bR = bX + bkHf;
        const bbY = PY + bkH;

        // Black key outline
        _neonLine(gfx, bL, PY, bL, bbY);   // left edge
        _neonLine(gfx, bR, PY, bR, bbY);   // right edge
        _neonLine(gfx, bL, bbY, bR, bbY);  // bottom edge

        // Continuation line below black key
        _neonLine(gfx, bX, bbY, bX, PB);
      }
    } else {
      // Full divider
      _neonLine(gfx, x, PY, x, PB);
    }
  }

  // ── Scrubber neon track ──
  const scY = PB + 20;
  gfx.lineStyle(1, 0x3b9eff, 0.3);
  gfx.lineBetween(PL, scY + 1, PR, scY + 1);

  return gfx;
}

/**
 * Double-stroke neon line: fat translucent glow + thin bright core.
 */
function _neonLine(gfx, x1, y1, x2, y2) {
  // Fat glow
  gfx.lineStyle(FAT_WIDTH, GLOW_COLOR, GLOW_ALPHA_FAT);
  gfx.lineBetween(x1, y1, x2, y2);

  // Thin bright core
  gfx.lineStyle(THIN_WIDTH, GLOW_COLOR, GLOW_ALPHA_THIN);
  gfx.lineBetween(x1, y1, x2, y2);
}
