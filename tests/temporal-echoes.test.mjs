import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEchoParams, echoFrameTimes, EchoPlaybackHistory } from '../video/temporal-echoes.mjs';

test('echo parameters stay within bounded preview and export limits', () => {
  assert.deepEqual(normalizeEchoParams(), { count: 3, gap: .18, strength: .55, threshold: .08 });
  assert.deepEqual(normalizeEchoParams({ count: 40, gap: 10, strength: -1, threshold: 9 }), { count: 4, gap: .5, strength: 0, threshold: .4 });
});

test('echo timestamps are deterministic, chronological, and clipped at the video start', () => {
  const params = { count: 3, gap: .2 };
  assert.deepEqual(echoFrameTimes(1, 3, params), [
    { age: 3, time: .3999999999999999 }, { age: 2, time: .6 }, { age: 1, time: .8 }, { age: 0, time: 1 }
  ]);
  assert.deepEqual(echoFrameTimes(.1, 3, params), [{ age: 0, time: .1 }]);
  assert.equal(echoFrameTimes(9, 3, params).at(-1).time, 2.999999);
});

test('playback history stays bounded, picks past frames, and disposes its canvases', () => {
  const previous = globalThis.OffscreenCanvas;
  const created = [];
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; created.push(this); }
    getContext() { return { clearRect() {}, drawImage() {} }; }
  };
  try {
    const history = new EchoPlaybackHistory(2, 2, 32);
    const params = { count: 1, gap: .05 };
    history.capture({}, 0, params);
    history.capture({}, .04, params);
    history.capture({}, .1, params);
    assert.equal(history.frames.length, 2);
    assert.equal(history.sourcesAt(.1, params)[0], history.frames[0].canvas);
    history.dispose();
    assert.equal(history.frames.length, 0);
    assert.ok(created.every(canvas => canvas.width === 0 && canvas.height === 0));
  } finally { globalThis.OffscreenCanvas = previous; }
});
