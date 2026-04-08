// ═══════════════════════════════════════════════════════════
//  PORTAL RENDERER
//  Wall portal (right edge) + Ceiling portal (top-center).
//  Matches tekage-ui.jsx reference:
//    • Dark frame with horizontal dividers
//    • 6 vertical neon lines (wall) / 2 horizontal neon lines (ceil)
//    • 40-frame color cycle: blue→off→orange→off
//    • Trapezoid projection glow on hover
//    • Rotating word label on wall portal
//    • "PLAY" label on ceiling portal
//    • Click wall portal → openMoreOverlay()
//
//  Usage:
//    const portal = new PortalRenderer();
//    portal.init(scene);
//    portal.update(time, delta);
//    portal.destroy();
// ═══════════════════════════════════════════════════════════

import colors from '../core/colors.js';
import { openMoreOverlay } from '../ui/moreOverlay.js';

// ── Dimensions (from JSX) ──
const W = 1920, H = 1080;

// Wall portal
const WFW = 45;                        // frame width
const WFH = 520;                       // frame height
const WFY = (H - WFH) / 2 + 20;       // top Y = 300
const WF_RIGHT = W;                    // right edge
const WF_LEFT = W - WFW;              // left edge = 1875

// Ceiling portal
const CP_W = 172;
const CP_H = 15;
const CP_CX = 160;                     // center X
const CP_L = CP_CX - CP_W / 2;        // left = 74
const CP_R = CP_CX + CP_W / 2;        // right = 246

// Word rotation
const WORDS = ['BEGINNER', 'SAMPLE', 'STUKAGE', 'CHALLENGES', 'SETTINGS', 'LIBRARY'];
const WORD_INTERVAL = 4000;            // ms between word changes

// Portal depth (above background, below keyboard)
const DEPTH_PORTAL_BG = -5;
const DEPTH_PORTAL_GFX = -4;
const DEPTH_PORTAL_TEXT = -3;

// ── Color cycle (port of JSX gc(t)) ──
function gc(t) {
  const p = ((t % 40) + 40) % 40;
  if (p < 8) {
    const q = p / 8;
    let i;
    if (q < 0.15) i = q / 0.15;
    else if (q > 0.85) i = (1 - q) / 0.15;
    else i = 1;
    return { c: 'blue', i };
  } else if (p < 20) {
    return { c: 'off', i: 0 };
  } else if (p < 28) {
    const q = (p - 20) / 8;
    let i;
    if (q < 0.15) i = q / 0.15;
    else if (q > 0.85) i = (1 - q) / 0.15;
    else i = 1;
    return { c: 'orange', i };
  } else {
    return { c: 'off', i: 0 };
  }
}

function lp(a, b, t) { return a + (b - a) * t; }

/** Convert color name + intensity to [r,g,b] */
function gRGB(c, i) {
  if (c === 'blue') {
    return [
      Math.round(lp(15, 59, i)),
      Math.round(lp(15, 158, i)),
      Math.round(lp(15, 255, i)),
    ];
  }
  if (c === 'orange') {
    return [
      Math.round(lp(15, 255, i)),
      Math.round(lp(15, 140, i)),
      Math.round(lp(15, 15, i)),
    ];
  }
  return [15, 15, 15];
}

/** Convert [r,g,b] to Phaser color int */
function rgbToInt(rgb) { return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]; }

export class PortalRenderer {
  constructor() {
    this._scene = null;
    this._frameTime = 0;

    // Wall portal objects
    this._wallBg = null;         // rectangle for dark frame
    this._wallGfx = null;        // graphics for neon lines + trapezoid
    this._wallDividers = null;   // graphics for static dividers
    this._wallHitArea = null;    // interactive zone
    this._wallText = null;       // word label
    this._wallHover = 0;         // 0..1 hover interpolation
    this._wallIsHover = false;
    this._wallLockedColor = null;
    this._wallLockedIntensity = 0;
    this._wallWordIdx = 0;
    this._wallWordTime = 0;

    // Ceiling portal objects
    this._ceilBg = null;
    this._ceilGfx = null;
    this._ceilDividers = null;
    this._ceilHitArea = null;
    this._ceilText = null;
    this._ceilHover = 0;
    this._ceilIsHover = false;
    this._ceilLockedColor = null;
    this._ceilLockedIntensity = 0;
  }

