export const faceShader = `
vec2 faceWarp(vec2 uv) {
  vec2 drift=vec2(0.0);
  for (int i=0;i<5;i++) {
    vec2 anchor=uAnchors[i];
    vec2 difference=(uv-anchor)*vec2(uAspect,1.0);
    float radius=i<2 ? .115 : i==2 ? .15 : .17;
    float weight=exp(-dot(difference,difference)/(radius*radius));
    float control=i<2 ? uEye : i==3 ? uMouth : uFaceDeformation;
    vec2 direction=i==0 ? vec2(-.017,.012) : i==1 ? vec2(.014,-.009) : i==2 ? vec2(.01,.013) : i==3 ? vec2(-.02,-.017) : vec2(.01,-.012);
    float oscillation=.65+.35*sin(uAngle+float(i)*1.8);
    drift+=direction*weight*control*uMorphIntensity*uDistortion*uPulse*oscillation;
    if(i==3) drift.x+=(uv.x-anchor.x)*weight*uMouth*uMorphIntensity*uPulse*.055;
  }
  return drift;
}`;

export const DEFAULT_FACE_ANCHORS = [
  { x: .36, y: .4 }, { x: .64, y: .4 }, { x: .5, y: .55 }, { x: .5, y: .7 }, { x: .5, y: .82 }
];

export class AnchorTracker {
  constructor(anchors = DEFAULT_FACE_ANCHORS, width = 160) {
    this.anchors = anchors.map(anchor => ({ ...anchor }));
    this.width = width;
    this.canvas = new OffscreenCanvas(width, width);
    this.previous = null;
  }

  update(source) {
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, this.width, this.width);
    const current = context.getImageData(0, 0, this.width, this.width).data;
    if (this.previous) {
      const sample = (pixels, x, y) => {
        const i = (y * this.width + x) * 4;
        return pixels[i] * .25 + pixels[i + 1] * .5 + pixels[i + 2] * .25;
      };
      for (const anchor of this.anchors) {
        const cx = Math.round(anchor.x * (this.width - 1)), cy = Math.round(anchor.y * (this.width - 1));
        if (cx < 10 || cy < 10 || cx >= this.width - 10 || cy >= this.width - 10) continue;
        let best = Infinity, bx = 0, by = 0;
        for (let dy = -5; dy <= 5; dy += 2) for (let dx = -5; dx <= 5; dx += 2) {
          let difference = 0;
          for (let py = -3; py <= 3; py += 2) for (let px = -3; px <= 3; px += 2) {
            difference += Math.abs(sample(this.previous, cx + px, cy + py) - sample(current, cx + px + dx, cy + py + dy));
          }
          if (difference < best) { best = difference; bx = dx; by = dy; }
        }
        if (best < 500) {
          anchor.x = Math.max(0, Math.min(1, anchor.x + bx / this.width * .7));
          anchor.y = Math.max(0, Math.min(1, anchor.y + by / this.width * .7));
        }
      }
    }
    this.previous = new Uint8ClampedArray(current);
    return this.anchors;
  }
  reset(anchors) { this.anchors = anchors.map(anchor => ({ ...anchor })); this.previous = null; }
  dispose() { this.canvas.width = this.canvas.height = 0; this.previous = null; }
}

export async function detectFaceAnchors(source) {
  if (typeof FaceDetector === 'undefined') return null;
  const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
  const faces = await detector.detect(source);
  const face = faces[0];
  if (!face) return null;
  const width = source.videoWidth || source.width, height = source.videoHeight || source.height;
  const box = face.boundingBox;
  const feature = type => face.landmarks?.filter(item => item.type === type).map(item => item.locations?.[0] || item.location || item.point) || [];
  const point = (value, fallbackX, fallbackY) => value && Number.isFinite(value.x) ? { x: value.x / width, y: value.y / height } : { x: fallbackX, y: fallbackY };
  const left = feature('eye')[0], right = feature('eye')[1];
  const nose = feature('nose')[0], mouth = feature('mouth')[0];
  const bx = box.x / width, by = box.y / height, bw = box.width / width, bh = box.height / height;
  return [point(left, bx + bw * .33, by + bh * .4), point(right, bx + bw * .67, by + bh * .4),
    point(nose, bx + bw * .5, by + bh * .55), point(mouth, bx + bw * .5, by + bh * .72), { x: bx + bw * .5, y: by + bh * .86 }];
}
