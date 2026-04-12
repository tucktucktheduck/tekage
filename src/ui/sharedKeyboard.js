// ═══════════════════════════════════════════════════════════
//  SHARED KEYBOARD + PIANO DRAWING
//  Extracted from MainScene so Beginner modes can reuse it.
//
//  FIX: wireKeyboardInput stores handler refs on scene so
//       BeginnerScene.cleanupMode() can remove them.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import colors from '../core/colors.js';
import { getKeyboardLayout, keyGap, PORT_HEIGHT, ANTENNA_HEIGHT, ANTENNA_WIDTH } from '../core/constants.js';
import settings from '../core/settings.js';
import { leftMap, rightMap, fnKeys, isLeftKey } from '../core/keyMapping.js';
import { getNote } from '../audio/noteMap.js';
import { drawPiano, updateOct } from '../ui/piano.js';
import { createScrubber } from '../ui/scrubber.js';

/**
 * Draw the full keyboard layout + piano + scrubber into a scene.
 * Sets up state.keyObjects and all visual elements.
 */
export function drawFullKeyboard(scene) {
  // Clear any existing keyObjects
  state.keyObjects = {};
  state.pianoKeys = [];
  state.pianoNoteMap = {};

  const keyboardLayout = getKeyboardLayout(settings.advancedMode);
  keyboardLayout.forEach((row, ri) => {
    let x = row.startX;
    row.keys.forEach((keyData) => {
      let lk;
      if (keyData.key === 'ShiftL') lk = 'shift_l';
      else if (keyData.key === 'ShiftR') lk = 'shift_r';
      else lk = keyData.key.toLowerCase();

      let dk;
      if (keyData.key === 'Tab') dk = 'TAB';
      else if (keyData.key === 'Enter') dk = 'ENTE';
      else if (keyData.key === 'ShiftL' || keyData.key === 'ShiftR') dk = 'SHIF';
      else dk = keyData.key.toUpperCase();

      const isGreyed = (lk === 'g' || lk === 'h');
      const noteInfo = isGreyed ? null : getNote(lk);
      const isShiftL = keyData.key === 'ShiftL', isShiftR = keyData.key === 'ShiftR';
      const isShift = isShiftL || isShiftR;
      const isFn = keyData.key === 'Tab' || keyData.key === 'Enter' || isShift;

      let fill = colors.grayDark, stroke = colors.gray, isBlack = noteInfo && noteInfo.includes('#');
      const keyY = row.y, portTop = keyY - PORT_HEIGHT / 2, portBottom = keyY + PORT_HEIGHT / 2;

      if (noteInfo && !isFn) {
        fill = isBlack ? colors.grayDark : colors.white;
        stroke = isLeftKey(lk) ? colors.left : colors.right;
        scene.add.rectangle(x + keyData.w / 2, (portTop - ANTENNA_HEIGHT + portTop) / 2, ANTENNA_WIDTH, ANTENNA_HEIGHT, stroke, 0.4).setDepth(0);
      }
      if (isFn) {
        if (keyData.key === 'Tab' || lk === 'q' || lk === 'a' || isShiftL) stroke = colors.left;
        else if (keyData.key === 'Enter' || lk === 'p' || lk === ';' || isShiftR) stroke = colors.right;
        scene.add.rectangle(x + keyData.w / 2, (portTop - ANTENNA_HEIGHT + portTop) / 2, ANTENNA_WIDTH, ANTENNA_HEIGHT, stroke, 0.4).setDepth(0);
      }

      const rect = scene.add.rectangle(x + keyData.w / 2, keyY, keyData.w - 6, PORT_HEIGHT - 6, fill);
      rect.setStrokeStyle(4, stroke);
      const lc = fill === colors.white ? '#000' : '#fff';
      const label = scene.add.text(x + keyData.w / 2, keyY - 12, dk, { fontFamily: 'Rajdhani', fontSize: '16px', color: lc, fontStyle: 'bold' }).setOrigin(0.5);

      let nLabel = null;
      if (noteInfo && !isFn) {
        const noteName = leftMap[lk] || rightMap[lk] || '';
        nLabel = scene.add.text(x + keyData.w / 2, keyY + 14, noteName, {
          fontFamily: 'Rajdhani', fontSize: '14px', color: isBlack ? '#60a5fa' : '#3b82f6', fontStyle: 'bold',
        }).setOrigin(0.5);
      }

      state.keyObjects[lk] = {
        rect, label, nLabel, fill, stroke, isBlack, isFn,
        centerX: x + keyData.w / 2, centerY: keyY, width: keyData.w, height: PORT_HEIGHT, rowIndex: ri,
        antennaTop: portTop - ANTENNA_HEIGHT, antennaBottom: portTop, portTop, portBottom,
      };
      x += keyData.w + keyGap;
    });
  });

  drawPiano(scene);
  createScrubber(scene);
}

