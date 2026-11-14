# Video Studio design

## Existing application audit

The existing Image Studio is plain HTML, CSS, and JavaScript with no frontend framework or bundler. `server.cjs` serves local files; `electron.cjs` opens the app in an Electron window. The only original dependency was Electron. Image Studio owns a WebGL2 ping-pong texture pipeline in `app.js`: pointer strokes update the active texture through one GLSL fragment program. `particles.js` adds Canvas 2D layers for fibers, dust, image shards, paint marks, and colored points. Brush masks are 256 × 256 alpha textures. Undo stores up to eight texture snapshots, and PNG export composites WebGL2 with the Canvas 2D layer. There was no test suite before this extension.

The existing shader is now in `effects.js`, shared by both studios. Image Studio still owns its interactive texture and Canvas 2D layers. Video Studio renders a fresh source frame with a stable effect specification, without altering Image Studio state.

| Effects | Stage 1 video use | Reason |
| --- | --- | --- |
| Fluid smear, Swirl, Bulge, Disperse, Paint pull, Water lens, Smoke, Digital glitch, Mirror distortion | Yes | The shader can transform one decoded frame at a time. Fluid smear uses a drag direction. |
| Wind trails | Later | The shader's soft trails work per frame, but the distinctive strands are Canvas 2D. |
| Particle bloom, Fragment field, Painterly dissolve, Point cloud | Later | The final appearance depends on stateful Canvas 2D overlays sampled from the source image. Faithful frame rendering needs GPU instancing/shaders or another bounded frame processor. |

## Module boundaries

- `video/media-adapters.mjs`: `ImageMediaAdapter` and `VideoMediaAdapter` expose local media frames and lifecycle. The video adapter uses native HTML video for playback and audio, and the worker for precise frame extraction. A native FFmpeg/Python service can later implement the same frame and export operations behind this boundary.
- `video/effect-interface.mjs`: frame-compatible effect descriptors and normalized, serializable parameters. The renderer and worker consume the same specification.
- `video/timeline.mjs`: time clamping, labels, and a deterministic export frame schedule. The UI controls native video playback and seeks; decoded frame requests are throttled and stale replies are ignored.
- `video/frame-cache.mjs`: at most five extracted `ImageBitmap` frames or 40 MiB, with `close()` on eviction. Browser video maintains its own playback cache.
- `video/webgl2-renderer.mjs`: `render(source, effect)` and `dispose()` around the shared GLSL shader. A future Three.js renderer can implement the same interface for 3D meshes or instanced particles. Stage 1 keeps WebGL2 to reuse the already shipped effects and avoid a second rendering dependency.
- `video/video-worker.mjs`: Mediabunny demuxes local media and uses browser WebCodecs to decode frames. MP4 export runs here with a single reusable WebGL2 OffscreenCanvas and backpressured H.264 encoding. `VideoSample` objects are closed after use, and input and GPU resources are disposed.
- `video/worker-client.mjs` and `video/export-adapters.mjs`: request/response and progress handling, plus the browser MP4 export adapter. `VideoMediaAdapter.export` delegates through this boundary; future adapters could use Tauri commands or a local native FFmpeg/Python engine without changing the UI.

Electron uses a loopback server so browser module workers load under an HTTP origin. The app reads local files through `File`/`Blob` and never uploads media. Tauri can serve the same browser modules from its app origin. Mediabunny is pinned to 1.66.0, loaded from its local ESM bundle; there is no runtime CDN. Playwright is a development-only test dependency.

## Stage 1 limits

MP4 export uses a `BufferTarget`, so the app limits source size to 500 MB, export duration to 60 seconds, output working size to 1280 pixels, and final MP4 to 200 MB. Output frames are encoded sequentially at 24 fps with a 4 Mbps target bitrate. This is a first local export path; a streaming target is the next step for long clips. AAC packets are copied without re-encoding when the output container accepts them. Unsupported source audio is reported before silent output. Native playback provides the source audio while editing.

The effect setting is fixed across an exported clip. Brush gestures position an effect and set its direction; Stage 1 does not record animated keyframes or accumulate paint strokes across video frames. New GPU shaders or instanced drawing will be needed for layered particle effects, and a streaming export/native engine will be needed for long or high-resolution projects.
