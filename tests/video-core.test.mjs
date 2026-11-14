import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTime, formatTime, frameTimes } from '../video/timeline.mjs';
import { FrameCache } from '../video/frame-cache.mjs';
import { VIDEO_EFFECTS, normalizeEffect } from '../video/effect-interface.mjs';

test('timeline clamps seeks and generates a bounded export schedule', () => {
  assert.equal(clampTime(-2, 3), 0);
  assert.equal(clampTime(4, 3), 3);
  assert.equal(clampTime(Number.NaN, 3), 0);
  assert.equal(formatTime(61.9), '1:01');
  assert.deepEqual(frameTimes(0.5, 4), [0, 0.25]);
  assert.throws(() => frameTimes(Infinity), /Invalid/);
});

test('frame cache evicts and closes frames within a memory budget', () => {
  const closed = [];
  const frame = name => ({ width: 2, height: 2, close: () => closed.push(name) });
  const cache = new FrameCache(2, 32);
  cache.set('a', frame('a'));
  cache.set('b', frame('b'));
  assert.ok(cache.get('a'));
  cache.set('c', frame('c'));
  assert.deepEqual(closed, ['b']);
  assert.equal(cache.get('b'), null);
  cache.clear();
  assert.deepEqual(closed.sort(), ['a', 'b', 'c']);
  assert.equal(cache.bytes, 0);
});

test('video effect interface maps only frame-compatible shader effects', () => {
  assert.ok(VIDEO_EFFECTS.some(effect => effect.name === 'swirl'));
  assert.ok(!VIDEO_EFFECTS.some(effect => effect.name === 'pointcloud'));
  const swirl = normalizeEffect({ name: 'swirl', centerX: 2, centerY: -1, radius: 3, strength: 5 });
  assert.equal(swirl.mode, 1);
  assert.equal(swirl.centerX, 1);
  assert.equal(swirl.centerY, 0);
  assert.equal(swirl.strength, 1);
  assert.equal(normalizeEffect({ name: 'pointcloud' }).mode, -1);
});
