import {readFile,mkdir} from 'node:fs/promises';
import {parseScore,exportScore} from '../src/index.js';
await mkdir('output',{recursive:true});
for(const name of ['reference-pop','strum-pop','ensemble','ode-to-joy']) {
  const score=parseScore(await readFile(`examples/${name}.score.yaml`,'utf8'));
  for(const ext of ['svg','png','pdf','html','mid','musicxml']) {
    const result=await exportScore(score,`output/${name}.${ext}`);
    console.log(result.files.join(', '));
  }
}
