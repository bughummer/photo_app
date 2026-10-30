(() => {
  const canvas = document.getElementById('canvas');
  const stage = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  const $ = id => document.getElementById(id);
  const state = { ready: false, brush: 'smear', size: 120, strength: 0.5, dragging: false, pointer: null, momentum: null, history: [], seed: 0, strokeSeed: 0, direction: { x: 1, y: 0 }, brushTexture: null, brushBitmap: null, brushCanvas: null, brushMode: null, dirty: false };
  if (!gl) {
    $('empty').querySelector('p').textContent = 'This app needs a browser or graphics driver with WebGL 2 support.';
    return;
  }

  const vertex = `#version 300 es
    in vec2 aPosition;
    out vec2 vUV;
    void main() { vUV = (aPosition + 1.0) * 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }`;
  const effect = `#version 300 es
    precision highp float;
    uniform sampler2D uImage;
    uniform sampler2D uStrokeImage;
    uniform sampler2D uBrushMask;
    uniform int uUseBrushMask;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform vec2 uDelta;
    uniform float uRadius;
    uniform float uStrength;
    uniform float uSeed;
    uniform float uStrokeSeed;
    uniform vec2 uDirection;
    uniform int uMode;
    out vec4 fragColor;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 cell = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
                 mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), f.x), f.y);
    }
    float waterHeight(vec2 p) {
      vec2 q = p * 0.018 + vec2(uStrokeSeed * 0.17, uStrokeSeed * 0.11);
      float flow = noise(q * 0.9 + vec2(uSeed * 0.008, -uSeed * 0.006));
      float broad = noise(q * 1.8 + vec2(flow * 1.7, -flow * 0.9));
      float fine = noise(q * 4.0 - vec2(flow * 0.7));
      float wave = sin(dot(p, vec2(0.04, 0.023)) + flow * 5.0 - uSeed * 0.09);
      return broad * 0.7 + fine * 0.2 + wave * 0.18;
    }
    void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 diff = p - uCenter;
      float d = length(diff);
      float falloff = pow(max(0.0, 1.0 - d / max(1.0, uRadius)), 1.7);
      if (uUseBrushMask == 1) {
        vec2 maskUV = diff / (2.0 * max(1.0, uRadius)) + 0.5;
        float inside = step(0.0, maskUV.x) * step(maskUV.x, 1.0) * step(0.0, maskUV.y) * step(maskUV.y, 1.0);
        falloff = inside * texture(uBrushMask, clamp(maskUV, vec2(0.0), vec2(1.0))).a;
      }
      vec2 source = p;
      if (uMode == 0) {
        source -= uDelta * falloff * uStrength * 1.6;
      } else if (uMode == 1) {
        float angle = -uStrength * falloff * (0.35 + min(length(uDelta) / 30.0, 1.5));
        float c = cos(angle), s = sin(angle);
        source = uCenter + mat2(c, -s, s, c) * diff;
      } else if (uMode == 2) {
        source = uCenter + diff * (1.0 - 0.42 * uStrength * falloff);
      } else if (uMode == 3) {
        vec2 cell = floor(p / 4.0);
        vec2 jitter = vec2(hash(cell + uSeed), hash(cell.yx + uSeed * 1.37)) * 2.0 - 1.0;
        source -= (uDelta * 0.8 + jitter * uRadius * 0.22) * falloff * uStrength;
      } else if (uMode == 4) {
        vec2 axis = normalize(uDirection);
        vec2 side = vec2(-axis.y, axis.x);
        vec2 texturePoint = p + vec2(uStrokeSeed * 23.7, uStrokeSeed * 11.3);
        float broad = noise(texturePoint * 0.025);
        float fine = noise(texturePoint * 0.16);
        float edge = falloff + (broad - 0.5) * 0.42 + (fine - 0.5) * 0.14;
        float coverage = smoothstep(0.035, 0.28, edge);
        float ribbons = sin(dot(diff, side) * 0.12 + broad * 3.0);
        float ribbonMask = smoothstep(-0.65, 0.35, ribbons);
        float shards = noise(texturePoint * 0.09 + broad * 2.0);
        float streaks = noise(vec2(dot(texturePoint, side) * 0.08, dot(texturePoint, axis) * 0.012));
        float brokenEdge = smoothstep(0.02, 0.18, falloff) * (1.0 - smoothstep(0.2, 0.55, falloff));
        coverage = max(coverage * smoothstep(0.18, 0.42, shards), brokenEdge * smoothstep(0.65, 0.83, shards) * 0.85);
        coverage *= mix(0.5, 1.0, ribbonMask) * mix(0.35, 1.0, streaks);
        float pull = (length(uDelta) * 3.0 + uRadius * 0.1) * uStrength * coverage;
        vec2 pulledPoint = p - axis * pull - side * (broad - 0.5) * uRadius * 0.12 * uStrength;
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        vec4 dragged = texture(uStrokeImage, clamp(pulledPoint / uResolution, vec2(0.0), vec2(1.0)));
        float flecks = smoothstep(0.78, 0.9, fine) * coverage * uStrength * 0.25;
        fragColor = mix(base, dragged, clamp(coverage * uStrength * 1.45 + flecks, 0.0, 1.0));
        return;
      } else if (uMode == 5) {
        vec2 gradient = vec2(
          waterHeight(p + vec2(2.0, 0.0)) - waterHeight(p - vec2(2.0, 0.0)),
          waterHeight(p + vec2(0.0, 2.0)) - waterHeight(p - vec2(0.0, 2.0))
        );
        vec2 warp = (gradient * uRadius * 0.22 + uDelta * 0.65) * uStrength * falloff;
        vec2 refracted = clamp((p - warp) / uResolution, vec2(0.0), vec2(1.0));
        vec2 fringe = normalize(gradient + vec2(0.0001)) * min(length(gradient) * 10.0, 2.5) * uStrength * falloff / uResolution;
        vec4 color = texture(uImage, refracted);
        color.r = texture(uImage, clamp(refracted + fringe, vec2(0.0), vec2(1.0))).r;
        color.b = texture(uImage, clamp(refracted - fringe, vec2(0.0), vec2(1.0))).b;
        float glint = smoothstep(0.75, 1.05, waterHeight(p)) * falloff * uStrength * 0.04;
        fragColor = vec4(min(color.rgb + vec3(glint * 0.8, glint, glint * 1.2), vec3(1.0)), color.a);
        return;
      } else if (uMode == 6) {
        vec2 axis = normalize(uDirection);
        vec2 side = vec2(-axis.y, axis.x);
        vec2 q = p * 0.027 + vec2(uStrokeSeed * 0.19, uSeed * 0.015);
        float curl = noise(q * 0.8);
        float tendril = sin(dot(diff, side) * 0.12 + curl * 7.0 + dot(diff, axis) * 0.025);
        float thinTendril = sin(dot(diff, side) * 0.23 - curl * 9.0 + dot(diff, axis) * 0.04);
        float filaments = max(smoothstep(0.58, 0.95, tendril * 0.5 + 0.5), smoothstep(0.75, 0.98, thinTendril * 0.5 + 0.5) * 0.6);
        float gaps = smoothstep(0.22, 0.75, noise(q * 2.3 + curl));
        float haze = noise(q * 1.2 + vec2(3.1, 7.7)) * 0.12;
        float envelope = uUseBrushMask == 1 ? falloff : pow(max(0.0, 1.0 - d / max(1.0, uRadius)), 0.8);
        float density = clamp((filaments * gaps + haze) * envelope * uStrength * 1.35, 0.0, 0.85);
        vec2 pull = axis * (uRadius * 0.4 + length(uDelta) * 1.8) * uStrength * envelope;
        pull += side * (curl - 0.5) * uRadius * 0.24 * envelope;
        vec2 sourceUV = clamp((p - pull) / uResolution, vec2(0.0), vec2(1.0));
        vec3 carried = texture(uStrokeImage, sourceUV).rgb;
        vec3 soft = texture(uStrokeImage, clamp(sourceUV + side * 3.0 / uResolution, vec2(0.0), vec2(1.0))).rgb;
        vec4 base = texture(uImage, clamp(p / uResolution, vec2(0.0), vec2(1.0)));
        fragColor = vec4(mix(base.rgb, mix(carried, soft, 0.35), density), base.a);
        return;
      }
      fragColor = texture(uImage, clamp(source / uResolution, vec2(0.0), vec2(1.0)));
    }`;
  const display = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uImage;
    out vec4 fragColor;
    void main() { fragColor = texture(uImage, vUV); }`;

  function program(fragment) {
    const shader = (type, source) => {
      const item = gl.createShader(type);
      gl.shaderSource(item, source);
      gl.compileShader(item);
      if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
      return item;
    };
    const item = gl.createProgram();
    gl.attachShader(item, shader(gl.VERTEX_SHADER, vertex));
    gl.attachShader(item, shader(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(item);
    if (!gl.getProgramParameter(item, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(item));
    return item;
  }
  const effectProgram = program(effect);
  const displayProgram = program(display);
  const quad = gl.createVertexArray();
  gl.bindVertexArray(quad);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  for (const item of [effectProgram, displayProgram]) {
    const location = gl.getAttribLocation(item, 'aPosition');
    gl.useProgram(item);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }
  const frameBuffer = gl.createFramebuffer();
  let textures = [];
  let original = null;
  let active = 0;

  function makeTexture(source) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (source) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return texture;
  }
  function bindTarget(texture) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Image buffer unavailable');
  }
  function copyTexture(source, target) {
    bindTarget(target);
    gl.useProgram(displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(gl.getUniformLocation(displayProgram, 'uImage'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function draw() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(displayProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[active]);
    gl.uniform1i(gl.getUniformLocation(displayProgram, 'uImage'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    state.dirty = false;
  }
  function stroke(point, delta, power = 1) {
    const next = 1 - active;
    bindTarget(textures[next]);
    gl.useProgram(effectProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[active]);
    gl.uniform1i(gl.getUniformLocation(effectProgram, 'uImage'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, state.history.at(-1) || textures[active]);
    gl.uniform1i(gl.getUniformLocation(effectProgram, 'uStrokeImage'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, state.brushTexture);
    gl.uniform1i(gl.getUniformLocation(effectProgram, 'uBrushMask'), 2);
    gl.uniform1i(gl.getUniformLocation(effectProgram, 'uUseBrushMask'), state.brushTexture ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(effectProgram, 'uResolution'), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(effectProgram, 'uCenter'), point.x, point.y);
    gl.uniform2f(gl.getUniformLocation(effectProgram, 'uDelta'), delta.x, delta.y);
    gl.uniform1f(gl.getUniformLocation(effectProgram, 'uRadius'), state.size * canvas.width / canvas.getBoundingClientRect().width / 2);
    gl.uniform1f(gl.getUniformLocation(effectProgram, 'uStrength'), state.strength * power);
    gl.uniform1f(gl.getUniformLocation(effectProgram, 'uSeed'), ++state.seed);
    gl.uniform1f(gl.getUniformLocation(effectProgram, 'uStrokeSeed'), state.strokeSeed);
    gl.uniform2f(gl.getUniformLocation(effectProgram, 'uDirection'), state.direction.x, state.direction.y);
    gl.uniform1i(gl.getUniformLocation(effectProgram, 'uMode'), ['smear','swirl','bulge','disperse','paint','water','smoke'].indexOf(state.brush));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    active = next;
    state.dirty = true;
  }
  function setButtons() {
    $('undo').disabled = state.history.length === 0;
    $('reset').disabled = !state.ready;
    $('export').disabled = !state.ready;
  }
  function stopMotion() { state.momentum = null; }
  function fitCanvas() {
    if (!state.ready) return;
    const scale = Math.max(0.1, Math.min((stage.clientWidth - 72) / canvas.width, (stage.clientHeight - 108) / canvas.height));
    canvas.style.width = `${Math.round(canvas.width * scale)}px`;
    canvas.style.height = `${Math.round(canvas.height * scale)}px`;
  }
  new ResizeObserver(fitCanvas).observe(stage);
  async function loadImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = canvas.width;
      imageCanvas.height = canvas.height;
      imageCanvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      [...textures, original, ...state.history].filter(Boolean).forEach(texture => gl.deleteTexture(texture));
      original = makeTexture(imageCanvas);
      textures = [makeTexture(), makeTexture()];
      active = 0;
      copyTexture(original, textures[0]);
      state.history = [];
      state.ready = true;
      stopMotion();
      stage.classList.add('loaded');
      canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
      fitCanvas();
      draw();
      setButtons();
    } catch (error) { alert(`Could not open this image: ${error.message}`); }
  }
  function makeBrushFromImage(bitmap, mode) {
    const brushCanvas = document.createElement('canvas');
    brushCanvas.width = brushCanvas.height = 256;
    const context = brushCanvas.getContext('2d', { willReadFrequently: true });
    const scale = Math.min(256 / bitmap.width, 256 / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const left = (256 - width) / 2;
    const top = (256 - height) / 2;
    context.drawImage(bitmap, left, top, width, height);
    const image = context.getImageData(0, 0, 256, 256);
    let visible = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      const alpha = image.data[i + 3] / 255;
      const brightness = (image.data[i] * 0.2126 + image.data[i + 1] * 0.7152 + image.data[i + 2] * 0.0722) / 255;
      const opacity = mode === 'alpha' ? alpha : alpha * (mode === 'dark' ? 1 - brightness : brightness);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(opacity * 255);
      visible += opacity;
    }
    if (visible < 1) throw new Error('This selection produces an empty brush. Try another image mode.');
    context.putImageData(image, 0, 0);
    const texture = makeTexture(brushCanvas);
    if (state.brushTexture) gl.deleteTexture(state.brushTexture);
    state.brushTexture = texture;
    state.brushCanvas = brushCanvas;
    state.brushMode = mode;
    $('brushPreview').src = brushCanvas.toDataURL('image/png');
    $('brushPreview').hidden = false;
    $('brushStatus').textContent = 'Custom PNG brush';
    $('maskSource').disabled = false;
    $('saveBrush').disabled = false;
    $('clearBrush').disabled = false;
  }
  async function loadBrush(file) {
    if (!file) return;
    if (file.type !== 'image/png') { alert('Choose a PNG image for the brush.'); return; }
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const sample = document.createElement('canvas');
      sample.width = sample.height = 64;
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, 64, 64);
      const pixels = context.getImageData(0, 0, 64, 64).data;
      let transparent = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 240) transparent++;
      const mode = transparent > 64 ? 'alpha' : 'dark';
      makeBrushFromImage(bitmap, mode);
      if (state.brushBitmap) state.brushBitmap.close();
      state.brushBitmap = bitmap;
      $('maskSource').value = mode;
    } catch (error) { if (bitmap) bitmap.close(); alert(`Could not create brush: ${error.message}`); }
  }
  function pointFromEvent(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (bounds.bottom - event.clientY) * canvas.height / bounds.height };
  }
  function updateCursor(event) {
    const bounds = stage.getBoundingClientRect();
    const cursor = $('cursor');
    cursor.hidden = !state.ready;
    cursor.style.left = `${event.clientX - bounds.left}px`;
    cursor.style.top = `${event.clientY - bounds.top}px`;
    cursor.style.width = `${state.size}px`;
    cursor.style.height = `${state.size}px`;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!state.ready) return;
    canvas.setPointerCapture(event.pointerId);
    state.dragging = true;
    stopMotion();
    state.lastDelta = null;
    state.strokeSeed = ++state.seed;
    state.pointer = pointFromEvent(event);
    state.history.push(makeTexture());
    copyTexture(textures[active], state.history.at(-1));
    if (state.history.length > 8) gl.deleteTexture(state.history.shift());
    setButtons();
    stroke(state.pointer, { x: 0, y: 0 });
    updateCursor(event);
  });
  canvas.addEventListener('pointermove', event => {
    updateCursor(event);
    if (!state.dragging) return;
    const point = pointFromEvent(event);
    const delta = { x: point.x - state.pointer.x, y: point.y - state.pointer.y };
    const distance = Math.hypot(delta.x, delta.y);
    if (distance > 0.01) state.direction = { x: delta.x / distance, y: delta.y / distance };
    const steps = Math.max(1, Math.ceil(distance / Math.max(8, state.size * 0.18)));
    for (let i = 1; i <= steps; i++) stroke({ x: state.pointer.x + delta.x * i / steps, y: state.pointer.y + delta.y * i / steps }, { x: delta.x / steps, y: delta.y / steps });
    state.pointer = point;
    state.lastDelta = delta;
  });
  function endStroke() {
    if (!state.dragging) return;
    state.dragging = false;
    if ($('keepMoving').checked && state.lastDelta && Math.hypot(state.lastDelta.x, state.lastDelta.y) > 1) {
      state.momentum = { point: { ...state.pointer }, delta: { ...state.lastDelta }, life: 0 };
    }
    state.lastDelta = null;
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', () => { if (!state.dragging) $('cursor').hidden = true; });
  function tick() {
    const moving = state.momentum;
    if (moving && !state.dragging) {
      moving.delta.x *= 0.965;
      moving.delta.y *= 0.965;
      moving.point.x += moving.delta.x * 0.3;
      moving.point.y += moving.delta.y * 0.3;
      moving.life++;
      if (Math.hypot(moving.delta.x, moving.delta.y) < 0.3 || moving.life > 180 || !($('keepMoving').checked)) stopMotion();
      else stroke(moving.point, moving.delta, 0.45);
    }
    if (state.dirty) draw();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  for (const id of ['openTop','openEmpty']) $(id).addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', event => { loadImage(event.target.files[0]); event.target.value = ''; });
  $('importBrush').addEventListener('click', () => $('brushFile').click());
  $('brushFile').addEventListener('change', event => { loadBrush(event.target.files[0]); event.target.value = ''; });
  $('maskSource').addEventListener('change', event => {
    try { makeBrushFromImage(state.brushBitmap, event.target.value); }
    catch (error) { event.target.value = state.brushMode; alert(error.message); }
  });
  $('clearBrush').addEventListener('click', () => {
    if (state.brushTexture) gl.deleteTexture(state.brushTexture);
    if (state.brushBitmap) state.brushBitmap.close();
    state.brushTexture = state.brushBitmap = state.brushCanvas = state.brushMode = null;
    $('brushPreview').hidden = true;
    $('brushPreview').removeAttribute('src');
    $('brushStatus').textContent = 'Round brush';
    $('maskSource').disabled = $('saveBrush').disabled = $('clearBrush').disabled = true;
  });
  $('saveBrush').addEventListener('click', () => {
    if (!state.brushCanvas) return;
    state.brushCanvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'photo-flow-brush.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
  document.querySelectorAll('[data-brush]').forEach(button => button.addEventListener('click', () => {
    state.brush = button.dataset.brush;
    document.querySelectorAll('[data-brush]').forEach(item => item.classList.toggle('active', item === button));
  }));
  $('size').addEventListener('input', event => { state.size = Number(event.target.value); $('sizeValue').value = `${state.size} px`; });
  $('strength').addEventListener('input', event => { state.strength = Number(event.target.value) / 100; $('strengthValue').value = `${event.target.value}%`; });
  $('keepMoving').addEventListener('change', event => { if (!event.target.checked) stopMotion(); });
  $('undo').addEventListener('click', () => {
    if (!state.history.length) return;
    stopMotion();
    const previous = state.history.pop();
    copyTexture(previous, textures[active]);
    gl.deleteTexture(previous);
    state.dirty = true;
    setButtons();
  });
  $('reset').addEventListener('click', () => {
    if (!state.ready) return;
    stopMotion();
    state.history.forEach(texture => gl.deleteTexture(texture));
    state.history = [];
    copyTexture(original, textures[active]);
    state.dirty = true;
    setButtons();
  });
  $('export').addEventListener('click', () => {
    if (!state.ready) return;
    stopMotion();
    draw();
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'photo-flow.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
})();
