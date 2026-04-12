// ═══════════════════════════════════════════════════════════
//  KEYBOARD GLOW
//  Complete visual overhaul of the keyboard rendering to match
//  the tekage-ui.jsx reference aesthetic:
//
//  • Gradient antenna lines (transparent → solid color)
//  • Glowing junction dots at antenna/port boundaries
//  • Horizontal row connector bars (fat glow + thin bright)
//  • Below-port extension lines
//  • Rectangular feathered ambient glow at each key center
//  • Radial gradient keypress glow (white core → color → fade)
//  • Key labels (white) + note names (colored)
//
//  All colors are dynamic — read from colors.js at init time
//  so skin editor changes propagate correctly on scene restart.
//
//  This replaces the flat rectangle rendering in MainScene.
//  Call init(scene) to build everything, update() per frame.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import colors, { intToHex } from '../core/colors.js';
import {
  keyGap, PORT_HEIGHT, ANTENNA_HEIGHT, ANTENNA_WIDTH,
  rowYPositions, getKeyboardLayout,
} from '../core/constants.js';
import settings from '../core/settings.js';
import { leftMap, rightMap, isLeftKey } from '../core/keyMapping.js';
import { getNote } from '../audio/noteMap.js';
import { getGlowKey, getJunctionKey, getAmbientKey } from './GlowTextures.js';

const DEPTH_ANTENNA_GLOW = -2;
const DEPTH_ROW_BAR = -1;
const DEPTH_AMBIENT = 0;
const DEPTH_KEY_LABEL = 2;
const DEPTH_JUNCTION = 3;
const DEPTH_PRESS_GLOW = 4;

// Fn keys that are visually on the LEFT side of the keyboard
const FN_LEFT_SET = new Set(['tab', 'shift_l']);
// Fn keys that are visually on the RIGHT side of the keyboard
const FN_RIGHT_SET = new Set(['enter', 'shift_r']);

/**
 * Determine if a key is visually on the left side.
 * Unlike isLeftKey() which checks leftMap membership,
 * this handles fn keys by their physical position.
 */
function isVisuallyLeft(lk, isFn) {
  if (isFn) return FN_LEFT_SET.has(lk);
  return isLeftKey(lk);
}

export class KeyboardGlow {
  constructor() {
    this._scene = null;
    this._glowObjects = {};      // key → { ambient, junction, pressGlow, antennaLine, belowLine }
    this._rowBars = [];          // { gfx } per row
    this._keyLabels = {};        // key → { label, noteLabel }
    this._pressStates = {};      // key → { active, startTime }
  }

