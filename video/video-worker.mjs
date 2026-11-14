import { Input, ALL_FORMATS, BlobSource, VideoSampleSink, Output, Mp4OutputFormat, BufferTarget, CanvasSource, EncodedPacketSink, EncodedAudioPacketSource, canEncodeVideo } from '../node_modules/mediabunny/dist/bundles/mediabunny.mjs';
import { frameTimes, clampTime } from './timeline.mjs';
import { WebGL2VideoRenderer } from './webgl2-renderer.mjs';

let input = null;
let track = null;
let sink = null;
let file = null;
let duration = 0;
let previewCanvas = null;
let decodeQueue = Promise.resolve();

function disposeInput() {
  input?.dispose();
  input = track = sink = file = previewCanvas = null;
  duration = 0;
}

async function inspectVideo(sourceFile) {
  if (typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('Video Studio needs WebCodecs video decoding and OffscreenCanvas. Update Chrome or Edge and try again.');
  }
  if (sourceFile.size > 500 * 1024 * 1024) throw new Error('Choose a video under 500 MB for this first version.');
  const candidate = new Input({ source: new BlobSource(sourceFile), formats: ALL_FORMATS });
  try {
    if (!await candidate.canRead()) throw new Error('This video container is not supported. Try MP4 or WebM.');
    const videoTrack = await candidate.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The file has no video track.');
    if (!await videoTrack.canDecode()) throw new Error('This video codec cannot be decoded by this browser.');
    const clipDuration = await candidate.computeDuration();
    const width = await videoTrack.getDisplayWidth();
    const height = await videoTrack.getDisplayHeight();
    if (!Number.isFinite(clipDuration) || clipDuration <= 0 || !width || !height) throw new Error('Video duration or dimensions could not be read.');
    return { candidate, videoTrack, clipDuration, width, height, hasAudio: !!await candidate.getPrimaryAudioTrack() };
  } catch (error) {
    candidate.dispose();
    throw error;
  }
}

async function open(sourceFile) {
  disposeInput();
  const found = await inspectVideo(sourceFile);
  input = found.candidate;
  track = found.videoTrack;
  sink = new VideoSampleSink(track);
  file = sourceFile;
  duration = found.clipDuration;
  const scale = Math.min(1, 1280 / Math.max(found.width, found.height));
  const width = Math.max(2, Math.floor(found.width * scale / 2) * 2);
  const height = Math.max(2, Math.floor(found.height * scale / 2) * 2);
  previewCanvas = new OffscreenCanvas(width, height);
  const encodeSupported = typeof VideoEncoder !== 'undefined' && await canEncodeVideo('avc', { width, height, frameRate: 24 });
  const exportAvailable = duration <= 60 && encodeSupported;
  const exportReason = duration > 60 ? 'Stage 1 MP4 export is limited to 60 seconds.' : encodeSupported ? '' : 'H.264 MP4 encoding is unavailable in this browser.';
  return { duration, width, height, hasAudio: found.hasAudio, exportAvailable, exportReason };
}

async function extract(time) {
  if (!sink) throw new Error('Open a video before extracting frames.');
  const sample = await sink.getSample(clampTime(time, duration - 0.000001));
  if (!sample) throw new Error('No decoded frame was found at this time.');
  try {
    const context = previewCanvas.getContext('2d');
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    sample.draw(context, 0, 0, previewCanvas.width, previewCanvas.height);
    return await createImageBitmap(previewCanvas);
  } finally {
    sample.close();
  }
}

async function exportVideo(effect, requestId) {
  if (!file) throw new Error('Open a video before exporting.');
  if (duration > 60) throw new Error('Stage 1 export is limited to 60 seconds. Trim the clip first or choose a shorter video.');
  const width = previewCanvas.width, height = previewCanvas.height;
  if (typeof VideoEncoder === 'undefined' || !await canEncodeVideo('avc', { width, height, frameRate: 24 })) throw new Error('This browser cannot encode H.264 MP4 at the working resolution.');
  const exportInput = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let output = null;
  let renderer = null;
  try {
    const videoTrack = await exportInput.getPrimaryVideoTrack();
    const audioTrack = await exportInput.getPrimaryAudioTrack();
    const format = new Mp4OutputFormat();
    const target = new BufferTarget();
    output = new Output({ format, target });
    const canvas = new OffscreenCanvas(width, height);
    renderer = new WebGL2VideoRenderer(canvas, width, height);
    const source = new CanvasSource(canvas, { codec: 'avc', bitrate: 4_000_000, keyFrameInterval: 2 });
    output.addVideoTrack(source);
    let audioSource = null;
    let audioWarning = '';
    if (audioTrack) {
      const codec = await audioTrack.getCodec();
      if (codec === 'aac' && format.getSupportedCodecs().includes(codec)) {
        audioSource = new EncodedAudioPacketSource(codec);
        output.addAudioTrack(audioSource);
      } else audioWarning = `Original ${codec || 'unknown'} audio cannot be copied into MP4; this export is silent.`;
    }
    await output.start();
    const audioCopy = audioSource ? (async () => {
      const packets = new EncodedPacketSink(audioTrack);
      const decoderConfig = await audioTrack.getDecoderConfig();
      let first = true;
      for await (const packet of packets.packets()) {
        await audioSource.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
        first = false;
      }
    })() : Promise.resolve();
    const frameCanvas = new OffscreenCanvas(width, height);
    const frameContext = frameCanvas.getContext('2d');
    const timestamps = frameTimes(duration, 24);
    const samples = new VideoSampleSink(videoTrack);
    let index = 0;
    for await (const sample of samples.samplesAtTimestamps(timestamps)) {
      if (!sample) throw new Error(`A frame could not be decoded at ${timestamps[index].toFixed(2)} seconds.`);
      try {
        frameContext.clearRect(0, 0, width, height);
        sample.draw(frameContext, 0, 0, width, height);
        renderer.render(frameCanvas, effect);
        await source.add(timestamps[index], Math.min(1 / 24, duration - timestamps[index]));
      } finally {
        sample.close();
      }
      index++;
      if (index % 12 === 0 || index === timestamps.length) self.postMessage({ type: 'progress', id: requestId, value: index / timestamps.length });
    }
    if (index !== timestamps.length) throw new Error('The decoder ended before all export frames were produced.');
    await audioCopy;
    await output.finalize();
    const buffer = target.buffer;
    if (!buffer) throw new Error('No MP4 data was produced.');
    if (buffer.byteLength > 200 * 1024 * 1024) throw new Error('The exported MP4 exceeds the 200 MB Stage 1 limit.');
    return { buffer, audioWarning };
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
    throw error;
  } finally {
    renderer?.dispose();
    exportInput.dispose();
  }
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'open') {
      decodeQueue = Promise.resolve();
      self.postMessage({ id, value: await open(data.file) });
    } else if (type === 'extract') {
      const task = decodeQueue.then(() => extract(data.time));
      decodeQueue = task.catch(() => {});
      const bitmap = await task;
      self.postMessage({ id, value: { bitmap }, }, [bitmap]);
    } else if (type === 'export') {
      const result = await exportVideo(data.effect, id);
      self.postMessage({ id, value: result }, [result.buffer]);
    } else if (type === 'dispose') {
      disposeInput();
      self.postMessage({ id, value: true });
    }
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
