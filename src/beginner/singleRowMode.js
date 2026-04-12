// ═══════════════════════════════════════════════════════════
//  BEGINNER MODE — SINGLE ROW (BETA)
//  Only the middle keyboard row (A S D F G H J K L ; ') is
//  shown and requires player input. Notes assigned to any
//  other key are auto-played with audio at their start time.
//  Tab/Shift still shift octaves.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import colors from '../core/colors.js';
import { FALL_SPEED, PIANO_TOP, MX_SPAWN_BOUNDARY, BLACK_PC, rowYPositions, PORT_HEIGHT, ANTENNA_HEIGHT, ANTENNA_WIDTH, keyGap } from '../core/constants.js';
import { initAudio, playNote, stopNote, midiToNoteName } from '../audio/engine.js';
import { pressKey, releaseKey, updateOct, drawPiano } from '../ui/piano.js';
import { getNote } from '../audio/noteMap.js';
import { fnKeys, isLeftKey, leftMap, rightMap } from '../core/keyMapping.js';
import { updateScrubber, createScrubber } from '../ui/scrubber.js';
import { mxEnsureAudio } from '../musicxml/controls.js';
import { mxFindPianoKey } from '../musicxml/playback.js';
import { mxUpdateShiftBlocks } from '../solver/solverVisuals.js';

// Keys in the single playable row
const ROW_KEYS = new Set(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';']);

