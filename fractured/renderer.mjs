import { animationState } from './animation.mjs';
import { normalizeFracturedParams } from './parameters.mjs';
import { displacementShader } from './displacement.mjs';
import { faceShader } from './face.mjs';
import { ghostShader } from './ghost.mjs';
import { postShader } from './post.mjs';

const vertexSource = `#version 300 es
in vec2 aPosition; out vec2 vUv;
void main(){ vUv=(aPosition+1.0)*.5; gl_Position=vec4(aPosition,0.,1.); }`;
const fragmentSource = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uImage, uGeometry, uMetaA, uMetaB;
uniform float uGeometrySize,uAspect,uAngle,uPulse,uSeed;
uniform float uCrackThickness,uFragmentDisplacement,uGlassTransparency,uRefraction;
uniform float uMorphIntensity,uEye,uMouth,uFaceDeformation,uGhostOpacity,uLayerDisplacement;
uniform float uDistortion,uChromatic,uGrain,uBlur,uReflection;
uniform int uGhostCount,uColorTreatment;
uniform vec2 uAnchors[5];
uniform vec4 uGhostTransform[3],uGhostStyle[3];
${displacementShader}
${faceShader}
${ghostShader}
${postShader}
void main(){
  vec2 mapUv=vec2(vUv.x,1.0-vUv.y);
  vec2 grid=clamp(mapUv,vec2(0.),vec2(.999999))*uGeometrySize;
  int id=int(texelFetch(uGeometry,ivec2(grid),0).r*255.0+.5);
  vec4 geometry=texture(uGeometry,mapUv);
  vec4 fragment=texelFetch(uMetaA,ivec2(id,0),0);
  vec4 style=texelFetch(uMetaB,ivec2(id,0),0);
  vec2 direction=normalize(fragment.xy*2.0-1.0+vec2(.001));
  float rotation=(fragment.z-.5)*.1*uFragmentDisplacement*uPulse;
  vec2 centered=vUv-.5;
  vec2 rotated=mat2(cos(rotation),-sin(rotation),sin(rotation),cos(rotation))*centered;
  vec2 offset=direction*(.005+.035*uFragmentDisplacement)*uRefraction*uPulse*(.6+style.z*.4);
  vec2 warping=organicWarp(vUv)+faceWarp(vUv)+offset+(rotated-centered);
  warping+=direction*geometry.g*.012*uRefraction*uPulse;
  vec2 source=clamp(vUv+warping,vec2(.002),vec2(.998));
  vec3 refracted=texture(uImage,source).rgb;
  vec2 blurStep=vec2(1.0/900.0,1.0/900.0)*uBlur*(.4+geometry.g*.6);
  vec3 softened=(texture(uImage,clamp(source+blurStep,vec2(.002),vec2(.998))).rgb+
                 texture(uImage,clamp(source-blurStep,vec2(.002),vec2(.998))).rgb)*.5;
  refracted=mix(refracted,softened,uBlur*.42);
  vec3 original=texture(uImage,vUv).rgb;
  vec3 base=mix(original,refracted,clamp(.45+uRefraction*.42+(1.0-uGlassTransparency)*.14,0.,1.));
  base=compositeGhosts(source,base,direction,geometry.g);
  base=finishColor(source,base,warping,geometry.g,geometry.b*style.w);
  outColor=vec4(base,1.0);
}`;

export class FracturedRenderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('Fractured Identity needs WebGL 2.');
    this.gl = gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error); }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { const error = gl.getProgramInfoLog(program); gl.deleteProgram(program); throw new Error(error); }
    this.program = program;
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program,'aPosition');
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    this.textures = Array.from({ length: 4 }, () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      return texture;
    });
    this.uniforms = Object.fromEntries(['uImage','uGeometry','uMetaA','uMetaB','uGeometrySize','uAspect','uAngle','uPulse','uSeed','uCrackThickness','uFragmentDisplacement','uGlassTransparency','uRefraction','uMorphIntensity','uEye','uMouth','uFaceDeformation','uGhostOpacity','uLayerDisplacement','uDistortion','uChromatic','uGrain','uBlur','uReflection','uGhostCount','uColorTreatment','uAnchors[0]','uGhostTransform[0]','uGhostStyle[0]'].map(key => [key,gl.getUniformLocation(program,key)]));
    this.source = null;
    this.geometry = null;
  }

  setGeometry(geometry) {
    const gl = this.gl;
    this.geometry = geometry;
    const upload = (index, width, height, pixels, filter) => {
      gl.activeTexture(gl.TEXTURE0+index); gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    };
    upload(1,geometry.resolution,geometry.resolution,geometry.map,gl.LINEAR);
    upload(2,64,1,geometry.metaA,gl.NEAREST);
    upload(3,64,1,geometry.metaB,gl.NEAREST);
  }

  render(source, time, rawParams = {}, anchors = rawParams.anchors, dynamicSource = false) {
    if (!this.geometry || !source) return false;
    const params = normalizeFracturedParams(rawParams), state = animationState(time,params);
    const gl = this.gl, u = this.uniforms;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    for (let i = 0; i < 4; i++) { gl.activeTexture(gl.TEXTURE0+i); gl.bindTexture(gl.TEXTURE_2D,this.textures[i]); }
    if (dynamicSource || this.source !== source) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      this.source = source;
    }
    for (const [name,slot] of [['uImage',0],['uGeometry',1],['uMetaA',2],['uMetaB',3]]) gl.uniform1i(u[name],slot);
    const floats = { uGeometrySize:this.geometry.resolution,uAspect:this.canvas.width/this.canvas.height,uAngle:state.angle,uPulse:state.pulse,uSeed:params.seed,
      uCrackThickness:params.crackThickness,uFragmentDisplacement:params.fragmentDisplacement,uGlassTransparency:params.glassTransparency,uRefraction:params.refraction,
      uMorphIntensity:params.morphIntensity,uEye:params.eyeDistortion,uMouth:params.mouthDistortion,uFaceDeformation:params.faceDeformation,
      uGhostOpacity:params.ghostOpacity,uLayerDisplacement:params.layerDisplacement,uDistortion:params.distortionIntensity,
      uChromatic:params.chromatic,uGrain:params.grain,uBlur:params.blur,uReflection:params.reflection };
    for (const [name,value] of Object.entries(floats)) gl.uniform1f(u[name],value);
    gl.uniform1i(u.uGhostCount,params.ghostCount);
    gl.uniform1i(u.uColorTreatment,['neutral','cool','warm','monochrome'].indexOf(params.colorTreatment));
    const positions = (anchors || params.anchors).flatMap(anchor => [anchor.x,1-anchor.y]);
    gl.uniform2fv(u['uAnchors[0]'],positions);
    const transforms = params.layers.flatMap(layer => [layer.x,layer.y,layer.scale,layer.rotation]);
    const styles = params.layers.flatMap(layer => [layer.opacity,layer.distortion,['normal','screen','multiply'].indexOf(layer.blend || params.blendMode),0]);
    gl.uniform4fv(u['uGhostTransform[0]'],transforms);
    gl.uniform4fv(u['uGhostStyle[0]'],styles);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    return true;
  }

  dispose() {
    const gl = this.gl;
    for (const texture of this.textures) gl.deleteTexture(texture);
    gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    this.source = this.geometry = null;
  }
}
