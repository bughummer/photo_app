import test from 'node:test';
import assert from 'node:assert/strict';
import { animationState } from '../fractured/animation.mjs';
import { DEFAULT_PARAMS, PRESETS, normalizeFracturedParams, serializeParams } from '../fractured/parameters.mjs';

test('animation loops with identical boundary state and presets serialize', () => {
  const params = normalizeFracturedParams({ ...DEFAULT_PARAMS, seed: 83, speed: 1.4, duration: 1.25 });
  assert.deepEqual(animationState(0,params),animationState(params.duration/params.speed,params));
  for (const preset of Object.values(PRESETS)) {
    const merged = normalizeFracturedParams({ ...DEFAULT_PARAMS, ...preset });
    assert.deepEqual(normalizeFracturedParams(JSON.parse(serializeParams(merged))),merged);
  }
  assert.equal(Object.keys(PRESETS).length,5);
});
