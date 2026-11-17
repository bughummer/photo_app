import { FracturedRenderer } from './renderer.mjs';
import { normalizeFracturedParams } from './parameters.mjs';

export class FracturedPreview {
  constructor(canvas, width, height) {
    this.renderer = new FracturedRenderer(canvas,width,height);
    this.params = normalizeFracturedParams();
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
    this.render();
    return this.ready;
  }
  setTime(time) { this.time = time; this.render(); }
  setAnchors(anchors) { this.anchors = anchors; this.render(); }
  render() { return this.renderer.render(this.source,this.time,this.params,this.anchors,this.dynamic); }
  dispose() { this.renderer.dispose(); this.source = null; }
}
