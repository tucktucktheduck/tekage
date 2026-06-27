/* ════════════════════════════════════════════════════════════
   8 · UI STATE + WIRING
   ════════════════════════════════════════════════════════════ */
const UI = { mode:'play', keyNames:true };

const $=id=>document.getElementById(id);
function setPlayBtn(p){ $('playBtn').textContent = p?'⏸ PAUSE':'▶ PLAY'; $('playBtn').classList.toggle('on',p); }

function flash(msg, big){
  const el=$('insight'); el.innerHTML=msg; el.classList.add('show');
  clearTimeout(flash._t); flash._t=setTimeout(()=>el.classList.remove('show'), big?4200:1800);
}

/* Difficulty / version buttons — built from the extractor's density-ranked
   versions. Pick one BEFORE you play; ranked sparsest→busiest so you can play
   the Core or step up to harder. */
function buildVersionButtons(){
  const row=$('verRow'); row.innerHTML='';
  for(const v of Song.versions){
    const b=document.createElement('button');
    b.className='tk ver'+(v===Song.version?' sel':'');
    b.dataset.id=v.id;
    b.innerHTML=`<span class="vname">${v.name}</span><span class="vden">${v.density.toFixed(1)} n/s · ${v.notes.length}</span>`;
    b.onclick=()=>{ selectVersion(v.id); document.querySelectorAll('#verRow .ver').forEach(x=>x.classList.toggle('sel', x.dataset.id===v.id));
      flash(`<b>${v.name}</b> — ${v.density.toFixed(1)} notes/sec`); };
    row.appendChild(b);
  }
}

$('playBtn').onclick=()=>Transport.toggle();
$('restartBtn').onclick=()=>Transport.restart();
$('loadBtn').onclick=()=>$('fileInput').click();
$('demoBtn').onclick=()=>loadDemo();
$('fileInput').onchange=e=>{ const f=e.target.files[0]; if(f) loadFile(f); };
$('mapBtn').onclick=()=>MapView.toggle();

document.querySelectorAll('#modeSeg button').forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll('#modeSeg button').forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel'); UI.mode=b.dataset.mode;
    if(UI.mode==='play') seedUserSlice(Transport.songTime);
    flash(UI.mode==='play'?'PLAY MODE · press the keys shown · move your slices with Tab / ⇧ (left) and ⏎ / ⇧ (right)':'LISTEN MODE · sit back — the whole song plays and the slices glide'); };
});

const speedEl=$('speed');
speedEl.oninput=()=>{ const r=speedEl.value/100; Transport.rate=r;
  if(Transport.playing){ Transport.anchorSong=Transport.songTime; Transport.anchorCtx=Audio.now(); }
  $('speedVal').textContent=r.toFixed(2)+'×'; };
$('vol').oninput=()=>Audio.setVolume($('vol').value/100);
$('namesChk').onchange=()=>UI.keyNames=$('namesChk').checked;

/* ── Keyboard-map viewer ──────────────────────────────────────
   Computer keyboard on top, piano beneath. Mapped keys are fully
   opaque & hand-coloured; unmapped keys are dimmed. Press a letter
   and it lights BOTH the letter and its piano key. A separate toggle
   draws simple straight lines for the whole mapping. */
