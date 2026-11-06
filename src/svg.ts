import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { openSync } from 'fontkit';

export const FONT_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
const fonts = new Map<string, any>();
function font(name: string) {
  if (!fonts.has(name)) fonts.set(name, openSync(join(FONT_DIR,name)));
  return fonts.get(name);
}
const xml = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const round = (n:number) => +n.toFixed(3);
export type FontRole = 'serif' | 'sans' | 'music';
function runs(text: string, role: FontRole): { font: any; text:string; key:string }[] {
  const groups: { font:any; text:string; key:string }[] = [];
  for (const char of text) {
    const key = role === 'music' ? 'Bravura.otf' : role === 'sans' || char.codePointAt(0)! > 0x2ff ? 'NotoSansCJKsc-Regular.otf' : 'NotoSerif-Regular.ttf';
    if (groups.at(-1)?.key === key) groups.at(-1)!.text += char;
    else groups.push({ font:font(key), text:char, key });
  }
  return groups;
}
export function textWidth(text: string, size: number, role: FontRole = 'serif'): number {
  return runs(text,role).reduce((n,r) => n+r.font.layout(r.text).positions.reduce((a:number,p:any)=>a+p.xAdvance,0)*size/r.font.unitsPerEm,0);
}
export class Svg {
  body: string[] = [];
  definitions = new Map<string,string>();
  constructor(public width: number, public height: number, public title: string) {}
  line(x1:number,y1:number,x2:number,y2:number,width=1) { this.body.push(`<path d="M${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}" fill="none" stroke="#111" stroke-width="${width}"/>`); }
  path(d:string, width=1, fill='none') { this.body.push(`<path d="${d}" fill="${fill}" stroke="${width ? '#111' : 'none'}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`); }
  circle(x:number,y:number,r:number,fill='#111') { this.body.push(`<circle cx="${round(x)}" cy="${round(y)}" r="${r}" fill="${fill}"/>`); }
  ellipse(x:number,y:number,rx:number,ry:number,fill='#111',rotate=0) { this.body.push(`<ellipse cx="${round(x)}" cy="${round(y)}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="#111" stroke-width="1.2" transform="rotate(${rotate} ${round(x)} ${round(y)})"/>`); }
  rect(x:number,y:number,w:number,h:number,fill='white') { this.body.push(`<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="${fill}"/>`); }
  text(text:string,x:number,y:number,size:number,role:FontRole='serif',anchor:'start'|'middle'|'end'='start') {
    if (!text) return;
    const width = textWidth(text,size,role);
    let cursor = x - (anchor === 'middle' ? width/2 : anchor === 'end' ? width : 0);
    this.body.push(`<g aria-label="${xml(text)}" role="img">`);
    for (const r of runs(text,role)) {
      const run = r.font.layout(r.text), scale = size/r.font.unitsPerEm;
      run.glyphs.forEach((g:any,i:number) => {
        const id = `g${r.key.replace(/[^a-z]/gi,'')}${g.id}`;
        if (!this.definitions.has(id)) this.definitions.set(id,`<path id="${id}" d="${g.path.toSVG()}"/>`);
        const p = run.positions[i];
        this.body.push(`<use href="#${id}" xlink:href="#${id}" transform="translate(${round(cursor+p.xOffset*scale)} ${round(y-p.yOffset*scale)}) scale(${round(scale)} ${round(-scale)})" fill="#111"/>`);
        cursor += p.xAdvance*scale;
      });
    }
    this.body.push('</g>');
  }
  music(code:number,x:number,y:number,size=40) { this.text(String.fromCodePoint(code),x,y,size,'music'); }
  group(attributes:string) { this.body.push(`<g ${attributes}>`); }
  endGroup() { this.body.push('</g>'); }
  toString() { return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" role="img" aria-labelledby="score-title"><title id="score-title">${xml(this.title)}</title><defs>${[...this.definitions.values()].join('')}</defs><rect width="100%" height="100%" fill="white"/>${this.body.join('')}</svg>`; }
}
