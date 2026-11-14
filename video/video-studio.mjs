import { VIDEO_EFFECTS, normalizeEffect } from './effect-interface.mjs';
import { clampTime, formatTime } from './timeline.mjs';
import { VideoMediaAdapter } from './media-adapters.mjs';
import { WebGL2VideoRenderer } from './webgl2-renderer.mjs';

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
    $('videoCanvas').parentElement.classList.add('loaded');
    $('videoTimeline').max = details.duration;
    $('videoTimeline').value = 0;
    $('videoDetails').textContent = `${file.name} · ${details.width} × ${details.height} working size · ${formatTime(details.duration)} · ${details.hasAudio ? 'audio track' : 'no audio track'}`;
    controls(true, details.exportAvailable);
    await renderExtracted(0);
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
  const defaultDrag = name === 'smear' && !effect.deltaX && !effect.deltaY ? { deltaX: 0.08 } : {};
  effect = normalizeEffect({ ...effect, ...defaultDrag, name, radius: Number($('videoSize').value) / 100, strength: Number($('videoStrength').value) / 100 });
  $('videoSizeValue').value = `${$('videoSize').value}%`;
  $('videoStrengthValue').value = `${$('videoStrength').value}%`;
  if (video.paused) scheduleExtract(video.currentTime);
  else renderLive();
}
for (const id of ['videoEffect', 'videoSize', 'videoStrength']) $(id).addEventListener(id === 'videoEffect' ? 'change' : 'input', updateEffect);
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
  finally { exporting = false; $('exportVideo').disabled = !media || !media.exportAvailable; }
});

window.addEventListener('beforeunload', closeMedia);
if (!('VideoDecoder' in window) || !('OffscreenCanvas' in window)) {
  status('This browser lacks WebCodecs video decoding or OffscreenCanvas. Use a recent Chrome or Edge for Video Studio.', true);
} else if (!('VideoEncoder' in window)) {
  status('Video preview is available; this browser cannot export MP4 through WebCodecs.', true);
}
