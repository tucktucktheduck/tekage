// ═══════════════════════════════════════════════════════════
//  MAIN SCENE — create()
//  Hub buttons + keyboard (glow aesthetic) + piano + scrubber
//  + input handlers.  Spacebar = MusicXML play/pause
//
//  Visual style: matches tekage-ui.jsx reference —
//  gradient antennas, row connector bars, junction dots,
//  radial keypress glow, dark radial gradient background.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';
import colors from '../core/colors.js';
import {
  keyboardLayout, keyGap, PORT_HEIGHT, ANTENNA_HEIGHT, ANTENNA_WIDTH,
  rowYPositions, FALL_SPEED, ANTENNA_BLOCK_WIDTH, MAX_CONCURRENT_NOTES,
} from '../core/constants.js';
import { leftMap, rightMap, fnKeys, isLeftKey } from '../core/keyMapping.js';
import { initAudio, playNote, stopNote } from '../audio/engine.js';
import { getNote } from '../audio/noteMap.js';
import { drawPiano, updateOct, pressKey, releaseKey } from '../ui/piano.js';
import { createScrubber, updateScrubber } from '../ui/scrubber.js';
import { createHubButtons } from '../ui/hubButtons.js';
import { openMoreOverlay } from '../ui/moreOverlay.js';
import { createStatsPanel, updateStatsPanel } from '../ui/statsPanel.js';
import { mxTogglePlay, mxToggleMute, mxToggleVolSlider, mxToggleSpdSlider, mxShowMusicMap, mxUpdateButtons } from '../musicxml/controls.js';
import { mxUpdateFallingNotes } from '../musicxml/playback.js';
import { mxUpdateKeyboardNotes, mxUpdateShiftBlocks } from '../solver/solverVisuals.js';
import { updateGlowEffects } from '../scoring/glowEffect.js';
import { judgeNote, GOOD_WINDOW } from '../scoring/timingJudge.js';
import { spawnGlow } from '../scoring/glowEffect.js';
import { midiToNoteName } from '../audio/engine.js';
import { StarfieldBackground } from './StarfieldBackground.js';
import { BackgroundManager } from './BackgroundManager.js';
import { generateGlowTextures } from './GlowTextures.js';
import { KeyboardGlow } from './KeyboardGlow.js';
import { loadNoteTextures } from '../skin/NoteRenderer.js';
import { drawNeonPianoOverlay } from './NeonPiano.js';
import { PortalRenderer } from './PortalRenderer.js';

