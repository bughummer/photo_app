import { VIDEO_EFFECTS, normalizeEffect } from './effect-interface.mjs';
import { clampTime, formatTime } from './timeline.mjs';
import { VideoMediaAdapter } from './media-adapters.mjs';
import { WebGL2VideoRenderer } from './webgl2-renderer.mjs';
import { TemporalEffectsEngine } from './temporal-engine.mjs';
import { SpacetimeViewer } from './spacetime-viewer.mjs';
import { composeSlitScanAsync } from './slit-scan.mjs';
import { EchoWebGLRenderer } from './echo-renderer.mjs';
import { EchoPlaybackHistory, normalizeEchoParams } from './temporal-echoes.mjs';
import { mountFracturedControls } from '../fractured/controls.mjs';
import { FracturedPreview } from '../fractured/preview.mjs';
import { AnchorHandles } from '../fractured/anchor-handles.mjs';
import { AnchorTracker, detectFaceAnchors } from '../fractured/face.mjs';

const $ = id => document.getElementById(id);
const video = $('sourceVideo');
const canvas = $('videoCanvas');
const names = { smear: 'Fluid smear', swirl: 'Swirl', bulge: 'Bulge', disperse: 'Disperse', paint: 'Paint pull', water: 'Water lens', smoke: 'Smoke', glitch: 'Digital glitch', mirror: 'Mirror distortion' };
for (const effect of VIDEO_EFFECTS) $('videoEffect').add(new Option(names[effect.name], effect.name));

let media = null;
let renderer = null;
let session = 0;
let seekVersion = 0;
let seekTimer = 0;
let frameCallback = 0;
let dragging = null;
let exporting = false;
let effect = normalizeEffect({ name: 'none', radius: 0.35, strength: 0.6 });
let temporal = null;
let cube = null;
const isCube = () => $('videoEffect').value === 'spacetime';
const isSlit = () => $('videoEffect').value === 'slit-scan';
const isEcho = () => $('videoEffect').value === 'temporal-echoes';
const isFractured = () => $('videoEffect').value === 'fractured-identity';
let fracturePreview = null;
let fractureHandles = null;
let fractureTracker = null;
const fractureControls = mountFracturedControls($('fracturedVideoControls'), params => {
  fracturePreview?.setParams(params);
  fractureTracker?.reset(params.anchors);
  fractureHandles?.update(params.anchors,isFractured() && params.showAnchors);
  if (media && isFractured() && video.paused) scheduleExtract(video.currentTime);
});
if (typeof FaceDetector === 'undefined') { fractureControls.detectButton.disabled = true; fractureControls.detectButton.title = 'Automatic face detection is unavailable. Drag the face anchors manually.'; }
else fractureControls.detectButton.addEventListener('click',async () => {
  if (!media) return;
  try {
    const anchors = await detectFaceAnchors(video);
    if (!anchors) { status('No face detected. Drag the anchors to place them manually.'); return; }
    fractureControls.set({ ...fractureControls.get(),anchors,showAnchors:true });
    status('Face anchors placed. Drag them to refine the distortion.');
  } catch (error) { status(error.message,true); }
});
function ensureFracture() {
  if (fracturePreview || !media) return;
  const scale = Math.min(1,720/Math.max(media.width,media.height));
  const width = Math.max(2,Math.round(media.width*scale)), height = Math.max(2,Math.round(media.height*scale));
  fracturePreview = new FracturedPreview($('fracturedVideoCanvas'),width,height,error => status(error.message,true));
  fracturePreview.setParams(fractureControls.get());
  fractureTracker = new AnchorTracker(fractureControls.get().anchors);
  fractureHandles = new AnchorHandles($('videoCanvas').parentElement,$('fracturedVideoCanvas'),(index,point) => {
    const params = fractureControls.get(), anchors = params.anchors.map(anchor => ({ ...anchor }));
    anchors[index] = point;
    fractureControls.set({ ...params,anchors });
  });
  fractureHandles.update(fractureControls.get().anchors,fractureControls.get().showAnchors);
}
function disposeFracture() {
  fractureHandles?.dispose(); fractureHandles = null;
  fractureTracker?.dispose(); fractureTracker = null;
  fracturePreview?.dispose(); fracturePreview = null;
  $('fracturedVideoCanvas').width = $('fracturedVideoCanvas').height = 0;
}
let echoRenderer = null;
let echoHistory = null;
let echoSeekAbort = null;

