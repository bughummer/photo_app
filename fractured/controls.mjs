import { DEFAULT_PARAMS, PRESETS, applyPreset, normalizeFracturedParams, serializeParams, deserializeParams } from './parameters.mjs';

const sections = [
  ['Fracture', [
    ['crackDensity','Crack density'],['crackThickness','Crack thickness'],['fragmentSize','Fragment size'],
    ['fragmentDisplacement','Fragment displacement'],['glassTransparency','Glass transparency'],['refraction','Refraction strength'],['seed','Random seed','seed']
  ]],
  ['Facial transformation', [
    ['morphIntensity','Morph intensity'],['eyeDistortion','Eye distortion'],['mouthDistortion','Mouth distortion'],
    ['faceDeformation','Overall face deformation'],['faceTracking','Face tracking','check'],['showAnchors','Edit face anchors','check']
  ]],
  ['Ghosting', [
    ['ghostCount','Ghost layers','count'],['ghostOpacity','Ghost opacity'],['layerDisplacement','Layer displacement'],
    ['blendMode','Blend mode','blend']
  ]],
  ['Animation', [
    ['duration','Cycle duration','duration'],['speed','Animation speed','speed'],['distortionIntensity','Distortion intensity'],
    ['loop','Loop','check'],['reconstruction','Reconstruction strength']
  ]],
  ['Styling', [
    ['chromatic','Chromatic aberration'],['grain','Film grain'],['blur','Optical blur'],['reflection','Glass reflection'],
    ['colorTreatment','Color treatment','color']
  ]]
];

export function mountFracturedControls(host, onChange, storageKey = 'photo-flow:fractured-identity') {
  host.classList.add('fractured-controls');
  let params;
  try { params = deserializeParams(localStorage.getItem(storageKey)); }
  catch { params = normalizeFracturedParams(DEFAULT_PARAMS); }
  const inputs = new Map();
  const outputs = new Map();
  const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const heading = element('div','fracture-intro');
  heading.append(element('strong','', 'Fractured Identity'),element('small','', 'A moving portrait beneath unstable optical glass. Drag the anchor markers to align facial regions.'));
  host.append(heading);
  const presetRow = element('div','fracture-preset-row');
  const preset = element('select'); preset.setAttribute('aria-label','Fractured Identity preset');
  preset.add(new Option('Custom preset',''));
  for (const name of Object.keys(PRESETS)) preset.add(new Option(name,name));
  const reset = element('button','button','Reset'); reset.type = 'button';
  presetRow.append(preset,reset); host.append(presetRow);
  const format = (key, type, value) => type === 'seed' || type === 'count' ? String(value) : type === 'duration' ? `${Number(value).toFixed(2)} s` : type === 'speed' ? `${Number(value).toFixed(2)}×` : `${Math.round(Number(value)*100)}%`;
  const addField = (container, key, label, type = 'range', layerIndex = null) => {
    const row = element('label',type === 'check' ? 'fracture-check' : 'slider-label');
    const title = element('span','',label);
    const output = element('output');
    const input = type === 'blend' || type === 'color' ? element('select') : element('input');
    input.dataset.param = key;
    if (layerIndex !== null) input.dataset.layer = String(layerIndex);
    if (type === 'check') { input.type = 'checkbox'; row.append(title,input); }
    else if (type === 'blend' || type === 'color') {
      const options = type === 'blend' ? ['normal','screen','multiply'] : ['neutral','cool','warm','monochrome'];
      for (const value of options) input.add(new Option(value[0].toUpperCase()+value.slice(1),value));
      row.append(title,input);
    } else {
      input.type = type === 'seed' ? 'number' : 'range';
      const bounds = type === 'seed' ? [0,999999999,1] : type === 'count' ? [0,3,1] : type === 'duration' ? [.5,5,.05] : type === 'speed' ? [.25,3,.05] : type === 'layer-offset' ? [-.2,.2,.005] : type === 'layer-scale' ? [.7,1.3,.005] : type === 'layer-rotation' ? [-.5,.5,.005] : [0,1,.01];
      [input.min,input.max,input.step] = bounds.map(String);
      row.append(title,output,input);
      outputs.set(`${layerIndex ?? 'main'}:${key}`,{ node:output,type });
    }
    inputs.set(`${layerIndex ?? 'main'}:${key}`,input);
    input.addEventListener('input', () => {
      const value = type === 'check' ? input.checked : type === 'blend' || type === 'color' ? input.value : Number(input.value);
      if (layerIndex === null) {
        params[key] = value;
        if (key === 'blendMode') for (const layer of params.layers) layer.blend = value;
      } else params.layers[layerIndex][key] = value;
      params = normalizeFracturedParams(params);
      output.textContent = type === 'check' || type === 'blend' || type === 'color' ? '' : format(key,type,value);
      preset.value = '';
      persist(key === 'seed' || key === 'crackDensity' || key === 'fragmentSize' ? 'geometry' : 'render');
    });
    container.append(row);
  };
  for (const [name, fields] of sections) {
    const details = element('details','fracture-section');
    details.open = name === 'Fracture' || name === 'Animation';
    details.append(element('summary','',name));
    for (const field of fields) addField(details,...field);
    if (name === 'Facial transformation') {
      const detect = element('button','button fracture-detect','Auto detect face'); detect.type = 'button';
      details.append(detect);
      host.detectButton = detect;
    }
    if (name === 'Ghosting') {
      for (let i = 0; i < 3; i++) {
        const nested = element('details','fracture-layer');
        nested.append(element('summary','',`Ghost layer ${i+1}`));
        for (const field of [['x','Horizontal offset','layer-offset'],['y','Vertical offset','layer-offset'],['scale','Scale','layer-scale'],['rotation','Rotation','layer-rotation'],['opacity','Opacity'],['distortion','Distortion'],['blend','Blend mode','blend']]) addField(nested,field[0],field[1],field[2],i);
        details.append(nested);
      }
    }
    host.append(details);
  }
  const seedRow = element('div','fracture-actions');
  const newSeed = element('button','button','New fracture'); newSeed.type = 'button';
  seedRow.append(newSeed); host.append(seedRow);
  function sync() {
    for (const [address,input] of inputs) {
      const [part,key] = address.split(':');
      const value = part === 'main' ? params[key] : params.layers[Number(part)][key];
      if (input.type === 'checkbox') input.checked = !!value;
      else input.value = String(value);
      const output = outputs.get(address);
      if (output) output.node.textContent = format(key,output.type,value);
    }
  }
  function persist(reason) {
    try { localStorage.setItem(storageKey,serializeParams(params)); } catch {}
    onChange?.(params,reason);
  }
  preset.addEventListener('change', () => { if (!preset.value) return; params = applyPreset(preset.value,params); sync(); persist('geometry'); });
  reset.addEventListener('click', () => { params = normalizeFracturedParams(DEFAULT_PARAMS); preset.value = ''; sync(); persist('geometry'); });
  newSeed.addEventListener('click', () => { params.seed = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000000; preset.value = ''; sync(); persist('geometry'); });
  sync();
  return { get: () => params, set(value, reason = 'render') { params = normalizeFracturedParams(value); preset.value = ''; sync(); persist(reason); }, detectButton: host.detectButton };
}
