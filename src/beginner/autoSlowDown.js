// ═══════════════════════════════════════════════════════════
//  BEGINNER MODE 1 — AUTO SLOW DOWN
//  Notes decelerate exponentially as they approach the target
//  if the player hasn't pressed them yet. Unlosable mode.
//
//  FIX: All event listeners are stored on scene._updateHandler
//       / scene._keydownHandler / scene._keyupHandler so
//       BeginnerScene.cleanupMode() can remove them.
//       No more listener stacking.
// ═══════════════════════════════════════════════════════════

import state, { normalizeSemitone } from '../core/state.js';
import colors from '../core/colors.js';
import { FALL_SPEED, PIANO_TOP, MX_SPAWN_BOUNDARY, BLACK_PC } from '../core/constants.js';
import { drawFullKeyboard } from '../ui/sharedKeyboard.js';
import { initAudio, playNote, stopNote, midiToNoteName } from '../audio/engine.js';
import { pressKey, releaseKey, updateOct } from '../ui/piano.js';
import { getNote } from '../audio/noteMap.js';
import { fnKeys, isLeftKey } from '../core/keyMapping.js';
import { updateScrubber } from '../ui/scrubber.js';
import { mxEnsureAudio } from '../musicxml/controls.js';
import { mxFindPianoKey } from '../musicxml/playback.js';
import { mxUpdateKeyboardNotes, mxUpdateShiftBlocks } from '../solver/solverVisuals.js';

