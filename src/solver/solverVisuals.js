// ═══════════════════════════════════════════════════════════
//  SOLVER VISUAL BLOCKS
//  Keyboard-lane note blocks and shift/tap blocks.
//  UNIFIED: same height as piano lane, synced arrival.
//  FIXED: clean borders for consecutive same-key notes.
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import settings from '../core/settings.js';
import colors from '../core/colors.js';
import { ANTENNA_BLOCK_WIDTH, FALL_SPEED } from '../core/constants.js';
import { updateOct } from '../ui/piano.js';
import { createNoteBlock, updateNoteBlock, destroyNoteBlock } from '../skin/NoteRenderer.js';
import { getNoteGlowKey, NOTE_CROP_OFFSET } from '../scene/GlowTextures.js';


export function solverBuildLookups(plan) {
  state.solverNoteMap = new Map();
  state.solverShifts = [];
  for (const entry of plan) {
    if (entry.type === 'note') state.solverNoteMap.set(entry.noteIndex, { hand: entry.hand, key: entry.key });
    else if (entry.type === 'shift') state.solverShifts.push(entry);
  }
}

export function mxSpawnKeyboardNote(scene, noteData, noteIndex, hand, keyName) {
  const keyObj = state.keyObjects[keyName];
  if (!keyObj) return;

  const color = hand === 'left' ? colors.left : colors.right;
  // UNIFIED: same height calc as piano lane
  const noteHeight = Math.max(noteData.durationSec * FALL_SPEED, 4);
  // Bottom of note arrives at centerY (the bar line) exactly at startSec
  const fallDist = keyObj.centerY - keyObj.antennaTop;
  const travelSec = fallDist / FALL_SPEED;
  const spawnTimeSec = noteData.startSec - travelSec;

  state.mxKeyboardNotes.push({
    noteIndex, key: keyName, hand,
    startSec: noteData.startSec,
    durationSec: noteData.durationSec,
    spawnTimeSec, noteHeight, color,
    currentY: keyObj.antennaTop - noteHeight / 2,
    antennaBlock: null, portBlock: null, tailBlock: null,
    antennaDeleted: false, spawned: false, deleted: false,
  });
}

export function mxSpawnShiftBlock(scene, shiftEntry) {
  const keyObj = state.keyObjects[shiftEntry.key];
  if (!keyObj) return;

  const color = shiftEntry.hand === 'left' ? colors.left : colors.right;
  const noteHeight = 20;
  const fallDist = keyObj.centerY - keyObj.antennaTop;
  const travelSec = fallDist / FALL_SPEED;
  const spawnTimeSec = shiftEntry.timeSec - travelSec;

  state.mxShiftBlocks.push({
    key: shiftEntry.key, hand: shiftEntry.hand,
    timeSec: shiftEntry.timeSec,
    action: shiftEntry.action || null,   // e.g. 'octave+', 'octave-', 'semi+', 'semi-'
    delta: shiftEntry.delta ?? null,     // numeric fallback
    spawnTimeSec, noteHeight, color,
    currentY: keyObj.antennaTop - noteHeight / 2,
    antennaBlock: null, portBlock: null, tailBlock: null,
    antennaDeleted: false, spawned: false, deleted: false, fired: false, isTap: true,
  });
}

/**
 * Helper: render a glowing antenna-lane block.
 * JSX style: thin neon bar with glow halo behind it.
 */
function renderBlock(scene, existing, cx, visTop, visBot, width, color, depth, strokeWidth) {
  const visH = visBot - visTop;
  if (visH <= 0) return existing;

  if (!existing) {
    // Container to hold both the glow halo and the solid bar
    const container = scene.add.container(cx, (visTop + visBot) / 2);
    container.setDepth(depth);

    // Glow halo behind (wider, transparent, ADD blend)
    const halo = scene.add.rectangle(0, 0, width + 8, visH, color, 0.2);
    halo.setBlendMode(Phaser.BlendModes.ADD);

    // Solid inner bar (thinner, bright)
    const bar = scene.add.rectangle(0, 0, Math.max(width - 6, 8), visH, color, 0.85);
    bar.setStrokeStyle(1.5, color);

    container.add([halo, bar]);
    container._noteHalo = halo;
    container._noteBar = bar;
    return container;
  }

  // Update existing container
  existing.setPosition(cx, (visTop + visBot) / 2);
  if (existing._noteHalo) existing._noteHalo.setSize(width + 8, visH);
  if (existing._noteBar) existing._noteBar.setSize(Math.max(width - 6, 8), visH);
  return existing;
}

