import { normalizeParams, phaseAt } from './parameters.mjs';
import { erosionFields } from './fields.mjs';
import { granularField } from './grains.mjs';
const vertex=`#version 300 es
in vec2 position; out vec2 uv;
void main(){uv=(position+1.)*.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D image;
uniform vec2 anchors[5];
uniform vec2 outputSize;
uniform float aspect,angle,seed,decayIntensity,coverage,softness,reconstruction,recoveryTiming;
uniform float smearAmount,smearDirection,smearTurbulence,edgeDrag,melt;
uniform float grain,noiseScale,staticIntensity,threshold,roughness;
uniform float contrast,blacks,washout,blur,bloom,textureAmount;
uniform float eyeErosion,mouthErosion,cheekCollapse,centerPreservation,oscillation;
uniform int style,faceAware,monochrome;
${erosionFields}
${granularField}
void main(){
  vec2 orbit=vec2(cos(angle),sin(angle));
  vec3 original=texture(image,uv).rgb;
  float clearPhase=exp(-pow(wrappedDistance(angle,2.75)/.82,2.));
  float strength=temporalDamage(angle,recoveryTiming)*decayIntensity*(1.-reconstruction*clearPhase*.43);
  strength*=1.+oscillation*.11*sin(angle*3.+uv.y*6.);
  float subject=subjectWeight(uv,original);
  vec2 p=uv*vec2(aspect,1.);
  float broad=fbm(p*vec2(2.1,2.7)+orbit*.84+seed*.013);
  float medium=fbm(p*vec2(5.3,9.4)+orbit*.95+seed*.031);
  float fine=noise(p*vec2(21.,37.)+orbit*.35+seed*.047);
  float feature=1.;
  if(faceAware==1){
    vec2 le=(uv-anchors[0])*vec2(aspect,1.),re=(uv-anchors[1])*vec2(aspect,1.);
    vec2 mouth=(uv-anchors[3])*vec2(aspect,1.),cheek=(uv-anchors[2])*vec2(aspect,1.)-vec2(.12,-.06);
    float eyeLeft=exp(-dot(le,le)*65.);
    float eyeRight=exp(-dot(re,re)*65.);
    feature+=eyeLeft*eyeErosion*.12+eyeRight*eyeErosion*.32;
    feature+=exp(-dot(mouth,mouth)*60.)*mouthErosion*.35;
    feature+=exp(-dot(cheek,cheek)*34.)*cheekCollapse*.25;
    feature-=exp(-dot((uv-anchors[2])*vec2(aspect,1.),(uv-anchors[2])*vec2(aspect,1.))*23.)*centerPreservation*.23;
  }
  // Irregular patches of the photographed subject are loosened into moving pigment.
  float regional=smoothstep(.27-.16*coverage,.62+.04*softness,broad*.49+medium*.51);
  float damage=clamp(strength*subject*(.3+regional*.9)*feature*(.8+.2*fine)*1.4,0.,1.);
  float swirl=noise(p*vec2(3.8,4.5)+orbit*.74+seed*.043)-.5;
  vec2 direction=normalize(vec2(1.,smearDirection*.38-melt*.2));
  vec2 flow=vec2((broad-.5)*.2+(medium-.5)*.14+swirl*.05*smearTurbulence,
                 (medium-.5)*.09+(fine-.5)*.018*melt);
  flow+=direction*(broad-.5)*.09*edgeDrag;
  flow*=damage*smearAmount;
  float grainSize=mix(1.55,2.7,1.-noiseScale);
  vec3 imageColor=shuffledGrains(uv,flow,damage,original,grainSize);
  // Soft residual photographic material follows the same flow, without horizontal slabs.
  vec3 dragged=texture(image,clamp(uv-flow*.7,vec2(.002),vec2(.998))).rgb;
  imageColor=mix(imageColor,dragged,damage*(.08+.1*blur)*(style==1?1.4:.7));
  if(style==1)imageColor-=vec3((1.-luminance(dragged))*damage*blacks*.07);
  if(style==2)imageColor=mix(imageColor,dragged,damage*staticIntensity*.12);
  if(style==3)imageColor=mix(imageColor,original,damage*.16);
  if(style==0)imageColor-=vec3((1.-luminance(dragged))*damage*threshold*.035);
  imageColor=(imageColor-.5)*(1.+contrast*.7)+.5;
  imageColor+=max(imageColor-.75,vec3(0.))*washout*.11;
  imageColor+=max(imageColor-.84,vec3(0.))*bloom*.04*subject;
  float fineGrain=hash(gl_FragCoord.xy+orbit*1.4+seed)-.5;
  imageColor+=vec3(fineGrain*(.008+.024*grain)*(.2+.8*subject));
  imageColor+=vec3((fine-.5)*textureAmount*.012*damage);
  if(monochrome==1)imageColor=vec3(luminance(imageColor));
  color=vec4(clamp(imageColor,vec3(0.),vec3(1.)),1.);
}`;
export class ErodedRenderer {
 constructor(canvas,width,height){
  this.canvas=canvas;canvas.width=width;canvas.height=height;
  const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,premultipliedAlpha:false});if(!gl)throw Error('Eroded Identity needs WebGL 2.');this.gl=gl;
  const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error)}return s};
  const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));this.program=program;
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const [key,val] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,val);
  this.uniforms=Object.fromEntries(['image','anchors[0]','outputSize','aspect','angle','seed','decayIntensity','coverage','softness','reconstruction','smearAmount','smearDirection','smearTurbulence','edgeDrag','melt','grain','noiseScale','staticIntensity','threshold','roughness','contrast','blacks','washout','blur','bloom','textureAmount','eyeErosion','mouthErosion','cheekCollapse','centerPreservation','oscillation','recoveryTiming','style','faceAware','monochrome'].map(key=>[key,gl.getUniformLocation(program,key)]));this.source=null;
 }
 render(source,time,raw={},anchors=raw.anchors,dynamic=false){if(!source)return false;const p=normalizeParams(raw),gl=this.gl,u=this.uniforms;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);if(dynamic||source!==this.source){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);this.source=source}gl.uniform1i(u.image,0);gl.uniform2f(u.outputSize,this.canvas.width,this.canvas.height);const values={aspect:this.canvas.width/this.canvas.height,angle:phaseAt(time,p)*Math.PI*2,seed:p.seed,decayIntensity:p.decayIntensity,coverage:p.coverage,softness:p.softness,reconstruction:p.reconstruction,smearAmount:p.smearAmount,smearDirection:p.smearDirection,smearTurbulence:p.smearTurbulence,edgeDrag:p.edgeDrag,melt:p.melt,grain:p.grain,noiseScale:p.noiseScale,staticIntensity:p.staticIntensity,threshold:p.threshold,roughness:p.roughness,contrast:p.contrast,blacks:p.blacks,washout:p.washout,blur:p.blur,bloom:p.bloom,textureAmount:p.texture,eyeErosion:p.eyeErosion,mouthErosion:p.mouthErosion,cheekCollapse:p.cheekCollapse,centerPreservation:p.centerPreservation,oscillation:p.oscillation,recoveryTiming:p.recoveryTiming};for(const [key,val] of Object.entries(values))gl.uniform1f(u[key],val);gl.uniform1i(u.style,['dust','ink','signal','ash'].indexOf(p.style));gl.uniform1i(u.faceAware,p.faceAware?1:0);gl.uniform1i(u.monochrome,p.monochrome?1:0);gl.uniform2fv(u['anchors[0]'],(anchors||p.anchors).flatMap(a=>[a.x,1-a.y]));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true}
 dispose(){const gl=this.gl;gl.deleteTexture(this.texture);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.program);this.source=null}
}