function echoOptions() {
  return normalizeEchoParams({ count: $('echoCount').value, gap: $('echoGap').value,
    strength: Number($('echoStrength').value) / 100, threshold: Number($('echoThreshold').value) / 100 });
}

function updateEchoLabels() {
  $('echoCountValue').value = $('echoCount').value;
  $('echoGapValue').value = `${Number($('echoGap').value).toFixed(2)} s`;
  $('echoStrengthValue').value = `${$('echoStrength').value}%`;
  $('echoThresholdValue').value = `${$('echoThreshold').value}%`;
}

function restoreEchoParameters() {
  const saved = temporal?.getParameters('temporal-echoes');
  if (saved) {
    const params = normalizeEchoParams(saved);
    $('echoCount').value = String(params.count);
    $('echoGap').value = String(params.gap);
    $('echoStrength').value = String(Math.round(params.strength * 100));
    $('echoThreshold').value = String(Math.round(params.threshold * 100));
  }
  updateEchoLabels();
}

function disposeEcho() {
  echoSeekAbort?.abort(); echoSeekAbort = null;
  echoHistory?.dispose(); echoHistory = null;
  echoRenderer?.dispose(); echoRenderer = null;
  $('echoCanvas').width = $('echoCanvas').height = 0;
}

function ensureEcho() {
  if (echoRenderer || !media) return;
  const scale = Math.min(1, 640 / Math.max(media.width, media.height));
  const width = Math.max(2, Math.round(media.width * scale));
  const height = Math.max(2, Math.round(media.height * scale));
  echoRenderer = new EchoWebGLRenderer($('echoCanvas'), width, height);
  echoHistory = new EchoPlaybackHistory(width, height);
}
let slitVolume = null;
let slitAbort = null;
let slitGeneration = 0;
let slitRenderVersion = 0;
let slitTimer = 0;
let slitSampling = false;

function slitOptions() {
  return { direction: $('slitDirection').value, start: Number($('slitLineStart').value) / 100,
    end: Number($('slitLineEnd').value) / 100, band: Number($('slitBand').value) };
}

function updateSlitMemory() {
  const width = Number($('slitWidth').value), count = Number($('slitCount').value);
  const height = media ? Math.max(2, Math.round(width * media.height / media.width)) : Math.round(width * 9 / 16);
  $('slitMemory').textContent = `Preview: ${width} × ${height} × ${count} · about ${Math.round(width * height * count * 4 / 1048576)} MB`;
  return { width, height, count };
}

function restoreSlitParameters() {
  const view = temporal?.getParameters('slit-scan-view');
  if (view) {
    if (['vertical', 'horizontal'].includes(view.direction)) $('slitDirection').value = view.direction;
    for (const [id, value] of [['slitLineStart', view.start * 100], ['slitLineEnd', view.end * 100], ['slitBand', view.band]]) if (Number.isFinite(value)) $(id).value = String(value);
  }
  const sampling = temporal?.getParameters('slit-scan-sampling');
  if (sampling) {
    $('slitCount').value = String(sampling.count);
    $('slitWidth').value = String(sampling.width);
  }
  updateSlitLabels();
}

function updateSlitLabels() {
  $('slitLineStartValue').value = `${$('slitLineStart').value}%`;
  $('slitLineEndValue').value = `${$('slitLineEnd').value}%`;
  $('slitBandValue').value = `${$('slitBand').value} px`;
}

function cubeOptions() {
  return { mode: $('cubeMode').value, axis: $('cubeAxis').value, position: Number($('cubePosition').value) / 100,
    opacity: Number($('cubeOpacity').value) / 100, timeScale: Number($('cubeScale').value) / 100,
    spacing: Number($('cubeSpacing').value) / 100, showFaces: $('cubeFaces').checked, highlight: $('cubeHighlight').checked };
}

