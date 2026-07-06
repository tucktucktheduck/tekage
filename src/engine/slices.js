/* ════════════════════════════════════════════════════════════
   2.4 · GENERALIZED SLICES + N-SLICE SOLVER
   The customization core (founder: "two on the left hand and 18
   on the right, or one mega slice, or eight slices all over").
   A SLICE is a named group of computer keys, each at a fixed
   semitone OFFSET from the slice's movable ANCHOR (a MIDI note).
   Shifting a slice moves its anchor by `step` semitones (12 for
   the standard octave slices). The solver below is the old
   two-hand beam-search Viterbi generalized to any number of
   slices of any shape: state = the tuple of slice anchors.
   solvePlan() (solvePlan.js) is now a thin adapter that feeds
   the standard two octave slices through this and converts the
   result back to the legacy left/right-octave shape the runtime
   speaks — so today's game runs on this core, and tomorrow's
   custom configs need no new solver.
   ════════════════════════════════════════════════════════════ */

// keys: { computerKey: offset } — offset is semitones from the anchor, either a
// number or a pitch-class name ('C#' → 1) for legacy octave maps.
function makeSlice(id, keys, opts){
  opts = opts || {};
  const entries = Object.entries(keys || {})
    .map(([key, off]) => ({ key, off: (typeof off === 'number') ? off : NOTE_IDX[off] }))
    .filter(e => Number.isFinite(e.off));
  const offs = entries.map(e => e.off);
  const byOff = {};
  for (const e of entries) (byOff[e.off] = byOff[e.off] || []).push(e.key);
  return {
    id,
    keys: entries,
    offs: [...new Set(offs)].sort((a, b) => a - b),
    byOff,
    span: offs.length ? Math.max(...offs) - Math.min(...offs) : 0,
    step: opts.step || 12,
    minAnchor: (opts.minAnchor != null) ? opts.minAnchor : 0,
    maxAnchor: (opts.maxAnchor != null) ? opts.maxAnchor : 108,
    order: (opts.order != null) ? opts.order : 0,   // spatial rank, low = "left"
  };
}

// anchors at which `slice` can play `midi` (on the slice's shift grid). The grid
// is RELATIVE to the slice's base anchor (its initialAnchor, else minAnchor), not
// absolute multiples of step — so a key stays bound to its note when `step` changes
// (docs/14: shifting only uncovers the octave; H is always a C). For the shipped
// presets the base is a multiple of 12, so this is identical to the old a%step grid.
function anchorsFor(slice, midi){
  const out = [];
  const base = (slice.initialAnchor != null) ? slice.initialAnchor : slice.minAnchor;
  const step = slice.step || 12;
  for (const off of slice.offs) {
    const a = midi - off;
    if (a < slice.minAnchor || a > slice.maxAnchor) continue;
    if ((((a - base) % step) + step) % step !== 0) continue;
    out.push(a);
  }
  return out;
}

// all (anchor, key-assignment) states letting `slice` play `subset` at once
function sliceStates(subset, slice){
  if (!subset.length) return [{ anchor: null, assigns: [] }];
  let anchors = anchorsFor(slice, subset[0].midi);
  for (let i = 1; i < subset.length && anchors.length; i++) {
    const s = new Set(anchorsFor(slice, subset[i].midi));
    anchors = anchors.filter(a => s.has(a));
  }
  const out = [];
  for (const a of anchors) {
    const used = new Set(); const assigns = []; let ok = true;
    for (const note of subset) {
      const options = slice.byOff[note.midi - a] || [];
      const k = options.find(x => !used.has(x));
      if (!k) { ok = false; break; }
      used.add(k);
      assigns.push({ origIdx: note.origIdx, slice: slice.id, key: k, midi: note.midi,
                     startSec: note.startSec, durationSec: note.durationSec });
    }
    if (ok) out.push({ anchor: a, assigns });
  }
  return out;
}

/* solvePlanSlices(notes, slices, opts) →
   { plan, initialAnchors, stateTimeline, slicesUsed }
   plan entries: {type:'note', noteIndex, slice, key, midi, startSec, durationSec}
                 {type:'shift', slice, dir, timeSec}
                 {type:'skip', noteIndex, midi, startSec}                      */
