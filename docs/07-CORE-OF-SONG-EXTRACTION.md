# HANDOFF — Core-Extraction Loader & Difficulty-Level Generator for TKG (tekage)

**Audience:** an AI/engineer picking this up cold to *replace* the existing
difficulty/melody logic in the `tucktucktheduck/tekage` repo with a research-backed
"hero-note" extractor.
**You need no prior context.** Everything you need — what the current code does,
where it lives, what the data contract is, the research that justifies the new
pipeline, and the exact functions to write — is below.
**Deliverable you will produce:** a single pure module
`src/musicxml/coreExtractor.js` exporting `deriveVersions(parsed)`, plus three
small edits to existing files, that turns any loaded MIDI/MusicXML into
density-ranked **versions** (Easy / Medium / Hard + Baked-Melody) whose notes are
the *memorable core* of the song, sparse enough for TKG's two one-octave hands.

> This supersedes the earlier `HANDOFF-core-of-song-extraction.md`. That doc set
> the research target. This doc tells you concretely how to build it **into the
> actual repo as it exists today**, with the literature already surveyed.

---

## 0. TL;DR of what to do

1. Stop using `addSimplifiedParts()` in `src/musicxml/fileHandler.js`. It is a
   naïve top-note skyline (+ one static bass pitch). It is exactly the approach
   the research says fails on real music (octave bleed, voice-crossing, no
   rhythm, no structure).
2. Add `src/musicxml/coreExtractor.js` implementing the **6-stage pipeline** in
   §4: *meter grid → voice separation → structural segmentation → per-note
   salience → per-section voice selection (≤2 lines, rhythm preserved) → density
   thinning*.
3. Keep velocity. `src/musicxml/midiParser.js` currently **reads and discards**
   MIDI velocity. Velocity is one of the strongest salience cues. Preserve it
   (one-line fix, §5.2).
4. Emit the **versions array** (§3) ranked by density and surface it in the
   existing part-selector with density labels. Each version's `.notes` flows into
   the existing `solvePlan()` **unchanged** — you do not touch the solver.
5. Difficulty = density target + a fidelity/difficulty knob (Easy=sparsest core,
   Medium=two-voice lead+bass, Hard=full). This mirrors the
   *difficulty-controlled piano reduction* literature, where difficulty and
   fidelity move together monotonically.

---

## 1. The current repo, precisely (so you know what you're replacing)

Repo: `github.com/tucktucktheduck/tekage`. Single-page app (Vite), all logic in
`src/`. The pieces that matter:

### 1.1 `src/musicxml/midiParser.js` — `parseMidi(buffer)`
Binary SMF parser. Returns:
```
{ notes:      NoteObj[]   // all non-drum notes, merged, sorted by startSec
  trackParts: Part[] }    // per-MIDI-channel parts (ch 9 / drums excluded);
                          // if 2+ channels, an "All Parts" merged entry is prepended
```
`NoteObj = { midi, startSec, durationSec, partId }`. MIDI clamped to 21–108.
**Velocity is parsed then thrown away** — see §5.2.
`Part = { id, name, notes }`.