function updateCubeMemory() {
  const width = Number($('cubeWidth').value), count = Number($('cubeCount').value);
  const height = media ? Math.max(2, Math.round(width * media.height / media.width)) : Math.round(width * 9 / 16);
  const interval = (Number($('cubeEnd').value) - Number($('cubeStart').value)) / Math.max(1, count - 1);
  $('cubeMemory').textContent = `Preview: ${width} × ${height} × ${count} · about ${Math.round(width * height * count * 4 / 1048576)} MB · ${Number.isFinite(interval) && interval > 0 ? interval.toFixed(3) : '—'} s between frames`;
  return { width, height, count };
}

function restoreCubeParameters() {
  const view = temporal?.getParameters('spacetime-view');
  if (view) {
    const values = { cubeMode: view.mode, cubeAxis: view.axis, cubePosition: view.position * 100, cubeOpacity: view.opacity * 100, cubeScale: view.timeScale * 100, cubeSpacing: view.spacing * 100 };
    for (const [id, value] of Object.entries(values)) if (Number.isFinite(value) || typeof value === 'string') $(id).value = String(value);
    $('cubeFaces').checked = !!view.showFaces;
    $('cubeHighlight').checked = !!view.highlight;
  }
  const sampling = temporal?.getParameters('spacetime-sampling');
  if (sampling) {
    $('cubeCount').value = String(sampling.count);
    $('cubeWidth').value = String(sampling.width);
  }
  for (const id of ['cubePosition', 'cubeOpacity', 'cubeScale', 'cubeSpacing']) $(id + 'Value').value = `${$(id).value}%`;
}

function syncEffectControls(announce = true) {
  const temporalEffect = isCube() || isSlit();
  $('frameEffectControls').hidden = temporalEffect || isEcho() || isFractured();
  $('fracturedVideoControls').hidden = !isFractured();
  $('echoControls').hidden = !isEcho();
  $('slitControls').hidden = !isSlit();
  $('cubeControls').hidden = !isCube();
  $('cubeViewport').hidden = !isCube();
  $('slitCanvas').hidden = !isSlit();
  $('echoCanvas').hidden = !isEcho();
  $('fracturedVideoCanvas').hidden = !isFractured();
  $('videoCanvas').parentElement.classList.toggle('cube-active', isCube());
  $('videoCanvas').parentElement.classList.toggle('slit-active', isSlit());
  $('videoCanvas').parentElement.classList.toggle('echo-active', isEcho());
  $('videoCanvas').parentElement.classList.toggle('fractured-active', isFractured());
  $('exportVideo').disabled = exporting || temporalEffect || !media?.exportAvailable;
  $('extractFrame').disabled = temporalEffect || !media;
  $('playVideo').disabled = temporalEffect || !media;
  $('videoTimeline').disabled = temporalEffect || !media;
  $('cubeGenerate').disabled = exporting || !media;
  $('cubeScreenshot').disabled = !cube?.volume;
  $('slitGenerate').disabled = exporting || !media;
  $('slitExport').disabled = !slitVolume;
  if (temporalEffect && media) { media.pause(); stopFrameLoop(); $('playVideo').textContent = 'Play'; }
  if (isCube() && media) {
    if (!cube) {
      try { cube = new SpacetimeViewer($('cubeViewport')); cube.onSlicePosition = value => { $('cubePosition').value = String(Math.round(value * 100)); $('cubePositionValue').value = `${Math.round(value * 100)}%`; }; cube.setOptions(cubeOptions()); }
      catch (error) { status(error.message, true); return; }
    }
    cube.resize();
    if (announce) status(cube.volume ? 'Drag to rotate, Shift drag to pan, or scroll to zoom.' : 'Choose an interval and generate a spacetime volume.');
  } else if (isSlit() && media) {
    if (announce) status(slitVolume ? 'Adjust the line position, width, or direction to explore the scan.' : 'Choose an interval and generate a slit scan.');
  } else if (isEcho() && media) {
    try { ensureEcho(); if (announce) status('Temporal Echoes ready. Play or scrub to explore the trails.'); }
    catch (error) { status(error.message, true); }
  } else if (isFractured() && media) {
    try { ensureFracture(); fractureHandles?.update(fractureControls.get().anchors,fractureControls.get().showAnchors); if (announce) status('Turbulent Glass ready. Play or scrub the video.'); }
    catch (error) { status(error.message,true); }
  } else if (media) scheduleExtract(video.currentTime);
}

