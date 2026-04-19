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
import colors, { intToHex } from '../core/colors.js';
import skinManager from '../skin/SkinManager.js';
import {
  keyboardLayout, keyGap, PORT_HEIGHT, ANTENNA_HEIGHT, ANTENNA_WIDTH,
  rowYPositions, FALL_SPEED, ANTENNA_BLOCK_WIDTH, MAX_CONCURRENT_NOTES,
} from '../core/constants.js';
import { leftMap, rightMap, fnKeys, isLeftKey } from '../core/keyMapping.js';
import { initAudio, playNote, stopNote } from '../audio/engine.js';
import { getNote } from '../audio/noteMap.js';
import { drawPiano, updateOct, pressKey, releaseKey } from '../ui/piano.js';
import { createScrubber, updateScrubber } from '../ui/scrubber.js';
import { createStatsPanel, updateStatsPanel } from '../ui/statsPanel.js';
import { mxTogglePlay, mxUpdateButtons } from '../musicxml/controls.js';
import { mxUpdateFallingNotes } from '../musicxml/playback.js';
import { mxUpdateKeyboardNotes, mxUpdateShiftBlocks, mxUpdateAutoShift, solverPrepareBlocks } from '../solver/solverVisuals.js';
import { updateGlowEffects } from '../scoring/glowEffect.js';
import { judgeNote, GOOD_WINDOW } from '../scoring/timingJudge.js';
import { notifyAutoSlowHit } from '../musicxml/autoSlowDown.js';
import { midiToNoteName } from '../audio/engine.js';
import { StarfieldBackground } from './StarfieldBackground.js';
import { BackgroundManager } from './BackgroundManager.js';
import { generateGlowTextures, createRowCropMasks } from './GlowTextures.js';
import { KeyboardGlow } from './KeyboardGlow.js';
import { loadNoteTextures } from '../skin/NoteRenderer.js';
import { initGhostPiano } from './GhostPiano.js';
import { PortalRenderer } from './PortalRenderer.js';
import { openAssistTab } from '../ui/moreOverlay.js';

