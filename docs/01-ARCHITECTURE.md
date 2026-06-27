# 01 · ARCHITECTURE (keystone)

> How the system is shaped so it can stay one HTML today and become a
> multi-module, account-backed, UGC-driven Steam game later **without a
> rewrite.** Read this before touching code.

## The one idea

**Separate four layers. Let data flow one direction. Make the logic layer pure.**

```
        CONTENT            ENGINE (pure)              RUNTIME (impure)         SHELL
   ┌──────────────┐   ┌────────────────────┐   ┌──────────────────────┐   ┌─────────┐
   │ SongSource   │──▶│ parse()            │   │ Transport (clock)    │   │ page /  │
   │ (upload/lib/ │   │ deriveVersions()   │   │ AudioEngine + Voices │   │ app /   │
   │  store)      │   │ solvePlan() (DAG)  │   │ InputController      │   │ Electron│
   │ SkinManager  │   │ scoring/judge()    │   │ Renderer (canvas)    │   │ wires   │
   │ (.tkg packs) │   │ — no DOM, no audio │   │ FeedbackFX           │   │ it up   │
   │ ProgressStore│   └────────────────────┘   └──────────────────────┘   └─────────┘
   └──────────────┘            │  pure data (Song, Version, Plan)  ▲
                               └──────────────▶ PlayState ─────────┘
```

- **ENGINE** is pure functions over plain data. No `document`, no `AudioContext`,
  no timers. → unit-testable headless (we already have a harness), runnable in a
  Web Worker, portable to any shell.
- **RUNTIME** is the impure world: audio, canvas, input, the clock. It *reads*
  engine output and PlayState; it never owns musical logic.
- **CONTENT** are swappable sources behind interfaces (where songs/skins/progress
  come from). Local today; networked later — same interface.
- **SHELL** wires the three together for a given host (web page now; Electron/
  Steam later). The only layer that changes when the host changes.

**Rule:** data flows CONTENT → ENGINE → RUNTIME → screen. Input events flow back
as *commands*, never as direct mutations of musical data.

## Core data models (define once, use everywhere)

Keep these plain and serializable (JSON-able). They are the contracts between
layers; everything else is implementation.

```ts
Note      = { startSec, durationSec, midi, vel, channel?, voice?, _i }
ParsedSong= { title, durationSec, tempoMap, notes: Note[], parts: Part[] }
Part      = { id, name, notes: Note[], channel? }

Version   = { id, name, kind, density, notes: Note[] }   // kind: full|baked-melody|derived-core|derived-2voice
            // density = notes / durationSec ; player picks a Version before play (see 07, 02)

Assignment= { noteIndex, hand:'left'|'right', key, midi, startSec, durationSec }
SliceState= { leftOctave, rightOctave }                  // a hand = one-octave window at an octave
ShiftCue  = { timeSec, hand, key, dir:+1|-1, tag }
Plan      = { assignments: Assignment[], initialState: SliceState,
              sliceTimeline: {timeSec, ...SliceState}[], shiftCues: ShiftCue[],
              handsUsed: Set, engineNotes: Note[] }       // engineNotes = couldn't fit 2 hands → engine plays them

GameConfig= { speed, mode:'play'|'listen', assist, skinId }
PlayState = { songTime, playing, slice: SliceState (live), heldKeys, score? }

Skin      = { manifest, assets }                         // from a .tkg/.tkp bundle (see 03)
Profile   = { unlocks, stars, settings, ownedPacks }     // (see 05)
```

## Module map (what each piece owns)

| Module | Layer | Owns | Must NOT |
|---|---|---|---|
| `parse` | engine | file bytes → `ParsedSong` (MIDI + MusicXML) | touch audio/DOM |
| `deriveVersions` | engine | `ParsedSong` → `Version[]` (see 07) | assign hands/keys |
| `solvePlan` | engine | `Version.notes` → `Plan` (DAG, no-cross, 1-oct hands) | render or sound anything |
| `judge` | engine | hit timing → score/feedback tier | own input or audio |
| `Transport` | runtime | audio-locked clock, play/pause/seek | decide musical content |
| `AudioEngine` | runtime | instrument; `strike/noteOn/noteOff`; **VoiceManager** | know about scoring/skins logic |
| `InputController` | runtime | keyboard(instrument)+pointer+WebMIDI → commands | mutate Song/Plan directly |
| `Renderer` | runtime | draw PlayState+Plan+Skin to canvas | own state |
| `FeedbackFX` | runtime | hit glows, reactive bg (later) | gate gameplay |
| `SongSource` | content | get a file/song → `ParsedSong` | — |
| `SkinManager` | content | load `.tkg` pack → `Skin`; expose element lookups | hard-code visuals |
| `ProgressStore` | content | read/write `Profile` (local now, cloud later) | block on network |

