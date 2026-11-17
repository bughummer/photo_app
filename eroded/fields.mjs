// Shared, periodic fields for image and video rendering. Every time coordinate follows a closed orbit.
export const erosionFields = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.03+vec2(7,11))*.3+noise(p*4.07-vec2(13,5))*.15;}
float luminance(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float wrappedDistance(float a,float b){return abs(atan(sin(a-b),cos(a-b)));}
float temporalDamage(float phase,float recovery){
  float early=exp(-pow(wrappedDistance(phase,0.)/(1.4+.65*recovery),2.));
  float late=exp(-pow(wrappedDistance(phase,4.45+.7*recovery)/1.16,2.));
  return clamp(max(early,late),0.,1.);
}
float subjectWeight(vec2 uv,vec3 original){
  float tone=1.-smoothstep(.58,.83,luminance(original));
  vec3 neighbor=texture(image,clamp(uv+vec2(.005,0.),vec2(0.),vec2(1.))).rgb;
  float edge=clamp(length(neighbor-original)*2.6,0.,1.);
  return clamp(.09+tone*.78+edge*.5,0.,1.);
}
`;
