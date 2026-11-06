import { PPQ, DRUMS, type Score, type Event, type Track, type Bar } from './model.js';
import { keyInfo, parsePitch } from './parser.js';
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const type=(den:number)=>({1:'whole',2:'half',4:'quarter',8:'eighth',16:'16th',32:'32nd',64:'64th'}[den]??'quarter');
function harmony(score:Score,c:Bar['chords'][number]):string {
  const m=/^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(c.name);
  if(!m)return `<direction><direction-type><words>${esc(c.name)}</words></direction-type><offset>${c.at}</offset></direction>`;
  const kinds:Record<string,string>={'':'major',m:'minor',maj7:'major-seventh',m7:'minor-seventh','7':'dominant',sus4:'suspended-fourth',sus2:'suspended-second','6':'major-sixth',m6:'minor-sixth','9':'dominant-ninth',maj9:'major-ninth',m9:'minor-ninth',dim:'diminished',aug:'augmented'};
  const alter=(s:string)=>s==='#'?1:s==='b'?-1:0;
  const shape=c.diagram??score.chordShapes[c.name];
  const active=shape?.filter((n):n is number=>typeof n==='number');
  const base=c.baseFret??(active?.length&&Math.max(...active)>4?Math.min(...active.filter(n=>n>0)):1);
  const frame=shape?.some(n=>n!=='x')?`<frame unplayed="x"><frame-strings>6</frame-strings><frame-frets>4</frame-frets><first-fret>${base}</first-fret>${shape.map((n,i)=>n==='x'?'':`<frame-note><string>${6-i}</string><fret>${n}</fret></frame-note>`).join('')}</frame>`:'';
  return `<harmony><root><root-step>${m[1]}</root-step>${alter(m[2])?`<root-alter>${alter(m[2])}</root-alter>`:''}</root><kind text="${esc(m[3])}">${kinds[m[3]]??'other'}</kind>${m[4]?`<bass><bass-step>${m[4]}</bass-step>${alter(m[5])?`<bass-alter>${alter(m[5])}</bass-alter>`:''}</bass>`:''}${frame}<offset>${c.at}</offset></harmony>`;
}
function eventXml(e:Event,track:Track,voice:string,staff:number,bar:Bar):string {
  let members:string[]=[];
  if(e.kind==='rest')members=[e.ticks===bar.ticks?'<rest measure="yes"/>':'<rest/>'];
  else if(track.type==='drums')members=e.drums.map(d=>`<unpitched><display-step>${DRUMS[d].step}</display-step><display-octave>${DRUMS[d].octave}</display-octave></unpitched>`);
  else if(track.type==='tab'&&(!e.pitches.length||e.tab.some(n=>n.fret==='x')))members=e.tab.length?e.tab.map(n=>`<unpitched><display-step>B</display-step><display-octave>4</display-octave></unpitched>`):['<unpitched><display-step>B</display-step><display-octave>4</display-octave></unpitched>'];
  else members=e.pitches.map(p=>`<pitch><step>${p.step}</step>${p.alter?`<alter>${p.alter}</alter>`:''}<octave>${p.octave}</octave></pitch>`);
  if(!members.length)members=['<rest/>'];
  return members.map((pitch,i)=>{
    const tie=(e.tieEnd?'<tie type="stop"/>':'')+(e.tie?'<tie type="start"/>':'');
    const notations=[e.tieEnd?'<tied type="stop"/>':'',e.tie?'<tied type="start"/>':'',e.slur?`<slur type="${e.slur}" number="1"/>`:'',e.accent?'<articulations><accent/></articulations>':''];
    const tab=track.type==='tab'?e.tab[i]:undefined;
    if(tab)notations.push(`<technical><string>${tab.string}</string><fret>${tab.fret==='x'?0:tab.fret}</fret></technical>`);
    let lyric='';
    if(i===0&&e.lyric&&e.lyric!=='_')lyric=e.lyric==='~'?'<lyric><extend/></lyric>':`<lyric><syllabic>${e.lyric.endsWith('-')?'begin':'single'}</syllabic><text>${esc(e.lyric.replace(/-$/,''))}</text></lyric>`;
    const tuple=e.tuplet?`<time-modification><actual-notes>${e.tuplet[0]}</actual-notes><normal-notes>${e.tuplet[1]}</normal-notes></time-modification>`:'';
    const instrument=track.type==='drums'&&e.drums[i]?`<instrument id="${track.id}-${e.drums[i]}"/>`:'';
    const fullRest=e.kind==='rest'&&e.ticks===bar.ticks;
    const dynamic=i===0&&e.dynamic?`<direction><direction-type><dynamics><${e.dynamic}/></dynamics></direction-type><staff>${staff}</staff></direction>`:'';
    return `${dynamic}<note>${i?'<chord/>':''}${pitch}<duration>${e.ticks}</duration>${tie}${instrument}<voice>${esc(voice)}</voice>${fullRest?'':`<type>${type(e.denominator)}</type>${'<dot/>'.repeat(e.dots)}`}${tuple}${track.type==='drums'&&e.drums[i]&&DRUMS[e.drums[i]].cross||tab?.fret==='x'?'<notehead>x</notehead>':''}<staff>${staff}</staff>${notations.some(Boolean)?`<notations>${notations.join('')}</notations>`:''}${lyric}</note>`;
  }).join('');
}
export function toMusicXml(score:Score):string {
  const parts=score.tracks.map(t=>`<score-part id="${t.id}"><part-name>${esc(t.name)}</part-name>${t.type==='drums'?Object.entries(DRUMS).map(([name,d])=>`<score-instrument id="${t.id}-${name}"><instrument-name>${name}</instrument-name></score-instrument>`).join(''):''}${t.type==='drums'?Object.entries(DRUMS).map(([name,d])=>`<midi-instrument id="${t.id}-${name}"><midi-channel>10</midi-channel><midi-unpitched>${d.midi+1}</midi-unpitched></midi-instrument>`).join(''):''}</score-part>`).join('');
  const body=score.tracks.map((t,ti)=>`<part id="${t.id}">${score.bars.map((b,i)=>{
    const k=keyInfo(b.key);
    const clef=t.type==='tab'?'<clef><sign>TAB</sign><line>5</line></clef>':t.type==='drums'?'<clef><sign>percussion</sign></clef>':t.type==='piano'?'<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>':`<clef><sign>${t.clef==='bass'?'F':'G'}</sign><line>${t.clef==='bass'?4:2}</line></clef>`;
    const tuning=t.type==='tab'?`<staff-details><staff-lines>6</staff-lines>${[...t.tuning].reverse().map((n,j)=>{const p=parsePitch(n,'C');return `<staff-tuning line="${j+1}"><tuning-step>${p.step}</tuning-step>${p.alter?`<tuning-alter>${p.alter}</tuning-alter>`:''}<tuning-octave>${p.octave}</tuning-octave></staff-tuning>`;}).join('')}${score.capo?`<capo>${score.capo}</capo>`:''}</staff-details>`:'';
    const attrs=(i===0||b.meterChanged||b.keyChanged)?`<attributes>${i===0?`<divisions>${PPQ}</divisions>`:''}<key><fifths>${k.fifths}</fifths><mode>${k.minor?'minor':'major'}</mode></key><time><beats>${b.meter[0]}</beats><beat-type>${b.meter[1]}</beat-type></time>${i===0?(t.type==='piano'?'<staves>2</staves>':'')+clef+tuning:''}</attributes>`:'';
    const tempos=ti===0?[...(i===0?[{at:0,tempo:score.tempo}]:[]),...(b.tempo?[{at:0,tempo:b.tempo}]:[]),...b.changes]:[];
    const directions=tempos.map(({at,tempo:t})=>`<direction><direction-type><metronome><beat-unit>${type(t.unit.denominator)}</beat-unit>${'<beat-unit-dot/>'.repeat(t.unit.dots)}<per-minute>${t.bpm}</per-minute></metronome></direction-type>${at?`<offset sound="yes">${at}</offset>`:''}<sound tempo="${t.bpm*t.unit.ticks/PPQ}"/></direction>`).join('');
    const text=ti===0?[b.section,b.expression].filter(Boolean).map(s=>`<direction><direction-type><words>${esc(s)}</words></direction-type></direction>`).join(''):'';
    const voices=b.tracks[t.id].voices;
    const notes=voices.map((v,j)=>`${j?`<backup><duration>${b.ticks}</duration></backup>`:''}${v.events.map(e=>eventXml(e,t,v.id,v.staff==='left'?2:1,b)).join('')}`).join('');
    const harmonies=ti===0?b.chords.map(c=>harmony(score,c)).join(''):'';
    return `<measure number="${i+1}"${b.ticks!==b.meter[0]*PPQ*4/b.meter[1]?' implicit="yes"':''}>${b.breakBefore||b.pageBreak?`<print new-system="yes"${b.pageBreak?' new-page="yes"':''}/>`:''}${attrs}${b.repeatStart?'<barline location="left"><repeat direction="forward"/></barline>':''}${directions}${text}${harmonies}${notes}${b.repeatEnd?'<barline location="right"><repeat direction="backward"/></barline>':b.final?'<barline location="right"><bar-style>light-heavy</bar-style></barline>':''}</measure>`;
  }).join('')}</part>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${esc(score.title)}</work-title></work><identification>${score.composer?`<creator type="composer">${esc(score.composer)}</creator>`:''}<encoding><software>score-text</software></encoding></identification><part-list>${parts}</part-list>${body}</score-partwise>`;
}
