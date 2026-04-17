// ═══════════════════════════════════════════════════════════
//  MUSICXML FALLING NOTES & PLAYBACK LOOP
//  FIXED: unified speed, synced keyboard+piano blocks,
//  clean borders for consecutive same-key notes.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';
import colors from '../core/colors.js';
import { BLACK_PC, MX_SPAWN_BOUNDARY, FALL_SPEED, PIANO_TOP, PIANO_HEIGHT } from '../core/constants.js';
import { midiToNoteName, playNote, stopNote } from '../audio/engine.js';
import { mxEnsureAudio, mxUpdateButtons } from './controls.js';
import { judgeNote } from '../scoring/timingJudge.js';
import { createNoteBlock, updateNoteBlock, destroyNoteBlock } from '../skin/NoteRenderer.js';
import { getAutoSlowDownMult } from './autoSlowDown.js';

export function mxFindPianoKey(midi) {
  const noteName = midiToNoteName(midi);
  return state.pianoKeys.find(p => p.note === noteName) || null;
}

/**
 * Spawn a UNIFIED falling note that has BOTH a keyboard-lane
 * representation and a piano-lane representation, with the
 * SAME height and synchronized arrival times.
 */
export function mxSpawnNote(scene, noteData, noteIndex) {
  const pk = mxFindPianoKey(noteData.midi);
  if (!pk) return;

  // Unified height based on duration × shared speed
  const noteHeight = Math.max(noteData.durationSec * FALL_SPEED, 4);
  const noteWidth = pk.isBlack ? Math.round(11 * 1.5) : Math.round(18 * 1.5);

  // ── Piano lane block ──
  // Falls from MX_SPAWN_BOUNDARY to PIANO_TOP
  const pianoFallDist = PIANO_TOP - MX_SPAWN_BOUNDARY;
  const pianoTravelSec = pianoFallDist / FALL_SPEED;
  const pianoSpawnTime = noteData.startSec - pianoTravelSec;
  const pianoStartY = MX_SPAWN_BOUNDARY - noteHeight / 2;

  const isAccidental = BLACK_PC.has(noteData.midi % 12);
  const blockFill = isAccidental ? colors.grayDark : colors.white;

  // Look up solver info for per-key rendering if available
  let solverKey = null, solverHand = null;
  if (state.solverNoteMap && state.solverNoteMap.has(noteIndex)) {
    const info = state.solverNoteMap.get(noteIndex);
    solverKey = info.key;
    solverHand = info.hand;
  }

  let pianoBlock = null;
  let pianoHighlight = null;
  if (settings.pianoVisualizerOn) {
    if (solverKey) {
      // Use NoteRenderer for skinned notes
      pianoBlock = createNoteBlock(scene, pk.x, pianoStartY, noteWidth, noteHeight, solverKey, solverHand, blockFill, { depth: 10, strokeWidth: 2, strokeColor: colors.purple, alpha: 0.9 });
    } else {
      // Fallback: plain rectangle (no solver data yet, or note not assigned)
      pianoBlock = scene.add.rectangle(pk.x, pianoStartY, noteWidth, noteHeight, blockFill, 0.9);
      pianoBlock.setStrokeStyle(2, colors.purple);
      pianoBlock.setDepth(10);
      pianoBlock._noteType = 'rect';
    }

    pianoHighlight = scene.add.rectangle(pk.x, pk.y, noteWidth, pk.isBlack ? 90 : 140, colors.purple, 0);
    pianoHighlight.setDepth(2);
  }

  state.mxFallingNotes.push({
    noteIndex,
    midi: noteData.midi,
    startSec: noteData.startSec,
    durationSec: noteData.durationSec,
    // Piano lane data
    pianoKeyX: pk.x,
    pianoKeyY: pk.y,
    isBlack: pk.isBlack,
    noteHeight,  // SAME height for keyboard & piano
    noteWidth,
    pianoBlock,
    pianoHighlight,
    pianoSpawnTime,
    // State
    audioStarted: false,
    audioStopped: false,
    audioKey: null,
    deleted: false,
    playerHit: false,
    isAccidental,
  });
}

