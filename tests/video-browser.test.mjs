import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'tests/fixtures/sample.mp4');
const still = path.join(root, 'tests/fixtures/still.png');

test('local video decoding, seek, effects, frame extraction, audio export, and image regression', { timeout: 120000 }, async () => {
  const port = 48000 + process.pid % 10000;
  const server = spawn(process.execPath, ['server.cjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const work = mkdtempSync(path.join(tmpdir(), 'photo-flow-video-test-'));
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/video.html`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'local server started');
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/video.html`);
    await page.locator('#videoFile').setInputFiles(fixture);
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Ready'));
    assert.match(await page.locator('#videoDetails').textContent(), /audio track/);
    await page.locator('#playVideo').click();
    await page.waitForFunction(() => document.querySelector('#sourceVideo').currentTime > 0.2);
    await page.locator('#playVideo').click();
    await page.locator('#videoTimeline').fill('1.2');
    await page.waitForFunction(() => Number(document.querySelector('#videoTimeline').value) >= 1.19);
    const original = await page.locator('#videoCanvas').evaluate(canvas => canvas.toDataURL());
    const readPixels = () => page.locator('#videoCanvas').evaluate(async canvas => {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const bitmap = await createImageBitmap(blob);
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      const context = copy.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return [...context.getImageData(0, 0, copy.width, copy.height).data];
    });
    const originalPixels = await readPixels();
    await page.locator('#videoEffect').selectOption('swirl');
    await page.locator('#videoStrength').fill('100');
    await page.locator('#videoSize').fill('80');
    await page.locator('#videoCanvas').click({ position: { x: 70, y: 40 } });
    await page.waitForTimeout(250);
    const changed = await page.locator('#videoCanvas').evaluate(canvas => canvas.toDataURL());
    assert.notEqual(changed, original, 'shared WebGL2 effect changes the frame');
    const pngDownload = await Promise.all([page.waitForEvent('download'), page.locator('#extractFrame').click()]).then(([download]) => download);
    const pngPath = path.join(work, 'frame.png');
    await pngDownload.saveAs(pngPath);
    assert.equal(readFileSync(pngPath).subarray(0, 4).toString('hex'), '89504e47');
    const mp4Download = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator('#exportVideo').click()]).then(([download]) => download);
    const mp4Path = path.join(work, 'export.mp4');
    await mp4Download.saveAs(mp4Path);
    assert.ok(readFileSync(mp4Path).byteLength > 1000);
    await page.locator('#videoFile').setInputFiles(mp4Path);
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Ready'));
    assert.match(await page.locator('#videoDetails').textContent(), /audio track/);
    await page.locator('#videoEffect').selectOption('none');
    await page.locator('#videoTimeline').fill('1.2');
    await page.waitForTimeout(250);
    const baked = await page.locator('#videoCanvas').evaluate(canvas => canvas.toDataURL());
    assert.notEqual(baked, original, 'export includes the selected effect');
    const bakedPixels = await readPixels();
    let changedPixels = 0;
    for (let i = 0; i < originalPixels.length; i += 4) {
      const difference = Math.abs(originalPixels[i] - bakedPixels[i]) + Math.abs(originalPixels[i + 1] - bakedPixels[i + 1]) + Math.abs(originalPixels[i + 2] - bakedPixels[i + 2]);
      if (difference > 75) changedPixels++;
    }
    assert.ok(changedPixels > 150, `effect is visible in exported frames (${changedPixels} changed pixels)`);
    assert.equal(errors.length, 0, errors.join('\n'));

    await page.locator('#videoFile').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') });
    await page.waitForFunction(() => document.querySelector('#videoStatus').classList.contains('error'));
    assert.match(await page.locator('#videoStatus').textContent(), /not supported|cannot play|codec/i);

    await page.goto(`http://127.0.0.1:${port}/index.html`);
    await page.locator('#file').setInputFiles(still);
    await page.locator('[data-brush="swirl"]').click();
    const before = await page.locator('#canvas').evaluate(canvas => canvas.toDataURL());
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();
    assert.notEqual(await page.locator('#canvas').evaluate(canvas => canvas.toDataURL()), before);
    await page.locator('#undo').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#canvas').evaluate(canvas => canvas.toDataURL()), before);
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally {
    await browser?.close();
    server.kill();
    rmSync(work, { recursive: true, force: true });
  }
});
