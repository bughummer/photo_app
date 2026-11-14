export class BrowserMp4ExportAdapter {
  constructor(worker) { this.worker = worker; }
  export(effect, onProgress) { return this.worker.request('export', { effect }, onProgress); }
}
