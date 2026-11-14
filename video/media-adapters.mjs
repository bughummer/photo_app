import { FrameCache } from './frame-cache.mjs';
import { clampTime } from './timeline.mjs';
import { VideoWorkerClient } from './worker-client.mjs';
import { BrowserMp4ExportAdapter } from './export-adapters.mjs';

export class ImageMediaAdapter {
  static kind = 'image';
  constructor(bitmap) { this.bitmap = bitmap; this.width = bitmap.width; this.height = bitmap.height; }
  static async open(file) { return new ImageMediaAdapter(await createImageBitmap(file)); }
  getFrame() { return this.bitmap; }
  dispose() { this.bitmap.close(); }
}

export class VideoMediaAdapter {
  static kind = 'video';
  constructor(file, element) {
    this.file = file;
    this.element = element;
    this.worker = new VideoWorkerClient();
    this.exporter = new BrowserMp4ExportAdapter(this.worker);
    this.cache = new FrameCache();
    this.url = URL.createObjectURL(file);
    this.element.src = this.url;
  }

  async open() {
    try {
      const browserReady = new Promise((resolve, reject) => {
        this.element.addEventListener('loadedmetadata', resolve, { once: true });
        this.element.addEventListener('error', () => reject(new Error('This browser cannot play the selected video. Try H.264 MP4 or VP9 WebM.')), { once: true });
      });
      this.element.load();
      const [details] = await Promise.all([this.worker.request('open', { file: this.file }), browserReady]);
      this.duration = details.duration;
      this.width = details.width;
      this.height = details.height;
      this.hasAudio = details.hasAudio;
      this.exportAvailable = details.exportAvailable;
      return details;
    } catch (error) { this.dispose(); throw error; }
  }

  async frameAt(time) {
    const clamped = clampTime(time, this.duration);
    const key = clamped.toFixed(3);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { bitmap } = await this.worker.request('extract', { time: clamped });
    this.cache.set(key, bitmap);
    return bitmap;
  }

  seek(time) { this.element.currentTime = clampTime(time, this.duration); }
  play() { return this.element.play(); }
  pause() { this.element.pause(); }
  export(effect, onProgress) { return this.exporter.export(effect, onProgress); }

  dispose() {
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
    URL.revokeObjectURL(this.url);
    this.cache.clear();
    this.worker.close();
  }
}
