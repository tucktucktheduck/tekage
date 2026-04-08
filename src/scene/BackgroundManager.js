// ═══════════════════════════════════════════════════════════
//  BACKGROUND MANAGER
//  Manages the scene background — can be:
//    • Default starfield (no custom skin)
//    • Custom image (scaled to cover 1920×1080)
//    • Custom video (looped, muted, scaled to cover)
//
//  Usage:
//    import { BackgroundManager } from './BackgroundManager.js';
//    const bgMgr = new BackgroundManager();
//    bgMgr.init(scene, starfield);  // in create()
//    bgMgr.update(time, delta);     // in update()
//    bgMgr.destroy();               // cleanup
// ═══════════════════════════════════════════════════════════

import skinManager from '../skin/SkinManager.js';
import { SKIN_ELEMENTS } from '../skin/skinConstants.js';

const DEPTH = -10;

export class BackgroundManager {
  constructor() {
    this._scene = null;
    this._starfield = null;    // StarfieldBackground ref
    this._bgImage = null;      // Phaser.GameObjects.Image
    this._bgVideo = null;      // Phaser.GameObjects.Video
    this._bgVideoEl = null;    // HTMLVideoElement (for blob video)
    this._bgSprite = null;     // Phaser sprite used for blob-sourced images
    this._mode = 'starfield';  // 'starfield' | 'image' | 'video'
    this._onSkinLoaded = null;
  }

  /**
   * Initialize background manager. Call in scene.create() AFTER starfield.init().
   * @param {Phaser.Scene} scene
   * @param {StarfieldBackground} starfield
   */
  init(scene, starfield) {
    this._scene = scene;
    this._starfield = starfield;

    // Check if skin has a background visual
    this._applyCurrentSkin();

    // React to skin changes
    this._onSkinLoaded = () => this._applyCurrentSkin();
    skinManager.on('skinLoaded', this._onSkinLoaded);
  }

  /** Re-evaluate background on skin change */
  _applyCurrentSkin() {
    this._clearCustomBg();

    const visual = skinManager.getVisual(SKIN_ELEMENTS.BACKGROUND);

    if (!visual) {
      // No custom background → show starfield
      this._mode = 'starfield';
      if (this._starfield) this._starfield.setVisible(true);
      return;
    }

    if (visual.type === 'video') {
      this._setupVideo(visual.element);
    } else if (visual.type === 'image' && visual.bitmap) {
      this._setupImage(visual.bitmap);
    } else {
      // Fallback to starfield
      this._mode = 'starfield';
      if (this._starfield) this._starfield.setVisible(true);
    }
  }

  /**
   * Set up an image background from an ImageBitmap.
   */
  _setupImage(bitmap) {
    if (!this._scene) return;

    // Hide starfield
    if (this._starfield) this._starfield.setVisible(false);
    this._mode = 'image';

    // Create a canvas texture from the bitmap
    const texKey = '__bg_custom_img__';
    if (this._scene.textures.exists(texKey)) {
      this._scene.textures.remove(texKey);
    }

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);

    this._scene.textures.addCanvas(texKey, canvas);
    this._bgImage = this._scene.add.image(960, 540, texKey);
    this._bgImage.setDepth(DEPTH);

    // Scale to cover
    const scaleX = 1920 / bitmap.width;
    const scaleY = 1080 / bitmap.height;
    const scale = Math.max(scaleX, scaleY);
    this._bgImage.setScale(scale);
  }

  /**
   * Set up a video background from an HTMLVideoElement.
   */
  _setupVideo(videoEl) {
    if (!this._scene) return;

    // Hide starfield
    if (this._starfield) this._starfield.setVisible(false);
    this._mode = 'video';
    this._bgVideoEl = videoEl;

    // Use Phaser's Video game object with an existing video element
    const texKey = '__bg_custom_vid__';

    // Create a Phaser Video game object
    this._bgVideo = this._scene.add.video(960, 540, texKey);
    this._bgVideo.setDepth(DEPTH);

    // Load from the blob video element
    try {
      this._bgVideo.video = videoEl;
      videoEl.play().catch(() => {
        // Autoplay may be blocked — try on next user interaction
        const resume = () => {
          videoEl.play().catch(() => {});
          document.removeEventListener('click', resume);
          document.removeEventListener('keydown', resume);
        };
        document.addEventListener('click', resume, { once: true });
        document.addEventListener('keydown', resume, { once: true });
      });

      // Scale to cover
      const vw = videoEl.videoWidth || 1920;
      const vh = videoEl.videoHeight || 1080;
      const scaleX = 1920 / vw;
      const scaleY = 1080 / vh;
      const scale = Math.max(scaleX, scaleY);
      this._bgVideo.setScale(scale);
    } catch (e) {
      console.warn('[BackgroundManager] Video setup failed, falling back to starfield', e);
      this._clearCustomBg();
      this._mode = 'starfield';
      if (this._starfield) this._starfield.setVisible(true);
    }
  }

  /** Remove any custom background objects */
  _clearCustomBg() {
    if (this._bgImage) {
      this._bgImage.destroy();
      this._bgImage = null;
    }
    if (this._bgVideo) {
      try { this._bgVideo.destroy(); } catch (e) {}
      this._bgVideo = null;
    }
    this._bgVideoEl = null;
    this._bgSprite = null;
  }

  /**
   * Per-frame update. Only needed for starfield animation —
   * video playback is handled by the browser.
   */
  update(time, delta) {
    if (this._mode === 'starfield' && this._starfield) {
      this._starfield.update(time, delta);
    }

    // Keep video playing if it paused unexpectedly
    if (this._mode === 'video' && this._bgVideoEl && this._bgVideoEl.paused) {
      this._bgVideoEl.play().catch(() => {});
    }
  }

  /** Restore the default starfield background */
  restoreDefault() {
    this._clearCustomBg();
    this._mode = 'starfield';
    if (this._starfield) this._starfield.setVisible(true);
  }

  /** Full cleanup */
  destroy() {
    if (this._onSkinLoaded) {
      skinManager.off('skinLoaded', this._onSkinLoaded);
      this._onSkinLoaded = null;
    }
    this._clearCustomBg();
    if (this._starfield) {
      this._starfield.destroy();
      this._starfield = null;
    }
    this._scene = null;
  }
}
