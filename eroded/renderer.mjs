import { normalizeParams, phaseAt } from './parameters.mjs';
import { erosionFields } from './fields.mjs';
const vertex=`#version 300 es
in vec2 position; out vec2 uv;
void main(){uv=(position+1.)*.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D image;
uniform vec2 anchors[5];
uniform float aspect,angle,seed,decayIntensity,coverage,softness,reconstruction,recoveryTiming;
uniform float smearAmount,smearDirection,smearTurbulence,edgeDrag,melt;
uniform float grain,noiseScale,staticIntensity,threshold,roughness;
uniform float contrast,blacks,washout,blur,bloom,textureAmount;
uniform float eyeErosion,mouthErosion,cheekCollapse,centerPreservation,oscillation;
uniform int style,faceAware,monochrome;
${erosionFields}
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
  // Broad stains only modulate where real photographic detail is torn.
  float regional=smoothstep(.25-.15*coverage,.62+.04*softness,broad*.42+medium*.58);
  float damage=clamp(strength*subject*(.22+regional*.94)*feature*(.82+.18*fine)*1.18,0.,1.);
  // Jagged horizontal bands create discontinuities; neighboring fragments may move in opposite directions.
  float bandCoord=uv.y*(12.+noiseScale*11.)+broad*2.5+sin(uv.x*4.+medium*3.)*.46;
  float bandId=floor(bandCoord);
  float bandRandom=hash(vec2(bandId,seed*.17));
  float bandShape=noise(vec2(uv.y*(28.+noiseScale*20.),seed*.013)+orbit*.72);
  float bandGate=smoothstep(.37,.67,bandShape*.65+bandRandom*.35);
  float narrow=1.-smoothstep(.025,.11,abs(fract(bandCoord)-.5));
  float xWindow=smoothstep(.3,.62,fbm(p*vec2(3.2,4.1)+orbit*.78+seed*.057)+(fine-.5)*roughness*.18);
  float tear=clamp(damage*(.25+bandGate*.68+narrow*.27)*(.25+xWindow*.75),0.,1.);
  float signedShift=(bandRandom-.5)*2.;
  float localJitter=noise(p*vec2(8.,18.)+orbit*.45+seed*.023)-.5;
  float xShift=(signedShift*(.035+.13*smearAmount)+localJitter*.025*smearTurbulence)*tear;
  xShift+=sin(uv.y*55.+medium*6.)*.006*edgeDrag*tear;
  float yShift=(medium-.5)*.017*melt*tear + (uv.x-.5)*smearDirection*.016*tear;
  float segment=floor(uv.x*7.+medium);
  float segmentCenter=(segment+.5)/7.;
  float stretch=(uv.x-segmentCenter)*(.08+.22*smearAmount)*tear*(hash(vec2(segment,bandId+seed))-.5);
  float swath=smoothstep(.43,.67,fbm(p*vec2(3.1,4.8)+orbit*.78+seed*.041)+medium*.08)*damage;
  vec2 swathPull=vec2((broad-.5)*.15+signedShift*.055,(medium-.5)*.018)*swath*smearAmount;
  vec2 displaced=clamp(uv+vec2(xShift+stretch,yShift)+swathPull,vec2(.002),vec2(.998));
  vec3 shifted=texture(image,displaced).rgb;
  // Very thin emulsion trails are copied from nearby source pixels, never synthesized from noise.
  float streakPattern=noise(vec2(uv.y*105.+medium*2.,seed*.027)+orbit*.18);
  float streak=smoothstep(.66,.78,streakPattern)*tear*edgeDrag;
  vec2 trailUv=clamp(displaced-vec2(signedShift*.023*smearAmount,0.),vec2(.002),vec2(.998));
  vec3 trail=texture(image,trailUv).rgb;
  vec3 imageColor=mix(original,shifted,clamp(tear*.81+swath*.27,0.,.78));
  imageColor=mix(imageColor,trail,streak*.55);
  vec3 diffuseTrail=(texture(image,clamp(displaced-vec2(.012*smearAmount,0.),vec2(.002),vec2(.998))).rgb+
                     texture(image,clamp(displaced+vec2(.006*smearAmount,.002),vec2(.002),vec2(.998))).rgb)*.5;
  imageColor=mix(imageColor,diffuseTrail,swath*(.12+.2*blur));
  // Erosion redistributes dark photographic material around torn edges.
  float breakup=smoothstep(.37,.7,fine*.65+medium*.35)*roughness;
  float ink=(1.-luminance(trail))*breakup*tear;
  if(style==1) imageColor-=vec3(ink*.25*blacks);
  else if(style==2) imageColor=mix(imageColor,trail,streak*.32*staticIntensity);
  else if(style==3) imageColor=mix(imageColor,trail,tear*.12*threshold);
  else imageColor-=vec3(ink*.1*threshold);
  // Contrast and grain remain subtle over the pale background.
  imageColor=(imageColor-.5)*(1.+contrast*.85)+.5;
  imageColor-=vec3(ink*.1*blacks);
  imageColor+=max(imageColor-.7,vec3(0.))*washout*.12;
  imageColor+=max(imageColor-.84,vec3(0.))*bloom*.06*subject;
  float grainValue=hash(gl_FragCoord.xy+orbit*1.6+seed)-.5;
  imageColor+=vec3(grainValue*(.018+.035*grain)*(.35+.65*subject));
  imageColor+=vec3((fine-.5)*textureAmount*.024*damage);
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
  this.uniforms=Object.fromEntries(['image','anchors[0]','aspect','angle','seed','decayIntensity','coverage','softness','reconstruction','smearAmount','smearDirection','smearTurbulence','edgeDrag','melt','grain','noiseScale','staticIntensity','threshold','roughness','contrast','blacks','washout','blur','bloom','textureAmount','eyeErosion','mouthErosion','cheekCollapse','centerPreservation','oscillation','recoveryTiming','style','faceAware','monochrome'].map(key=>[key,gl.getUniformLocation(program,key)]));this.source=null;
 }
 render(source,time,raw={},anchors=raw.anchors,dynamic=false){if(!source)return false;const p=normalizeParams(raw),gl=this.gl,u=this.uniforms;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);if(dynamic||source!==this.source){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);this.source=source}gl.uniform1i(u.image,0);const values={aspect:this.canvas.width/this.canvas.height,angle:phaseAt(time,p)*Math.PI*2,seed:p.seed,decayIntensity:p.decayIntensity,coverage:p.coverage,softness:p.softness,reconstruction:p.reconstruction,smearAmount:p.smearAmount,smearDirection:p.smearDirection,smearTurbulence:p.smearTurbulence,edgeDrag:p.edgeDrag,melt:p.melt,grain:p.grain,noiseScale:p.noiseScale,staticIntensity:p.staticIntensity,threshold:p.threshold,roughness:p.roughness,contrast:p.contrast,blacks:p.blacks,washout:p.washout,blur:p.blur,bloom:p.bloom,textureAmount:p.texture,eyeErosion:p.eyeErosion,mouthErosion:p.mouthErosion,cheekCollapse:p.cheekCollapse,centerPreservation:p.centerPreservation,oscillation:p.oscillation,recoveryTiming:p.recoveryTiming};for(const [key,val] of Object.entries(values))gl.uniform1f(u[key],val);gl.uniform1i(u.style,['dust','ink','signal','ash'].indexOf(p.style));gl.uniform1i(u.faceAware,p.faceAware?1:0);gl.uniform1i(u.monochrome,p.monochrome?1:0);gl.uniform2fv(u['anchors[0]'],(anchors||p.anchors).flatMap(a=>[a.x,1-a.y]));gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true}
 dispose(){const gl=this.gl;gl.deleteTexture(this.texture);gl.deleteBuffer(this.buffer);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.program);this.source=null}
}
