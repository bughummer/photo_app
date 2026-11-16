export const ghostShader = `
float featureMask(vec2 uv, float edge) {
  float mask=edge*.38;
  for(int i=0;i<4;i++) {
    vec2 delta=(uv-uAnchors[i])*vec2(uAspect,1.0);
    float radius=i<2 ? .13 : i==2 ? .14 : .16;
    mask=max(mask,exp(-dot(delta,delta)/(radius*radius)));
  }
  return clamp(mask,0.0,1.0);
}
vec3 compositeGhosts(vec2 uv, vec3 base, vec2 fragmentDir, float edge) {
  vec3 color=base;
  float region=featureMask(uv,edge);
  for(int i=0;i<3;i++) {
    if(i>=uGhostCount) break;
    vec4 transform=uGhostTransform[i];
    vec4 style=uGhostStyle[i];
    float turn=transform.w+sin(uAngle+float(i)*1.7)*.013*uPulse;
    vec2 local=uv-.5;
    vec2 turned=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*local/max(.7,transform.z);
    vec2 shifted=turned+.5+transform.xy*uLayerDisplacement*uPulse;
    shifted+=fragmentDir*style.y*.015*uPulse;
    vec3 old=texture(uImage,clamp(shifted,vec2(.001),vec2(.999))).rgb;
    float alpha=uGhostOpacity*style.x*region*uPulse*(1.0-float(i)*.16);
    int blend=int(style.z+.5);
    vec3 mixed=blend==1 ? 1.0-(1.0-color)*(1.0-old) : blend==2 ? color*old : old;
    color=mix(color,mixed,clamp(alpha,0.0,.8));
  }
  return color;
}`;
