import { normalizeEchoParams } from './temporal-echoes.mjs';

const vertexSource = `#version 300 es
in vec2 aPosition; out vec2 vUv;
void main(){ vUv=(aPosition+1.0)*0.5; gl_Position=vec4(aPosition,0.0,1.0); }`;
const fragmentSource = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uCurrent;
uniform sampler2D uEcho0; uniform sampler2D uEcho1; uniform sampler2D uEcho2; uniform sampler2D uEcho3;
uniform vec4 uWeights; uniform float uThreshold;
void main(){
 vec3 current=texture(uCurrent,vUv).rgb;
 vec3 color=current;
 vec3 old3=texture(uEcho3,vUv).rgb;
 vec3 old2=texture(uEcho2,vUv).rgb;
 vec3 old1=texture(uEcho1,vUv).rgb;
 vec3 old0=texture(uEcho0,vUv).rgb;
 float m3=smoothstep(uThreshold,uThreshold+.12,length(old3-current)/1.732);
 float m2=smoothstep(uThreshold,uThreshold+.12,length(old2-current)/1.732);
 float m1=smoothstep(uThreshold,uThreshold+.12,length(old1-current)/1.732);
 float m0=smoothstep(uThreshold,uThreshold+.12,length(old0-current)/1.732);
 color=mix(color,old3,uWeights.w*m3);
 color=mix(color,old2,uWeights.z*m2);
 color=mix(color,old1,uWeights.y*m1);
 color=mix(color,old0,uWeights.x*m0);
 outColor=vec4(color,1.0);
}`;

export class EchoWebGLRenderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL 2 is required for Temporal Echoes.');
    this.gl = gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message); }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { const message = gl.getProgramInfoLog(program); gl.deleteProgram(program); throw new Error(message); }
    this.program = program;
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    this.textures = Array.from({ length: 5 }, () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    this.uniforms = Object.fromEntries(['uCurrent', 'uEcho0', 'uEcho1', 'uEcho2', 'uEcho3', 'uWeights', 'uThreshold'].map(name => [name, gl.getUniformLocation(program, name)]));
    this.empty = new Uint8Array([0, 0, 0, 255]);
  }

  render(current, histories = [], rawParams = {}) {
    const gl = this.gl, params = normalizeEchoParams(rawParams), u = this.uniforms;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    const sources = [current, ...Array.from({ length: 4 }, (_, i) => histories[i] || null)];
    for (let index = 0; index < sources.length; index++) {
      gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      if (sources[index]) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sources[index]);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.empty);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.uniform1i(u[index ? `uEcho${index - 1}` : 'uCurrent'], index);
    }
    const weights = Array.from({ length: 4 }, (_, index) => index < params.count && histories[index] ? params.strength * Math.pow(.62, index) : 0);
    gl.uniform4fv(u.uWeights, weights);
    gl.uniform1f(u.uThreshold, params.threshold);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    const gl = this.gl;
    for (const texture of this.textures) gl.deleteTexture(texture);
    gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
  }
}
