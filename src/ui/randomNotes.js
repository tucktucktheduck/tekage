// ═══════════════════════════════════════════════════════════
//  RANDOM NOTE SPAWNER — used by Beginner scene
// ═══════════════════════════════════════════════════════════

import state from '../core/state.js';
import colors from '../core/colors.js';
import { PIANO_HEIGHT, MX_SPAWN_BOUNDARY } from '../core/constants.js';
import { leftMap, isLeftKey } from '../core/keyMapping.js';
import { getNote } from '../audio/noteMap.js';

export function spawnRandomNote(scene) {
  const playableKeys = Object.keys(state.keyObjects).filter(k => getNote(k) !== null);
  const fnKeysList = ['tab', 'q', 'a', 'shift_l', 'shift_r', 'enter', 'p', ';'];
  const spawnFn = Math.random() < 0.2 && fnKeysList.length > 0;

  if (spawnFn) {
    const rk = fnKeysList[Math.floor(Math.random() * fnKeysList.length)];
    const keyObj = state.keyObjects[rk];
    if (!keyObj) return;
    const isLeftFn = (rk === 'tab' || rk === 'q' || rk === 'a' || rk === 'shift_l');
    const color = isLeftFn ? colors.left : colors.right;
    state.fallingNotes.push({
      key: rk, currentY: keyObj.antennaTop - 20, height: 15 + Math.random() * 25,
      color, antennaBlock: null, portBlock: null, antennaDeleted: false, pianoData: null, isTap: true,
    });
    return;
  }

  if (playableKeys.length === 0) return;
  const rk = playableKeys[Math.floor(Math.random() * playableKeys.length)];
  const keyObj = state.keyObjects[rk];
  const noteInfo = getNote(rk);
  const isLeft = isLeftKey(rk);
  const color = isLeft ? colors.left : colors.right;
  const noteHeight = 80 + Math.random() * 200;
  const noteName = noteInfo.match(/^([A-G]#?)/)[1];
  const pianoKeysForNote = state.pianoNoteMap[noteName];

  if (pianoKeysForNote && pianoKeysForNote.length > 0) {
    const rpk = pianoKeysForNote[Math.floor(Math.random() * pianoKeysForNote.length)];
    const pianoBottom = 1080 - 40, pianoTop = pianoBottom - PIANO_HEIGHT;
    const isAccidental = noteInfo.includes('#');
    const blockFill = isAccidental ? colors.grayDark : colors.white;
    const blockWidth = rpk.isBlack ? Math.round(11 * 1.5) : Math.round(18 * 1.5);
    const startY = MX_SPAWN_BOUNDARY - noteHeight / 2;
    const highlight = scene.add.rectangle(rpk.x, rpk.y, blockWidth, rpk.isBlack ? 90 : 140, colors.purple, 0).setDepth(2);
    const pianoBlock = scene.add.rectangle(rpk.x, startY, blockWidth, noteHeight, blockFill, 0.9);
    pianoBlock.setStrokeStyle(2, colors.purple); pianoBlock.setDepth(10);

    state.fallingNotes.push({
      key: rk, currentY: keyObj.antennaTop - noteHeight / 2, height: noteHeight, color,
      antennaBlock: null, portBlock: null, antennaDeleted: false,
      pianoData: { x: rpk.x, y: rpk.y, width: blockWidth, height: rpk.isBlack ? 90 : 140,
        pianoTop, pianoBottom, spawnBoundary: MX_SPAWN_BOUNDARY, blockWidth },
      pianoY: startY, pianoHeight: noteHeight, pianoBlock, pianoHighlight: highlight,
      pianoDeleted: false, isAccidental,
    });
  } else {
    state.fallingNotes.push({
      key: rk, currentY: keyObj.antennaTop - noteHeight / 2, height: noteHeight, color,
      antennaBlock: null, portBlock: null, antennaDeleted: false, pianoData: null,
    });
  }
}
