// ═══════════════════════════════════════════════════════════
//  SPACE BACKGROUND
//  Procedurally generated deep-space scene:
//    • Seeded PRNG (mulberry32) — different layout each load
//    • 3840×2160 canvas: nebulas, star dust, mid stars, bright stars
//    • Slow diagonal pan across canvas
//
//  Usage (unchanged from original):
//    import { StarfieldBackground } from './StarfieldBackground.js';
//    const starfield = new StarfieldBackground();
//    starfield.init(scene);          // call in create()
//    starfield.update(time, delta);  // call in update()
//    starfield.setVisible(false);    // hide when custom bg active
//    starfield.destroy();            // cleanup
// ═══════════════════════════════════════════════════════════

import { PIANO_LEFT, PIANO_WIDTH } from '../core/constants.js';

const DEPTH = -10;

const CANVAS_W = 3840;
const CANVAS_H = 2160;


// Game interface dimmer bounds — covers keyboard + note fall area.
// Nebulas are visible at left/right margins outside these bounds.
const DIMMER_X = PIANO_LEFT;
const DIMMER_W = PIANO_WIDTH;

const PAN_SPEED = 8; // px/sec in canvas space

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _generate(seed) {
  const rand = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const ctx = c.getContext('2d');

  // ── Base fill ──────────────────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);


  // ── Star dust (2500 tiny stars) ────────────────────────────
  for (let i = 0; i < 2500; i++) {
    const sx = rand() * CANVAS_W;
    const sy = rand() * CANVAS_H;
    const alpha = 0.1 + rand() * 0.2;
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fillRect(sx, sy, 1, 1);
  }

  // ── Mid stars (400 stars) ──────────────────────────────────
  for (let i = 0; i < 400; i++) {
    const sx = rand() * CANVAS_W;
    const sy = rand() * CANVAS_H;
    const size = 0.8 + rand() * 1.0;
    const alpha = 0.4 + rand() * 0.4;
    const isYellow = rand() < 0.3;
    const color = isYellow ? `rgba(255,217,61,${alpha.toFixed(2)})` : `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Bright stars (60 stars with halos) ────────────────────
  for (let i = 0; i < 60; i++) {
    const sx = rand() * CANVAS_W;
    const sy = rand() * CANVAS_H;
    const size = 1.5 + rand() * 1.5;
    const alpha = 0.7 + rand() * 0.3;
    const isYellow = rand() < 0.3;
    const r = isYellow ? 255 : 255;
    const g = isYellow ? 217 : 255;
    const b = isYellow ? 61 : 255;

    // Glow halo
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3);
    halo.addColorStop(0, `rgba(${r},${g},${b},${(alpha * 0.5).toFixed(2)})`);
    halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();

    // Cross-hairs for largest stars
    if (size > 2.5) {
      ctx.strokeStyle = `rgba(${r},${g},${b},${(alpha * 0.4).toFixed(2)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sx - size * 4, sy);
      ctx.lineTo(sx + size * 4, sy);
      ctx.moveTo(sx, sy - size * 4);
      ctx.lineTo(sx, sy + size * 4);
      ctx.stroke();
    }
  }

  return c;
}

export class StarfieldBackground {
  constructor() {
    this._scene = null;
    this._image = null;
    this._scrim = null;  // dark overlay above bg, below game elements
    this._visible = true;
    this._cx = CANVAS_W / 2;
    this._cy = CANVAS_H / 2;
    this._targetCx = CANVAS_W / 2;
    this._targetCy = CANVAS_H / 2;
    this._seed = Date.now() | 0;
    this._elapsed = 0;  // total seconds, for smooth sine rotation
  }

