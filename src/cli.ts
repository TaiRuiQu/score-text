#!/usr/bin/env node
import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseScore } from './parser.js';
import { renderScore } from './render.js';
import { exportScore, type Format } from './export.js';
import { ScoreError } from './model.js';

const root=new URL('../',import.meta.url);
const packageInfo=JSON.parse(await readFile(new URL('package.json',root),'utf8')) as {version:string};
const program=new Command().name('score-text').description('纯文本多声部乐谱排版 / Agent-friendly score engraving').version(packageInfo.version);
async function input(file:string):Promise<string> {
  if(file!=='-')return readFile(file,'utf8');
  let text='';for await(const chunk of process.stdin){text+=chunk.toString();if(text.length>5_000_000)throw new Error('stdin 超过 5 MB');}return text;
}
function ok(value:unknown,json:boolean) {process.stdout.write((json?JSON.stringify(value):typeof value==='string'?value:JSON.stringify(value,null,2))+'\n');}
program.command('render').description('排版并输出 PDF / SVG / PNG / HTML / MIDI / MusicXML')
  .argument('<input>','YAML 文件路径；- 表示 stdin').requiredOption('-o, --output <file>','输出路径，扩展名决定格式')
  .option('-f, --format <format>','显式格式').option('--scale <number>','PNG 像素倍率','1').option('--json','结构化结果，适合 agent')
  .action(async(file,options)=>{
    const score=parseScore(await input(file));
    const result=await exportScore(score,options.output,{format:options.format as Format,scale:Number(options.scale)});
    ok(options.json?{ok:true,...result,bars:score.bars.length,tracks:score.tracks.length}:`已输出 ${result.files.join(', ')}${result.pages?`（${result.pages} 页）`:''}`,!!options.json);
  });
program.command('validate').description('校验语法、拍号时值、歌词、延音线和页面容量')
  .argument('<input>').option('--json','结构化诊断').option('--syntax-only','仅校验语义，不进行版面容量检查')
  .action(async(file,options)=>{
    const score=parseScore(await input(file));
    const pages=options.syntaxOnly?undefined:renderScore(score).pages.length;
    ok(options.json?{ok:true,bars:score.bars.length,tracks:score.tracks.length,pages}:`校验通过：${score.bars.length} 小节，${score.tracks.length} 声部${pages?`，${pages} 页`:''}`,!!options.json);
  });
program.command('inspect').description('输出规范化 JSON，含整数 tick 时间轴')
  .argument('<input>').option('--json','机器可读 JSON')
  .action(async(file)=>ok(parseScore(await input(file)),true));
program.command('schema').description('输出 JSON Schema，适用于 YAML 编辑器和 agent')
  .action(async()=>{process.stdout.write(await readFile(new URL('schema/score-text.schema.json',root),'utf8'));});
program.command('guide').description('输出完整语法说明')
  .action(async()=>{process.stdout.write(await readFile(new URL('docs/notation.md',root),'utf8'));});
program.command('init').description('写入可运行示例；默认拒绝覆盖')
  .argument('[output]','目标 YAML 文件','song.score.yaml')
  .option('--template <name>','reference / strum / ensemble','reference').option('--force','覆盖已有文件')
  .action(async(file,options)=>{
    const names:Record<string,string>={reference:'reference-pop',strum:'strum-pop',ensemble:'ensemble'};
    if(!names[options.template])throw new Error('template 使用 reference、strum 或 ensemble');
    const dest=resolve(file);await mkdir(dirname(dest),{recursive:true});
    await writeFile(dest,await readFile(new URL(`examples/${names[options.template]}.score.yaml`,root),'utf8'),{flag:options.force?'w':'wx'});
    ok(`已创建 ${dest}`,false);
  });
program.showHelpAfterError();
try {await program.parseAsync();}
catch(e) {
  const diagnostics=e instanceof ScoreError?e.diagnostics:[{code:'IO_OR_EXPORT',path:'$',message:e instanceof Error?e.message:String(e)}];
  if(process.argv.includes('--json'))process.stderr.write(JSON.stringify({ok:false,diagnostics})+'\n');
  else process.stderr.write(diagnostics.map(d=>`[${d.code}] ${d.path}: ${d.message}`).join('\n')+'\n');
  process.exitCode=1;
}