### 1.2 `src/musicxml/parser.js` — `mxParseMusicXML(xmlStr)`
MusicXML parser. Returns `Part[]` with the same `NoteObj` shape. It already
computes per-voice onset bookkeeping and true `<divisions>`/`<measure>` ticks,
**but discards metric position** after converting to seconds. (Recoverable — see
§5.3. MusicXML gives you true downbeats for free; don't waste them.)

### 1.3 `src/musicxml/fileHandler.js` — the thing you are replacing
`addSimplifiedParts(parts)` runs after every load. For each part that contains
chords (any two onsets within 30 ms) it generates:
- **"Melody Only"** = the single highest-MIDI note in each 30 ms window → a pure
  **skyline**.
- **"Easy"** = that skyline + the lowest "persistent" non-melody pitch per window,
  where "persistent" = a pitch that recurs in ≥ `max(3, 15% of windows)`.

These get **prepended** to the part list; the user picks one from a `<select>`.
`mxSelectPart(idx)` then calls `solvePlan(part.notes)` and renders.

**Why this is inadequate** (this is the whole reason for the rewrite):
- Pure skyline jumps between the real melody and accompaniment whenever an inner
  note pokes above the tune (octave bleed / voice-crossing — documented failure
  modes of skyline going back to Uitdenbogerd & Zobel 1998 and the MiDiLiB
  project).
- The "Easy" bass is **one static pitch**, not a line — it has no rhythm, so it
  kills the groove. Real hooks are frequently *rhythmic basslines* (Billie Jean,
  Ice Ice Baby): rhythm is part of the core, not filler.
- No metric awareness (strong-beat notes are not privileged).
- No repetition/motif awareness (the phrase you hear 4× is exactly the thing you
  remember, and it's invisible to a per-window top-note rule).
- No structural segmentation, so the core can't move from a verse vocal to a
  chorus riff.
- It produces parts, not **density-ranked difficulty versions**, and never targets
  the **two-monophonic-voice** ideal TKG actually wants.

### 1.4 `src/solver/dagSolver.js` — `solvePlan(notes)` (DOWNSTREAM — don't change)
Beam-search Viterbi DP. Groups notes into 30 ms events, assigns each note a
`{hand, key}` + octave/semitone-shift timeline, enforces **no hand crossing**
(right-hand min MIDI ≥ left-hand max MIDI) and **one octave (12 semitones) per
hand**, penalizes shifts (especially within < 0.5 s gaps). It already tolerates
chords (≤ 9 notes/event) and skips infeasible notes. **Your job ends before
this.** You decide *which notes survive* and emit an optional soft `voice` hint;
the solver places them. Sparser, cleaner input → fewer skips, fewer shifts,
more comfortable play.

### 1.5 Playability budget you must hit (TKG-specific)
Two hands, each a one-octave slice, comfortably one note at a time (two max per
hand; three total only if the other hand is silent), no crossing, octave *leaps
between phrases are encouraged*. So the core must collapse to **≤ 2 sounding
notes at any instant**, ideally **two monophonic lines** (a left line + a right
line). Octave jumps are fine and often desirable.

---

## 2. What the research says (surveyed; use this, don't re-survey from zero)

Five bodies of work map onto five stages. Key takeaways and why each matters here.

### A. Skyline / melody-line extraction (the baseline to beat)
The classic skyline (Uitdenbogerd & Zobel; Chai & Vercoe's *Revised Skyline*,
2001) takes the highest concurrent pitch as melody. Every survey notes the same
failure: it "jumps between a primary melody and accompanying notes," and it
cannot tell a melody apart from a high accompaniment note because it only knows
"highest pitch." Chai's **Revised Skyline** adds a *time-overlap parameter* that
cleans the line noticeably versus classic skyline on Uitdenbogerd's test set —
cheap, worth keeping as a fallback. **Channel/track pre-selection** helps a lot:
cluster MIDI channels by pitch histogram and keep the melodic one(s); a
pitch-based TF-IDF melody-track selector has been reported around **94.7%**
track-identification accuracy. *Lesson: don't run skyline on the raw soup — first
isolate the right voice(s), then take a clean line through them.*

### B. Voice separation / streaming (isolate hearable lines first)
**Chew & Wu's contig-mapping** (CMMR 2004) is the workhorse: segment the piece
into "contigs" of constant simultaneous-voice count, then reconnect fragments
across adjacent contigs by shortest pitch distance, anchored at the
maximal-voice contigs where voice order is known. It runs in **O(n²)**, uses only
pitch height + event boundaries, needs **no tuned parameters**, and reports
~99.75% fragment consistency / ~94.5% correct connection / ~89% voice
consistency on Bach. It rests on Bregman/Huron auditory-streaming principles
(pitch **proximity** and temporal **continuity**: a voice tends to move in small
steps and not leap across other voices). This is the direct fix for TKG's two
known pitfalls (octave bleed, voice-crossing) because once notes belong to
*streams*, a high accompaniment note no longer hijacks the melody line.
*If full contig mapping is too heavy for a worker, a greedy pitch-proximity
streamer (assign each onset to the active voice whose last pitch is closest,
within a leap bound) captures ~80% of the benefit; see §4 Stage 2.*

### C. Salience / "what sticks" — the heart of hero-note selection
Three signals, all cheap and all well-supported:
- **Metric salience.** Notes on strong beats carry the structure. Empirically,
  metrical-accent features give a *substantial* accuracy jump in symbolic chord
  recognition, and removing them measurably hurts — i.e. strong-beat position is
  a real importance signal, not folklore (GTTM / Lerdahl–Jackendoff;
  Temperley's *Cognition of Basic Musical Structures*).
- **Repetition / motif membership.** The pattern-discovery line (Meredith's
  **SIA / SIATEC / COSIATEC**) shows that *Maximal Translatable Patterns*
  (repeated, transposition-invariant fragments) "often correspond to
  perceptually significant repeated patterns." A phrase heard many times is the
  hook. Full SIATEC is overkill in JS; a **repeated-n-gram count over
  (relative-pitch, relative-onset) tuples** is a faithful lightweight proxy
  (COSIATEC itself keys on *relative* pitch/onset, matching how humans perceive
  motifs incrementally).
- **Registral extremity + duration + velocity.** Contour peaks, long notes, and
  loud notes are salient. (This is the kernel of truth inside skyline — keep it,
  but apply it *within a voice*, not across the whole texture.)

### D. Automatic piano reduction (the closest framing to TKG's actual goal)
This field already solves "reduce a dense score to two playable hands while
keeping the essence," which is precisely TKG. Two results to copy:
- **Nakamura & Sagayama (ICMC 2015) / "Statistical piano reduction controlling
  performance difficulty."** They cast reduction as *maximize fidelity subject to
  a difficulty constraint*, and show **subjective difficulty and musical fidelity
  rise together monotonically** as you turn the difficulty knob, plus a
  per-instant difficulty measure DR(t) that flags unplayable passages. **This is
  your difficulty-level generator design:** one knob → a family of reductions →
  rank them. Easy = low difficulty = fewer, only the most salient notes.
- **Takamori et al. (pop-music reduction).** Generate **right hand and left hand
  as two separate tasks**: RH = melody plus a few chord tones at high-accent
  locations; LH = an accompaniment/bass line. This *is* TKG's two-monophonic-voice
  target. Wilk's **musical-entropy** reduction (phrase importance = information
  content, then select max-importance phrases under a playability constraint) is
  the same idea with an entropy-based importance score.

### E. Structural segmentation (let the core change per section)
Pop songs are intro/verse/chorus/bridge; the **hook lives in the chorus** and the
salient line can move (verse vocal → chorus riff). Symbolic segmentation via
self-similarity / repetition (suffix-tree / FORM-style) or local boundary
detection (Cambouropoulos **LBDM**: boundaries at local maxima of pitch/IOI/rest
change; Temperley's *Grouper*) gives section boundaries cheaply. You don't need
labels (verse vs chorus), only **boundaries**, so the salient-voice choice can be
re-decided per segment.

### F. What working arrangers/producers actually do (sanity check on "feel")
Convergent advice from arranging/songwriting practice, useful because the real
metric is *feel*: "less is more — strip to the element that carries the song";
the **chorus/most-energetic section** holds the main hook; **repetition** is the
core mechanism that makes a hook stick (Shake It Off, Call Me Maybe); the
**bassline often IS the hook** and its **rhythm** must survive (Billie Jean, Ice
Ice Baby); an **intro hook** is often just the first few notes of the main motif.
Every one of these maps onto a stage below: keep repeated material, privilege the
chorus, preserve bass rhythm, don't over-thin.

> **Honest accuracy note (read this).** "90%+ accuracy" is realistic for the
> *lead-voice / melody-track identification* sub-problem on clean pop (the
> literature lands ~94% there) and for voice separation on well-behaved
> polyphony (~89–94%). It is **not** a solved number for the harder sub-problems
> — "which 1–2 notes best imply this chord" and motif discovery (state-of-the-art
> motif F-scores are far lower, ~0.2–0.67). So: target ~90% on *lead-line
> correctness*, treat chord-implication and motif weighting as heuristics tuned
> on your test set (§7), and let the player override (the data shape supports it,
> §3). Don't promise 90% on "feel" globally; prove it per-song on the test set.

---

## 3. Output contract (what the game consumes)

`deriveVersions(parsed)` returns:

```jsonc
{
  "title": "string",
  "durationSec": 0.0,
  "versions": [                  // sparsest first (ascending density)
    {
      "id": "core",              // machine id
      "name": "Easy · Core",     // button label (include density when rendering)
      "kind": "derived-core",    // full | baked-melody | derived-core | derived-2voice
      "density": 1.8,            // notes/sec = notes.length / durationSec
      "notes": [
        { "startSec": 0.0, "durationSec": 0.0, "midi": 60,
          "voice": "right",      // "left" | "right" | "either"  (soft hint; solver may reassign)
          "salience": 0.0 }      // 0..1, optional, for debugging/UI/override
      ]
    }
  ]
}
```

`density = notes.length / durationSec`. Rank ascending so Easy is first.
`notes` must be sorted by `startSec` and is fed verbatim into `solvePlan()`.
Keep the module **pure**: no DOM, no audio, no `state` imports — so it can run in
a Web Worker or a test harness.

### Version kinds & difficulty mapping
| kind             | difficulty | what it is                                                                 |
|------------------|-----------|-----------------------------------------------------------------------------|
| `baked-melody`   | (varies)  | a simplified part the FILE itself ships — use verbatim (§5.4). Rank by its own density. |
| `derived-core`   | **Easy**  | single most-salient line per section, held through rests, thinned hard. ~1.5–2.5 n/s. |
| `derived-2voice` | **Medium**| lead line + rhythmic bass line, one note per hand. ~3–4.5 n/s.              |
| `full`           | **Hard**  | every surviving note (the original part). Max density. Also used for "Listen". |

Aim for **2–4 buttons**. Always include `full`. Include `baked-melody` only when
detected. `derived-core` and `derived-2voice` are the new work.

---

## 4. The pipeline to implement (`deriveVersions`)

Input `parsed` is whatever the loader hands you. Normalize to: a chosen base part
(the densest "All Parts"/full part, or the per-channel union) as a flat
`NoteObj[]` with optional `vel`. Everything below operates on that note list.
Output is the versions array.

```
deriveVersions(parsed):
  base   = pickBasePart(parsed)                     // densest full part
  grid   = estimateMeterGrid(base.notes)            // Stage 1
  voices = separateVoices(base.notes)               // Stage 2
  segs   = segmentStructure(base.notes, grid)       // Stage 3
  scoreNotes(base.notes, voices, segs, grid)        // Stage 4  (writes .salience)
  lead, bass = selectLines(voices, segs)            // Stage 5  (≤2 monophonic lines)
  core   = thin(lead,        difficulty='easy')     // Stage 6
  two    = thin(merge(lead,bass), difficulty='medium')
  return rankByDensity([
    versionFromNotes('core',   'Easy · Core',  'derived-core',   core),
    versionFromNotes('2voice', 'Medium · Two-Voice','derived-2voice', two),
    versionFromNotes('full',   'Hard · Full',  'full',           base.notes),
    ...detectBakedMelody(parsed)                    // §5.4, may be []
  ])
```

### Stage 1 — Meter / beat grid → metric weight per note
Goal: give every note a `metricWeight ∈ [0,1]` (1 = downbeat-ish, low = off-beat).
- **MusicXML:** you already have true `<divisions>` and measure ticks — recover
  beat position from tick-within-measure (§5.3) and weight by metric level
  (downbeat > beat > subdivision). Best case; near-exact.
- **MIDI:** no reliable time signature. Estimate tempo grid from the **IOI
  histogram**: build a histogram of inter-onset intervals, take the dominant
  small interval as the beat/subdivision, phase-align by maximizing onset mass on
  grid points. Assign `metricWeight` by how close an onset sits to a strong grid
  point and by grid level. This is approximate but enough to privilege
  on-beat notes. (Grounds the "metric salience" signal from §2C.)

### Stage 2 — Voice separation (fixes octave bleed & voice-crossing)
Split the polyphony into monophonic streams **before** picking any hero line.
- **Preferred: Chew & Wu contig mapping.** (1) Cut the timeline at every point
  where the count of simultaneously-sounding notes changes → contigs. (2) Within
  a contig, the notes form ordered voices top-to-bottom. (3) Connect fragments
  across adjacent contigs by shortest total pitch distance, processing outward
  from maximal-voice contigs. O(n²), no parameters.
- **Lightweight fallback (ship this first if worker time is tight):** greedy
  pitch-proximity streaming — keep a set of active voices, each remembering its
  last pitch; assign each new onset to the active voice whose last pitch is
  nearest within a leap bound (say ≤ 12–14 semitones) and whose last note has
  ended or nearly so; else open a new voice. Encodes Bregman proximity/continuity.
Output: `voices = Voice[]`, each `Voice = { notes: NoteObj[], meanPitch, onsetRate, span }`.

### Stage 3 — Structural segmentation (let the core move per section)
Produce section boundaries so voice selection can change verse→chorus.
- Cheap & robust: a **self-similarity** pass on bar-level pitch-class +
  onset-density vectors, cut at novelty peaks; or **LBDM** (boundary strength =
  local change in pitch interval, IOI, and rest), pick the top-K boundaries so
  sections are ≥ ~4 bars. You only need boundaries, not labels.
- Tag each segment with a coarse "energy" (note density × mean velocity) so a
  later tie-break can prefer the chorus-like (high-energy, highly-repeated)
  material when choosing what the Easy version follows.
- Fallback: if segmentation is unreliable, treat the whole piece as one segment.
  Still correct, just less adaptive.

### Stage 4 — Per-note salience score
For each note, `salience = weighted sum` (then normalize to [0,1] per segment):
```
salience(n) =  w_metric  * metricWeight(n)                 // Stage 1
             + w_repeat  * repetitionScore(n)              // n-gram MTP proxy, below
             + w_register* registralExtremity(n, voice)    // contour peak within its voice
             + w_dur     * normDuration(n)                 // longer = more salient
             + w_vel     * normVelocity(n)                 // louder = more salient (MIDI only)
             + w_voice   * voiceProminence(voice(n))       // melodic voice bonus
```
- **`repetitionScore`:** slide a window over each voice; encode fragments as
  sequences of `(Δpitch, Δonset-bucket)` tuples; count how often each fragment
  recurs anywhere (transposition-invariant because it's relative). A note's score
  = max recurrence count of any fragment it belongs to, log-scaled. This is the
  COSIATEC/MTP idea in ~30 lines and directly captures "the hook is the thing you
  hear 4×."
- **`voiceProminence`:** higher for the voice that, per segment, has the highest
  combined (onset regularity + repetition + register). This is your per-section
  "which voice is the tune" decision and is where the lead can flip from a top
  vocal to a bass riff.
- Suggested starting weights (tune on §7):
  `w_metric 0.20, w_repeat 0.28, w_register 0.15, w_dur 0.12, w_vel 0.10, w_voice 0.15`.
  Repetition and metric weight dominate on purpose — that's where "feel" lives.

### Stage 5 — Select ≤ 2 monophonic lines (rhythm preserved)
Per segment:
- **Lead line** = the single highest-`voiceProminence` voice, taken
  monophonically (if it's momentarily chordal, keep the highest-salience note of
  the chord). **Hold the line through rests** by allowing a still-sounding
  (sustained) note to remain the line, and apply a **register-band gate**: reject
  a candidate that sits far (e.g. > ~10–12 semitones) from the line's recent
  running register — this is the documented cure for octave bleed.
- **Bass / second line** = the lowest persistent voice in the segment, **kept as
  a line with its own rhythm** (do NOT collapse to one note per bar — preserving
  the bass *rhythm* is what keeps the groove; Billie Jean / Ice Ice Baby).
- Enforce **no-cross at selection time** (lead ≥ bass); if they cross, drop the
  weaker note at that instant. Emit a soft `voice` hint: lead→`"right"`,
  bass→`"left"`, ambiguous→`"either"`. The solver still has final say.
Result: two monophonic streams that already satisfy the ≤2-notes budget.

### Stage 6 — Density thinning = the difficulty knob
One function, `thin(notes, difficulty)`, maps difficulty → (a) a target density
and (b) a salience percentile floor, then drops low-salience notes **subject to
two hard guards**:
1. **Never empty a strong-beat slot** — keep the rhythmic skeleton; dropping all
   on-beat notes murders the groove (§2F, and the original handoff's "don't
   over-thin").
2. **Never break a repeated motif's recognizability** — if removing a note drops
   a fragment below the recurrence that made it a hook, keep it.
Difficulty presets (starting points, tune on §7):
- `easy`  → lead only (+ bass notes only on strong downbeats), target ~1.5–2.5 n/s,
  salience floor ~60th percentile.
- `medium`→ lead + bass line, target ~3–4.5 n/s, floor ~35th percentile.
- `hard`  → no thinning (full part).
Because higher difficulty keeps more (lower salience floor), **fidelity rises with
difficulty monotonically** — the Nakamura–Sagayama property, and what makes the
buttons feel like a real difficulty ladder rather than arbitrary subsets.

Finally: compute `density` per version, sort ascending, return.

---

## 5. Exact integration changes to the repo

### 5.1 New file `src/musicxml/coreExtractor.js`
Pure module. Exports `deriveVersions(parsed)` (and ideally each stage as a named
export for unit tests). No imports from `state.js`, no DOM. Stages per §4.

### 5.2 `src/musicxml/midiParser.js` — KEEP velocity (one-line-ish fix)
Today the note-on branch reads velocity only to classify on/off and never stores
it:
```js
// current:
const note = data[pos++], velocity = data[pos++];
events.push({ tick, type: (type === 0x90 && velocity > 0) ? 'noteon' : 'noteoff',
              channel: statusByte & 0x0f, note });
```
Carry `velocity` onto the `noteon` event, stash it in the `active` map alongside
`startTick`, and include it on the emitted note object:
```js
events.push({ ..., note, velocity });
// in noteon handler:
active.set(key, { startTick: ev.tick, channel: ev.channel, vel: ev.velocity });
// when closing the note:
channelNotes.get(a.channel).push({ midi, startSec, durationSec, vel: a.vel, partId: `ch-${a.channel}` });
```
`vel` is optional downstream (MusicXML won't have it); guard with a default of
e.g. 80 when absent.

### 5.3 `src/musicxml/parser.js` — retain metric position (optional but high-value)
You already track `msTick`, `<divisions>` (`cDiv`), and per-voice ticks. Attach
`tickInMeasure` (and `divisions`) to each emitted note so Stage 1 gets *exact*
metric weight for MusicXML instead of estimating. Pure addition; existing fields
unchanged.

### 5.4 `src/musicxml/fileHandler.js` — swap the generator, keep the selector
- **Delete / bypass** `addSimplifiedParts()`.
- After parsing (both MIDI and XML paths), call `deriveVersions(parsed)` and store
  `state.mxVersions = result.versions`.
- **Baked-melody detection** (do this here, reusing the part list): if any
  original part's `name` matches `/melody|lead|vocal|easy|simple/i`, emit it as a
  `baked-melody` version verbatim and rank it by its own density. (The current
  code *manufactures* "-melody"/"-easy" parts; real baked parts are ones the file
  already ships — detect those by name.)
- Surface versions in the **existing `partSelect` `<select>`**, sparsest first,
  labelling each option `"${name} — ${density.toFixed(1)} n/s (${notes.length})"`.
  On confirm, set `state.mxNotes = version.notes` and proceed into the unchanged
  `mxSelectPart` flow → `solvePlan(state.mxNotes)`.
  (Optional later polish: replace the `<select>` with the discrete density buttons
  the original handoff envisioned. Not required for v1; the select already works.)

### 5.5 What you do NOT change
`src/solver/dagSolver.js` (and `solverVisuals.js`, playback, scoring, scene). The
contract is: you hand `solvePlan` a sparser, cleaner `notes` array. It keeps doing
hand/key/octave assignment, no-crossing, shift scheduling. Cleaner input simply
yields fewer skipped notes and fewer shifts.

---

## 6. Known pitfalls (carried from the prior handoff — honor them)
- **Octave bleed:** when the lead rests, the top of a sustained chord surfaces and
  a naïve top-line follows it. Mitigation (Stage 5): allow sustained still-ringing
  notes as line candidates *and* a register-band gate that rejects chord-tops far
  from the recent line register. Voice separation (Stage 2) prevents most of this
  upstream.
- **Voice-crossing:** when the lead dips *below* an inner voice, top-line logic
  grabs the higher wrong note. Per-voice tracking (Stage 2) avoids it; pure
  skyline cannot.
- **Don't over-thin:** one note per beat kills the groove. Stage 6 guard #1
  (never empty a strong-beat slot) and keeping the **bass rhythm** in `medium`
  protect this. Rhythm is part of the hook.
- **Don't trust velocity blindly on quantized/exported MIDI** (many are flat at
  velocity 100). Use it as a soft signal (low weight), and rely on metric +
  repetition when velocity variance is ~0.

---

## 7. Evaluation (how you prove it beats the baseline)
Build a small labeled set (5–10 pieces): a clean single-melody pop tune; a piano
piece with a hidden inner melody; a dense orchestral MIDI; a MusicXML that ships a
real `-melody`/lead part; and a riff-driven track whose hook is the **bass**. For
each, hand-mark the notes you'd actually want to play.
Score two axes:
1. **Feel (the real metric):** blind A/B the Easy/Medium reduction against the
   full mix — does it *sound like the song*? A win = a non-pianist plays it and a
   listener names the tune.
2. **Playability (objective):** run each version through `solvePlan` and check
   density is in range, ≤2 simultaneous notes, mostly one-note-per-hand, sane
   octave motion, low skip count. Report `density` and `solverStats.skippedNotes`
   per version.
Also report a **lead-line accuracy** number vs your hand labels (precision/recall
of kept notes) — this is where the ~90% target is meaningful. Keep a running notes
file of what weights/params worked per piece; tune the §4 weights and §6 presets
against it. Compare every version against the **old `addSimplifiedParts` skyline**
as the baseline to beat.

---

## 8. Build order (so you ship something working fast)
1. **Skeleton + plumbing:** `deriveVersions` that returns just `full` + a
   *greedy-stream* lead-only `derived-core` (Stage 2 fallback + Stage 5 lead +
   Stage 6 easy). Wire 5.2/5.4. Verify it loads, ranks, and plays through the
   solver. This alone already beats raw skyline (per-voice, holds through rests).
2. **Salience:** add Stage 4 (metric + repetition first — biggest "feel" wins),
   then duration/velocity/register. Tune weights on §7.
3. **Two-voice:** add Stage 5 bass line + `derived-2voice` (Medium). This is the
   thing TKG most wants ("one note at a time on each hand, lock in").
4. **Structure:** add Stage 3 so the lead can move verse→chorus. Optional for v1.
5. **Upgrade Stage 2** from greedy streaming to full Chew–Wu contig mapping if
   the test set shows voice errors. Optional for v1.
6. **Baked-melody detection** (5.4) and **MusicXML metric retention** (5.3).

Each step is independently shippable and independently testable, and every step
keeps the solver contract intact.

---

## 9. Definition of done (v1)
- `src/musicxml/coreExtractor.js` exports a **pure, worker-safe**
  `deriveVersions(parsed)` returning the §3 shape, density-ranked.
- `midiParser.js` preserves velocity; `fileHandler.js` uses `deriveVersions`
  instead of `addSimplifiedParts` and surfaces versions with density labels;
  baked melody parts detected by name and included.
- On the §7 test set: beats the skyline baseline on **feel**, every version is
  **solver-playable** (in-range density, ≤2 simultaneous, low skips), and
  lead-line accuracy is reported (target ~90% on clean pop).
- A short written note recording the chosen weights/presets and the failure cases
  that remain (e.g. chord-implication choices, motif weighting on atonal pieces).

---

## Appendix — primary sources (for whoever wants the originals)
- Uitdenbogerd & Zobel; **Chai & Vercoe, *Revised Skyline*, 2001** — skyline &
  its time-overlap fix; MiDiLiB skyline failure-mode demo.
- Pitch-histogram channel clustering / **TF-IDF melody-track selection (~94.7%)**.
- **Chew & Wu, "Separating Voices in Polyphonic Music: A Contig Mapping Approach,"
  CMMR 2004** (VoSA); Bregman *Auditory Scene Analysis*; Huron, "Tone and Voice";
  Gray & Bunescu (neural voice separation); `CPJKU/partitura` (Python ref impl).
- **Meredith, SIA / SIATEC / COSIATEC & SIATECCompress** — MTPs as perceptually
  significant repeated patterns; `pauldhein/ostinato` (Python SIATEC).
- **Nakamura & Sagayama, "Automatic Piano Reduction… ," ICMC 2015** and
  **"Statistical piano reduction controlling performance difficulty"** (difficulty
  ⇄ fidelity monotonicity, DR(t)); **Takamori et al.** (pop RH/LH split);
  **Wilk, musical-entropy reduction**.
- **Lerdahl & Jackendoff, *GTTM*; Temperley, *The Cognition of Basic Musical
  Structures* (Grouper); Cambouropoulos, LBDM** — metric salience & boundary
  detection. Empirical metric-accent importance: segmental-CRF chord-recognition
  studies.
- Practitioner sources on hooks/arrangement (less-is-more, chorus carries the
  hook, repetition, bass-as-hook, intro-hook = first notes of the motif).
