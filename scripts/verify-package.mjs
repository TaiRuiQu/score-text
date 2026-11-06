import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';

const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run this check with npm run smoke:package');
const root=process.cwd();
const scratch=await mkdtemp(join(tmpdir(),'score-text-package-'));
function run(args,cwd=scratch) {
  const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:180000,env:process.env});
  assert.equal(result.status,0,result.stderr||result.stdout||String(result.error));
  return result.stdout;
}
try {
  const [pack]=JSON.parse(run([npmCli,'pack','--ignore-scripts','--json','--pack-destination',scratch],root));
  assert.ok(pack.files.some(f=>f.path==='assets/fonts/Bravura.otf'));
  assert.ok(pack.files.some(f=>f.path==='schema/score-text.schema.json'));
  assert.ok(pack.files.some(f=>f.path==='examples/ode-to-joy.score.yaml'));
  assert.ok(!pack.files.some(f=>f.path.startsWith('tmp/')||f.path.includes('.npmrc')));
  await writeFile(join(scratch,'package.json'),'{"private":true,"type":"module"}\n');
  run([npmCli,'install','--omit=dev','--no-audit','--no-fund',join(scratch,pack.filename)]);
  const cli=join(scratch,'node_modules','score-text','dist','cli.js');
  assert.equal(run([cli,'--version']).trim(),pack.version);
  run([cli,'init','song.score.yaml','--template','ensemble']);
  const validation=JSON.parse(run([cli,'validate','song.score.yaml','--json']));
  assert.equal(validation.ok,true);
  assert.equal(validation.tracks,4);
  for(const ext of ['pdf','png','mid','musicxml']) {
    const result=JSON.parse(run([cli,'render','song.score.yaml','-o',`song.${ext}`,'--json']));
    assert.equal(result.ok,true);
    for(const file of result.files)assert.ok((await readFile(file)).length>100);
  }
  assert.equal(JSON.parse(run([cli,'schema'])).title,'Score Text v1');
  assert.ok(run([cli,'guide']).includes('Score Text v1'));
  const api=JSON.parse(run(['--input-type=module','-e',`import {parseScore,renderScore} from 'score-text'; const s=parseScore('version: 1\\ntitle: API\\ntracks: {vocal: numbered}\\nbars:\\n  - vocal: "1/1"'.replaceAll('\\\\n','\\n')); console.log(JSON.stringify({title:s.title,pages:renderScore(s).pages.length}));`]));
  assert.equal(api.pages,1);
  console.log(`Packed ${pack.name}@${pack.version}: clean production install, CLI, bundled fonts, API and exports passed.`);
}finally {
  // Only remove the exact temporary directory created by mkdtemp above.
  const target=await realpath(scratch),parent=await realpath(tmpdir());
  const child=relative(parent,target);
  assert.ok(child&&!child.startsWith('..')&&!isAbsolute(child)&&child.startsWith('score-text-package-'));
  await rm(target,{recursive:true,force:true});
}
