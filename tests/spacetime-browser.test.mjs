import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Spacetime Cube samples local video, renders all axes and modes, and releases its GPU texture', { timeout: 120000 }, async () => {
  const port = 39000 + process.pid % 10000;
  const server = spawn(process.execPath, ['server.cjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
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
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404 (Not Found)')) errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${port}/video.html`);
    await page.locator('#videoFile').setInputFiles(path.join(root, 'tests/fixtures/sample.mp4'));
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Ready'));
    await page.locator('#videoEffect').selectOption('spacetime');
    await page.locator('#cubeCount').fill('12');
    await page.locator('#cubeWidth').fill('64');
    await page.locator('#cubeGenerate').click();
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Ready: 12'), { timeout: 30000 });
    assert.ok(await page.locator('#cubeViewport canvas').isVisible());
    const image = await page.locator('#cubeViewport canvas').evaluate(canvas => canvas.toDataURL());
    for (const axis of ['xy', 'xz', 'yz']) {
      await page.locator('#cubeAxis').selectOption(axis);
      await page.locator('#cubeMode').selectOption('slices');
      await page.waitForTimeout(150);
      assert.notEqual(await page.locator('#cubeViewport canvas').evaluate(canvas => canvas.toDataURL()), image);
    }
    await page.locator('#cubeMode').selectOption('solid');
    await page.waitForTimeout(250);
    const solidWithFaces = await page.locator('#cubeViewport canvas').evaluate(canvas => canvas.toDataURL());
    await page.locator('#cubeFaces').uncheck();
    await page.waitForTimeout(150);
    assert.notEqual(await page.locator('#cubeViewport canvas').evaluate(canvas => canvas.toDataURL()), solidWithFaces, 'hiding surfaces reveals a different interior view');
    await page.locator('[data-cube-preset="front"]').click();
    await page.waitForTimeout(250);
    const frontView = await page.locator('#cubeViewport canvas').evaluate(canvas => canvas.toDataURL());
    await page.locator('[data-cube-preset="top"]').click();
    await page.waitForTimeout(250);
    assert.notEqual(await page.locator('#cubeViewport canvas').evaluate(canvas => canvas.toDataURL()), frontView, 'camera presets change the 3D view');
    await page.locator('#cubePlaySlice').click();
    const beforeAnimation = await page.locator('#cubePosition').inputValue();
    await page.waitForTimeout(200);
    await page.locator('#cubePlaySlice').click();
    assert.notEqual(await page.locator('#cubePosition').inputValue(), beforeAnimation, 'cutting plane moves through the volume');
    assert.equal(errors.length, 0, errors.join('\n'));
    const mapping = await page.evaluate(async () => {
      const [{ VideoWorkerClient }, { crossSection }] = await Promise.all([import('./video/worker-client.mjs'), import('./video/temporal-mapping.mjs')]);
      const worker = new VideoWorkerClient();
      const file = new File([await (await fetch('/tests/fixtures/sample.mp4')).arrayBuffer()], 'sample.mp4', { type: 'video/mp4' });
      try {
        await worker.request('open', { file });
        const sample = await worker.request('sampleRange', { options: { start: 0, end: 1, count: 3, width: 32, height: 18 } });
        const data = new Uint8Array(sample.buffer);
        const xy0 = crossSection(data, 32, 18, 3, 'xy', 0);
        const xy2 = crossSection(data, 32, 18, 3, 'xy', 2);
        const xz = crossSection(data, 32, 18, 3, 'xz', 9);
        const yz = crossSection(data, 32, 18, 3, 'yz', 16);
        const red = (slice, x, y) => slice.pixels[(y * slice.width + x) * 4];
        const bitmap = (await worker.request('extract', { time: 1 })).bitmap;
        const canvas = new OffscreenCanvas(32, 18);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0, 32, 18);
        const direct = context.getImageData(0, 0, 32, 18).data;
        bitmap.close();
        let difference = 0;
        for (let i = 0; i < direct.length; i += 4) difference += Math.abs(direct[i] - xy2.pixels[i]);
        return { timestamps: sample.timestamps, xz: [red(xz, 12, 0), red(xz, 12, 2)], xy: [red(xy0, 12, 9), red(xy2, 12, 9)], yz: red(yz, 2, 9) === red(xy2, 16, 9), averageDifference: difference / (32 * 18) };
      } finally { worker.close(); }
    });
    assert.deepEqual(mapping.timestamps, [0, .5, 1]);
    assert.deepEqual(mapping.xz, mapping.xy);
    assert.equal(mapping.yz, true);
    assert.ok(mapping.averageDifference < 12, `XY frame matches direct decoded frame (${mapping.averageDifference})`);
    const motion = await page.evaluate(async () => {
      const [{ VideoWorkerClient }, { crossSection }] = await Promise.all([import('./video/worker-client.mjs'), import('./video/temporal-mapping.mjs')]);
      const worker = new VideoWorkerClient();
      const file = new File([await (await fetch('/tests/fixtures/moving-pedestrians.mp4')).arrayBuffer()], 'moving-pedestrians.mp4', { type: 'video/mp4' });
      try {
        await worker.request('open', { file });
        const volume = await worker.request('sampleRange', { options: { start: 0, end: 1, count: 5, width: 120, height: 68 } });
        const xz = crossSection(new Uint8Array(volume.buffer), 120, 68, 5, 'xz', 40);
        const pixel = (x, z) => [...xz.pixels.slice((z * 120 + x) * 4, (z * 120 + x) * 4 + 3)];
        return Array.from({ length: 5 }, (_, z) => ({ background: pixel(5, z), first: pixel(15 + z * 9, z), second: pixel(101 - z * 6, z) }));
      } finally { worker.close(); }
    });
    for (const sample of motion) {
      assert.ok(Math.abs(sample.background[0] - motion[0].background[0]) < 8, 'stationary background remains stable through time');
      assert.ok(sample.first[0] > 150 && sample.first[0] > sample.first[2], 'first moving silhouette has a temporal trajectory');
      assert.ok(sample.second[2] > 140 && sample.second[2] > sample.second[0], 'second moving silhouette has a distinct temporal trajectory');
    }
    const responsiveness = await page.evaluate(async () => {
      const { VideoWorkerClient } = await import('./video/worker-client.mjs');
      const worker = new VideoWorkerClient();
      const file = new File([await (await fetch('/tests/fixtures/moving-pedestrians.mp4')).arrayBuffer()], 'moving-pedestrians.mp4', { type: 'video/mp4' });
      let heartbeats = 0;
      try {
        await worker.request('open', { file });
        const timer = setInterval(() => heartbeats++, 10);
        const result = await worker.request('sampleRange', { options: { start: 0, end: 1.9, count: 120, width: 320, height: 180 } });
        clearInterval(timer);
        return { heartbeats, bytes: result.buffer.byteLength };
      } finally { worker.close(); }
    });
    assert.equal(responsiveness.bytes, 320 * 180 * 120 * 4);
    assert.ok(responsiveness.heartbeats > 0, 'main thread remains responsive during default-size decoding');
    const canceledAndRestarted = await page.evaluate(async () => {
      const { VideoWorkerClient } = await import('./video/worker-client.mjs');
      const worker = new VideoWorkerClient();
      const file = new File([await (await fetch('/tests/fixtures/moving-pedestrians.mp4')).arrayBuffer()], 'moving-pedestrians.mp4', { type: 'video/mp4' });
      try {
        await worker.request('open', { file });
        const controller = new AbortController();
        const pending = worker.request('sampleRange', { options: { start: 0, end: 1.9, count: 240, width: 320, height: 180 } }, null, controller.signal);
        controller.abort();
        let canceled = false;
        try { await pending; } catch (error) { canceled = error.name === 'AbortError'; }
        const restarted = await worker.request('sampleRange', { options: { start: 0, end: 1, count: 3, width: 32, height: 18 } });
        return canceled && restarted.buffer.byteLength === 32 * 18 * 3 * 4;
      } finally { worker.close(); }
    });
    assert.equal(canceledAndRestarted, true, 'canceled decoding frees the worker for a new request');
    const download = await Promise.all([page.waitForEvent('download'), page.locator('#cubeScreenshot').click()]).then(([file]) => file);
    assert.match(download.suggestedFilename(), /spacetime.*png/);
    if (process.env.CUBE_DEBUG_SCREENSHOT) await download.saveAs(process.env.CUBE_DEBUG_SCREENSHOT);
    await page.locator('#cubeMode').selectOption('stack');
    await page.locator('#cubeCount').fill('120');
    await page.locator('#cubeWidth').fill('320');
    await page.locator('#cubeGenerate').click();
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Ready: 120'), { timeout: 45000 });
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.locator('#videoEffect').selectOption('none');
    assert.ok(await page.locator('#videoCanvas').isVisible());
    await page.locator('#videoFile').setInputFiles(path.join(root, 'tests/fixtures/sample.mp4'));
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Ready'));
    assert.equal(await page.locator('#cubeViewport canvas').count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally { await browser?.close(); server.kill(); }
});
