import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Temporal Echoes previews deterministic history, plays, exports PNG and MP4 with audio', { timeout: 120000 }, async () => {
  const port = 42000 + process.pid % 10000;
  const server = spawn(process.execPath, ['server.cjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const work = mkdtempSync(path.join(tmpdir(), 'photo-flow-echo-'));
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/video.html`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/video.html`);
    await page.locator('#videoFile').setInputFiles(path.join(root, 'tests/fixtures/moving-pedestrians.mp4'));
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Ready'));
    await page.locator('#videoTimeline').fill('1.2');
    await page.waitForTimeout(250);
    const original = await page.locator('#videoCanvas').evaluate(canvas => canvas.toDataURL());
    await page.locator('#videoEffect').selectOption('temporal-echoes');
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Temporal Echoes frame at 1.20'));
    assert.ok(await page.locator('#echoCanvas').isVisible());
    const echo = await page.locator('#echoCanvas').evaluate(canvas => canvas.toDataURL());
    assert.notEqual(echo, original, 'motion echoes change the output frame');
    await page.locator('#echoStrength').fill('0');
    await page.waitForTimeout(200);
    const noTrail = await page.locator('#echoCanvas').evaluate(canvas => canvas.toDataURL());
    assert.notEqual(noTrail, echo, 'strength control changes rendered echoes');
    await page.locator('#echoStrength').fill('80');
    await page.locator('#echoCount').fill('4');
    await page.locator('#echoGap').fill('0.25');
    await page.locator('#echoThreshold').fill('2');
    await page.locator('#videoTimeline').fill('1.4');
    await page.waitForTimeout(300);
    const frame = await Promise.all([page.waitForEvent('download'), page.locator('#extractFrame').click()]).then(([file]) => file);
    const framePath = path.join(work, 'echo-frame.png');
    await frame.saveAs(framePath);
    if (process.env.ECHO_DEBUG_PNG) await frame.saveAs(process.env.ECHO_DEBUG_PNG);
    assert.equal(readFileSync(framePath).subarray(0, 4).toString('hex'), '89504e47');
    await page.locator('#playVideo').click();
    const beforePlay = await page.locator('#sourceVideo').evaluate(video => video.currentTime);
    await page.waitForFunction(before => document.querySelector('#sourceVideo').currentTime > before + .15, beforePlay);
    await page.locator('#playVideo').click();
    const timestamps = await page.evaluate(async () => {
      const { VideoWorkerClient } = await import('./video/worker-client.mjs');
      const worker = new VideoWorkerClient();
      const file = new File([await (await fetch('/tests/fixtures/moving-pedestrians.mp4')).arrayBuffer()], 'moving-pedestrians.mp4', { type: 'video/mp4' });
      try {
        await worker.request('open', { file });
        const result = await worker.request('echoPreview', { time: 1, params: { count: 3, gap: .25 } });
        const times = result.frames.map(frame => ({ age: frame.age, time: frame.time }));
        result.frames.forEach(frame => frame.bitmap.close());
        return times;
      } finally { worker.close(); }
    });
    assert.deepEqual(timestamps, [{ age: 3, time: .25 }, { age: 2, time: .5 }, { age: 1, time: .75 }, { age: 0, time: 1 }]);
    await page.locator('#videoFile').setInputFiles(path.join(root, 'tests/fixtures/sample.mp4'));
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Temporal Echoes frame at 0.00'));
    const mp4 = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator('#exportVideo').click()]).then(([file]) => file);
    const mp4Path = path.join(work, 'echo.mp4');
    await mp4.saveAs(mp4Path);
    assert.ok(readFileSync(mp4Path).byteLength > 1000);
    await page.locator('#videoFile').setInputFiles(mp4Path);
    await page.waitForFunction(() => document.querySelector('#videoDetails').textContent.includes('audio track'));
    const changedPixels = await page.evaluate(async encoded => {
      const { VideoWorkerClient } = await import('./video/worker-client.mjs');
      const original = new File([await (await fetch('/tests/fixtures/sample.mp4')).arrayBuffer()], 'sample.mp4', { type: 'video/mp4' });
      const bytes = Uint8Array.from(atob(encoded), letter => letter.charCodeAt(0));
      const exported = new File([bytes], 'echo.mp4', { type: 'video/mp4' });
      const read = async file => {
        const worker = new VideoWorkerClient();
        try {
          await worker.request('open', { file });
          const bitmap = (await worker.request('extract', { time: 1.2 })).bitmap;
          const canvas = new OffscreenCanvas(64, 36);
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0, 64, 36);
          bitmap.close();
          return context.getImageData(0, 0, 64, 36).data;
        } finally { worker.close(); }
      };
      const before = await read(original), after = await read(exported);
      let changed = 0;
      for (let i = 0; i < before.length; i += 4) {
        if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) > 45) changed++;
      }
      return changed;
    }, readFileSync(mp4Path).toString('base64'));
    assert.ok(changedPixels > 100, `MP4 contains the echo effect (${changedPixels} changed pixels)`);
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally { await browser?.close(); server.kill(); rmSync(work, { recursive: true, force: true }); }
});