function status(message, error = false) {
  $('videoStatus').textContent = message;
  $('videoStatus').classList.toggle('error', error);
}

function controls(enabled, canExport = false) {
  for (const id of ['playVideo', 'extractFrame', 'videoTimeline']) $(id).disabled = !enabled;
  $('exportVideo').disabled = !enabled || !canExport;
}

function updateTime(time = video.currentTime) {
  if (!media) return;
  $('videoTimeline').value = clampTime(time, media.duration);
  $('videoTime').textContent = `${formatTime(time)} / ${formatTime(media.duration)}`;
}

function renderLive() {
  if (!media || video.readyState < 2) return;
  if (isEcho()) {
    if (!echoRenderer) return;
    const params = echoOptions(), time = video.currentTime;
    echoRenderer.render(video, echoHistory.sourcesAt(time, params), params);
    echoHistory.capture(video, time, params);
  } else if (isFractured()) {
    if (!fracturePreview) return;
    const params = fractureControls.get(), time = video.currentTime;
    fracturePreview.anchors = params.faceTracking ? fractureTracker.update(video) : params.anchors;
    fracturePreview.source = video;
    fracturePreview.dynamic = true;
    fracturePreview.time = time;
    fracturePreview.render();
    fractureHandles?.update(fracturePreview.anchors,params.showAnchors);
  } else {
    if (!renderer) return;
    renderer.render(video, effect);
  }
  updateTime();
}

function stopFrameLoop() {
  if (frameCallback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameCallback);
  frameCallback = 0;
}

function startFrameLoop() {
  stopFrameLoop();
  const next = () => {
    if (!media || video.paused) return;
    if (video.requestVideoFrameCallback) {
      frameCallback = video.requestVideoFrameCallback(() => { renderLive(); next(); });
    } else {
      frameCallback = requestAnimationFrame(() => { renderLive(); next(); });
    }
  };
  next();
}

async function renderExtracted(time) {
  if (!media || !renderer) return;
  const version = ++seekVersion;
  const current = media;
  if (isFractured()) {
    ensureFracture();
    const frame = await current.frameAt(time);
    if (version !== seekVersion || current !== media || !isFractured()) return;
    fracturePreview.source = frame;
    fracturePreview.dynamic = true;
    fracturePreview.time = time;
    fracturePreview.anchors = fractureControls.get().anchors;
    fractureTracker?.reset(fracturePreview.anchors);
    fracturePreview.render();
    fractureHandles?.update(fracturePreview.anchors,fractureControls.get().showAnchors);
    updateTime(time);
    status(`Turbulent Glass frame at ${time.toFixed(2)} s.`);
    return;
  }
  if (isEcho()) {
    ensureEcho();
    echoSeekAbort?.abort();
    const controller = new AbortController();
    echoSeekAbort = controller;
    const params = echoOptions();
    let result;
    try {
      result = await current.echoFramesAt(time, params, controller.signal);
      if (version !== seekVersion || current !== media || !isEcho()) return;
      const frame = result.frames.find(item => item.age === 0);
      const histories = Array.from({ length: params.count }, (_, index) => result.frames.find(item => item.age === index + 1)?.bitmap || null);
      echoRenderer.render(frame.bitmap, histories, params);
      echoHistory.clear();
      for (const item of result.frames) echoHistory.capture(item.bitmap, item.time, params);
      updateTime(time);
      status(`Temporal Echoes frame at ${time.toFixed(2)} s. Play or scrub to explore the trails.`);
    } finally {
      result?.frames.forEach(item => item.bitmap.close());
      if (echoSeekAbort === controller) echoSeekAbort = null;
    }
    return;
  }
  const frame = await current.frameAt(time);
  if (version !== seekVersion || current !== media) return;
  renderer.render(frame, effect);
  updateTime(time);
}

