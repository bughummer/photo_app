export const displacementShader = `
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float valueNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),
             mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
}
// Noise follows a closed orbit, so the flow loops without a jump.
vec2 waterFlow(vec2 uv) {
  vec2 orbit=vec2(cos(uAngle),sin(uAngle));
  vec2 p=uv*vec2(uAspect,1.0);
  float detail=mix(3.0,10.0,uCrackThickness);
  float large=valueNoise(p*2.7+orbit*.65+uSeed*.017);
  float medium=valueNoise(p*detail-orbit*.9+large*1.8+uSeed*.031);
  float fine=valueNoise(p*detail*2.3+orbit*1.4+uSeed*.043);
  float stream=p.x*2.2+p.y*.64+large*.48;
  float ribbon=sin(stream*6.283+medium*3.2+orbit.x*.8);
  float ripple=sin((p.y+medium*.11)*31.0-orbit.y*1.4+large*2.0);
  float strength=1.85*uRefraction*uDistortion*(.48+.52*uPulse);
  vec2 bend=vec2((medium-.5)*.05+(fine-.5)*.018+ribbon*.015,
                 (large-.5)*.038+(medium-.5)*.02+ripple*.009);
  bend+=vec2(ribbon*ripple*.006,-ribbon*.009)*uFragmentDisplacement;
  return bend*strength;
}
float waterCaustic(vec2 uv) {
  vec2 orbit=vec2(cos(uAngle),sin(uAngle));
  vec2 p=uv*vec2(uAspect,1.0);
  float n=valueNoise(p*5.0+orbit*.65+uSeed*.031);
  float ribbon=sin((p.x*.9+p.y*.42+n*.18)*35.0+orbit.x);
  return pow(max(0.0,ribbon),12.0)*(.35+.65*n);
}`;
