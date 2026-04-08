// ═══════════════════════════════════════════════════════════
//  NOTE RENDERER
//  Stateless factory functions for creating and updating
//  falling note blocks. Supports:
//    • Color rectangles (default behavior)
//    • Stretched images (per-key or per-hand)
//    • Tiled images
//    • Animated spritesheets (GIF/APNG decoded frames)
//
//  Usage:
//    import { loadNoteTextures, createNoteBlock, updateNoteBlock } from '../skin/NoteRenderer.js';
//    await loadNoteTextures(scene);  // once in create()
//    const block = createNoteBlock(scene, x, y, w, h, 'w', 'left', color);
//    updateNoteBlock(block, x, y, w, h);
//    destroyNoteBlock(block);
// ═══════════════════════════════════════════════════════════

import skinManager from './SkinManager.js';
import { resolveNoteVisual, getNoteDisplayMode, hasAnyNoteVisuals } from './NoteVisualResolver.js';
import { NOTE_KEY_PREFIX } from './skinConstants.js';

const TEX_PREFIX = '__note_img_';

/** Track which textures we've loaded so we can clean up */
const _loadedTexKeys = new Set();

/**
 * Load all per-key and per-hand note images into Phaser's texture manager.
 * Call once during scene.create() or when skin changes.
 * @param {Phaser.Scene} scene
 */
export async function loadNoteTextures(scene) {
  // Clean up previously loaded note textures
  for (const key of _loadedTexKeys) {
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
  }
  _loadedTexKeys.clear();

  if (!hasAnyNoteVisuals()) return;

  // Load per-hand defaults
  await _loadVisualTexture(scene, 'note_block_left', null, 'left');
  await _loadVisualTexture(scene, 'note_block_right', null, 'right');

  // Load per-key visuals
  const perKeyKeys = skinManager.getPerKeyVisualKeys();
  for (const computerKey of perKeyKeys) {
    const elementId = NOTE_KEY_PREFIX + computerKey;
    await _loadVisualTexture(scene, elementId, computerKey, null);
  }
}

/**
 * Load a single visual into Phaser textures.
 */
async function _loadVisualTexture(scene, elementId, computerKey, hand) {
  const visual = computerKey
    ? skinManager.getPerKeyVisual(computerKey, hand || 'left')
    : skinManager.getVisual(elementId);

  if (!visual || visual.type !== 'image' || !visual.bitmap) return;

  const texKey = TEX_PREFIX + elementId + '__';
  if (scene.textures.exists(texKey)) {
    scene.textures.remove(texKey);
  }

  const bitmap = visual.bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  // If animated (multiple frames in horizontal strip), add as spritesheet
  if (visual.frames && visual.frames > 1) {
    const frameWidth = Math.floor(bitmap.width / visual.frames);
    scene.textures.addSpriteSheet(texKey, canvas, {
      frameWidth,
      frameHeight: bitmap.height,
    });

    // Create animation
    const animKey = texKey + 'anim';
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: scene.anims.generateFrameNumbers(texKey, { start: 0, end: visual.frames - 1 }),
      frameRate: 1000 / (visual.frameDuration || 100),
      repeat: -1,
    });
  } else {
    scene.textures.addCanvas(texKey, canvas);
  }

  _loadedTexKeys.add(texKey);
}

/**
 * Get the Phaser texture key for a given computer key + hand combo.
 * Returns null if no custom visual exists.
 */
function _getTexKey(computerKey, hand) {
  // Try per-key first
  const perKeyTex = TEX_PREFIX + NOTE_KEY_PREFIX + computerKey + '__';
  if (_loadedTexKeys.has(perKeyTex)) return perKeyTex;

  // Fall back to per-hand
  const handTex = TEX_PREFIX + (hand === 'left' ? 'note_block_left' : 'note_block_right') + '__';
  if (_loadedTexKeys.has(handTex)) return handTex;

  return null;
}

/**
 * Create a note block game object.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {string} computerKey - The computer key (e.g., 'w')
 * @param {'left'|'right'} hand - Which hand
 * @param {number} color - Fallback color (hex int, e.g. 0x3b82f6)
 * @param {object} [opts] - Options: { depth, strokeWidth, strokeColor, alpha }
 * @returns {Phaser.GameObjects.GameObject}
 */
export function createNoteBlock(scene, x, y, w, h, computerKey, hand, color, opts = {}) {
  const { depth = 5, strokeWidth = 3, strokeColor = color, alpha = 0.9 } = opts;
  const mode = getNoteDisplayMode();
  const texKey = _getTexKey(computerKey, hand);

  if (!texKey) {
    // Default: color rectangle (preserves existing behavior exactly)
    const rect = scene.add.rectangle(x, y, w, h, color, alpha);
    rect.setStrokeStyle(strokeWidth, strokeColor);
    rect.setDepth(depth);
    rect._noteType = 'rect';
    return rect;
  }

  // Check if animated
  const visual = resolveNoteVisual(computerKey, hand);
  const isAnimated = visual && visual.frames && visual.frames > 1;

  if (mode === 'tile') {
    // Tile mode: repeat texture across note dimensions
    const tile = scene.add.tileSprite(x, y, w, h, texKey);
    tile.setDepth(depth);
    tile.setAlpha(alpha);
    tile._noteType = 'tile';
    return tile;
  }

  if (isAnimated) {
    // Animated sprite
    const sprite = scene.add.sprite(x, y, texKey);
    sprite.setDisplaySize(w, h);
    sprite.setDepth(depth);
    sprite.setAlpha(alpha);
    const animKey = texKey + 'anim';
    if (scene.anims.exists(animKey)) {
      sprite.play(animKey);
    }
    sprite._noteType = 'sprite';
    return sprite;
  }

  // Stretch mode (default for custom images)
  const img = scene.add.image(x, y, texKey);
  img.setDisplaySize(w, h);
  img.setDepth(depth);
  img.setAlpha(alpha);
  img._noteType = 'image';
  return img;
}

/**
 * Update position and size of a note block (handles all types).
 * @param {Phaser.GameObjects.GameObject} block
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
export function updateNoteBlock(block, x, y, w, h) {
  if (!block || !block.active) return;

  block.setPosition(x, y);

  switch (block._noteType) {
    case 'rect':
      block.setSize(w, h);
      break;
    case 'tile':
      block.setSize(w, h);
      break;
    case 'image':
    case 'sprite':
      block.setDisplaySize(w, h);
      break;
    default:
      // Fallback — try both
      if (typeof block.setSize === 'function') block.setSize(w, h);
      break;
  }
}

/**
 * Destroy a note block safely.
 * @param {Phaser.GameObjects.GameObject} block
 */
export function destroyNoteBlock(block) {
  if (block && typeof block.destroy === 'function') {
    block.destroy();
  }
}

/**
 * Clean up all loaded note textures (call on scene shutdown).
 * @param {Phaser.Scene} scene
 */
export function cleanupNoteTextures(scene) {
  for (const key of _loadedTexKeys) {
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
  }
  _loadedTexKeys.clear();
}
