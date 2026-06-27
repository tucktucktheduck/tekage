/* ════════════════════════════════════════════════════════════
   4 · SONG STATE  +  analysis pipeline
   ════════════════════════════════════════════════════════════ */
const Song = {
  notes:[],            // full song, all notes (each: {midi,startSec,durationSec,vel,channel,_i, hand,key,skip,backing,voice,salience})
  parts:[],
  duration:0,
  title:'',
  versions:[],         // [{id,name,kind,density,notes:[refs into Song.notes]}]
  version:null,        // the currently selected version
};

function analyze(parsed, title){
  const notes = parsed.notes.map((n,i)=>({...n, _i:i}));
  const span = notes.length ? Math.max(...notes.map(n=>n.startSec+n.durationSec)) : 0;
  Song.notes = notes;
  Song.parts = parsed.parts || [];
  Song.duration = span;
  Song.title = title;
  // Derive density-ranked playable versions from the full note set. Their .notes
  // are references back into Song.notes, so identity is preserved (backing = the
  // rest of the song the engine plays in tandem).
  const dv = deriveVersions({ notes, parts:Song.parts, duration:span, title });
  Song.versions = dv.versions;
  Song.version  = dv.versions[0] || null;        // default = sparsest (Easy · Core)
  resolvePlan();
  return { versions: dv.versions };
}

function selectVersion(id){
  const v = Song.versions.find(x=>x.id===id) || Song.versions[0];
  if(!v) return;
  Song.version = v;
  Transport.pause(); Transport.seek(0);
  resolvePlan();
  draw();
}
