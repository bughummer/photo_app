import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Slit Scan generates temporal image, recomposes controls, exports PNG, and preserves frame effects', { timeout: 90000 }, async () => {
  const port = 44000 + process.pid % 10000;
  const server = spawn(process.execPath, ['server.cjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const work = mkdtempSync(path.join(tmpdir(), 'photo-flow-slit-'));
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
    await page.locator('#videoEffect').selectOption('slit-scan');
    assert.ok(await page.locator('#slitControls').isVisible());
    await page.locator('#slitCount').fill('24');
    await page.locator('#slitWidth').fill('120');
    await page.locator('#slitEndTime').fill('1.9');
    await page.locator('#slitGenerate').click();
    await page.waitForFunction(() => document.querySelector('#videoStatus').textContent.includes('Slit Scan ready'), { timeout: 30000 });
    const initial = await page.locator('#slitCanvas').evaluate(canvas => canvas.toDataURL());
    assert.ok(await page.locator('#slitCanvas').isVisible());
    const pixels = await page.locator('#slitCanvas').evaluate(canvas => {
      const { data } = canvas.getContext('2d').getImageData(0, 40, canvas.width, 1);
      return Array.from({ length: canvas.width }, (_, x) => [...data.slice(x * 4, x * 4 + 3)]);
    });
    assert.ok(pixels.some(([r, , b]) => r > 145 && r > b * 1.3), 'first moving subject appears along time');
    assert.ok(pixels.some(([r, , b]) => b > 140 && b > r * 1.3), 'second moving subject appears along time');
    await page.locator('#slitLineEnd').fill('90');
    await page.waitForFunction(previous => document.querySelector('#slitCanvas').toDataURL() !== previous && !document.querySelector('#slitExport').disabled, initial);
    const swept = await page.locator('#slitCanvas').evaluate(canvas => canvas.toDataURL());
    await page.locator('#slitDirection').selectOption('horizontal');
    await page.waitForFunction(previous => document.querySelector('#slitCanvas').toDataURL() !== previous && !document.querySelector('#slitExport').disabled, swept);
    const horizontal = await page.locator('#slitCanvas').evaluate(canvas => canvas.toDataURL());
    await page.locator('#slitBand').fill('12');
    await page.waitForFunction(previous => document.querySelector('#slitCanvas').toDataURL() !== previous && !document.querySelector('#slitExport').disabled, horizontal);
    const download = await Promise.all([page.waitForEvent('download'), page.locator('#slitExport').click()]).then(([file]) => file);
    const png = path.join(work, 'slit.png');
    await download.saveAs(png);
    if (process.env.SLIT_DEBUG_PNG) await download.saveAs(process.env.SLIT_DEBUG_PNG);
    assert.equal(readFileSync(png).subarray(0, 4).toString('hex'), '89504e47');
    await page.locator('#videoEffect').selectOption('swirl');
    assert.ok(await page.locator('#videoCanvas').isVisible());
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally { await browser?.close(); server.kill(); rmSync(work, { recursive: true, force: true }); }
});
