import { DEFAULT_PARAMS, PRESETS, applyPreset, normalizeParams, serializeParams, deserializeParams } from './parameters.mjs';
const sections={
 Decay:[['decayIntensity','Decay intensity'],['coverage','Decay coverage'],['softness','Decay softness'],['style','Decay style','style'],['reconstruction','Reconstruction'],['seed','Random seed','seed']],
 Smear:[['smearAmount','Smear amount'],['smearDirection','Smear direction','direction'],['smearTurbulence','Smear turbulence'],['edgeDrag','Edge drag'],['melt','Melt amount']],
 Noise:[['grain','Grain intensity'],['noiseScale','Noise scale'],['staticIntensity','Static intensity'],['threshold','Threshold breakup'],['roughness','Texture roughness']],
 'Tonal style':[['monochrome','Monochrome','check'],['contrast','Contrast'],['blacks','Black ink shadows'],['washout','Highlight washout'],['blur','Blur'],['bloom','Bloom'],['texture','Charcoal / paper texture']],
 'Face emphasis':[['faceAware','Face-aware mode','check'],['eyeErosion','Eye erosion'],['mouthErosion','Mouth erosion'],['cheekCollapse','Cheek collapse'],['centerPreservation','Center preservation'],['showAnchors','Edit anchors','check']],
 Animation:[['duration','Duration','duration'],['speed','Speed','speed'],['loop','Loop','check'],['oscillation','Oscillation'],['recoveryTiming','Recovery timing']]
};
export function mountErodedControls(host,onChange,storageKey='photo-flow:eroded-identity'){
 host.classList.add('fractured-controls');let params;try{params=deserializeParams(localStorage.getItem(storageKey))}catch{params=normalizeParams()}
 const inputs=new Map(), outputs=new Map();
 const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e};
 const intro=element('div','fracture-intro');intro.append(element('strong','', 'Eroded Identity'),element('small','', 'Dissolve and reconstruct the image in its original colors. Switch on Monochrome when you want a black and white treatment.'));host.append(intro);
 const row=element('div','fracture-preset-row'),preset=element('select');preset.setAttribute('aria-label','Eroded Identity preset');preset.add(new Option('Custom preset',''));for(const name of Object.keys(PRESETS))preset.add(new Option(name,name));const reset=element('button','button','Reset');reset.type='button';row.append(preset,reset);host.append(row);
 const sync=()=>{for(const [key,input] of inputs){const val=params[key];if(input.type==='checkbox')input.checked=!!val;else input.value=String(val);const out=outputs.get(key);if(out)out.textContent=key==='duration'?`${Number(val).toFixed(2)} s`:key==='speed'?`${Number(val).toFixed(2)}×`:key==='seed'?String(val):key==='smearDirection'?`${Math.round(Number(val)*180)}°`:`${Math.round(Number(val)*100)}%`}};
 const persist=()=>{try{localStorage.setItem(storageKey,serializeParams(params))}catch{}onChange?.(params)};
 for(const [group,fields] of Object.entries(sections)){
  const details=element('details','fracture-section');details.open=group==='Decay'||group==='Animation';details.append(element('summary','',group));
  for(const [key,label,type='range'] of fields){const field=element('label',type==='check'?'fracture-check':'slider-label'),name=element('span','',label),input=type==='style'?element('select'):element('input'),out=element('output');input.dataset.param=key;
   if(type==='check'){input.type='checkbox';field.append(name,input)}else if(type==='style'){for(const value of ['dust','ink','signal','ash'])input.add(new Option(value[0].toUpperCase()+value.slice(1),value));field.append(name,input)}else{input.type=type==='seed'?'number':'range';const [min,max,step]=type==='seed'?[0,999999999,1]:type==='duration'?[.5,8,.05]:type==='speed'?[.25,3,.05]:type==='direction'?[-1,1,.01]:[0,1,.01];input.min=String(min);input.max=String(max);input.step=String(step);field.append(name,out,input);outputs.set(key,out)}
   inputs.set(key,input);input.addEventListener('input',()=>{params=normalizeParams({...params,[key]:type==='check'?input.checked:type==='style'?input.value:Number(input.value)});preset.value='';sync();persist()});details.append(field)
  }
  if(group==='Face emphasis'){const detect=element('button','button','Auto detect face');detect.type='button';details.append(detect);host.detectButton=detect}
  host.append(details)
 }
 const seedButton=element('button','button','New variation');seedButton.type='button';host.append(seedButton);seedButton.addEventListener('click',()=>{params=normalizeParams({...params,seed:crypto.getRandomValues(new Uint32Array(1))[0]%1000000000});preset.value='';sync();persist()});
 preset.addEventListener('change',()=>{if(!preset.value)return;params=applyPreset(preset.value,params);sync();persist()});reset.addEventListener('click',()=>{params=normalizeParams(DEFAULT_PARAMS);preset.value='';sync();persist()});sync();
 return{get:()=>params,set(value){params=normalizeParams(value);preset.value='';sync();persist()},detectButton:host.detectButton};
}