function scheduleExtract(time) {
  clearTimeout(seekTimer);
  seekTimer = setTimeout(() => renderExtracted(time).catch(error => { if (error.name !== 'AbortError') status(error.message, true); }), 70);
}

function closeMedia() {
  session++;
  seekVersion++;
  clearTimeout(seekTimer);
  stopFrameLoop();
  disposeFracture();
  $('fracturedVideoCanvas').hidden = true;
  disposeEcho();
  $('echoCanvas').hidden = true;
  slitGeneration++; slitRenderVersion++;
  clearTimeout(slitTimer);
  slitAbort?.abort(); slitAbort = null;
  slitSampling = false;
  slitVolume = null;
  $('slitCanvas').width = 0;
  $('slitCanvas').height = 0;
  $('slitCanvas').hidden = true;
  $('cubeViewport').hidden = true;
  $('slitGenerate').disabled = true;
  $('slitCancel').disabled = true;
  $('slitExport').disabled = true;
  temporal?.dispose(); temporal = null;
  cube?.dispose(); cube = null;
  $('cubeGenerate').disabled = true;
  $('cubeCancel').disabled = true;
  $('cubeScreenshot').disabled = true;
  media?.dispose();
  media = null;
  renderer?.dispose();
  renderer = null;
  $('videoEmpty').textContent = 'Open a video to preview its frames.';
  $('videoCanvas').parentElement.classList.remove('loaded', 'cube-active', 'slit-active', 'echo-active', 'fractured-active');
  $('playVideo').textContent = 'Play';
  controls(false);
}

async function openFile(file) {
  if (!file) return;
  if (exporting) { status('Finish exporting before opening another video.', true); return; }
  closeMedia();
  const openedSession = session;
  status('Reading local video and checking its codec…');
  try {
    const next = new VideoMediaAdapter(file, video);
    media = next;
    const details = await next.open();
    if (openedSession !== session) return;
    renderer = new WebGL2VideoRenderer(canvas, details.width, details.height);
    temporal = new TemporalEffectsEngine(next);
    restoreEchoParameters();
    $('slitStartTime').value = '0';
    $('slitEndTime').value = String(details.duration);
    restoreSlitParameters();
    updateSlitMemory();
    $('cubeStart').value = '0';
    $('cubeEnd').value = String(details.duration);
    restoreCubeParameters();
    updateCubeMemory();
    $('videoCanvas').parentElement.classList.add('loaded');
    $('videoTimeline').max = details.duration;
    $('videoTimeline').value = 0;
    $('videoDetails').textContent = `${file.name} · ${details.width} × ${details.height} working size · ${formatTime(details.duration)} · ${details.hasAudio ? 'audio track' : 'no audio track'}`;
    controls(true, details.exportAvailable);
    syncEffectControls();
    await renderExtracted(0);
    if (!isCube() && !isSlit() && !isEcho() && !isFractured()) status(details.exportAvailable ? 'Ready. Drag on the frame to position the effect, or scrub the timeline.' : `Preview ready. ${details.exportReason} Frame PNG export is available.`);
  } catch (error) {
    closeMedia();
    $('videoEmpty').textContent = error.message;
    status(error.message, true);
  }
}

$('openVideo').addEventListener('click', () => $('videoFile').click());
$('videoFile').addEventListener('change', event => { openFile(event.target.files[0]); event.target.value = ''; });
$('playVideo').addEventListener('click', async () => {
  if (!media) return;
  try {
    if (video.paused) { await media.play(); $('playVideo').textContent = 'Pause'; startFrameLoop(); }
    else { media.pause(); $('playVideo').textContent = 'Play'; stopFrameLoop(); await renderExtracted(video.currentTime); }
  } catch (error) { status(error.message, true); }
});
video.addEventListener('ended', () => { $('playVideo').textContent = 'Play'; stopFrameLoop(); });
video.addEventListener('timeupdate', () => { if (media && !video.seeking) updateTime(); });
$('videoTimeline').addEventListener('input', event => {
  if (!media) return;
  media.pause();
  stopFrameLoop();
  $('playVideo').textContent = 'Play';
  const time = Number(event.target.value);
  media.seek(time);
  updateTime(time);
  scheduleExtract(time);
});

