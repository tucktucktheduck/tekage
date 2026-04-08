// ═══════════════════════════════════════════════════════════
//  MASK/REVEAL MANAGER
//  Handles the mask display modes where falling notes act as
//  windows into a reveal image.
//
//  Two modes:
//    • mask-global:   All notes collectively reveal ONE shared image
//    • mask-per-note: Each note independently reveals its own copy
//
//  Usage:
//    import { MaskRevealManager } from '../skin/MaskRevealManager.js';
//    const maskMgr = new MaskRevealManager();
//    maskMgr.init(scene, 'mask-global', revealBitmap);
//    maskMgr.updateMasks(activeNotes);   // each frame
//    maskMgr.destroy();                  // cleanup
// ═══════════════════════════════════════════════════════════

import skinManager from './SkinManager.js';

export class MaskRevealManager {
  constructor() {
    this._scene = null;
    this._mode = null;           // 'mask-global' | 'mask-per-note'
    this._revealImage = null;    // Phaser image (the full reveal bg)
    this._renderTex = null;      // RenderTexture for global mask
    this._bitmapMask = null;     // Phaser BitmapMask for global mode
    this._perNoteMasks = new Map();  // noteId → { reveal, mask }
    this._texKey = '__mask_reveal__';
    this._rtKey = '__mask_rt__';
  }

  /**
   * Initialize the mask system.
   * @param {Phaser.Scene} scene
   * @param {'mask-global'|'mask-per-note'} mode
   * @param {ImageBitmap} revealBitmap - The image to reveal through notes
   */
  init(scene, mode, revealBitmap) {
    this._scene = scene;
    this._mode = mode;

    if (!revealBitmap) {
      console.warn('[MaskRevealManager] No reveal bitmap provided');
      return;
    }

    // Create texture from bitmap
    if (scene.textures.exists(this._texKey)) {
      scene.textures.remove(this._texKey);
    }
    const canvas = document.createElement('canvas');
    canvas.width = revealBitmap.width;
    canvas.height = revealBitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(revealBitmap, 0, 0);
    scene.textures.addCanvas(this._texKey, canvas);

    if (mode === 'mask-global') {
      this._initGlobalMask(scene);
    }
    // mask-per-note is handled lazily via addNoteMask()
  }

  /** Set up the shared global mask infrastructure */
  _initGlobalMask(scene) {
    // Full-screen reveal image at depth 8 (above notes)
    this._revealImage = scene.add.image(960, 540, this._texKey);
    const scaleX = 1920 / this._revealImage.width;
    const scaleY = 1080 / this._revealImage.height;
    this._revealImage.setScale(Math.max(scaleX, scaleY));
    this._revealImage.setDepth(8);

    // RenderTexture as mask source — white pixels = visible
    this._renderTex = scene.add.renderTexture(0, 0, 1920, 1080);
    this._renderTex.setVisible(false);

    // Apply as bitmap mask
    this._bitmapMask = new Phaser.Display.Masks.BitmapMask(scene, this._renderTex);
    this._revealImage.setMask(this._bitmapMask);
  }

  /**
   * Update masks each frame. For global mode, redraws the mask
   * from all active note positions.
   *
   * @param {Array<{ x: number, y: number, w: number, h: number }>} activeNotes
   *   Array of note position/size objects for all currently visible notes.
   */
  updateMasks(activeNotes) {
    if (!this._scene || !this._mode) return;

    if (this._mode === 'mask-global' && this._renderTex) {
      // Clear and redraw white rectangles for every active note
      this._renderTex.clear();
      const white = this._scene.add.rectangle(0, 0, 1, 1, 0xffffff);
      white.setVisible(false);

      for (const note of activeNotes) {
        this._renderTex.draw(white, note.x, note.y);
        // Actually we need to stamp white rects at each note position
      }
      white.destroy();

      // Better approach: use fill directly
      this._renderTex.clear();
      this._renderTex.beginDraw();
      for (const note of activeNotes) {
        // Draw a filled white rectangle at note position
        const rect = this._scene.add.rectangle(note.x, note.y, note.w, note.h, 0xffffff);
        this._renderTex.batchDraw(rect);
        rect.destroy();
      }
      this._renderTex.endDraw();
    }
  }

  /**
   * Add a per-note mask (mask-per-note mode).
   * Creates a reveal image clipped to this note's position.
   *
   * @param {string} noteId - Unique identifier for this note
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {number} w - Width
   * @param {number} h - Height
   * @returns {{ reveal: Phaser.GameObjects.Image }} The mask pair
   */
  addNoteMask(noteId, x, y, w, h) {
    if (this._mode !== 'mask-per-note' || !this._scene) return null;
    if (this._perNoteMasks.has(noteId)) return this._perNoteMasks.get(noteId);

    // Create a reveal image sized/positioned to match the note
    const reveal = this._scene.add.image(x, y, this._texKey);
    reveal.setDisplaySize(w, h);
    reveal.setDepth(6);

    // Crop/mask the reveal to note bounds using a geometry mask
    const maskShape = this._scene.make.graphics({ x: 0, y: 0 });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(x - w / 2, y - h / 2, w, h);
    const geoMask = maskShape.createGeometryMask();
    reveal.setMask(geoMask);

    const entry = { reveal, maskShape, geoMask };
    this._perNoteMasks.set(noteId, entry);
    return entry;
  }

  /**
   * Update a per-note mask's position/size.
   */
  updateNoteMask(noteId, x, y, w, h) {
    const entry = this._perNoteMasks.get(noteId);
    if (!entry) return;

    entry.reveal.setPosition(x, y);
    entry.reveal.setDisplaySize(w, h);

    // Update geometry mask
    entry.maskShape.clear();
    entry.maskShape.fillStyle(0xffffff);
    entry.maskShape.fillRect(x - w / 2, y - h / 2, w, h);
  }

  /**
   * Remove a per-note mask when the note is destroyed.
   */
  removeNoteMask(noteId) {
    const entry = this._perNoteMasks.get(noteId);
    if (!entry) return;

    entry.reveal.clearMask(true);
    entry.reveal.destroy();
    entry.maskShape.destroy();
    this._perNoteMasks.delete(noteId);
  }

  /** Check if mask mode is active */
  isActive() {
    return this._mode === 'mask-global' || this._mode === 'mask-per-note';
  }

  /** Get current mode */
  getMode() {
    return this._mode;
  }

  /** Full cleanup */
  destroy() {
    // Clean up per-note masks
    for (const [id, entry] of this._perNoteMasks) {
      entry.reveal.clearMask(true);
      entry.reveal.destroy();
      entry.maskShape.destroy();
    }
    this._perNoteMasks.clear();

    // Clean up global mask
    if (this._revealImage) {
      this._revealImage.clearMask(true);
      this._revealImage.destroy();
      this._revealImage = null;
    }
    if (this._renderTex) {
      this._renderTex.destroy();
      this._renderTex = null;
    }
    this._bitmapMask = null;

    // Clean up texture
    if (this._scene && this._scene.textures.exists(this._texKey)) {
      this._scene.textures.remove(this._texKey);
    }

    this._scene = null;
    this._mode = null;
  }
}
