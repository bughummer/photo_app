import test from 'node:test';
import assert from 'node:assert/strict';
import { setFrame } from '../video/temporal-mapping.mjs';
import { composeSlitScan, composeSlitScanAsync } from '../video/slit-scan.mjs';

function fixture() {
  const width = 5, height = 4, depth = 5;
  const data = new Uint8Array(width * height * depth * 4);
  for (let z = 0; z < depth; z++) {
    const frame = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      frame[offset] = z * 40 + x;
      frame[offset + 1] = y * 30;
      frame[offset + 3] = 255;
    }
    setFrame(data, frame, z, width, height, depth);
  }
  return { width, height, depth, data };
}

test('vertical slit scan maps output X to time and preserves source Y', () => {
  const image = composeSlitScan(fixture(), { direction: 'vertical', start: .5, end: .5, band: 1 });
  const pixel = (x, y) => [...image.pixels.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];
  assert.deepEqual(pixel(0, 0), [2, 0, 0, 255]);
  assert.deepEqual(pixel(4, 3), [162, 90, 0, 255]);
});

test('horizontal scan maps output Y to time and moving line position', () => {
  const image = composeSlitScan(fixture(), { direction: 'horizontal', start: 0, end: 1, band: 1 });
  const pixel = (x, y) => [...image.pixels.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];
  assert.deepEqual(pixel(0, 0), [0, 0, 0]);
  assert.deepEqual(pixel(4, 4), [164, 90, 0]);
});

test('band width averages adjacent source columns and asynchronous work can cancel', async () => {
  const image = composeSlitScan(fixture(), { direction: 'vertical', start: .5, end: .5, band: 3 });
  assert.equal(image.pixels[0], 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(composeSlitScanAsync(fixture(), { direction: 'vertical', start: .5, end: .5, band: 1 }, controller.signal), /Canceled/);
});

test('temporal output axis includes every sampled frame when depth exceeds image size', () => {
  const base = fixture();
  const data = new Uint8Array(base.width * base.height * 8 * 4);
  data.set(base.data);
  const volume = { ...base, depth: 8, data };
  assert.equal(composeSlitScan(volume, { direction: 'vertical', start: 0, end: 0, band: 1 }).width, 8);
  assert.equal(composeSlitScan(volume, { direction: 'horizontal', start: 0, end: 0, band: 1 }).height, 8);
});
