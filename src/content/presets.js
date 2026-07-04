/* ════════════════════════════════════════════════════════════
   15 · SLICE PRESETS  (shipped keyboard→note layouts)
   A preset is a named list of slices (see docs/14). `normalizeSlices`
   (config.js) turns any of these into validated runtime slices. Two
   ship by default:
     • standard     — the classic TKG 12+12 (byte-equivalent to BUILTIN_MAP)
     • keyboardgame — the "versell" layout (19 left / 24 right, chromatic)
   `legacy` is a reserved slot pending the founder's tekagelegacy map.
   Offsets are SEMITONES from the slice anchor (a MIDI note); anchors move
   by `step` when you press the slice's shift keys. shiftKeys are
   KeyboardEvent.code values. See docs/14 §3 for the transcription notes.
   ════════════════════════════════════════════════════════════ */
const SLICE_PRESETS = {
  // ── TKG Standard: the built-in layout, expressed as numeric offsets.
  //    C=0 C#=1 D=2 D#=3 E=4 F=5 F#=6 G=7 G#=8 A=9 A#=10 B=11.
  //    Reproduces BUILTIN_MAP exactly; anchors 60 (C4) / 72 (C5) match the
  //    legacy userSlice {L:4,R:5} seeds.
  standard: {
    label: 'TKG Standard',
    list: [
      { id:'left', label:'L', order:0, step:12, minAnchor:12, maxAnchor:96, initialAnchor:60,
        shiftKeys:{ up:'Tab', down:'ShiftLeft' }, color:null,
        keys:{ q:1, w:3, e:6, r:8, t:10, a:0, s:2, d:4, f:5, x:7, c:9, v:11 } },
      { id:'right', label:'R', order:1, step:12, minAnchor:12, maxAnchor:96, initialAnchor:72,
        shiftKeys:{ up:'Enter', down:'ShiftRight' }, color:null,
        keys:{ y:1, u:3, i:6, o:8, p:10, j:0, k:2, l:4, ';':5, n:7, m:9, ',':11 } },
    ],
  },

  // ── Keyboard Game (the "versell" layout, from tucktucktheduck/thekeyboardgame).
  //    Left slice: 19 keys, contiguous chromatic −7…+11 around the anchor.
  //    Right slice: 24 keys, full two chromatic octaves 0…+23.
  //    Diatonic notes on the two letter rows, sharps on the QWERTY + number
  //    rows. Do NOT "correct" this table — it is the verified transcription
  //    (see docs/14 §3.2; a test asserts left offs == −7…11, right == 0…23).
  keyboardgame: {
    label: 'Keyboard Game',
    list: [
      { id:'left', label:'L', order:0, step:12, minAnchor:12, maxAnchor:84, initialAnchor:48,
        shiftKeys:{ up:'CapsLock', down:'ShiftLeft' }, color:null,
        keys:{ q:-7, '2':-6, a:-5, w:-4, z:-3, '3':-2, x:-1,
               s:0, e:1, c:2, '4':3, d:4, v:5, r:6, f:7, '5':8, b:9, t:10, g:11 } },
      { id:'right', label:'R', order:1, step:12, minAnchor:24, maxAnchor:84, initialAnchor:72,
        shiftKeys:{ up:'Enter', down:'ShiftRight' }, color:null,
        keys:{ h:0, '6':1, n:2, y:3, j:4, m:5, '7':6, k:7, u:8, ',':9, i:10, l:11,
               '.':12, '8':13, '/':14, o:15, ';':16, '[':17, '9':18, "'":19, p:20, ']':21, '0':22, '\\':23 } },
    ],
  },

  // ── Legacy: reserved. github.com/tucktucktheduck/tekagelegacy was inaccessible
  //    at handoff time (404/private). Founder: it holds a mapping they "really
  //    enjoyed" plus the original note-remapping ability.
  //    TODO(founder): paste tekagelegacy map here as a slice list (same shape as
  //    keyboardgame above) and flip this from null. The Teklet renders a disabled
  //    "Legacy — upload pending" row while this stays null.
  legacy: null,
};
