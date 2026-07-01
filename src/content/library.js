/* ════════════════════════════════════════════════════════════
   9.5 · STARTER LIBRARY  — built-in, recognizable, copyright-free
   Most people don't have MIDI lying around (docs/00, DECISIONS); the
   library is how you "load a song, play it, feel it come out of your
   fingers" on first open. Each song is authored as a compact melody +
   light accompaniment and flows through the SAME extractor pipeline
   (analyze -> Core/Two-Voice/Full), so difficulty Versions just work.
   Public-domain only (Trad. / Beethoven / Anon.). Baa Baa Black Sheep
   is the founder's onboarding song.
   ════════════════════════════════════════════════════════════ */

const _SEMI = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
// note name -> MIDI (C4 = 60, scientific pitch)
function _nm(name){
  const m = String(name).match(/^([A-G][#b]?)(-?\d)$/);
  if(!m || _SEMI[m[1]]===undefined) return null;
  return (parseInt(m[2],10)+1)*12 + _SEMI[m[1]];
}
// chord token ('C','Am','F#m') -> triad MIDI in the given octave
function _triad(token, octave){
  const m = String(token).match(/^([A-G][#b]?)(m)?$/);
  if(!m) return [];
  const base = (octave+1)*12 + _SEMI[m[1]];
  const third = m[2]==='m' ? 3 : 4;
  return [base, base+third, base+7];
}

/* Build a {notes, parts} payload (the analyze() input shape) from a spec:
   melody: [[noteName|'_', beats], ...]  sequential, channel 0 (the hero line)
   chords: [[chordTok|'_', beats], ...]  sequential, channel 1 (triad + bass) */
function buildLibrarySong(spec){
  const spb = 60/(spec.bpm||100);
  const notes = [];
  let t=0;
  for(const [name,beats] of spec.melody){
    if(name!=='_'){ const midi=_nm(name);
      if(midi!=null) notes.push({midi, startSec:+(t*spb).toFixed(4), durationSec:+(beats*spb*0.95).toFixed(4), vel:102, channel:0}); }
    t += beats;
  }
  const cOct = spec.chordOctave ?? 3, bOct = spec.bassOctave ?? 2;
  let ct=0;
  for(const [tok,beats] of (spec.chords||[])){
    if(tok!=='_'){
      for(const mm of _triad(tok,cOct))
        notes.push({midi:mm, startSec:+(ct*spb).toFixed(4), durationSec:+(beats*spb*0.9).toFixed(4), vel:60, channel:1});
      const root = _nm(tok.match(/^([A-G][#b]?)/)[1] + bOct);
      if(root!=null) notes.push({midi:root, startSec:+(ct*spb).toFixed(4), durationSec:+(beats*spb*0.9).toFixed(4), vel:76, channel:1});
    }
    ct += beats;
  }
  notes.sort((a,b)=>a.startSec-b.startSec || a.midi-b.midi);
  return { notes, parts:[
    {channel:0, name:'Melody', notes:notes.filter(n=>n.channel===0)},
    {channel:1, name:'Accompaniment', notes:notes.filter(n=>n.channel===1)},
  ]};
}

// ── the songs (melodies kept accurate; harmony kept simple & pleasant) ──
const LIBRARY = [
  { id:'baa-baa', title:'Baa Baa Black Sheep', tag:'Trad. · the first song', bpm:112,
    melody:[
      ['C5',1],['C5',1],['G5',1],['G5',1],['A5',1],['A5',1],['G5',2],
      ['F5',1],['F5',1],['E5',1],['E5',1],['D5',1],['D5',1],['C5',2],
      ['G5',1],['G5',1],['F5',1],['F5',1],['E5',1],['E5',1],['D5',2],
      ['G5',1],['G5',1],['F5',1],['F5',1],['E5',1],['E5',1],['D5',2],
      ['C5',1],['C5',1],['G5',1],['G5',1],['A5',1],['A5',1],['G5',2],
      ['F5',1],['F5',1],['E5',1],['E5',1],['D5',1],['D5',1],['C5',2],
    ],
    chords:[ ['C',4],['F',2],['C',2], ['G',2],['C',2], ['C',2],['G',2],['G',2],['C',2],
             ['C',4],['F',2],['C',2] ] },

  { id:'ode-to-joy', title:'Ode to Joy', tag:'Beethoven', bpm:118,
    melody:[
      ['E5',1],['E5',1],['F5',1],['G5',1], ['G5',1],['F5',1],['E5',1],['D5',1],
      ['C5',1],['C5',1],['D5',1],['E5',1], ['E5',1.5],['D5',0.5],['D5',2],
      ['E5',1],['E5',1],['F5',1],['G5',1], ['G5',1],['F5',1],['E5',1],['D5',1],
      ['C5',1],['C5',1],['D5',1],['E5',1], ['D5',1.5],['C5',0.5],['C5',2],
    ],
    chords:[ ['C',4],['G',2],['C',2], ['C',2],['G',2],['G',2],['C',2],
             ['C',4],['G',2],['C',2], ['C',2],['G',2],['G',2],['C',2] ] },

  { id:'jingle-bells', title:'Jingle Bells', tag:'Trad.', bpm:120,
    melody:[
      ['E5',1],['E5',1],['E5',2], ['E5',1],['E5',1],['E5',2],
      ['E5',1],['G5',1],['C5',1],['D5',1], ['E5',4],
      ['F5',1],['F5',1],['F5',1],['F5',1], ['F5',1],['E5',1],['E5',1],['E5',1],
      ['E5',1],['D5',1],['D5',1],['E5',1], ['D5',2],['G5',2],
    ],
    chords:[ ['C',4],['C',4], ['C',2],['G',2],['C',4],
             ['F',4],['C',4], ['G',4],['C',2],['G',2] ] },

  { id:'fur-elise', title:'Für Elise', tag:'Beethoven · faster', bpm:88, chordOctave:3, bassOctave:2,
    melody:[
      ['E5',0.5],['D#5',0.5],['E5',0.5],['D#5',0.5],['E5',0.5],['B4',0.5],['D5',0.5],['C5',0.5],['A4',1.5],
      ['_',0.5],['C4',0.5],['E4',0.5],['A4',0.5],['B4',1.5],
      ['_',0.5],['E4',0.5],['G#4',0.5],['B4',0.5],['C5',1.5],
      ['_',0.5],['E5',0.5],['D#5',0.5],['E5',0.5],['D#5',0.5],['E5',0.5],['B4',0.5],['D5',0.5],['C5',0.5],['A4',1.5],
    ],
    chords:[ ['Am',3], ['Am',2], ['E',2], ['Am',3] ] },

  { id:'frere-jacques', title:'Frère Jacques', tag:'Trad. · round', bpm:108,
    melody:[
      ['C5',1],['D5',1],['E5',1],['C5',1], ['C5',1],['D5',1],['E5',1],['C5',1],
      ['E5',1],['F5',1],['G5',2], ['E5',1],['F5',1],['G5',2],
      ['G5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',1],['C5',1], ['G5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',1],['C5',1],
      ['C5',1],['G4',1],['C5',2], ['C5',1],['G4',1],['C5',2],
    ],
    chords:[ ['C',4],['C',4], ['C',2],['G',2],['C',2],['G',2],
             ['C',2],['G',2],['C',2],['G',2], ['C',2],['G',2],['C',2],['G',2] ] },

  // ── traditional carols / folk (authored melodies; public domain) ──
  { id:'silent-night', title:'Silent Night', tag:'Carol · 3/4', bpm:96, chordOctave:3, bassOctave:2,
    melody:[
      ['G4',1.5],['A4',0.5],['G4',1],['E4',3],
      ['G4',1.5],['A4',0.5],['G4',1],['E4',3],
      ['D5',2],['D5',1],['B4',3], ['C5',2],['C5',1],['G4',3],
      ['A4',2],['A4',1],['C5',1.5],['B4',0.5],['A4',1],
      ['G4',1.5],['A4',0.5],['G4',1],['E4',3],
      ['A4',2],['A4',1],['C5',1.5],['B4',0.5],['A4',1],
      ['G4',1.5],['A4',0.5],['G4',1],['E4',3],
      ['D5',2],['D5',1],['F5',1.5],['D5',0.5],['B4',1], ['C5',3],['E5',3],
      ['C5',1],['G4',1],['E4',1],['G4',1.5],['F4',0.5],['D4',1],['C4',3],
    ],
    chords:[ ['C',3],['C',3],['G',3],['C',3],['C',3],['C',3],['G',3],['C',3],
             ['C',3],['C',3],['F',3],['C',3],['G',3],['C',3],['C',3],['C',3],
             ['G',3],['C',3],['F',3],['C',3],['G',3],['C',3],['C',3] ] },

  { id:'we-wish-you', title:'We Wish You a Merry Christmas', tag:'Carol · 3/4', bpm:150,
    melody:[
      ['C5',1], ['F5',1],['F5',1],['G5',1], ['F5',1],['E5',1],['D5',1], ['D5',2],['D5',1],
      ['G5',1],['G5',1],['A5',1], ['G5',1],['F5',1],['E5',1], ['C5',2],['C5',1],
      ['A5',1],['A5',1],['A#5',1], ['A5',1],['G5',1],['F5',1], ['D5',2],['C5',1],
      ['C5',1],['D5',1],['G5',1], ['E5',1],['F5',2], ['F5',3],
    ],
    chords:[ ['F',3],['F',3],['C',3],['C',3], ['F',3],['A#',3],['C',3],['F',3],
             ['F',3],['C',3],['F',3],['F',3] ] },

  { id:'deck-the-halls', title:'Deck the Halls', tag:'Carol · 4/4', bpm:132,
    melody:[
      ['G5',1],['F5',1],['E5',1],['D5',1], ['C5',1],['D5',1],['E5',1],['C5',1],
      ['D5',1],['E5',1],['F5',1],['D5',1], ['E5',0.5],['F5',0.5],['G5',0.5],['A5',0.5],['G5',1],['F5',1],['E5',1],['D5',1],
      ['G5',1],['F5',1],['E5',1],['D5',1], ['C5',1],['D5',1],['E5',1],['C5',1],
      ['D5',1],['E5',1],['F5',1],['D5',1], ['C5',2],['C5',2],
    ],
    chords:[ ['C',4],['C',4], ['G',4],['C',4], ['C',4],['C',4], ['G',4],['C',4] ] },

  { id:'amazing-grace', title:'Amazing Grace', tag:'Folk · 3/4', bpm:90,
    melody:[
      ['D4',1], ['G4',2],['B4',1], ['B4',2],['A4',1], ['G4',2],['E4',1], ['D4',3],
      ['D4',1], ['G4',2],['B4',1], ['B4',2],['A4',1], ['D5',3], ['D5',2],['D5',1],
      ['B4',2],['D5',1], ['B4',2],['A4',1], ['G4',2],['E4',1], ['D4',3],
      ['D4',1], ['G4',2],['B4',1], ['B4',2],['A4',1], ['G4',3], ['G4',3],
    ],
    chords:[ ['G',3],['G',3],['C',3],['G',3],['G',3],['Em',3],['D',3],['D',3],
             ['G',3],['G',3],['D',3],['G',3],['C',3],['G',3],['D',3],['G',3] ] },

  { id:'auld-lang-syne', title:'Auld Lang Syne', tag:'Folk · 4/4', bpm:96,
    melody:[
      ['C5',1], ['F5',1.5],['E5',0.5],['F5',1],['A5',1], ['G5',1.5],['F5',0.5],['G5',1],['A5',1],
      ['F5',1.5],['F5',0.5],['A5',1],['C6',1], ['D6',3],['D6',1],
      ['C6',1.5],['A5',0.5],['A5',1],['F5',1], ['G5',1.5],['F5',0.5],['G5',1],['A5',1],
      ['F5',1.5],['D5',0.5],['D5',1],['C5',1], ['F5',3],
    ],
    chords:[ ['F',4],['F',2],['C',2],['F',4],['A#',2],['F',2],
             ['F',4],['A#',2],['C',2],['F',2],['C',2],['F',4] ] },

  { id:'greensleeves', title:'Greensleeves', tag:'Folk · 3/4', bpm:110, chordOctave:3,
    melody:[
      ['A4',1], ['C5',2],['D5',1], ['E5',2],['F5',1], ['E5',2],['D5',1], ['B4',2],['G4',1],
      ['A4',2],['B4',1], ['C5',2],['A4',1], ['A4',2],['G#4',1], ['A4',2],['B4',1], ['C5',3],
      ['A4',1], ['C5',2],['D5',1], ['E5',2],['F5',1], ['E5',2],['D5',1], ['B4',2],['G4',1],
      ['A4',2],['B4',1], ['C5',1],['B4',1],['A4',1], ['G#4',2],['F#4',1], ['G#4',3],
    ],
    chords:[ ['Am',3],['C',3],['G',3],['Em',3], ['Am',3],['E',3],['Am',3],['Am',3],
             ['Am',3],['C',3],['G',3],['Em',3], ['Am',3],['E',3],['Am',3],['Am',3] ] },
];

function songById(id){ return LIBRARY.find(s=>s.id===id) || null; }
function buildLibraryById(id){ const s=songById(id); return s ? buildLibrarySong(s) : null; }