function updateEffect() {
  const name = $('videoEffect').value;
  if (name !== 'temporal-echoes' && echoRenderer) disposeEcho();
  if (name !== 'fractured-identity' && fracturePreview) disposeFracture();
  if (name !== 'slit-scan') {
    slitGeneration++; clearTimeout(slitTimer); slitAbort?.abort(); slitAbort = null;
    if (slitSampling) { temporal?.cancel(); slitSampling = false; $('slitCancel').disabled = true; }
    if (slitVolume) { slitVolume = null; $('slitExport').disabled = true; $('slitCanvas').width = 0; $('slitCanvas').height = 0; if (!cube?.volume) temporal?.clear(); }
  }
  if (name === 'spacetime' || name === 'slit-scan') { syncEffectControls(); return; }
  if (name === 'temporal-echoes') { syncEffectControls(); if (media) { if (video.paused) scheduleExtract(video.currentTime); else renderLive(); } return; }
  if (name === 'fractured-identity') { syncEffectControls(); if (media) { if (video.paused) scheduleExtract(video.currentTime); else renderLive(); } return; }
  const defaultDrag = name === 'smear' && !effect.deltaX && !effect.deltaY ? { deltaX: 0.08 } : {};
  effect = normalizeEffect({ ...effect, ...defaultDrag, name, radius: Number($('videoSize').value) / 100, strength: Number($('videoStrength').value) / 100 });
  $('videoSizeValue').value = `${$('videoSize').value}%`;
  $('videoStrengthValue').value = `${$('videoStrength').value}%`;
  if (video.paused) scheduleExtract(video.currentTime);
  else renderLive();
  syncEffectControls();
}
for (const id of ['videoEffect', 'videoSize', 'videoStrength']) $(id).addEventListener(id === 'videoEffect' ? 'change' : 'input', updateEffect);
for (const id of ['echoCount', 'echoGap', 'echoStrength', 'echoThreshold']) $(id).addEventListener('input', () => {
  updateEchoLabels();
  temporal?.saveParameters('temporal-echoes', echoOptions());
  if (media && isEcho()) { if (video.paused) scheduleExtract(video.currentTime); else renderLive(); }
});
for (const id of ['slitStartTime', 'slitEndTime', 'slitCount', 'slitWidth']) $(id).addEventListener('input', updateSlitMemory);
for (const id of ['slitDirection', 'slitLineStart', 'slitLineEnd', 'slitBand']) $(id).addEventListener('input', () => {
  updateSlitLabels();
  temporal?.saveParameters('slit-scan-view', slitOptions());
  if (!slitVolume || !isSlit()) return;
  clearTimeout(slitTimer);
  slitTimer = setTimeout(() => renderSlitScan(slitVolume).catch(error => { if (error.name !== 'AbortError') status(error.message, true); }), 40);
});

async function renderSlitScan(volume) {
  slitAbort?.abort();
  const controller = new AbortController();
  slitAbort = controller;
  const version = ++slitRenderVersion;
  $('slitExport').disabled = true;
  const result = await composeSlitScanAsync(volume, slitOptions(), controller.signal);
  if (controller.signal.aborted || version !== slitRenderVersion || !isSlit()) return;
  const target = $('slitCanvas');
  target.width = result.width;
  target.height = result.height;
  target.getContext('2d').putImageData(new ImageData(result.pixels, result.width, result.height), 0, 0);
  $('slitExport').disabled = false;
  status(`Slit Scan ready: ${volume.depth} frames. Adjust the line to explore motion through time.`);
  if (slitAbort === controller) slitAbort = null;
}

