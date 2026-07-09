# Integration notes — piano voices, OnlineSequencer, MIDI upload

Three features landed together. This is the map of what changed and how to run it.

## 1 · Better piano sound (built-in, offline, no download)

The default voice was a thin 3-oscillator synth. It's now a physically-informed
piano model in `src/runtime/audio.js`:

- an **inharmonic partial stack** (stretched overtones, like real strings),
- **per-partial decay** — brightness fades as the note rings (the core of a piano tone),
- a **felt-hammer transient** (a short low-passed noise burst at the onset),
- velocity-dependent brightness + a two-stage body decay.

Three **core voices** — **Grand / Bright / Mellow** — are selectable in the Teklet
`TEMPO & SOUND` section (the `.voiceBtn` row). The choice persists via
`ProgressStore` (`settings.voice`). The existing **UPLOAD PIANO (SF2)** path is
unchanged — load a real sampled piano and it overrides the synth for the session.
See `docs/PIANO.md` for a compact real-Steinway `.sf2` recommendation.

API added on `Audio`: `setVoice(key)`, `voiceName()`, `currentVoice()`, `VOICES`.

## 2 · OnlineSequencer as a second song source

OnlineSequencer's old `/app/midi.php?id=` MIDI endpoint is **dead** (404). Every
sequence page instead embeds its notes as a base64 **protobuf** (`var data=…`), and
its Download button builds the MIDI client-side. So we do the same server-side.

Two same-origin Vercel functions (both dependency-free, Node global `fetch`):

- **`api/midi.mjs`** — `GET /api/midi?id=<seqId>` → fetches the sequence page, decodes
  the protobuf, and synthesizes a real Standard MIDI File (`audio/midi`). Cached 24h
  at the CDN (published sequences are immutable). Returns the sequence name in an
  `X-Sequence-Title` header.
- **`api/search.mjs`** — `GET /api/search?q=<query>` → scrapes OnlineSequencer's own
  browse search (`/sequences?search=…`) and returns `{results:[{id,title,notes,midi}]}`.
- **`api/_os.mjs`** — shared decode + MIDI-writer (underscore prefix ⇒ Vercel does
  **not** expose it as an endpoint).

Decode facts (verified against live sequences): note `pitch = 95 − type`; `time`/`length`
are in 1/16-note units at 96 ticks/unit (PPQ 384); `bpm` lives in the settings
submessage. **Protobuf gotcha that cost real time:** `const end = p + varint()` is a
bug — JS reads `p` *before* `varint()` advances it, so `end` is short by the
length-prefix bytes and everything after the first submessage desyncs. Read the
length into a variable first.

**Library page** (`src/shell/library.template.html`, the *template* — `library.html`
is a build artifact): a `MUTOPIA | ONLINE SEQ` toggle by the search box. OS mode
debounces input into `/api/search`, renders results as cards in the existing style,
**hides the star filters** (OS results aren't pre-charted, so stars would be fiction),
and links PLAY to `tkg.html?song=os:<id>`. Scraped titles are user-generated, so
they're **HTML-escaped** (`esc()`) before injection — the built-in catalog is trusted
and stays unescaped/byte-identical.

**Game loader** (`src/shell/`): `tkg.html?song=os:<id>` → `loadFromOnlineSequencer(id)`
→ `loadFromUrl('/api/midi?id='+id)` → the existing `parseMidi` → chart pipeline. The
fetch is impure runtime; charting stays pure engine (respects `DECISIONS.md`).

### Licensing — read before promoting this

Unlike Mutopia (public-domain), OnlineSequencer content is **community-made and often
includes arrangements of copyrighted songs**. The library footer says so. Keep it a
secondary "search" source, not the headline library.

## 3 · Upload a MIDI from the library page

`↑ UPLOAD MIDI` on the library page reads a local `.mid`, stashes it (base64) in
`sessionStorage` under `tkg_upload`, and opens `tkg.html?upload=1`. The game reads it
back (`loadUploadFromSession` → `loadArrayBuffer`) and charts it through the same
low-confidence pipeline as the in-game LOAD MIDI. Same-origin, survives the nav.

## Build / deploy / test

- **Build:** `node scripts/build.mjs` → `tkg.html`, `library.html`, and staged
  `public/` (index.html, tkg.html, library.html). `api/` is **not** a build artifact —
  Vercel serves it as functions directly.
- **Vercel:** `vercel.json` already uses `buildCommand`/`outputDirectory` (no legacy
  `builds` array), so `api/*.mjs` auto-register. `installCommand:""` is fine — the
  functions have **no npm dependencies**.
- **Tests:** `node tests/run-headless.js` (engine) + `npx playwright test --workers=1`
  (serial; the 6 GB box flakes under parallel load). New spec:
  `tests/ui/onlineseq.spec.js` (OS search/escaping, `os:` load, upload) — it spins up a
  tiny local http server because `fetch()` can't run from a `file://` page.
