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

// ── Simplified-part extraction ──────────────────────────────
// For any part that contains simultaneous notes (chords), derive
// "Easy" (melody + recurring bass) and "Melody Only" (top note per
// 30ms window) sub-parts and prepend them before the original part.
// Applied universally after every file load (MIDI, MXL, or XML).
function addSimplifiedParts(parts) {
  const result = [];
  for (const part of parts) {
    const sorted = [...part.notes].sort((a, b) => a.startSec - b.startSec);
    const hasChords = sorted.some((n, i) => i > 0 && n.startSec - sorted[i - 1].startSec < 0.03);

    if (hasChords) {
      const melodyNotes = [];
      const windowNonMelody = [];
      let i = 0;
      while (i < sorted.length) {
        let j = i + 1;
        while (j < sorted.length && sorted[j].startSec - sorted[i].startSec < 0.03) j++;
        const win = sorted.slice(i, j);
        const top = win.reduce((a, b) => a.midi > b.midi ? a : b);
        melodyNotes.push({ midi: top.midi, startSec: top.startSec, durationSec: top.durationSec, partId: `${part.id}-melody` });
        windowNonMelody.push(win.filter(n => n !== top));
        i = j;
      }

      // Count how many windows each non-melody pitch recurs in
      const bassPitchCounts = new Map();
      for (const nonMelody of windowNonMelody) {
        const seen = new Set(nonMelody.map(n => n.midi));
        for (const midi of seen) bassPitchCounts.set(midi, (bassPitchCounts.get(midi) || 0) + 1);
      }
      const threshold = Math.max(3, Math.floor(melodyNotes.length * 0.15));
      const persistentPitches = new Set(
        [...bassPitchCounts.entries()].filter(([, c]) => c >= threshold).map(([m]) => m)
      );

      if (persistentPitches.size > 0) {
        // Easy = melody + lowest persistent bass note per window
        const easyNotes = [];
        for (let wi = 0; wi < melodyNotes.length; wi++) {
          easyNotes.push({ ...melodyNotes[wi], partId: `${part.id}-easy` });
          const bassOptions = windowNonMelody[wi].filter(n => persistentPitches.has(n.midi));
          if (bassOptions.length > 0) {
            const bass = bassOptions.reduce((a, b) => a.midi < b.midi ? a : b);
            easyNotes.push({ midi: bass.midi, startSec: bass.startSec, durationSec: bass.durationSec, partId: `${part.id}-easy` });
          }
        }
        easyNotes.sort((a, b) => a.startSec - b.startSec);
        result.push({ id: `${part.id}-easy`,   name: 'Easy',        notes: easyNotes });
        result.push({ id: `${part.id}-melody`, name: 'Melody Only', notes: melodyNotes });
      } else {
        result.push({ id: `${part.id}-melody`, name: 'Melody Only', notes: melodyNotes });
      }
    }

    result.push(part);
  }
  return result;
}

export function mxHandleFile(input) {
  const f = input.files[0];
  if (!f) return;
  state.mxFileName = f.name;
  const ext = f.name.split('.').pop().toLowerCase();

  if (ext === 'mid' || ext === 'midi') {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { notes, trackParts } = parseMidi(reader.result);
        if (!notes.length) { alert('No notes found in MIDI file.'); return; }
        const songName = f.name.replace(/\.[^.]+$/, '');

        const allParts = addSimplifiedParts(trackParts);

        if (allParts.length <= 1) {
          // Single track, no chords — load directly
          mxLoadFromNotes(allParts[0]?.notes || notes, songName);
        } else {
          // Multiple parts — show part selector
          state.mxAllParts = allParts;
          const sel = document.getElementById('partSelect');
          sel.innerHTML = '';
          allParts.forEach((t, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${t.name} (${t.notes.length} notes)`;
            sel.appendChild(opt);
          });
          document.getElementById('partModalBg').classList.add('open');
        }
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
  const rawParts = mxParseMusicXML(xmlStr);
  if (rawParts.length === 0) { alert('No parts found in file.'); return; }

  state.mxAllParts = addSimplifiedParts(rawParts);

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

/**
 * Compute the "Rest Of Song" notes: notes that appear in the full parent part
 * but NOT in the current simplified part.  Matches by midi + startSec (±30 ms).
 * Returns [] when the current part is already the full part.
 */
function computeRosNotes(currentPartId, currentNotes) {
  // Derive the full-part ID by stripping known suffixes
  let fullId = null;
  if (currentPartId.endsWith('-easy'))   fullId = currentPartId.slice(0, -5);
  if (currentPartId.endsWith('-melody')) fullId = currentPartId.slice(0, -7);
  if (!fullId) return [];  // already the full part

  const fullPart = state.mxAllParts.find(p => p.id === fullId);
  if (!fullPart) return [];

  // Build a fast lookup: "midi:roundedStartCs" where Cs = centiseconds (10ms buckets)
  const currentKeys = new Set(
    currentNotes.map(n => `${n.midi}:${Math.round(n.startSec * 100)}`)
  );

  // Difference = full notes not present in current (within ±30 ms = ±3 centiseconds)
  return fullPart.notes.filter(n => {
    for (let d = -3; d <= 3; d++) {
      if (currentKeys.has(`${n.midi}:${Math.round(n.startSec * 100) + d}`)) return false;
    }
    return true;
  });
}

export function mxSelectPart(idx) {
  const part = state.mxAllParts[idx];
  state.mxNotes = part.notes;
  state.mxRosNotes = computeRosNotes(part.id, part.notes);
  state.mxRosPlayed = new Set();
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
