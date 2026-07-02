/* ════════════════════════════════════════════════════════════
   2 · CORE-OF-SONG EXTRACTION  (pure; no DOM/audio)
   Turns a parsed song into density-ranked, beginner-playable
   "versions": Easy·Core / Medium·Two-Voice / Hard·Full (+ a
   baked-in simple part when the file ships one). Six stages,
   per the research handoff: meter grid → voice separation →
   (single-segment) → per-note salience → ≤2 monophonic lines →
   difficulty thinning. Each version's .notes feeds solvePlan()
   unchanged. Notes are references to the originals (identity
   preserved) so the engine can play the backing in tandem.
   ════════════════════════════════════════════════════════════ */

// ── Stage 1 · meter grid → metricWeight ∈ [0,1] per note ──
function estimateMeterGrid(notes){
  const onsets=[...new Set(notes.map(n=>+n.startSec.toFixed(3)))].sort((a,b)=>a-b);
  const iois=[];
  for(let i=1;i<onsets.length;i++){ const d=onsets[i]-onsets[i-1]; if(d>0.06&&d<2) iois.push(d); }
  let beat=0.5;
  if(iois.length){
    // histogram in 20ms buckets; dominant small interval ≈ beat/subdivision
    const bucket=new Map();
    for(const d of iois){ const b=Math.round(d/0.02); bucket.set(b,(bucket.get(b)||0)+1); }
    let best=0,bb=25; for(const [b,c] of bucket){ if(c>best){best=c;bb=b;} }
    beat=Math.min(1.0,Math.max(0.2,bb*0.02));
  }
  // phase: offset that lands the most onsets on grid points
  let bestPhase=0,bestHit=-1;
  for(let p=0;p<beat;p+=beat/8){
    let hit=0; for(const o of onsets){ const r=((o-p)/beat); if(Math.abs(r-Math.round(r))<0.15) hit++; }
    if(hit>bestHit){bestHit=hit;bestPhase=p;}
  }
  const metricWeight=(t)=>{
    const r=(t-bestPhase)/beat;
    const frac=Math.abs(r-Math.round(r));            // 0 on a beat
    const onGrid=Math.max(0,1-frac/0.5);             // 1 on beat → 0 mid
    const bar=Math.abs((Math.round(r))%4);           // strong every 4 beats
    const strong=(bar===0)?1:(bar===2?0.6:0.3);
    return Math.max(0,Math.min(1, 0.55*onGrid + 0.45*onGrid*strong));
  };
  for(const n of notes) n._metric=metricWeight(n.startSec);
  return {beat, phase:bestPhase};
}

// ── Stage 0 · honor the source's hand assignment when the file has one ──
// Piano scores (LilyPond/Mutopia, most piano MIDI) render the right- and left-
// hand staves to separate TRACKS (or two pitch-separated channels). When that
// structure is clear, tag each note with srcHand so the solver keeps the file's
// mapping instead of re-deriving it. Returns true if a mapping was found.
function detectSourceHands(notes){
  function meanP(a){ return a.reduce((s,n)=>s+n.midi,0)/Math.max(1,a.length); }
  for(const key of ['track','channel']){
    const by=new Map();
    for(const n of notes){ const g=(n[key]==null?-1:n[key]); if(!by.has(g)) by.set(g,[]); by.get(g).push(n); }
    const big=[...by.values()].filter(a=>a.length>=4).sort((a,b)=>meanP(b)-meanP(a));
    if(big.length===2 && meanP(big[0])-meanP(big[1])>=3){
      for(const n of big[0]) n.srcHand='right';
      for(const n of big[1]) n.srcHand='left';
      return true;
    }
  }
  return false;
}

