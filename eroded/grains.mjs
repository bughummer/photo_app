// Find the closest moving pigment grain from a small neighborhood of source-image cells.
// Its color always comes from the source image, never from a random texture.
export const granularField = `
vec3 shuffledGrains(vec2 uv,vec2 flow,float damage,vec3 original,float sizePx){
  vec2 pixelSize=sizePx/outputSize;
  vec2 estimate=uv-flow;
  vec2 base=floor(estimate/pixelSize);
  float closest=1e9;
  float chosenRadius=1.;
  vec2 sourceUv=uv;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 cell=base+vec2(float(x),float(y));
    float h=hash(cell+seed*.013);
    float k=hash(cell*1.731+seed*.027);
    vec2 jitter=vec2(h-.5,k-.5)*.66;
    vec2 origin=(cell+.5+jitter)*pixelSize;
    vec2 wobble=vec2(sin(angle+h*6.283),cos(angle+k*6.283))*(.08+.2*smearTurbulence)*damage*pixelSize;
    vec2 center=origin+flow+wobble;
    float distance=length((center-uv)/pixelSize);
    if(distance<closest){closest=distance;sourceUv=origin;chosenRadius=.28+.2*k;}
  }
  vec3 pigment=texture(image,clamp(sourceUv,vec2(.002),vec2(.998))).rgb;
  float particle=1.-smoothstep(chosenRadius-.08,chosenRadius+.18,closest);
  float pigmentWeight=mix(.4,1.,particle);
  vec3 paper=mix(original,vec3(1.),damage*.46);
  vec3 shuffled=mix(paper,pigment,pigmentWeight);
  shuffled*=1.-particle*(.08+.13*blacks)*(1.-luminance(pigment));
  return mix(original,shuffled,clamp(damage*(.95+.18*roughness),0.,.94));
}
`;