$('slitGenerate').addEventListener('click', async () => {
  if (!media || !temporal || !isSlit() || exporting) return;
  const generationSession = session;
  const run = ++slitGeneration;
  const size = updateSlitMemory();
  const options = { ...size, start: Number($('slitStartTime').value), end: Number($('slitEndTime').value) };
  $('slitGenerate').disabled = true;
  $('slitCancel').disabled = false;
  $('slitExport').disabled = true;
  slitAbort?.abort();
  slitVolume = null;
  $('slitCanvas').width = 0;
  $('slitCanvas').height = 0;
  cube?.clearVolume();
  temporal.clear();
  slitSampling = true;
  status('Sampling local video for Slit Scan… 0%');
  try {
    const volume = await temporal.sample(options, progress => { if (run === slitGeneration) status(`Sampling local video for Slit Scan… ${Math.round(progress * 100)}%`); });
    if (generationSession !== session || run !== slitGeneration || !isSlit()) return;
    slitSampling = false;
    slitVolume = volume;
    temporal.saveParameters('slit-scan-sampling', options);
    await renderSlitScan(volume);
  } catch (error) { if (generationSession === session && run === slitGeneration) status(error.name === 'AbortError' ? 'Slit Scan canceled.' : error.message, error.name !== 'AbortError'); }
  finally { if (generationSession === session && run === slitGeneration) { slitSampling = false; $('slitGenerate').disabled = false; $('slitCancel').disabled = true; } }
});
$('slitCancel').addEventListener('click', () => { slitGeneration++; slitRenderVersion++; slitAbort?.abort(); if (slitSampling) temporal?.cancel(); slitSampling = false; $('slitGenerate').disabled = !media; $('slitCancel').disabled = true; status('Slit Scan canceled.'); });
$('slitExport').addEventListener('click', async () => {
  if (!slitVolume || !isSlit() || $('slitExport').disabled) return;
  const blob = await new Promise(resolve => $('slitCanvas').toBlob(resolve, 'image/png'));
  if (!blob) { status('Could not save the Slit Scan PNG.', true); return; }
  download(blob, 'photo-flow-slit-scan.png');
  status('Saved Slit Scan PNG.');
});
for (const id of ['cubeStart', 'cubeEnd', 'cubeCount', 'cubeWidth']) $(id).addEventListener('input', updateCubeMemory);
for (const id of ['cubeMode', 'cubeAxis', 'cubePosition', 'cubeOpacity', 'cubeScale', 'cubeSpacing', 'cubeFaces', 'cubeHighlight']) {
  $(id).addEventListener('input', () => {
    $('cubePositionValue').value = `${$('cubePosition').value}%`;
    $('cubeOpacityValue').value = `${$('cubeOpacity').value}%`;
    $('cubeScaleValue').value = `${$('cubeScale').value}%`;
    $('cubeSpacingValue').value = `${$('cubeSpacing').value}%`;
    cube?.setOptions(cubeOptions());
    temporal?.saveParameters('spacetime-view', cubeOptions());
  });
}
$('cubeGenerate').addEventListener('click', async () => {
  if (!media || !temporal || !cube || exporting) return;
  const generationSession = session;
  const size = updateCubeMemory();
  const options = { ...size, start: Number($('cubeStart').value), end: Number($('cubeEnd').value) };
  if (size.width > cube.capabilities().max3DSize || size.height > cube.capabilities().max3DSize || size.count > cube.capabilities().max3DSize) {
    status(`This GPU supports a maximum 3D texture dimension of ${cube.capabilities().max3DSize}.`, true); return;
  }
  $('cubeGenerate').disabled = true;
  $('cubeCancel').disabled = false;
  cube.clearVolume();
  slitAbort?.abort();
  slitVolume = null;
  $('slitExport').disabled = true;
  temporal.clear();
  $('cubeScreenshot').disabled = true;
  status('Sampling video into a local 3D volume… 0%');
  try {
    const volume = await temporal.sample(options, progress => status(`Sampling video into a local 3D volume… ${Math.round(progress * 100)}%`));
    if (generationSession !== session) return;
    cube.setVolume(volume);
    cube.setOptions(cubeOptions());
    $('cubeScreenshot').disabled = false;
    temporal.saveParameters('spacetime-sampling', options);
    status(`Ready: ${volume.depth} frames from ${options.start.toFixed(2)} to ${options.end.toFixed(2)} seconds. Drag to explore.`);
  } catch (error) { if (generationSession === session) status(error.name === 'AbortError' ? 'Sampling canceled.' : error.message, error.name !== 'AbortError'); }
  finally { if (generationSession === session) { $('cubeGenerate').disabled = false; $('cubeCancel').disabled = true; } }
});
$('cubeCancel').addEventListener('click', () => temporal?.cancel());
for (const button of document.querySelectorAll('[data-cube-preset]')) button.addEventListener('click', () => cube?.preset(button.dataset.cubePreset));
$('cubeReset').addEventListener('click', () => cube?.reset());
$('cubePlaySlice').addEventListener('click', () => { if (!cube) return; cube.playSlice = !cube.playSlice; $('cubePlaySlice').textContent = cube.playSlice ? 'Pause slice' : 'Play slice'; });
$('cubeOrbit').addEventListener('click', () => { if (!cube) return; cube.orbit = !cube.orbit; $('cubeOrbit').textContent = cube.orbit ? 'Pause orbit' : 'Orbit camera'; });
$('cubeScreenshot').addEventListener('click', async () => {
  if (!cube?.volume) return;
  const blob = await cube.screenshot();
  if (blob) { download(blob, 'photo-flow-spacetime.png'); status('Saved Spacetime Cube screenshot.'); }
});
canvas.addEventListener('pointerdown', event => {
  if (!media) return;
  const box = canvas.getBoundingClientRect();
  dragging = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  canvas.setPointerCapture(event.pointerId);
  effect = normalizeEffect({ ...effect, centerX: dragging.x, centerY: dragging.y, seed: effect.seed + 1 });
  if (video.paused) scheduleExtract(video.currentTime);
});
canvas.addEventListener('pointermove', event => {
  if (!dragging) return;
  const box = canvas.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  const y = (event.clientY - box.top) / box.height;
  effect = normalizeEffect({ ...effect, centerX: x, centerY: y, deltaX: x - dragging.x, deltaY: y - dragging.y });
  if (video.paused) scheduleExtract(video.currentTime);
});
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { dragging = null; });

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

