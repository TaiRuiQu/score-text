import {writeFile,mkdir} from 'node:fs/promises';
const ref=(name:string)=>({$ref:`#/$defs/${name}`});
const str={type:'string'},bool={type:'boolean'};
const obj=(properties:Record<string,unknown>,required:string[]=[],extra:unknown=false)=>({type:'object',properties,required,additionalProperties:extra});
const duration={oneOf:[{type:'integer',enum:[1,2,4,8,16,32,64]},{type:'string',pattern:'^(1|2|4|8|16|32|64)\\.{0,2}(\\*[1-9][0-9]?:[1-9][0-9]?)?$'}]};
const beat={type:'number',minimum:1,maximum:100};
const shape={type:'array',minItems:6,maxItems:6,items:{oneOf:[{const:'x'},{type:'integer',minimum:0,maximum:36}]}};
const tempo={oneOf:[{type:'number',minimum:10,maximum:400},obj({bpm:{type:'number',minimum:10,maximum:400},unit:ref('duration'),text:str},['bpm'])]};
const lyrics={oneOf:[str,{type:'array',items:str}]};
const event=obj({pitch:{oneOf:[str,{type:'integer',minimum:1,maximum:7}]},pitches:{type:'array',minItems:1,items:{oneOf:[str,{type:'integer',minimum:1,maximum:7}]}},duration:ref('duration'),rest:{const:true},strings:{type:'object',minProperties:1,propertyNames:{pattern:'^[1-6]$'},additionalProperties:{oneOf:[{const:'x'},{type:'integer',minimum:0,maximum:36}]}},drums:{type:'array',minItems:1,items:{enum:['kick','snare','hat','openhat','pedal','crash','ride','tom1','tom2','floor']}},strum:{enum:['down','up','mute']},lyric:str,tie:bool,slur:{enum:['start','stop']},dynamic:{enum:['ppp','pp','p','mp','mf','f','ff','fff','sfz']},accent:bool},['duration']);
const notes={oneOf:[str,{type:'array',minItems:1,items:{oneOf:[str,ref('event')]}}]};
const voice=obj({id:str,staff:{enum:['main','right','left']},notes:ref('notes'),lyrics:ref('lyrics')},['notes']);
const voiceInput={oneOf:[ref('notes'),ref('voice')]};
const trackBar={oneOf:[ref('voiceInput'),obj({right:ref('voiceInput'),left:ref('voiceInput')},[],false),obj({voices:{type:'array',minItems:1,items:ref('voice')}},['voices'])]};
const meter={type:'string',pattern:'^([1-9]|[12][0-9]|3[0-2])/(1|2|4|8|16|32|64)$'};
const bar=obj({use:str,meter,key:str,tempo:ref('tempo'),tempoChanges:{type:'array',items:obj({beat,bpm:{type:'number',minimum:10,maximum:400},unit:ref('duration'),text:str},['bpm'])},ramp:obj({to:{type:'number',minimum:10,maximum:400},bars:{type:'integer',minimum:1,maximum:100},text:str},['to']),section:str,expression:str,break:bool,pageBreak:bool,repeatStart:bool,repeatEnd:bool,final:bool,pickup:ref('duration'),chords:{oneOf:[str,{type:'array',items:{oneOf:[str,obj({name:str,beat,diagram:shape,baseFret:{type:'integer',minimum:1,maximum:24}},['name'])]}}]}},[],ref('trackBar'));
const num=(min:number,max:number)=>({type:'number',minimum:min,maximum:max});
const layout=obj({width:num(400,3000),height:num(400,6000),margin:num(20,150),barsPerSystem:{type:'integer',minimum:1,maximum:16},systemGap:num(15,150),lyricSize:num(12,40),lyricFont:{enum:['serif','sans']},noteSize:num(16,48),titleSize:num(20,72),showBarNumbers:bool,showTrackNames:bool,chordDiagrams:bool,justifyLast:bool});
const types={enum:['numbered','tab','piano','staff','drums']};
const track={oneOf:[types,obj({type:types,name:str,mode:{enum:['frets','cross','strum']},clef:{enum:['treble','bass']},tuning:{type:'array',minItems:6,maxItems:6,items:str},lyrics:bool,showName:bool},['type'])]};
const schema={
  $schema:'http://json-schema.org/draft-07/schema#',
  title:'Score Text v1',description:'Agent-friendly YAML music notation. The parser additionally validates durations and cross-references.',
  ...obj({version:{const:1},title:{type:'string',minLength:1},subtitle:str,artist:str,composer:str,lyricist:str,arranger:str,key:str,meter,tempo:ref('tempo'),capo:{type:'integer',minimum:0,maximum:24},fingering:str,note:str,layout:ref('layout'),tracks:{type:'object',minProperties:1,maxProperties:32,propertyNames:{pattern:'^[a-zA-Z][\\w-]*$'},additionalProperties:ref('track')},patterns:{type:'object',additionalProperties:ref('bar')},chordShapes:{type:'object',additionalProperties:shape},bars:{type:'array',minItems:1,maxItems:10000,items:ref('bar')}},['version','title','tracks','bars']),
  $defs:{duration,tempo,lyrics,event:{...event,oneOf:['pitch','pitches','rest','strings','drums','strum'].map(k=>({required:[k]}))},notes,voice,voiceInput,trackBar,bar,layout,track},
};
await mkdir('schema',{recursive:true});await writeFile('schema/score-text.schema.json',JSON.stringify(schema,null,2)+'\n');
