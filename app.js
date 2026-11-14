(() => {
  const canvas = document.getElementById('canvas');
  const particleCanvas = document.getElementById('particleCanvas');
  const particles = new ParticleLayer(particleCanvas);
  const stage = document.getElementById('stage');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
  const $ = id => document.getElementById(id);
  const state = { ready: false, brush: 'smear', size: 120, strength: 0.5, dragging: false, pointer: null, momentum: null, history: [], seed: 0, strokeSeed: 0, direction: { x: 1, y: 0 }, brushTexture: null, brushBitmap: null, brushCanvas: null, brushMaskPixels: null, brushMode: null, dirty: false };
  let brushOperation = 0;
  if (!gl) {
    $('empty').querySelector('p').textContent = 'This app needs a browser or graphics driver with WebGL 2 support.';
    return;
  }

  const vertex = `#version 300 es
    in vec2 aPosition;
    out vec2 vUV;
    void main() { vUV = (aPosition + 1.0) * 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }`;
  const effect = globalThis.PhotoFlowEffects.shader;
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
    gl.bindTexture(gl.TEXTURE_2D, state.history.at(-1)?.texture || textures[active]);
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
    gl.uniform1i(gl.getUniformLocation(effectProgram, 'uGlow'), $('warmGlow').checked ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(effectProgram, 'uMode'), globalThis.PhotoFlowEffects.modes.indexOf(state.brush));
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
  function brushRadius() { return state.size * canvas.width / canvas.getBoundingClientRect().width / 2; }
  function fitCanvas() {
    if (!state.ready) return;
    const scale = Math.max(0.1, Math.min((stage.clientWidth - 72) / canvas.width, (stage.clientHeight - 108) / canvas.height));
    canvas.style.width = `${Math.round(canvas.width * scale)}px`;
    canvas.style.height = `${Math.round(canvas.height * scale)}px`;
    const stageBounds = stage.getBoundingClientRect();
    const bounds = canvas.getBoundingClientRect();
    particleCanvas.style.left = `${bounds.left - stageBounds.left}px`;
    particleCanvas.style.top = `${bounds.top - stageBounds.top}px`;
    particleCanvas.style.width = `${bounds.width}px`;
    particleCanvas.style.height = `${bounds.height}px`;
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
      [...textures, original, ...state.history.map(entry => entry.texture)].filter(Boolean).forEach(texture => gl.deleteTexture(texture));
      original = makeTexture(imageCanvas);
      textures = [makeTexture(), makeTexture()];
      active = 0;
      copyTexture(original, textures[0]);
      state.history = [];
      particles.setImage(imageCanvas);
      state.ready = true;
      stopMotion();
      stage.classList.add('loaded');
      canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
      fitCanvas();
      draw();
      setButtons();
    } catch (error) { alert(`Could not open this image: ${error.message}`); }
  }
  function applyBrushMask(brushCanvas, image, mode, label) {
    const texture = makeTexture(brushCanvas);
    if (state.brushTexture) gl.deleteTexture(state.brushTexture);
    state.brushTexture = texture;
    state.brushCanvas = brushCanvas;
    state.brushMaskPixels = image;
    state.brushMode = mode;
    $('brushPreview').src = brushCanvas.toDataURL('image/png');
    $('brushPreview').hidden = false;
    $('brushStatus').textContent = label;
    $('maskSource').disabled = mode === 'generated';
    $('saveBrush').disabled = false;
    $('clearBrush').disabled = false;
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
    applyBrushMask(brushCanvas, image, mode, 'Imported PNG brush');
  }
  function generateBrush() {
    brushOperation++;
    const size = 256;
    const seedValue = Number($('shapeSeed').value);
    const seed = Number.isFinite(seedValue) ? Math.max(0, Math.min(999999999, Math.floor(seedValue))) : 1;
    $('shapeSeed').value = seed;
    const complexity = Number($('shapeComplexity').value) / 100;
    const roughness = Number($('shapeRoughness').value) / 100;
    const texture = Number($('shapeTexture').value) / 100;
    const softness = Number($('shapeSoftness').value) / 100;
    const hash = (x, y, salt) => {
      let value = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((seed + salt) | 0, 1442695041);
      value = Math.imul(value ^ (value >>> 13), 1274126177);
      return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
    };
    const noise = (x, y, salt) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const top = hash(ix, iy, salt) * (1 - sx) + hash(ix + 1, iy, salt) * sx;
      const bottom = hash(ix, iy + 1, salt) * (1 - sx) + hash(ix + 1, iy + 1, salt) * sx;
      return top * (1 - sy) + bottom * sy;
    };
    const brushCanvas = document.createElement('canvas');
    brushCanvas.width = brushCanvas.height = size;
    const context = brushCanvas.getContext('2d', { willReadFrequently: true });
    const image = context.createImageData(size, size);
    const lobes = 3 + Math.round(complexity * 14);
    const phase = hash(1, 0, 1) * Math.PI * 2;
    const phase2 = hash(2, 0, 2) * Math.PI * 2;
    const phase3 = hash(3, 0, 3) * Math.PI * 2;
    const stretchX = 0.88 + hash(4, 0, 4) * 0.24;
    const stretchY = 0.88 + hash(5, 0, 5) * 0.24;
    const edgeWidth = 1.5 + softness * 24;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - 128) / stretchX;
        const dy = (y + 0.5 - 128) / stretchY;
        const angle = Math.atan2(dy, dx);
        const wave = Math.sin(angle * lobes + phase) * 0.55
          + Math.sin(angle * (lobes + 3) + phase2) * 0.3
          + Math.sin(angle * (lobes * 2 + 1) + phase3) * 0.15;
        const radius = 91 * (1 + roughness * wave * 0.38);
        const distance = Math.hypot(dx, dy);
        const edge = Math.max(0, Math.min(1, (radius - distance) / edgeWidth + 0.5));
        if (edge <= 0) continue;
        const broad = noise(x / 21, y / 21, 10);
        const fine = noise(x / 5, y / 5, 11);
        const holes = Math.max(0, Math.min(1, (broad - (0.13 + texture * 0.24)) / 0.19));
        const grain = 1 - texture * (0.52 * (1 - fine) + 0.75 * (1 - holes));
        const pixel = (y * size + x) * 4;
        image.data[pixel] = image.data[pixel + 1] = image.data[pixel + 2] = 255;
        image.data[pixel + 3] = Math.round(255 * edge * Math.max(0, grain));
      }
    }
    context.putImageData(image, 0, 0);
    if (state.brushBitmap) state.brushBitmap.close();
    state.brushBitmap = null;
    applyBrushMask(brushCanvas, image, 'generated', `Generated brush · seed ${seed}`);
  }
  async function loadBrush(file) {
    if (!file) return;
    if (file.type !== 'image/png') { alert('Choose a PNG image for the brush.'); return; }
    const operation = ++brushOperation;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (operation !== brushOperation) { bitmap.close(); return; }
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
    state.history.push({ texture: makeTexture(), particles: particles.snapshot() });
    copyTexture(textures[active], state.history.at(-1).texture);
    if (state.history.length > 8) gl.deleteTexture(state.history.shift().texture);
    setButtons();
    stroke(state.pointer, { x: 0, y: 0 });
    if (state.brush === 'particle') particles.spawn(state.pointer, { x: 0, y: 0 }, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
    if (state.brush === 'fragment') particles.spawnFragments(state.pointer, { x: 0, y: 0 }, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
    if (state.brush === 'dissolve') particles.spawnDissolve(state.pointer, { x: 0, y: 0 }, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
    if (state.brush === 'pointcloud') particles.spawnPointCloud(state.pointer, { x: 0, y: 0 }, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
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
    for (let i = 1; i <= steps; i++) {
      const sample = { x: state.pointer.x + delta.x * i / steps, y: state.pointer.y + delta.y * i / steps };
      const stepDelta = { x: delta.x / steps, y: delta.y / steps };
      stroke(sample, stepDelta);
      if (state.brush === 'particle') particles.spawn(sample, stepDelta, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
      if (state.brush === 'fragment') particles.spawnFragments(sample, stepDelta, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
      if (state.brush === 'wind') particles.spawnWind(sample, stepDelta, brushRadius(), state.strength, state.brushMaskPixels, $('warmGlow').checked, $('keepMoving').checked);
      if (state.brush === 'dissolve') particles.spawnDissolve(sample, stepDelta, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
      if (state.brush === 'pointcloud') particles.spawnPointCloud(sample, stepDelta, brushRadius(), state.strength, state.brushMaskPixels, $('keepMoving').checked);
    }
    state.pointer = point;
    state.lastDelta = delta;
  });
  function endStroke() {
    if (!state.dragging) return;
    state.dragging = false;
    if (!['particle','fragment','wind','dissolve','pointcloud'].includes(state.brush) && $('keepMoving').checked && state.lastDelta && Math.hypot(state.lastDelta.x, state.lastDelta.y) > 1) {
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
    particles.tick($('keepMoving').checked);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  for (const id of ['openTop','openEmpty']) $(id).addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', event => { loadImage(event.target.files[0]); event.target.value = ''; });
  let pendingBrushUpdate = 0;
  $('shapeSeed').value = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000000;
  const scheduleGeneratedBrush = () => {
    if (state.brushMode !== 'generated') return;
    cancelAnimationFrame(pendingBrushUpdate);
    pendingBrushUpdate = requestAnimationFrame(generateBrush);
  };
  for (const id of ['shapeComplexity','shapeRoughness','shapeTexture','shapeSoftness']) {
    $(id).addEventListener('input', event => {
      $(`${id}Value`).value = `${event.target.value}%`;
      scheduleGeneratedBrush();
    });
  }
  $('shapeSeed').addEventListener('change', scheduleGeneratedBrush);
  $('generateBrush').addEventListener('click', () => {
    cancelAnimationFrame(pendingBrushUpdate);
    generateBrush();
  });
  $('shuffleBrush').addEventListener('click', () => {
    cancelAnimationFrame(pendingBrushUpdate);
    $('shapeSeed').value = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000000;
    generateBrush();
  });
  $('importBrush').addEventListener('click', () => $('brushFile').click());
  $('brushFile').addEventListener('change', event => { cancelAnimationFrame(pendingBrushUpdate); loadBrush(event.target.files[0]); event.target.value = ''; });
  $('maskSource').addEventListener('change', event => {
    try { makeBrushFromImage(state.brushBitmap, event.target.value); }
    catch (error) { event.target.value = state.brushMode; alert(error.message); }
  });
  $('clearBrush').addEventListener('click', () => {
    brushOperation++;
    cancelAnimationFrame(pendingBrushUpdate);
    if (state.brushTexture) gl.deleteTexture(state.brushTexture);
    if (state.brushBitmap) state.brushBitmap.close();
    state.brushTexture = state.brushBitmap = state.brushCanvas = state.brushMaskPixels = state.brushMode = null;
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
  $('showGrid').addEventListener('change', event => particles.setGridVisible(event.target.checked));
  $('size').addEventListener('input', event => { state.size = Number(event.target.value); $('sizeValue').value = `${state.size} px`; });
  $('strength').addEventListener('input', event => { state.strength = Number(event.target.value) / 100; $('strengthValue').value = `${event.target.value}%`; });
  $('keepMoving').addEventListener('change', event => { if (!event.target.checked) { stopMotion(); particles.stop(); } });
  $('undo').addEventListener('click', () => {
    if (!state.history.length) return;
    stopMotion();
    const previous = state.history.pop();
    copyTexture(previous.texture, textures[active]);
    gl.deleteTexture(previous.texture);
    particles.restore(previous.particles);
    state.dirty = true;
    setButtons();
  });
  $('reset').addEventListener('click', () => {
    if (!state.ready) return;
    stopMotion();
    state.history.forEach(entry => gl.deleteTexture(entry.texture));
    state.history = [];
    copyTexture(original, textures[active]);
    particles.restore({ particles: [], fragments: [], paintMarks: [], cloudPoints: [], grid: null });
    state.dirty = true;
    setButtons();
  });
  $('export').addEventListener('click', () => {
    if (!state.ready) return;
    stopMotion();
    particles.stop();
    draw();
    particles.render();
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext('2d');
    context.drawImage(canvas, 0, 0);
    context.drawImage(particleCanvas, 0, 0);
    output.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'photo-flow.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
})();
