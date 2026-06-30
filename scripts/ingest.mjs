// scripts/ingest.mjs — Mutopia (and any-MIDI) ingest pipeline.
//
// Runs the SAME engine the game uses (parseMidi -> analyze -> deriveVersions +
// difficulty descriptors + parseConfidence) over real MIDI files, and STAGES a
// candidate manifest for human review. Per DECISIONS: "stage a candidate list +
// auto difficulty stars, but DON'T ship songs without review."
//
// Inputs (any combination):
//   --dir <folder>     ingest every *.mid/*.midi in a local folder (e.g. a
//                      Mutopia mirror checkout — prefer this for bulk)
//   --urls <file.json> a JSON array of { title, composer, url } MIDI URLs
//   (default)          a small built-in seed list of verified Mutopia URLs
//
// Output:
//   backlog/ingest-candidates.json   the staged review list (sorted by quality)
//
// Notes: Mutopia ships LilyPond (.ly) + MIDI; this ingests the rendered MIDI
// (universal). The .ly source carries richer voice/hand separation — a future
// upgrade is to parse .ly via music21/partitura offline before this stage.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── load the engine by concatenating src/ in manifest order (no DOM needed for
//    the analysis functions we use) — same approach as tests/run-headless.js ──
function loadEngine(){
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,'src/manifest.json'),'utf8'));
  // only the pure engine files (skip runtime/shell/DOM modules)
  const engineFiles = manifest.order.filter(f=>/^src\/engine\//.test(f));
  let src = engineFiles.map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
  src += '\n;module.exports={parseMidi,deriveVersions,scoreDifficulty,starsFromDifficulty,parseConfidence,difficultyFeatures};';
  const m = { exports:{} };
  new Function('module','exports', src)(m, m.exports);
  return m.exports;
}

// a few verified-real Mutopia MIDI URLs (probed: return 200 audio/sp-midi). The
// full archive is large; bulk ingest should point --dir at a Mutopia mirror.
const SEED_URLS = [
  { title:'Prelude No. 1 in C (WTK I)', composer:'J.S. Bach',
    url:'https://www.mutopiaproject.org/ftp/BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.mid' },
];

function analyzeBuffer(E, buffer, meta){
  const parsed = E.parseMidi(buffer.buffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset+buffer.byteLength) : buffer);
  if(!parsed.notes.length) return { ...meta, ok:false, reason:'no playable notes' };
  const dv = E.deriveVersions(parsed);
  const conf = E.parseConfidence(parsed);
  const dur = dv.durationSec;
  return {
    ...meta, ok:true,
    duration: +dur.toFixed(1),
    notes: parsed.notes.length,
    confidence: +conf.score.toFixed(2),
    confidenceReasons: conf.reasons,
    recommend: conf.score>=0.55 && dur>=20 && dur<=600,   // founder: no boring 10s clips; review the rest
    versions: dv.versions.map(v=>({ id:v.id, name:v.name, notes:v.notes.length,
      density:+v.density.toFixed(2), difficulty:+(v.difficulty??0).toFixed(2), stars:v.stars })),
  };
}

async function main(){
  const args = process.argv.slice(2);
  const getArg = k => { const i=args.indexOf(k); return i>=0 ? args[i+1] : null; };
  const E = loadEngine();
  const candidates = [];

  // local folder of MIDI files
  const dir = getArg('--dir');
  if(dir){
    const files = fs.readdirSync(dir).filter(f=>/\.midi?$/i.test(f));
    console.log(`ingesting ${files.length} local MIDI files from ${dir}`);
    for(const f of files){
      try{ const buf=fs.readFileSync(path.join(dir,f));
        candidates.push(analyzeBuffer(E, buf, { title:f.replace(/\.midi?$/i,''), source:'local', file:f }));
      }catch(e){ candidates.push({ title:f, ok:false, reason:String(e.message), source:'local' }); }
    }
  }

  // URL list (json) or the built-in seed
  let urls = SEED_URLS;
  const urlsFile = getArg('--urls');
  if(urlsFile) urls = JSON.parse(fs.readFileSync(urlsFile,'utf8'));
  if(!dir || urlsFile){
    for(const u of urls){
      try{
        const r = await fetch(u.url);
        if(!r.ok){ candidates.push({ ...u, ok:false, reason:'HTTP '+r.status, source:'mutopia' }); continue; }
        const buf = new Uint8Array(await r.arrayBuffer());
        candidates.push(analyzeBuffer(E, buf, { title:u.title, composer:u.composer, url:u.url, source:'mutopia' }));
        console.log(`  ✓ ${u.title}`);
      }catch(e){ candidates.push({ ...u, ok:false, reason:String(e.message), source:'mutopia' }); }
    }
  }

  candidates.sort((a,b)=> (b.recommend?1:0)-(a.recommend?1:0) || (b.confidence||0)-(a.confidence||0));
  const out = { generated: new Date().toISOString(), count: candidates.length,
                note: 'STAGED FOR REVIEW — nothing ships until a human approves (DECISIONS).', candidates };
  const outPath = path.join(ROOT,'backlog','ingest-candidates.json');
  fs.writeFileSync(outPath, JSON.stringify(out,null,2)+'\n','utf8');
  const good = candidates.filter(c=>c.ok && c.recommend).length;
  console.log(`\nstaged ${candidates.length} candidate(s) (${good} recommended) -> ${path.relative(ROOT,outPath)}`);
}
main().catch(e=>{ console.error(e); process.exit(1); });
