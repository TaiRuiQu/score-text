import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import tone from '@tonejs/midi';
import {XMLValidator,XMLParser} from 'fast-xml-parser';
import Ajv from 'ajv';
import {parse} from 'yaml';
import {parseScore,parseDuration,parsePitch,midiPitch,ScoreError,PPQ,renderScore,toMidi,toMusicXml,exportScore,html} from '../src/index.js';
const {Midi}=tone;

const minimal=(notes:string,extra='',meter='4/4')=>`version: 1\ntitle: Test\nmeter: ${meter}\ntracks:\n  vocal: numbered\nbars:\n  - vocal: "${notes}"\n${extra}`;
const error=(source:string,code:string)=>assert.throws(()=>parseScore(source),(e:unknown)=>e instanceof ScoreError&&e.diagnostics.some(d=>d.code===code));
test('dotted durations, tuplets and compound meter use exact integer time',()=>{
  assert.equal(parseDuration('4.').ticks,PPQ*1.5);
  assert.equal(parseDuration('8*3:2').ticks*3,PPQ);
  assert.equal(parseDuration('16*7:4').ticks*7,PPQ);
  const score=parseScore(minimal('1/8 2/8 3/8 4/4.','','6/8'));
  assert.equal(score.bars[0].ticks,PPQ*3);
  error(minimal('1/4 2/4'),'BAR_DURATION');
  error(minimal('1/7'),'TOKEN');
});
test('numbered accidentals transpose relative to key; octave and minor convention are deterministic',()=>{
  assert.equal(midiPitch(parsePitch('1','E')),64);
  assert.equal(midiPitch(parsePitch('1^','E')),76);
  assert.equal(midiPitch(parsePitch('6v','Am')),57);
  assert.equal(midiPitch(parsePitch('#4','F')),71); // Bb degree raised to B natural
  assert.equal(midiPitch(parsePitch('b7','G')),77); // F#5 degree lowered to F5 natural
  assert.equal(midiPitch(parsePitch('F4','G')),65); // Absolute pitches remain absolute
});
test('diagnostics reject misspellings, duplicate keys, invalid tracks and broken lyric alignment',()=>{
  error(minimal('1/1').replace('vocal: numbered','vocal: {type: numberd}'),'TRACK_TYPE');
  error(minimal('1/1').replace('version: 1','version: 1\nversion: 1'),'YAML');
  error(minimal('1/1').replace('title: Test','title: Test\ntemop: 80'),'UNKNOWN_FIELD');
  error(minimal('1/1').replace('vocal: "1/1"','vocal: {notes: "1/1", lyrics: [a, b]}'),'LYRIC_COUNT');
  error(minimal('1/1').replace('vocal: numbered','meter: numbered'),'TRACK_ID');
  error(minimal('1/1').replace('vocal: "1/1"','vocal: {notes: [{pitch: 1, duration: 1, tie: "false"}]}'),'TYPE');
  assert.doesNotThrow(()=>renderScore(parseScore(minimal('1/1').replace('vocal: "1/1"','chords: constructor\n    vocal: "1/1"'))));
});
test('guitar MIDI uses chord voicings and capo for strums and cross-head patterns',()=>{
  const s=parseScore('version: 1\ntitle: Guitar\ncapo: 2\ntracks: {guitar: {type: tab, mode: strum}}\nbars:\n  - chords: C\n    guitar: "down/1"');
  const midi=new Midi(toMidi(s));
  assert.deepEqual(midi.tracks[0].notes.map(n=>n.midi).sort((a,b)=>a-b),[50,54,57,62,66]);
  const cross=parseScore('version: 1\ntitle: Guitar\ncapo: 2\ntracks: {guitar: {type: tab, mode: cross}}\nbars:\n  - chords: C\n    guitar: "5:0/1"');
  assert.equal(new Midi(toMidi(cross)).tracks[0].notes[0].midi,50);
});
test('ties can cross measures; malformed and unmatched connections fail',()=>{
  const score=parseScore(minimal('3/1~','  - vocal: "3/1"'));
  assert.equal(score.bars[1].tracks.vocal.voices[0].events[0].tieEnd,true);
  error(minimal('3/1~','  - vocal: "4/1"'),'TIE');
  error(minimal('3/1~'),'TIE');
  error(minimal('3/1').replace('vocal: "3/1"','vocal: {notes: [{pitch: 3, duration: 1, slur: start}]}'),'SLUR');
});
test('explicit voices are independently checked; omitted tracks become exact full-measure rests',()=>{
  const score=parseScore('version: 1\ntitle: Duo\nmeter: 6/8\ntracks: {vocal: numbered, piano: piano, drums: drums}\nbars:\n  - vocal: {voices: [{id: lead, notes: "1/4. 2/4."}, {id: harmony, notes: "3/2."}]}');
  for(const t of ['piano','drums'])for(const v of score.bars[0].tracks[t].voices)assert.equal(v.events[0].ticks,PPQ*3);
  assert.equal(score.bars[0].tracks.vocal.voices.length,2);
  const rendered=renderScore(score);assert.equal(rendered.pages.length,1);
});
test('meter changes and tempo ramps are preserved in independently decoded MIDI',()=>{
  const source='version: 1\ntitle: Change\ntempo: 120\ntracks: {vocal: numbered}\nbars:\n  - vocal: "1/1"\n    ramp: {to: 60, bars: 1}\n  - meter: 6/8\n    tempo: {bpm: 72, unit: "4."}\n    vocal: "2/4. 3/4."';
  const s=parseScore(source),midi=new Midi(toMidi(s));
  assert.ok(midi.header.tempos.length>=9);
  assert.ok(midi.header.tempos.some(t=>Math.abs(t.bpm-108)<.01));
  assert.deepEqual(midi.header.timeSignatures.map(t=>t.timeSignature),[[4,4],[6,8]]);
  assert.equal(midi.tracks[0].notes.length,3);
  assert.equal(midi.tracks[0].notes[0].durationTicks,PPQ*4);
  assert.equal(midi.tracks[0].notes[1].ticks,PPQ*4);
  const tied=new Midi(toMidi(parseScore(minimal('1/1~','  - vocal: "1/1"'))));
  assert.equal(tied.tracks[0].notes.length,1);
  assert.equal(tied.tracks[0].notes[0].durationTicks,PPQ*8);
});
test('JSON schema validates all shipped examples; every format exports actual content',async()=>{
  const schema=JSON.parse(await readFile('schema/score-text.schema.json','utf8'));
  const ajv=new Ajv({strict:false}),validate=ajv.compile(schema);
  const directory=await mkdtemp(join(tmpdir(),'score-text-test-'));
  try {
    for(const name of ['reference-pop','strum-pop','ensemble','ode-to-joy']) {
      const source=await readFile(`examples/${name}.score.yaml`,'utf8');
      assert.ok(validate(parse(source)),JSON.stringify(validate.errors));
      const s=parseScore(source),r=renderScore(s);
      assert.ok(r.pages[0].includes('<path id='));
      assert.ok(!r.pages[0].includes('<text '),'Fonts should be outlined for portable output');
      assert.ok(!r.pages.join('').includes('NaN'));
      const midi=new Midi(toMidi(s));assert.ok(midi.tracks.length>=1);
      const xml=toMusicXml(s);assert.equal(XMLValidator.validate(xml),true);
      const parsed=new XMLParser().parse(xml);assert.ok(parsed['score-partwise']['part-list']);
      const formats=name==='reference-pop'?['svg','png','pdf','html','json','mid','musicxml']:['pdf'];
      for(const ext of formats) {
        const output=await exportScore(s,join(directory,`${name}.${ext}`));
        assert.ok(output.files.length>0);
        const buffer=await readFile(output.files[0]);
        if(ext==='pdf')assert.equal(buffer.subarray(0,5).toString(),'%PDF-');
        if(ext==='png')assert.equal(buffer.subarray(1,4).toString(),'PNG');
        assert.ok(buffer.length>100);
      }
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('layout shares beat coordinates, respects manual page breaks and detects impossible widths',()=>{
  const s=parseScore(minimal('1/4 2/4 3/4 4/4','  - pageBreak: true\n    vocal: "5/1"'));
  const r=renderScore(s);assert.equal(r.pages.length,2);
  assert.ok(html(r,s).includes('id="p0-score-title"'));
  assert.ok(html(r,s).includes('id="p1-score-title"'));
  for(const p of r.layout.pages)for(const sys of p.systems)for(const m of sys.measures){
    const coords=m.slots.map(t=>m.at(t.at));for(let i=1;i<coords.length;i++)assert.ok(coords[i]>coords[i-1]);
    assert.ok(coords.at(-1)!<m.x+m.width);
  }
  const overflow=parseScore(minimal('1/1').replace('vocal: "1/1"',`vocal: {notes: "1/1", lyrics: [${'long'.repeat(100)}]}`));
  assert.throws(()=>renderScore(overflow),(e:unknown)=>e instanceof ScoreError&&e.diagnostics[0].code==='LAYOUT_OVERFLOW');
});
test('CLI supports stdin and machine-readable success and error exit codes',()=>{
  const success=spawnSync(process.execPath,['--import','tsx','src/cli.ts','validate','-','--json'],{input:minimal('1/1'),encoding:'utf8'});
  assert.equal(success.status,0,success.stderr);assert.equal(JSON.parse(success.stdout).ok,true);
  const failed=spawnSync(process.execPath,['--import','tsx','src/cli.ts','validate','-','--json'],{input:minimal('1/4'),encoding:'utf8'});
  assert.equal(failed.status,1);assert.equal(JSON.parse(failed.stderr).diagnostics[0].code,'BAR_DURATION');
});
