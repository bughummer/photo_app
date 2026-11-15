import { VIDEO_EFFECTS, normalizeEffect } from './effect-interface.mjs';
import { clampTime, formatTime } from './timeline.mjs';
import { VideoMediaAdapter } from './media-adapters.mjs';
import { WebGL2VideoRenderer } from './webgl2-renderer.mjs';
import { TemporalEffectsEngine } from './temporal-engine.mjs';
import { SpacetimeViewer } from './spacetime-viewer.mjs';

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

function syncCubeControls() {
  $('frameEffectControls').hidden = isCube();
  $('cubeControls').hidden = !isCube();
  $('cubeViewport').hidden = !isCube();
  $('videoCanvas').parentElement.classList.toggle('cube-active', isCube());
  $('exportVideo').disabled = exporting || isCube() || !media?.exportAvailable;
  $('extractFrame').disabled = isCube() || !media;
  $('playVideo').disabled = isCube() || !media;
  $('videoTimeline').disabled = isCube() || !media;
  $('cubeGenerate').disabled = exporting || !media;
  $('cubeScreenshot').disabled = !cube?.volume;
  if (isCube() && media) {
    media.pause(); stopFrameLoop(); $('playVideo').textContent = 'Play';
    if (!cube) {
      try { cube = new SpacetimeViewer($('cubeViewport')); cube.onSlicePosition = value => { $('cubePosition').value = String(Math.round(value * 100)); $('cubePositionValue').value = `${Math.round(value * 100)}%`; }; cube.setOptions(cubeOptions()); }
      catch (error) { status(error.message, true); return; }
    }
    cube.resize();
    status(cube.volume ? 'Drag to rotate, Shift drag to pan, or scroll to zoom.' : 'Choose an interval and generate a spacetime volume.');
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
  if (!media || !renderer || video.readyState < 2) return;
  renderer.render(video, effect);
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
  const frame = await current.frameAt(time);
  if (version !== seekVersion || current !== media) return;
  renderer.render(frame, effect);
  updateTime(time);
}

function scheduleExtract(time) {
  clearTimeout(seekTimer);
  seekTimer = setTimeout(() => renderExtracted(time).catch(error => status(error.message, true)), 70);
}

function closeMedia() {
  session++;
  seekVersion++;
  clearTimeout(seekTimer);
  stopFrameLoop();
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
  $('videoCanvas').parentElement.classList.remove('loaded');
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
    $('cubeStart').value = '0';
    $('cubeEnd').value = String(details.duration);
    restoreCubeParameters();
    updateCubeMemory();
    $('videoCanvas').parentElement.classList.add('loaded');
    $('videoTimeline').max = details.duration;
    $('videoTimeline').value = 0;
    $('videoDetails').textContent = `${file.name} · ${details.width} × ${details.height} working size · ${formatTime(details.duration)} · ${details.hasAudio ? 'audio track' : 'no audio track'}`;
    controls(true, details.exportAvailable);
    await renderExtracted(0);
    syncCubeControls();
    status(details.exportAvailable ? 'Ready. Drag on the frame to position the effect, or scrub the timeline.' : `Preview ready. ${details.exportReason} Frame PNG export is available.`);
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
  if (name === 'spacetime') { syncCubeControls(); return; }
  const defaultDrag = name === 'smear' && !effect.deltaX && !effect.deltaY ? { deltaX: 0.08 } : {};
  effect = normalizeEffect({ ...effect, ...defaultDrag, name, radius: Number($('videoSize').value) / 100, strength: Number($('videoStrength').value) / 100 });
  $('videoSizeValue').value = `${$('videoSize').value}%`;
  $('videoStrengthValue').value = `${$('videoStrength').value}%`;
  if (video.paused) scheduleExtract(video.currentTime);
  else renderLive();
  syncCubeControls();
}
for (const id of ['videoEffect', 'videoSize', 'videoStrength']) $(id).addEventListener(id === 'videoEffect' ? 'change' : 'input', updateEffect);
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
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
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
    const { buffer, audioWarning } = await media.export(effect, progress => status(`Exporting MP4 locally… ${Math.round(progress * 100)}%`));
    download(new Blob([buffer], { type: 'video/mp4' }), 'photo-flow-video.mp4');
    status(audioWarning || 'MP4 exported with original AAC audio when present.');
  } catch (error) { status(error.message, true); }
  finally { exporting = false; syncCubeControls(); }
});

window.addEventListener('beforeunload', closeMedia);
if (!('VideoDecoder' in window) || !('OffscreenCanvas' in window)) {
  status('This browser lacks WebCodecs video decoding or OffscreenCanvas. Use a recent Chrome or Edge for Video Studio.', true);
} else if (!('VideoEncoder' in window)) {
  status('Video preview is available; this browser cannot export MP4 through WebCodecs.', true);
}