/**
 * Wire up standard keyboard input handlers for a scene.
 * Handles octave/semitone shifts and note playing.
 *
 * FIX: Stores handler references on scene._keydownHandler and
 *      scene._keyupHandler so BeginnerScene can remove them.
 */
export function wireKeyboardInput(scene, opts = {}) {
  const { initAudio, playNote, stopNote } = opts.audio || {};
  const { mxTogglePlay, mxUpdateButtons } = opts.controls || {};

  function onKeyDown(e) {
    let k = e.key.toLowerCase();
    if (initAudio) initAudio();

    if (k === ' ' && mxTogglePlay) { e.preventDefault(); mxTogglePlay(); return; }

    if (k === 'shift' && e.location === 1) k = 'shift_l';
    if (k === 'shift' && e.location === 2) k = 'shift_r';
    state.physicallyPressedKeys.add(k);

    if (state.mxWaitingForFirstPress && state.mxLoaded) {
      state.mxWaitingForFirstPress = false;
      state.mxPlaying = true;
      state.mxLastTs = null;
      if (mxUpdateButtons) mxUpdateButtons();
    }

    if (k === 'tab') { e.preventDefault(); state.octaveLeft = Math.min(7, state.octaveLeft + 1); updateOct(scene); return; }
    if (k === 'shift_l') { state.octaveLeft = Math.max(0, state.octaveLeft - 1); updateOct(scene); return; }
    if (k === 'enter') { state.octaveRight = Math.min(7, state.octaveRight + 1); updateOct(scene); return; }
    if (k === 'shift_r') { state.octaveRight = Math.max(0, state.octaveRight - 1); updateOct(scene); return; }

    if (e.repeat) return;
    if (!state.keyObjects[k]) return;
    const note = getNote(k);
    if (!note || !playNote) return;

    const { pressKey, releaseKey } = opts.piano || {};
    const noteName = note.match(/^([A-G]#?)/)[1];
    const isLeftHand = isLeftKey(k);

    state.activeKeys.forEach((activeNote, activeKey) => {
      const activeNoteName = activeNote.match(/^([A-G]#?)/)[1];
      const activeIsLeftHand = isLeftKey(activeKey);
      if (activeNoteName === noteName && activeIsLeftHand === isLeftHand && activeKey !== k) {
        stopNote(activeKey, true);
        state.activeKeys.delete(activeKey);
        if (releaseKey) releaseKey(activeKey, activeNote, scene);
      }
    });

    state.activeKeys.set(k, note);
    if (pressKey) pressKey(k, scene);
    playNote(k, note);
  }

  function onKeyUp(e) {
    let k = e.key.toLowerCase();
    if (k === ' ') return;
    if (k === 'shift' && e.location === 1) k = 'shift_l';
    if (k === 'shift' && e.location === 2) k = 'shift_r';
    state.physicallyPressedKeys.delete(k);
    if (fnKeys.has(k)) return;
    if (!state.keyObjects[k]) { if (stopNote && state.activeAudio.has(k)) stopNote(k, true); return; }
    if (stopNote) stopNote(k);
    if (state.activeKeys.has(k)) {
      const note = state.activeKeys.get(k);
      state.activeKeys.delete(k);
      const { releaseKey } = opts.piano || {};
      if (releaseKey) releaseKey(k, note, scene);
    }
  }

  scene.input.keyboard.on('keydown', onKeyDown);
  scene.input.keyboard.on('keyup', onKeyUp);

  // Store references for cleanup by BeginnerScene
  scene._keydownHandler = onKeyDown;
  scene._keyupHandler = onKeyUp;
}