export function startSingleRowMode(scene) {
  // Keyboard + piano already rendered by BeginnerScene.launchMode()
  state.mxScene = scene;

  // ── Key input ──
  function onKeyDown(e) {
    let k = e.key.toLowerCase();
    initAudio();

    if (k === ' ') {
      e.preventDefault();
      if (!state.mxLoaded) return;
      mxEnsureAudio();
      state.mxPlaying = !state.mxPlaying;
      if (!state.mxPlaying) state.mxLastTs = null;
      return;
    }

    if (k === 'shift' && e.location === 1) k = 'shift_l';
    if (k === 'shift' && e.location === 2) k = 'shift_r';
    state.physicallyPressedKeys.add(k);

    if (k === 'tab') { e.preventDefault(); state.octaveLeft = Math.min(7, state.octaveLeft + 1); updateOct(scene); return; }
    if (k === 'shift_l') { state.octaveLeft = Math.max(0, state.octaveLeft - 1); updateOct(scene); return; }
    if (k === 'enter') { state.octaveRight = Math.min(7, state.octaveRight + 1); updateOct(scene); return; }
    if (k === 'shift_r') { state.octaveRight = Math.max(0, state.octaveRight - 1); updateOct(scene); return; }

    if (e.repeat) return;
    if (!ROW_KEYS.has(k)) return;
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
        releaseKey(activeKey, activeNote, scene);
      }
    });

    state.activeKeys.set(k, note);
    pressKey(k, scene);
    playNote(k, note);

    // Mark matching falling note as player-hit
    const playedNote = note;
    for (const fn of state.mxFallingNotes) {
      if (fn.deleted || fn.playerHit || fn.audioStarted) continue;
      if (midiToNoteName(fn.midi) === playedNote) {
        const bY = PIANO_TOP + (state.mxCurTime - fn.startSec) * FALL_SPEED;
        if (Math.abs(bY - PIANO_TOP) < 80) { fn.playerHit = true; break; }
      }
    }
  }

  function onKeyUp(e) {
    let k = e.key.toLowerCase();
    if (k === ' ') return;
    if (k === 'shift' && e.location === 1) k = 'shift_l';
    if (k === 'shift' && e.location === 2) k = 'shift_r';
    state.physicallyPressedKeys.delete(k);
    if (fnKeys.has(k)) return;
    if (!state.keyObjects[k]) { if (state.activeAudio.has(k)) stopNote(k, true); return; }
    stopNote(k);
    if (state.activeKeys.has(k)) {
      const note = state.activeKeys.get(k);
      state.activeKeys.delete(k);
      releaseKey(k, note, scene);
    }
  }

  function onUpdate() {
    if (!state.mxLoaded) return;
    if (state.mxPlaying) {
      const now = performance.now();
      if (state.mxLastTs === null) state.mxLastTs = now;
      const dtMs = now - state.mxLastTs;
      state.mxLastTs = now;
      state.mxCurTime += (dtMs / 1000) * state.mxSpeed;
    } else {
      state.mxLastTs = null;
    }

    // Spawn + auto-play notes whose assigned key is NOT in ROW_KEYS
    const pianoFallDist = PIANO_TOP - MX_SPAWN_BOUNDARY;
    for (let i = 0; i < state.mxNotes.length; i++) {
      if (state.mxPlayed.has(i)) continue;
      const n = state.mxNotes[i];
      const nh = Math.max(n.durationSec * FALL_SPEED, 4);
      const spT = n.startSec - (pianoFallDist + nh) / FALL_SPEED;
      if (state.mxCurTime >= spT && state.mxCurTime < n.startSec + n.durationSec + 2) {
        state.mxPlayed.add(i);

        // Check if this note is assigned to a row key
        const assignedKey = _getAssignedKey(n, i);
        const needsPlayerInput = assignedKey && ROW_KEYS.has(assignedKey);

        if (!needsPlayerInput) {
          // Auto-play: schedule audio, no visual block needed
          const delay = Math.max(0, (n.startSec - state.mxCurTime) * 1000 / state.mxSpeed);
          setTimeout(() => {
            if (!state.mxPlaying) return;
            mxEnsureAudio();
            const nn = midiToNoteName(n.midi);
            const ak = `mx:auto:${n.midi}:${i}`;
            playNote(ak, nn);
            const dur = n.durationSec * 1000 / state.mxSpeed;
            setTimeout(() => stopNote(ak), dur);
          }, delay);
          continue;
        }

        // Visual block for row key notes
        const pk = mxFindPianoKey(n.midi);
        if (!pk) continue;
        const isAcc = BLACK_PC.has(n.midi % 12);
        const nw = pk.isBlack ? Math.round(11 * 1.5) : Math.round(18 * 1.5);
        const pb = scene.add.rectangle(pk.x, MX_SPAWN_BOUNDARY - nh / 2, nw, nh, isAcc ? colors.grayDark : colors.white, 0.9);
        pb.setStrokeStyle(2, colors.purple).setDepth(10);
        const ph = scene.add.rectangle(pk.x, pk.y, nw, pk.isBlack ? 90 : 140, colors.purple, 0).setDepth(2);
        state.mxFallingNotes.push({
          noteIndex: i, midi: n.midi, startSec: n.startSec, durationSec: n.durationSec,
          pianoKeyX: pk.x, pianoKeyY: pk.y, isBlack: pk.isBlack, noteHeight: nh, noteWidth: nw,
          pianoBlock: pb, pianoHighlight: ph, audioStarted: false, audioStopped: false,
          audioKey: null, deleted: false, isAccidental: isAcc,
        });
      }
    }

    // Update falling notes
    for (let i = state.mxFallingNotes.length - 1; i >= 0; i--) {
      const fn = state.mxFallingNotes[i];
      if (fn.deleted) continue;
      const bY = PIANO_TOP + (state.mxCurTime - fn.startSec) * FALL_SPEED;
      const tY = bY - fn.noteHeight;
      if (tY >= PIANO_TOP) {
        if (fn.pianoBlock) fn.pianoBlock.destroy();
        if (fn.pianoHighlight) fn.pianoHighlight.destroy();
        fn.deleted = true;
        if (fn.audioKey && !fn.audioStopped) { stopNote(fn.audioKey); fn.audioStopped = true; }
      } else if (fn.pianoBlock) {
        const vT = Math.max(tY, MX_SPAWN_BOUNDARY);
        const vB = Math.min(bY, PIANO_TOP);
        const vH = vB - vT;
        if (vH > 0) {
          fn.pianoBlock.setVisible(true);
          fn.pianoBlock.setPosition(fn.pianoKeyX, vT + vH / 2);
          fn.pianoBlock.setSize(fn.noteWidth, vH);
        } else {
          fn.pianoBlock.setVisible(false);
        }
      }
      if (fn.pianoHighlight) {
        fn.pianoHighlight.setAlpha(bY >= PIANO_TOP - 100 && tY < PIANO_TOP ? 0.5 : 0);
      }
      if (!fn.audioStarted && state.mxCurTime >= fn.startSec) {
        fn.audioStarted = true;
        if (state.mxPlaying) {
          mxEnsureAudio();
          const nn = midiToNoteName(fn.midi);
          const ak = `mx:${fn.midi}:${state.mxEventCounter++}`;
          fn.audioKey = ak;
          playNote(ak, nn);
          const dur = fn.durationSec * 1000 / state.mxSpeed;
          setTimeout(() => { if (!fn.audioStopped) { stopNote(ak); fn.audioStopped = true; } }, dur);
        }
      }
    }
    state.mxFallingNotes = state.mxFallingNotes.filter(fn => !fn.deleted);
    mxUpdateShiftBlocks(scene, 0);
    updateScrubber();
  }

  scene.input.keyboard.on('keydown', onKeyDown);
  scene.input.keyboard.on('keyup', onKeyUp);
  scene.events.on('update', onUpdate);
  scene._keydownHandler = onKeyDown;
  scene._keyupHandler = onKeyUp;
  scene._updateHandler = onUpdate;
}

