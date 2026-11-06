import { PPQ, DRUMS, type Score, type Event, type Track, type Pitch, type Bar, type Tempo } from './model.js';
import { keyInfo } from './parser.js';
import { Svg, textWidth } from './svg.js';
import { layoutScore, type DocumentLayout, type SystemLayout, type MeasureLayout, type Lane } from './layout.js';

const S = 13;
interface Placement {event:Event; x:number; y:number; page:number; system:SystemLayout; lane:Lane; voice:string; track:string; }
export interface RenderedScore { pages:string[]; layout:DocumentLayout; }
const beamCount=(e:Event)=>Math.max(0,Math.log2(e.denominator)-2);
function beatGroup(bar:Bar):number { return PPQ*4/bar.meter[1]*(bar.meter[1]>=8&&bar.meter[0]%3===0&&bar.meter[0]>3?3:1); }
function grouped(events:Event[],bar:Bar,includeRests=false):Event[][] {
  const result:Event[][]=[]; let current:Event[]=[];
  for(const e of events) {
    const prev=current.at(-1);
    const sameTuplet=prev?.tuplet&&e.tuplet&&prev.tuplet.join()===e.tuplet.join();
    const sameBeat=prev&&Math.floor(prev.start/beatGroup(bar))===Math.floor(e.start/beatGroup(bar));
    if((e.kind==='rest'&&!includeRests)||beamCount(e)===0||(!sameTuplet&&!sameBeat)) {if(current.length)result.push(current);current=[];}
    if((e.kind!=='rest'||includeRests)&&beamCount(e)>0) current.push(e);
  }
  if(current.length)result.push(current);
  return result;
}
function meter(svg:Svg,x:number,y:number,bar:Bar,size=26) {
  svg.text(String(bar.meter[0]),x,y+24,size,'serif','middle');
  svg.text(String(bar.meter[1]),x,y+49,size,'serif','middle');
}
function tempoMark(svg:Svg,t:Tempo,x:number,y:number,size=24) {
  const code=t.unit.denominator===8?0xe1d7:t.unit.denominator===2?0xe1d3:0xe1d5;
  svg.music(code,x,y,size*1.4);
  if(t.unit.dots)svg.circle(x+size*.67,y-3,1.8);
  svg.text(`= ${Number(t.bpm.toFixed(1))}`,x+size*(t.unit.dots?1:.77),y,size,'sans');
}
function header(svg:Svg,score:Score,page:number) {
  const {width,margin,titleSize}=score.layout;
  if(page===0) {
    svg.text(score.title,width/2,margin+titleSize,titleSize,'sans','middle');
    let y=margin+titleSize+37;
    if(score.artist) {svg.text(`演唱：${score.artist}`,width/2,y,27,'sans','middle');y+=32;}
    if(score.subtitle) svg.text(score.subtitle,width/2,y,22,'sans','middle');
    tempoMark(svg,score.tempo,margin+4,margin+30,28);
    const tonic=keyInfo(score.key).tonic;
    svg.text(`1 = ${tonic}`,margin,margin+111,29,'sans');
    meter(svg,margin+115,margin+66,{meter:score.meter} as Bar,27);
    const credits=[score.composer?`${score.composer} 词曲`:'',score.lyricist?`${score.lyricist} 作词`:'',score.arranger?`${score.arranger} 编配`:''].filter(Boolean);
    credits.forEach((c,i)=>svg.text(c,width-margin,margin+110+i*29,24,'sans','end'));
    if(score.capo||score.fingering) svg.text([score.capo?`变调夹${score.capo}品`:'',score.fingering?`选用${score.fingering}调指法`:''].filter(Boolean).join('，'),margin,margin+151,25,'sans');
    if(score.note) svg.text(score.note,margin,margin+(score.capo||score.fingering?180:151),21,'sans');
  } else {
    svg.text(score.title,margin,margin+7,18,'sans');
  }
}
function chordDiagram(svg:Svg,score:Score,m:MeasureLayout,c:Bar['chords'][number],top:number) {
  const x=m.at(c.at), shape=c.diagram??score.chordShapes[c.name];
  svg.text(c.name,x,top+20,23,'sans','middle');
  if(!score.layout.chordDiagrams||!shape)return;
  const positive=shape.filter((n):n is number=>typeof n==='number'&&n>0);
  const base=c.baseFret??(positive.length&&Math.max(...positive)>4?Math.min(...positive):1);
  const left=x-22.5,gridY=top+32,w=45,h=36;
  for(let i=0;i<6;i++)svg.line(left+i*9,gridY,left+i*9,gridY+h,.9);
  for(let i=0;i<=4;i++)svg.line(left,gridY+i*9,left+w,gridY+i*9,i===0&&base===1?2:.9);
  if(base>1)svg.text(String(base),left-5,gridY+10,12,'sans','end');
  shape.forEach((f,i)=>{
    const xx=left+i*9;
    if(f==='x') {svg.line(xx-2,gridY-8,xx+2,gridY-4,.8);svg.line(xx-2,gridY-4,xx+2,gridY-8,.8);}
    else if(f===0) {svg.circle(xx,gridY-6,2.3,'white');svg.body.push(`<circle cx="${xx}" cy="${gridY-6}" r="2.3" fill="none" stroke="#111" stroke-width=".8"/>`);}
    else if(f>=base&&f<base+4)svg.circle(xx,gridY+(f-base+.5)*9,3.1);
  });
}
function staffY(p:Pick<Pitch,'step'|'octave'>,top:number,clef:'treble'|'bass'):number {
  const index='CDEFGAB'.indexOf(p.step)+p.octave*7;
  const bottom=clef==='treble'?4*7+2:2*7+4; // E4 / G2
  return top+4*S-(index-bottom)*S/2;
}
function keySignature(svg:Svg,key:string,x:number,top:number,clef:'treble'|'bass') {
  const info=keyInfo(key), sharp=info.fifths>0;
  const positions=sharp?[0,1.5,-.5,1,.5,2,1.5]:[2,.5,2.5,1,3,1.5,3.5];
  for(let i=0;i<Math.abs(info.fifths);i++)svg.music(sharp?0xe262:0xe260,x+i*11,top+(positions[i]+(clef==='bass'?1:0))*S,35);
}
function barline(svg:Svg,x:number,y:number,h:number,bar:Bar,last:boolean,numbered=false) {
  const yy=numbered?y-31:y,hh=numbered?44:h;
  svg.line(x,yy,x,yy+hh,bar.final&&last?3:1.1);
  if(bar.repeatEnd||bar.final&&last)svg.line(x-6,yy,x-6,yy+hh,1);
  if(bar.repeatEnd){svg.circle(x-13,yy+hh*.39,2.3);svg.circle(x-13,yy+hh*.61,2.3);}
}
function bracket(svg:Svg,system:SystemLayout) {
  const first=system.lanes[0],last=system.lanes.at(-1)!;
  const x=system.startX-8,y=system.top+first.top-5;
  const bottom=system.top+last.top+(last.track.type==='numbered'?38:last.track.type==='tab'?65:52);
  if(system.lanes.length>1) {
    svg.line(x,y,x,bottom,2.2);svg.line(x+4,y,x+4,bottom,1);
    svg.path(`M${x+7} ${y-4}Q${x} ${y+1} ${x} ${y+10}M${x} ${bottom-10}Q${x} ${bottom-1} ${x+7} ${bottom+4}`,1.2);
  }
  for(const l of system.lanes.filter(l=>l.track.type==='piano'&&l.staff==='right')) {
    const lower=system.lanes.find(n=>n.track.id===l.track.id&&n.staff==='left')!;
    const yy=system.top+l.top,b=system.top+lower.top+52,mid=(yy+b)/2,xx=system.startX-15;
    svg.path(`M${xx+4} ${yy}C${xx-12} ${yy+12} ${xx+1} ${mid-15} ${xx-10} ${mid}C${xx+1} ${mid+15} ${xx-12} ${b-12} ${xx+4} ${b}`,2);
  }
}
function lyrics(svg:Svg,events:Event[],m:MeasureLayout,y:number,score:Score) {
  for(let i=0;i<events.length;i++) {
    const e=events[i],label=e.lyric;
    if(!label||label==='_')continue;
    const x=m.at(e.start);
    if(label==='~') {const prev=events[i-1];if(prev)svg.line(m.at(prev.start)+textWidth((prev.lyric??'').replace(/-$/,''),score.layout.lyricSize,score.layout.lyricFont)/2+4,y+3,x+8,y+3,.9);continue;}
    const hyphen=label.endsWith('-'),text=hyphen?label.slice(0,-1):label;
    svg.text(text,x,y,score.layout.lyricSize,score.layout.lyricFont,'middle');
    if(hyphen) {
      const next=events[i+1],end=next?m.at(next.start)-textWidth((next.lyric??'').replace(/-$/,''),score.layout.lyricSize,score.layout.lyricFont)/2:m.x+m.width-10;
      const start=x+textWidth(text,score.layout.lyricSize,score.layout.lyricFont)/2;
      if(end-start>9)svg.text('-',start+(end-start)/2,y-1,score.layout.lyricSize,score.layout.lyricFont,'middle');
    }
  }
}
function numbered(svg:Svg,events:Event[],m:MeasureLayout,y:number,score:Score) {
  const size=score.layout.noteSize;
  for(const e of events) {
    const x=m.at(e.start), pitches=e.pitches.length?e.pitches:[undefined];
    pitches.forEach((p,i)=>{
      const yy=y-i*(size+10);
      svg.text(p?String(p.degree):'0',x,yy,size,'sans','middle');
      if(p?.explicit)svg.music(p.accidental===1?0xe262:p.accidental===-1?0xe260:0xe261,x-size*.9,yy-8,size*.75);
      const shift=p?.octaveShift??0;
      for(let j=0;j<Math.abs(shift);j++)svg.circle(x,shift>0?yy-size-5-j*6:yy+12+beamCount(e)*6+j*6,2);
      if(e.dots&&e.denominator>=4)for(let j=0;j<e.dots;j++)svg.circle(x+size*.55+j*6,yy-9,1.8);
    });
    if(e.ticks>PPQ&&e.denominator<4)for(let at=e.start+PPQ;at<e.start+e.ticks;at+=PPQ)svg.text('−',m.at(at),y-2,size,'sans','middle');
    if(e.dynamic)svg.text(e.dynamic,x,y-size-12,19,'serif','middle');
    if(e.accent)svg.text('>',x,y-size-12,20,'serif','middle');
  }
  for(const group of grouped(events,m.bar)) {
    for(let level=1;level<=Math.max(...group.map(beamCount));level++) {
      let run:Event[]=[];
      const flush=()=>{if(run.length){svg.line(m.at(run[0].start)-size*.29,y+6+(level-1)*6,m.at(run.at(-1)!.start)+size*.29,y+6+(level-1)*6,1.3);run=[];}};
      for(const e of group){if(beamCount(e)>=level)run.push(e);else flush();}flush();
    }
    tuplet(svg,group,m,y-size-22);
  }
}
function tuplet(svg:Svg,group:Event[],m:MeasureLayout,y:number) {
  const first=group[0];if(!first?.tuplet)return;
  const count=first.tuplet[0];
  for(let i=0;i<group.length;i+=count){const part=group.slice(i,i+count);svg.text(String(count),(m.at(part[0].start)+m.at(part.at(-1)!.start))/2,y,16,'serif','middle');}
}
function tab(svg:Svg,events:Event[],m:MeasureLayout,top:number,track:Track) {
  const bottoms=new Map<Event,number>();
  for(const e of events) {
    const x=m.at(e.start);
    if(e.kind==='rest') {
      const full=e.ticks===m.bar.ticks;
      svg.music(full?0xe4e3:e.denominator===8?0xe4e6:e.denominator===16?0xe4e7:e.denominator===2?0xe4e4:0xe4e5,x-5,top+35,34);
      if(beamCount(e)>0&&!full)svg.line(x,top+76,x,top+86,1.1);
      continue;
    }
    if(e.kind==='strum') {
      const up=e.direction==='down',from=top+(up?60:14),to=top+(up?14:60);
      if(e.direction==='mute') {svg.line(x-4,top+28,x+4,top+36,1.1);svg.line(x-4,top+36,x+4,top+28,1.1);}
      else {svg.line(x,from,x,to,1.2);svg.path(`M${x-4} ${to+(up?9:-9)}L${x} ${to}L${x+4} ${to+(up?9:-9)}`,1.2);}
      bottoms.set(e,top+65);
    } else {
      const ys=e.tab.map(n=>top+(n.string-1)*S);
      e.tab.forEach((n,i)=>{
        const y=ys[i];
        if(track.mode==='cross'||n.fret==='x') {svg.line(x-5,y-5,x+5,y+5,1.1);svg.line(x-5,y+5,x+5,y-5,1.1);}
        else {const label=String(n.fret),w=textWidth(label,20,'sans')+4;svg.rect(x-w/2,y-11,w,20);svg.text(label,x,y+7,20,'sans','middle');}
      });
      bottoms.set(e,Math.max(...ys));
    }
    if(e.denominator<4)continue;
    svg.line(x,bottoms.get(e)!+7,x,top+86,1.2);
    if(e.dots)svg.circle(x+10,(bottoms.get(e)??top+50)+4,1.6);
  }
  for(const group of grouped(events,m.bar,true)) {
    const yy=top+86;
    for(let level=1;level<=Math.max(...group.map(beamCount));level++) {
      let run:Event[]=[];
      const flush=()=>{if(run.length){const a=m.at(run[0].start),b=run.length===1?a+8:m.at(run.at(-1)!.start);svg.line(a,yy-(level-1)*5,b,yy-(level-1)*5,level===1?2.1:1.7);run=[];}};
      for(const e of group){if(beamCount(e)>=level)run.push(e);else flush();}flush();
    }
    tuplet(svg,group,m,top+108);
  }
}
function ledger(svg:Svg,x:number,y:number,top:number) {
  if(y<top)for(let yy=top-S;yy>=y-1;yy-=S)svg.line(x-10,yy,x+10,yy,1);
  if(y>top+4*S)for(let yy=top+5*S;yy<=y+1;yy+=S)svg.line(x-10,yy,x+10,yy,1);
}
function staff(svg:Svg,events:Event[],m:MeasureLayout,top:number,track:Track,clef:'treble'|'bass',voiceIndex:number,voiceCount:number):Map<Event,number> {
  const noteYs=new Map<Event,number>(),stems=new Map<Event,{x:number;from:number;to:number;up:boolean}>();
  const accidentalState=new Map<string,number>();const defaults=keyInfo(m.bar.key).alters;
  for(const e of events) {
    const x=m.at(e.start);
    if(e.kind==='rest') {
      const whole=e.ticks===m.bar.ticks;
      const code=whole?0xe4e3:({1:0xe4e3,2:0xe4e4,4:0xe4e5,8:0xe4e6,16:0xe4e7,32:0xe4e8,64:0xe4e9}[e.denominator]??0xe4e5);
      svg.music(code,x-6,top+26+(voiceCount>1?(voiceIndex%2===0?-13:13):0),44);
      if(e.dots&&!whole)svg.circle(x+13,top+22,2);
      continue;
    }
    const notes=track.type==='drums'?e.drums.map(d=>({...DRUMS[d],alter:0,explicit:false})):e.pitches;
    const ys=notes.map(p=>staffY(p,top,clef));
    const average=ys.reduce((a,b)=>a+b,0)/ys.length;
    const up=voiceCount>1?voiceIndex%2===0:average>=top+26;
    noteYs.set(e,Math.min(...ys));
    notes.forEach((p,i)=>{
      const yy=ys[i];ledger(svg,x,yy,top);
      const cross='cross' in p&&p.cross;
      if(cross) {svg.line(x-5,yy-5,x+5,yy+5,1.4);svg.line(x-5,yy+5,x+5,yy-5,1.4);}
      else svg.ellipse(x,yy,e.denominator===1?8:6.8,4.5,e.denominator<=2?'white':'#111',-18);
      if(track.type!=='drums') {
        const id=p.step+p.octave,previous=accidentalState.get(id)??defaults[p.step]??0;
        if(p.alter!==previous || p.explicit)svg.music(p.alter===2?0xe263:p.alter===-2?0xe264:p.alter===1?0xe262:p.alter===-1?0xe260:0xe261,x-24-i*2,yy,38);
        accidentalState.set(id,p.alter);
      }
      if(e.dots)for(let j=0;j<e.dots;j++)svg.circle(x+13+j*6,yy-(Math.abs((yy-top)%S)<1?S/2:0),1.9);
    });
    if(e.denominator!==1) {
      const sx=x+(up?6:-6),from=up?Math.max(...ys):Math.min(...ys),to=up?Math.min(...ys)-35:Math.max(...ys)+35;
      stems.set(e,{x:sx,from,to,up});
    }
    if(e.dynamic)svg.text(e.dynamic,x,top+91,22,'serif','middle');
    if(e.accent)svg.text('>',x,Math.min(...ys)-20,20,'serif','middle');
  }
  const beamed=new Set<Event>();
  for(const group of grouped(events,m.bar)) {
    if(group.length<2)continue;
    const up=stems.get(group[0])?.up??true;
    const end=up?Math.min(...group.map(e=>stems.get(e)!.to)):Math.max(...group.map(e=>stems.get(e)!.to));
    for(const e of group) {const s=stems.get(e)!;s.to=end;beamed.add(e);}
    const max=Math.max(...group.map(beamCount));
    for(let level=1;level<=max;level++) {
      let run:Event[]=[];
      const flush=()=>{if(run.length){const a=stems.get(run[0])!.x,b=run.length===1?a+8:stems.get(run.at(-1)!)!.x,y=end+(up?1:-1)*(level-1)*6;svg.line(a,y,b,y,3.7);run=[];}};
      for(const e of group){if(beamCount(e)>=level)run.push(e);else flush();}flush();
    }
    tuplet(svg,group,m,up?end-10:end+23);
  }
  for(const [e,s] of stems) {
    svg.line(s.x,s.from,s.x,s.to,1.25);
    if(!beamed.has(e)&&beamCount(e)>0) {
      const code=(s.up?0xe240:0xe241)+(beamCount(e)-1)*2;
      svg.music(code,s.x,s.to,44);
      if(e.tuplet)svg.text(String(e.tuplet[0]),s.x,s.to-10,16,'serif','middle');
    }
  }
  return noteYs;
}
function drawSystem(svg:Svg,score:Score,sys:SystemLayout,placements:Placement[]) {
  bracket(svg,sys);
  const first=sys.measures[0];
  for(const m of sys.measures) {
    svg.group(`data-bar="${m.bar.index+1}"`);
    if(score.layout.showBarNumbers)svg.text(String(m.bar.index+1),m.x+3,sys.top+sys.lanes[0].top-15,13,'sans');
    let annotationX=m.x+8;
    if(m.bar.section) {svg.text(m.bar.section,annotationX,sys.top+18,21,'sans');annotationX+=textWidth(m.bar.section,21,'sans')+22;}
    if(m.bar.tempo) {tempoMark(svg,m.bar.tempo,annotationX,sys.top+18,20);annotationX+=106;}
    if(m.bar.expression)svg.text(m.bar.expression,annotationX,sys.top+18,19,'serif');
    for(const c of m.bar.changes)if(c.visible){
      const xx=Math.max(m.x+8,Math.min(m.at(c.at),m.x+m.width-105));
      tempoMark(svg,c.tempo,xx,sys.top+18,18);
      if(c.tempo.text)svg.text(c.tempo.text,xx,sys.top+38,16,'serif');
    }
    for(const c of m.bar.chords)chordDiagram(svg,score,m,c,sys.chordTop);
    for(const lane of sys.lanes) {
      const track=lane.track,top=sys.top+lane.top;
      const clef=lane.staff==='left'?'bass':track.clef;
      const voices=m.bar.tracks[track.id].voices.filter(v=>v.staff===lane.staff);
      if(track.type!=='numbered') {
        const count=track.type==='tab'?6:5;
        for(let j=0;j<count;j++)svg.line(m.x,top+j*S,m.x+m.width,top+j*S,.85);
        const pitched=track.type==='piano'||track.type==='staff';
        const fifths=keyInfo(m.bar.key).fifths;
        const keyCount=Math.abs(fifths)||(m.bar.keyChanged?Math.abs(keyInfo(score.bars[m.bar.index-1].key).fifths):0);
        const keyWidth=pitched?keyCount*11:0;
        const keyX=m===first?m.x+47:m.x+8;
        if(m===first) {
          if(track.type==='tab') {['T','A','B'].forEach((c,i)=>svg.text(c,m.x+27,top+18+i*19,23,'serif','middle'));}
          else if(track.type==='drums')svg.music(0xe069,m.x+14,top+26,48);
          else {svg.music(clef==='treble'?0xe050:0xe062,m.x+9,top+(clef==='treble'?39:13),48);if(!m.bar.keyChanged)keySignature(svg,m.bar.key,keyX,top,clef);}
        }
        let signatureX=m.x+18;
        if(m===first)signatureX=m.x+62+keyWidth;
        else if(m.bar.keyChanged)signatureX+=keyWidth+4;
        if(m.bar.meterChanged||m.bar.index===0)meter(svg,signatureX,top-6,m.bar,23);
        if(m.bar.keyChanged&&pitched) {
          if(fifths===0) {const old=keyInfo(score.bars[m.bar.index-1].key);for(let j=0;j<Math.abs(old.fifths);j++)svg.music(0xe261,keyX+j*11,top+(j%4)*S,34);}
          else keySignature(svg,m.bar.key,keyX,top,clef);
        }
        barline(svg,m.x+m.width,top,(count-1)*S,m.bar,m===sys.measures.at(-1));
        if(m.bar.repeatStart){svg.line(m.x+5,top,m.x+5,top+(count-1)*S,3);svg.circle(m.x+14,top+S*1.5,2.3);svg.circle(m.x+14,top+S*2.5,2.3);}
      } else {
        const baseline=top+score.layout.noteSize;
        for(let i=0;i<lane.voices;i++)barline(svg,m.x+m.width,baseline+i*(score.layout.noteSize+32+(track.lyrics?score.layout.lyricSize+10:0)),44,m.bar,m===sys.measures.at(-1),true);
        if(m.bar.meterChanged) {svg.text(m.bar.meter.join('/'),m.x+8,baseline-6,19,'sans');}
        if(m.bar.keyChanged)svg.text(`1=${keyInfo(m.bar.key).tonic}`,m.x+8+(m.bar.meterChanged?36:0),baseline-6,19,'sans');
      }
      if(m===first&&(score.layout.showTrackNames||track.showName)&&lane.staff!=='left')svg.text(track.name,sys.startX-18,top+29,18,'sans','end');
      voices.forEach((v,i)=>{
        let y=top;
        let ys:Map<Event,number>|undefined;
        if(track.type==='numbered') {
          y=top+score.layout.noteSize+i*(score.layout.noteSize+32+(track.lyrics?score.layout.lyricSize+10:0));
          numbered(svg,v.events,m,y,score);
          if(track.lyrics)lyrics(svg,v.events,m,y+score.layout.lyricSize+14,score);
        } else if(track.type==='tab')tab(svg,v.events,m,top,track);
        else {
          ys=staff(svg,v.events,m,top,track,clef,i,voices.length);
          if(track.lyrics)lyrics(svg,v.events,m,top+108,score);
        }
        for(const e of v.events)placements.push({event:e,x:m.at(e.start),y:ys?.get(e)??y,page:sys.page,system:sys,lane,voice:v.staff+':'+v.id,track:track.id});
      });
    }
    svg.endGroup();
  }
}
function curve(svg:Svg,x1:number,x2:number,y:number,height=14) {
  if(x2<=x1)return;
  const span=x2-x1,h=Math.min(height,span*.18);
  svg.path(`M${x1} ${y}C${x1+span*.23} ${y-h} ${x2-span*.23} ${y-h} ${x2} ${y}`,1.15);
}
function connections(svgs:Svg[],placements:Placement[]) {
  const streams=new Map<string,Placement[]>();
  for(const p of placements) {const k=p.track+':'+p.voice;streams.set(k,[...(streams.get(k)??[]),p]);}
  const connect=(a:Placement,b:Placement,slur=false)=>{
    const numbered=a.lane.track.type==='numbered';
    const hasOctave=a.event.pitches.some(p=>(p.octaveShift??0)>0)||b.event.pitches.some(p=>(p.octaveShift??0)>0);
    const offset=numbered?-(hasOctave?48:37):a.lane.track.type==='tab'?-16:-14;
    const ya=a.y+offset,yb=b.y+offset;
    if(a.system===b.system)curve(svgs[a.page],a.x-3,b.x+3,Math.min(ya,yb),slur?20:12);
    else {
      curve(svgs[a.page],a.x+9,a.system.endX-3,ya,slur?20:12);
      curve(svgs[b.page],b.system.startX+6,b.x-9,yb,slur?20:12);
    }
  };
  for(const ps of streams.values()) {
    let slur:Placement|undefined;
    ps.forEach((p,i)=>{if(p.event.tie&&ps[i+1])connect(p,ps[i+1]);if(p.event.slur==='start')slur=p;if(p.event.slur==='stop'&&slur){connect(slur,p,true);slur=undefined;}});
  }
}
export function renderScore(score:Score):RenderedScore {
  const layout=layoutScore(score),placements:Placement[]=[];
  const svgs=layout.pages.map(p=>{
    const svg=new Svg(p.width,p.height,score.title);header(svg,score,p.index);
    p.systems.forEach(s=>drawSystem(svg,score,s,placements));
    svg.text(String(p.index+1),p.width/2,p.height-score.layout.margin/2,14,'sans','middle');
    return svg;
  });
  connections(svgs,placements);
  return {pages:svgs.map(s=>s.toString()),layout};
}
