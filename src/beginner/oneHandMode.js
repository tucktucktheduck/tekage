// ═══════════════════════════════════════════════════════════
//  BEGINNER MODE 4 — ONE HAND PLAYS / ONE HAND SHIFTS
//  Single unified slice. All shift keys control the same
//  octave/semitone for the playing hand.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
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

export function startOneHandMode(scene) {
  scene.children.removeAll();
  scene.cameras.main.setBackgroundColor('#000');

  let playingHand = 'left';

  const titleText = scene.add.text(960, 25, 'ONE HAND MODE', { fontFamily: 'Orbitron', fontSize: '24px', color: '#fff' }).setOrigin(0.5).setDepth(30);

  const swapBtn = scene.add.rectangle(1600, 25, 300, 30, 0x1a1a2e).setInteractive().setDepth(30);
  swapBtn.setStrokeStyle(2, 0x9333ea);
  const swapText = scene.add.text(1600, 25, 'Playing: LEFT | Shifting: RIGHT', { fontFamily: 'Rajdhani', fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  swapBtn.on('pointerdown', () => {
    playingHand = playingHand === 'left' ? 'right' : 'left';
    swapText.setText(`Playing: ${playingHand.toUpperCase()} | Shifting: ${playingHand === 'left' ? 'RIGHT' : 'LEFT'}`);
  });

  const uploadBtn = scene.add.rectangle(300, 25, 160, 30, 0x000000).setInteractive().setDepth(30);
  uploadBtn.setStrokeStyle(2, 0x3b82f6);
  scene.add.text(300, 25, '📂 UPLOAD', { fontFamily: 'Rajdhani', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  uploadBtn.on('pointerdown', () => document.getElementById('mxFileInput').click());

  drawFullKeyboard(scene);
  state.mxScene = scene;

  // Unified shift keys: ALL shift keys move the SAME octave/semitone (the playing hand's)
  scene.input.keyboard.on('keydown', e => {
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

    // UNIFIED shift: Tab OR Enter = octave up, ShiftL OR ShiftR = octave down, Q OR P = semi up, A OR ; = semi down
    const isOctUp = (k === 'tab' || k === 'enter');
    const isOctDown = (k === 'shift_l' || k === 'shift_r');
    const isSemiUp = (k === 'q' || k === 'p');
    const isSemiDown = (k === 'a' || k === ';');

    if (isOctUp) { e.preventDefault(); if (playingHand === 'left') state.octaveLeft = Math.min(7, state.octaveLeft + 1); else state.octaveRight = Math.min(7, state.octaveRight + 1); updateOct(scene); return; }
    if (isOctDown) { if (playingHand === 'left') state.octaveLeft = Math.max(0, state.octaveLeft - 1); else state.octaveRight = Math.max(0, state.octaveRight - 1); updateOct(scene); return; }
    if (isSemiUp) { if (playingHand === 'left') state.semitoneLeft += 1; else state.semitoneRight += 1; updateOct(scene); return; }
    if (isSemiDown) { if (playingHand === 'left') state.semitoneLeft -= 1; else state.semitoneRight -= 1; updateOct(scene); return; }

    if (e.repeat) return;
    if (!state.keyObjects[k]) return;
    const note = getNote(k);
    if (!note) return;

    state.activeKeys.set(k, note);
    pressKey(k, scene);
    playNote(k, note);
  });

  scene.input.keyboard.on('keyup', e => {
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
  });

  // Update loop
  scene.events.on('update', () => {
    if (!state.mxLoaded) return;
    if (state.mxPlaying) {
      const now = performance.now();
      if (state.mxLastTs === null) state.mxLastTs = now;
      const dtMs = now - state.mxLastTs;
      state.mxLastTs = now;
      state.mxCurTime += (dtMs / 1000) * state.mxSpeed;
    } else { state.mxLastTs = null; }

    // Spawn piano notes
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
        const nw = pk.isBlack ? Math.round(11*1.5) : Math.round(18*1.5);
        const pb = scene.add.rectangle(pk.x, MX_SPAWN_BOUNDARY - nh/2, nw, nh, isAcc ? colors.grayDark : colors.white, 0.9);
        pb.setStrokeStyle(2, colors.purple).setDepth(10);
        const ph = scene.add.rectangle(pk.x, pk.y, nw, pk.isBlack ? 90 : 140, colors.purple, 0).setDepth(2);
        state.mxFallingNotes.push({ noteIndex: i, midi: n.midi, startSec: n.startSec, durationSec: n.durationSec,
          pianoKeyX: pk.x, pianoKeyY: pk.y, isBlack: pk.isBlack, noteHeight: nh, noteWidth: nw,
          pianoBlock: pb, pianoHighlight: ph, audioStarted: false, audioStopped: false, audioKey: null, deleted: false, isAccidental: isAcc });
      }
    }

    // Update piano notes
    for (let i = state.mxFallingNotes.length - 1; i >= 0; i--) {
      const fn = state.mxFallingNotes[i];
      if (fn.deleted) continue;
      const bY = PIANO_TOP + (state.mxCurTime - fn.startSec) * FALL_SPEED;
      const tY = bY - fn.noteHeight;
      if (tY >= PIANO_TOP) { if (fn.pianoBlock) fn.pianoBlock.destroy(); if (fn.pianoHighlight) fn.pianoHighlight.destroy(); fn.deleted = true; if (fn.audioKey && !fn.audioStopped) { stopNote(fn.audioKey); fn.audioStopped = true; } }
      else if (fn.pianoBlock) {
        const vT = Math.max(tY, MX_SPAWN_BOUNDARY), vB = Math.min(bY, PIANO_TOP), vH = vB - vT;
        if (vH > 0) { fn.pianoBlock.setVisible(true); fn.pianoBlock.setPosition(fn.pianoKeyX, vT + vH/2); fn.pianoBlock.setSize(fn.noteWidth, vH); } else fn.pianoBlock.setVisible(false);
      }
      if (fn.pianoHighlight) fn.pianoHighlight.setAlpha(bY >= PIANO_TOP - 100 && tY < PIANO_TOP ? 0.5 : 0);
      if (!fn.audioStarted && state.mxCurTime >= fn.startSec) {
        fn.audioStarted = true;
        if (state.mxPlaying) { mxEnsureAudio(); const nn = midiToNoteName(fn.midi); const ak = `mx:${fn.midi}:${state.mxEventCounter++}`; fn.audioKey = ak; playNote(ak, nn); setTimeout(() => { if (!fn.audioStopped) { stopNote(ak); fn.audioStopped = true; } }, fn.durationSec * 1000 / state.mxSpeed); }
      }
    }
    state.mxFallingNotes = state.mxFallingNotes.filter(fn => !fn.deleted);
    mxUpdateKeyboardNotes(scene, 0);
    mxUpdateShiftBlocks(scene, 0);
    updateScrubber();
  });

  const backBtn = scene.add.rectangle(100, 1050, 120, 30, 0x000000).setInteractive().setDepth(30);
  backBtn.setStrokeStyle(2, 0x9333ea);
  scene.add.text(100, 1050, '← BACK', { fontFamily: 'Rajdhani', fontSize: '16px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(30);
  backBtn.on('pointerdown', () => scene.scene.start('BeginnerScene'));
}
