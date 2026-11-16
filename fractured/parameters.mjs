const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

export const DEFAULT_ANCHORS = Object.freeze([
  { x: .36, y: .4 }, { x: .64, y: .4 }, { x: .5, y: .55 }, { x: .5, y: .7 }, { x: .5, y: .82 }
]);

const layer = (x, y, scale, rotation, opacity, distortion, blend = 'normal') => ({ x, y, scale, rotation, opacity, distortion, blend });
export const DEFAULT_PARAMS = Object.freeze({
  crackDensity: .48, crackThickness: .5, fragmentSize: .55, fragmentDisplacement: .45,
  glassTransparency: .72, refraction: .55, seed: 11,
  morphIntensity: .48, eyeDistortion: .55, mouthDistortion: .5, faceDeformation: .45,
  faceTracking: false, showAnchors: false,
  ghostCount: 2, ghostOpacity: .35, layerDisplacement: .4, blendMode: 'screen',
  layers: [layer(-.018, .008, 1.012, -.025, .6, .45), layer(.022, -.014, .99, .035, .4, .75), layer(-.035, -.02, 1.025, -.045, .3, .6)],
  duration: 1.25, speed: 1, distortionIntensity: .72, loop: true, reconstruction: .85,
  chromatic: .32, grain: .13, blur: .12, reflection: .36, colorTreatment: 'neutral',
  anchors: DEFAULT_ANCHORS
});

export const PRESETS = Object.freeze({
  'Subtle Fracture': { crackDensity: .35, crackThickness: .32, fragmentDisplacement: .2, refraction: .26, morphIntensity: .2, ghostCount: 1, ghostOpacity: .14, distortionIntensity: .35, reflection: .22 },
  'Shattered Identity': { crackDensity: .76, crackThickness: .78, fragmentDisplacement: .9, refraction: .82, morphIntensity: .88, eyeDistortion: .85, mouthDistortion: .8, ghostCount: 2, ghostOpacity: .45, distortionIntensity: .92 },
  'Liquid Mirror': { crackDensity: .26, crackThickness: .2, fragmentSize: .8, fragmentDisplacement: .42, refraction: .95, morphIntensity: .72, faceDeformation: .8, ghostCount: 1, glassTransparency: .9, blur: .34 },
  'Parallel Self': { crackDensity: .43, fragmentDisplacement: .55, ghostCount: 3, ghostOpacity: .72, layerDisplacement: .85, blendMode: 'screen', chromatic: .5, morphIntensity: .6 },
  'Collapse and Rebirth': { crackDensity: .65, crackThickness: .73, fragmentDisplacement: .95, morphIntensity: .95, faceDeformation: .95, refraction: .9, ghostCount: 3, ghostOpacity: .62, distortionIntensity: 1, reconstruction: 1, duration: 1.8 }
});

export function normalizeFracturedParams(raw = {}) {
  const result = { ...DEFAULT_PARAMS, ...raw };
  for (const key of ['crackDensity','crackThickness','fragmentSize','fragmentDisplacement','glassTransparency','refraction','morphIntensity','eyeDistortion','mouthDistortion','faceDeformation','ghostOpacity','layerDisplacement','distortionIntensity','reconstruction','chromatic','grain','blur','reflection']) result[key] = clamp(result[key], 0, 1, DEFAULT_PARAMS[key]);
  result.seed = Math.round(clamp(result.seed, 0, 999999999, DEFAULT_PARAMS.seed));
  result.ghostCount = Math.round(clamp(result.ghostCount, 0, 3, DEFAULT_PARAMS.ghostCount));
  result.duration = clamp(result.duration, .5, 5, DEFAULT_PARAMS.duration);
  result.speed = clamp(result.speed, .25, 3, DEFAULT_PARAMS.speed);
  result.loop = !!result.loop;
  result.faceTracking = !!result.faceTracking;
  result.showAnchors = !!result.showAnchors;
  result.blendMode = ['normal','screen','multiply'].includes(result.blendMode) ? result.blendMode : 'screen';
  result.colorTreatment = ['neutral','cool','warm','monochrome'].includes(result.colorTreatment) ? result.colorTreatment : 'neutral';
  result.anchors = DEFAULT_ANCHORS.map((fallback, i) => ({ x: clamp(raw.anchors?.[i]?.x, 0, 1, fallback.x), y: clamp(raw.anchors?.[i]?.y, 0, 1, fallback.y) }));
  result.layers = DEFAULT_PARAMS.layers.map((fallback, i) => {
    const source = raw.layers?.[i] || fallback;
    return { x: clamp(source.x, -.2, .2, fallback.x), y: clamp(source.y, -.2, .2, fallback.y),
      scale: clamp(source.scale, .7, 1.3, fallback.scale), rotation: clamp(source.rotation, -.5, .5, fallback.rotation),
      opacity: clamp(source.opacity, 0, 1, fallback.opacity), distortion: clamp(source.distortion, 0, 1, fallback.distortion),
      blend: ['normal','screen','multiply'].includes(source.blend) ? source.blend : fallback.blend };
  });
  return result;
}

export function applyPreset(name, current = DEFAULT_PARAMS) {
  if (!PRESETS[name]) throw new Error(`Unknown Fractured Identity preset: ${name}`);
  return normalizeFracturedParams({ ...current, ...PRESETS[name] });
}

export function serializeParams(params) { return JSON.stringify(normalizeFracturedParams(params)); }
export function deserializeParams(serialized) { return normalizeFracturedParams(JSON.parse(serialized)); }

export function geometryKey(params) { return `${params.seed}:${params.crackDensity.toFixed(3)}:${params.fragmentSize.toFixed(3)}`; }
