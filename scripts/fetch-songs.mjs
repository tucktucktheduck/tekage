// scripts/fetch-songs.mjs — download the curated well-known MIDIs into songs/ and
// write songs/manifest.json. These get BAKED into the game by build.mjs, so they
// load offline with no fetch/CORS (Mutopia sends no CORS header, so a file:// game
// can't stream them live — baking is the fix).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SONGS = path.join(ROOT, 'songs');
const B = 'https://www.mutopiaproject.org/ftp/';

// curated, verified-real Mutopia URLs (famous piano pieces the founder asked for)
const LIST = [
  ['fur-elise','Für Elise','Ludwig van Beethoven','classical','BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.mid'],
  ['pathetique-2','Pathétique Sonata · 2nd mvt','Ludwig van Beethoven','classical','BeethovenLv/O13/pathetique-2/pathetique-2.mid'],
  ['clair-de-lune','Clair de Lune','Claude Debussy','classical','DebussyC/L75/debussy_Ste_Bergamesq_Clair/debussy_Ste_Bergamesq_Clair.mid'],
  ['gymnopedie-1','Gymnopédie No. 1','Erik Satie','classical','SatieE/gymnopedie_1/gymnopedie_1.mid'],
  ['prelude-in-c','Prelude in C (WTK I)','J. S. Bach','classical','BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.mid'],
  ['chopin-nocturne-eb','Nocturne in E-flat (Op.9 No.2)','Frédéric Chopin','classical','ChopinFF/O9/chopin_nocturne_op9_n2/chopin_nocturne_op9_n2.mid'],
  ['fantaisie-impromptu','Fantaisie-Impromptu','Frédéric Chopin','classical','ChopinFF/O66/chopin_fantaisie-impromptu/chopin_fantaisie-impromptu.mid'],
  ['mozart-k545','Piano Sonata No. 16 (K.545)','W. A. Mozart','classical','MozartWA/KV545/K545-1/K545-1.mid'],
  ['traumerei','Träumerei','Robert Schumann','classical','SchumannR/O15/SchumannOp15No07/SchumannOp15No07.mid'],
  ['canon-in-d','Canon in D','Johann Pachelbel','classical','PachelbelJ/CanonInD/CanonInD.mid'],
  ['entertainer','The Entertainer','Scott Joplin','ragtime','JoplinS/entertainer/entertainer.mid'],
  ['maple-leaf-rag','Maple Leaf Rag','Scott Joplin','ragtime','JoplinS/maple/maple.mid'],
  ['easy-winners','The Easy Winners','Scott Joplin','ragtime','JoplinS/winners/winners.mid'],
  ['solace','Solace','Scott Joplin','ragtime','JoplinS/solace/solace.mid'],
];

if(!fs.existsSync(SONGS)) fs.mkdirSync(SONGS, {recursive:true});
const manifest = [];
for(const [id,title,composer,tag,rel] of LIST){
  const file = id + '.mid';
  const dest = path.join(SONGS, file);
  try{
    if(!fs.existsSync(dest)){
      const r = await fetch(B+rel);
      if(!r.ok){ console.log('  404', id); continue; }
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      console.log('  ↓', id);
    } else console.log('  =', id, '(cached)');
    manifest.push({ id, title, composer, tag, file, source:B+rel });
  }catch(e){ console.log('  ERR', id, e.message); }
}
fs.writeFileSync(path.join(SONGS,'manifest.json'), JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(`\n${manifest.length} songs -> songs/manifest.json`);
