import state from '../core/state.js';
import settings from '../core/settings.js';
import colors, { lerpColor, hexToInt } from '../core/colors.js';
import { getTimingGradient } from './timingJudge.js';
import skinManager from '../skin/SkinManager.js';

const GLOW_DURATION = 600;

export function spawnGlow(scene, keyId, hand, quality, timingOffset) {
  if (!settings.earlyLateAnimationOn) return;
  if (quality === 'miss') return;

  const keyObj = state.keyObjects[keyId];
  if (!keyObj) return;

  const cx = keyObj.centerX;
  const bottom = keyObj.portBottom;

  // ── Check for custom hit animation from skin ──
  const animId = quality === 'perfect' ? 'hit_anim_perfect' : quality === 'great' ? 'hit_anim_great' : 'hit_anim_good';
  const animVisual = skinManager.getVisual(animId);
  const patternVisual = skinManager.getVisual('hit_glow_pattern');

  if (animVisual?.type === 'image') {
    // Render custom spritesheet/image animation
    _spawnCustomAnim(scene, cx, bottom, animVisual, quality);
    return;
  }

  // ── Default trapezoid glow (original behavior, with optional pattern overlay) ──
  const glowColorHex = hand === 'left'
    ? (skinManager.getVisual('hit_glow_color_left')?.data ?? null)
    : (skinManager.getVisual('hit_glow_color_right')?.data ?? null);

  const baseColor = glowColorHex ? hexToInt(glowColorHex) : (hand === 'left' ? colors.left : colors.right);
  const gradient = getTimingGradient(timingOffset);
  const glowColor = lerpColor(baseColor, colors.white, gradient);

  const g = scene.add.graphics();
  g.setDepth(15);

  const glowW = keyObj.width * 2.5;
  const glowH = 90;

  const maxLayers = 6;
  const layers = Math.max(1, Math.round(maxLayers * (1 - gradient)));

  for (let l = 1; l <= layers; l++) {
    const t = l / layers;
    const alpha = (1 - t) * 0.5;
    const w = glowW * t;
    const h = glowH * t;
    g.fillStyle(glowColor, alpha);
    g.fillEllipse(cx, bottom + (glowH * 0.25), w, h);
  }

  // Overlay pattern texture if provided by skin
  if (patternVisual?.type === 'image') {
    const tex = scene.textures.get('__hit_glow_pattern__');
    if (tex && tex.key !== '__MISSING') {
      const img = scene.add.image(cx, bottom + glowH * 0.25, '__hit_glow_pattern__');
      img.setDepth(16).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD);
      state.glowEffects.push({ graphics: img, startTime: performance.now(), duration: GLOW_DURATION, isImage: true });
    }
  }

  state.glowEffects.push({
    graphics: g,
    startTime: performance.now(),
    duration: GLOW_DURATION,
  });
}

/** Render a custom spritesheet/image animation for a hit */
function _spawnCustomAnim(scene, cx, bottom, animVisual, quality) {
  const { bitmap, frames = 1, frameDuration = 100 } = animVisual;
  const texKey = `__hit_anim_${quality}__`;

  // Ensure texture is loaded into Phaser
  if (!scene.textures.exists(texKey)) {
    scene.textures.addImage(texKey, bitmap);
    if (frames > 1) {
      scene.textures.get(texKey).add('__base', 0, 0, 0, bitmap.width, bitmap.height);
    }
  }

  if (frames > 1) {
    // Animated sprite — create or reuse animation
    const animKey = `${texKey}_anim`;
    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(texKey, { start: 0, end: frames - 1 }),
        frameRate: Math.round(1000 / frameDuration),
        repeat: 0,
      });
    }
    const sprite = scene.add.sprite(cx, bottom, texKey).play(animKey);
    sprite.setDepth(16);
    const duration = frames * frameDuration;
    state.glowEffects.push({ graphics: sprite, startTime: performance.now(), duration, isSprite: true });
  } else {
    const img = scene.add.image(cx, bottom, texKey);
    img.setDepth(16);
    state.glowEffects.push({ graphics: img, startTime: performance.now(), duration: GLOW_DURATION, isImage: true });
  }
}

export function updateGlowEffects() {
  const now = performance.now();
  for (let i = state.glowEffects.length - 1; i >= 0; i--) {
    const glow = state.glowEffects[i];
    const elapsed = now - glow.startTime;
    const progress = elapsed / glow.duration;
    if (progress >= 1) {
      glow.graphics.destroy();
      state.glowEffects.splice(i, 1);
    } else {
      const alpha = Math.pow(1 - progress, 1.5);
      glow.graphics.setAlpha(alpha);
    }
  }
}
