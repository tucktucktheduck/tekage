/* ════════════════════════════════════════════════════════════
   1 · MIDI PARSER  (ported from Tekage midiParser.js)
   Returns { notes, parts } — parts grouped by channel, drums dropped.
   ════════════════════════════════════════════════════════════ */
function parseMidi(buffer){
  const data = new Uint8Array(buffer); let pos=0;
  const u32=()=>{const v=(data[pos]<<24)|(data[pos+1]<<16)|(data[pos+2]<<8)|data[pos+3];pos+=4;return v>>>0;};
  const u16=()=>{const v=(data[pos]<<8)|data[pos+1];pos+=2;return v;};
  const vlq=()=>{let v=0;for(let i=0;i<4;i++){const b=data[pos++];v=(v<<7)|(b&0x7f);if(!(b&0x80))break;}return v;};

  if(u32()!==0x4d546864) throw new Error('Not a MIDI file');
  u32(); u16(); const numTracks=u16(); const division=u16();
  if(division & 0x8000) throw new Error('SMPTE timecode not supported');

  const rawTracks=[];
  for(let t=0;t<numTracks;t++){
    if(pos+8>data.length) break;
    const type=u32(); const len=u32(); const end=pos+len;
    if(type!==0x4d54726b){pos=end;continue;}
    const events=[]; let tick=0, running=0;
    while(pos<end){
      const d=vlq(); tick+=d;
      let sb=data[pos];
      if(sb&0x80){running=sb;pos++;} else {sb=running;}
      const tp=sb&0xf0;
      if(sb===0xff){
        const mt=data[pos++], ml=vlq();
        if(mt===0x51 && ml===3){const tempo=(data[pos]<<16)|(data[pos+1]<<8)|data[pos+2];events.push({tick,type:'tempo',tempo});}
        pos+=ml; running=0;
      } else if(sb===0xf0||sb===0xf7){ pos+=vlq(); running=0; }
      else if(tp===0x80||tp===0x90){ const note=data[pos++], vel=data[pos++];
        events.push({tick,type:(tp===0x90&&vel>0)?'on':'off',channel:sb&0x0f,note,vel}); }
      else if(tp===0xa0||tp===0xb0||tp===0xe0){pos+=2;}
      else if(tp===0xc0||tp===0xd0){pos+=1;}
      else{pos++;}
    }
    pos=end; rawTracks.push(events);
  }

  // tempo map from all tracks (some files put tempo on track 0, some elsewhere)
  const tempoMap=[{tick:0,tempo:500000}];
  for(const tr of rawTracks) for(const ev of tr) if(ev.type==='tempo') tempoMap.push({tick:ev.tick,tempo:ev.tempo});
  tempoMap.sort((a,b)=>a.tick-b.tick);
  const tickToSec=(target)=>{
    let secs=0,last=0,tempo=tempoMap[0].tempo;
    for(let i=1;i<tempoMap.length;i++){ if(tempoMap[i].tick>=target) break;
      secs += (tempoMap[i].tick-last)/division*(tempo/1e6); last=tempoMap[i].tick; tempo=tempoMap[i].tempo; }
    return secs + (target-last)/division*(tempo/1e6);
  };

  const channelNotes=new Map();
  for(let ti=0; ti<rawTracks.length; ti++){
    const track=rawTracks[ti];
    const active=new Map(); let lastTick=0;
    for(const ev of track){
      if(ev.tick>lastTick) lastTick=ev.tick;
      if(ev.type==='on') active.set(ev.channel+'-'+ev.note,{startTick:ev.tick,channel:ev.channel,vel:ev.vel});
      else if(ev.type==='off'){
        const k=ev.channel+'-'+ev.note, a=active.get(k);
        if(a){ active.delete(k);
          if(ev.note>=21&&ev.note<=108&&a.channel!==9){
            const s=tickToSec(a.startTick), dur=Math.max(tickToSec(ev.tick)-s,0.05);
            if(!channelNotes.has(a.channel)) channelNotes.set(a.channel,[]);
            // `track` = the source staff (piano MIDI renders RH/LH to separate
            // tracks); kept so the game can honor the file's hand assignment.
            channelNotes.get(a.channel).push({midi:ev.note,startSec:s,durationSec:dur,vel:a.vel,channel:a.channel,track:ti});
          }
        }
      }
    }
    for(const [k,a] of active){
      const note=parseInt(k.split('-')[1]);
      if(note>=21&&note<=108&&a.channel!==9){
        const s=tickToSec(a.startTick), dur=Math.max(tickToSec(lastTick)-s,0.05);
        if(!channelNotes.has(a.channel)) channelNotes.set(a.channel,[]);
        channelNotes.get(a.channel).push({midi:note,startSec:s,durationSec:dur,vel:a.vel,channel:a.channel,track:ti});
      }
    }
  }

  const parts=[];
  for(const [ch,notes] of [...channelNotes.entries()].sort((a,b)=>a[0]-b[0])){
    if(!notes.length) continue;
    notes.sort((a,b)=>a.startSec-b.startSec);
    parts.push({channel:ch,name:'Channel '+(ch+1),notes});
  }
  const allNotes=parts.flatMap(p=>p.notes).sort((a,b)=>a.startSec-b.startSec);
  return {notes:allNotes, parts};
}
