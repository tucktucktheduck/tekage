# DECISIONS.md — the settled-decision log (authoritative)

Dense record of every concrete decision the founder has made. If any other doc
conflicts with this, **this wins**. Distilled from the founder's own words; not
the agent's inference.

## Identity
- One-liner: **"A piano rhythm game played on the QWERTY keyboard."**
- Shorthand (don't ship publicly, copyright): "Guitar Hero for piano on the computer."
- It is an instrument **and** a game; "game vs instrument" and "skill vs
  expression" are explicitly **not** decision-relevant — don't spend effort there.
- Difference from Guitar Hero: learning TKG actually teaches (a bastardized) piano
  — it's still music/art.
- Anti-players: trained/elitist musicians; the vision-impaired and
  low-dexterity — but those last two we **want to serve** (bigger notes, sparser
  cores, one-note-at-a-time).

## The feeling / the bar
- First session: "this was hard — *thank god* for the button that makes it 10×
  easier" (Auto-Slow / core-melody / hero notes). Then: locked in, transported,
  effortless. After: satisfied, time well spent.
- "Aha" = understanding the whole system: keyboard→piano mapping, slices/shifters,
  fingers making music. Job: make all of that **easy to understand** with smart
  visuals (the keyboard-map viewer is one).
- There is no single "yes that's it" feature — **all** requirements must be hit.

## Core mechanic — slices (the differentiator; "must be perfect")
- Two hands, each a movable one-octave slice; shift keys move them; no crossing.
- Ideal one note per hand; 2/hand allowed; 3 total only if other hand silent.
- Two hands stay two hands (no one-hand collapse). Octave jumps encouraged.
- **Slices are infinitely customizable** (later, via the generator): turn the left
  slice off → one big slice; set N notes per hand; asymmetric (2 octaves L, 1 R);
  remap any computer key → any piano note; **diads/triads** (one key → multiple
  piano notes) = **later**.

## DAG solver scope
- Keep solver contract; you change which notes reach it, not its placement.
- Build the **common case excellently**: 2 hands, 1–2 notes/hand, standard QWERTY.
- Support **1–60 notes per hand** as a config range (full keyboard incl. numbers),
  but the solver only needs to be *good enough* for the common case; complex
  configs fall back to **Auto-Shift**. Diads/triads later.
- Unplayable songs: solver does its best, then a warning dialog (see Songs).

## Modes & assists (all important; Auto-Shift especially)
- **PLAY** (default): backing track plays with you.
- **LISTEN**: everything auto-plays; watch the slices move.
- **Auto-Slow**: on a miss, the song slows to let you catch up, then resumes —
  the headline "10× easier" button.
- **Auto-Shift**: handles slice shifting for you. **Must ship.**
- **Rest of Song**: engine plays the notes your hands don't cover.

## Scoring (coming; not stage 1)
- Tiers: **Perfect / Good / Okay / Miss**, Guitar-Hero-style — the **note** is the
  bright thing that lights/pulses (keep the existing accuracy circle but make the
  note the star).
- On miss: you **hear the wrong note you played**; song continues.
- End-of-song score = **notes hit ÷ notes that fell** — pure accuracy.
- Accuracy = timing: (a) hit at the right start, (b) released at the right end →
  enables "too late / held too long / released early" feedback. No expression
  scoring.

## Progression
- Sandbox instrument **+** a Duolingo/Candy-Crush **adventure path**, accessed
  **through the Teklet** as a separate mode.
- Baa Baa Black Sheep → Viva La Vida within hours/days; content + skill progression.
- **Skill trees beyond density**: fast notes / chords / one-hand / two-hands.
  Tests let you **skip whole sections**; clearing songs unlocks branches.
- **Badges**: total notes hit (10k/30k…), accurate notes hit, clearing tree
  sections, passing levels.
- Difficulty is **player-controlled, not dynamic**. If accuracy is poor, a blurb
  may *suggest* the easy buttons (auto-slow/shift/rest) — never auto-applies.
- Difficulty metric = **density (notes/sec)** → **1–5 stars**. Later, richer rating
  from shift-complexity + rhythm pattern (wanted, method TBD).

## Versions (the extractor output)
- **Core** (1–2, maybe 3, notes at a time), **Two-Voice** (L+R, one/hand),
  **Full** (every MIDI note). Difference = how many notes fall at once.
- Pick a version, then play **that or higher**. Extraction per `docs/07`.

## Onboarding (build for Stage 2)
- **Landing page** like chess.com: TKG branding; left side "Piano rhythm game on
  your QWERTY keyboard" + bold TKG + tagline; two buttons: **"First time playing"
  / "I'm already a pro."** Shown first time (local memory).
- Beginner walkthrough hosted by a character, **Blurt** (text-box guide):
  welcome → play **Baa Baa Black Sheep** → "let me show you the easy buttons" →
  open Teklet → explain Auto-Shift, Rest-of-Song, Auto-Slow → song select/upload
  → speed. Before first note: Blurt points at the note bottom + hit line ("when
  the bottom hits this line, press the key"), practice one note, then a full song.
- **Two-hand tutorial**: load a hard song; notes flood; after ~10s Blurt: "Whoa,
  that's a lot of notes" → left hand = Shift+Tab, right = Shift+Enter → a
  **shift-drill mini-game** (move your shifter to a ball above a note; target key
  highlighted on-screen). 2–3 tutorial songs.
- First failure mode to prevent: too-hard song → quit. The tutorial must make the
  first experience positive.
- Onboarding song wish: **Heart and Soul** (copyright) → fallback **Baa Baa Black
  Sheep** for now.

## Songs / library
- Now: local **MIDI / MusicXML** upload.
- Soon: built-in **starter library** from **Mutopia** (copyright-free); a couple
  dozen → couple hundred (ideally thousands) of **recognizable, fun** pieces; the
  most popular copyright-free piano songs; no obscure deep cuts; avoid boring
  ~10-second clips.
- Low-confidence parse → warning dialog, exact copy:
  *"Our note loader is not that complicated (yet). There might be some bugs from
  your MIDI file."* Buttons **Play Anyway / Go Back to Library**, checkbox
  **Don't show this again.** Trigger when load confidence is low (has it got a
  baked melody? can we extract a strong one?).
- No max note-fall speed; if it's too fast, slow the song.

## Visuals / skins / Teklet
- Visual identity already exists in `tekage-synth.html` (retro-futurism, space).
  **Preserve it.** Teklet = a Pip-Boy-style **console / settings menu** (60s tech,
  pulsing LEDs) that slides in; "Teklet" is just a cool name for settings.
- Only critical on-screen info = **which notes fall + which keys to press**;
  everything else can live in the Teklet. Player's eyes on notes/keys.
- **Skins are core.** Note-changer = what's *inside* the falling note: solid color,
  gradient, PNG/GIF, tiled image, scaled image. Background = PNG or **MOV/video**.
  Primary + secondary **hex color pickers**; *all* in-game colors read from them.
- **MVP skin** = upload a PNG background + change the primary color.
- Skin **editor** = a studio with all options laid out; users create & share skins.
- Skins **never affect gameplay. No pay-to-win.**
- Reactive/"dancing" backgrounds (osu! / A Dance of Fire and Ice) = **later**;
  video backgrounds cover it for now — **don't** build beat-reactivity yet.

## Architecture (the big one)
- **HTML-generator model.** The thing players run is a **small, self-contained,
  scrappy HTML** with its config baked in (runs on old machines). Changing
  background / notes / slices / mapping = re-generate the HTML from settings; the
  player just edits settings and a fresh build swaps in (old archived). Lightweight
  is a hard value — no multi-GB loader.
- Implemented as: a **config object** (JSON, serializable) drives a dynamic
  runtime; **Export → standalone HTML** bakes the config in. Dynamic in dev,
  baked for distribution. See `docs/10`.

## Monetization / growth
- Core game **free to play** online. **Skin editor unlock = $5 one-time** (and
  Steam/account). **Songs = $10/mo subscription** ($7 TKG, $3 licensing split by
  play time).
- Buyers: disposable-income cosmetic-wanters, "the bored HR lady," parents, gamers
  used to $60 games.
- Discovery: Discord + social; UGC from skilled players (TikTok piano wave) is the
  explosion vector. Shareable artifact = screen-recording → social. No "winning"
  TKG (you don't beat a piano).
- Desktop now; mobile later. Remote 2-player duet = dream/future. Boss fights
  (skill-drilling hard songs) and seasonal events (Love Island jingle, May-4th
  lightsaber notes, Christmas) = later.

## Explicit non-goals for the autonomous build (now)
Mobile; multiplayer/duet; reactive backgrounds; payment/accounts/Steam; the full
song marketplace; diads/triads. Reserve seams (see 01/06), don't implement.
