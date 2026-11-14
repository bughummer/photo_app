export class FrameCache {
  constructor(maxFrames = 5, maxBytes = 40 * 1024 * 1024) {
    this.maxFrames = maxFrames;
    this.maxBytes = maxBytes;
    this.frames = new Map();
    this.bytes = 0;
  }

  get(key) {
    const item = this.frames.get(key);
    if (!item) return null;
    this.frames.delete(key);
    this.frames.set(key, item);
    return item.frame;
  }

  set(key, frame) {
    const size = frame.width * frame.height * 4;
    if (this.frames.has(key)) this.delete(key);
    if (size > this.maxBytes) { frame.close(); return; }
    this.frames.set(key, { frame, size });
    this.bytes += size;
    while (this.frames.size > this.maxFrames || this.bytes > this.maxBytes) this.delete(this.frames.keys().next().value);
  }

  delete(key) {
    const item = this.frames.get(key);
    if (!item) return;
    this.frames.delete(key);
    this.bytes -= item.size;
    item.frame.close();
  }

  clear() {
    for (const key of this.frames.keys()) this.delete(key);
  }
}
