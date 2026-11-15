import test from 'node:test';
import assert from 'node:assert/strict';
import { samplingSchedule, voxelOffset, setFrame, crossSection } from '../video/temporal-mapping.mjs';
import { TemporalEffectsEngine, TemporalTextureManager } from '../video/temporal-engine.mjs';

test('timestamps are ordered and bound to the selected interval', () => {
  assert.deepEqual(samplingSchedule(1, 3, 3, 5), [1, 2, 3]);
  assert.throws(() => samplingSchedule(3, 1, 3, 5), /valid video interval/);
});

test('temporal sampling cancels asynchronously and can restart', async () => {
  const media = { duration: 2, worker: { request: (_type, _payload, _progress, signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
  }) } };
  const engine = new TemporalEffectsEngine(media);
  const pending = engine.sample({ start: 0, end: 1, count: 2, width: 2, height: 2 });
  engine.cancel();
  await assert.rejects(pending, /Canceled/);
  media.worker.request = async () => ({ buffer: new ArrayBuffer(32), width: 2, height: 2, depth: 2, timestamps: [0, 1] });
  assert.equal((await engine.sample({ start: 0, end: 1, count: 2, width: 2, height: 2 })).data.length, 32);
  engine.dispose();
  assert.equal(engine.volume, null);
});

test('GPU texture manager releases each allocated volume', () => {
  const manager = new TemporalTextureManager();
  const texture = manager.createVolume({ width: 2, height: 2, depth: 2, data: new Uint8Array(32) }, 4);
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  manager.release(texture);
  assert.equal(disposed, 1);
  assert.equal(manager.textures.size, 0);
  assert.throws(() => manager.createVolume({ width: 8, height: 2, depth: 2, data: new Uint8Array(128) }, 4), /3D textures/);
  manager.dispose();
});

test('XY, XZ, and YZ slices preserve image coordinates and time ordering', () => {
  const width = 3, height = 2, depth = 4;
  const volume = new Uint8Array(width * height * depth * 4);
  for (let z = 0; z < depth; z++) {
    const frame = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) frame[(y * width + x) * 4] = 10 * z + 3 * y + x;
    setFrame(volume, frame, z, width, height, depth);
  }
  assert.equal(volume[voxelOffset(2, 0, 3, width, height, depth)], 32);
  const red = (slice, x, y) => slice.pixels[(y * slice.width + x) * 4];
  assert.equal(red(crossSection(volume, width, height, depth, 'xy', 2), 2, 1), 25);
  assert.deepEqual(Array.from({ length: depth }, (_, z) => red(crossSection(volume, width, height, depth, 'xz', 1), 2, z)), [5, 15, 25, 35]);
  assert.deepEqual(Array.from({ length: depth }, (_, z) => red(crossSection(volume, width, height, depth, 'yz', 1), z, 0)), [1, 11, 21, 31]);
});
