import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFractureGeometry } from '../fractured/geometry.mjs';
import { animationState } from '../fractured/animation.mjs';
import { DEFAULT_PARAMS, PRESETS, normalizeFracturedParams, serializeParams } from '../fractured/parameters.mjs';

test('fracture geometry is seeded, partitioned, and reproducible', () => {
  const a = generateFractureGeometry({ seed: 71, density: .6, resolution: 64 });
  const b = generateFractureGeometry({ seed: 71, density: .6, resolution: 64 });
  const c = generateFractureGeometry({ seed: 72, density: .6, resolution: 64 });
  assert.deepEqual(a.map,b.map);
  assert.notDeepEqual(a.map,c.map);
  assert.ok(new Set(a.map.filter((_,index) => index % 4 === 0)).size > 10);
  assert.ok(a.map.some((_,index) => index % 4 === 1 && a.map[index] > 150));
});

test('animation loops with identical boundary state and presets serialize', () => {
  const params = normalizeFracturedParams({ ...DEFAULT_PARAMS, seed: 83, speed: 1.4, duration: 1.25 });
  assert.deepEqual(animationState(0,params),animationState(params.duration/params.speed,params));
  for (const preset of Object.values(PRESETS)) {
    const merged = normalizeFracturedParams({ ...DEFAULT_PARAMS, ...preset });
    assert.deepEqual(normalizeFracturedParams(JSON.parse(serializeParams(merged))),merged);
  }
  assert.equal(Object.keys(PRESETS).length,5);
});
