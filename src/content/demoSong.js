/* ════════════════════════════════════════════════════════════
   9 · DEMO SONG  — clear top-line melody (ch0) over block-chord
   accompaniment (ch1) + bass, so melody isolation is visible.
   I–vi–IV–V in C, 100 BPM.
   ════════════════════════════════════════════════════════════ */
function buildDemo(){
  const BPM=100, spb=60/BPM;           // seconds per beat
  const notes=[];
  const add=(midi,beat,beats,ch,vel=92)=>notes.push({midi,startSec:beat*spb,durationSec:beats*spb*0.96,vel,channel:ch});

  // melody (channel 0) — singable, mostly stepwise, register C5..A5
  const mel=[ // [midi, startBeat, beats]
    [76,0,1],[77,1,1],[79,2,2],            // E F G–
    [77,4,1],[76,5,1],[74,6,2],            // F E D–
    [72,8,1],[74,9,1],[76,10,1],[77,11,1], // C D E F
    [79,12,2],[76,14,2],                   // G– E–
    [81,16,1],[79,17,1],[77,18,2],         // A G F–
    [76,20,1],[74,21,1],[72,22,2],         // E D C–
    [74,24,1],[76,25,1],[77,26,1],[79,27,1],
    [81,28,2],[79,30,2],                   // A– G–
  ];
  for(const [m,b,d] of mel) add(m,b,d,0,100);

  // accompaniment (channel 1) — block triads on each beat; one chord per 2 beats
  const prog=[ // [rootMidi triad notes], 2 beats each, 16 slots
    [60,64,67],[60,64,67], // C
    [57,60,64],[57,60,64], // Am
    [53,57,60],[53,57,60], // F
    [55,59,62],[55,59,62], // G
    [60,64,67],[60,64,67], // C
    [57,60,64],[57,60,64], // Am
    [53,57,60],[53,57,60], // F
    [55,59,62],[55,59,62], // G
  ];
  prog.forEach((chord,i)=>{ const b=i*2;
    chord.forEach(m=>{ add(m,b,1,1,68); add(m,b+1,1,1,60); }); // gentle two hits per chord
  });
  // bass (channel 1, low) — one per bar
  const bass=[36,33,29,31,36,33,29,31];
  bass.forEach((m,i)=>add(m,i*4,4,1,80));

  notes.sort((a,b)=>a.startSec-b.startSec);
  return { notes, parts:[
    {channel:0,name:'Channel 1',notes:notes.filter(n=>n.channel===0)},
    {channel:1,name:'Channel 2',notes:notes.filter(n=>n.channel===1)},
  ]};
}

function loadDemo(){
  Transport.pause(); Transport.seek(0);
  const parsed=buildDemo();
  analyze(parsed,'DEMO · "FIRST LIGHT"');
  $('songName').textContent=Song.title;
  buildVersionButtons();
  flash(`Demo loaded · pick a difficulty below · now on <b>${Song.version?.name||'—'}</b> · the letters are the keys you press`, true);
  draw();
}
