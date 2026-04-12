// ═══════════════════════════════════════════════════════════
//  MUSICXML / MIDI FILE HANDLING
//  Supports: .xml, .musicxml, .mxl, .mid, .midi
// ═══════════════════════════════════════════════════════════

import state, { resetScore } from '../core/state.js';
import settings from '../core/settings.js';
import { unzip } from '../core/unzip.js';
import { mxParseMusicXML } from './parser.js';
import { parseMidi } from './midiParser.js';
import { solvePlan } from '../solver/dagSolver.js';
import { solverBuildLookups, solverPrepareBlocks, mxResetAutoShiftToTime } from '../solver/solverVisuals.js';
import { resetAutoSlowDown } from './autoSlowDown.js';
import { mxClearFallingNotes } from './playback.js';
import { mxClearSolverBlocks } from '../solver/solverVisuals.js';
import { mxUpdateButtons } from './controls.js';
import { showTeklet } from '../ui/moreOverlay.js';
import { updateOct } from '../ui/piano.js';

export function mxHandleFile(input) {
  const f = input.files[0];
  if (!f) return;
  state.mxFileName = f.name;
  const ext = f.name.split('.').pop().toLowerCase();

  if (ext === 'mid' || ext === 'midi') {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const notes = parseMidi(reader.result);
        if (!notes.length) { alert('No notes found in MIDI file.'); return; }
        mxLoadFromNotes(notes, f.name.replace(/\.[^.]+$/, ''));
      } catch (e) {
        console.error('MIDI load error:', e);
        alert('Error loading MIDI: ' + e.message);
      }
    };
    reader.readAsArrayBuffer(f);
  } else if (ext === 'mxl') {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const files = await unzip(reader.result);
        let xmlContent = null;
        if (files['META-INF/container.xml']) {
          const containerXml = new TextDecoder().decode(files['META-INF/container.xml']);
          const cDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
          const rootfile = cDoc.querySelector('rootfile');
          if (rootfile) {
            const fullPath = rootfile.getAttribute('full-path');
            if (fullPath && files[fullPath]) xmlContent = new TextDecoder().decode(files[fullPath]);
          }
        }
        if (!xmlContent) {
          for (const [name, data] of Object.entries(files)) {
            if ((name.endsWith('.xml') && !name.startsWith('META-INF')) || name.endsWith('.musicxml')) {
              xmlContent = new TextDecoder().decode(data);
              break;
            }
          }
        }
        if (!xmlContent) throw new Error('No MusicXML found in .mxl');
        mxLoadFromXml(xmlContent);
      } catch (e) {
        console.error('MXL load error:', e);
        alert('Error loading .mxl: ' + e.message);
      }
    };
    reader.readAsArrayBuffer(f);
  } else {
    // .xml / .musicxml
    const reader = new FileReader();
    reader.onload = () => {
      try { mxLoadFromXml(reader.result); } catch (e) {
        console.error('XML load error:', e);
        alert('Error loading XML: ' + e.message);
      }
    };
    reader.readAsText(f);
  }
  input.value = '';
}

export function mxLoadFromXml(xmlStr) {
  state.mxAllParts = mxParseMusicXML(xmlStr);
  if (state.mxAllParts.length === 0) { alert('No parts found in file.'); return; }

  if (state.mxAllParts.length === 1) {
    mxSelectPart(0);
  } else {
    const sel = document.getElementById('partSelect');
    sel.innerHTML = '';
    state.mxAllParts.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${p.name} (${p.notes.length} notes)`;
      sel.appendChild(opt);
    });
    document.getElementById('partModalBg').classList.add('open');
  }
}

/**
 * Directly load a flat notes array (from MIDI parser or Library scene).
 * notes: [{ midi, startSec, durationSec, partId? }, ...]
 */
export function mxLoadFromNotes(notes, name = 'Imported') {
  // Wrap in the same part structure
  state.mxAllParts = [{ id: 'imported', name, notes }];
  mxSelectPart(0);
}

export function mxConfirmPart() {
  const idx = +document.getElementById('partSelect').value;
  document.getElementById('partModalBg').classList.remove('open');
  mxSelectPart(idx);
}

export function mxSelectPart(idx) {
  const part = state.mxAllParts[idx];
  state.mxNotes = part.notes;
  state.mxLoaded = true;
  state.mxPlaying = false;
  state.mxWaitingForFirstPress = false;

  state.mxCurTime = settings.startOnFirstPress ? 0 : -2;
  state.mxPlayed.clear();
  state.mxLastTs = null;
  state.mxEventCounter = 0;
  mxClearFallingNotes();
  mxClearSolverBlocks();
  resetScore();
  state.score.totalNotes = part.notes.length;

  const result = solvePlan(state.mxNotes);
  state.solverPlan = result.plan;
  state.solverInitialState = result.initialState;
  state.solverStateTimeline = result.stateTimeline;
  state.solverStats = result.stats;
  state.solverReady = true;
  state._autoShiftIdx = 0;
  solverBuildLookups(state.solverPlan);

  if (state.solverInitialState) {
    state.octaveLeft = state.solverInitialState.leftOctave;
    state.octaveRight = state.solverInitialState.rightOctave;
    state.semitoneLeft = state.solverInitialState.leftSemitone;
    state.semitoneRight = state.solverInitialState.rightSemitone;
    if (state.mxScene) updateOct(state.mxScene);
  }

  // Prime the auto-shift index and reset slow-down state
  mxResetAutoShiftToTime(state.mxCurTime);
  resetAutoSlowDown();

  if (state.mxScene) solverPrepareBlocks(state.mxScene);

  mxUpdateButtons();

  // Switch to main scene if currently in another scene, UNLESS we're in BeginnerScene
  if (window.__tekageGame) {
    const sceneManager = window.__tekageGame.scene;
    const inBeginner = sceneManager && sceneManager.isActive('BeginnerScene');
    if (!inBeginner) {
      showTeklet();
      if (sceneManager && !sceneManager.isActive('MainScene')) {
        sceneManager.stop('LibraryScene');
        sceneManager.start('MainScene');
      }
    }
  } else {
    showTeklet();
  }
}
