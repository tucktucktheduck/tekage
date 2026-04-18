// ═══════════════════════════════════════════════════════════
//  BEGINNER SCENE
//  Renders the full Tekage-4 keyboard (KeyboardGlow), piano,
//  and scrubber — identical visual setup to MainScene.
//  Mode selection is handled by the DOM overlay (#beginnerOverlay).
//  When state.beginnerMode is set, launchMode() delegates to the
//  appropriate module in beginner/.
// ═══════════════════════════════════════════════════════════

import Phaser from 'phaser';
import state, { resetBeginnerState } from '../core/state.js';
import { generateGlowTextures, createRowCropMasks } from './GlowTextures.js';
import { StarfieldBackground } from './StarfieldBackground.js';
import { BackgroundManager } from './BackgroundManager.js';
import { KeyboardGlow } from './KeyboardGlow.js';
import { loadNoteTextures } from '../skin/NoteRenderer.js';
import { drawPiano, updateOct } from '../ui/piano.js';
import { initGhostPiano } from './GhostPiano.js';
import { createScrubber } from '../ui/scrubber.js';
import { showBeginnerOverlay, showBegHud, hideBegHud } from '../ui/beginnerOverlay.js';
import { solverPrepareBlocks } from '../solver/solverVisuals.js';

export default class BeginnerScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BeginnerScene' });
    this.activeMode = null;
    this._updateHandler = null;
    this._keydownHandler = null;
    this._keyupHandler = null;
  }

  create() {
    // ── Clean slate ──
    resetBeginnerState();
    this.activeMode = null;

    // ── Cleanup old manager refs ──
    if (state._kbGlow)  { state._kbGlow.destroy();  state._kbGlow  = null; }
    if (state._bgManager) { state._bgManager.destroy(); state._bgManager = null; }

    // ── Glow textures ──
    generateGlowTextures(this);
    state._rowCropMasks = createRowCropMasks(this);

    // ── Background ──
    const starfield = new StarfieldBackground();
    starfield.init(this);
    const bgManager = new BackgroundManager();
    bgManager.init(this, starfield);
    state._bgManager = bgManager;

    // ── Keyboard ──
    const kbGlow = new KeyboardGlow();
    kbGlow.init(this);
    state._kbGlow = kbGlow;

    // ── Note textures (async) ──
    loadNoteTextures(this).catch(e => console.warn('[NoteRenderer] texture load failed:', e));

    // ── Piano + scrubber ──
    drawPiano(this);
    initGhostPiano(this);
    createScrubber(this);

    // ── Set scene reference ──
    state.mxScene = this;

    // ── Shutdown cleanup ──
    this.events.once('shutdown', () => {
      this.cleanupMode();
      hideBegHud();
      if (state._kbGlow)    { state._kbGlow.destroy();    state._kbGlow    = null; }
      if (state._bgManager) { state._bgManager.destroy(); state._bgManager = null; }
    });

    // ── Launch mode if already set, otherwise show overlay ──
    if (state.beginnerMode) {
      this.launchMode(state.beginnerMode);
    } else {
      showBeginnerOverlay();
    }
  }

  update(time, delta) {
    if (state._bgManager) state._bgManager.update(time, delta);
    if (state._kbGlow)    state._kbGlow.update(time, delta);
  }

  /** Remove event listeners that active mode may have attached */
  cleanupMode() {
    if (this._updateHandler) {
      this.events.off('update', this._updateHandler);
      this._updateHandler = null;
    }
    if (this._keydownHandler) {
      this.input.keyboard.off('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._keyupHandler) {
      this.input.keyboard.off('keyup', this._keyupHandler);
      this._keyupHandler = null;
    }
    this.activeMode = null;
  }

  async launchMode(modeKey) {
    this.cleanupMode();

    // Clear mode-specific playback state without touching keyboard/piano/scrubber refs
    state.activeKeys.clear();
    state.physicallyPressedKeys.clear();
    state.fallingNotes = [];
    state.mxFallingNotes = [];
    state.mxPlayed.clear();
    state.mxShiftBlocks = [];
    state.mxShiftPlayed.clear();
    state.mxKeyboardNotes = [];
    state.mxKeyboardPlayed.clear();
    state.glowEffects = [];
    state.mxLastTs = null;
    state.mxPlaying = false;
    state.isPlaying = false;
    state.mxScene = this;

    // Re-prepare solver blocks since we just cleared them
    if (state.mxLoaded && state.solverReady) {
      updateOct(this);
      solverPrepareBlocks(this);
    }

    this.activeMode = modeKey;
    state.beginnerMode = modeKey;
    showBegHud(modeKey);

    switch (modeKey) {
      case 'singleRowMode': {
        const { startSingleRowMode } = await import('../beginner/singleRowMode.js');
        startSingleRowMode(this);
        break;
      }
      case 'playRandomNotes': {
        const { startPlayRandomNotes } = await import('../beginner/playRandomNotes.js');
        startPlayRandomNotes(this);
        break;
      }
      case 'oneHandMode': {
        const { startOneHandMode } = await import('../beginner/oneHandMode.js');
        startOneHandMode(this);
        break;
      }
      case 'practiceShifting': {
        const { startPracticeShifting } = await import('../beginner/practiceShifting.js');
        startPracticeShifting(this);
        break;
      }
    }
  }
}
