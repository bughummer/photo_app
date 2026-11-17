import { ErodedRenderer } from './renderer.mjs';
import { normalizeParams } from './parameters.mjs';
export class ErodedPreview {
 constructor(canvas,width,height){this.renderer=new ErodedRenderer(canvas,width,height);this.params=normalizeParams();this.source=null;this.time=0;this.anchors=this.params.anchors;this.dynamic=false;this.ready=Promise.resolve()}
 setSource(source,dynamic=false){this.source=source;this.dynamic=dynamic;this.renderer.source=null;this.render()}
 setParams(params){this.params=normalizeParams(params);this.anchors=this.params.anchors;this.render();return this.ready}
 setTime(time){this.time=time;this.render()}
 render(){return this.renderer.render(this.source,this.time,this.params,this.anchors,this.dynamic)}
 dispose(){this.renderer.dispose();this.source=null}
}
