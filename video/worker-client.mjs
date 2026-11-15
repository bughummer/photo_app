export class VideoWorkerClient {
  constructor() {
    this.worker = new Worker(new URL('./video-worker.mjs', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id);
      if (!pending) { data.value?.bitmap?.close(); return; }
      if (data.type === 'progress') { pending.onProgress?.(data.value); return; }
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.value);
    };
    this.worker.onerror = event => {
      for (const pending of this.pending.values()) pending.reject(new Error(event.message || 'Video worker failed to load.'));
      this.pending.clear();
    };
  }

  request(type, payload = {}, onProgress, signal) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Canceled', 'AbortError')); return; }
      const abort = () => {
        this.pending.delete(id);
        this.worker.postMessage({ type: 'cancelRange', targetId: id });
        reject(new DOMException('Canceled', 'AbortError'));
      };
      this.pending.set(id, { resolve: value => { signal?.removeEventListener('abort', abort); resolve(value); }, reject: error => { signal?.removeEventListener('abort', abort); reject(error); }, onProgress });
      signal?.addEventListener('abort', abort, { once: true });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  close() {
    for (const pending of this.pending.values()) pending.reject(new Error('Video session closed.'));
    this.pending.clear();
    this.worker.terminate();
  }
}
