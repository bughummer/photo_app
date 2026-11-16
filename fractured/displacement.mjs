export const displacementShader = `
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float valueNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),
             mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
}
vec2 organicWarp(vec2 uv) {
  vec2 flow=vec2(cos(uAngle),sin(uAngle));
  float n=valueNoise(uv*7.0+flow*.8+uSeed*.013);
  float m=valueNoise(uv*14.0-flow*.6+uSeed*.029);
  vec2 swirl=vec2(sin(uv.y*21.0+uAngle+n*3.0),cos(uv.x*19.0-uAngle+m*3.0));
  return (swirl*.55+vec2(n-.5,m-.5))*.012*uRefraction*uDistortion*uPulse;
}`;