  init(scene) {
    this._scene = scene;

    const texKey = '__space_bg__';
    if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
    const canvas = _generate(this._seed);
    scene.textures.addCanvas(texKey, canvas);

    this._image = scene.add.image(0, 0, texKey);
    this._image.setDepth(DEPTH - 1);
    this._image.setOrigin(0.5, 0.5);

    // Start at center of canvas
    // image.x = 2880 - cx  (where cx is canvas x mapped to screen center 960)
    // image.y = 1620 - cy  (where cy is canvas y mapped to screen center 540)
    this._cx = CANVAS_W / 2;   // 1920
    this._cy = CANVAS_H / 2;   // 1080
    this._image.x = 2880 - this._cx;  // 960 — screen center
    this._image.y = 1620 - this._cy;  // 540 — screen center

    this._pickNewTarget();

    // ── Game interface dimmer (soft vignette) ─────────────────
    // A gradient shadow over the keyboard + note area.
    // Fades to transparent at all edges — no hard lines.
    // Stops before the piano so the piano area is fully undimmed.
    // Depth -10: above bg (-11), below portals (-5) and notes (3+).
    const dimKey = '__space_dimmer__';
    if (scene.textures.exists(dimKey)) scene.textures.remove(dimKey);
    {
      const W = 1920, H = 1080;
      const PIANO_TOP_Y = 1080 - 40 - 140; // matches PIANO_TOP constant (~900)
      const FADE = 320; // px to fade on left/right edges — wide, gradual feather
      const FADE_TOP = 180; // px to fade at top
      const FADE_BOT = 220; // px to fade into piano area at bottom
      const PEAK = 0.50; // max opacity at center — slightly darker now outside is dimmer

      const dc = document.createElement('canvas');
      dc.width = W; dc.height = H;
      const dctx = dc.getContext('2d');

      // Pass 1: draw the full dimmer band with left/right horizontal fade
      const gH = dctx.createLinearGradient(DIMMER_X, 0, DIMMER_X + DIMMER_W, 0);
      gH.addColorStop(0,                    'rgba(0,0,0,0)');
      gH.addColorStop(FADE / DIMMER_W,      `rgba(0,0,0,${PEAK})`);
      gH.addColorStop(1 - FADE / DIMMER_W,  `rgba(0,0,0,${PEAK})`);
      gH.addColorStop(1,                    'rgba(0,0,0,0)');
      dctx.fillStyle = gH;
      dctx.fillRect(DIMMER_X, 0, DIMMER_W, PIANO_TOP_Y);

      // Pass 2 & 3: erase top and bottom edges using destination-out.
      // destination-out subtracts alpha — source alpha=1 fully erases, 0 leaves intact.
      dctx.globalCompositeOperation = 'destination-out';

      // Top erase: fully transparent at y=0, no erase by y=FADE_TOP
      const gT = dctx.createLinearGradient(0, 0, 0, FADE_TOP);
      gT.addColorStop(0, 'rgba(0,0,0,1)');
      gT.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = gT;
      dctx.fillRect(DIMMER_X, 0, DIMMER_W, FADE_TOP);

      // Bottom erase: no erase at (PIANO_TOP_Y - FADE_BOT), fully transparent at PIANO_TOP_Y
      const gB = dctx.createLinearGradient(0, PIANO_TOP_Y - FADE_BOT, 0, PIANO_TOP_Y);
      gB.addColorStop(0, 'rgba(0,0,0,0)');
      gB.addColorStop(1, 'rgba(0,0,0,1)');
      dctx.fillStyle = gB;
      dctx.fillRect(DIMMER_X, PIANO_TOP_Y - FADE_BOT, DIMMER_W, FADE_BOT);

      dctx.globalCompositeOperation = 'source-over';

      scene.textures.addCanvas(dimKey, dc);
    }
    this._scrim = scene.add.image(0, 0, dimKey).setOrigin(0, 0).setDepth(DEPTH);
  }

  _pickNewTarget() {
    // cx = canvas x mapped to screen center; must stay in [960, CANVAS_W-960]
    // With 200px margin: [1160, 2680]; cy similarly with 100px margin
    const minCx = 960 + 200;
    const maxCx = CANVAS_W - 960 - 200;
    const minCy = 540 + 100;
    const maxCy = CANVAS_H - 540 - 100;
    this._targetCx = minCx + Math.random() * (maxCx - minCx);
    this._targetCy = minCy + Math.random() * (maxCy - minCy);
  }

  update(time, delta) {
    if (!this._visible || !this._image) return;
    const dt = delta / 1000;
    this._elapsed += dt;

    // ── Pan toward target ──────────────────────────────────────
    const dx = this._targetCx - this._cx;
    const dy = this._targetCy - this._cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 50) {
      this._pickNewTarget();
    } else {
      const step = PAN_SPEED * dt;
      this._cx += (dx / dist) * step;
      this._cy += (dy / dist) * step;
    }

    this._image.x = 2880 - this._cx;
    this._image.y = 1620 - this._cy;

    // ── Floating rotation: two overlapping sine waves ──────────
    // Primary: ±3° over 90s; secondary: ±1.2° over 47s — drifts
    // without repeating, giving organic float rather than clock tick.
    const rot = (3 * Math.PI / 180) * Math.sin(this._elapsed * 2 * Math.PI / 90)
              + (1.2 * Math.PI / 180) * Math.sin(this._elapsed * 2 * Math.PI / 47);
    this._image.setRotation(rot);
  }

  setVisible(visible) {
    this._visible = visible;
    if (this._image) this._image.setVisible(visible);
    if (this._scrim) this._scrim.setVisible(visible);
  }

  destroy() {
    if (this._image) { this._image.destroy(); this._image = null; }
    if (this._scrim) { this._scrim.destroy(); this._scrim = null; }
    this._scene = null;
  }
}