  /**
   * Build all visual elements. Call in scene.create() AFTER generating glow textures.
   * @param {Phaser.Scene} scene
   */
  init(scene) {
    this._scene = scene;

    // ── Read dynamic colors ──
    const leftHex = intToHex(colors.left);
    const rightHex = intToHex(colors.right);
    const leftInt = colors.left;
    const rightInt = colors.right;

    // ── Draw row connector bars first (behind everything) ──
    this._drawRowBars(scene, leftInt, rightInt);

    const layout = getKeyboardLayout(settings.advancedMode);

    // ── Build per-key visuals ──
    layout.forEach((row, ri) => {
      let x = row.startX;
      row.keys.forEach((keyData) => {
        let lk;
        if (keyData.key === 'ShiftL') lk = 'shift_l';
        else if (keyData.key === 'ShiftR') lk = 'shift_r';
        else lk = keyData.key.toLowerCase();

        const isGreyed = (lk === 'g' || lk === 'h');
        const noteInfo = isGreyed ? null : getNote(lk);
        const isShiftL = keyData.key === 'ShiftL', isShiftR = keyData.key === 'ShiftR';
        const isShift = isShiftL || isShiftR;
        const isFn = keyData.key === 'Tab' || keyData.key === 'Enter' || isShift;

        const centerX = x + keyData.w / 2;
        const keyY = row.y;
        const portTop = keyY - PORT_HEIGHT / 2;
        const portBottom = keyY + PORT_HEIGHT / 2;
        const antennaTop = portTop - ANTENNA_HEIGHT;

        // ── FIX 2: Use visual-side-aware hand detection ──
        const isLeft = isVisuallyLeft(lk, isFn);
        const hand = isLeft ? 'left' : 'right';

        // Determine colors — dynamic from skin
        let strokeHex, strokeInt;
        if (isGreyed) {
          strokeHex = '#555555';
          strokeInt = 0x555555;
        } else if (isFn) {
          strokeHex = isLeft ? leftHex : rightHex;
          strokeInt = isLeft ? leftInt : rightInt;
        } else if (noteInfo) {
          // Use isLeftKey for note keys (they ARE in leftMap/rightMap)
          const noteIsLeft = isLeftKey(lk);
          strokeHex = noteIsLeft ? leftHex : rightHex;
          strokeInt = noteIsLeft ? leftInt : rightInt;
        } else {
          strokeHex = '#555555';
          strokeInt = 0x555555;
        }

        const hasAntenna = (noteInfo && !isFn) || isFn;
        const objs = {};

        if (hasAntenna && !isGreyed) {
          // ── Antenna gradient line (two-layer: fat dim + thin bright) ──
          const gfx = scene.add.graphics();
          gfx.setDepth(DEPTH_ANTENNA_GLOW);

          // Fat dim glow stroke
          gfx.lineStyle(3, strokeInt, 0.15);
          gfx.lineBetween(centerX, antennaTop - 40, centerX, portTop);

          // Thin bright stroke with gradient-like alpha (draw segments)
          const segments = 20;
          for (let s = 0; s < segments; s++) {
            const t = s / segments;
            const y1 = antennaTop - 40 + t * (ANTENNA_HEIGHT + 40);
            const y2 = antennaTop - 40 + (t + 1 / segments) * (ANTENNA_HEIGHT + 40);
            const alpha = t * t * 0.9; // quadratic fade from transparent to bright
            gfx.lineStyle(1.5, strokeInt, alpha);
            gfx.lineBetween(centerX, y1, centerX, y2);
          }

          objs.antennaGfx = gfx;

          // ── Junction dot (glowing orb at antenna-port boundary) ──
          const jKey = getJunctionKey(hand);
          const junction = scene.add.image(centerX, portTop, jKey);
          junction.setScale(0.5);
          junction.setDepth(DEPTH_JUNCTION);
          junction.setBlendMode(Phaser.BlendModes.ADD);
          junction.setAlpha(0.8);
          objs.junction = junction;

          // ── Below-port extension line ──
          const belowGfx = scene.add.graphics();
          belowGfx.setDepth(DEPTH_ANTENNA_GLOW);
          const belowLen = ANTENNA_HEIGHT * 0.4;
          for (let s = 0; s < 10; s++) {
            const t = s / 10;
            const y1 = portBottom + t * belowLen;
            const y2 = portBottom + (t + 0.1) * belowLen;
            const alpha = (1 - t) * 0.5; // fade out
            belowGfx.lineStyle(2, strokeInt, alpha);
            belowGfx.lineBetween(centerX, y1, centerX, y2);
          }
          objs.belowGfx = belowGfx;

          // ── FIX 3: Rectangular feathered ambient glow ──
          const ambientKey = isGreyed ? getAmbientKey('grey') : getAmbientKey(hand);
          const ambientImg = scene.add.image(centerX, keyY, ambientKey);
          ambientImg.setDepth(DEPTH_AMBIENT);
          ambientImg.setBlendMode(Phaser.BlendModes.ADD);
          ambientImg.setAlpha(0.5);
          objs.ambientImg = ambientImg;

          // ── Horizontal line through key (the "bar" across the key) ──
          const barGfx = scene.add.graphics();
          barGfx.setDepth(DEPTH_ROW_BAR);
          barGfx.lineStyle(2, strokeInt, 0.7);
          barGfx.lineBetween(centerX - 40, keyY, centerX + 40, keyY);
          objs.barGfx = barGfx;
        }

        // ── Key press glow (hidden, revealed on press) ──
        if (!isGreyed) {
          const glowKey = getGlowKey(hand);
          const pressGlow = scene.add.image(centerX, keyY, glowKey);
          pressGlow.setScale(1.25);
          pressGlow.setDepth(DEPTH_PRESS_GLOW);
          pressGlow.setBlendMode(Phaser.BlendModes.ADD);
          pressGlow.setAlpha(0);
          pressGlow.setVisible(false);
          objs.pressGlow = pressGlow;

          // Core glow on press — hand color, small scale
          const coreGlow = scene.add.image(centerX, keyY, glowKey);
          coreGlow.setScale(0.3);
          coreGlow.setDepth(DEPTH_PRESS_GLOW + 1);
          coreGlow.setBlendMode(Phaser.BlendModes.ADD);
          coreGlow.setAlpha(0);
          coreGlow.setVisible(false);
          objs.coreGlow = coreGlow;
        }

        // ── Key labels ──
        let dk;
        if (keyData.key === 'Tab') dk = 'TAB';
        else if (keyData.key === 'Enter') dk = 'ENTE';
        else if (keyData.key === 'ShiftL' || keyData.key === 'ShiftR') dk = 'SHIF';
        else dk = keyData.key.toUpperCase();

        // Dynamic label colors
        const leftLabelHex = leftHex;
        const rightLabelHex = rightHex;

        if (!isGreyed) {
          const label = scene.add.text(centerX, keyY - 2, dk, {
            fontFamily: 'Rajdhani', fontSize: '22px', color: 'rgba(255,255,255,0.7)',
            fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(DEPTH_KEY_LABEL);
          objs.label = label;

          // Note name below
          if (noteInfo && !isFn) {
            const noteName = leftMap[lk] || rightMap[lk] || '';
            // Use isLeftKey for note keys (they are in leftMap/rightMap)
            const noteIsLeft = isLeftKey(lk);
            const noteColorHex = noteIsLeft ? leftHex : rightHex;
            // Parse hex to rgba
            const r = parseInt(noteColorHex.slice(1, 3), 16);
            const g = parseInt(noteColorHex.slice(3, 5), 16);
            const b = parseInt(noteColorHex.slice(5, 7), 16);
            const noteColor = `rgba(${r},${g},${b},0.8)`;
            const noteLabel = scene.add.text(centerX, keyY + 18, noteName, {
              fontFamily: 'Rajdhani', fontSize: '14px', color: noteColor,
              fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(DEPTH_KEY_LABEL);
            objs.noteLabel = noteLabel;
          }

        } else {
          // Grey keys — dimmed label
          scene.add.text(centerX, keyY, dk, {
            fontFamily: 'Rajdhani', fontSize: '20px', color: 'rgba(100,100,100,0.4)',
            fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(DEPTH_KEY_LABEL);
        }

        // Store key geometry in state (needed by other systems)
        const isBlack = noteInfo && noteInfo.includes('#');
        state.keyObjects[lk] = {
          rect: null, // no rectangle anymore — pure glow
          label: objs.label || null,
          nLabel: objs.noteLabel || null,
          fill: isGreyed ? 0x333333 : (isBlack ? 0x1a1a1a : 0xffffff),
          stroke: strokeInt,
          isBlack: !!isBlack,
          isFn,
          centerX, centerY: keyY,
          width: keyData.w, height: PORT_HEIGHT,
          rowIndex: ri,
          antennaTop: portTop - ANTENNA_HEIGHT,
          antennaBottom: portTop,
          portTop, portBottom,
        };

        this._glowObjects[lk] = objs;
        this._pressStates[lk] = { active: false, startTime: 0, flashing: false, flashFadeRate: 2 };

        x += keyData.w + keyGap;
      });
    });
  }

  /**
   * Draw the horizontal row connector bars — one for left-hand keys, one for right.
   * From JSX: fat dim stroke (20px wide, 0.1 alpha) + thin bright (3px, 0.5 alpha).
   * Uses dynamic colors from colors.js.
   */
  _drawRowBars(scene, leftColor, rightColor) {
    const layout = getKeyboardLayout(settings.advancedMode);
    layout.forEach((row) => {
      const leftKeys = [];
      const rightKeys = [];
      let x = row.startX;

      row.keys.forEach((keyData) => {
        let lk;
        if (keyData.key === 'ShiftL') lk = 'shift_l';
        else if (keyData.key === 'ShiftR') lk = 'shift_r';
        else lk = keyData.key.toLowerCase();

        const isFn = keyData.key === 'Tab' || keyData.key === 'Enter' ||
                     keyData.key === 'ShiftL' || keyData.key === 'ShiftR';

        const cx = x + keyData.w / 2;
        const isMapped = isFn || leftMap[lk] !== undefined || rightMap[lk] !== undefined;
        if (lk !== 'g' && lk !== 'h' && isMapped) {
          // Use visual-side-aware classification for row bars too
          if (isVisuallyLeft(lk, isFn)) leftKeys.push(cx);
          else rightKeys.push(cx);
        }
        x += keyData.w + keyGap;
      });

      const ry = row.y;

      // Left-hand connector bar
      if (leftKeys.length >= 2) {
        const x1 = leftKeys[0] - 50;
        const x2 = leftKeys[leftKeys.length - 1] + 50;
        const gfx = scene.add.graphics();
        gfx.setDepth(DEPTH_ROW_BAR);

        // Fat glow stroke — dynamic color
        gfx.lineStyle(20, leftColor, 0.1);
        gfx.lineBetween(x1 + 20, ry, x2 - 20, ry);

        // Thin bright stroke — dynamic color
        gfx.lineStyle(3, leftColor, 0.5);
        gfx.lineBetween(x1, ry, x2, ry);

        this._rowBars.push(gfx);
      }

      // Right-hand connector bar
      if (rightKeys.length >= 2) {
        const x1 = rightKeys[0] - 50;
        const x2 = rightKeys[rightKeys.length - 1] + 50;
        const gfx = scene.add.graphics();
        gfx.setDepth(DEPTH_ROW_BAR);

        // Fat glow stroke — dynamic color
        gfx.lineStyle(20, rightColor, 0.1);
        gfx.lineBetween(x1 + 20, ry, x2 - 20, ry);

        // Thin bright stroke — dynamic color
        gfx.lineStyle(3, rightColor, 0.5);
        gfx.lineBetween(x1, ry, x2, ry);

        this._rowBars.push(gfx);
      }
    });
  }

  /**
   * Trigger keypress glow effect — core only (always fires on any press).
   */
  pressKey(key) {
    const objs = this._glowObjects[key];
    const ps = this._pressStates[key];
    if (!objs || !ps) return;

    ps.active = true;
    ps.startTime = this._scene ? this._scene.time.now : 0;

    if (objs.coreGlow) {
      objs.coreGlow.setVisible(true);
      objs.coreGlow.setAlpha(0.6);
    }
  }

  /**
   * Fire outer glow flash scaled by hit quality. Only called during gameplay.
   * @param {string} key
   * @param {'perfect'|'great'|'good'} quality
   */
  flashAccuracy(key, quality) {
    const objs = this._glowObjects[key];
    const ps = this._pressStates[key];
    if (!objs || !ps || !objs.pressGlow) return;
    // [alpha, scale, fadeRate] — fadeRate controls how long the flash lasts
    // perfect ~600ms, great ~350ms, good ~175ms
    const configs = {
      perfect: [0.95, 2.0, 1.6],
      great:   [0.70, 1.5, 2.0],
      good:    [0.45, 1.1, 2.6],
    };
    const cfg = configs[quality];
    if (!cfg) return;
    const [alpha, scale, fadeRate] = cfg;
    ps.flashing = true;
    ps.flashFadeRate = fadeRate;
    objs.pressGlow.setScale(scale);
    objs.pressGlow.setAlpha(alpha);
    objs.pressGlow.setVisible(true);
  }

  /**
   * Release keypress glow.
   */
  releaseKey(key) {
    const ps = this._pressStates[key];
    if (ps) ps.active = false;
  }

  /**
   * Per-frame update — animate keypress glow fade-in/out.
   */
  update(time, delta) {
    const dt = delta / 1000;
    const t = time / 1000;

    for (const [key, ps] of Object.entries(this._pressStates)) {
      const objs = this._glowObjects[key];
      if (!objs) continue;

      // Core glow — sustains while key held, fades on release
      if (ps.active) {
        if (objs.coreGlow) {
          const target = 0.6;
          const current = objs.coreGlow.alpha;
          objs.coreGlow.setAlpha(Math.min(target, current + dt * 8));
        }
      } else {
        if (objs.coreGlow && objs.coreGlow.alpha > 0) {
          const newAlpha = objs.coreGlow.alpha - dt * 6;
          if (newAlpha <= 0.01) {
            objs.coreGlow.setAlpha(0);
            objs.coreGlow.setVisible(false);
          } else {
            objs.coreGlow.setAlpha(newAlpha);
          }
        }
      }

      // Outer accuracy flash — one-shot, fades at quality-dependent rate
      if (ps.flashing && objs.pressGlow) {
        const newAlpha = objs.pressGlow.alpha - dt * (ps.flashFadeRate || 2);
        if (newAlpha <= 0.01) {
          objs.pressGlow.setAlpha(0);
          objs.pressGlow.setVisible(false);
          objs.pressGlow.setScale(1.25); // reset scale
          ps.flashing = false;
        } else {
          objs.pressGlow.setAlpha(newAlpha);
        }
      }

      // Subtle junction pulse
      if (objs.junction) {
        const pulse = 0.6 + 0.2 * Math.sin(t * 2 + key.charCodeAt(0));
        objs.junction.setAlpha(ps.active ? 1.0 : pulse);
      }
    }
  }

  /** Full cleanup */
  destroy() {
    for (const objs of Object.values(this._glowObjects)) {
      for (const obj of Object.values(objs)) {
        if (obj && typeof obj.destroy === 'function') obj.destroy();
      }
    }
    for (const gfx of this._rowBars) {
      if (gfx) gfx.destroy();
    }
    this._glowObjects = {};
    this._rowBars = [];
    this._pressStates = {};
    this._scene = null;
  }
}
