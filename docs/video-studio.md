# Video Studio design

## Existing application audit

The existing Image Studio is plain HTML, CSS, and JavaScript with no frontend framework or bundler. `server.cjs` serves local files; `electron.cjs` opens the app in an Electron window. The only original dependency was Electron. Image Studio owns a WebGL2 ping-pong texture pipeline in `app.js`: pointer strokes update the active texture through one GLSL fragment program. `particles.js` adds Canvas 2D layers for fibers, dust, image shards, paint marks, and colored points. Brush masks are 256 × 256 alpha textures. Undo stores up to eight texture snapshots, and PNG export composites WebGL2 with the Canvas 2D layer. There was no test suite before this extension.

The existing shader is now in `effects.js`, shared by both studios. Image Studio still owns its interactive texture and Canvas 2D layers. Video Studio renders a fresh source frame with a stable effect specification, without altering Image Studio state.

## Spacetime Cube extension

`video/temporal-mapping.mjs` defines a deterministic, ordered timestamp schedule and voxel coordinates. X increases rightward, Y increases downward in image coordinates, and Z increases with time. CPU frames are packed with flipped Y rows for WebGL's bottom-up texture coordinates. The same packed data drives stacked frame planes, orthogonal XY/XZ/YZ cuts, and a 3D texture ray marcher. Synthetic coordinate tests and direct decoded-frame comparisons verify this mapping before the ray marcher is used.

`video/video-worker.mjs` now samples an interval with Mediabunny's `VideoSampleSink.samplesAtTimestamps`, downscales in an `OffscreenCanvas`, and transfers one packed volume back to the UI. Samples are closed after drawing. `video/temporal-engine.mjs` owns cancellation, one bounded sampled volume, a parameter store, and `TemporalTextureManager` for Three.js `Data3DTexture` creation and disposal. This is the shared foundation for Slit Scan, Temporal Echoes, Fractured Time, and Time Bubble: each can request ordered frames or an interval without building another decoder. A future native adapter can implement the same requests behind the worker client.

`video/spacetime-viewer.mjs` owns a Three.js scene within the existing Video Studio preview. Stack mode draws separated textured frame planes. Cross-section mode draws a single movable plane; XY is a frame at time, XZ maps horizontal position against time at fixed Y, and YZ maps vertical position against time at fixed X. Solid mode ray marches through the sampled 3D texture, with an optional first surface contribution. The highlighted cutting plane uses the same texture. Mouse drag rotates, Shift or right drag pans, and wheel zooms; front, side, top, and isometric presets interpolate camera angles. Slice motion changes the existing plane's uniform and position without recreating the stack on every animation frame.

The preview defaults to 320 pixels wide, 180 pixels high for 16:9 video, and 120 temporal samples. A 96 MiB volume budget and the GPU's `MAX_3D_TEXTURE_SIZE` limit are checked before upload. Users can reduce width or temporal frame count for slower devices. The solid render buffer is capped at 480 pixels on its longest side and the other modes at 960 pixels; the screenshot uses this preview resolution. The browser worker handles decoding and cancellation, keeping the main thread free for interaction. A new import or closing the page disposes the decoded cache, sampled volume, 3D texture, meshes, renderer, and WebGL context. Cube export is a PNG screenshot; existing frame PNG and MP4 export remain available for regular video effects.

Tests include timestamp ordering, X/Y/Z mapping, cancellation and restart, GPU texture disposal, all rendering modes, a direct comparison between an XY slice and a decoded frame, and a small local fixture with a stationary background and two moving pedestrian silhouettes. The fixture verifies stable background structures and distinct XZ trajectories. `tests/spacetime-browser.test.mjs` also samples the default 320 × 180 × 120 preview while measuring main-thread timer activity.

## Slit Scan extension

`video/slit-scan.mjs` composes from the same packed temporal volume as Spacetime Cube. A vertical slit maps output X to increasing time and preserves source Y. A horizontal slit maps output Y to increasing time and preserves source X. The user can set fixed or independently moving start and end scan-line positions; scan width averages nearby source pixels. The temporal output axis is at least as long as the sampled depth, so no sample is skipped solely because the source image is narrow. Composition yields every 16 output columns or rows and can be canceled. Changes to scan direction, position, or width recompute from the sampled volume without another decode. `video/video-studio.mjs` adds these controls inside the existing effect selector and exports the result as a PNG. The same worker memory limit and interval validation apply; the PNG remains local.

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
