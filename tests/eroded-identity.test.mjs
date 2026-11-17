import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMS,PRESETS,normalizeParams,serializeParams,deserializeParams,phaseAt,decayEnvelope } from '../eroded/parameters.mjs';

test('Eroded Identity parameters serialize, presets remain editable, and loop closes',()=>{
  const p=normalizeParams({...DEFAULT_PARAMS,seed:918,duration:2.7,speed:1.3});
  assert.equal(p.monochrome,false);
  assert.equal(deserializeParams(serializeParams({...p,monochrome:true})).monochrome,true);
  assert.deepEqual(deserializeParams(serializeParams(p)),p);
  assert.equal(phaseAt(0,p),phaseAt(p.duration/p.speed,p));
  assert.equal(decayEnvelope(0,p),decayEnvelope(p.duration/p.speed,p));
  assert.equal(Object.keys(PRESETS).length,5);
  for(const preset of Object.values(PRESETS)) assert.deepEqual(deserializeParams(serializeParams(normalizeParams({...p,...preset}))),normalizeParams({...p,...preset}));
  assert.notEqual(decayEnvelope(p.duration*.5/p.speed,p),decayEnvelope(0,p));
});
