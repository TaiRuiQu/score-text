import { PPQ, DRUMS, ScoreError, type Score, type Event, type Tempo } from './model.js';
import { midiPitch, parsePitch } from './parser.js';

function vlq(value:number):number[] { let n=Math.max(0,Math.round(value)),bytes=[n&127];while((n>>=7)>0)bytes.unshift((n&127)|128);return bytes; }
function chunk(name:string,data:Buffer):Buffer {const head=Buffer.alloc(8);head.write(name);head.writeUInt32BE(data.length,4);return Buffer.concat([head,data]);}
type Message={at:number; bytes:number[]; order:number};
function track(messages:Message[],end:number):Buffer {
  messages.sort((a,b)=>a.at-b.at||a.order-b.order);
  const data:number[]=[];let cursor=0;
  for(const m of messages){data.push(...vlq(m.at-cursor),...m.bytes);cursor=m.at;}
  data.push(...vlq(end-cursor),0xff,0x2f,0);
  return chunk('MTrk',Buffer.from(data));
}
function textMeta(type:number,text:string):number[] { const bytes=[...Buffer.from(text,'utf8')];return [0xff,type,...vlq(bytes.length),...bytes]; }
function tempoBytes(t:Tempo):number[] {
  const microseconds=Math.round(60_000_000*PPQ/(t.bpm*t.unit.ticks));
  if(microseconds>0xffffff)throw new ScoreError([{code:'MIDI_TEMPO_RANGE',path:'tempo',message:'此速度超出 MIDI 三字节速度字段；请提高 BPM 或选择更长的计拍单位'}]);
  return [0xff,0x51,3,(microseconds>>16)&255,(microseconds>>8)&255,microseconds&255];
}
/** MIDI is a linear audition of written bars; repeats remain engraving instructions. */
export function toMidi(score:Score):Buffer {
  if(score.tracks.filter(t=>t.type!=='drums').length>15)throw new ScoreError([{code:'MIDI_CHANNELS',path:'tracks',message:'MIDI 最多支持 15 个独立有音高声部；请导出分谱或使用 MusicXML'}]);
  let tick=0;
  const timeline:Message[]=[{at:0,bytes:textMeta(3,score.title),order:0},{at:0,bytes:tempoBytes(score.tempo),order:1}];
  const starts=score.bars.map(b=>{const at=tick;tick+=b.ticks;return at;});
  const end=tick;
  score.bars.forEach((b,i)=>{
    const at=starts[i];
    if(i===0||b.meterChanged)timeline.push({at,bytes:[0xff,0x58,4,b.meter[0],Math.log2(b.meter[1]),24,8],order:0});
    if(b.section)timeline.push({at,bytes:textMeta(6,b.section),order:0});
    if(b.tempo)timeline.push({at,bytes:tempoBytes(b.tempo),order:1});
    b.changes.forEach(c=>timeline.push({at:at+c.at,bytes:tempoBytes(c.tempo),order:2}));
  });
  const chunks=[track(timeline,end)];let channelIndex=0;
  for(const t of score.tracks) {
    const channel=t.type==='drums'?9:(channelIndex++%15);const ch=channel>=9&&t.type!=='drums'?channel+1:channel;
    const messages:Message[]=[{at:0,bytes:textMeta(3,t.name),order:0}];
    if(t.type!=='drums')messages.push({at:0,bytes:[0xc0|ch,t.type==='tab'?24:0],order:1});
    const streams=new Map<string,{e:Event;at:number;notes:number[]}[]>();
    let lastChord:(number|'x')[]|undefined;
    score.bars.forEach((b,i)=>{
      const incoming=lastChord;
      b.tracks[t.id].voices.forEach(v=>{
      const id=v.staff+':'+v.id;
      streams.set(id,[...(streams.get(id)??[]),...v.events.map(e=>{
        const chord=b.chords.filter(c=>c.at<=e.start).at(-1);
        const shape=chord?(chord.diagram??score.chordShapes[chord.name]):incoming;
        let notes=t.type==='drums'?e.drums.map(d=>DRUMS[d].midi):e.pitches.map(midiPitch);
        if(t.type==='tab') {
          if(e.kind==='strum')notes=e.direction==='mute'?[]:(shape??[]).flatMap((f,index)=>f==='x'?[]:[midiPitch(parsePitch(t.tuning[5-index],'C'))+f]);
          else if(t.mode==='cross'&&shape)notes=e.tab.flatMap(n=>{const fret=shape[6-n.string];return fret==='x'?[]:[midiPitch(parsePitch(t.tuning[n.string-1],'C'))+fret];});
          notes=notes.map(n=>n+score.capo);
        }
        return {e,at:starts[i]+e.start,notes};
      })]);
      });
      if(b.chords.length){const c=b.chords.at(-1)!;lastChord=c.diagram??score.chordShapes[c.name];}
    });
    for(const events of streams.values()) {
      events.forEach(({e,at,notes},i)=>{
        if(e.kind==='rest'||e.tieEnd)return;
        let duration=e.ticks,j=i;
        while(events[j]?.e.tie&&events[j+1])duration+=events[++j].e.ticks;
        const velocity=e.dynamic?({ppp:24,pp:36,p:48,mp:60,mf:78,f:94,ff:110,fff:123,sfz:115}[e.dynamic]??78):78;
        for(const n of [...new Set(notes)]) {
          messages.push({at,bytes:[0x90|ch,n,velocity],order:3});
          messages.push({at:at+duration,bytes:[0x80|ch,n,0],order:2});
        }
        if(e.lyric&&!['_','~'].includes(e.lyric))messages.push({at,bytes:textMeta(5,e.lyric),order:1});
      });
    }
    chunks.push(track(messages,end));
  }
  const header=Buffer.alloc(6);header.writeUInt16BE(1,0);header.writeUInt16BE(chunks.length,2);header.writeUInt16BE(PPQ,4);
  return Buffer.concat([chunk('MThd',header),...chunks]);
}
