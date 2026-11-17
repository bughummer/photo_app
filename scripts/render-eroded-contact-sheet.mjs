import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=process.argv[2], output=process.argv[3] || '/tmp/eroded-contact-sheet.png';
if(!input)throw Error('Usage: node scripts/render-eroded-contact-sheet.mjs <reference.jpg> [output.png]');
const jpeg=readFileSync(input).toString('base64');
const port=45000+process.pid%10000;
const server=spawn(process.execPath,['server.cjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${port}/`)).ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}/`);
 const data=await page.evaluate(async encoded=>{
  const { ErodedRenderer }=await import('./eroded/renderer.mjs');
  const { DEFAULT_PARAMS }=await import('./eroded/parameters.mjs');
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
  const source=new OffscreenCanvas(320,320),ctx=source.getContext('2d');
  ctx.drawImage(bitmap,960,0,320,320,0,0,320,320);bitmap.close();
  const frame=new OffscreenCanvas(320,320),renderer=new ErodedRenderer(frame,320,320);
  const sheet=document.createElement('canvas');sheet.width=1280;sheet.height=704;
  const out=sheet.getContext('2d');out.fillStyle='#e3e1dd';out.fillRect(0,0,sheet.width,sheet.height);
  const times=[0,.7,1.4,2.1,2.8,3.5,4.2,4.76];
  for(let i=0;i<times.length;i++){
    renderer.render(source,times[i],DEFAULT_PARAMS);
    out.drawImage(frame,(i%4)*320,Math.floor(i/4)*352,320,320);
    out.fillStyle='#222';out.font='16px sans-serif';out.fillText(`${times[i].toFixed(2)}s`,(i%4)*320+8,Math.floor(i/4)*352+342);
  }
  renderer.dispose();source.width=source.height=frame.width=frame.height=0;
  return sheet.toDataURL('image/png').split(',')[1];
 },jpeg);
 writeFileSync(output,Buffer.from(data,'base64'));console.log(output);
}finally{await browser?.close();server.kill()}