// ── Stage 2 · voice separation (channel-aware) ──
// greedy pitch-proximity line tracking over one note stream
function _separateOneStream(notes){
  const sorted=[...notes].sort((a,b)=> a.startSec-b.startSec || b.midi-a.midi);
  const voices=[];
  const LEAP=14;
  for(const n of sorted){
    let best=null,bestD=1e9;
    for(const v of voices){
      const last=v.notes[v.notes.length-1];
      if(last.startSec+last.durationSec <= n.startSec+0.04){   // voice is free
        const d=Math.abs(last.midi-n.midi);
        if(d<bestD && d<=LEAP){ bestD=d; best=v; }
      }
    }
    if(best) best.notes.push(n);
    else voices.push({notes:[n]});
  }
  return voices;
}
function _voiceStats(voices){
  for(const v of voices){
    const ms=v.notes.map(x=>x.midi);
    v.meanPitch=ms.reduce((a,b)=>a+b,0)/ms.length;
    v.span=Math.max(...ms)-Math.min(...ms);
    v.onsetRate=v.notes.length / Math.max(0.5,(v.notes[v.notes.length-1].startSec - v.notes[0].startSec)||1);
  }
  return voices;
}
// Ozcan, Isikhan & Alpkocak 2005 — cluster by channel before line tracking. Real
// multi-track MIDI (e.g. Mutopia) encodes voices/hands as channels; tracking lines
// WITHIN each channel stops the skyline from jumping between the melody and an
// accompaniment that happens to poke above it. Falls back to a single global
// stream when the file has no informative channel structure (e.g. the demo).
function separateVoices(notes){
  // group by each note's OWN channel (identity-safe: these are the song's own
  // note objects, so the derived versions stay refs into Song.notes).
  const byCh=new Map();
  for(const n of notes){ const c=(n.channel==null?-1:n.channel); if(!byCh.has(c)) byCh.set(c,[]); byCh.get(c).push(n); }
  const informative=[...byCh.values()].filter(a=>a.length>=3);
  if(byCh.size>=2 && informative.length>=2){
    const voices=[];
    for(const arr of byCh.values()){ if(!arr.length) continue; for(const v of _separateOneStream(arr)) voices.push(v); }
    return _voiceStats(voices);
  }
  return _voiceStats(_separateOneStream(notes));
}

// ── Stage 4 · per-note salience (+ per-voice prominence) ──
function repetitionScores(voice){
  // encode each note by relative (Δpitch, Δonset-bucket) to its predecessor,
  // count recurring 3-grams (transposition-invariant) → motif membership.
  const ns=voice.notes; const N=ns.length;
  const tup=[];
  for(let i=1;i<N;i++){
    const dp=Math.max(-12,Math.min(12, ns[i].midi-ns[i-1].midi));
    const dob=Math.round(Math.min(2,(ns[i].startSec-ns[i-1].startSec))/0.12);
    tup.push(dp+','+dob);
  }
  const gramCount=new Map();
  for(let i=0;i+2<tup.length;i++){ const g=tup[i]+'|'+tup[i+1]+'|'+tup[i+2]; gramCount.set(g,(gramCount.get(g)||0)+1); }
  const score=new Array(N).fill(0);
  for(let i=0;i+2<tup.length;i++){ const c=gramCount.get(tup[i]+'|'+tup[i+1]+'|'+tup[i+2])||1;
    const s=Math.log2(c+1); for(let k=i;k<=i+3 && k<N;k++) score[k]=Math.max(score[k],s); }
  const mx=Math.max(1,...score);
  return score.map(s=>s/mx);
}
function scoreNotes(notes, voices){
  let durMax=0, velMin=127, velMax=0, velVar=0, velMean=0;
  for(const n of notes){ durMax=Math.max(durMax,n.durationSec); const v=n.vel??80; velMin=Math.min(velMin,v); velMax=Math.max(velMax,v); velMean+=v; }
  velMean/=Math.max(1,notes.length);
  for(const n of notes){ const v=n.vel??80; velVar+=(v-velMean)**2; } velVar/=Math.max(1,notes.length);
  const velFlat = velVar < 6;                      // quantized/exported MIDI → ignore velocity
  for(const v of voices){
    const rep=repetitionScores(v);
    const regular = 1 - Math.min(1, voiceIOIstd(v));
    v._repMean = rep.reduce((a,b)=>a+b,0)/Math.max(1,rep.length);
    v._regular = regular;
    v.notes.forEach((n,i)=>{ n._rep=rep[i]; });
  }
  // per-voice prominence: which voice is "the tune" this song. Register is
  // RANK-based (top line ≈ lead — the skyline insight) so a high melody isn't
  // out-voted by a repetitive mid/low accompaniment; repetition & regularity
  // break ties. Bass-as-hook still survives — it's selected as the 2nd line.
  const sortedByPitch=[...voices].sort((a,b)=>a.meanPitch-b.meanPitch);
  const denom=Math.max(1,sortedByPitch.length-1);
  sortedByPitch.forEach((v,i)=>{ v._regRank=i/denom; });   // 0 = lowest, 1 = highest
  for(const v of voices){
    v.prominence = 0.48*v._regRank + 0.24*v._repMean + 0.28*v._regular;
  }
  for(const v of voices){
    const vm=v.meanPitch, vsp=Math.max(6,v.span);
    for(const n of v.notes){
      const reg = Math.min(1, Math.abs(n.midi-vm)/vsp);     // contour extremity within voice
      const dur = durMax>0 ? Math.min(1,n.durationSec/durMax) : 0.5;
      const vel = velFlat ? 0.5 : ( (velMax>velMin) ? (((n.vel??80)-velMin)/(velMax-velMin)) : 0.5 );
      n._salience =
          0.20*(n._metric??0.4)
        + 0.28*(n._rep??0)
        + 0.15*reg
        + 0.12*dur
        + (velFlat?0.0:0.10)*vel
        + 0.15*v.prominence;
      n._voiceRef=v;
    }
  }
  // normalize to [0,1]
  let smn=1e9,smx=-1e9; for(const n of notes){ smn=Math.min(smn,n._salience); smx=Math.max(smx,n._salience); }
  for(const n of notes){ n.salience = smx>smn ? (n._salience-smn)/(smx-smn) : 0.5; }
}
function voiceIOIstd(v){
  if(v.notes.length<3) return 1;
  const io=[]; for(let i=1;i<v.notes.length;i++) io.push(v.notes[i].startSec-v.notes[i-1].startSec);
  const m=io.reduce((a,b)=>a+b,0)/io.length; const sd=Math.sqrt(io.reduce((a,b)=>a+(b-m)**2,0)/io.length);
  return m>0 ? Math.min(1.5, sd/m) : 1;
}