export function create() {
  const s = this;
  state.mxScene = s;

  // ── CLEANUP old managers on scene restart (prevents listener leaks) ──
  if (state._kbGlow) { state._kbGlow.destroy(); state._kbGlow = null; }
  if (state._bgManager) { state._bgManager.destroy(); state._bgManager = null; }
  if (state._portalRenderer) { state._portalRenderer.destroy(); state._portalRenderer = null; }

  // ── GLOW TEXTURES (must be first — KeyboardGlow depends on them) ──
  generateGlowTextures(s);

  // ── BACKGROUND (starfield + custom bg manager) ──
  const starfield = new StarfieldBackground();
  starfield.init(s);
  const bgManager = new BackgroundManager();
  bgManager.init(s, starfield);
  state._bgManager = bgManager;

  // ── KEYBOARD GLOW (replaces flat rectangle keyboard) ──
  const kbGlow = new KeyboardGlow();
  kbGlow.init(s);
  state._kbGlow = kbGlow;

  // ── PORTALS (wall + ceiling with color cycling) ──
  const portalRenderer = new PortalRenderer();
  portalRenderer.init(s);
  state._portalRenderer = portalRenderer;

  // ── LOAD NOTE TEXTURES (async, non-blocking) ──
  loadNoteTextures(s).catch(e => console.warn('[NoteRenderer] texture load failed:', e));

  // ── TITLE ──
  // Match JSX: Orbitron bold, top-right, blue glow + stroke
  const title = s.add.text(1920 - 50, 50, 'TEKAGE', {
    fontFamily: 'Orbitron', fontSize: '64px', color: '#fff',
    fontStyle: 'bold',
  }).setOrigin(1, 0);
  title.setShadow(0, 0, '#3b9eff', 30, false, true);
  title.setStroke('#3b9eff', 1.5);
  title.setDepth(20);

  // ── HUB BUTTONS (Play/Beginner/More) ──
  createHubButtons(s, {
    onUpload: () => document.getElementById('mxFileInput').click(),
    onLibrary: () => { window.location.href = '/library.html'; },
    onBeginner: () => s.scene.start('BeginnerScene'),
    onMore: () => openMoreOverlay(),
  });

  // ── RIGHT BUTTONS (MusicXML controls — hidden until song loaded) ──
  const rightBtnX = 1920 - 50 - 100;
  const btnW = 200, btnH = 55;
  const rightSpacing = btnH + 12;
  const middleRowY = rowYPositions[1];
  const rightStartY = middleRowY - rightSpacing * 2.5;

  function makeRightBtn(idx, label, strokeColor, cb) {
    const y = rightStartY + idx * rightSpacing;
    const btn = s.add.rectangle(rightBtnX, y, btnW, btnH, colors.black).setInteractive();
    btn.setStrokeStyle(3, strokeColor);
    const txt = s.add.text(rightBtnX, y, label, {
      fontFamily: 'Rajdhani', fontSize: '22px', color: '#fff', fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.on('pointerdown', cb);
    return { btn, txt };
  }

  const r1 = makeRightBtn(1, '▶ PLAY', colors.right, () => mxTogglePlay());
  state.btnPlay = r1.btn; state.btnPlayText = r1.txt;
  const r2 = makeRightBtn(2, '🔊 MUTE', colors.left, () => mxToggleMute());
  state.btnMute = r2.btn; state.btnMuteText = r2.txt;
  const r3 = makeRightBtn(3, '🔉 VOLUME', colors.right, () => mxToggleVolSlider());
  state.btnVolume = r3.btn; state.btnVolumeText = r3.txt;
  const r4 = makeRightBtn(4, '🗺 MAP', colors.left, () => { if (state.mxLoaded) mxShowMusicMap(); });
  state.btnMap = r4.btn; state.btnMapText = r4.txt;
  const r5 = makeRightBtn(5, '⏩ SPEED', colors.right, () => mxToggleSpdSlider());
  state.btnSpeed = r5.btn; state.btnSpeedText = r5.txt;
  mxUpdateButtons();

  // ── STATS PANEL ──
  createStatsPanel(s);

  // ── No more flat rectangle keyboard here ──
  // KeyboardGlow.init() above already built the visual keyboard
  // AND populated state.keyObjects with the correct geometry.

  drawPiano(s);
  drawNeonPianoOverlay(s);
  createScrubber(s);

  // ── KEY INPUT ──
  s.input.keyboard.on('keydown', e => {
    let k = e.key.toLowerCase();
    initAudio();

    // Spacebar = MusicXML play/pause
    if (k === ' ') { e.preventDefault(); mxTogglePlay(); return; }

    if (k === 'shift' && e.location === 1) k = 'shift_l';
    if (k === 'shift' && e.location === 2) k = 'shift_r';
    state.physicallyPressedKeys.add(k);

    // First-press start mode
    if (state.mxWaitingForFirstPress && state.mxLoaded) {
      state.mxWaitingForFirstPress = false;
      state.mxPlaying = true;
      state.mxLastTs = null;
      mxUpdateButtons();
    }

    // Octave shifts
    if (k === 'tab') { e.preventDefault(); state.octaveLeft = Math.min(7, state.octaveLeft + 1); updateOct(s); return; }
    if (k === 'shift_l') { state.octaveLeft = Math.max(0, state.octaveLeft - 1); updateOct(s); return; }
    if (k === 'enter') { state.octaveRight = Math.min(7, state.octaveRight + 1); updateOct(s); return; }
    if (k === 'shift_r') { state.octaveRight = Math.max(0, state.octaveRight - 1); updateOct(s); return; }
    // Semitone shifts
    if (k === 'q') { state.semitoneLeft += 1; updateOct(s); return; }
    if (k === 'a') { state.semitoneLeft -= 1; updateOct(s); return; }
    if (k === 'p') { state.semitoneRight += 1; updateOct(s); return; }
    if (k === ';') { state.semitoneRight -= 1; updateOct(s); return; }

    if (e.repeat) return;
    if (!state.keyObjects[k]) return;
    const note = getNote(k);
    if (!note) return;

    const noteName = note.match(/^([A-G]#?)/)[1];
    const isLeftHand = isLeftKey(k);

    state.activeKeys.forEach((activeNote, activeKey) => {
      const activeNoteName = activeNote.match(/^([A-G]#?)/)[1];
      const activeIsLeftHand = isLeftKey(activeKey);
      if (activeNoteName === noteName && activeIsLeftHand === isLeftHand && activeKey !== k) {
        stopNote(activeKey, true);
        state.activeKeys.delete(activeKey);
        releaseKey(activeKey, activeNote, s);
        if (state._kbGlow) state._kbGlow.releaseKey(activeKey);
      }
    });

    state.activeKeys.set(k, note);
    pressKey(k, s);
    playNote(k, note);

    // ── KeyboardGlow keypress visual ──
    if (state._kbGlow) state._kbGlow.pressKey(k);

    // ── TIMING JUDGMENT + GLOW ──
    if (state.mxLoaded && state.mxPlaying) {
      const hand = isLeftHand ? 'left' : 'right';
      let bestIdx = -1, bestOffset = Infinity;
      for (let i = 0; i < state.mxNotes.length; i++) {
        if (state.score.hitDetails.has(i)) continue; // already judged
        const mn = state.mxNotes[i];
        if (midiToNoteName(mn.midi) !== note) continue;
        const offset = Math.abs(state.mxCurTime - mn.startSec);
        if (offset <= GOOD_WINDOW && offset < bestOffset) {
          bestOffset = offset;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        const quality = judgeNote(bestIdx, state.mxCurTime);
        spawnGlow(s, k, hand, quality, bestOffset);
      }
    }
  });

  s.input.keyboard.on('keyup', e => {
    let k = e.key.toLowerCase();
    if (k === ' ') return;
    if (k === 'shift' && e.location === 1) k = 'shift_l';
    if (k === 'shift' && e.location === 2) k = 'shift_r';
    state.physicallyPressedKeys.delete(k);

    // ── KeyboardGlow release visual ──
    if (state._kbGlow) state._kbGlow.releaseKey(k);

    if (fnKeys.has(k)) return;
    if (!state.keyObjects[k]) { if (state.activeAudio.has(k)) stopNote(k, true); return; }
    stopNote(k);
    if (state.activeKeys.has(k)) {
      const note = state.activeKeys.get(k);
      state.activeKeys.delete(k);
      releaseKey(k, note, s);
    }
  });
}

// ── UPDATE ──
export function update(time, delta) {
  // Background animation (starfield drift + video keepalive)
  if (state._bgManager) state._bgManager.update(time, delta);

  // Keyboard glow animations (keypress fade, junction pulse)
  if (state._kbGlow) state._kbGlow.update(time, delta);

  // Portal color cycling animations
  if (state._portalRenderer) state._portalRenderer.update(time, delta);

  mxUpdateFallingNotes(this, delta);
  mxUpdateKeyboardNotes(this, delta);
  mxUpdateShiftBlocks(this, delta);
  updateScrubber();
  updateStatsPanel();
  updateGlowEffects();
}
