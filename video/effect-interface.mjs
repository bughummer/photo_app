import '../effects.js';

const registry = globalThis.PhotoFlowEffects;
export const VIDEO_EFFECTS = Object.freeze(registry.videoModes.map(name => Object.freeze({ name, mode: registry.modes.indexOf(name), renderer: 'webgl2', frameCompatible: true })));

export function normalizeEffect(effect = {}) {
  const selected = VIDEO_EFFECTS.find(item => item.name === effect.name);
  return {
    name: selected?.name || 'none',
    mode: selected?.mode ?? -1,
    centerX: Math.max(0, Math.min(1, Number(effect.centerX) || 0.5)),
    centerY: Math.max(0, Math.min(1, Number(effect.centerY) || 0.5)),
    radius: Math.max(0.02, Math.min(1, Number(effect.radius) || 0.25)),
    strength: Math.max(0, Math.min(1, Number(effect.strength) || 0.5)),
    deltaX: Number(effect.deltaX) || 0,
    deltaY: Number(effect.deltaY) || 0,
    seed: Number(effect.seed) || 1
  };
}

export const effectShader = registry.shader;
