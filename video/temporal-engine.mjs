import { samplingSchedule } from './temporal-mapping.mjs';
import * as THREE from '../node_modules/three/build/three.module.js';

const MAX_VOLUME_BYTES = 96 * 1024 * 1024;

export class TemporalTextureManager {
  constructor() { this.textures = new Set(); }
  createVolume(volume, maxDimension) {
    const { width, height, depth, data } = volume;
    if (Math.max(width, height, depth) > maxDimension) throw new Error(`This GPU supports 3D textures only up to ${maxDimension} pixels per axis.`);
    const texture = new THREE.Data3DTexture(data, width, height, depth);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.textures.add(texture);
    return texture;
  }
  release(texture) { if (this.textures.delete(texture)) texture.dispose(); }
  dispose() { for (const texture of this.textures) texture.dispose(); this.textures.clear(); }
}

export class TemporalEffectsEngine {
  constructor(media) {
    this.media = media;
    this.active = null;
    this.volume = null;
    this.parameters = new Map();
  }

  schedule({ start, end, count }) { return samplingSchedule(start, end, count, this.media.duration); }

  async frameAt(time) { return this.media.frameAt(time); }

  async sample(options, onProgress = () => {}) {
    this.cancel();
    const bytes = options.width * options.height * options.count * 4;
    if (!Number.isSafeInteger(bytes) || bytes > MAX_VOLUME_BYTES) throw new Error('Temporal preview exceeds the 96 MB memory budget.');
    this.schedule(options);
    const controller = new AbortController();
    this.active = controller;
    try {
      const result = await this.media.worker.request('sampleRange', { options }, onProgress, controller.signal);
      if (this.active !== controller) throw new DOMException('Canceled', 'AbortError');
      this.volume = { ...result, data: new Uint8Array(result.buffer) };
      return this.volume;
    } finally { if (this.active === controller) this.active = null; }
  }

  cancel() { this.active?.abort(); this.active = null; }
  clear() { this.cancel(); this.volume = null; }
  saveParameters(key, value) {
    this.parameters.set(key, structuredClone(value));
    try { localStorage.setItem(`photo-flow-temporal:${key}`, JSON.stringify(value)); } catch {}
  }
  getParameters(key) {
    if (this.parameters.has(key)) return structuredClone(this.parameters.get(key));
    try { return JSON.parse(localStorage.getItem(`photo-flow-temporal:${key}`)); } catch { return null; }
  }
  dispose() { this.clear(); this.parameters.clear(); }
}
