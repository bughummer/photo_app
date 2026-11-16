import { FracturedRenderer } from './renderer.mjs';
import { FractureGeometryClient } from './geometry-client.mjs';
import { geometryKey, normalizeFracturedParams } from './parameters.mjs';

export class FracturedPreview {
  constructor(canvas, width, height, onError = () => {}) {
    this.renderer = new FracturedRenderer(canvas,width,height);
    this.geometryClient = new FractureGeometryClient();
    this.onError = onError;
    this.params = normalizeFracturedParams();
    this.key = '';
    this.version = 0;
    this.source = null;
    this.time = 0;
    this.anchors = this.params.anchors;
    this.dynamic = false;
    this.ready = Promise.resolve();
  }
  setSource(source, dynamic = false) { this.source = source; this.dynamic = dynamic; this.renderer.source = null; this.render(); }
  setParams(raw) {
    this.params = normalizeFracturedParams(raw);
    this.anchors = this.params.anchors;
    const key = geometryKey(this.params);
    if (key !== this.key) {
      this.key = key;
      const version = ++this.version;
      this.ready = this.geometryClient.get(this.params).then(geometry => {
        if (version !== this.version) return;
        this.renderer.setGeometry(geometry);
        this.render();
      }).catch(error => { if (version === this.version) this.onError(error); });
    } else this.render();
    return this.ready;
  }
  setTime(time) { this.time = time; this.render(); }
  setAnchors(anchors) { this.anchors = anchors; this.render(); }
  render() { return this.renderer.render(this.source,this.time,this.params,this.anchors,this.dynamic); }
  dispose() {
    this.version++;
    this.geometryClient.dispose();
    this.renderer.dispose();
    this.source = null;
  }
}
