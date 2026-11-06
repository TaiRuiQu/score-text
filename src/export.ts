import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, basename } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { type Score } from './model.js';
import { renderScore, type RenderedScore } from './render.js';
import { toMidi } from './midi.js';
import { toMusicXml } from './musicxml.js';
export type Format='svg'|'png'|'pdf'|'html'|'json'|'midi'|'musicxml';
export function png(svg:string,scale=1):Buffer {
  if(!Number.isFinite(scale)||scale<.25||scale>4)throw new Error('scale 必须在 0.25–4 之间');
  return new Resvg(svg,{fitTo:{mode:'zoom',value:scale}}).render().asPng();
}
export async function pdf(rendered:RenderedScore,score:Score):Promise<Buffer> {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({autoFirstPage:false,info:{Title:score.title,Author:score.composer||score.artist,Creator:'score-text'},compress:true});
    const chunks:Buffer[]=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    try {
      rendered.pages.forEach((svg,i)=>{
        const p=rendered.layout.pages[i],factor=595.28/p.width;
        doc.addPage({size:[595.28,p.height*factor],margin:0});
        SVGtoPDF(doc,svg,0,0,{width:595.28,height:p.height*factor,assumePt:true,preserveAspectRatio:'xMinYMin meet'});
      });doc.end();
    }catch(e){reject(e);doc.destroy();}
  });
}
export function html(rendered:RenderedScore,score:Score):string {
  const title=score.title.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;background:#e9e7e4;color:#222;font:14px system-ui}header{position:sticky;top:0;background:#fff;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:1;border-bottom:1px solid #ccc}header strong{font-size:16px}button{border:1px solid #bbb;background:#fff;border-radius:4px;padding:7px 16px;cursor:pointer}main{max-width:${score.layout.width}px;margin:24px auto}article{background:white;margin:0 0 24px;box-shadow:0 2px 12px #0002}svg{width:100%;height:auto;display:block}@page{size:${score.layout.width}px ${score.layout.height}px;margin:0}@media print{body{background:white}header{display:none}main{margin:0;max-width:none}article{margin:0;box-shadow:none;break-after:page}article:last-child{break-after:auto}}</style></head><body><header><strong>${title}</strong><button onclick="window.print()">打印 / 保存 PDF</button></header><main>${rendered.pages.map((p,i)=>`<article aria-label="第 ${i+1} 页">${p.replace(/id="([^"]+)"/g,`id="p${i}-$1"`).replace(/href="#([^"]+)"/g,`href="#p${i}-$1"`).replace('aria-labelledby="score-title"',`aria-labelledby="p${i}-score-title"`)}</article>`).join('')}</main></body></html>`;
}
export async function exportScore(score:Score,output:string,options:{format?:Format;scale?:number}={}):Promise<{files:string[];pages:number}> {
  const ext=extname(output).slice(1).toLowerCase();
  const format=options.format??({mid:'midi',xml:'musicxml'}[ext] as Format|undefined)??ext as Format;
  if(!['svg','png','pdf','html','json','midi','musicxml'].includes(format))throw new Error('输出格式应为 svg、png、pdf、html、json、mid 或 musicxml');
  const target=resolve(output);await mkdir(dirname(target),{recursive:true});
  if(['json','midi','musicxml'].includes(format)) {
    const data=format==='json'?JSON.stringify(score,null,2):format==='midi'?toMidi(score):toMusicXml(score);
    await writeFile(target,data);return {files:[target],pages:0};
  }
  const rendered=renderScore(score),files:string[]=[];
  if(format==='pdf'||format==='html') {
    await writeFile(target,format==='pdf'?await pdf(rendered,score):html(rendered,score));files.push(target);
  }else for(let i=0;i<rendered.pages.length;i++){
    const file=rendered.pages.length===1?target:resolve(dirname(target),`${basename(target,extname(target))}-${i+1}${extname(target)}`);
    await writeFile(file,format==='png'?png(rendered.pages[i],options.scale??1):rendered.pages[i]);files.push(file);
  }
  return {files,pages:rendered.pages.length};
}
