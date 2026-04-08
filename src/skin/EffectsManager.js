// ═══════════════════════════════════════════════════════════
//  EFFECTS MANAGER
//  Manages Phaser post-processing and blend effects that
//  can be toggled via skin settings.
//
//  Features:
//    • Glow intensity per element
//    • Blend modes (ADD, MULTIPLY, SCREEN)
//    • Alpha pulse (breathing) on idle elements
//    • Color tint on hit (extends glowEffect.js)
//
//  Usage:
//    import { EffectsManager } from '../skin/EffectsManager.js';
//    const fx = new EffectsManager();
//    fx.init(scene);
//    fx.update(time, delta);
//    fx.destroy();
// ═══════════════════════════════════════════════════════════

import skinManager from './SkinManager.js';

export class EffectsManager {
  constructor() {
    this._scene = null;
    this._pulseTargets = [];     // { gameObject, baseAlpha, speed, phase }
    this._onSkinLoaded = null;
  }

  /**
   * Initialize effects. Call in scene.create().
   * @param {Phaser.Scene} scene
   */
  init(scene) {
    this._scene = scene;
    this._applyEffects();

    this._onSkinLoaded = () => this._applyEffects();
    skinManager.on('skinLoaded', this._onSkinLoaded);
  }

  /** Read effect settings from SkinManager and configure */
  _applyEffects() {
    const effects = skinManager.getEffects();

    // Clear previous pulse targets
    this._pulseTargets = [];

    // Apply bloom if available and configured
    if (effects.bloom && this._scene.cameras?.main?.postFX) {
      try {
        this._scene.cameras.main.postFX.addBloom(
          effects.bloom.color || 0xffffff,
          effects.bloom.strength || 1,
          effects.bloom.blurStrength || 1,
          effects.bloom.quality || 1
        );
      } catch (e) {
        // WebGL2 not available — graceful fallback
        console.info('[EffectsManager] Bloom not available (requires WebGL2)');
      }
    }
  }

  /**
   * Register a game object for alpha pulse (breathing) animation.
   * @param {Phaser.GameObjects.GameObject} gameObject
   * @param {object} opts - { baseAlpha, speed, minAlpha }
   */
  addPulse(gameObject, { baseAlpha = 1, speed = 1.5, minAlpha = 0.3 } = {}) {
    this._pulseTargets.push({
      gameObject,
      baseAlpha,
      speed,
      minAlpha,
      phase: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Remove pulse from a game object.
   */
  removePulse(gameObject) {
    this._pulseTargets = this._pulseTargets.filter(p => p.gameObject !== gameObject);
  }

  /**
   * Get the glow intensity for an element (0-1).
   * @param {string} elementId
   * @returns {number}
   */
  getGlowIntensity(elementId) {
    const intensities = skinManager._glowIntensities || {};
    return intensities[elementId] ?? 1.0;
  }

  /**
   * Apply a blend mode to a game object based on skin settings.
   * @param {Phaser.GameObjects.GameObject} gameObject
   * @param {string} blendModeName - 'ADD'|'MULTIPLY'|'SCREEN'|'NORMAL'
   */
  applyBlendMode(gameObject, blendModeName) {
    const modes = {
      'ADD': Phaser.BlendModes.ADD,
      'MULTIPLY': Phaser.BlendModes.MULTIPLY,
      'SCREEN': Phaser.BlendModes.SCREEN,
      'NORMAL': Phaser.BlendModes.NORMAL,
    };
    if (modes[blendModeName] !== undefined) {
      gameObject.setBlendMode(modes[blendModeName]);
    }
  }

  /**
   * Per-frame update: animate pulse targets.
   */
  update(time, delta) {
    if (!this._scene) return;
    const t = time / 1000;

    for (const p of this._pulseTargets) {
      if (!p.gameObject || !p.gameObject.active) continue;
      const wave = 0.5 + 0.5 * Math.sin(t * p.speed * Math.PI * 2 + p.phase);
      const alpha = p.minAlpha + (p.baseAlpha - p.minAlpha) * wave;
      p.gameObject.setAlpha(alpha);
    }
  }

  /** Full cleanup */
  destroy() {
    if (this._onSkinLoaded) {
      skinManager.off('skinLoaded', this._onSkinLoaded);
      this._onSkinLoaded = null;
    }
    this._pulseTargets = [];
    this._scene = null;
  }
}
