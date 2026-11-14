import { effectShader, normalizeEffect } from './effect-interface.mjs';

const vertexShader = `#version 300 es
  in vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

export class WebGL2VideoRenderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL 2 is required for video effects.');
    this.gl = gl;
    const compile = (type, code) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl.FRAGMENT_SHADER, effectShader);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    this.program = program;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.uniforms = Object.fromEntries(['uImage', 'uStrokeImage', 'uBrushMask', 'uUseBrushMask', 'uResolution', 'uCenter', 'uDelta', 'uRadius', 'uStrength', 'uSeed', 'uStrokeSeed', 'uDirection', 'uMode', 'uGlow'].map(name => [name, gl.getUniformLocation(program, name)]));
  }

  render(source, rawEffect) {
    const effect = normalizeEffect(rawEffect);
    const gl = this.gl;
    const width = this.canvas.width, height = this.canvas.height, u = this.uniforms;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(u.uImage, 0);
    gl.uniform1i(u.uStrokeImage, 0);
    gl.uniform1i(u.uUseBrushMask, 0);
    gl.uniform2f(u.uResolution, width, height);
    gl.uniform2f(u.uCenter, effect.centerX * width, (1 - effect.centerY) * height);
    gl.uniform2f(u.uDelta, effect.deltaX * width, -effect.deltaY * height);
    gl.uniform1f(u.uRadius, effect.radius * Math.min(width, height));
    gl.uniform1f(u.uStrength, effect.strength);
    gl.uniform1f(u.uSeed, effect.seed);
    gl.uniform1f(u.uStrokeSeed, effect.seed);
    const length = Math.hypot(effect.deltaX, effect.deltaY);
    gl.uniform2f(u.uDirection, length ? effect.deltaX / length : 1, length ? -effect.deltaY / length : 0);
    gl.uniform1i(u.uMode, effect.mode);
    gl.uniform1i(u.uGlow, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
