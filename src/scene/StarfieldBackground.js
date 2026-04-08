// ═══════════════════════════════════════════════════════════
//  STARFIELD BACKGROUND
//  Default background matching tekage-ui.jsx aesthetic:
//    • Dark radial gradient base (#0a0a14 center → #000 edge)
//    • Slow-drifting parallax stars with twinkle animation
//    • Used when no custom background skin is set
//
//  Usage:
//    import { StarfieldBackground } from './StarfieldBackground.js';
//    const starfield = new StarfieldBackground();
//    starfield.init(scene);          // call in create()
//    starfield.update(time, delta);  // call in update()
//    starfield.setVisible(false);    // hide when custom bg active
//    starfield.destroy();            // cleanup
// ═══════════════════════════════════════════════════════════

const LAYER_CONFIG = [
  { count: 100, minSize: 0.5, maxSize: 1.0, speed: 3,  alpha: 0.2, color: 0xffffff },  // far — very dim
  { count: 60,  minSize: 0.8, maxSize: 1.5, speed: 6,  alpha: 0.35, color: 0xffffff }, // mid
  { count: 25,  minSize: 1.2, maxSize: 2.5, speed: 10, alpha: 0.55, color: 0xd0d8ff }, // near — brighter, slight blue
];

const DEPTH = -10;

export class StarfieldBackground {
  constructor() {
    this._layers = [];   // array of { config, stars: Circle[] }
    this._scene = null;
    this._visible = true;
    this._bg = null;      // radial gradient background image
  }

  /**
   * Create background + all star layers. Call once in scene.create().
   * @param {Phaser.Scene} scene
   */
  init(scene) {
    this._scene = scene;

    // ── Dark radial gradient background (matching JSX) ──
    const bgKey = '__starfield_bg__';
    if (!scene.textures.exists(bgKey)) {
      const c = document.createElement('canvas');
      c.width = 1920; c.height = 1080;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(960, 540, 100, 960, 540, 900);
      g.addColorStop(0, '#0a0a14');
      g.addColorStop(1, '#000000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1920, 1080);
      scene.textures.addCanvas(bgKey, c);
    }
    this._bg = scene.add.image(960, 540, bgKey);
    this._bg.setDepth(DEPTH - 1);

    // ── Stars ──
    for (const config of LAYER_CONFIG) {
      const stars = [];
      for (let i = 0; i < config.count; i++) {
        const x = Math.random() * 1920;
        const y = Math.random() * 1080;
        const size = config.minSize + Math.random() * (config.maxSize - config.minSize);
        const alpha = config.alpha * (0.3 + Math.random() * 0.7);

        const star = scene.add.circle(x, y, size, config.color, alpha);
        star.setDepth(DEPTH);

        // Per-star animation data
        star._sf = {
          baseAlpha: alpha,
          twinkleSpeed: 0.4 + Math.random() * 1.5,
          twinklePhase: Math.random() * Math.PI * 2,
          driftX: (Math.random() - 0.5) * config.speed * 0.3,
          driftY: config.speed * (0.2 + Math.random() * 0.5),
        };

        stars.push(star);
      }
      this._layers.push({ config, stars });
    }
  }

  /**
   * Animate stars — drift + twinkle. Call in scene.update().
   */
  update(time, delta) {
    if (!this._visible || !this._scene) return;
    const dt = delta / 1000;
    const t = time / 1000;

    for (const layer of this._layers) {
      for (const star of layer.stars) {
        const sf = star._sf;

        // Drift
        star.x += sf.driftX * dt;
        star.y += sf.driftY * dt;

        // Wrap around edges
        if (star.x < -5) star.x = 1925;
        if (star.x > 1925) star.x = -5;
        if (star.y > 1085) {
          star.y = -5;
          star.x = Math.random() * 1920;
        }
        if (star.y < -5) star.y = 1085;

        // Twinkle
        const twinkle = 0.5 + 0.5 * Math.sin(t * sf.twinkleSpeed * Math.PI * 2 + sf.twinklePhase);
        star.setAlpha(sf.baseAlpha * (0.3 + twinkle * 0.7));
      }
    }
  }

  /** Show or hide the starfield */
  setVisible(visible) {
    this._visible = visible;
    if (this._bg) this._bg.setVisible(visible);
    for (const layer of this._layers) {
      for (const star of layer.stars) {
        star.setVisible(visible);
      }
    }
  }

  /** Full cleanup */
  destroy() {
    if (this._bg) { this._bg.destroy(); this._bg = null; }
    for (const layer of this._layers) {
      for (const star of layer.stars) star.destroy();
    }
    this._layers = [];
    this._scene = null;
  }
}
