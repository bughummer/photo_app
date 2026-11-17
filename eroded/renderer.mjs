import { normalizeParams, phaseAt, decayEnvelope } from './parameters.mjs';
const vertex=`#version 300 es
in vec2 position; out vec2 uv;
void main(){uv=(position+1.)*.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D image;
uniform vec2 anchors[5];
uniform float aspect,angle,envelope,seed,decayIntensity,coverage,softness,reconstruction;
uniform float smearAmount,smearDirection,smearTurbulence,edgeDrag,melt;
uniform float grain,noiseScale,staticIntensity,threshold,roughness;
uniform float contrast,blacks,washout,blur,bloom,textureAmount;
uniform float eyeErosion,mouthErosion,cheekCollapse,centerPreservation,oscillation;
uniform int style,faceAware;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.07+vec2(11,7))*.3+noise(p*4.13-vec2(5,13))*.15;}
float gray(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
  vec2 orbit=vec2(cos(angle),sin(angle));
  vec2 p=uv*vec2(aspect,1.);
  float scale=mix(3.5,12.,noiseScale);
  float broad=fbm(p*scale*.48+orbit*.65+seed*.017);
  float detail=fbm(p*scale+orbit*1.15+seed*.031);
  float region=detail*.62+broad*.38;
  float focus=1.;
  if(faceAware==1){
    vec2 d0=(uv-anchors[0])*vec2(aspect,1.),d1=(uv-anchors[1])*vec2(aspect,1.);
    vec2 dm=(uv-anchors[3])*vec2(aspect,1.),dc=(uv-anchors[2])*vec2(aspect,1.);
    float eyes=max(exp(-dot(d0,d0)*105.),exp(-dot(d1,d1)*105.));
    float mouth=exp(-dot(dm,dm)*85.);
    float cheek=exp(-dot(dc-vec2(.15,-.08),dc-vec2(.15,-.08))*31.);
    float center=exp(-dot(dc,dc)*28.);
    focus+=eyes*eyeErosion*.48+mouth*mouthErosion*.38+cheek*cheekCollapse*.45-center*centerPreservation*.35;
  }
  float mask=smoothstep(1.-coverage-softness*.23,1.-coverage+softness*.23,region+(.5-broad)*.12);
  float decay=clamp(mask*focus*decayIntensity*(.1+envelope*.9)*(1.+oscillation*.16*sin(angle*2.+detail*7.)),0.,1.);
  vec2 direction=normalize(vec2(cos(smearDirection*3.14159),sin(smearDirection*3.14159)-melt*.75));
  vec2 field=vec2(detail-.5,broad-.5)*smearTurbulence*.05;
  vec2 drag=(direction*(.01+.13*smearAmount)+field)*decay;
  drag+=direction*edgeDrag*decay*(1.-abs(mask-.5)*2.)*.03;
  drag+=vec2(0.,-1.)*melt*decay*max(0.,uv.y-.42)*.055;
  vec2 sampleUv=clamp(uv+drag,vec2(.002),vec2(.998));
  vec3 original=texture(image,uv).rgb;
  vec3 shifted=texture(image,sampleUv).rgb;
  float dragged=0.;
  for(int i=1;i<=4;i++) dragged+=gray(texture(image,clamp(sampleUv-direction*float(i)*.009*smearAmount*decay,vec2(.002),vec2(.998))).rgb);
  dragged*=.25;
  float base=gray(shifted);
  float smeared=mix(base,dragged,smearAmount*decay*.8);
  float dust=noise(p*scale*8.+orbit*1.6+seed*.13);
  float clustered=noise(p*scale*2.3-orbit*.85+seed*.09);
  float flecks=smoothstep(1.-threshold*.7,1.,dust*.7+clustered*.3);
  float ink=mix(smeared,smeared*(.45-.25*blacks)+broad*.12,decay);
  float ash=mix(smeared,mix(.7,smeared,clustered),decay*.8);
  float signal=mix(smeared,noise(vec2(floor(uv.y*270.)*.031,uv.x*18.)+orbit+seed)*.78,decay*staticIntensity);
  float broken=style==1?ink:style==2?signal:style==3?ash:mix(smeared,clamp(smeared+flecks*.6-(1.-flecks)*.25,0.,1.),decay);
  float value=mix(gray(original),broken,decay);
  value=mix(value,value*(1.-flecks*.7),decay*roughness*(style==3?.45:.7));
  value=mix(value,gray(original),reconstruction*(1.-envelope)*.15);
  value=(value-.5)*(1.+contrast*1.5)+.5;
  value-=blacks*(1.-value)*.22;
  value+=washout*max(0.,value-.65)*.27;
  float soft=gray(texture(image,clamp(uv+vec2(.002+blur*.005,0.),vec2(0.),vec2(1.))).rgb);
  value=mix(value,(value+soft)*.5,blur*decay*.45);
  value+=max(0.,value-.72)*bloom*.13;
  float particles=noise(gl_FragCoord.xy*(1.+noiseScale*2.)*.43+orbit*2.3+seed);
  value+=(particles-.5)*(grain*.1+textureAmount*decay*.2+staticIntensity*decay*(style==2?.2:.035));
  value+=(fbm(p*25.+seed)-.5)*textureAmount*.045;
  color=vec4(vec3(clamp(value,0.,1.)),1.);
}`;
export class ErodedRenderer {
 constructor(canvas,width,height){
  this.canvas=canvas;canvas.width=width;canvas.height=height;
  const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,premultipliedAlpha:false});if(!gl)throw Error('Eroded Identity needs WebGL 2.');this.gl=gl;
  const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error)}return s};
  const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));this.program=program;
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const [key,val] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,val);
  this.uniforms=Object.fromEntries(['image','anchors[0]','aspect','angle','envelope','seed','decayIntensity','coverage','softness','reconstruction','smearAmount','smearDirection','smearTurbulence','edgeDrag','melt','grain','noiseScale','staticIntensity','threshold','roughness','contrast','blacks','washout','blur','bloom','textureAmount','eyeErosion','mouthErosion','cheekCollapse','centerPreservation','oscillation','style','faceAware'].map(key=>[key,gl.getUniformLocation(program,key)]));this.source=null;
 }
 render(source,time,raw={},anchors=raw.anchors,dynamic=false){if(!source)return false;const p=normalizeParams(raw),gl=this.gl,u=this.uniforms;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);if(dynamic||source!==this.source){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);this.source=source}gl.uniform1i(u.image,0);const values={aspect:this.canvas.width/this.canvas.height,angle:phaseAt(time,p)*Math.PI*2,envelope:decayEnvelope(time,p),seed:p.seed,decayIntensity:p.decayIntensity,coverage:p.coverage,softness:p.softness,reconstruction:p.reconstruction,smearAmount:p.smearAmount,smearDirection:p.smearDirection,smearTurbulence:p.smearTurbulence,edgeDrag:p.edgeDrag,melt:p.melt,grain:p.grain,noiseScale:p.noiseScale,staticIntensity:p.staticIntensity,threshold:p.threshold,roughness:p.roughness,contrast:p.contrast,blacks:p.blacks,washout:p.washout,blur:p.blur,bloom:p.bloom,textureAmount:p.texture,eyeErosion:p.eyeErosion,mouthErosion:p.mouthErosion,cheekCollapse:p.cheekCollapse,centerPreservation:p.centerPreservation,oscillation:p.oscillation};for(const [key,val] of Object.entries(values))gl.uniform1f(u[key],val);gl.uniform1i(u.style,['dust','ink','signal','ash'].indexOf(p.style));gl.uniform1i(u.faceAware,p.faceAware?1:0);gl.uniform2fv(u['anchors[0]'],(anchors||p.anchors).flatMap(a=>[a.x,1-a.y]));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true}
 dispose(){const gl=this.gl;gl.deleteTexture(this.texture);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.program);this.source=null}
}