export function mxUpdateKeyboardNotes(scene, delta) {
  if (!state.solverReady || !state.mxLoaded) return;
  if (!settings.fallingBlocksOn) return;

  for (const kn of state.mxKeyboardNotes) {
    if (kn.spawned || kn.deleted) continue;
    if (state.mxCurTime >= kn.spawnTimeSec && state.mxCurTime < kn.startSec + kn.durationSec + 2) kn.spawned = true;
  }

  for (let i = state.mxKeyboardNotes.length - 1; i >= 0; i--) {
    const kn = state.mxKeyboardNotes[i];
    if (!kn.spawned || kn.deleted) continue;

    const keyObj = state.keyObjects[kn.key];
    if (!keyObj) { kn.deleted = true; continue; }

    // Bottom edge arrives at centerY (bar line) exactly at startSec
    const bottomY = keyObj.centerY + (state.mxCurTime - kn.startSec) * FALL_SPEED;
    const noteTop = bottomY - kn.noteHeight;
    const noteBottom = bottomY;

    // Delete once the note has fully scrolled past the crop zone
    if (noteTop >= keyObj.centerY + NOTE_CROP_OFFSET + 2) {
      if (kn.antennaBlock) kn.antennaBlock.destroy();
      destroyNoteBlock(kn.portBlock);
      if (kn.tailBlock) { kn.tailBlock.destroy(); kn.tailBlock = null; }
      kn.deleted = true;
      continue;
    }

    // Antenna region
    if (!kn.antennaDeleted) {
      if (noteTop >= keyObj.antennaBottom) {
        if (kn.antennaBlock) kn.antennaBlock.destroy();
        kn.antennaDeleted = true;
      } else {
        const visTop = Math.max(noteTop, keyObj.antennaTop);
        const visBot = Math.min(noteBottom, keyObj.antennaBottom);
        if (visBot > visTop) {
          kn.antennaBlock = renderBlock(scene, kn.antennaBlock, keyObj.centerX, visTop, visBot, ANTENNA_BLOCK_WIDTH, kn.color, 5, 3);
        }
      }
    }

    // Port region — cropped at bar line with feather overlay at bottom edge
    if (noteBottom >= keyObj.portTop) {
      const cx = keyObj.centerX;
      const w = keyObj.width - 10;

      // Crop note at centerY + NOTE_CROP_OFFSET (mask handles the feather)
      const mainTop = Math.max(noteTop, keyObj.portTop);
      const mainBot = Math.min(noteBottom, keyObj.centerY + NOTE_CROP_OFFSET);
      const mainH = mainBot - mainTop;

      if (mainH > 0) {
        const cy = (mainTop + mainBot) / 2;
        if (!kn.portBlock) {
          kn.portBlock = createNoteBlock(scene, cx, cy, w, mainH, kn.key, kn.hand, kn.color, { depth: 3, strokeWidth: 3 });
          // Apply the row's feather crop mask once at creation
          const rowMask = state._rowCropMasks?.[keyObj.centerY];
          if (rowMask && kn.portBlock?.setMask) kn.portBlock.setMask(rowMask);
        } else {
          updateNoteBlock(kn.portBlock, cx, cy, w, mainH);
          if (kn.portBlock.setVisible) kn.portBlock.setVisible(true);
          if (kn.portBlock.setAlpha) kn.portBlock.setAlpha(1);
        }
      } else {
        if (kn.portBlock && kn.portBlock.setVisible) kn.portBlock.setVisible(false);
      }
    }
  }

  state.mxKeyboardNotes = state.mxKeyboardNotes.filter(kn => !kn.deleted);
}

