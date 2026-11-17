const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

export const DEFAULT_ANCHORS = Object.freeze([
  { x: .36, y: .4 }, { x: .64, y: .4 }, { x: .5, y: .55 }, { x: .5, y: .7 }, { x: .5, y: .82 }
]);

const layer = (x, y, scale, rotation, opacity, distortion, blend = 'normal') => ({ x, y, scale, rotation, opacity, distortion, blend });
export const DEFAULT_PARAMS = Object.freeze({
  crackDensity: .48, crackThickness: .58, fragmentSize: .55, fragmentDisplacement: .55,
  glassTransparency: .82, refraction: .82, seed: 11,
  morphIntensity: .25, eyeDistortion: .28, mouthDistortion: .23, faceDeformation: .25,
  faceTracking: false, showAnchors: false,
  ghostCount: 0, ghostOpacity: .18, layerDisplacement: .25, blendMode: 'normal',
  layers: [layer(-.018, .008, 1.012, -.025, .6, .45), layer(.022, -.014, .99, .035, .4, .75), layer(-.035, -.02, 1.025, -.045, .3, .6)],
  duration: 2.5, speed: 1, distortionIntensity: .82, loop: true, reconstruction: .35,
  chromatic: .18, grain: .04, blur: .12, reflection: .34, colorTreatment: 'neutral',
  anchors: DEFAULT_ANCHORS
});

export const PRESETS = Object.freeze({
  'Clear Glass': { crackThickness: .35, fragmentDisplacement: .2, refraction: .38, morphIntensity: .08, ghostCount: 0, distortionIntensity: .48, reflection: .18 },
  'Running Stream': { crackThickness: .65, fragmentDisplacement: .7, refraction: .9, morphIntensity: .22, ghostCount: 0, distortionIntensity: .9, reflection: .4 },
  'Turbulent Water': { crackThickness: .86, fragmentDisplacement: .92, refraction: 1, morphIntensity: .42, ghostCount: 0, distortionIntensity: 1, reflection: .52 },
  'Liquid Mirror': { crackThickness: .48, fragmentDisplacement: .62, refraction: .95, morphIntensity: .48, ghostCount: 1, ghostOpacity: .19, distortionIntensity: .85, blur: .24 },
  'Deep Current': { crackThickness: .72, fragmentDisplacement: .88, refraction: 1, morphIntensity: .62, ghostCount: 1, ghostOpacity: .25, distortionIntensity: 1, reflection: .2, duration: 3.2 }
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
  if (!PRESETS[name]) throw new Error(`Unknown Turbulent Glass preset: ${name}`);
  return normalizeFracturedParams({ ...current, ...PRESETS[name] });
}

export function serializeParams(params) { return JSON.stringify(normalizeFracturedParams(params)); }
export function deserializeParams(serialized) { return normalizeFracturedParams(JSON.parse(serialized)); }

export function geometryKey(params) { return `${params.seed}:${params.crackDensity.toFixed(3)}:${params.fragmentSize.toFixed(3)}`; }