  /**
   * Create all portal elements. Call in scene.create().
   * @param {Phaser.Scene} scene
   */
  init(scene) {
    this._scene = scene;

    // ════════ WALL PORTAL ════════

    // Dark frame background
    this._wallBg = scene.add.graphics();
    this._wallBg.setDepth(DEPTH_PORTAL_BG);
    this._drawWallFrame(this._wallBg);

    // Animated neon lines + trapezoid (redrawn each frame)
    this._wallGfx = scene.add.graphics();
    this._wallGfx.setDepth(DEPTH_PORTAL_GFX);

    // Word label (rotated 90°)
    this._wallText = scene.add.text(0, 0, WORDS[0], {
      fontFamily: 'Orbitron', fontSize: '24px', color: '#3b9eff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH_PORTAL_TEXT).setAlpha(0);

    // Hit area for wall portal
    this._wallHitArea = scene.add.rectangle(
      WF_LEFT + WFW / 2, WFY + WFH / 2, WFW + 60, WFH + 40, 0x000000, 0
    ).setInteractive();
    this._wallHitArea.setDepth(DEPTH_PORTAL_GFX);
    this._wallHitArea.on('pointerover', () => { this._wallIsHover = true; });
    this._wallHitArea.on('pointerout', () => {
      this._wallIsHover = false;
      this._wallLockedColor = null;
      this._wallLockedIntensity = 0;
    });
    this._wallHitArea.on('pointerdown', () => {
      openMoreOverlay();
    });

    // ════════ CEILING PORTAL ════════

    // Dark frame background
    this._ceilBg = scene.add.graphics();
    this._ceilBg.setDepth(DEPTH_PORTAL_BG);
    this._drawCeilFrame(this._ceilBg);

    // Animated neon lines + trapezoid (redrawn each frame)
    this._ceilGfx = scene.add.graphics();
    this._ceilGfx.setDepth(DEPTH_PORTAL_GFX);

    // "PLAY" label
    this._ceilText = scene.add.text(CP_CX, CP_H + 40, 'PLAY', {
      fontFamily: 'Orbitron', fontSize: '24px', color: '#3b9eff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH_PORTAL_TEXT).setAlpha(0);

    // Hit area for ceiling portal
    this._ceilHitArea = scene.add.rectangle(
      CP_CX, CP_H / 2, CP_W + 40, CP_H + 60, 0x000000, 0
    ).setInteractive();
    this._ceilHitArea.setDepth(DEPTH_PORTAL_GFX);
    this._ceilHitArea.on('pointerover', () => { this._ceilIsHover = true; });
    this._ceilHitArea.on('pointerout', () => {
      this._ceilIsHover = false;
      this._ceilLockedColor = null;
      this._ceilLockedIntensity = 0;
    });
    this._ceilHitArea.on('pointerdown', () => {
      console.log('[Portal] PLAY');
    });
  }

  /**
   * Draw the static dark frame for the wall portal.
   */
  _drawWallFrame(gfx) {
    const fL = WF_LEFT, fR = WF_RIGHT;

    // Main dark rectangle
    gfx.fillStyle(0x2e2e33, 1);
    gfx.fillRect(fL, WFY, WFW, WFH);

    // Border
    gfx.lineStyle(2, 0x131316, 1);
    gfx.strokeRect(fL, WFY, WFW, WFH);

    // Top divider
    gfx.fillStyle(0x3c3c42, 1);
    gfx.fillRect(fL, WFY, WFW - 10, 14);

    // Bottom divider
    gfx.fillRect(fL, WFY + WFH - 14, WFW - 10, 14);

    // Middle divider
    const my = WFY + WFH / 2 - 7;
    gfx.fillRect(fL, my, WFW - 10, 14);
  }

  /**
   * Draw the static dark frame for the ceiling portal.
   */
  _drawCeilFrame(gfx) {
    // Main dark rectangle
    gfx.fillStyle(0x2e2e33, 1);
    gfx.fillRect(CP_L, 0, CP_W, CP_H);

    // Border
    gfx.lineStyle(1.5, 0x131316, 1);
    gfx.strokeRect(CP_L, 0, CP_W, CP_H);

    // Center divider
    gfx.fillStyle(0x3c3c42, 1);
    gfx.fillRect(CP_CX - 3, 0, 6, CP_H);
  }

  /**
   * Per-frame update — animate color cycling, neon lines, trapezoids, labels.
   * @param {number} time - scene time in ms
   * @param {number} delta - delta in ms
   */
  update(time, delta) {
    if (!this._scene) return;
    const dt = delta / 1000;
    this._frameTime += dt * 8; // ~8 frames per second for the 40-frame cycle

    // ── Color cycle ──
    const wallCycle = gc(this._frameTime);
    const ceilCycle = gc(this._frameTime + 14); // offset by 14 frames

    // Track last non-off color for hover lock
    if (wallCycle.c !== 'off') this._lastColor = wallCycle.c;

    // ══ WALL PORTAL ══
    this._wallHover = Phaser.Math.Clamp(
      this._wallHover + (this._wallIsHover ? dt * 4 : -dt * 4), 0, 1
    );

    // Hover lock: freeze color while hovering
    let wColor, wIntensity;
    if (this._wallIsHover && !this._wallLockedColor) {
      this._wallLockedColor = wallCycle.c !== 'off' ? wallCycle.c : (this._lastColor || 'blue');
      this._wallLockedIntensity = wallCycle.i;
    }
    if (this._wallIsHover && this._wallLockedColor) {
      wColor = this._wallLockedColor;
      this._wallLockedIntensity = Math.min(1, this._wallLockedIntensity + dt * 3);
      wIntensity = this._wallLockedIntensity;
    } else {
      wColor = wallCycle.c;
      wIntensity = wallCycle.i;
    }

    this._drawWallNeonLines(wColor, wIntensity, this._wallHover);

    // Word rotation
    this._wallWordTime += delta;
    if (this._wallWordTime > WORD_INTERVAL) {
      this._wallWordTime = 0;
      this._wallWordIdx = (this._wallWordIdx + 1) % WORDS.length;
    }
    this._updateWallText(wColor, wIntensity, this._wallHover);

    // ══ CEILING PORTAL ══
    this._ceilHover = Phaser.Math.Clamp(
      this._ceilHover + (this._ceilIsHover ? dt * 4 : -dt * 4), 0, 1
    );

    let cColor, cIntensity;
    if (this._ceilIsHover && !this._ceilLockedColor) {
      this._ceilLockedColor = ceilCycle.c !== 'off' ? ceilCycle.c : (this._lastColor || 'blue');
      this._ceilLockedIntensity = ceilCycle.i;
    }
    if (this._ceilIsHover && this._ceilLockedColor) {
      cColor = this._ceilLockedColor;
      this._ceilLockedIntensity = Math.min(1, this._ceilLockedIntensity + dt * 3);
      cIntensity = this._ceilLockedIntensity;
    } else {
      cColor = ceilCycle.c;
      cIntensity = ceilCycle.i;
    }

    this._drawCeilNeonLines(cColor, cIntensity, this._ceilHover);
    this._updateCeilText(cColor, cIntensity, this._ceilHover);
  }

  /**
   * Draw the animated wall portal neon lines and trapezoid glow.
   */
  _drawWallNeonLines(colorName, intensity, hover) {
    const gfx = this._wallGfx;
    gfx.clear();

    const fL = WF_LEFT, fR = WF_RIGHT;
    const lL = fL + 4, lR = fR - 12, lW = lR - lL;
    const my = WFY + WFH / 2 - 7;
    const on = intensity > 0.05;

    const rgb = gRGB(colorName, intensity);
    const color = rgbToInt(rgb);

    // 6 vertical neon lines
    for (let i = 0; i < 6; i++) {
      const lx = lL + (i + 0.5) * (lW / 6);

      if (on) {
        // Fat glow
        gfx.lineStyle(4, color, Math.min(0.3, intensity * 0.4));
        gfx.lineBetween(lx, WFY + 18, lx, my);
        gfx.lineBetween(lx, my + 14, lx, WFY + WFH - 18);

        // Thin bright
        gfx.lineStyle(2, color, Math.min(1, intensity * 1.3));
        gfx.lineBetween(lx, WFY + 18, lx, my);
        gfx.lineBetween(lx, my + 14, lx, WFY + WFH - 18);
      } else {
        // Dim off lines
        gfx.lineStyle(2, 0x2a2a30, 0.4);
        gfx.lineBetween(lx, WFY + 18, lx, my);
        gfx.lineBetween(lx, my + 14, lx, WFY + WFH - 18);
      }
    }

    // Trapezoid projection glow
    if (on) {
      const td = lp(100, 220, hover) * intensity;
      const te = WFH * 0.15;

      // Draw trapezoid as a series of vertical gradient lines
      // (Phaser Graphics doesn't have native gradient fill for shapes,
      // so we approximate with multiple lines of decreasing alpha)
      const steps = 20;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const xPos = fL - t * td;
        // Interpolate top/bottom Y for trapezoid shape
        const topY = WFY - t * te;
        const botY = WFY + WFH + t * te;

        // Alpha fades from 0.4*intensity to 0 across the trapezoid depth
        let alpha;
        if (t < 0.3) alpha = lp(0.4 * intensity, 0.15 * intensity, t / 0.3);
        else alpha = lp(0.15 * intensity, 0, (t - 0.3) / 0.7);

        gfx.lineStyle(td / steps + 1, color, alpha);
        gfx.lineBetween(xPos, topY, xPos, botY);
      }
    }
  }

  /**
   * Update wall portal word label.
   */
  _updateWallText(colorName, intensity, hover) {
    const txt = this._wallText;
    if (!txt) return;

    const on = intensity > 0.2;
    if (on && hover > 0) {
      const rgb = gRGB(colorName, intensity);
      const hexColor = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');

      txt.setStyle({
        fontFamily: 'Orbitron',
        fontSize: `${Math.round(lp(22, 32, hover))}px`,
        color: hexColor,
        fontStyle: 'bold',
      });
      txt.setText(WORDS[this._wallWordIdx]);
      txt.setAlpha(Math.min(1, (intensity - 0.2) * 2));

      // Position: rotated 90° left of the portal
      const xPos = WF_LEFT - lp(40, 80, hover);
      const yPos = WFY + WFH / 2;
      txt.setPosition(xPos, yPos);
      txt.setRotation(Math.PI / 2);
      txt.setVisible(true);
    } else {
      txt.setVisible(false);
      txt.setAlpha(0);
    }
  }

  /**
   * Draw the animated ceiling portal neon lines and trapezoid glow.
   */
  _drawCeilNeonLines(colorName, intensity, hover) {
    const gfx = this._ceilGfx;
    gfx.clear();

    const on = intensity > 0.05;
    const rgb = gRGB(colorName, intensity);
    const color = rgbToInt(rgb);

    // 2 horizontal neon lines (at 35% and 70% of portal height)
    for (const ny of [CP_H * 0.35, CP_H * 0.7]) {
      if (on) {
        // Fat glow
        gfx.lineStyle(3, color, Math.min(0.3, intensity * 0.4));
        gfx.lineBetween(CP_L + 8, ny, CP_CX - 4, ny);   // left segment
        gfx.lineBetween(CP_CX + 4, ny, CP_R - 8, ny);    // right segment

        // Thin bright
        gfx.lineStyle(1.5, color, Math.min(1, intensity * 1.3));
        gfx.lineBetween(CP_L + 8, ny, CP_CX - 4, ny);
        gfx.lineBetween(CP_CX + 4, ny, CP_R - 8, ny);
      }
    }

    // Trapezoid downward projection
    if (on) {
      const td = lp(35, 75, hover) * intensity;
      const te = CP_W * 0.12;

      // Approximate gradient trapezoid with horizontal lines of decreasing alpha
      const steps = 15;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const yPos = CP_H + t * td;
        // Interpolate width: wider at bottom
        const halfW = CP_W / 2 + t * te;
        const xL = CP_CX - halfW;
        const xR = CP_CX + halfW;

        let alpha;
        if (t < 0.5) alpha = lp(0.4 * intensity, 0.08 * intensity, t / 0.5);
        else alpha = lp(0.08 * intensity, 0, (t - 0.5) / 0.5);

        gfx.lineStyle(td / steps + 1, color, alpha);
        gfx.lineBetween(xL, yPos, xR, yPos);
      }
    }
  }

  /**
   * Update ceiling portal text label.
   */
  _updateCeilText(colorName, intensity, hover) {
    const txt = this._ceilText;
    if (!txt) return;

    const on = intensity > 0.2;
    if (on) {
      const rgb = gRGB(colorName, intensity);
      const hexColor = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');

      txt.setStyle({
        fontFamily: 'Orbitron',
        fontSize: `${Math.round(lp(22, 32, hover))}px`,
        color: hexColor,
        fontStyle: 'bold',
      });
      txt.setText('PLAY');
      txt.setAlpha(Math.min(1, (intensity - 0.2) * 2));
      txt.setPosition(CP_CX, CP_H + lp(28, 55, hover));
      txt.setVisible(true);
    } else {
      txt.setVisible(false);
      txt.setAlpha(0);
    }
  }

  /** Full cleanup */
  destroy() {
    if (this._wallBg) { this._wallBg.destroy(); this._wallBg = null; }
    if (this._wallGfx) { this._wallGfx.destroy(); this._wallGfx = null; }
    if (this._wallText) { this._wallText.destroy(); this._wallText = null; }
    if (this._wallHitArea) { this._wallHitArea.destroy(); this._wallHitArea = null; }
    if (this._wallDividers) { this._wallDividers.destroy(); this._wallDividers = null; }
    if (this._ceilBg) { this._ceilBg.destroy(); this._ceilBg = null; }
    if (this._ceilGfx) { this._ceilGfx.destroy(); this._ceilGfx = null; }
    if (this._ceilText) { this._ceilText.destroy(); this._ceilText = null; }
    if (this._ceilHitArea) { this._ceilHitArea.destroy(); this._ceilHitArea = null; }
    if (this._ceilDividers) { this._ceilDividers.destroy(); this._ceilDividers = null; }
    this._scene = null;
  }
}
