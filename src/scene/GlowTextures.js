// ═══════════════════════════════════════════════════════════
//  GLOW TEXTURES
//  Pre-generated Canvas textures for glow/neon effects.
//  Phaser doesn't have Canvas 2D's shadowBlur, so we create
//  radial/linear gradient textures and use ADD blend mode.
//
//  All colors are pulled from the live color system so they
//  update when the user changes skin colors.
//
//  Call generateGlowTextures(scene) once in create().
// ═══════════════════════════════════════════════════════════

import colors, { intToHex } from '../core/colors.js';
import { rowYPositions, PORT_HEIGHT } from '../core/constants.js';

/** Extract [r, g, b] from a 0xRRGGBB integer */
function intToRGB(n) {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Generate all reusable glow textures and add them to the scene's texture manager.
 * Uses live colors from the color system — regenerates on each call by
 * removing old textures first.
 * @param {Phaser.Scene} scene
 */
export function generateGlowTextures(scene) {
  const leftRGB = intToRGB(colors.left);
  const rightRGB = intToRGB(colors.right);

  // Remove old textures to allow regeneration with new colors
  const keys = [
    '__glow_blue__', '__glow_orange__', '__glow_white__',
    '__glow_blue_sm__', '__glow_orange_sm__',
    '__jdot_blue__', '__jdot_orange__',
    '__noteglow_blue__', '__noteglow_orange__',
    '__ambient_blue_rect__', '__ambient_orange_rect__', '__ambient_grey_rect__',
  ];
  for (const k of keys) {
    if (scene.textures.exists(k)) scene.textures.remove(k);
  }

  _makeRadialGlow(scene, '__glow_blue__', 128, leftRGB);
  _makeRadialGlow(scene, '__glow_orange__', 128, rightRGB);
  _makeRadialGlow(scene, '__glow_white__', 128, [255, 255, 255]);
  _makeRadialGlow(scene, '__glow_blue_sm__', 50, leftRGB);
  _makeRadialGlow(scene, '__glow_orange_sm__', 50, rightRGB);
  _makeJunctionDot(scene, '__jdot_blue__', 50, leftRGB);
  _makeJunctionDot(scene, '__jdot_orange__', 50, rightRGB);
  _makeNoteGlowRect(scene, '__noteglow_blue__', 32, 128, leftRGB);
  _makeNoteGlowRect(scene, '__noteglow_orange__', 32, 128, rightRGB);
  _makeRectAmbientGlow(scene, '__ambient_blue_rect__', 80, 70, leftRGB);
  _makeRectAmbientGlow(scene, '__ambient_orange_rect__', 80, 70, rightRGB);
  _makeRectAmbientGlow(scene, '__ambient_grey_rect__', 80, 70, [85, 85, 85]);
}

/**
 * Soft radial glow circle — used for keypress illumination.
 */
function _makeRadialGlow(scene, key, size, rgb) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size, size, 0, size, size, size);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.65)`);
  g.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`);
  g.addColorStop(0.55, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.15)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size * 2, size * 2);
  scene.textures.addCanvas(key, c);
}

/**
 * Junction dot — bright center, rapid falloff.
 */
function _makeJunctionDot(scene, key, size, rgb) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size, size, 0, size, size, size);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.8)`);
  g.addColorStop(0.2, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
  g.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.2)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size * 2, size * 2);
  scene.textures.addCanvas(key, c);
}

/**
 * Rectangular glow for falling notes — vertical gradient with soft edges.
 */
function _makeNoteGlowRect(scene, key, w, h, rgb) {
  if (scene.textures.exists(key)) return;
  const pad = 16;
  const c = document.createElement('canvas');
  c.width = w + pad * 2; c.height = h + pad * 2;
  const ctx = c.getContext('2d');

  // Outer glow (blurred rectangle via shadow trick)
  ctx.shadowColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`;
  ctx.shadowBlur = pad;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.3)`;
  ctx.fillRect(pad, pad, w, h);

  // Inner gradient fill
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
  const lighter = rgb.map(v => Math.min(255, v + 80));
  g.addColorStop(0, `rgba(${lighter[0]},${lighter[1]},${lighter[2]},0.9)`);
  g.addColorStop(0.5, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`);
  ctx.fillStyle = g;
  ctx.fillRect(pad + 2, pad, w - 4, h);

  scene.textures.addCanvas(key, c);
}

/**
 * Rectangular ambient glow — radial gradient clipped to a rectangle.
 * Matches the JSX `createRadialGradient()` + `fillRect()` approach
 * for feathered rectangular glow at each key center.
 */
function _makeRectAmbientGlow(scene, key, w, h, rgb) {
  if (scene.textures.exists(key)) return;
  const pad = 20; // extra space for feathered edges
  const cw = w + pad * 2;
  const ch = h + pad * 2;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');

  // Radial gradient centered in the canvas
  const cx = cw / 2, cy = ch / 2;
  const radius = Math.max(w, h) * 0.8;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`);
  g.addColorStop(0.3, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.25)`);
  g.addColorStop(0.6, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.1)`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  // Clip to rectangle for the feathered rectangular shape
  ctx.fillRect(0, 0, cw, ch);

  scene.textures.addCanvas(key, c);
}

/**
 * Get the right glow texture key for a hand.
 */
export function getGlowKey(hand, size = 'normal') {
  if (size === 'small') return hand === 'left' ? '__glow_blue_sm__' : '__glow_orange_sm__';
  return hand === 'left' ? '__glow_blue__' : '__glow_orange__';
}

export function getJunctionKey(hand) {
  return hand === 'left' ? '__jdot_blue__' : '__jdot_orange__';
}

export function getNoteGlowKey(hand) {
  return hand === 'left' ? '__noteglow_blue__' : '__noteglow_orange__';
}

export function getAmbientKey(hand) {
  if (hand === 'grey') return '__ambient_grey_rect__';
  return hand === 'left' ? '__ambient_blue_rect__' : '__ambient_orange_rect__';
}

/**
 * Create one BitmapMask per keyboard row that feathers notes out at the bar line.
 * The mask is fully opaque above (centerY - FEATHER) and fades to transparent at centerY.
 * Applied once to portBlocks; notes scroll through the static mask.
 * @param {Phaser.Scene} scene
 * @returns {Object} map of centerY → Phaser.Display.Masks.BitmapMask
 */
export const NOTE_CROP_OFFSET = 40; // px below centerY where the crop/feather ends

export function createRowCropMasks(scene) {
  const FEATHER = 18;
  const W = 1920;
  const result = {};

  for (const centerY of rowYPositions) {
    const portTop = centerY - PORT_HEIGHT / 2;
    const cropY = centerY + NOTE_CROP_OFFSET; // where the note fully disappears
    const maskH = cropY - portTop;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = maskH;
    const ctx = canvas.getContext('2d');

    // Fully opaque white for the top portion
    const solidH = Math.max(0, maskH - FEATHER);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, W, solidH);

    // Gradient for the bottom FEATHER px: opaque → transparent
    const grad = ctx.createLinearGradient(0, solidH, 0, maskH);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, solidH, W, FEATHER);

    const texKey = `__row_crop_mask_${centerY}__`;
    if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
    scene.textures.addCanvas(texKey, canvas);

    // Position the mask image so its bottom edge sits at cropY
    const maskImg = scene.add.image(W / 2, portTop + maskH / 2, texKey);
    maskImg.setVisible(false);

    result[centerY] = maskImg.createBitmapMask();
  }

  return result;
}