export function mxUpdateFallingNotes(scene, delta) {
  if (!state.mxLoaded) return;

  if (state.mxPlaying) {
    const now = performance.now();
    if (state.mxLastTs === null) state.mxLastTs = now;
    const dtMs = now - state.mxLastTs;
    state.mxLastTs = now;
    const slowMult = settings.autoSlowDownOn ? getAutoSlowDownMult(dtMs) : 1.0;
    state.mxCurTime += (dtMs / 1000) * state.mxSpeed * slowMult;

    // Check for loop points
    if (settings.loopIn !== null && settings.loopOut !== null) {
      if (state.mxCurTime > settings.loopOut) {
        // Import dynamically to avoid circular — mxSeekTo is in scrubber
        state.mxCurTime = settings.loopIn;
        state.mxLastTs = null;
      }
    }

    // End-of-song check
    if (state.mxNotes.length && state.mxCurTime > state.mxNotes[state.mxNotes.length - 1].startSec + state.mxNotes[state.mxNotes.length - 1].durationSec + 2) {
      state.mxPlaying = false;
      state.mxLastTs = null;
      mxUpdateButtons();
      // Show end-of-song summary
      showEndSummary();
    }
  } else {
    state.mxLastTs = null;
  }

  // ── Spawn piano-lane notes when due ──
  const pianoFallDist = PIANO_TOP - MX_SPAWN_BOUNDARY;

  for (let i = 0; i < state.mxNotes.length; i++) {
    if (state.mxPlayed.has(i)) continue;
    const n = state.mxNotes[i];
    const noteHeight = Math.max(n.durationSec * FALL_SPEED, 4);
    const spawnTime = n.startSec - (pianoFallDist + noteHeight) / FALL_SPEED;

    if (state.mxCurTime >= spawnTime && state.mxCurTime < n.startSec + n.durationSec + 2) {
      state.mxPlayed.add(i);
      mxSpawnNote(scene, n, i);
    } else if (state.mxCurTime >= n.startSec + n.durationSec + 2) {
      state.mxPlayed.add(i);
      // Only count as miss if the note was never hit
      if (!state.score.hitDetails.has(i)) {
        judgeNote(i, null);
      }
    }
  }

  // ── Update piano-lane falling note positions ──
  for (let i = state.mxFallingNotes.length - 1; i >= 0; i--) {
    const fn = state.mxFallingNotes[i];
    if (fn.deleted) continue;

    const bottomY = PIANO_TOP + (state.mxCurTime - fn.startSec) * FALL_SPEED;
    const topY = bottomY - fn.noteHeight;

    const visibleTop = Math.max(topY, MX_SPAWN_BOUNDARY);
    const visibleBottom = Math.min(bottomY, PIANO_TOP);
    const visibleHeight = visibleBottom - visibleTop;

    if (topY >= PIANO_TOP) {
      destroyNoteBlock(fn.pianoBlock);
      if (fn.pianoHighlight) fn.pianoHighlight.destroy();
      fn.deleted = true;
      if (fn.audioKey && !fn.audioStopped) {
        stopNote(fn.audioKey);
        fn.audioStopped = true;
      }
    } else if (fn.pianoBlock) {
      if (visibleHeight > 0) {
        fn.pianoBlock.setVisible(settings.pianoVisualizerOn && settings.fallingBlocksOn);
        updateNoteBlock(fn.pianoBlock, fn.pianoKeyX, visibleTop + visibleHeight / 2, fn.noteWidth, visibleHeight);
      } else {
        fn.pianoBlock.setVisible(false);
      }
    }

    // Highlight near piano
    if (fn.pianoHighlight) {
      if (bottomY >= PIANO_TOP - 100 && topY < PIANO_TOP) {
        fn.pianoHighlight.setAlpha(settings.pianoVisualizerOn ? 0.5 : 0);
      } else {
        fn.pianoHighlight.setAlpha(0);
      }
    }

    // Audio trigger
    if (!fn.audioStarted && state.mxCurTime >= fn.startSec) {
      fn.audioStarted = true;
      if (state.mxPlaying) {
        mxEnsureAudio();
        const noteName = midiToNoteName(fn.midi);
        const audioKey = `mx:${fn.midi}:${state.mxEventCounter++}`;
        fn.audioKey = audioKey;
        playNote(audioKey, noteName);
        const stopDelay = fn.durationSec * 1000 / state.mxSpeed;
        setTimeout(() => {
          if (!fn.audioStopped) { stopNote(audioKey); fn.audioStopped = true; }
        }, stopDelay);
      }
    }
  }

  state.mxFallingNotes = state.mxFallingNotes.filter(fn => !fn.deleted);

  // ── Rest Of Song: play full-part notes not in current part (audio only, no visuals) ──
  if (state.mxRosMode && state.mxPlaying && state.mxRosNotes.length > 0) {
    mxEnsureAudio();
    for (let i = 0; i < state.mxRosNotes.length; i++) {
      if (state.mxRosPlayed.has(i)) continue;
      const rn = state.mxRosNotes[i];
      if (state.mxCurTime >= rn.startSec) {
        state.mxRosPlayed.add(i);
        const noteName = midiToNoteName(rn.midi);
        const audioKey = `ros:${rn.midi}:${i}`;
        playNote(audioKey, noteName);
        const stopDelay = rn.durationSec * 1000 / state.mxSpeed;
        setTimeout(() => { stopNote(audioKey); }, stopDelay);
      }
    }
  }
}

function showEndSummary() {
  const s = state.score;
  const acc = s.totalNotes > 0 ? ((s.notesHit / s.totalNotes) * 100).toFixed(1) : '0.0';
  const content = document.getElementById('summaryContent');
  content.innerHTML = `
    <div>Accuracy: <strong>${acc}%</strong></div>
    <div>Notes Hit: <strong>${s.notesHit}</strong> / ${s.totalNotes}</div>
    <div>Perfect: <strong>${s.perfectHits}</strong> | Good: <strong>${s.goodHits}</strong> | Missed: <strong>${s.misses}</strong></div>
    <div>Longest Streak: <strong>${s.longestStreak}</strong></div>
  `;
  document.getElementById('summaryOverlay').classList.add('open');
}

export function mxClearFallingNotes() {
  for (const fn of state.mxFallingNotes) {
    destroyNoteBlock(fn.pianoBlock);
    if (fn.pianoHighlight) fn.pianoHighlight.destroy();
  }
  state.mxFallingNotes = [];
  state.activeAudio.forEach((data, key) => {
    if (typeof key === 'string' && key.startsWith('mx:')) {
      data.oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
      data.gains.forEach(g => { try { g.disconnect(); } catch (e) {} });
      state.activeAudio.delete(key);
    }
  });
}