function solvePlanSlices(notes, slices, opts){
  opts = opts || {};
  const BEAM_K   = opts.beamK || 200;
  const MAX_COMBOS = 4096;               // assignment-enumeration budget / event
  const N = slices.length;
  const empty = () => ({ plan: [], initialAnchors: {}, stateTimeline: [], slicesUsed: new Set() });
  if (!notes.length || !N) return empty();

  // group onsets within 30ms into events
  const events = []; let cur = { notes: [{ ...notes[0], origIdx: 0 }] };
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].startSec - cur.notes[0].startSec < 0.03) cur.notes.push({ ...notes[i], origIdx: i });
    else { events.push(cur); cur = { notes: [{ ...notes[i], origIdx: i }] }; }
  }
  events.push(cur);
  // per-event note cap: total key capacity, and the N^n enumeration budget
  const capacity = slices.reduce((s, sl) => s + sl.keys.length, 0);
  const comboCap = Math.max(1, Math.floor(Math.log(MAX_COMBOS) / Math.log(Math.max(2, N))));
  const evCap = Math.min(10, capacity, comboCap);
  for (const ev of events) {
    if (ev.notes.length > evCap) {
      ev.notes.sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0));
      ev.notes = ev.notes.slice(0, evCap);
      ev.notes.sort((a, b) => a.midi - b.midi);
    }
  }

  const bySpatial = [...slices].sort((a, b) => a.order - b.order);
  const hasSrcHands = notes.some(n => n.srcHand === 'left') && notes.some(n => n.srcHand === 'right');

  // enumerate every playable way an event can be split across the slices
  function enumerateSplits(evNotes){
    const n = evNotes.length, out = [];
    const assign = new Array(n).fill(0);
    const total = Math.pow(N, n);
    for (let code = 0; code < total; code++) {
      let c = code;
      for (let i = 0; i < n; i++) { assign[i] = c % N; c = Math.floor(c / N); }
      const groups = slices.map(() => []);
      for (let i = 0; i < n; i++) groups[assign[i]].push(evNotes[i]);
      // per-slice feasible states; cartesian product of anchors (bounded)
      const perSlice = groups.map((g, si) => sliceStates(g, slices[si]));
      if (perSlice.some(s => !s.length)) continue;
      // soft penalties shared by every anchor combo of this split
      let handMiss = 0, voiceMiss = 0;
      for (let si = 0; si < N; si++) {
        for (const x of groups[si]) {
          if (hasSrcHands && x.srcHand && x.srcHand !== slices[si].id) handMiss++;
          if (x.voice && x.voice !== slices[si].id && slices.some(s => s.id === x.voice)) voiceMiss++;
        }
      }
      // crossing: spatially-lower slices playing above spatially-higher ones
      let crossPen = 0;
      for (let a = 0; a < bySpatial.length; a++) for (let b = a + 1; b < bySpatial.length; b++) {
        const ga = groups[slices.indexOf(bySpatial[a])], gb = groups[slices.indexOf(bySpatial[b])];
        if (!ga.length || !gb.length) continue;
        const overlap = Math.max(...ga.map(x => x.midi)) - Math.min(...gb.map(x => x.midi));
        if (overlap > 0) crossPen += 18 + overlap;
      }
      // walk the anchor product (cap it — big products only occur on tiny events)
      const idx = new Array(N).fill(0); let combos = 0;
      while (combos++ < 64) {
        const anchors = perSlice.map((s, si) => groups[si].length ? s[idx[si]].anchor : null);
        const assigns = [];
        for (let si = 0; si < N; si++) if (groups[si].length) assigns.push(...perSlice[si][idx[si]].assigns);
        out.push({ anchors, assigns, groups: groups.map(g => g.length), handMiss, voiceMiss, crossPen,
                   groupMidis: groups.map(g => g.map(x => x.midi)) });
        let d = 0;
        while (d < N && (++idx[d] >= perSlice[d].length)) { idx[d] = 0; d++; }
        if (d === N) break;
      }
    }
    return out;
  }
  // never skip a whole event: shed least-salient notes until a split exists
  function eventSolutions(ev){
    let evNotes = [...ev.notes];
    let out = enumerateSplits(evNotes);
    while (!out.length && evNotes.length > 1) {
      let worst = 0;
      for (let i = 1; i < evNotes.length; i++)
        if ((evNotes[i].salience ?? 0) < (evNotes[worst].salience ?? 0)) worst = i;
      evNotes.splice(worst, 1);
      out = enumerateSplits(evNotes);
    }
    return out;
  }
  const sols = events.map(eventSolutions);

  // initial anchors: spread the slices across the song's register, on-grid
  const midis = notes.map(n => n.midi);
  const lo = Math.min(...midis), hi = Math.max(...midis), mid = Math.round((lo + hi) / 2);
  const q = (slice, v) => clamp(Math.round(v / slice.step) * slice.step, slice.minAnchor, slice.maxAnchor);
  const init = {};
  bySpatial.forEach((sl, i) => {
    const center = N === 1 ? mid : lo + (i + 0.5) / N * (hi - lo);
    init[sl.id] = q(sl, center - sl.span / 2);
  });
  // don't boot two slices onto the same anchor — spread them a step apart
  for (let i = 1; i < bySpatial.length; i++) {
    const cur = bySpatial[i], prev = bySpatial[i - 1];
    if (init[cur.id] <= init[prev.id]) init[cur.id] = q(cur, init[prev.id] + cur.step);
  }

  const skey = a => slices.map(s => a[s.id]).join(',');
  const parse = k => { const v = k.split(',').map(Number); const o = {}; slices.forEach((s, i) => o[s.id] = v[i]); return o; };
  let beam = new Map([[skey(init), { cost: 0, bt: null }]]);
  // seed neighbors one shift away in each direction
  for (let si = 0; si < N; si++) for (const d of [-1, +1]) {
    const a = { ...init }; a[slices[si].id] = q(slices[si], a[slices[si].id] + d * slices[si].step);
    const k = skey(a); if (!beam.has(k)) beam.set(k, { cost: 5, bt: null });
  }

  const hist = [beam];
  for (let ei = 0; ei < events.length; ei++) {
    const cands = sols[ei];
    const prevT = ei > 0 ? events[ei - 1].notes[0].startSec : 0;
    const curT = events[ei].notes[0].startSec, gap = curT - prevT;
    const next = new Map();
    if (!cands.length) {
      for (const [key, en] of beam) next.set(key, { cost: en.cost, bt: { prevKey: key, sol: null } });
    } else {
      for (const [pk, pe] of beam) {
        const prev = parse(pk);
        for (const s of cands) {
          const anch = { ...prev };
          let shifts = 0;
          for (let si = 0; si < N; si++) if (s.anchors[si] != null) {
            shifts += Math.abs(s.anchors[si] - prev[slices[si].id]) / slices[si].step;
            anch[slices[si].id] = s.anchors[si];
          }
          let cost = shifts * 10;
          if (shifts > 0 && gap < 0.5) cost += 1000;
          if (shifts > 1 && gap < 0.5 * shifts) cost += 500 * shifts;
          // register preference: a lone spatially-low slice shouldn't grab high notes
          if (N > 1) {
            const active = s.groups.map((g, si) => g ? si : -1).filter(x => x >= 0);
            if (active.length === 1) {
              const si = active[0], rank = bySpatial.indexOf(slices[si]) / (N - 1);
              for (const m of s.groupMidis[si]) {
                if (rank < 0.5 && m > mid) cost += 20;
                if (rank >= 0.5 && m < mid) cost += 20;
              }
            }
          }
          if (s.crossPen)  cost += s.crossPen;
          if (s.handMiss)  cost += s.handMiss * 12;
          if (s.voiceMiss) cost += s.voiceMiss * 6;
          const tot = pe.cost + cost, nk = skey(anch);
          if (!next.has(nk) || next.get(nk).cost > tot) next.set(nk, { cost: tot, bt: { prevKey: pk, sol: s } });
        }
      }
    }
    beam = next.size > BEAM_K ? new Map([...next.entries()].sort((a, b) => a[1].cost - b[1].cost).slice(0, BEAM_K)) : next;
    hist.push(beam);
  }

  let bestKey = null, bestCost = Infinity;
  for (const [k, e] of beam) if (e.cost < bestCost) { bestCost = e.cost; bestKey = k; }
  if (!bestKey) return empty();

  const path = []; let ck = bestKey;
  for (let ei = events.length - 1; ei >= 0; ei--) {
    const e = hist[ei + 1].get(ck); if (!e || !e.bt) break;
    path.unshift({ stateKey: ck, sol: e.bt.sol, ei }); ck = e.bt.prevKey;
  }
  const initialAnchors = parse(ck);
  const plan = [], timeline = [{ timeSec: 0, anchors: { ...initialAnchors } }];
  const covered = new Set(); let prevA = { ...initialAnchors };

  for (const step of path) {
    const nowA = parse(step.stateKey);
    const curT = events[step.ei].notes[0].startSec;
    const prevEvT = step.ei > 0 ? events[step.ei - 1].notes[0].startSec : 0;
    const shifts = [];
    for (const sl of slices) {
      let a = prevA[sl.id];
      while (a < nowA[sl.id]) { shifts.push({ type: 'shift', slice: sl.id, dir: +1 }); a += sl.step; }
      while (a > nowA[sl.id]) { shifts.push({ type: 'shift', slice: sl.id, dir: -1 }); a -= sl.step; }
    }
    shifts.forEach((sh, si) => {
      sh.timeSec = Math.max(prevEvT + 0.08, curT - (shifts.length - si) * 0.85, 0);
      plan.push(sh);
    });
    if (step.sol) for (const a of step.sol.assigns) {
      plan.push({ type: 'note', noteIndex: a.origIdx, slice: a.slice, key: a.key,
                  midi: a.midi, startSec: a.startSec, durationSec: a.durationSec });
      covered.add(a.origIdx);
    }
    timeline.push({ timeSec: curT, anchors: { ...nowA } });
    prevA = nowA;
  }
  for (let i = 0; i < notes.length; i++)
    if (!covered.has(i)) plan.push({ type: 'skip', noteIndex: i, midi: notes[i].midi, startSec: notes[i].startSec });
  plan.sort((a, b) => (a.timeSec ?? a.startSec ?? 0) - (b.timeSec ?? b.startSec ?? 0));
  const slicesUsed = new Set(plan.filter(e => e.type === 'note').map(e => e.slice));
  return { plan, initialAnchors, stateTimeline: timeline, slicesUsed };
}
