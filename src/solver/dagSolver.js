// ═══════════════════════════════════════════════════════════
//  DAG SOLVER — CORE
//  Beam-search Viterbi DP with NO HAND CROSSING constraint.
//  Right hand lowest MIDI ≥ Left hand highest MIDI (overlap OK).
//  Uses dynamic key mapping from keyMapping.js.
// ═══════════════════════════════════════════════════════════

import { noteNamesArr } from '../core/constants.js';
import { getSolverKeyArrays } from '../core/keyMapping.js';

export function solvePlan(notes) {
  const t0 = performance.now();
  const BEAM_K = 200;
  const SEMI_MIN = -6, SEMI_MAX = 5;

  if (!notes || notes.length === 0) {
    return {
      plan: [],
      initialState: { leftOctave: 3, rightOctave: 5, leftSemitone: 0, rightSemitone: 0 },
      stateTimeline: [],
      stats: { totalNotes: 0, coveredNotes: 0, skippedNotes: 0 },
    };
  }

  // Get current key mappings (supports custom remapping)
  const { leftKeys, rightKeys } = getSolverKeyArrays();

  // If both hands cover all 12 chromatic notes (piano layout), semitone shifts
  // are useless and actively harmful — restrict to semi=0 only.
  const leftNiSet  = new Set(leftKeys.map(k => k.ni));
  const rightNiSet = new Set(rightKeys.map(k => k.ni));
  const fullRange  = leftNiSet.size === 12 && rightNiSet.size === 12;
  const semiMin = fullRange ? 0 : SEMI_MIN;
  const semiMax = fullRange ? 0 : SEMI_MAX;

  function keyForMidi(midi, hand, oct, semi) {
    const keys = hand === 'left' ? leftKeys : rightKeys;
    const target = midi - (oct + 1) * 12 - semi;
    if (target < 0 || target > 11) return null;
    const found = keys.find(k => k.ni === target);
    return found ? found.key : null;
  }

  // Group notes into events (within 30ms)
  const events = [];
  let curEvent = { notes: [{ midi: notes[0].midi, startSec: notes[0].startSec, durationSec: notes[0].durationSec, origIdx: 0 }] };
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].startSec - curEvent.notes[0].startSec < 0.03) {
      curEvent.notes.push({ midi: notes[i].midi, startSec: notes[i].startSec, durationSec: notes[i].durationSec, origIdx: i });
    } else {
      events.push(curEvent);
      curEvent = { notes: [{ midi: notes[i].midi, startSec: notes[i].startSec, durationSec: notes[i].durationSec, origIdx: i }] };
    }
  }
  events.push(curEvent);

  // Cap at 6 per event
  for (const ev of events) {
    if (ev.notes.length > 6) {
      ev.notes.sort((a, b) => a.midi - b.midi);
      ev.notes = ev.notes.slice(0, 6);
    }
  }

  function findSolutionsForEvent(ev) {
    const n = ev.notes.length;
    if (n === 0 || n > 6) return [];
    const solutions = [];
    const limit = 1 << n;
    for (let mask = 0; mask < limit; mask++) {
      const leftNotes = [], rightNotes = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) rightNotes.push(ev.notes[i]);
        else leftNotes.push(ev.notes[i]);
      }
      if (leftNotes.length > 3 || rightNotes.length > 3) continue;

      // ══ NO-CROSSING CONSTRAINT ══
      // Right hand's lowest MIDI must be >= left hand's highest MIDI
      // (overlap is OK, crossing is forbidden)
      if (leftNotes.length > 0 && rightNotes.length > 0) {
        const maxLeft = Math.max(...leftNotes.map(n => n.midi));
        const minRight = Math.min(...rightNotes.map(n => n.midi));
        if (minRight < maxLeft) continue; // REJECT: right hand crossed below left
      }

      const leftStates = findHandStates(leftNotes, 'left');
      const rightStates = findHandStates(rightNotes, 'right');

      for (const ls of leftStates) {
        for (const rs of rightStates) {
          solutions.push({
            leftOct: ls.oct, leftSemi: ls.semi,
            rightOct: rs.oct, rightSemi: rs.semi,
            needsLeft: leftNotes.length > 0,
            needsRight: rightNotes.length > 0,
            assignments: [...ls.assignments, ...rs.assignments],
            leftMidis: leftNotes.map(n => n.midi),
            rightMidis: rightNotes.map(n => n.midi),
          });
        }
      }
    }
    return solutions;
  }

  function findHandStates(handNotes, hand) {
    if (handNotes.length === 0) return [{ oct: -1, semi: 0, assignments: [] }];
    const results = [];
    for (let oct = 0; oct <= 7; oct++) {
      for (let semi = semiMin; semi <= semiMax; semi++) {
        const assigns = [];
        const usedKeys = new Set();
        let valid = true;
        for (const note of handNotes) {
          const k = keyForMidi(note.midi, hand, oct, semi);
          if (!k || usedKeys.has(k)) { valid = false; break; }
          usedKeys.add(k);
          assigns.push({ origIdx: note.origIdx, hand, key: k, midi: note.midi, startSec: note.startSec, durationSec: note.durationSec });
        }
        if (valid) results.push({ oct, semi, assignments: assigns });
      }
    }
    return results;
  }

  const eventSolutions = events.map(ev => findSolutionsForEvent(ev));
  function stateKey(lo, ls, ro, rs) { return `${lo},${ls},${ro},${rs}`; }

  // Initial state based on piece range
  const allMidis = notes.map(n => n.midi);
  const midMin = Math.min(...allMidis), midMax = Math.max(...allMidis);
  const midMid = Math.round((midMin + midMax) / 2);
  let initLO = Math.max(0, Math.min(7, Math.floor(midMid / 12) - 2));
  let initRO = Math.min(7, initLO + 1);

  let beam = new Map();
  beam.set(stateKey(initLO, 0, initRO, 0), { cost: 0, backtrack: null });
  for (let lo = Math.max(0, initLO - 1); lo <= Math.min(7, initLO + 1); lo++) {
    for (let ro = Math.max(0, initRO - 1); ro <= Math.min(7, initRO + 1); ro++) {
      const sk = stateKey(lo, 0, ro, 0);
      if (!beam.has(sk)) beam.set(sk, { cost: 5, backtrack: null });
    }
  }

  const beamHistory = [beam];

  for (let ei = 0; ei < events.length; ei++) {
    const sols = eventSolutions[ei];
    const prevTime = ei > 0 ? events[ei - 1].notes[0].startSec : 0;
    const curTime = events[ei].notes[0].startSec;
    const gap = curTime - prevTime;
    const nextBeam = new Map();

    if (sols.length === 0) {
      for (const [sk, entry] of beam) {
        nextBeam.set(sk, { cost: entry.cost, backtrack: { prevKey: sk, prevEventIdx: ei, solution: null } });
      }
    } else {
      for (const [prevSk, prevEntry] of beam) {
        const [plo, pls, pro, prs] = prevSk.split(',').map(Number);
        for (const sol of sols) {
          const nlo = sol.needsLeft ? sol.leftOct : plo;
          const nls = sol.needsLeft ? sol.leftSemi : pls;
          const nro = sol.needsRight ? sol.rightOct : pro;
          const nrs = sol.needsRight ? sol.rightSemi : prs;

          const totalShifts = Math.abs(nlo - plo) + Math.abs(nls - pls) + Math.abs(nro - pro) + Math.abs(nrs - prs);
          let shiftCost = totalShifts * 10;
          if (totalShifts > 0 && gap < 0.5) shiftCost += 1000;
          if (totalShifts > 1 && gap < 0.5 * totalShifts) shiftCost += 500 * totalShifts;

          // No crossing penalty (already filtered, but add soft cost for near-crossing)
          let assignCost = 0;

          // Prefer high notes on right hand, low notes on left hand.
          if (sol.needsLeft && !sol.needsRight) {
            for (const midi of sol.leftMidis) {
              if (midi > midMid) assignCost += 20;
            }
          } else if (!sol.needsLeft && sol.needsRight) {
            for (const midi of sol.rightMidis) {
              if (midi < midMid) assignCost += 20;
            }
          }

          if (sol.needsLeft && sol.needsRight) {
            const maxL = Math.max(...sol.leftMidis);
            const minR = Math.min(...sol.rightMidis);
            if (maxL === minR) assignCost += 5; // Slight cost for exact overlap
          }

          const totalCost = prevEntry.cost + shiftCost + assignCost;
          const nsk = stateKey(nlo, nls, nro, nrs);
          if (!nextBeam.has(nsk) || nextBeam.get(nsk).cost > totalCost) {
            nextBeam.set(nsk, { cost: totalCost, backtrack: { prevKey: prevSk, prevEventIdx: ei, solution: sol } });
          }
        }
      }
    }

    if (nextBeam.size > BEAM_K) {
      const sorted = [...nextBeam.entries()].sort((a, b) => a[1].cost - b[1].cost);
      beam = new Map(sorted.slice(0, BEAM_K));
    } else {
      beam = nextBeam;
    }
    beamHistory.push(beam);
  }

  // Backtrack
  let bestKey = null, bestCost = Infinity;
  for (const [sk, entry] of beam) {
    if (entry.cost < bestCost) { bestCost = entry.cost; bestKey = sk; }
  }

  const initState = { leftOctave: initLO, rightOctave: initRO, leftSemitone: 0, rightSemitone: 0 };
  if (!bestKey) {
    console.log(`[Solver] No valid plan found`);
    return { plan: [], initialState: initState, stateTimeline: [], stats: { totalNotes: notes.length, coveredNotes: 0, skippedNotes: notes.length } };
  }

  const path = [];
  let curKey = bestKey;
  for (let ei = events.length - 1; ei >= 0; ei--) {
    const entry = beamHistory[ei + 1].get(curKey);
    if (!entry || !entry.backtrack) break;
    path.unshift({ stateKey: curKey, solution: entry.backtrack.solution, eventIdx: ei });
    curKey = entry.backtrack.prevKey;
  }

  const plan = [];
  const timeline = [];
  const coveredNotes = new Set();
  const [slo, sls, sro, srs] = curKey.split(',').map(Number);
  const actualInitState = { leftOctave: slo, rightOctave: sro, leftSemitone: sls, rightSemitone: srs };
  timeline.push({ timeSec: 0, ...actualInitState });

  let prevLO = slo, prevLS = sls, prevRO = sro, prevRS = srs;

  for (const step of path) {
    const [nlo, nls, nro, nrs] = step.stateKey.split(',').map(Number);
    const curTime = events[step.eventIdx].notes[0].startSec;

    const shifts = [];
    let tmp;
    tmp = prevLO; while (tmp < nlo) { shifts.push({ type: 'shift', key: 'tab', hand: 'left', description: 'octaveLeft +1' }); tmp++; }
    while (tmp > nlo) { shifts.push({ type: 'shift', key: 'shift_l', hand: 'left', description: 'octaveLeft -1' }); tmp--; }
    tmp = prevLS; while (tmp < nls) { shifts.push({ type: 'shift', key: 'q', hand: 'left', description: 'semitoneLeft +1' }); tmp++; }
    while (tmp > nls) { shifts.push({ type: 'shift', key: 'a', hand: 'left', description: 'semitoneLeft -1' }); tmp--; }
    tmp = prevRO; while (tmp < nro) { shifts.push({ type: 'shift', key: 'enter', hand: 'right', description: 'octaveRight +1' }); tmp++; }
    while (tmp > nro) { shifts.push({ type: 'shift', key: 'shift_r', hand: 'right', description: 'octaveRight -1' }); tmp--; }
    tmp = prevRS; while (tmp < nrs) { shifts.push({ type: 'shift', key: 'p', hand: 'right', description: 'semitoneRight +1' }); tmp++; }
    while (tmp > nrs) { shifts.push({ type: 'shift', key: ';', hand: 'right', description: 'semitoneRight -1' }); tmp--; }

    for (let si = 0; si < shifts.length; si++) {
      shifts[si].timeSec = Math.max(0, curTime - (shifts.length - si) * 0.5);
      plan.push(shifts[si]);
    }

    if (step.solution) {
      for (const a of step.solution.assignments) {
        plan.push({ type: 'note', noteIndex: a.origIdx, hand: a.hand, key: a.key, midi: a.midi, startSec: a.startSec, durationSec: a.durationSec });
        coveredNotes.add(a.origIdx);
      }
    }

    timeline.push({ timeSec: curTime, leftOctave: nlo, rightOctave: nro, leftSemitone: nls, rightSemitone: nrs });
    prevLO = nlo; prevLS = nls; prevRO = nro; prevRS = nrs;
  }

  for (let i = 0; i < notes.length; i++) {
    if (!coveredNotes.has(i)) plan.push({ type: 'skip', noteIndex: i, midi: notes[i].midi, startSec: notes[i].startSec, reason: 'no feasible assignment' });
  }

  plan.sort((a, b) => (a.timeSec || a.startSec || 0) - (b.timeSec || b.startSec || 0));

  const stats = { totalNotes: notes.length, coveredNotes: coveredNotes.size, skippedNotes: notes.length - coveredNotes.size };
  console.log(`[Solver] ${stats.coveredNotes}/${stats.totalNotes} covered, ${plan.filter(p => p.type === 'shift').length} shifts, ${(performance.now() - t0).toFixed(0)}ms`);

  return { plan, initialState: actualInitState, stateTimeline: timeline, stats };
}
