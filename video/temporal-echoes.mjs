export function normalizeEchoParams(raw = {}) {
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  return {
    count: Math.round(number(raw.count, 3, 1, 4)),
    gap: number(raw.gap, .18, .05, .5),
    strength: number(raw.strength, .55, 0, 1),
    threshold: number(raw.threshold, .08, 0, .4)
  };
}

export function echoFrameTimes(time, duration, raw = {}) {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) throw new Error('Invalid echo timeline.');
  const { count, gap } = normalizeEchoParams(raw);
  const current = Math.min(Math.max(time, 0), duration - .000001);
  const frames = [{ age: 0, time: current }];
  for (let age = 1; age <= count; age++) {
    const previous = current - age * gap;
    if (previous >= 0) frames.push({ age, time: previous });
  }
  return frames.sort((a, b) => a.time - b.time);
}

export class EchoPlaybackHistory {
  constructor(width, height, maxBytes = 64 * 1024 * 1024) {
    this.width = width;
    this.height = height;
    this.maxFrames = Math.max(1, Math.floor(maxBytes / (width * height * 4)));
    this.frames = [];
    this.pool = [];
    this.lastTime = -1;
  }

  capture(source, time, rawParams = {}) {
    if (!Number.isFinite(time)) return;
    const params = normalizeEchoParams(rawParams);
    if (this.lastTime >= 0 && (time < this.lastTime - .01 || time - this.lastTime > .5)) this.clear();
    if (this.lastTime >= 0 && time - this.lastTime < 1 / 30) return;
    const canvas = this.pool.pop() || new OffscreenCanvas(this.width, this.height);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(source, 0, 0, this.width, this.height);
    this.frames.push({ time, canvas });
    this.lastTime = time;
    const oldest = time - params.count * params.gap - .1;
    while (this.frames.length > this.maxFrames || (this.frames.length > 1 && this.frames[0].time < oldest)) this.pool.push(this.frames.shift().canvas);
    while (this.pool.length > 2) { const old = this.pool.pop(); old.width = old.height = 0; }
  }

  sourcesAt(time, rawParams = {}) {
    const { count, gap } = normalizeEchoParams(rawParams);
    return Array.from({ length: count }, (_, index) => {
      const target = time - (index + 1) * gap;
      if (target < 0) return null;
      let best = null;
      for (const frame of this.frames) {
        if (frame.time >= time) continue;
        if (!best || Math.abs(frame.time - target) < Math.abs(best.time - target)) best = frame;
      }
      return best && Math.abs(best.time - target) <= Math.max(.07, gap * .6) ? best.canvas : null;
    });
  }

  clear() {
    for (const frame of this.frames) { frame.canvas.width = frame.canvas.height = 0; }
    for (const canvas of this.pool) { canvas.width = canvas.height = 0; }
    this.frames = [];
    this.pool = [];
    this.lastTime = -1;
  }
  dispose() { this.clear(); }
}
