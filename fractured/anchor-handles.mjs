const names = ['Left eye','Right eye','Nose','Mouth','Jaw'];

export class AnchorHandles {
  constructor(host, canvas, onMove) {
    this.host = host; this.canvas = canvas; this.onMove = onMove;
    this.container = document.createElement('div');
    this.container.className = 'fracture-anchor-layer';
    this.handles = names.map((name, index) => {
      const handle = document.createElement('button');
      handle.type = 'button'; handle.className = 'fracture-anchor';
      handle.title = name; handle.setAttribute('aria-label',`${name} distortion anchor`);
      handle.textContent = String(index + 1);
      handle.addEventListener('pointerdown', event => { event.preventDefault(); handle.setPointerCapture(event.pointerId); });
      handle.addEventListener('pointermove', event => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        const bounds = this.container.getBoundingClientRect();
        const x = Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));
        const y = Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height));
        this.onMove(index,{ x,y });
      });
      this.container.append(handle);
      return handle;
    });
    host.append(this.container);
    this.observer = new ResizeObserver(() => this.place());
    this.observer.observe(host);
    this.observer.observe(canvas);
    this.anchors = [];
    this.visible = false;
    this.place();
  }
  update(anchors, visible) {
    this.anchors = anchors;
    this.visible = visible;
    this.container.hidden = !visible;
    this.place();
  }
  place() {
    if (!this.visible) return;
    const image = this.canvas.getBoundingClientRect(), host = this.host.getBoundingClientRect();
    this.container.style.left = `${image.left-host.left}px`;
    this.container.style.top = `${image.top-host.top}px`;
    this.container.style.width = `${image.width}px`;
    this.container.style.height = `${image.height}px`;
    this.handles.forEach((handle,index) => {
      const anchor = this.anchors[index];
      if (!anchor) return;
      handle.style.left = `${anchor.x*100}%`;
      handle.style.top = `${anchor.y*100}%`;
    });
  }
  dispose() { this.observer.disconnect(); this.container.remove(); }
}