## The seams to reserve NOW (cheap now, expensive later)

Even though stage-1 HTML ships only defaults, define these interfaces so future
stages slot in without surgery:

1. **`AudioEngine` interface** — `strike()`, `noteOn()`, `noteOff()`,
   `allNotesOff()`, `setInstrument()`. Synth today; **sample/SoundFont/SFZ**
   players (the repo already has them) swap in behind the same interface.
2. **`Skin` interface** — Renderer asks `skin.get(elementId)` for every visual
   (note block, key port, bg, teklet bezel, hit anim…). Default skin satisfies
   it today; `.tkg` packs satisfy it tomorrow. **Renderer must never hard-code a
   color/image it could ask the skin for.** (See 03 for the element taxonomy.)
3. **`SongSource` interface** — `list()`, `get(id) → ParsedSong`. Local-upload
   adapter now; library/store adapters later.
4. **`ProgressStore` interface** — `load()`, `save(profile)`. In-memory/
   IndexedDB now; server-sync later. (NB: browser storage is unavailable inside
   sandboxed artifacts — keep it behind this interface so the real app uses
   IndexedDB and the artifact uses memory.)
5. **`InputController` as a command bus** — input emits
   `{type:'noteOn'|'noteOff'|'shift'|'transport', …}`. This single seam later
   enables **remapping, replays, scoring hooks, and accessibility devices**
   without rewrites.
6. **`Version` model** — the only thing the core-of-song handoff (07) must
   produce. Extraction can evolve independently as long as it emits Versions.
7. **`TKGConfig` + bundle target** — one serializable config object drives all
   visuals/slices/mapping/mode/assists; the engine is **dynamic in dev** and
   **baked into a standalone `tkg.html`** for distribution (the founder's
   "HTML-generator" model). Develop in `src/`; the single file is an *output*.
   See `10-CONFIG-AND-HTML-GENERATOR.md`. `tekage-synth.html` is the visual
   reference, not the build target.

## Single-file now, split later — mechanically

Stay **one self-contained `.html`**. Inside the `<script>`, organize sections to
map **1:1** to the modules above, each fenced with a banner:

```
/* ==== MODULE: engine/solvePlan ==== (pure; no DOM/audio) */
```

Keep engine sections free of `document`/`AudioContext` so they could be cut and
pasted into files unchanged. Target tree when it splits:

```
/engine     parse.ts  deriveVersions.ts  solvePlan.ts  judge.ts  models.ts
/runtime    transport.ts audio/  input/  render/  feedback/
/content    songSource.ts  skin/ (SkinManager, manifest)  progressStore.ts
/shell      web/ (index.html, boot)   (later) electron/
/skins      default.tkg   …            /songs  library manifest
```

Splitting should be *cut, paste, add imports* — no logic moves between layers.

## Determinism & testing

- Engine functions are pure → the existing headless harness validates them with
  no browser. Every engine change ships with a harness assertion.
- Runtime is verified with scripted draw-stress + Playwright screenshots (already
  in use).
- Golden test: a fixed song + config must yield an identical `Plan` (catch
  regressions in extraction/solver).

## Acceptance criteria (agent-runnable)

- [ ] Every musical decision lives in an ENGINE function with no DOM/audio refs.
- [ ] Renderer fetches **all** colors/images via the `Skin` interface (grep for
      hard-coded hex in render code → none, except inside the default skin def).
- [ ] Audio output goes through `AudioEngine` + a `VoiceManager` (see 04); no
      oscillator is created outside it.
- [ ] Input produces command objects; no input handler writes to Song/Plan.
- [ ] Storage access goes through `ProgressStore`; no direct `localStorage` in
      logic.
- [ ] `<script>` is sectioned with MODULE banners matching this map.
- [ ] A golden-Plan test passes for the demo song.

## Open questions

- Scoring lives in engine (`judge`) — but is there scoring at all in stage 1? (02)
- Where does reactive-background timing data come from — Transport beats, or an
  onset stream from the Version? (decide when bg work starts; 03)
