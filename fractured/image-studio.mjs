import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } from '../node_modules/mediabunny/dist/bundles/mediabunny.mjs';
import { mountFracturedControls } from './controls.mjs';
import { FracturedPreview } from './preview.mjs';
import { FracturedRenderer } from './renderer.mjs';
import { AnchorHandles } from './anchor-handles.mjs';
import { detectFaceAnchors } from './face.mjs';

const $ = id => document.getElementById(id);
const stage = $('stage'), canvas = $('fracturedCanvas'), baseCanvas = $('canvas');
const panel = $('fracturedImageControls');
let source = null, preview = null, handles = null, active = false, playing = true, exporting = false;
let epoch = performance.now(), frozenTime = 0, lastRender = 0, frame = 0;
const status = document.createElement('p'); status.className = 'fracture-status'; status.setAttribute('role','status');
const actions = document.createElement('div'); actions.className = 'fracture-actions';
const button = label => { const value = document.createElement('button'); value.type = 'button'; value.className = 'button'; value.textContent = label; actions.append(value); return value; };
const play = button('Pause animation'), save = button('Save frame PNG'), exportAnimation = button('Export animation');
const controls = mountFracturedControls(panel, params => {
  preview?.setParams(params);
  handles?.update(params.anchors,active && params.showAnchors);
}, 'photo-flow:turbulent-glass-v2');
panel.append(actions,status);
function say(message, error = false) { status.textContent = message; status.classList.toggle('error',error); }
function fit() {
  if (!active || !source || !preview) return;
  const parent = stage.getBoundingClientRect(), image = baseCanvas.getBoundingClientRect();
  canvas.style.left = `${image.left-parent.left}px`;
  canvas.style.top = `${image.top-parent.top}px`;
  canvas.style.width = `${image.width}px`;
  canvas.style.height = `${image.height}px`;
  handles?.place();
}
new ResizeObserver(fit).observe(stage);
function show() {
  active = true;
  $('brushControls').hidden = true;
  panel.hidden = false;
  stage.classList.add('fractured-active');
  canvas.hidden = !source;
  if (!source) { say('Open a photograph to start Turbulent Glass.'); return; }
  if (!preview) {
    const scale = Math.min(1, 720 / Math.max(source.width,source.height));
    preview = new FracturedPreview(canvas,Math.max(2,Math.round(source.width*scale)),Math.max(2,Math.round(source.height*scale)),error => say(error.message,true));
    preview.setSource(source);
    handles = new AnchorHandles(stage,canvas,(index,point) => {
      const params = controls.get();
      const anchors = params.anchors.map(anchor => ({ ...anchor }));
      anchors[index] = point;
      controls.set({ ...params,anchors });
    });
    preview.setParams(controls.get()).then(() => say('Turbulent Glass ready. Adjust a preset or drag the face anchors.'));
  }
  handles.update(controls.get().anchors,controls.get().showAnchors);
  epoch = performance.now() - frozenTime*1000;
  fit();
}
function hide() {
  active = false;
  panel.hidden = true;
  $('brushControls').hidden = false;
  stage.classList.remove('fractured-active');
  canvas.hidden = true;
  handles?.dispose(); handles = null;
  preview?.dispose(); preview = null;
}
for (const item of document.querySelectorAll('[data-brush]')) item.addEventListener('click', () => item.dataset.brush === 'fractured' ? show() : hide());
window.addEventListener('photo-flow:image-loaded', event => {
  source = event.detail.source;
  if (active) { hide(); show(); }
});
function tick(now) {
  frame = requestAnimationFrame(tick);
  if (!active || !preview || !playing || exporting || now-lastRender < 1000/30) return;
  lastRender = now;
  frozenTime = (now-epoch)/1000;
  preview.setTime(frozenTime);
}
frame = requestAnimationFrame(tick);
play.addEventListener('click', () => {
  playing = !playing;
  play.textContent = playing ? 'Pause animation' : 'Play animation';
  if (playing) epoch = performance.now()-frozenTime*1000;
});
function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}
async function exportStill() {
  if (!source || !preview || exporting) return;
  await preview.ready;
  const output = document.createElement('canvas');
  output.width = source.width; output.height = source.height;
  const renderer = new FracturedRenderer(output,output.width,output.height);
  try {
    renderer.render(source,frozenTime,controls.get());
    const blob = await new Promise(resolve => output.toBlob(resolve,'image/png'));
    if (!blob) throw new Error('Could not create a PNG.');
    download(blob,'photo-flow-turbulent-glass.png');
    say('Saved Turbulent Glass frame.');
  } catch (error) { say(error.message,true); }
  finally { renderer.dispose(); output.width = output.height = 0; }
}
save.addEventListener('click',exportStill);
window.PhotoFlowFracturedImage = { exportStill };
exportAnimation.addEventListener('click',async () => {
  if (!source || !preview || exporting) return;
  exporting = true; exportAnimation.disabled = true;
  let output = null, renderer = null, target = null;
  try {
    await preview.ready;
    const params = controls.get();
    const scale = Math.min(1,720/Math.max(source.width,source.height));
    const width = Math.max(2,Math.floor(source.width*scale/2)*2), height = Math.max(2,Math.floor(source.height*scale/2)*2);
    let codec, format, extension, mime;
    if (await canEncodeVideo('avc',{ width,height,frameRate:30 })) { codec='avc'; format=new Mp4OutputFormat(); extension='mp4'; mime='video/mp4'; }
    else if (await canEncodeVideo('vp9',{ width,height,frameRate:30 })) { codec='vp9'; format=new WebMOutputFormat(); extension='webm'; mime='video/webm'; }
    else throw new Error('This browser cannot encode MP4 or WebM video at the selected size.');
    const offscreen = new OffscreenCanvas(width,height);
    renderer = new FracturedRenderer(offscreen,width,height);
    target = new BufferTarget();
    output = new Output({ format,target });
    const track = new CanvasSource(offscreen,{ codec,bitrate:3_000_000,keyFrameInterval:1 });
    output.addVideoTrack(track);
    await output.start();
    const length = params.duration/params.speed;
    const count = Math.max(2,Math.round(length*30));
    for (let i = 0; i < count; i++) {
      const t = i/30;
      renderer.render(source,t,params);
      await track.add(t,Math.min(1/30,length-t));
      if (i%5===0 || i===count-1) {
        say(`Exporting animation… ${Math.round((i+1)/count*100)}%`);
        await new Promise(resolve => setTimeout(resolve,0));
      }
    }
    await output.finalize();
    if (!target.buffer) throw new Error('The animation encoder produced no video.');
    download(new Blob([target.buffer],{ type:mime }),`photo-flow-turbulent-glass.${extension}`);
    say(`Saved ${extension.toUpperCase()} animation.`);
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
    say(error.message,true);
  } finally { renderer?.dispose(); exporting = false; exportAnimation.disabled = false; epoch = performance.now()-frozenTime*1000; }
});
if (typeof FaceDetector === 'undefined') { controls.detectButton.disabled = true; controls.detectButton.title = 'Automatic face detection is unavailable here. Drag the face anchors manually.'; }
else controls.detectButton.addEventListener('click',async () => {
  if (!source) return;
  try {
    const anchors = await detectFaceAnchors(source);
    if (!anchors) { say('No face was detected. You can position the anchors manually.'); return; }
    controls.set({ ...controls.get(),anchors,showAnchors:true });
    say('Face anchors positioned. Drag them to refine the effect.');
  } catch (error) { say(`Face detection failed: ${error.message}`,true); }
});