// ── Stage 5 · select ≤2 monophonic lines (lead + bass) ──
function selectLines(voices){
  const usable=voices.filter(v=>v.notes.length>=3);
  if(!usable.length){ const any=voices.slice().sort((a,b)=>b.notes.length-a.notes.length)[0];
    return { lead: any?[...any.notes].sort((a,b)=>a.startSec-b.startSec):[], bass:[] }; }
  const maxN=Math.max(...usable.map(v=>v.notes.length));
  // LEAD = the highest-register voice substantial enough to carry the tune.
  // Register is decisive (the melody is almost always the top line — the
  // skyline insight); the density floor rejects a sparse high blip (octave
  // bleed). Prominence (repetition/regularity) only breaks near-ties in pitch.
  const leadPool=usable.filter(v=>v.notes.length>=Math.max(4,0.25*maxN));
  const pool=leadPool.length?leadPool:usable;
  let leadV=pool[0];
  for(const v of pool){
    if(v.meanPitch > leadV.meanPitch+1.5) leadV=v;                       // clearly higher → lead
    else if(Math.abs(v.meanPitch-leadV.meanPitch)<=1.5 && v.prominence>leadV.prominence) leadV=v; // tie → more prominent
  }
  // BASS = the lowest substantial voice that isn't the lead (its own rhythm kept)
  const others=usable.filter(v=>v!==leadV);
  const bassV=others.length ? others.reduce((lo,v)=>v.meanPitch<lo.meanPitch?v:lo) : null;
  let lead=[...leadV.notes].sort((a,b)=>a.startSec-b.startSec);
  let bass=bassV ? [...bassV.notes].sort((a,b)=>a.startSec-b.startSec) : [];
  for(const n of lead) n.voice='right';
  for(const n of bass) n.voice='left';
  // no-cross: drop a bass note sounding above a concurrent lead note
  if(bass.length && lead.length){
    bass=bass.filter(b=>{
      const concurrent=lead.find(l=> l.startSec<=b.startSec+0.03 && l.startSec+l.durationSec>b.startSec );
      return !concurrent || b.midi < concurrent.midi;
    });
  }
  return {lead, bass};
}

