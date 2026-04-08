// ═══════════════════════════════════════════════════════════
//  DYNAMIC COLOR SYSTEM
//  All hand colors now read from SkinManager so they update
//  automatically whenever the active skin changes.
// ═══════════════════════════════════════════════════════════

import skinManager from '../skin/SkinManager.js';

/** Convert hex string "#rrggbb" to 0xRRGGBB integer */
export function hexToInt(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

/** Convert 0xRRGGBB integer to "#rrggbb" string */
export function intToHex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

/** Lighten a hex int color by blending toward white */
export function lighten(color, amount) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return (lr << 16) | (lg << 8) | lb;
}

/** Blend between two hex int colors. t=0 → colorA, t=1 → colorB */
export function lerpColor(colorA, colorB, t) {
  const rA = (colorA >> 16) & 0xff, gA = (colorA >> 8) & 0xff, bA = colorA & 0xff;
  const rB = (colorB >> 16) & 0xff, gB = (colorB >> 8) & 0xff, bB = colorB & 0xff;
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * The active color palette. All hand/accent colors read live
 * from SkinManager via getters — so any skin change propagates
 * automatically to every consumer of this object.
 */
const colors = {
  // ── Hand colors (live from SkinManager) ──
  get left() { return hexToInt(skinManager.getColor('primary')); },
  get leftLight() { return lighten(hexToInt(skinManager.getColor('primary')), 0.3); },
  get right() { return hexToInt(skinManager.getColor('secondary')); },
  get rightLight() { return lighten(hexToInt(skinManager.getColor('secondary')), 0.3); },
  get purple() { return hexToInt(skinManager.getColor('accent')); },

  // ── Fixed colors ──
  white: 0xffffff,
  gray: 0x333333,
  grayDark: 0x1a1a1a,
  black: 0x000000,
};

/**
 * Explicitly set colors (e.g. from a color picker).
 * Delegates to SkinManager so the change propagates everywhere.
 */
export function updateColors(leftHex, rightHex) {
  skinManager.setColor('primary', leftHex);
  skinManager.setColor('secondary', rightHex);
}

export default colors;
