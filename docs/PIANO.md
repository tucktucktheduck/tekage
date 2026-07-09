# Piano sound

## The default is now a real piano model (no download needed)

`src/runtime/audio.js` synthesizes each note from an **inharmonic partial stack**
with **per-partial decay** (brightness fades as the note rings), a **felt-hammer
noise transient**, velocity-dependent brightness, and a two-stage body decay. It
sounds like a piano, works fully offline, and adds nothing to the bundle size.

Three **core voices** are in the Teklet `TEMPO & SOUND` panel:

| Voice  | Character |
|--------|-----------|
| Grand  | warm concert grand (default) |
| Bright | more attack + high partials |
| Mellow | soft, round, fewer partials |

The choice persists across reloads.

## Want a real recorded Steinway? Load an .sf2

The Teklet **UPLOAD PIANO (SF2)** button loads a sampled instrument for the session
(soundfonts are too big to persist). The recommended file:

- **Steinway Model-C — Warren Trachtman** · 21 MB · sampled German Steinway Model C.
  Verified to parse with TKG's SF2 reader: 50 zones, full 88-key range (A0–C8),
  looped 32 kHz samples.
- Download: <https://archive.org/details/WST25FStein_00Sep22.sf2>
  (direct: `https://archive.org/download/WST25FStein_00Sep22.sf2/WST25FStein_00Sep22.sf2`)
- A copy has been saved to **`~/Downloads/Steinway-Model-C.sf2`** — open it via
  UPLOAD PIANO to try it immediately.

Any General-MIDI or single-instrument piano `.sf2` works too; the reader picks
preset 0 (Acoustic Grand in a GM bank). If a file fails to read, TKG silently keeps
the synth. The linked **SplendidGrandPiano / Steinway-B-211 / church_steinway**
projects are **SFZ** libraries (folders of hundreds of MB of FLAC), not `.sf2`, so
they can't be loaded directly — the Trachtman Steinway above is the drop-in Steinway.
