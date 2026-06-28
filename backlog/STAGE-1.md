# BACKLOG · STAGE 1 — "make it real" + stand up the loop

> The agent works these **top to bottom**. Each card: goal · docs · acceptance ·
> verify. Check a box only when a test asserts it and `./scripts/verify.sh` is
> green. Much of the *feel* work already exists in `tekage-synth.html` (the
> reference) — Stage 1 is mostly **porting it into a tested modular `src/` and
> adding the genuinely new pieces (config, export, stars, confidence dialog)**.

Legend: `[ ]` todo · `[x]` done+verified · `[BLOCKED]` see QUESTIONS.md

---

### T0 · Stand up the modular engine + test rig  ← do first
- **Goal:** create `src/` split per `01-ARCHITECTURE.md` (engine/runtime/content/
  shell with MODULE banners), wire `npm run build` to bundle → `tkg.html`, and
  re-point `tests/run-headless.js` at `src/` engine modules. Add `tests/ui/
  smoke.spec.js` (Playwright) and create `tests/fixtures/` (simple-melody,
  pop-song, dense-piano, chord-heavy, octave-jump, multi-part + golden JSON).
- **Docs:** 01, 10, 12.
- **Acceptance:** `node tests/run-headless.js` runs against `src/`; `npx playwright
  test` loads `tkg.html` with **zero console errors**; `./scripts/verify.sh` green.
- [x] modular `src/` with banners  [x] bundle → tkg.html  [x] fixtures+golden
  [x] headless on src/  [x] playwright smoke  [x] verify.sh green

### T1 · Port VoiceManager (ghost-note kill)
- **Goal:** move the reference VoiceManager into `src/runtime/audio` unchanged in
  behavior; all sound through it; `allNotesOff()` on every exit path; per-frame
  watchdog. **Docs:** 04.
- **Acceptance (assert each):** N noteOn→N live; noteOff(key) releases one;
  re-press retriggers (no orphan); panic→0; 200 presses+panic→0; watchdog reaps
  overdue; blur/visibility/pause/seek/restart/mode/version-change all → 0 live.
- [ ] ported  [ ] all invariants asserted in headless

### T2 · Core-of-song extraction → versions
- **Goal:** port `deriveVersions` (6 stages) into `src/engine/deriveVersions`,
  pure; lead-selection register-decisive (melody = top line) with density guard;
  preserve note identity. **Docs:** 07.
- **Acceptance:** ≥2 versions ranked ascending by density; Easy<Medium≤Full; Full
  == whole song; version notes are refs into the full set; lead-line accuracy
  reported vs. a labeled fixture; beats raw skyline on the test set.
- [ ] ported pure  [ ] density-ranked + identity  [ ] lead-accuracy reported

### T3 · Version picker + difficulty stars
- **Goal:** pre-play picker, density-ranked, **1–5 stars** per version; play that
  difficulty or higher; can't change mid-play. **Docs:** 07, 11, 02.
- **Acceptance:** buttons show name + density + stars; selecting re-solves; default
  = sparsest. [ ] picker  [ ] stars from density  [ ] re-solve on select

### T4 · Two hands stay two hands
- **Goal:** confirm no one-hand collapse; monophonic line splits across both hands
  by register; octave leaps unpenalized. **Docs:** 02, 11.
- **Acceptance:** non-trivial version uses both hands; assert `handsUsed` has left
  AND right. [ ] asserted

### T5 · Slice highlight == audible == key-tint
- **Goal:** one source of truth for live slice; highlighted octave equals the
  octave that sounds, both modes. **Docs:** 02.
- **Acceptance:** headless: `midiForGameKey(k)` octave == drawn slice octave in
  play and listen. [x] unified  [x] asserted

### T6 · Default PLAY + Rest-of-Song backing
- **Goal:** default mode PLAY; backing (full minus your version + skips) plays in
  tandem; LISTEN auto-plays all. **Docs:** 02, 09.
- **Acceptance:** every note is yours|backing|skip; PLAY sounds backing, LISTEN
  sounds all. [ ] asserted

### T7 · Keyboard-map viewer (remap-ready)
- **Goal:** overlay: computer keys (mapped opaque / unmapped dim) + piano beneath;
  press lights both; separate LINES toggle (off by default). Reads the mapping from
  config (10) so it's ready to become an editor later. **Docs:** 02, 10.
- **Acceptance:** opacity states correct; press-to-light works; lines toggle; map
  comes from `TKGConfig.slices.mapping`. [x] viewer  [x] config-driven map

### T8 · Center-screen gap (Wispr Flow)
- **Goal:** keep dead-center clear of interactive controls. **Docs:** 02.
- **Acceptance:** no control occupies the center zone (smoke checks bounding boxes).
  [x] done

### T9 · `TKGConfig` + `loadConfig`
- **Goal:** introduce the single config object; runtime derives visuals/slices/
  mapping/mode/assists/difficulty from it; validate + safe defaults. **Docs:** 10.
- **Acceptance:** one-hand, asymmetric, custom-mapping all work via config, no code
  change; bad config never crashes. [x] config drives runtime  [x] validated

### T10 · `exportHTML(config)` — the generator
- **Goal:** bake engine + inlined assets + frozen config → self-contained
  `tkg.html` that opens offline. **Docs:** 10.
- **Acceptance:** exported file plays the configured song with the configured look,
  no network. [x] export works  [x] offline play verified

### T11 · Code sectioned + docs updated
- **Goal:** MODULE banners throughout; update each doc's acceptance boxes; refresh
  `README`/`PROGRESS`. **Docs:** 01.
- **Acceptance:** grep finds banners per the module map; verify green.
  [ ] banners  [ ] docs synced

---

## ▶ STOP-FOR-REVIEW
After T11, **stop** and write a summary to `PROGRESS.md`. Do not start Stage 2
(onboarding/Blurt, library, scoring) until the founder reviews the feel. (See
`STAGE-2.md` for what's next.)