$('extractFrame').addEventListener('click', async () => {
  if (!media) return;
  try {
    await renderExtracted(video.currentTime);
    const target = isEcho() ? $('echoCanvas') : isFractured() ? $('fracturedVideoCanvas') : canvas;
    const blob = await new Promise(resolve => target.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not make a PNG from this frame.');
    download(blob, 'photo-flow-frame.png');
    status(`Saved a frame at ${formatTime(video.currentTime)}.`);
  } catch (error) { status(error.message, true); }
});

$('exportVideo').addEventListener('click', async () => {
  if (!media || exporting) return;
  exporting = true;
  media.pause();
  stopFrameLoop();
  $('playVideo').textContent = 'Play';
  $('exportVideo').disabled = true;
  status('Exporting MP4 locally… 0%');
  try {
    const exportEffect = isEcho() ? { name: 'temporal-echoes', ...echoOptions() } : isFractured() ? { name:'fractured-identity',...fractureControls.get() } : effect;
    const { buffer, audioWarning } = await media.export(exportEffect, progress => status(`Exporting MP4 locally… ${Math.round(progress * 100)}%`));
    download(new Blob([buffer], { type: 'video/mp4' }), 'photo-flow-video.mp4');
    status(audioWarning || 'MP4 exported with original AAC audio when present.');
  } catch (error) { status(error.message, true); }
  finally { exporting = false; syncEffectControls(false); }
});

window.addEventListener('beforeunload', closeMedia);
if (!('VideoDecoder' in window) || !('OffscreenCanvas' in window)) {
  status('This browser lacks WebCodecs video decoding or OffscreenCanvas. Use a recent Chrome or Edge for Video Studio.', true);
} else if (!('VideoEncoder' in window)) {
  status('Video preview is available; this browser cannot export MP4 through WebCodecs.', true);
}