/** Convert a note name like "C4", "F#3", "Bb2" to a MIDI number. */
function noteNameToMidi(noteName) {
  const PC = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
  const m = noteName.match(/^([A-G](?:#|b)?)(\d+)$/);
  if (!m) return -1;
  return (parseInt(m[2], 10) + 1) * 12 + (PC[m[1]] ?? -1);
}

export function startAutoSlowDown(scene) {
  scene.cameras.main.setBackgroundColor('#000');
  let autoShift = true;

  // ── Header UI ──
  scene.add.text(960, 30, 'AUTO SLOW DOWN', {
    fontFamily: 'Orbitron', fontSize: '28px', color: '#fff',
  }).setOrigin(0.5);

  const toggleBtn = scene.add.rectangle(1700, 30, 200, 30, 0x1a1a2e).setInteractive();
  toggleBtn.setStrokeStyle(2, 0x3b82f6);
  const toggleText = scene.add.text(1700, 30, 'Auto-Shift: ON', {
    fontFamily: 'Rajdhani', fontSize: '16px', color: '#fff', fontStyle: 'bold',
  }).setOrigin(0.5);
  toggleBtn.on('pointerdown', () => {
    autoShift = !autoShift;
    toggleText.setText(`Auto-Shift: ${autoShift ? 'ON' : 'OFF'}`);
  });

  const uploadBtn = scene.add.rectangle(200, 30, 160, 30, 0x000000).setInteractive();
  uploadBtn.setStrokeStyle(2, 0x3b82f6);
  scene.add.text(200, 30, '📂 UPLOAD', {
    fontFamily: 'Rajdhani', fontSize: '18px', color: '#fff', fontStyle: 'bold',
  }).setOrigin(0.5);
  uploadBtn.on('pointerdown', () => document.getElementById('mxFileInput').click());

  const backBtn = scene.add.rectangle(100, 1050, 120, 30, 0x000000).setInteractive();
  backBtn.setStrokeStyle(2, 0x9333ea);
  scene.add.text(100, 1050, '← BACK', {
    fontFamily: 'Rajdhani', fontSize: '16px', color: '#fff', fontStyle: 'bold',
  }).setOrigin(0.5);
  backBtn.on('pointerdown', () => scene.scene.start('BeginnerScene'));

  // ── Draw keyboard + piano ──
  drawFullKeyboard(scene);
  state.mxScene = scene;

  // ══════════════════════════════════════════════════════════
  //  KEYBOARD INPUT — stored as named functions so we can
  //  remove them on cleanup (no anonymous arrow stacking)
  // ══════════════════════════════════════════════════════════

  function onKeyDown(e) {
    let k = e.key.toLowerCase();
    initAudio();

    // Spacebar = play/pause
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

    // Octave/semitone shifts
    if (k === 'tab') { e.preventDefault(); state.octaveLeft = Math.min(7, state.octaveLeft + 1); updateOct(scene); return; }
    if (k === 'shift_l') { state.octaveLeft = Math.max(0, state.octaveLeft - 1); updateOct(scene); return; }
    if (k === 'enter') { state.octaveRight = Math.min(7, state.octaveRight + 1); updateOct(scene); return; }
    if (k === 'shift_r') { state.octaveRight = Math.max(0, state.octaveRight - 1); updateOct(scene); return; }
    if (k === 'q') { const n = normalizeSemitone(state.semitoneLeft + 1, state.octaveLeft); state.semitoneLeft = n.semitone; state.octaveLeft = n.octave; updateOct(scene); return; }
    if (k === 'a') { const n = normalizeSemitone(state.semitoneLeft - 1, state.octaveLeft); state.semitoneLeft = n.semitone; state.octaveLeft = n.octave; updateOct(scene); return; }
    if (k === 'p') { const n = normalizeSemitone(state.semitoneRight + 1, state.octaveRight); state.semitoneRight = n.semitone; state.octaveRight = n.octave; updateOct(scene); return; }
    if (k === ';') { const n = normalizeSemitone(state.semitoneRight - 1, state.octaveRight); state.semitoneRight = n.semitone; state.octaveRight = n.octave; updateOct(scene); return; }

    if (e.repeat) return;
    if (!state.keyObjects[k]) return;
    const note = getNote(k);
    if (!note) return;

    // Duplicate note prevention (same note name, same hand)
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

    // Bug 0A fix: mark any nearby falling note with matching pitch as player-hit
    const playedMidi = noteNameToMidi(note);
    if (playedMidi >= 0) {
      for (const fn of state.mxFallingNotes) {
        if (fn.deleted || fn.playerHit || fn.audioStarted) continue;
        if (fn.midi === playedMidi) {
          const bY = PIANO_TOP + (state.mxCurTime - fn.startSec) * FALL_SPEED;
          if (Math.abs(bY - PIANO_TOP) < 80) {
            fn.playerHit = true;
            break;
          }
        }
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
    if (!state.keyObjects[k]) {
      if (state.activeAudio.has(k)) stopNote(k, true);
      return;
    }
    stopNote(k);
    if (state.activeKeys.has(k)) {
      const note = state.activeKeys.get(k);
      state.activeKeys.delete(k);
      releaseKey(k, note, scene);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  UPDATE LOOP — stored as a named function
  // ══════════════════════════════════════════════════════════

  // Bug 0A: smooth speed multiplier (lerped, not snapped)
  let currentSpeedMult = 1.0;

  function onUpdate() {
    if (!state.mxLoaded) return;

    // ── Time advancement with slow-down ──
    if (state.mxPlaying) {
      const now = performance.now();
      if (state.mxLastTs === null) state.mxLastTs = now;
      const dtMs = now - state.mxLastTs;
      state.mxLastTs = now;

      // Bug 0A fix: only count notes NOT yet player-hit for slow-down
      const THRESHOLD = 150;
      let minDist = Infinity;
      for (const fn of state.mxFallingNotes) {
        if (fn.deleted || fn.audioStarted || fn.playerHit) continue;
        const bottomY = PIANO_TOP + (state.mxCurTime - fn.startSec) * FALL_SPEED;
        const dist = PIANO_TOP - bottomY;
        if (dist > 0 && dist < THRESHOLD) minDist = Math.min(minDist, dist);
      }
      const targetSpeedMult = minDist < THRESHOLD ? Math.max(0.01, minDist / THRESHOLD) : 1;
      // Lerp: slow down fast, recover over ~200ms
      const lerpRate = targetSpeedMult < currentSpeedMult ? 0.3 : Math.min(1, dtMs / 200);
      currentSpeedMult += (targetSpeedMult - currentSpeedMult) * lerpRate;

      // Bug 0B fix: rebuild shift blocks from solver plan if they weren't created
      if (autoShift && state.mxShiftBlocks.length === 0 && state.solverPlan && state.solverPlan.length > 0) {
        for (const entry of state.solverPlan) {
          if (entry.type === 'shift') {
            state.mxShiftBlocks.push({ key: entry.key, timeSec: entry.timeSec, deleted: false, antennaBlock: null, portBlock: null });
          }
        }
      }

      // Bug 0B fix: fire at exact timeSec (not -0.1), respects slow-down timing
      if (autoShift) {
        for (const sb of state.mxShiftBlocks) {
          if (!sb.deleted && state.mxCurTime >= sb.timeSec) {
            applyShift(sb.key, scene);
            sb.deleted = true;
            if (sb.antennaBlock) sb.antennaBlock.destroy();
            if (sb.portBlock) sb.portBlock.destroy();
          }
        }
      }

      state.mxCurTime += (dtMs / 1000) * state.mxSpeed * currentSpeedMult;
    } else {
      state.mxLastTs = null;
    }

    // ── Spawn piano notes ──
    const pianoFallDist = PIANO_TOP - MX_SPAWN_BOUNDARY;
    for (let i = 0; i < state.mxNotes.length; i++) {
      if (state.mxPlayed.has(i)) continue;
      const n = state.mxNotes[i];
      const nh = Math.max(n.durationSec * FALL_SPEED, 4);
      const spT = n.startSec - (pianoFallDist + nh) / FALL_SPEED;
      if (state.mxCurTime >= spT && state.mxCurTime < n.startSec + n.durationSec + 2) {
        state.mxPlayed.add(i);
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

    // ── Update falling piano notes ──
    for (let i = state.mxFallingNotes.length - 1; i >= 0; i--) {
      const fn = state.mxFallingNotes[i];
      if (fn.deleted) continue;
      const bY = PIANO_TOP + (state.mxCurTime - fn.startSec) * FALL_SPEED;
      const tY = bY - fn.noteHeight;

      // Past the piano — destroy
      if (tY >= PIANO_TOP) {
        if (fn.pianoBlock) fn.pianoBlock.destroy();
        if (fn.pianoHighlight) fn.pianoHighlight.destroy();
        fn.deleted = true;
        if (fn.audioKey && !fn.audioStopped) { stopNote(fn.audioKey); fn.audioStopped = true; }
      } else if (fn.pianoBlock) {
        // Clip to visible region
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

      // Piano highlight glow
      if (fn.pianoHighlight) {
        fn.pianoHighlight.setAlpha(bY >= PIANO_TOP - 100 && tY < PIANO_TOP ? 0.5 : 0);
      }

      // Trigger audio when note reaches target line
      if (!fn.audioStarted && state.mxCurTime >= fn.startSec) {
        fn.audioStarted = true;
        if (state.mxPlaying) {
          mxEnsureAudio();
          const nn = midiToNoteName(fn.midi);
          const ak = `mx:${fn.midi}:${state.mxEventCounter++}`;
          fn.audioKey = ak;
          playNote(ak, nn);
          const dur = fn.durationSec * 1000 / state.mxSpeed;
          setTimeout(() => {
            if (!fn.audioStopped) { stopNote(ak); fn.audioStopped = true; }
          }, dur);
        }
      }
    }

    // Compact the array
    state.mxFallingNotes = state.mxFallingNotes.filter(fn => !fn.deleted);

    // Update solver visuals + scrubber
    mxUpdateKeyboardNotes(scene, 0);
    mxUpdateShiftBlocks(scene, 0);
    updateScrubber();
  }

  // ══════════════════════════════════════════════════════════
  //  REGISTER LISTENERS — store refs on scene for cleanup
  // ══════════════════════════════════════════════════════════

  scene.input.keyboard.on('keydown', onKeyDown);
  scene.input.keyboard.on('keyup', onKeyUp);
  scene.events.on('update', onUpdate);

  // Store references so BeginnerScene.cleanupMode() can remove them
  scene._keydownHandler = onKeyDown;
  scene._keyupHandler = onKeyUp;
  scene._updateHandler = onUpdate;
}

// ── Helper ──
function applyShift(key, scene) {
  if (key === 'tab') state.octaveLeft = Math.min(7, state.octaveLeft + 1);
  else if (key === 'shift_l') state.octaveLeft = Math.max(0, state.octaveLeft - 1);
  else if (key === 'enter') state.octaveRight = Math.min(7, state.octaveRight + 1);
  else if (key === 'shift_r') state.octaveRight = Math.max(0, state.octaveRight - 1);
  else if (key === 'q') { const n = normalizeSemitone(state.semitoneLeft + 1, state.octaveLeft); state.semitoneLeft = n.semitone; state.octaveLeft = n.octave; }
  else if (key === 'a') { const n = normalizeSemitone(state.semitoneLeft - 1, state.octaveLeft); state.semitoneLeft = n.semitone; state.octaveLeft = n.octave; }
  else if (key === 'p') { const n = normalizeSemitone(state.semitoneRight + 1, state.octaveRight); state.semitoneRight = n.semitone; state.octaveRight = n.octave; }
  else if (key === ';') { const n = normalizeSemitone(state.semitoneRight - 1, state.octaveRight); state.semitoneRight = n.semitone; state.octaveRight = n.octave; }
  updateOct(scene);
}