export function mxUpdateShiftBlocks(scene, delta) {
  if (!state.solverReady || !state.mxLoaded) return;
  if (!settings.fallingBlocksOn) return;

  for (const sb of state.mxShiftBlocks) {
    if (sb.spawned || sb.deleted) continue;
    if (state.mxCurTime >= sb.spawnTimeSec && state.mxCurTime < sb.timeSec + 2) sb.spawned = true;
  }

  for (let i = state.mxShiftBlocks.length - 1; i >= 0; i--) {
    const sb = state.mxShiftBlocks[i];
    if (!sb.spawned || sb.deleted) continue;

    const keyObj = state.keyObjects[sb.key];
    if (!keyObj) { sb.deleted = true; continue; }

    // Bottom edge arrives at centerY (bar line) exactly at timeSec
    const bottomY = keyObj.centerY + (state.mxCurTime - sb.timeSec) * FALL_SPEED;
    const noteTop = bottomY - sb.noteHeight;
    const noteBottom = bottomY;

    if (noteTop >= keyObj.centerY + NOTE_CROP_OFFSET + 2) {
      if (sb.antennaBlock) sb.antennaBlock.destroy();
      if (sb.portBlock) sb.portBlock.destroy();
      if (sb.tailBlock) { sb.tailBlock.destroy(); sb.tailBlock = null; }
      sb.deleted = true;
      continue;
    }

    if (!sb.antennaDeleted) {
      if (noteTop >= keyObj.antennaBottom) {
        if (sb.antennaBlock) sb.antennaBlock.destroy();
        sb.antennaDeleted = true;
      } else {
        const visTop = Math.max(noteTop, keyObj.antennaTop);
        const visBot = Math.min(noteBottom, keyObj.antennaBottom);
        if (visBot > visTop) sb.antennaBlock = renderBlock(scene, sb.antennaBlock, keyObj.centerX, visTop, visBot, ANTENNA_BLOCK_WIDTH, sb.color, 5, 3);
      }
    }

    if (noteBottom >= keyObj.portTop) {
      const cx = keyObj.centerX;
      const w = keyObj.width - 10;

      const mainTop = Math.max(noteTop, keyObj.portTop);
      const mainBot = Math.min(noteBottom, keyObj.centerY + NOTE_CROP_OFFSET);
      const mainH = mainBot - mainTop;

      if (mainH > 0) {
        const hadBlock = !!sb.portBlock;
        sb.portBlock = renderBlock(scene, sb.portBlock, cx, mainTop, mainBot, w, sb.color, 3, 3);
        if (sb.portBlock) {
          sb.portBlock.setAlpha(1);
          if (!hadBlock) {
            const rowMask = state._rowCropMasks?.[keyObj.centerY];
            if (rowMask && sb.portBlock.setMask) sb.portBlock.setMask(rowMask);
          }
        }
      } else {
        if (sb.portBlock) sb.portBlock.setAlpha(0);
      }
    }
  }

  state.mxShiftBlocks = state.mxShiftBlocks.filter(sb => !sb.deleted);
}

export function mxClearSolverBlocks() {
  for (const kn of state.mxKeyboardNotes) {
    if (kn.antennaBlock) kn.antennaBlock.destroy();
    destroyNoteBlock(kn.portBlock);
    if (kn.tailBlock) kn.tailBlock.destroy();
  }
  state.mxKeyboardNotes = [];
  for (const sb of state.mxShiftBlocks) {
    if (sb.antennaBlock) sb.antennaBlock.destroy();
    if (sb.portBlock) sb.portBlock.destroy();
    if (sb.tailBlock) sb.tailBlock.destroy();
  }
  state.mxShiftBlocks = [];
  state.mxKeyboardPlayed.clear();
  state.mxShiftPlayed.clear();
}

export function solverPrepareBlocks(scene) {
  if (!state.solverReady || !state.mxScene) return;
  mxClearSolverBlocks();
  for (const entry of state.solverPlan) {
    if (entry.type === 'note') {
      const noteData = state.mxNotes[entry.noteIndex];
      if (noteData) mxSpawnKeyboardNote(scene, noteData, entry.noteIndex, entry.hand, entry.key);
    } else if (entry.type === 'shift') {
      mxSpawnShiftBlock(scene, entry);
    }
  }
}



// ── TIMELINE-BASED AUTO-SHIFT ──

/**
 * Called every frame during playback. Advances through stateTimeline,
 * applying any entries whose timeSec has been passed.
 */
export function mxUpdateAutoShift() {
  if (!settings.autoShiftOn || !state.solverReady) return;
  const tl = state.solverStateTimeline;
  if (!tl || !tl.length) return;

  let changed = false;
  while (state._autoShiftIdx < tl.length && state.mxCurTime >= tl[state._autoShiftIdx].timeSec) {
    const e = tl[state._autoShiftIdx];
    state.octaveLeft    = e.leftOctave;
    state.octaveRight   = e.rightOctave;
    state.semitoneLeft  = e.leftSemitone;
    state.semitoneRight = e.rightSemitone;
    state._autoShiftIdx++;
    changed = true;
  }
  if (changed && state.mxScene) updateOct(state.mxScene);
}

/**
 * Called on song load or scrubber seek. Finds the correct timeline
 * snapshot for the given time, applies it if autoShiftOn, and sets
 * _autoShiftIdx so future frames continue from the right position.
 */
export function mxResetAutoShiftToTime(t) {
  const tl = state.solverStateTimeline;
  if (!tl || !tl.length) { state._autoShiftIdx = 0; return; }

  // Find last timeline entry at or before t
  let idx = 0;
  while (idx < tl.length - 1 && tl[idx + 1].timeSec <= t) idx++;
  state._autoShiftIdx = idx + 1; // next entry to apply going forward

  if (settings.autoShiftOn) {
    const e = tl[idx];
    state.octaveLeft    = e.leftOctave;
    state.octaveRight   = e.rightOctave;
    state.semitoneLeft  = e.leftSemitone;
    state.semitoneRight = e.rightSemitone;
    if (state.mxScene) updateOct(state.mxScene);
  }
}