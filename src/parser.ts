import { parseDocument } from 'yaml';
import { PPQ, DEFAULT_LAYOUT, DRUMS, CHORD_SHAPES, ScoreError, type Score, type Track, type Bar, type Event, type Pitch, type Duration, type Tempo, type Voice, type TrackBar, type Diagnostic } from './model.js';

type Obj = Record<string, any>;
function fail(code: string, message: string, path: string): never { throw new ScoreError([{ code, message, path }]); }
const object = (value: unknown, path: string): Obj => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('TYPE', '需要一个对象 / expected an object', path);
  return value as Obj;
};
function keys(value: Obj, allowed: string[], path: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('UNKNOWN_FIELD', `未知字段 ${key} / unknown field`, `${path}.${key}`);
}
function num(value: any, min: number, max: number, path: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail('RANGE', `需要 ${min}–${max} 范围内的${integer ? '整数' : '数字'}`, path);
  return value;
}
export function parseDuration(value: string | number, path = 'duration'): Duration {
  const m = /^(1|2|4|8|16|32|64)(\.{0,2})(?:\*(\d+):(\d+))?$/.exec(String(value));
  if (!m) fail('DURATION', '时值应为 4、8、4.、16 或 8*3:2（三连音）', path);
  const denominator = Number(m[1]), dots = m[2].length;
  const tuplet: [number, number] | undefined = m[3] ? [Number(m[3]), Number(m[4])] : undefined;
  if (tuplet && (tuplet.some(n => n < 1 || n > 16))) fail('DURATION', '连音比例须在 1–16 内', path);
  const ticks = PPQ * 4 / denominator * (2 - 1 / 2 ** dots) * (tuplet ? tuplet[1] / tuplet[0] : 1);
  if (!Number.isInteger(ticks)) fail('DURATION', '此连音比例不能精确表示；请使用 2、3、5、7 连音', path);
  return { ticks, denominator, dots, tuplet };
}
export function parseMeter(value: unknown, path = 'meter'): [number, number] {
  const m = /^(\d+)\/(1|2|4|8|16|32|64)$/.exec(String(value));
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 32) fail('METER', '拍号应为 4/4、6/8、3/4、7/8 等', path);
  return [Number(m[1]), Number(m[2])];
}
function tempo(value: any, path: string): Tempo {
  if (typeof value === 'number') return { bpm: num(value, 10, 400, path), unit: parseDuration(4) };
  const v = object(value, path); keys(v, ['bpm', 'unit', 'text'], path);
  return { bpm: num(v.bpm, 10, 400, `${path}.bpm`), unit: parseDuration(v.unit ?? 4, `${path}.unit`), text: v.text == null ? undefined : String(v.text) };
}
export function keyInfo(key: string) {
  const m = /^([A-G])([#b]?)(m|\s+minor|\s+major)?$/.exec(key);
  if (!m) fail('KEY', '调性应为 C、Eb、F#、Am 等', 'key');
  const minor = m[3] === 'm' || m[3]?.trim() === 'minor';
  const name = m[1] + m[2];
  const majorKeys = ['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
  const minorKeys = ['Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#','G#','D#','A#'];
  const fifths = (minor ? minorKeys : majorKeys).indexOf(name) - 7;
  if (fifths < -7) fail('KEY', '不支持此调性拼写', 'key');
  const alters: Record<string, number> = {};
  const order = fifths > 0 ? ['F','C','G','D','A','E','B'] : ['B','E','A','D','G','C','F'];
  for (let i = 0; i < Math.abs(fifths); i++) alters[order[i]] = Math.sign(fifths);
  // Minor numbered notation uses the relative major tonic: 6 = minor tonic.
  const tonic = minor ? majorKeys[fifths + 7] : name;
  return { fifths, minor, alters, tonic };
}
export function parsePitch(value: string, key: string, path = 'pitch'): Pitch {
  let m = /^([#bn]?)([1-7])([\^v]*)$/.exec(value);
  const info = keyInfo(key);
  if (m) {
    if (m[3].includes('^') && m[3].includes('v')) fail('PITCH', '八度标记不能混用 ^ 和 v', path);
    const degree = Number(m[2]);
    const octaveShift = [...m[3]].reduce((n, c) => n + (c === '^' ? 1 : -1), 0);
    if (Math.abs(octaveShift) > 3) fail('PITCH', '八度标记最多三个', path);
    const letters = 'CDEFGAB', tonicIndex = letters.indexOf(info.tonic[0]);
    const absolute = tonicIndex + degree - 1;
    const step = letters[absolute % 7], octave = 4 + Math.floor(absolute / 7) + octaveShift;
    const accidental = m[1] ? ({ '#': 1, b: -1, n: 0 }[m[1]]!) : undefined;
    const alter = (info.alters[step] ?? 0) + (accidental ?? 0);
    return { step, octave, alter, explicit: !!m[1], degree, octaveShift, accidental };
  }
  m = /^([A-G])([#bn]?)([0-8])$/.exec(value);
  if (!m) fail('PITCH', `无效音高 ${value}；使用 3、6v、1^、#4 或 C#4`, path);
  return { step: m[1], octave: Number(m[3]), alter: m[2] ? ({ '#': 1, b: -1, n: 0 }[m[2]]!) : 0, explicit: !!m[2] };
}
export function midiPitch(p: Pitch): number { return (p.octave + 1) * 12 + ({ C:0,D:2,E:4,F:5,G:7,A:9,B:11 }[p.step]!) + p.alter; }

function tokenize(input: string, path: string): string[] {
  const tokens = input.match(/\[[^\]]*\]\/[^\s]+|[^\s]+/g) ?? [];
  if (tokens.some(t => t.includes('|'))) fail('SYNTAX', '每个 bars 元素就是一个小节，无需写 |', path);
  return tokens;
}
function parseEvents(value: unknown, track: Track, key: string, path: string): Event[] {
  const values = typeof value === 'string' ? tokenize(value, path) : Array.isArray(value) ? value : fail('TYPE', 'notes 应为字符串或事件数组', path);
  let start = 0;
  return values.map((v: any, index: number) => {
    const at = `${path}[${index}]`;
    let pitch: string, d: Duration, opts: Obj = {};
    if (typeof v === 'string') {
      const m = /^(.+)\/((?:1|2|4|8|16|32|64)\.{0,2}(?:\*\d+:\d+)?)(~?)$/.exec(v);
      if (!m) fail('TOKEN', `无效音符 ${v}；请显式写时值，例如 3/8 或 C4/4`, at);
      pitch = m[1]; d = parseDuration(m[2], at); opts.tie = !!m[3];
    } else {
      opts = object(v, at);
      keys(opts, ['pitch','pitches','duration','rest','strings','drums','strum','lyric','tie','slur','dynamic','accent'], at);
      d = parseDuration(opts.duration, `${at}.duration`);
      const choices = ['pitch','pitches','rest','strings','drums','strum'].filter(k => opts[k] !== undefined);
      if (choices.length !== 1 || (choices[0] === 'rest' && opts.rest !== true)) fail('EVENT', '事件必须且只能包含一种内容：pitch、pitches、rest: true、strings、drums 或 strum', at);
      for(const field of ['pitches','drums'])if(opts[field]!==undefined&&(!Array.isArray(opts[field])||opts[field].length===0))fail('EVENT',`${field} 需要非空数组`,at);
      if(opts.strum!==undefined&&!['down','up','mute'].includes(opts.strum))fail('EVENT','strum 应为 down、up 或 mute',at);
      for(const field of ['tie','accent'])if(opts[field]!==undefined&&typeof opts[field]!=='boolean')fail('TYPE',`${field} 需要布尔值`,at);
      if(opts.lyric!==undefined&&typeof opts.lyric!=='string')fail('LYRICS','lyric 需要字符串',at);
      pitch = opts.rest ? 'r' : opts.strum ? String(opts.strum) : opts.pitch !== undefined ? String(opts.pitch) : opts.pitches ? `[${opts.pitches.join(',')}]` : opts.drums ? `[${opts.drums.join(',')}]` : `[${Object.entries(object(opts.strings, at)).map(([s,f]) => `${s}:${f}`).join(',')}]`;
    }
    if (opts.slur !== undefined && !['start','stop'].includes(opts.slur)) fail('SLUR', 'slur 应为 start 或 stop', at);
    if (opts.dynamic !== undefined && !['ppp','pp','p','mp','mf','f','ff','fff','sfz'].includes(opts.dynamic)) fail('DYNAMIC', '无效力度标记', at);
    const event: Event = { ...d, start, kind: 'note', pitches: [], tab: [], drums: [], line: at, tie: !!opts.tie, slur: opts.slur, lyric: opts.lyric == null ? undefined : String(opts.lyric), dynamic: opts.dynamic, accent: !!opts.accent };
    if (pitch === 'r' || pitch === '0') event.kind = 'rest';
    else if (track.type === 'tab' && ['down','up','mute'].includes(pitch)) {
      if (track.mode !== 'strum') fail('TAB_MODE', '扫弦事件需要 mode: strum', at);
      event.kind = 'strum'; event.direction = pitch as any;
    } else {
      const members = pitch.startsWith('[') && pitch.endsWith(']') ? pitch.slice(1,-1).split(',').map(s => s.trim()) : [pitch];
      if (members.length === 0 || members.some(p => !p)) fail('EVENT', '和弦不能为空', at);
      if (track.type === 'tab') {
        if (track.mode === 'strum') fail('TAB_MODE', '扫弦声部使用 down、up、mute 或 r', at);
        event.tab = members.map(p => {
          const m = /^([1-6]):(x|\d{1,2})$/.exec(p);
          if (!m || (m[2] !== 'x' && Number(m[2]) > 36)) fail('TAB', '吉他使用 弦:品，例如 6:0/8 或 [2:1,1:0]/4', at);
          return { string: Number(m[1]), fret: m[2] === 'x' ? 'x' as const : Number(m[2]) };
        });
        if (new Set(event.tab.map(n => n.string)).size !== event.tab.length) fail('TAB', '同一事件不能重复使用一根弦', at);
        event.pitches = event.tab.filter(n => n.fret !== 'x').map(n => {
          const open = parsePitch(track.tuning[n.string - 1], 'C', at);
          const midi = midiPitch(open) + Number(n.fret);
          const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
          return parsePitch(`${names[midi % 12]}${Math.floor(midi / 12) - 1}`, 'C', at);
        });
      } else if (track.type === 'drums') {
        for (const p of members) if (!DRUMS[p]) fail('DRUM', `未知鼓件 ${p}；可用 ${Object.keys(DRUMS).join(', ')}`, at);
        event.drums = members;
      } else {
        event.pitches = members.map(p => parsePitch(p, key, at));
        if (track.type === 'numbered' && event.pitches.some(p => p.degree === undefined)) fail('PITCH', '简谱声部使用 1–7 音级；五线谱声部使用 C4 等绝对音高', at);
      }
    }
    if (event.kind === 'rest' && (event.tie || event.slur)) fail('REST', '休止符不能连接延音线或连音线', at);
    start += event.ticks;
    return event;
  });
}
function attachLyrics(events: Event[], value: any, path: string) {
  if (value == null) return;
  if(Array.isArray(value)&&value.some(v=>typeof v!=='string'))fail('LYRICS','歌词数组每个元素必须是字符串',path);
  const lyrics = Array.isArray(value) ? value : typeof value === 'string' ? value.trim().split(/\s+/) : fail('LYRICS', '歌词应为数组或空格分隔字符串；每个音符一个元素', path);
  if (lyrics.length !== events.length) fail('LYRIC_COUNT', `歌词 ${lyrics.length} 个，事件 ${events.length} 个；休止与延音也用 _ 占位`, path);
  events.forEach((e,i) => { e.lyric = lyrics[i]; });
}
function voice(value: any, track: Track, key: string, staff: Voice['staff'], id: string, path: string): Voice {
  const v = typeof value === 'string' || Array.isArray(value) ? { notes: value } : object(value, path);
  keys(v, ['notes','lyrics','id','staff'], path);
  const events = parseEvents(v.notes, track, key, `${path}.notes`);
  attachLyrics(events, v.lyrics, `${path}.lyrics`);
  const target = v.staff ?? staff;
  if (!['main','right','left'].includes(target) || (track.type !== 'piano' && target !== 'main')) fail('STAFF', '只有钢琴声部可以指定 right / left', path);
  return { id: v.id == null ? id : String(v.id), staff: target, events };
}
function trackBar(value: any, track: Track, key: string, ticks: number, path: string): TrackBar {
  if (value == null) {
    const rest = (staff: Voice['staff'], id: string): Voice => ({ id, staff, events: [{ ...parseDuration(1), ticks, start:0, kind:'rest', pitches:[], tab:[], drums:[], line:path }] });
    return { voices: track.type === 'piano' ? [rest('right','1'), rest('left','2')] : [rest('main','1')] };
  }
  if (typeof value === 'object' && !Array.isArray(value) && 'voices' in value) {
    keys(value, ['voices'], path);
    if (!Array.isArray(value.voices) || !value.voices.length) fail('VOICES', 'voices 必须是非空数组', path);
    return { voices: value.voices.map((v:any,i:number) => voice(v, track, key, track.type === 'piano' ? 'right' : 'main', String(i+1), `${path}.voices[${i}]`)) };
  }
  if (track.type === 'piano') {
    const v = object(value, path); keys(v, ['right','left'], path);
    const result = trackBar(null, track, key, ticks, path);
    if (v.right != null) result.voices[0] = voice(v.right, track, key, 'right','1', `${path}.right`);
    if (v.left != null) result.voices[1] = voice(v.left, track, key, 'left','2', `${path}.left`);
    return result;
  }
  return { voices: [voice(value, track, key, 'main','1',path)] };
}
function beat(value: any, meter: [number,number], ticks: number, path: string) {
  const n = num(value ?? 1, 1, 100, path);
  const at = (n - 1) * PPQ * 4 / meter[1];
  if (!Number.isInteger(at) || at >= ticks) fail('BEAT', 'beat 从 1 开始，单位为当前拍号的分母音符，必须位于小节内', path);
  return at;
}
export function parseScore(source: string): Score {
  if (source.length > 5_000_000) fail('SIZE', '谱面文本不能超过 5 MB', '$');
  const doc = parseDocument(source, { uniqueKeys: true, schema: 'core' });
  if (doc.errors.length) fail('YAML', doc.errors.map(e => e.message).join('\n'), '$');
  let raw: Obj;
  try { raw = object(doc.toJS({ maxAliasCount: 100 }), '$'); }
  catch(e) { if (e instanceof ScoreError) throw e; fail('YAML', String(e), '$'); }
  keys(raw, ['version','title','subtitle','artist','composer','lyricist','arranger','key','meter','tempo','capo','fingering','note','tracks','bars','patterns','layout','chordShapes'], '$');
  if (raw.version !== 1) fail('VERSION', '必须指定 version: 1', 'version');
  if (!raw.title || typeof raw.title !== 'string') fail('TITLE', '必须提供 title 字符串', 'title');
  for(const field of ['subtitle','artist','composer','lyricist','arranger','key','fingering','note'])if(raw[field]!==undefined&&typeof raw[field]!=='string')fail('TYPE','需要字符串',field);
  const trackRaw = object(raw.tracks, 'tracks');
  const tracks: Track[] = Object.entries(trackRaw).map(([id,value]) => {
    if (!/^[a-zA-Z][\w-]*$/.test(id)) fail('TRACK_ID', '声部 ID 使用英文字母、数字、下划线与连字符', `tracks.${id}`);
    if(['use','meter','key','tempo','tempoChanges','ramp','section','expression','break','pageBreak','repeatStart','repeatEnd','final','pickup','chords'].includes(id))fail('TRACK_ID','声部 ID 不能与小节控制字段重名',`tracks.${id}`);
    const v = typeof value === 'string' ? { type:value } : object(value, `tracks.${id}`);
    keys(v, ['type','name','mode','clef','tuning','lyrics','showName'], `tracks.${id}`);
    if (!['numbered','tab','piano','staff','drums'].includes(v.type)) fail('TRACK_TYPE', 'type 使用 numbered、tab、piano、staff 或 drums', `tracks.${id}.type`);
    if (v.mode && !['frets','cross','strum'].includes(v.mode)) fail('TAB_MODE', 'mode 使用 frets、cross 或 strum', `tracks.${id}.mode`);
    if (v.clef && !['treble','bass'].includes(v.clef)) fail('CLEF', 'clef 使用 treble 或 bass', `tracks.${id}.clef`);
    if(v.name!==undefined&&typeof v.name!=='string')fail('TYPE','name 需要字符串',`tracks.${id}.name`);
    for(const field of ['lyrics','showName'])if(v[field]!==undefined&&typeof v[field]!=='boolean')fail('TYPE',`${field} 需要布尔值`,`tracks.${id}.${field}`);
    const tuning = v.tuning ?? ['E4','B3','G3','D3','A2','E2'];
    if (!Array.isArray(tuning) || tuning.length !== 6) fail('TUNING', 'tuning 必须有六个音，按 1 弦到 6 弦排列', `tracks.${id}.tuning`);
    tuning.forEach((s:any) => parsePitch(String(s),'C',`tracks.${id}.tuning`));
    return { id, type:v.type, name:v.name ?? id, mode:v.mode ?? 'frets', clef:v.clef ?? 'treble', tuning, lyrics:v.lyrics ?? v.type === 'numbered', showName:!!v.showName };
  });
  if (!tracks.length || tracks.length > 32) fail('TRACKS', '需要 1–32 个声部', 'tracks');
  const layout = { ...DEFAULT_LAYOUT, ...raw.layout };
  if (raw.layout) keys(object(raw.layout,'layout'), Object.keys(DEFAULT_LAYOUT), 'layout');
  num(layout.width,400,3000,'layout.width'); num(layout.height,400,6000,'layout.height');
  num(layout.margin,20,150,'layout.margin'); num(layout.barsPerSystem,1,16,'layout.barsPerSystem',true);
  num(layout.noteSize,16,48,'layout.noteSize'); num(layout.lyricSize,12,40,'layout.lyricSize'); num(layout.titleSize,20,72,'layout.titleSize'); num(layout.systemGap,15,150,'layout.systemGap');
  for (const k of ['showBarNumbers','showTrackNames','chordDiagrams','justifyLast'] as const) if (typeof layout[k] !== 'boolean') fail('TYPE','需要布尔值',`layout.${k}`);
  if(!['serif','sans'].includes(layout.lyricFont))fail('TYPE','lyricFont 应为 serif 或 sans','layout.lyricFont');
  const score: Score = {
    version:1, title:raw.title, subtitle:raw.subtitle ?? '', artist:raw.artist ?? '', composer:raw.composer ?? '', lyricist:raw.lyricist ?? '', arranger:raw.arranger ?? '',
    key:raw.key ?? 'C', meter:parseMeter(raw.meter ?? '4/4'), tempo:tempo(raw.tempo ?? 100,'tempo'), capo:raw.capo == null ? 0 : num(raw.capo,0,24,'capo',true), fingering:raw.fingering, note:raw.note ?? '',
    tracks, bars:[], layout, chordShapes: Object.assign(Object.create(null),CHORD_SHAPES),
  };
  keyInfo(score.key);
  if (raw.chordShapes) for (const [name,shape] of Object.entries(object(raw.chordShapes,'chordShapes'))) score.chordShapes[name] = checkShape(shape, `chordShapes.${name}`);
  if (!Array.isArray(raw.bars) || !raw.bars.length || raw.bars.length > 10000) fail('BARS', 'bars 必须是 1–10000 小节的数组', 'bars');
  const patterns = raw.patterns ? object(raw.patterns,'patterns') : {};
  let meter = score.meter, key = score.key;
  const expanded:Obj[]=[];
  const diagnostics: Diagnostic[] = [];
  raw.bars.forEach((entry:any,index:number) => {
    const path = `bars[${index}]`; let v = object(entry,path);
    if (v.use) {
      if (typeof v.use !== 'string' || !patterns[v.use]) fail('PATTERN', `未定义 pattern ${v.use}`, path);
      const pattern = object(patterns[v.use],`patterns.${v.use}`);
      if ('use' in pattern) fail('PATTERN', 'pattern 不能嵌套 use', path);
      v = { ...pattern, ...v };
    }
    keys(v, ['use','meter','key','tempo','tempoChanges','ramp','section','expression','break','pageBreak','repeatStart','repeatEnd','final','pickup','chords',...tracks.map(t=>t.id)], path);
    expanded.push(v);
    for(const field of ['break','pageBreak','repeatStart','repeatEnd','final'])if(v[field]!==undefined&&typeof v[field]!=='boolean')fail('TYPE',`${field} 需要布尔值`,`${path}.${field}`);
    for(const field of ['section','expression'])if(v[field]!==undefined&&typeof v[field]!=='string')fail('TYPE',`${field} 需要字符串`,`${path}.${field}`);
    const nextMeter = v.meter == null ? meter : parseMeter(v.meter,`${path}.meter`);
    const nextKey = v.key ?? key; keyInfo(nextKey);
    const ticks = v.pickup == null ? nextMeter[0] * PPQ * 4 / nextMeter[1] : parseDuration(v.pickup,`${path}.pickup`).ticks;
    if (ticks > nextMeter[0] * PPQ * 4 / nextMeter[1]) fail('PICKUP','弱起时值不能超过当前小节',path);
    const b: Bar = { index, meter:nextMeter, key:nextKey, ticks, meterChanged:index > 0 && nextMeter.join() !== meter.join(), keyChanged:index > 0 && nextKey !== key,
      tempo:v.tempo == null ? undefined : tempo(v.tempo,`${path}.tempo`), changes:[], section:v.section, expression:v.expression, breakBefore:!!v.break, pageBreak:!!v.pageBreak,
      repeatStart:!!v.repeatStart, repeatEnd:!!v.repeatEnd, final:!!v.final || index === raw.bars.length-1, chords:[], tracks:{} };
    meter = nextMeter; key = nextKey;
    if (v.tempoChanges) {
      if (!Array.isArray(v.tempoChanges)) fail('TEMPO','tempoChanges 应为数组',path);
      b.changes = v.tempoChanges.map((c:any,i:number) => { const p = `${path}.tempoChanges[${i}]`; keys(object(c,p),['beat','bpm','unit','text'],p); return { at:beat(c.beat,meter,ticks,p), tempo:tempo({bpm:c.bpm,unit:c.unit,text:c.text},p), visible:true }; });
    }
    if (v.chords != null) {
      const entries = typeof v.chords === 'string' ? [v.chords] : Array.isArray(v.chords) ? v.chords : fail('CHORD','chords 应为和弦名或数组',path);
      b.chords = entries.map((c:any,i:number) => {
        if (typeof c === 'string') { if (i > 0) fail('CHORD','多个和弦请用 {name: C, beat: 1} 显式指定位置',path); return {name:c,at:0}; }
        const p = `${path}.chords[${i}]`; keys(object(c,p),['name','beat','diagram','baseFret'],p);
        if (typeof c.name !== 'string' || !c.name.trim()) fail('CHORD','需要 name',p);
        return {name:c.name,at:beat(c.beat,meter,ticks,p), diagram:c.diagram ? checkShape(c.diagram,p) : undefined, baseFret:c.baseFret == null ? undefined : num(c.baseFret,1,24,p,true)};
      });
      b.chords.sort((a,b)=>a.at-b.at);
      for(const c of b.chords){
        const shape=c.diagram??score.chordShapes[c.name];
        if(shape&&c.baseFret&&shape.some(f=>f!=='x'&&f>0&&(f<c.baseFret!||f>=c.baseFret!+4)))fail('CHORD_SHAPE','baseFret 指定的四品范围未覆盖所有按弦位置',`${path}.chords`);
      }
    }
    for (const track of tracks) {
      const tb = trackBar(v[track.id],track,key,ticks,`${path}.${track.id}`); b.tracks[track.id] = tb;
      if (new Set(tb.voices.map(v=>v.id)).size !== tb.voices.length) fail('VOICE_ID','同一声部内 voice id 不能重复',path);
      for (const voice of tb.voices) {
        const actual = voice.events.reduce((n,e)=>n+e.ticks,0);
        if (actual !== ticks) diagnostics.push({code:'BAR_DURATION',path:`${path}.${track.id}.${voice.id}`,message:`时值合计 ${actual / PPQ} 个四分音符；应为 ${ticks / PPQ}（${meter.join('/')}）`});
      }
    }
    score.bars.push(b);
  });
  if (diagnostics.length) throw new ScoreError(diagnostics);
  applyRamps(score,expanded);
  validateConnections(score);
  return score;
}
function checkShape(shape: any, path: string): (number|'x')[] {
  if (!Array.isArray(shape) || shape.length !== 6 || shape.some(n => n !== 'x' && (!Number.isInteger(n) || n < 0 || n > 36))) fail('CHORD_SHAPE', '和弦图需要六个品位，按 6 弦至 1 弦排列；静音用 x', path);
  const frets=shape.filter((n):n is number=>typeof n==='number'&&n>0);
  if(frets.length&&Math.max(...frets)>4&&Math.max(...frets)-Math.min(...frets)>3)fail('CHORD_SHAPE','此指法超过四品网格范围；请使用可在连续四品中表示的指法',path);
  return shape;
}
function applyRamps(score: Score, raw: Obj[]) {
  let current = score.tempo, activeEnd = -1;
  for (let i=0; i<score.bars.length; i++) {
    const bar = score.bars[i];
    if (bar.tempo) current = bar.tempo;
    const ramp = raw[i].ramp;
    if (ramp) {
      const p = `bars[${i}].ramp`; keys(object(ramp,p),['to','bars','text'],p);
      const count = num(ramp.bars ?? 1,1,100,p,true), to = num(ramp.to,10,400,p);
      if (i < activeEnd || i+count > score.bars.length) fail('RAMP','渐变不能重叠或超出乐曲范围',p);
      const span = score.bars.slice(i,i+count), total = span.reduce((n,b)=>n+b.ticks,0), from = current;
      if (span.some(b=>b.changes.length || (b.index !== i && b.tempo))) fail('RAMP','渐变范围内不能另设 tempo 或 tempoChanges',p);
      let elapsed = 0;
      bar.expression = [bar.expression, ramp.text ?? (to > from.bpm ? 'accel.' : 'rit.')].filter(Boolean).join(' · ');
      for (const b of span) {
        for (let at=0; at<b.ticks; at+=PPQ/2) b.changes.push({at, tempo:{ bpm:from.bpm+(to-from.bpm)*(elapsed+at)/total, unit:from.unit },visible:false});
        elapsed += b.ticks;
      }
      if (score.bars[i+count] && !score.bars[i+count].tempo) score.bars[i+count].tempo = {bpm:to, unit:from.unit};
      activeEnd = i+count;
    }
    bar.changes.sort((a,b)=>a.at-b.at);
    if (bar.changes.length) current = bar.changes.at(-1)!.tempo;
  }
}
function validateConnections(score: Score) {
  for (const track of score.tracks) {
    const streams = new Map<string, Event[]>();
    for (const b of score.bars) for (const v of b.tracks[track.id].voices) { const id = v.staff+':'+v.id; streams.set(id,[...(streams.get(id) ?? []),...v.events]); }
    for (const events of streams.values()) {
      let slur: Event | undefined;
      events.forEach((e,i) => {
        if (e.tie) {
          const next = events[i+1];
          const signature = (v:Event) => JSON.stringify([v.kind,v.pitches.map(midiPitch).sort((a,b)=>a-b),v.tab,v.drums]);
          if (!next || signature(e) !== signature(next) || e.kind !== 'note') fail('TIE','延音线 ~ 后须紧接相同音高（可跨小节）',e.line);
          next.tieEnd = true;
        }
        if (e.slur === 'start') { if (slur) fail('SLUR','不支持嵌套连音线',e.line); slur = e; }
        if (e.slur === 'stop') { if (!slur) fail('SLUR','连音线缺少 start',e.line); slur = undefined; }
      });
      if (slur) fail('SLUR','连音线缺少 stop',slur.line);
    }
  }
}
