import * as THREE from '../node_modules/three/build/three.module.js';
import { TemporalTextureManager } from './temporal-engine.mjs';

const vertex = `out vec3 vLocal; out vec2 vUv2;
void main(){ vLocal=position; vUv2=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const sliceFragment = `precision highp float; precision highp sampler3D;
uniform sampler3D uVolume; uniform int uAxis; uniform float uPosition; uniform float uOpacity; uniform float uHighlight;
in vec2 vUv2; out vec4 outColor;
void main(){
 vec3 p = uAxis==0 ? vec3(vUv2.x,vUv2.y,uPosition) : uAxis==1 ? vec3(vUv2.x,uPosition,vUv2.y) : vec3(uPosition,vUv2.y,vUv2.x);
 vec3 color=texture(uVolume,p).rgb;
 color=mix(color,vec3(1.,.8,.35),uHighlight*.28);
 outColor=vec4(color,uOpacity);
}`;
const volumeFragment = `precision highp float; precision highp sampler3D;
uniform sampler3D uVolume; uniform vec3 uCameraLocal; uniform vec3 uHalfSize;
uniform float uOpacity; uniform float uShowFaces;
in vec3 vLocal; out vec4 outColor;
void main(){
 vec3 direction=normalize(vLocal-uCameraLocal);
 vec3 a=(-uHalfSize-uCameraLocal)/direction;
 vec3 b=(uHalfSize-uCameraLocal)/direction;
 vec3 near3=min(a,b), far3=max(a,b);
 float nearT=max(0.,max(near3.x,max(near3.y,near3.z)));
 float farT=min(far3.x,min(far3.y,far3.z));
 if(farT<=nearT) discard;
 vec3 color=vec3(0.); float alpha=0.; float segment=(farT-nearT)/64.;
 for(int i=0;i<64;i++){
  vec3 local=uCameraLocal+direction*(nearT+(float(i)+.5)*segment);
  vec3 p=clamp(local/(uHalfSize*2.)+.5,vec3(0.),vec3(1.));
  vec3 sampleColor=texture(uVolume,p).rgb;
  float amount=uOpacity*.04;
  if(i==0 && uShowFaces>.5) amount=max(amount,.76*uOpacity);
  color+=(1.-alpha)*sampleColor*amount; alpha+=(1.-alpha)*amount;
  if(alpha>.985) break;
 }
 outColor=vec4(color,alpha);
}`;

export class SpacetimeViewer {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x111218);
    host.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, .01, 100);
    this.target = new THREE.Vector3();
    this.radius = 5.5;
    this.theta = .7;
    this.phi = 1.12;
    this.mode = 'stack';
    this.axis = 'xy';
    this.position = .5;
    this.opacity = .65;
    this.spacing = 1;
    this.timeScale = 1;
    this.showFaces = true;
    this.highlight = true;
    this.playSlice = false;
    this.orbit = false;
    this.dirty = true;
    this.volume = null;
    this.textures = new TemporalTextureManager();
    this.objects = [];
    this.frame = 0;
    this.cameraGoal = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.bindControls();
    this.tick = this.tick.bind(this);
    this.frame = requestAnimationFrame(this.tick);
  }

  capabilities() {
    const gl = this.renderer.getContext();
    return { max3DSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE), maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
  }

  setVolume(volume) {
    this.clearVolume();
    const { width, height, depth, data } = volume;
    const max = this.capabilities().max3DSize;
    if (Math.max(width, height, depth) > max) throw new Error(`This GPU supports 3D textures only up to ${max} pixels per axis. Reduce preview resolution or frame count.`);
    this.volume = volume;
    this.texture = this.textures.createVolume(volume, max);
    this.rebuild();
  }

  clearObjects() {
    for (const object of this.objects) { this.scene.remove(object); object.geometry.dispose(); object.material.dispose(); }
    this.objects = [];
  }

  clearVolume() { this.clearObjects(); if (this.texture) this.textures.release(this.texture); this.texture = null; this.volume = null; this.dirty = true; }

  dimensions() {
    if (!this.volume) return { x: 2, y: 1, z: 2 };
    return { x: 2, y: 2 * this.volume.height / this.volume.width, z: 2 * this.timeScale * (this.mode === 'stack' ? this.spacing : 1) };
  }

  slice(axis, position, opacity, highlight = 0) {
    const d = this.dimensions();
    const geometry = new THREE.PlaneGeometry(axis === 'yz' ? d.z : d.x, axis === 'xz' ? d.z : d.y);
    const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: sliceFragment, uniforms: {
      uVolume: { value: this.texture }, uAxis: { value: axis === 'xy' ? 0 : axis === 'xz' ? 1 : 2 },
      uPosition: { value: position }, uOpacity: { value: opacity }, uHighlight: { value: highlight }
    }, glslVersion: THREE.GLSL3, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    if (axis === 'xy') mesh.position.z = (position - .5) * d.z;
    if (axis === 'xz') { mesh.rotation.x = Math.PI / 2; mesh.position.y = (position - .5) * d.y; }
    if (axis === 'yz') { mesh.rotation.y = -Math.PI / 2; mesh.position.x = (position - .5) * d.x; }
    this.scene.add(mesh); this.objects.push(mesh);
    return mesh;
  }

  rebuild() {
    this.clearObjects();
    this.sliceMesh = null;
    if (!this.volume || !this.texture) return;
    const d = this.dimensions();
    if (this.mode === 'stack') {
      for (let z = 0; z < this.volume.depth; z++) this.slice('xy', (z + .5) / this.volume.depth, this.opacity / Math.max(1, Math.sqrt(this.volume.depth) * .42));
    } else if (this.mode === 'solid') {
      const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: volumeFragment, uniforms: {
        uVolume: { value: this.texture }, uCameraLocal: { value: new THREE.Vector3() },
        uHalfSize: { value: new THREE.Vector3(d.x / 2, d.y / 2, d.z / 2) },
        uOpacity: { value: this.opacity }, uShowFaces: { value: this.showFaces ? 1 : 0 }
      }, glslVersion: THREE.GLSL3, side: THREE.BackSide, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(d.x, d.y, d.z), material);
      this.scene.add(mesh); this.objects.push(mesh);
    }
    if (this.mode === 'slices' || this.highlight) this.sliceMesh = this.slice(this.axis, this.position, this.mode === 'slices' ? this.opacity : .9, this.highlight ? 1 : 0);
    this.dirty = true;
  }

  setOptions(options) {
    const previousMode = this.mode;
    Object.assign(this, options);
    if (previousMode !== this.mode) this.resize();
    this.rebuild();
  }

  preset(name) {
    const positions = { front: [0, Math.PI / 2], side: [Math.PI / 2, Math.PI / 2], top: [0, .02], iso: [.7, 1.12] };
    this.cameraGoal = positions[name] || positions.iso;
    this.dirty = true;
  }

  reset() { this.target.set(0, 0, 0); this.radius = 5.5; this.preset('iso'); }

  bindControls() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => { this.drag = { x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey }; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', event => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX; this.drag.y = event.clientY;
      this.cameraGoal = null;
      if (this.drag.pan) {
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
        this.target.addScaledVector(right, -dx * this.radius / Math.max(1, this.host.clientHeight)).addScaledVector(up, dy * this.radius / Math.max(1, this.host.clientHeight));
      } else { this.theta -= dx * .008; this.phi = THREE.MathUtils.clamp(this.phi - dy * .008, .02, Math.PI - .02); }
      this.dirty = true;
    });
    for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { this.drag = null; });
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.radius = THREE.MathUtils.clamp(this.radius * Math.exp(event.deltaY * .001), 2, 30); this.dirty = true; }, { passive: false });
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    const limit = this.mode === 'solid' ? 480 : 960;
    const scale = Math.min(1, limit / Math.max(width, height));
    this.renderer.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  tick() {
    this.frame = requestAnimationFrame(this.tick);
    if (this.cameraGoal) {
      this.theta += (this.cameraGoal[0] - this.theta) * .12;
      this.phi += (this.cameraGoal[1] - this.phi) * .12;
      if (Math.abs(this.cameraGoal[0] - this.theta) + Math.abs(this.cameraGoal[1] - this.phi) < .002) this.cameraGoal = null;
      this.dirty = true;
    }
    if (this.orbit) { this.theta += .003; this.dirty = true; }
    if (this.playSlice && this.volume) {
      this.position = (this.position + .002) % 1;
      this.onSlicePosition?.(this.position);
      if (this.sliceMesh) {
        const d = this.dimensions();
        this.sliceMesh.material.uniforms.uPosition.value = this.position;
        if (this.axis === 'xy') this.sliceMesh.position.z = (this.position - .5) * d.z;
        if (this.axis === 'xz') this.sliceMesh.position.y = (this.position - .5) * d.y;
        if (this.axis === 'yz') this.sliceMesh.position.x = (this.position - .5) * d.x;
      }
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.camera.position.set(this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta));
    this.camera.lookAt(this.target);
    for (const object of this.objects) if (object.material.uniforms.uCameraLocal) object.material.uniforms.uCameraLocal.value.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  screenshot() { this.dirty = true; this.tickRender(); return new Promise(resolve => this.renderer.domElement.toBlob(resolve, 'image/png')); }
  tickRender() { this.renderer.render(this.scene, this.camera); }
  dispose() { cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); this.clearVolume(); this.textures.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); }
}
