import { PPQ, ScoreError, type Score, type Bar, type Track, type Event } from './model.js';
import { textWidth } from './svg.js';
import { keyInfo } from './parser.js';

export interface Slot { at:number; min:number; x:number; }
export interface MeasureLayout { bar:Bar; x:number; width:number; prefix:number; slots:Slot[]; at:(ticks:number)=>number; }
export interface Lane { track:Track; staff:'main'|'right'|'left'; top:number; height:number; voices:number; }
export interface SystemLayout { measures:MeasureLayout[]; lanes:Lane[]; top:number; height:number; startX:number; endX:number; chordTop:number; page:number; }
export interface PageLayout { systems:SystemLayout[]; index:number; width:number; height:number; }
export interface DocumentLayout { pages:PageLayout[]; }
function lyricLabel(e: Event) { return !e.lyric || ['_','~'].includes(e.lyric) ? '' : e.lyric.replace(/-$/,''); }
export function measureSlots(score:Score,bar:Bar,first:boolean): { slots:Slot[]; minWidth:number; prefix:number } {
  type Item={at:number;left:number;right:number};
  const rows:Item[][]=[];
  const points = new Set<number>([0]);
  const addRow=(row:Item[])=>{if(row.length)rows.push(row.sort((a,b)=>a.at-b.at));row.forEach(p=>points.add(p.at));};
  for (const track of score.tracks) for (const v of bar.tracks[track.id].voices) for (const e of v.events) {
    points.add(e.start);
  }
  for (const track of score.tracks) for (const v of bar.tracks[track.id].voices) {
    const noteRow:Item[]=[],lyricRow:Item[]=[];
    for(const e of v.events) {
      let note=track.type==='numbered'?score.layout.noteSize*.7:20;
      const accidental=e.pitches.some(p=>p.explicit)||((track.type==='staff'||track.type==='piano')&&e.pitches.some(p=>p.alter));
      noteRow.push({at:e.start,left:note/2+(accidental?18:0),right:note/2});
      if(track.type==='numbered'&&e.ticks>PPQ)for(let at=e.start+PPQ;at<e.start+e.ticks;at+=PPQ)noteRow.push({at,left:12,right:12});
      const label=lyricLabel(e);if(label){const half=textWidth(label,score.layout.lyricSize,score.layout.lyricFont)/2+4;lyricRow.push({at:e.start,left:half,right:half});}
    }
    addRow(noteRow);addRow(lyricRow);
  }
  addRow(bar.chords.map(c => {
    const diagram = score.layout.chordDiagrams && (c.diagram || score.chordShapes[c.name]);
    const w = Math.max(textWidth(c.name,23,'sans'),diagram ? 48 : 0);
    return {at:c.at,left:w/2+6,right:w/2+6};
  }));
  const all = [...points].sort((a,b)=>a-b);
  const onlyNumbered = score.tracks.every(t=>t.type === 'numbered');
  const pitched=score.tracks.some(t=>t.type==='staff'||t.type==='piano');
  const fifths=keyInfo(bar.key).fifths;
  const count=Math.abs(fifths)||(bar.keyChanged?Math.abs(keyInfo(score.bars[bar.index-1].key).fifths):0);
  const keyWidth=pitched?count*11:0;
  let prefix=first?(onlyNumbered?10:52+keyWidth+(bar.index===0||bar.meterChanged?35:0)):0;
  if(bar.meterChanged&&(!first||onlyNumbered))prefix+=35;
  if(bar.keyChanged&&(!first||onlyNumbered))prefix+=onlyNumbered?65:keyWidth+12;
  const positions=new Map<number,number>();
  const slots=all.map((at,i)=>{
    let x=i?positions.get(all[i-1])!+24:prefix+20;
    for(const row of rows) {
      const index=row.findIndex(p=>p.at===at);if(index<0)continue;
      const item=row[index],prev=row[index-1];
      x=Math.max(x,prev?positions.get(prev.at)!+prev.right+item.left+5:prefix+8+item.left);
    }
    positions.set(at,x);return {at,min:x,x};
  });
  const minWidth = Math.max(115,...rows.flatMap(row=>row.map(p=>positions.get(p.at)!+p.right+14)),slots.at(-1)!.x+26);
  return {slots,minWidth,prefix};
}
function lanes(score:Score,bars:Bar[],chordHeight:number): Lane[] {
  let y=chordHeight;
  const result:Lane[]=[];
  for (const track of score.tracks) {
    const staffs: Lane['staff'][]=track.type==='piano'?['right','left']:['main'];
    for (const staff of staffs) {
      const count=Math.max(...bars.map(b=>b.tracks[track.id].voices.filter(v=>v.staff===staff).length),1);
      if (track.type==='numbered') {
        const height=count*(score.layout.noteSize+31+(track.lyrics?score.layout.lyricSize+10:0));
        result.push({track,staff,top:y+20,height,voices:count}); y+=height;
      } else {
        // Room for ledgers, stems and dynamics above/below each five-line staff.
        const height=track.type==='tab'?165:track.type==='piano'?126:130;
        result.push({track,staff,top:y+26,height,voices:count}); y+=height;
      }
    }
  }
  return result;
}
export function layoutScore(score:Score): DocumentLayout {
  const {width,height,margin,barsPerSystem,systemGap}=score.layout;
  const names=score.tracks.filter(t=>score.layout.showTrackNames||t.showName);
  const nameWidth=names.length?Math.max(70,...names.map(t=>textWidth(t.name,18,'sans')+18)):0;
  const startX=margin+nameWidth+8, available=width-margin-startX;
  if (available<200) throw new ScoreError([{code:'LAYOUT',path:'layout',message:'页宽不足；请增加 width 或减少 margin'}]);
  const pages:PageLayout[]=[{index:0,width,height,systems:[]}];
  let page=pages[0], top=headerHeight(score), i=0;
  while(i<score.bars.length) {
    const bars:Bar[]=[]; const prepared:ReturnType<typeof measureSlots>[]=[];
    let min=0;
    while(i+bars.length<score.bars.length && bars.length<barsPerSystem) {
      const bar=score.bars[i+bars.length];
      if (bars.length && (bar.breakBefore||bar.pageBreak||bar.section)) break;
      const p=measureSlots(score,bar,bars.length===0);
      if (bars.length && min+p.minWidth>available) break;
      if (p.minWidth>available) throw new ScoreError([{code:'LAYOUT_OVERFLOW',path:`bars[${bar.index}]`,message:`此小节至少需要 ${Math.ceil(p.minWidth)} px，当前只有 ${Math.floor(available)} px；请增加页宽、减小歌词字号或简化单音节文本`}]);
      bars.push(bar); prepared.push(p); min+=p.minWidth;
    }
    const diagrams=score.layout.chordDiagrams && bars.some(b=>b.chords.some(c=>c.diagram||score.chordShapes[c.name]));
    const hasChord=bars.some(b=>b.chords.length);
    const hasAnnotation=bars.some(b=>b.section||b.tempo||b.expression||b.changes.some(c=>c.visible));
    const annotationHeight=hasAnnotation?42:0;
    const chordHeight=(diagrams?60:hasChord?25:0)+annotationHeight;
    const rows=lanes(score,bars,chordHeight);
    const systemHeight=rows.at(-1)!.top+rows.at(-1)!.height-26;
    if (systemHeight>height-margin*2-40) throw new ScoreError([{code:'SYSTEM_TOO_TALL',path:'layout.height',message:'声部总高度超过单页；请增加 height 或减少声部'}]);
    if ((top+systemHeight>height-margin-30 && page.systems.length) || (bars[0].pageBreak&&page.systems.length)) {
      page={index:pages.length,width,height,systems:[]};pages.push(page);top=margin+35;
    } else if(top+systemHeight>height-margin-30 && !page.systems.length) throw new ScoreError([{code:'HEADER_OVERFLOW',path:'layout.height',message:'标题区与首行总谱超过页面；请增加 height 或缩小标题/声部数量'}]);
    let cursor=startX;
    const fill=score.layout.justifyLast || i+bars.length<score.bars.length ? available : Math.min(available,Math.max(min,available*bars.length/barsPerSystem));
    const extra=fill-min;
    const measures=bars.map((bar,idx) => {
      const p=prepared[idx], w=p.minWidth+extra*(p.minWidth/min);
      const grow=w-p.minWidth;
      const slots=p.slots.map(s=>({...s,x:cursor+s.min+grow*(s.at/bar.ticks)}));
      const x=cursor;
      const at=(ticks:number) => {
        const exact=slots.find(s=>s.at===ticks); if(exact) return exact.x;
        const after=slots.findIndex(s=>s.at>ticks);
        if(after===0) return slots[0].x;
        const a=after<0?slots.at(-1)!:slots[after-1], b=after<0?{at:bar.ticks,x:x+w-12}:slots[after];
        return a.x+(b.x-a.x)*(ticks-a.at)/(b.at-a.at);
      };
      cursor+=w;
      return {bar,x,width:w,prefix:p.prefix,slots,at};
    });
    page.systems.push({measures,lanes:rows,top,height:systemHeight,startX,endX:cursor,chordTop:top+annotationHeight,page:page.index});
    top+=systemHeight+systemGap; i+=bars.length;
  }
  return {pages};
}
export function headerHeight(score:Score): number { return score.layout.margin+180+(score.subtitle?28:0)+(score.note?20:0); }