// ── Stage 6 · difficulty-controlled thinning (the knob) ──
// Nakamura & Yoshii 2018: trade fidelity vs a TARGET difficulty — but with two
// founder rules layered on top of the global-salience greedy:
//   1. COVERAGE FIRST. Easy must never be "a break": if the source is playing
//      in a time window, the player is playing in that window. We guarantee at
//      least one note per window and cap silent gaps, BEFORE spending any of
//      the difficulty budget. (Fixes "no notes for the first third of the song"
//      — a global greedy spends the whole budget on the busy sections.)
//   2. EVEN FILL. Remaining budget is spent round-robin across the SPARSEST
//      windows (highest-salience note within each), so density rises evenly
//      through the song instead of piling onto the chorus.
// Fidelity anchors (strong beats / motif members) still can never disappear,
// and everything stays an identity-preserving subset of the real notes.
function thinToDifficulty(notes, targetScore, durationSec, opts){
  if(!notes.length) return [];
  const WIN    = (opts&&opts.windowSec) || 3.0;   // coverage / evenness window
  const MAXGAP = (opts&&opts.maxGapSec) || 2.0;   // longest allowed player silence while the source plays
  const sorted=[...notes].sort((a,b)=>a.startSec-b.startSec);
  // coveragePool: the WHOLE song. Clair de Lune's opening has no melody voice
  // at all — an Easy tier built only from the lead line shows nothing for 37
  // seconds. When the selected lines are silent but the song isn't, coverage
  // borrows the best accompaniment notes so the player is always playing.
  const pool=((opts&&opts.coveragePool)||sorted).slice().sort((a,c)=>a.startSec-c.startSec);
  const winOf=n=>Math.floor(n.startSec/WIN);
  const lastT=Math.max(sorted[sorted.length-1].startSec, pool[pool.length-1].startSec);
  const nWin=Math.max(1, Math.ceil((durationSec||lastT+1)/WIN));

  // bucket the candidates per window, best-first (lead voice already outranks
  // accompaniment via salience's voice-prominence term)
  const buckets=new Array(nWin).fill(null).map(()=>[]);
  for(const n of sorted){ const w=Math.min(nWin-1,Math.max(0,winOf(n))); buckets[w].push(n); }
  for(const b of buckets) b.sort((a,c)=>(c.salience??0)-(a.salience??0));
  const poolBuckets=new Array(nWin).fill(null).map(()=>[]);
  for(const n of pool){ const w=Math.min(nWin-1,Math.max(0,winOf(n))); poolBuckets[w].push(n); }
  for(const b of poolBuckets) b.sort((a,c)=>(c.salience??0)-(a.salience??0));

  const keep=new Set(sorted.filter(n=>(n._metric??0)>0.72 || (n._rep??0)>0.6));

  // 1a · window coverage: any window the SONG plays in, the player plays in
  for(let w=0;w<nWin;w++){
    if(buckets[w].some(n=>keep.has(n))) continue;
    if(buckets[w].length) keep.add(buckets[w][0]);
    else if(poolBuckets[w].length) keep.add(poolBuckets[w][0]);   // borrow from the full song
  }
  // 1b · gap cap: no silent stretch longer than MAXGAP while the song plays
  let changed=true;
  while(changed){
    changed=false;
    const kept=[...keep].sort((a,c)=>a.startSec-c.startSec);
    let prevT=0;
    for(const k of kept){
      if(k.startSec-prevT>MAXGAP){
        const gapNotes=pool.filter(n=>!keep.has(n)&&n.startSec>prevT&&n.startSec<k.startSec);
        if(gapNotes.length){ keep.add(gapNotes.sort((a,c)=>(c.salience??0)-(a.salience??0))[0]); changed=true; break; }
      }
      prevT=Math.max(prevT,k.startSec);
    }
  }
  if(keep.size===0){ const a=[...sorted].sort((x,y)=>(y.salience??0)-(x.salience??0))[0]; if(a) keep.add(a); }

  // 2 · even fill: repeatedly add the best remaining note from the sparsest
  // window until the difficulty descriptor reaches the tier target. Batched
  // rescoring bounds the O(n·score) cost on large (ingested) files.
  const arr=()=>[...keep].sort((a,c)=>a.startSec-c.startSec);
  const density=w=>{ let c=0; for(const n of buckets[w]) if(keep.has(n)) c++; return c/(buckets[w].length||1); };
  const pending=buckets.map(b=>b.filter(n=>!keep.has(n)));
  let remaining=pending.reduce((s,b)=>s+b.length,0);
  while(remaining>0 && scoreDifficulty(arr(),durationSec).score < targetScore){
    for(let batch=0;batch<4 && remaining>0;batch++){
      let bw=-1,bd=Infinity;
      for(let w=0;w<nWin;w++){ if(pending[w].length){ const d=density(w); if(d<bd){bd=d;bw=w;} } }
      if(bw<0) break;
      keep.add(pending[bw].shift()); remaining--;
    }
  }
  return arr();
}

function densityOf(notes, dur){ return dur>0 ? notes.length/dur : 0; }

