import { geometryKey } from './parameters.mjs';

export class FractureGeometryClient {
  constructor() {
    this.worker = new Worker(new URL('./geometry-worker.mjs', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.cache = new Map();
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else {
        this.cache.set(pending.key,data.result);
        while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
        pending.resolve(data.result);
      }
    };
    this.worker.onerror = event => {
      for (const pending of this.pending.values()) pending.reject(new Error(event.message || 'Fracture generator failed.'));
      this.pending.clear();
    };
  }
  get(params) {
    const key = geometryKey(params);
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    const id = this.nextId++;
    return new Promise((resolve,reject) => {
      this.pending.set(id,{ resolve,reject,key });
      this.worker.postMessage({ id, options: { seed: params.seed,density: params.crackDensity,fragmentSize: params.fragmentSize,resolution: 256 } });
    });
  }
  dispose() {
    for (const pending of this.pending.values()) pending.reject(new Error('Fracture generator closed.'));
    this.pending.clear(); this.cache.clear(); this.worker.terminate();
  }
}
