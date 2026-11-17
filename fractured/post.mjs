export const postShader = `
vec3 finishColor(vec2 uv, vec3 color, vec2 displacement, float caustic, float reflectionNoise) {
  vec2 split=displacement*.32*uChromatic;
  color.r=mix(color.r,texture(uImage,clamp(uv+split,vec2(0.),vec2(1.))).r,uChromatic*.5);
  color.b=mix(color.b,texture(uImage,clamp(uv-split,vec2(0.),vec2(1.))).b,uChromatic*.5);
  color+=vec3(.75,.9,1.0)*caustic*uReflection*.17*(.35+.65*reflectionNoise);
  float grain=hash21(gl_FragCoord.xy+vec2(cos(uAngle),sin(uAngle))*113.0+uSeed)-.5;
  color+=grain*uGrain*.09;
  if(uColorTreatment==1) color*=vec3(.94,1.0,1.06);
  if(uColorTreatment==2) color*=vec3(1.06,1.0,.94);
  if(uColorTreatment==3) { float l=dot(color,vec3(.2126,.7152,.0722)); color=mix(color,vec3(l),.88); }
  return clamp(color,vec3(0.),vec3(1.));
}`;