function starsForDensity(density, allDensities){
  const ds=[...allDensities].sort((a,b)=>a-b);
  const n=ds.length;
  if(n<=1) return 3;
  const r=ds.indexOf(density);
  return Math.max(1, Math.min(5, Math.round(1 + 4*r/(n-1))));
}

// Parse/extraction confidence in [0,1] — "has it got a baked melody? can we
// extract a strong one?" (DECISIONS). Drives the low-confidence warning dialog on
// upload and the ingest's auto-rating/curation. Returns reasons for any concern.
function parseConfidence(parsed){
  const notes=(parsed&&parsed.notes)||[];
  const dur=(parsed&&parsed.duration)|| (notes.length?Math.max(...notes.map(n=>n.startSec+n.durationSec)):0) || 1;
  const reasons=[];
  if(notes.length<8) return { score:0.15, reasons:['very few notes parsed'], density:0, versions:0 };
  const dv=deriveVersions(parsed);
  const full=dv.versions.find(v=>v.kind==='full')||dv.versions[dv.versions.length-1];
  const core=dv.versions.find(v=>v.kind==='derived-core');
  const density=full?full.density:0;
  let s=0.45;
  if(core) s+=0.25; else reasons.push('no clear melodic core could be extracted');
  if(density>=0.5 && density<=12) s+=0.2; else { s-=0.2; reasons.push(density<0.5?'extremely sparse':'extremely dense / possibly garbled'); }
  if(dur>=20) s+=0.10; else { s-=0.15; reasons.push('very short (<20s) — may be a fragment'); }
  if(core){ const mp=core.notes.reduce((a,n)=>a+n.midi,0)/Math.max(1,core.notes.length);
    if(mp>=55 && mp<=84) s+=0.10; else reasons.push('melody register is unusual'); }
  return { score: clamp(s,0,1), reasons, density, versions:dv.versions.length };
}

function detectBaked(parsed){
  const out=[];
  for(const p of (parsed.parts||[])){
    if(/melody|lead|vocal|easy|simple/i.test(p.name||'') && p.notes && p.notes.length){
      out.push({ kind:'baked-melody', name:'File · '+p.name, notes:[...p.notes].sort((a,b)=>a.startSec-b.startSec) });
    }
  }
  return out;
}

function deriveVersions(parsed){
  const base=(parsed.notes||[]).slice().sort((a,b)=>a.startSec-b.startSec);
  const durationSec = parsed.duration || (base.length? Math.max(...base.map(n=>n.startSec+n.durationSec)) : 0) || 1;
  if(base.length<4){
    return { title:parsed.title, durationSec, versions:[
      { id:'full', name:'Full', kind:'full', density:densityOf(base,durationSec), notes:base } ]};
  }
  detectSourceHands(base);              // tag srcHand from the file's staves/tracks if present
  estimateMeterGrid(base);
  const voices=separateVoices(base);
  scoreNotes(base, voices);
  const {lead, bass}=selectLines(voices);
  // tier target difficulties (ordinal score in [0,1]): Core = clearly easy,
  // Two-Voice = moderate; Full = the whole song untouched.
  const core = thinToDifficulty(lead, 0.16, durationSec, { coveragePool: base });
  const two  = thinToDifficulty([...lead, ...bass].sort((a,b)=>a.startSec-b.startSec), 0.42, durationSec, { coveragePool: base });

  let versions=[];
  if(core.length) versions.push({ id:'core', name:'Easy · Core', kind:'derived-core', notes:core });
  if(two.length && two.length>core.length) versions.push({ id:'2voice', name:'Medium · Two-Voice', kind:'derived-2voice', notes:two });
  versions.push({ id:'full', name:'Hard · Full', kind:'full', notes:base });
  versions.push(...detectBaked(parsed));

  // de-dup degenerate versions (same count); compute density + the multi-feature
  // difficulty descriptor + absolute stars; rank by difficulty (not density alone).
  const seen=new Set();
  versions = versions.filter(v=>{ const k=v.kind+':'+v.notes.length; if(seen.has(k))return false; seen.add(k); return true; });
  for(const v of versions){
    v.density=densityOf(v.notes,durationSec);
    const d=scoreDifficulty(v.notes,durationSec);
    v.difficulty=d.score; v.features=d; v.stars=starsFromDifficulty(d.score);
  }
  versions.sort((a,b)=>a.difficulty-b.difficulty || a.density-b.density);
  return { title:parsed.title, durationSec, versions };
}