// ── Restart countdown (0.75 s = 3 steps × 250 ms) ──
let _restartPending = false;
function _triggerRestart(scene) {
  if (!state.mxLoaded) return;
  if (_restartPending) return;
  _restartPending = true;

  let count = 3;
  const _lc = intToHex(colors.left);
  const txt = scene.add.text(960, 480, String(count), {
    fontFamily: 'Orbitron', fontSize: '140px', color: _lc,
    fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(200);
  txt.setShadow(0, 0, _lc, 50, false, true);
  txt.setStroke(_lc, 2);

  const step = () => {
    count--;
    if (count > 0) {
      txt.setText(String(count));
      scene.time.delayedCall(250, step);
    } else {
      txt.destroy();
      _restartPending = false;
      if (window.tekageRestart) window.tekageRestart();
    }
  };
  scene.time.delayedCall(250, step);
}

export function create() {
  const s = this;
  state.mxScene = s;

  // ── CLEANUP old managers on scene restart (prevents listener leaks) ──
  if (state._kbGlow) { state._kbGlow.destroy(); state._kbGlow = null; }
  if (state._bgManager) { state._bgManager.destroy(); state._bgManager = null; }
  if (state._portalRenderer) { state._portalRenderer.destroy(); state._portalRenderer = null; }

  // ── GLOW TEXTURES (must be first — KeyboardGlow depends on them) ──
  generateGlowTextures(s);
  state._rowCropMasks = createRowCropMasks(s);

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
  title.setShadow(0, 0, intToHex(colors.left), 30, false, true);
  title.setStroke(intToHex(colors.left), 1.5);
  title.setDepth(20);

  // ── LEFT PANEL: PLAY + BEGINNER buttons ──
  const _makeLBtn = (y, label, color, fn) => {
    const btn = s.add.text(54, y, label, {
      fontFamily: 'Orbitron', fontSize: '15px', color,
      fontStyle: 'bold', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0.5).setDepth(20).setInteractive({ useHandCursor: true });
    btn.setShadow(0, 0, color, 8, false, true);
    btn.setStroke(color, 0.5);
    btn.on('pointerover',  () => btn.setShadow(0, 0, color, 18, false, true));
    btn.on('pointerout',   () => btn.setShadow(0, 0, color, 8,  false, true));
    btn.on('pointerdown',  fn);
    return btn;
  };
  state._btnPlay     = _makeLBtn(460, '▶ PLAY',    intToHex(colors.left), () => {
    if (!state.mxLoaded) {
      window.location.href = '/library.html';
    } else {
      mxTogglePlay();
    }
  });
  state._btnBeginner = _makeLBtn(510, 'BEGINNER',  intToHex(colors.right), () => {
    openAssistTab();
  });
  state._btnRestart = _makeLBtn(560, 'RESTART', intToHex(colors.left), () => _triggerRestart(s));

  // ── Reactive color updates ──
  skinManager.on('colorChange', () => {
    const lc = intToHex(colors.left);
    const rc = intToHex(colors.right);
    title.setShadow(0, 0, lc, 30, false, true);
    title.setStroke(lc, 1.5);
    if (state._btnPlay)     { state._btnPlay.setShadow(0,0,lc,8,false,true);    state._btnPlay.setStroke(lc,0.5);    state._btnPlay.setStyle({color:lc}); }
    if (state._btnBeginner) { state._btnBeginner.setShadow(0,0,rc,8,false,true); state._btnBeginner.setStroke(rc,0.5); state._btnBeginner.setStyle({color:rc}); }
    if (state._btnRestart)  { state._btnRestart.setShadow(0,0,lc,8,false,true); state._btnRestart.setStroke(lc,0.5); state._btnRestart.setStyle({color:lc}); }
  });

  // ── STATS PANEL ──
  createStatsPanel(s);

  // ── No more flat rectangle keyboard here ──
  // KeyboardGlow.init() above already built the visual keyboard
  // AND populated state.keyObjects with the correct geometry.

  drawPiano(s);
  initGhostPiano(s);
  createScrubber(s);

  // ── Re-initialize solver visuals if song was loaded before scene was ready ──
  // (happens when navigating back from library.html — file loads before Phaser boots)
  if (state.mxLoaded && state.solverReady) {
    updateOct(s);
    solverPrepareBlocks(s);
    mxUpdateButtons();
  }

  // ── KEY INPUT ──
  s.input.keyboard.on('keydown', e => {
    let k = e.key.toLowerCase();
    initAudio();

    // Spacebar = MusicXML play/pause
    if (k === ' ') { e.preventDefault(); mxTogglePlay(); return; }

    // Backtick ` = restart with countdown
    if (k === '`') { e.preventDefault(); _triggerRestart(s); return; }

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
      let bestIdx = -1, bestOffset = Infinity;

      if (state.solverReady && state.mxKeyboardNotes.length > 0) {
        // Use solver's key assignments — reliable regardless of current octave
        for (const kn of state.mxKeyboardNotes) {
          if (kn.key !== k) continue;
          if (state.score.hitDetails.has(kn.noteIndex)) continue;
          const offset = Math.abs(state.mxCurTime - kn.startSec);
          if (offset <= GOOD_WINDOW && offset < bestOffset) {
            bestOffset = offset;
            bestIdx = kn.noteIndex;
          }
        }
      } else {
        // Fallback: match by note name
        for (let i = 0; i < state.mxNotes.length; i++) {
          if (state.score.hitDetails.has(i)) continue;
          const mn = state.mxNotes[i];
          if (midiToNoteName(mn.midi) !== note) continue;
          const offset = Math.abs(state.mxCurTime - mn.startSec);
          if (offset <= GOOD_WINDOW && offset < bestOffset) {
            bestOffset = offset;
            bestIdx = i;
          }
        }
      }

      if (bestIdx >= 0) {
        const quality = judgeNote(bestIdx, state.mxCurTime);
        // Mark the falling note as player-hit so auto slow-down releases
        const hitFn = state.mxFallingNotes.find(fn => fn.noteIndex === bestIdx);
        if (hitFn) hitFn.playerHit = true;
        if (state._kbGlow) state._kbGlow.flashAccuracy(k, quality);
        notifyAutoSlowHit(quality);
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
  mxUpdateAutoShift();
  updateScrubber();
  updateStatsPanel();
  updateGlowEffects();
}
