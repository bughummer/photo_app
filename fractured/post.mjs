export const postShader = `
vec3 finishColor(vec2 uv, vec3 color, vec2 displacement, float edge, float reflectionNoise) {
  vec2 split=displacement*.12+vec2(edge*.003,0.0);
  split*=uChromatic;
  color.r=mix(color.r,texture(uImage,clamp(uv+split,vec2(0.),vec2(1.))).r,uChromatic*.42);
  color.b=mix(color.b,texture(uImage,clamp(uv-split,vec2(0.),vec2(1.))).b,uChromatic*.42);
  float specular=pow(max(0.0,edge*(.5+.5*reflectionNoise)),2.0)*uReflection*.42;
  color+=vec3(.7,.83,1.)*specular*(1.0-uGlassTransparency*.45);
  float fissure=smoothstep(.48,.82,edge*(.85+uCrackThickness*1.25));
  color*=1.0-fissure*(.5+uCrackThickness*.3);
  float grain=hash21(gl_FragCoord.xy+vec2(cos(uAngle),sin(uAngle))*113.0+uSeed)-.5;
  color+=grain*uGrain*.13;
  if(uColorTreatment==1) color*=vec3(.91,1.0,1.08);
  if(uColorTreatment==2) color*=vec3(1.08,1.0,.91);
  if(uColorTreatment==3) { float l=dot(color,vec3(.2126,.7152,.0722)); color=mix(color,vec3(l),.88); }
  return clamp(color,vec3(0.),vec3(1.));
}`;