const MapView = (()=>{
  const KB_ROWS = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l',';'],
    ['z','x','c','v','b','n','m',',','.','/'],
  ];
  let built=false, linesOn=false;
  const keyCell=new Map();   // letter -> element
  const pianoCell=new Map(); // midi -> element

  function build(){
    const kb=$('mapKb'); kb.innerHTML='';
    for(const row of KB_ROWS){
      const r=document.createElement('div'); r.className='mapRow';
      for(const k of row){
        const c=document.createElement('div');
        const hand=KEY_HAND[k];
        c.className='mapKey'+(hand?(' mapped '+hand):' dim');
        c.textContent = (k===';'?';':k.toUpperCase());
        c.dataset.k=k; keyCell.set(k,c); r.appendChild(c);
      }
      kb.appendChild(r);
    }
  }
  function buildPiano(){
    const s=currentSlice();
    const loOct=Math.min(s.L,s.R), hiOct=Math.max(s.L,s.R);
    const lo=(loOct+1)*12, hi=(hiOct+1)*12+11;
    const pno=$('mapPiano'); pno.innerHTML=''; pianoCell.clear();
    const whites=[]; for(let m=lo;m<=hi;m++){ if(![1,3,6,8,10].includes(m%12)) whites.push(m); }
    const wW=100/whites.length;
    // white keys
    whites.forEach((m,idx)=>{
      const el=document.createElement('div'); el.className='mapWhite';
      const hand = (m>=(s.L+1)*12&&m<=(s.L+1)*12+11)?'left':((m>=(s.R+1)*12&&m<=(s.R+1)*12+11)?'right':null);
      if(hand) el.classList.add('in-'+hand); else el.classList.add('dim');
      el.style.left=(idx*wW)+'%'; el.style.width=wW+'%';
      if(m%12===0){ const lab=document.createElement('span'); lab.className='mapClab'; lab.textContent='C'+(Math.floor(m/12)-1); el.appendChild(lab); }
      pno.appendChild(el); pianoCell.set(m,el);
    });
    // black keys
    for(let m=lo;m<=hi;m++){ if(![1,3,6,8,10].includes(m%12)) continue;
      const leftWhite=m-1; const wi=whites.indexOf(leftWhite); if(wi<0) continue;
      const el=document.createElement('div'); el.className='mapBlack';
      const hand = (m>=(s.L+1)*12&&m<=(s.L+1)*12+11)?'left':((m>=(s.R+1)*12&&m<=(s.R+1)*12+11)?'right':null);
      if(hand) el.classList.add('in-'+hand); else el.classList.add('dim');
      el.style.left=((wi+1)*wW - wW*0.3)+'%'; el.style.width=(wW*0.6)+'%';
      pno.appendChild(el); pianoCell.set(m,el);
    }
    drawLines();
  }
  function drawLines(){
    const svg=$('mapSvg'); svg.innerHTML=''; if(!linesOn) return;
    const host=$('mapBody').getBoundingClientRect();
    svg.setAttribute('viewBox',`0 0 ${host.width} ${host.height}`);
    for(const [k,cell] of keyCell){
      const hand=KEY_HAND[k]; if(!hand) continue;
      const r=midiForGameKey(k); if(!r) continue;
      const pc=pianoCell.get(r.midi); if(!pc) continue;
      const a=cell.getBoundingClientRect(), b=pc.getBoundingClientRect();
      const x1=a.left+a.width/2-host.left, y1=a.bottom-host.top;
      const x2=b.left+b.width/2-host.left, y2=b.top-host.top;
      const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
      ln.setAttribute('x1',x1);ln.setAttribute('y1',y1);ln.setAttribute('x2',x2);ln.setAttribute('y2',y2);
      ln.setAttribute('stroke', hand==='left'?'rgba(26,143,255,.5)':'rgba(255,138,43,.5)');
      ln.setAttribute('stroke-width','1.5'); svg.appendChild(ln);
    }
  }
  function light(k,midi,on){
    const c=keyCell.get(k); if(c) c.classList.toggle('lit',on);
    const p=pianoCell.get(midi); if(p) p.classList.toggle('lit',on);
  }
  return {
    open:false,
    toggle(){ this.open?this.hide():this.show(); },
    show(){ if(!built){build();built=true;} buildPiano(); $('mapOverlay').classList.add('open'); this.open=true; },
    hide(){ $('mapOverlay').classList.remove('open'); this.open=false; },
    light,
    toggleLines(){ linesOn=!linesOn; $('mapLinesBtn').classList.toggle('sel',linesOn); drawLines(); },
  };
})();
$('mapClose').onclick=()=>MapView.hide();
$('mapLinesBtn').onclick=()=>MapView.toggleLines();
$('mapOverlay').addEventListener('click',e=>{ if(e.target.id==='mapOverlay') MapView.hide(); });

// drag-drop
const wrap=document.getElementById('stageWrap');
['dragenter','dragover'].forEach(ev=>wrap.addEventListener(ev,e=>{e.preventDefault();$('dropHint').classList.add('show');}));
['dragleave','drop'].forEach(ev=>wrap.addEventListener(ev,e=>{e.preventDefault();$('dropHint').classList.remove('show');}));
wrap.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) loadFile(f); });

function versionSummary(){
  return Song.versions.map(v=>v.name.split('·').pop().trim()+' '+v.density.toFixed(1)).join(' · ');
}
function loadFile(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=parseMidi(reader.result);
      if(!parsed.notes.length){ flash('No playable notes found in that file'); return; }
      Transport.pause(); Transport.seek(0);
      analyze(parsed, file.name.replace(/\.midi?$/i,''));
      $('songName').textContent = Song.title;
      buildVersionButtons();
      flash(`Loaded <b>${Song.title}</b> · ${Song.versions.length} difficulties · now playing <b>${Song.version?.name||'—'}</b>`, true);
      draw();
    }catch(err){ flash('Could not read MIDI: '+err.message); }
  };
  reader.readAsArrayBuffer(file);
}
