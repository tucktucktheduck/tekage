# 06 · ROADMAP & STAGES

> What ships when, and — crucially — which architectural decisions must be made
> **now** so later stages don't force a rewrite. Order is a guide, not a
> contract; feel can re-prioritize anything.

## Stage 0 — current (single HTML)

Where we are: falling notes labeled with the computer key, two movable slices,
DAG solver, melody/version focus, CRT/teklet look, SPEED + FOCUS, LISTEN/PLAY,
synth audio. Feels good; known issues: slice-highlight mismatch, ghost notes,
one-hand collapse, no version picker, defaults to LISTEN.

## Stage 1 — "it feels real" (next HTML build)

Goal: the smallest set that makes the creator say *yes, that's it* for now.
**No new feature bloat — make it feel better.**

- [ ] **Default to PLAY**; backing track plays with you (already true — verify).
- [ ] **Slice highlight == audible octave == key-tint** (single source of truth).
- [ ] **Ghost-note fix** (VoiceManager + panic + watchdog; see 04).
- [ ] **Keyboard-map viewer** (opacity-based; press-to-reveal; separate lines
      toggle; see 02).
- [ ] **Two hands stay two hands** (no one-hand collapse for single lines).
- [ ] **Version picker** before play, **ranked by density** (Full / Core / baked-
      Melody when present; see 07). Density = notes/sec on each button.
- [ ] **Center-screen gap** in the control layout (Wispr Flow).
- [ ] Code **sectioned with MODULE banners**; engine sections DOM/audio-free
      (so it can split later; see 01).
- Carry the existing **core-of-song extraction handoff** (07) as the research
  track running in parallel; plug improved Versions in behind the same interface.

Definition of done: plays great, no stuck notes, slices visibly truthful, you
can see your mapping, and you choose how busy you want it.

## Stage 2 — the ladder & memory

- `ProgressStore` (IndexedDB) + persisted settings (speed, skin, mapping, mode).
- Stars/score (opt-in), level = (song × Version), unlock ladder + test-outs (05).
- Starter **song library** so non-technical players have something to play.
- Optional precision/scoring layer wired to `judge()` (02).

## Stage 3 — customization opens up

- Renderer fully skin-interface-driven (should already be true from stage 1).
- Load `.tkg` packs (skins/backgrounds/teklets) safely (03).
- Custom **key→piano mappings** as shareable configs, editable in the map viewer.
- **Reactive backgrounds** ("the beat dances"), per-song/per-skin worlds (03).

## Stage 4 — content & commerce

- `SongSource` **store** adapter; buy licensed song packs; licensing pipeline (05).
- Paid cosmetic/song packs; `ownedPacks` entitlements.
- Possibly a community/marketplace for `.tkg` packs + mappings (UGC moderation,
  data-only packs, validation).

## Stage 5 — proper game

- **Steam / packaged app** (Electron or similar) via the SHELL layer — engine/
  runtime/content unchanged; only the shell swaps (01).
- Accounts + cloud sync (ProgressStore cloud adapter).
- Audience features: leaderboards/replays (the input command-bus from 01 makes
  replays cheap).

## Decisions to lock NOW (cheap now, expensive later)

These are the load-bearing seams. Getting them right in stage 1 is what makes
stages 2–5 additive instead of rewrites:

1. **Engine purity** — no DOM/audio in musical logic. (01)
2. **`Skin` interface** — renderer asks for every visual. (01, 03)
3. **`AudioEngine`/`VoiceManager` interface** — all sound through it; samples
   swap in later. (01, 04)
4. **`SongSource` interface** — upload now, library/store later. (01, 05)
5. **`ProgressStore` interface** — memory/IndexedDB/cloud behind one API. (01, 05)
6. **`InputController` command bus** — enables remap, replay, scoring. (01)
7. **`Version` model** — extraction plugs in behind it. (01, 07)

If a stage-1 PR violates one of these, fix the seam before adding the feature.

## What NOT to build yet

UGC marketplace, accounts, payments, reactive backgrounds, real sample packs,
the full ladder. Reserve their seams (above); don't implement. Stage 1 is about
*feel*.
