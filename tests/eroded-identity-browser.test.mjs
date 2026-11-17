import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('Eroded Identity animates image, scrubs video, and exports with audio', { timeout: 120000 }, async () => {
  const port = 44000 + process.pid % 10000;
  const server = spawn(process.execPath,['server.cjs'],{ cwd:root, env:{ ...process.env,PORT:String(port) }, stdio:'ignore' });
  const work = mkdtempSync(path.join(tmpdir(),'eroded-identity-'));
  let browser;
  try {
    for (let i=0;i<50;i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await new Promise(resolve=>setTimeout(resolve,100)); }
    browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl'] });
    const page = await browser.newPage({ viewport:{width:1280,height:800},acceptDownloads:true });
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/still.png'));
    await page.locator('[data-brush="eroded"]').click();
    await page.waitForFunction(()=>document.querySelector('#erodedImageControls .fracture-status')?.textContent.includes('ready'),null,{timeout:5000}).catch(async error=>{throw new Error(`${error.message}; status=${await page.locator('#erodedImageControls .fracture-status').textContent()}; errors=${errors.join('|')}`)});
    if (process.env.FRACTURED_DEBUG_PNG) await page.locator('#stage').screenshot({path:process.env.FRACTURED_DEBUG_PNG});
    const imageA=await page.locator('#erodedCanvas').evaluate(canvas=>canvas.toDataURL());
    await page.waitForTimeout(650);
    const imageB=await page.locator('#erodedCanvas').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(imageA,imageB,'photo preview animates');
    const deterministic=await page.evaluate(async()=>{
      const { ErodedRenderer }=await import('./eroded/renderer.mjs');
      const { DEFAULT_PARAMS }=await import('./eroded/parameters.mjs');
      const source=document.querySelector('#canvas'),canvas=new OffscreenCanvas(source.width,source.height),renderer=new ErodedRenderer(canvas,canvas.width,canvas.height);
      const sample=(time,params)=>{renderer.render(source,time,params);const pixels=new Uint8Array(canvas.width*canvas.height*4);renderer.gl.readPixels(0,0,canvas.width,canvas.height,renderer.gl.RGBA,renderer.gl.UNSIGNED_BYTE,pixels);let hash=2166136261;for(let i=0;i<pixels.length;i+=16)hash=Math.imul(hash^pixels[i],16777619);return hash>>>0};
      const first=sample(0,DEFAULT_PARAMS),repeat=sample(0,DEFAULT_PARAMS),last=sample(DEFAULT_PARAMS.duration,DEFAULT_PARAMS),different=sample(0,{...DEFAULT_PARAMS,seed:902});renderer.dispose();return{first,repeat,last,different};
    });
    assert.equal(deterministic.first,deterministic.repeat,'fixed seed and time render deterministically');
    assert.equal(deterministic.first,deterministic.last,'first and last animation frames match');
    assert.notEqual(deterministic.first,deterministic.different,'seed changes erosion pattern');
    const colorModes=await page.evaluate(async()=>{
      const { ErodedRenderer }=await import('./eroded/renderer.mjs');
      const { DEFAULT_PARAMS }=await import('./eroded/parameters.mjs');
      const source=document.querySelector('#canvas'),canvas=new OffscreenCanvas(source.width,source.height),renderer=new ErodedRenderer(canvas,canvas.width,canvas.height);
      const chroma=monochrome=>{
        renderer.render(source,.8,{...DEFAULT_PARAMS,monochrome});
        const pixels=new Uint8Array(canvas.width*canvas.height*4);
        renderer.gl.readPixels(0,0,canvas.width,canvas.height,renderer.gl.RGBA,renderer.gl.UNSIGNED_BYTE,pixels);
        let total=0;
        for(let i=0;i<pixels.length;i+=16)total+=Math.abs(pixels[i]-pixels[i+1])+Math.abs(pixels[i+1]-pixels[i+2]);
        return total;
      };
      const color=chroma(false),gray=chroma(true);renderer.dispose();return{color,gray};
    });
    assert.ok(colorModes.color>1000,'original color survives the effect');
    assert.equal(colorModes.gray,0,'monochrome is optional');

    await page.locator('#erodedImageControls select[aria-label="Eroded Identity preset"]').selectOption('Ink Collapse');
    await page.waitForTimeout(80);
    const inkFrame=await page.locator('#erodedCanvas').evaluate(canvas=>canvas.toDataURL());
    await page.locator('#erodedImageControls select[aria-label="Eroded Identity preset"]').selectOption('Soft Memory Fade');
    await page.waitForTimeout(80);
    const memoryFrame=await page.locator('#erodedCanvas').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(inkFrame,memoryFrame,'presets produce distinct images');
    await page.locator('#erodedImageControls summary').filter({hasText:'Tonal style'}).click();
    await page.locator('#erodedImageControls input[data-param="contrast"]').fill('0.05');
    const lowContrast=await page.locator('#erodedCanvas').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(memoryFrame,lowContrast,'controls update the preview');
    const still=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save frame PNG'}).click()]).then(([download])=>download);
    const stillPath=path.join(work,'frame.png'); await still.saveAs(stillPath);
    assert.equal(readFileSync(stillPath).subarray(0,4).toString('hex'),'89504e47');
    const animation=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.getByRole('button',{name:'Export animation'}).click()]).then(([download])=>download);
    const animationPath=path.join(work,animation.suggestedFilename()); await animation.saveAs(animationPath);
    assert.ok(readFileSync(animationPath).length>1000);
    const disposed=await page.evaluate(async()=>{
      const { ErodedRenderer }=await import('./eroded/renderer.mjs');
      const canvas=new OffscreenCanvas(32,32), renderer=new ErodedRenderer(canvas,32,32);
      const gl=renderer.gl, texture=renderer.texture, program=renderer.program;
      renderer.dispose();
      return !gl.isTexture(texture)&&!gl.isProgram(program)&&renderer.source===null;
    });
    assert.ok(disposed,'renderer releases GPU resources');
    await page.locator('[data-brush="fractured"]').click();
    assert.ok(await page.locator('#fracturedCanvas').isVisible(),'Turbulent Glass remains selectable');
    await page.locator('[data-brush="eroded"]').click();
    assert.ok(await page.locator('#erodedCanvas').isVisible(),'Eroded Identity remains selectable after switching');
    await page.locator('[data-brush="smear"]').click();
    assert.ok(await page.locator('#brushControls').isVisible(),'original brush controls return');
    await page.goto(`http://127.0.0.1:${port}/video.html`);
    await page.locator('#videoFile').setInputFiles(path.join(root,'tests/fixtures/sample.mp4'));
    await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Ready'));
    await page.locator('#videoEffect').selectOption('eroded-identity');
    await page.waitForFunction(()=>document.querySelector('#erodedVideoCanvas').width>0 && document.querySelector('#videoStatus').textContent.includes('Eroded Identity frame'),null,{timeout:30000});
    const videoA=await page.locator('#erodedVideoCanvas').evaluate(canvas=>canvas.toDataURL());
    await page.locator('#videoTimeline').fill('1.2');
    await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Eroded Identity frame at 1.20'));
    const videoB=await page.locator('#erodedVideoCanvas').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(videoA,videoB,'video seek updates the effect');
    const movie=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.locator('#exportVideo').click()]).then(([download])=>download);
    const moviePath=path.join(work,'eroded.mp4'); await movie.saveAs(moviePath);
    assert.ok(readFileSync(moviePath).length>1000);
    await page.locator('#videoFile').setInputFiles(moviePath);
    await page.waitForFunction(()=>document.querySelector('#videoDetails').textContent.includes('audio track'));
    assert.deepEqual(errors,[]);
  } finally { await browser?.close(); server.kill(); rmSync(work,{recursive:true,force:true}); }
});
