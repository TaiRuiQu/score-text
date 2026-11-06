declare module 'fontkit' { export function openSync(path: string, postscriptName?: string): any; }
declare module 'svg-to-pdfkit' { const draw: (doc: any, svg: string, x: number, y: number, options?: any) => void; export default draw; }
