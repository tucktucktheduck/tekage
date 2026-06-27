# 03 · SKINS, TEKLETS & CUSTOMIZATION

> The customization engine — a core long-term pillar and a monetization lever.
> Stage-1 HTML ships only the **default** look, but the Renderer must be built
> against this interface so packs slot in later with no rewrite.

## What's customizable (the platform thesis)

The aesthetic is meant to be **infinitely customizable**: the falling-note
visuals, the piano, the keyboard glow, hit animations, hand colors, backgrounds,
and the **teklet console** (the sci-fi control-panel UI itself). "Note-changers"
= note-block skins. "Skin-changers" = whole packs. **Teklets** = the console
chrome. All of it is one system.

## The file format (already exists — use it)

Skins are **`.tkg`** (current, schema `formatVersion: "2.0"`) / **`.tkp`**
(legacy `1.0`) bundles: a **ZIP** containing `manifest.json` plus image/video
assets (`png jpg jpeg gif svg apng webp` / `mp4 webm mov`). The repo's
`SkinManager` loads with JSZip, validates the manifest, and holds a blob per
**skinnable element id**. **Adopt this format; do not invent a new one.**

`manifest.json` (superset, from the repo's validator):

```jsonc
{
  "name": "Neon Dusk",
  "formatVersion": "2.0",
  "colors": { "color_primary": "#3b9eff", "color_secondary": "#ff8a2b", ... },
  "noteDisplayMode": "stretch | tile | mask-global | mask-per-note",
  "perKeyVisuals": { "<key>": { "image": "asset.png", ... } },
  "pages": { "teklet": {...}, ... },
  "assets": { "<elementId>": "file.png", ... }
}
```

## Skinnable element taxonomy (the Renderer's contract)

The Renderer asks `skin.get(elementId)` for **every** visual. Categories
(from `skinConstants.js`):

- **Background:** `background` (image/video/color; reactive later — see below).
- **Keyboard glow / antenna:** `antenna_line`, `antenna_glow`,
  `key_port_left/right/disabled`, `key_glow_left/right`, `glow_bar_left/right`,
  `key_label_font`.
- **Falling notes:** `note_block_left/right`, `note_block_pattern`,
  `note_stretch_mode`, `note_display_mode`, `note_mask_image` (mask-reveal lets a
  picture be "revealed" by notes as they fall — a signature flourish).
- **Piano:** `piano_white_key`, `piano_black_key`, `piano_outline`, `piano_glow`.
- **Scrubber:** `scrubber_track/fill/handle`.
- **Teklet console:** `teklet_bezel`, `teklet_screen_bg`, `teklet_nav_item`,
  `teklet_nav_active`, `teklet_footer`, `teklet_close`.
- **Hit feedback (per timing tier):** `hit_anim_perfect/great/good/miss`
  (spritesheets), `hit_glow_color_left/right`, `hit_glow_pattern`.
- **Colors:** `color_primary` (left), `color_secondary` (right), accents — hex
  strings, not images.

**Hard rule for stage-1 code:** the Renderer hard-codes nothing it could fetch
from `skin.get(...)`. The default look is just the **default skin object**
satisfying this interface — so swapping in a `.tkg` pack later is a data change,
not a code change.

## Reactive backgrounds (later, but reserve the seam)

Not in stage 1 (the space behind the piano stays still for now). Later: an
**osu-style "the beat dances"** background that pulses with the music, **per-song
and per-skin worlds.** Reserve a `FeedbackFX`/background hook that can subscribe
to a **beat/onset stream** (from Transport tempo or the Version's onsets — decide
when built). Backgrounds become another `.tkg`-skinnable, sellable element.

## Custom key→piano mappings (later)

User-defined keyboard→piano maps are part of the vision (the repo already has
presets + a remap system + advanced mode). Treat a mapping as **its own small
shareable config** (JSON), loadable like a mini-skin. The keyboard-map viewer
(see 02) is the natural surface to edit/preview it. Not stage 1.

## UGC, sharing & monetization

- **Free:** personal expression — make your own skin/mapping, use it locally.
- **Paid:** premium skin/background/teklet **packs**, and eventually **songs**
  (licensed MIDI/MusicXML). TKG core stays free; cosmetics & content monetize.
- **Later:** a community/marketplace to share or sell `.tkg` packs and mappings.
  Because the format is a self-contained ZIP+manifest, packs are trivially
  shareable/sellable units. Design validation + a content pipeline before opening
  UGC to the public (untrusted assets → sanitize; see security note).
- **Security note for UGC:** `.tkg` packs carry arbitrary images/video and JSON.
  When user packs become loadable from untrusted sources, validate the manifest
  strictly (the validator exists), constrain asset types/sizes, and never
  `eval`/execute pack content. Keep packs **data-only**, never code.

## Stage-1 scope

- Ship the **default skin** as a default-satisfying object behind the interface.
- If cheap and low-risk: allow loading a local `.tkg` to prove the seam — **but**
  the creator has hit many bugs here before; gate it behind a flag and don't let
  it destabilize the core. Skinning UGC is explicitly a *later* stage.

## Acceptance criteria

- [ ] Renderer reads 100% of visuals via `skin.get(elementId)`; default look is a
      default skin object, not inline constants.
- [ ] Element ids match the `skinConstants` taxonomy above (forward-compatible
      with real `.tkg` packs).
- [ ] A `background`/FeedbackFX hook exists and can later subscribe to a beat
      stream (even if it does nothing in stage 1).
- [ ] (If skin-loading shipped) `.tkg` ZIP + `manifest.json` validated before
      use; packs are data-only.
