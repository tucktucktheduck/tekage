// scripts/crawl-mutopia.mjs — crawl Mutopia's browsable archive, parse every MIDI
// through the SAME engine the game uses, and build a real catalog + the library
// page the game links to.
//
//   node scripts/crawl-mutopia.mjs [--limit 36] [--per 3]
//
// Mutopia's /ftp/ is Apache-autoindexed: composer/ -> work/ -> piece/ -> *.mid.
// We crawl a curated allowlist of well-known composers (DECISIONS: "recognizable,
// fun … no obscure deep cuts"), bounded + polite (delays, caps). For each MIDI we
// compute the difficulty tiers (Core/Two-Voice/Full + stars) and whether the file
// carries its own hand assignment. Writes backlog/mutopia-catalog.json and
// generates library.html (catalog baked in, self-contained).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://www.mutopiaproject.org/ftp/';

// Mutopia composer directory names (famous, mostly solo-piano-rich)
const COMPOSERS = [
  'BachJS','BeethovenLv','MozartWA','ChopinFF','SchubertF','SchumannR','DebussyC',
  'SatieE','ClementiM','HandelGF','HaydnFJ','BrahmsJ','GriegE','JoplinS','MendelssohnF',
];

function loadEngine(){
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,'src/manifest.json'),'utf8'));
  const engineFiles = manifest.order.filter(f=>/^src\/engine\//.test(f));
  let src = engineFiles.map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
  src += '\n;module.exports={parseMidi,deriveVersions,scoreDifficulty,starsFromDifficulty,parseConfidence,detectSourceHands};';
  const m={exports:{}}; new Function('module','exports',src)(m,m.exports); return m.exports;
}

const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function listDir(url){
  try{
    const r = await fetch(url); if(!r.ok) return {dirs:[],mids:[]};
    const t = await r.text();
    const hrefs = [...t.matchAll(/href="([^"]+)"/g)].map(m=>m[1])
      .filter(h=>!h.startsWith('?') && !h.startsWith('/') && h!=='../');
    return {
      dirs: hrefs.filter(h=>h.endsWith('/')),
      mids: hrefs.filter(h=>/\.midi?$/i.test(h)),
    };
  }catch(e){ return {dirs:[],mids:[]}; }
}

// prefer a "plain" piano rendition over guitar/duo/transposed variants
function pickMid(mids){
  const score = m => (/guitar|duo|transpos|sax|clarinet|viol|flute|trumpet/i.test(m)?10:0) + (/-a4|-let/i.test(m)?1:0);
  return [...mids].sort((a,b)=>score(a)-score(b))[0];
}
function prettyTitle(pieceDir, work){
  let s = decodeURIComponent(pieceDir.replace(/\/$/,'')).replace(/[-_]/g,' ').trim();
  if(s.length<3 && work) s = decodeURIComponent(work.replace(/\/$/,'')).replace(/[-_]/g,' ');
  return s.replace(/\b\w/g, c=>c.toUpperCase());
}

async function main(){
  const args=process.argv.slice(2);
  const argN=(k,d)=>{const i=args.indexOf(k); return i>=0?+args[i+1]:d;};
  const LIMIT=argN('--limit',36), PER=argN('--per',3);
  const E=loadEngine();
  const catalog=[]; let scanned=0;

  outer:
  for(const comp of COMPOSERS){
    const compUrl=BASE+comp+'/';
    const {dirs:works}=await listDir(compUrl);
    if(!works.length) continue;
    let perComposer=0;
    for(const work of works.slice(0,8)){
      if(perComposer>=PER) break;
      const workUrl=compUrl+work;
      let {dirs:pieces, mids:workMids}=await listDir(workUrl);
      // some works hold the .mid directly; others nest a piece/ dir
      const leaves = workMids.length ? [{url:workUrl, dir:work, mids:workMids}]
                                     : [];
      for(const piece of pieces.slice(0,3)){
        const purl=workUrl+piece; const {mids}=await listDir(purl);
        if(mids.length) leaves.push({url:purl, dir:piece, mids});
        await sleep(80);
      }
      for(const leaf of leaves){
        if(perComposer>=PER) break;
        const mid=pickMid(leaf.mids); if(!mid) continue;
        const url=leaf.url+mid; scanned++;
        try{
          const r=await fetch(url); if(!r.ok) continue;
          const buf=new Uint8Array(await r.arrayBuffer());
          const parsed=E.parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength));
          if(parsed.notes.length<24) continue;
          const dv=E.deriveVersions(parsed);
          const dur=dv.durationSec||0;                          // parseMidi doesn't set duration; analyze/deriveVersions does
          const conf=E.parseConfidence(parsed);
          if(conf.score<0.5 || dur<20 || dur>900) continue;     // skip garbled / boring-short / huge
          const hands=E.detectSourceHands(parsed.notes.map(n=>({...n})));
          catalog.push({
            title: prettyTitle(leaf.dir, work),
            composer: comp.replace(/([A-Z]{2,})$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').trim(),
            url, duration:+dur.toFixed(0), notes:parsed.notes.length,
            confidence:+conf.score.toFixed(2), handsFromSource:hands,
            stars: (dv.versions.find(v=>v.kind==='full')||dv.versions[dv.versions.length-1]).stars,
            tiers: dv.versions.filter(v=>v.kind!=='baked-melody').map(v=>({
              id:v.id, name:v.name, notes:v.notes.length, stars:v.stars, difficulty:+(v.difficulty||0).toFixed(2) })),
          });
          perComposer++;
          console.log(`  ✓ ${comp} · ${prettyTitle(leaf.dir, work)}  (${parsed.notes.length} notes, ${conf.score.toFixed(2)} conf${hands?', hands':''})`);
          if(catalog.length>=LIMIT) break outer;
        }catch(e){ /* skip bad file */ }
        await sleep(100);
      }
    }
  }

  catalog.sort((a,b)=> a.stars-b.stars || a.title.localeCompare(b.title));
  fs.writeFileSync(path.join(ROOT,'backlog','mutopia-catalog.json'),
    JSON.stringify({generated:new Date().toISOString(), count:catalog.length, scanned, catalog},null,2)+'\n','utf8');
  console.log(`\nscanned ${scanned}, kept ${catalog.length} -> backlog/mutopia-catalog.json`);
  console.log('(discovery only — staged for review. To SHIP songs, add them to scripts/fetch-songs.mjs then rebuild.)');
}

main().catch(e=>{ console.error(e); process.exit(1); });
