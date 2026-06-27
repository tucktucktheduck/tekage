# 10 · CONFIG & THE HTML GENERATOR

> The founder's scalability decision, made precise. Resolves how "infinitely
> customizable" (skins, mappings, slice shapes) coexists with "a scrappy,
> lightweight HTML that runs on old computers."

## The model

There is **one config object** and **two ways to run it**:

1. **Dev / dynamic runtime** — the engine reads `TKGConfig` at startup and can
   re-read it live. This is what you build and test against in `src/`.
2. **Distributed artifact** — an **Export** step bakes a chosen `TKGConfig` into a
   single self-contained `tkg.html` (engine + assets-as-data-URIs + config inline).
   That file is what a player downloads/opens; it has no build step, no network,
   no multi-MB loader. Changing settings = produce a new baked HTML; the player
   just edits settings and the fresh build swaps in (old one archived).

So: **dynamic in development, baked for distribution.** The player never feels a
"generator" — they open the Teklet, change settings, and a new lightweight build
appears. `tekage-synth.html` proves the baked target is viable and is the visual
reference.

## `TKGConfig` (the single source of customization)

Serializable JSON. Everything customizable lives here; nothing visual or layout is
hard-coded in the engine.

```jsonc
{
  "version": 1,
  "song":   { "source": "library|upload", "id": "…" },     // what to play
  "skin":   { "ref": "default | <packId>",                 // see docs/03 (.tkg)
              "colors": { "primary": "#1a8fff", "secondary": "#ff8a2b" },
              "note":   { "mode": "solid|gradient|image|tiled|scaled", "asset": "…" },
              "background": { "mode": "color|image|video", "asset": "…" } },
  "slices": { "hands": [                                    // 1..2 hands
                { "id":"left",  "keys": 12, "anchorOctave": 4 },
                { "id":"right", "keys": 12, "anchorOctave": 5 } ],
              "mapping": "default | <mappingId>",           // key→note map, remappable
              "autoShift": false },
  "assists":{ "autoSlow": false, "restOfSong": true, "speed": 1.0 },
  "mode":   "play|listen",
  "difficulty": "core|two-voice|full"
}
```

- **One hand** = set `slices.hands` to a single entry (the "one big slice" the
  founder described). **Asymmetric** = different `keys`/`anchorOctave` per hand.
- **Remapping** = a `mapping` id resolving to a `{key: noteName}` table; editable
  in the keyboard-map viewer (02). **Diads/triads** (`key → [notes]`) are a future
  field; reserve it, don't implement.
- The engine validates config and **falls back safely** (bad field → default;
  unsolvable slice config → Auto-Shift) rather than crashing.

## Boundaries

- `loadConfig(json) → TKGConfig` (validate + defaults) — pure.
- The runtime subscribes to config; **renderer, audio, input, solver inputs** all
  derive from it. No module hard-codes a color, key map, or slice shape.
- `exportHTML(TKGConfig) → string` — produces the standalone file (engine bundle +
  inlined assets + frozen config). Pure string-builder; testable.
- Storage of saved configs/skins/mappings goes through the storage interface (01),
  swappable (memory in sandbox, IndexedDB in app).

## Why this shape

- **Lightweight artifact**: the baked HTML carries only what its config needs.
- **Infinite customization without solver chaos**: the solver always sees a
  concrete slice/mapping config; it never has to be general at runtime — the
  *config* varies, the solved plan is computed for that config.
- **Shareable**: a baked `tkg.html` (or a `.tkg` skin + a config) is a portable
  unit — the basis for sharing/selling later.

## Acceptance criteria

- [ ] A single `TKGConfig` drives all visuals, slice shape, mapping, mode, assists.
- [ ] `loadConfig` validates and fills defaults; bad input never crashes the game.
- [ ] No engine/runtime module hard-codes a color, asset, key-map, or slice count
      that `TKGConfig` could supply.
- [ ] One-hand, asymmetric-hands, and a custom key→note mapping all work via config
      with no code change.
- [ ] `exportHTML(config)` yields a self-contained file that opens offline and
      plays the configured song with the configured look.
- [ ] Unsolvable slice config degrades to Auto-Shift, not an error.