/** Find which keyboard key the solver assigned to a note, if any */
function _getAssignedKey(noteData, noteIndex) {
  if (!state.solverReady || !state.solverNoteMap) return null;
  const entry = state.solverNoteMap.get(noteIndex);
  return entry ? entry.key : null;
}

/** Draw just the middle keyboard row */
function _drawSingleRow(scene) {
  state.keyObjects = {};
  const rowY = rowYPositions[1];
  const keys = ['a','s','d','f','g','h','j','k','l',';'];
  const keyW = 67, kgap = 5;
  const totalW = keys.length * keyW + (keys.length - 1) * kgap;
  let x = 960 - totalW / 2;

  for (const lk of keys) {
    const isGreyed = (lk === 'g' || lk === 'h');
    const noteInfo = isGreyed ? null : getNote(lk);
    const isBlack = noteInfo && noteInfo.includes('#');
    const fill = isGreyed ? colors.grayDark : (isBlack ? colors.grayDark : colors.white);
    const stroke = isGreyed ? colors.gray : (isLeftKey(lk) ? colors.left : colors.right);
    const portTop = rowY - PORT_HEIGHT / 2;
    const portBottom = rowY + PORT_HEIGHT / 2;

    if (noteInfo) {
      scene.add.rectangle(x + keyW / 2, (portTop - ANTENNA_HEIGHT + portTop) / 2, ANTENNA_WIDTH, ANTENNA_HEIGHT, stroke, 0.4).setDepth(0);
    }
    const rect = scene.add.rectangle(x + keyW / 2, rowY, keyW - 6, PORT_HEIGHT - 6, fill);
    rect.setStrokeStyle(4, stroke);
    const lc = fill === colors.white ? '#000' : '#fff';
    scene.add.text(x + keyW / 2, rowY - 12, lk.toUpperCase(), {
      fontFamily: 'Rajdhani', fontSize: '16px', color: lc, fontStyle: 'bold',
    }).setOrigin(0.5);
    if (noteInfo && !isGreyed) {
      const noteName = leftMap[lk] || rightMap[lk] || '';
      scene.add.text(x + keyW / 2, rowY + 14, noteName, {
        fontFamily: 'Rajdhani', fontSize: '14px', color: '#3b82f6', fontStyle: 'bold',
      }).setOrigin(0.5);
    }
    state.keyObjects[lk] = {
      rect, fill, stroke, isBlack: !!isBlack, isFn: false,
      centerX: x + keyW / 2, centerY: rowY, width: keyW, height: PORT_HEIGHT, rowIndex: 1,
      antennaTop: portTop - ANTENNA_HEIGHT, antennaBottom: portTop, portTop, portBottom,
    };
    x += keyW + kgap;
  }
}
