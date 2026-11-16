import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('Fractured Identity animates image, scrubs video, and exports with audio', { timeout: 120000 }, async () => {
  const port = 44000 + process.pid % 10000;
  const server = spawn(process.execPath,['server.cjs'],{ cwd:root, env:{ ...process.env,PORT:String(port) }, stdio:'ignore' });
  const work = mkdtempSync(path.join(tmpdir(),'fractured-identity-'));
  let browser;
  try {
    for (let i=0;i<50;i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {} await new Promise(resolve=>setTimeout(resolve,100)); }
    browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl'] });
    const page = await browser.newPage({ viewport:{width:1280,height:800},acceptDownloads:true });
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('#file').setInputFiles(path.join(root,'tests/fixtures/still.png'));
    await page.locator('[data-brush="fractured"]').click();
    await page.waitForFunction(()=>document.querySelector('.fracture-status')?.textContent.includes('ready'),null,{timeout:30000});
    if (process.env.FRACTURED_DEBUG_PNG) await page.locator('#stage').screenshot({path:process.env.FRACTURED_DEBUG_PNG});
    const imageA=await page.locator('#fracturedCanvas').evaluate(canvas=>canvas.toDataURL());
    await page.waitForTimeout(650);
    const imageB=await page.locator('#fracturedCanvas').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(imageA,imageB,'photo preview animates');
    await page.locator('#fracturedImageControls select[aria-label="Fractured Identity preset"]').selectOption('Shattered Identity');
    const still=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Save frame PNG'}).click()]).then(([download])=>download);
    const stillPath=path.join(work,'frame.png'); await still.saveAs(stillPath);
    assert.equal(readFileSync(stillPath).subarray(0,4).toString('hex'),'89504e47');
    const animation=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.getByRole('button',{name:'Export animation'}).click()]).then(([download])=>download);
    const animationPath=path.join(work,animation.suggestedFilename()); await animation.saveAs(animationPath);
    assert.ok(readFileSync(animationPath).length>1000);
    const disposed=await page.evaluate(async()=>{
      const { FracturedRenderer }=await import('./fractured/renderer.mjs');
      const canvas=new OffscreenCanvas(32,32), renderer=new FracturedRenderer(canvas,32,32);
      const gl=renderer.gl, texture=renderer.textures[0], program=renderer.program;
      renderer.dispose();
      return !gl.isTexture(texture)&&!gl.isProgram(program)&&renderer.source===null;
    });
    assert.ok(disposed,'renderer releases GPU resources');
    await page.goto(`http://127.0.0.1:${port}/video.html`);
    await page.locator('#videoFile').setInputFiles(path.join(root,'tests/fixtures/sample.mp4'));
    await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Ready'));
    await page.locator('#videoEffect').selectOption('fractured-identity');
    await page.waitForFunction(()=>document.querySelector('#fracturedVideoCanvas').width>0 && document.querySelector('#videoStatus').textContent.includes('Fractured Identity frame'),null,{timeout:30000});
    const videoA=await page.locator('#fracturedVideoCanvas').evaluate(canvas=>canvas.toDataURL());
    await page.locator('#videoTimeline').fill('1.2');
    await page.waitForFunction(()=>document.querySelector('#videoStatus').textContent.includes('Fractured Identity frame at 1.20'));
    const videoB=await page.locator('#fracturedVideoCanvas').evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(videoA,videoB,'video seek updates the effect');
    const movie=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.locator('#exportVideo').click()]).then(([download])=>download);
    const moviePath=path.join(work,'fractured.mp4'); await movie.saveAs(moviePath);
    assert.ok(readFileSync(moviePath).length>1000);
    await page.locator('#videoFile').setInputFiles(moviePath);
    await page.waitForFunction(()=>document.querySelector('#videoDetails').textContent.includes('audio track'));
    assert.deepEqual(errors,[]);
  } finally { await browser?.close(); server.kill(); rmSync(work,{recursive:true,force:true}); }
});
