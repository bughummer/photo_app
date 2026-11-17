const defaults = {
  decayIntensity:.72, coverage:.52, softness:.48, style:'ink', reconstruction:.85, seed:17,
  smearAmount:.5, smearDirection:.12, smearTurbulence:.55, edgeDrag:.5, melt:.48,
  grain:.32, noiseScale:.5, staticIntensity:.18, threshold:.45, roughness:.55,
  contrast:.28, blacks:.35, washout:.12, blur:.28, bloom:.22, texture:.42, monochrome:false,
  faceAware:true, eyeErosion:.7, mouthErosion:.55, cheekCollapse:.58, centerPreservation:.55,
  duration:2.4, speed:1, loop:true, oscillation:.55, recoveryTiming:.76,
  anchors:[{x:.36,y:.4},{x:.64,y:.4},{x:.5,y:.55},{x:.5,y:.7},{x:.5,y:.82}]
};
export const DEFAULT_PARAMS=Object.freeze(defaults);
export const PRESETS=Object.freeze({
  'Soft Memory Fade':{decayIntensity:.35,coverage:.38,style:'ash',smearAmount:.18,grain:.18,contrast:.4,blacks:.3},
  'Signal Decay':{decayIntensity:.82,coverage:.7,style:'signal',staticIntensity:.8,threshold:.75,smearAmount:.55,grain:.52},
  'Ink Collapse':{decayIntensity:.9,coverage:.66,style:'ink',smearAmount:.85,edgeDrag:.85,melt:.75,blacks:.9},
  'Ashen Dissolve':{decayIntensity:.75,coverage:.76,style:'ash',grain:.65,roughness:.85,smearAmount:.3,texture:.75},
  'Identity Failure':{decayIntensity:1,coverage:.83,style:'dust',eyeErosion:.95,mouthErosion:.85,cheekCollapse:.9,smearAmount:.8,oscillation:.9,reconstruction:1}
});
const clamp=(v,a,b,f)=>Number.isFinite(Number(v))?Math.min(b,Math.max(a,Number(v))):f;
export function normalizeParams(raw={}){
  const p={...defaults,...raw};
  for(const key of Object.keys(defaults)) if(typeof defaults[key]==='number' && key!=='seed' && key!=='duration' && key!=='speed' && key!=='smearDirection') p[key]=clamp(p[key],0,1,defaults[key]);
  p.seed=Math.round(clamp(p.seed,0,999999999,defaults.seed));
  p.duration=clamp(p.duration,.5,8,defaults.duration); p.speed=clamp(p.speed,.25,3,defaults.speed);
  p.smearDirection=clamp(p.smearDirection,-1,1,defaults.smearDirection);
  p.style=['dust','ink','signal','ash'].includes(p.style)?p.style:'ink';
  p.faceAware=!!p.faceAware; p.loop=!!p.loop;
  p.monochrome=!!p.monochrome;
  p.anchors=defaults.anchors.map((a,i)=>({x:clamp(raw.anchors?.[i]?.x,0,1,a.x),y:clamp(raw.anchors?.[i]?.y,0,1,a.y)}));
  return p;
}
export function phaseAt(time,raw=defaults){const p=normalizeParams(raw);const cycle=time*p.speed/p.duration;return p.loop?((cycle%1)+1)%1:Math.min(1,Math.max(0,cycle));}
export function decayEnvelope(time,raw=defaults){const p=normalizeParams(raw), t=phaseAt(time,p);const smooth=(a,b,x)=>{const v=Math.min(1,Math.max(0,(x-a)/(b-a)));return v*v*(3-2*v)};return smooth(.12,.44,t)*(1-smooth(Math.max(.55,p.recoveryTiming-.18),Math.min(.98,p.recoveryTiming+.2),t))*(1-.32*p.reconstruction);}
export const serializeParams=p=>JSON.stringify(normalizeParams(p));
export const deserializeParams=s=>normalizeParams(JSON.parse(s));
export const applyPreset=(name,current=defaults)=>normalizeParams({...current,...PRESETS[name]});
