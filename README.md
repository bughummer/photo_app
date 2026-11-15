# Photo Flow Studio

An early desktop prototype for moving the colors of an existing image. It deliberately does not turn photos into paintings.

## Run

Install Node.js 20 or newer, then run `npm install` and `npm start` to open the Electron desktop app. For a browser preview, run `npm run web` and visit `http://127.0.0.1:4173`. Use **Video Studio** in the header or open `http://127.0.0.1:4173/video.html` for Stage 1 video editing.

Open a JPG, PNG, or WebP image. Drag across it with a mouse or finger using Fluid smear, Swirl, Bulge, Disperse, Paint pull, Water lens, Smoke, Particle bloom, Fragment field, Wind trails, Painterly dissolve, Digital glitch, Mirror distortion, or Point cloud. Each brush has a small illustrated preview beside its name. Paint pull draws broad directional patches with broken edges from the image's existing colors. Water lens bends the image into ripples and adds subtle color separation. Smoke drags source colors into soft wisps. Particle bloom lifts dense, glowing fibers while gently dimming the brushed image beneath them. Fragment field lifts small image shards into gold dust and has an optional perspective grid. Wind trails stretches colors and draws fine image-colored strands along the drag direction, with soft blur and slight color separation; turn on Warm glow before painting to add light around bright edges and strands. Painterly dissolve pulls image colors into layered, rough edged marks while breaking up the area beneath. Digital glitch shifts blocks of pixels, breaks scanlines, and separates color channels within the brush area. Mirror distortion folds nearby image details into uneven vertical reflections, like warped glass panels. Point cloud dims the brushed area and lifts image-colored dots at varied sizes and speeds to suggest depth. For the layered effects, a source image with a dark background and a clear subject works best. Adjust brush size and strength. Keep moving lets strokes, fibers, fragments, paint marks, and cloud points continue briefly after release; switch it off to stop at release. Undo, Reset image, and Export PNG are available.

## Brush shapes

Choose **Generate brush** to make a random shape. Complexity changes how many lobes its outline has, Roughness changes how far they protrude, Texture adds translucent gaps, and Soft edge smooths the boundary. Edit the Seed to reproduce a variation, or choose **New variation** for a new seed. Adjusting a control updates an active generated brush. **Import PNG brush** still turns a PNG into a shape: transparent PNGs use alpha by default, and opaque PNGs use dark pixels by default. Change **Use image** to select transparency, dark areas, or light areas. Either shape works with every movement effect. **Save brush PNG** exports the active shape; **Use round** restores the built-in brush. Brush shapes stay local to the running app, so save one as a PNG to reuse it later. Photoshop `.abr` files are not supported.

Images are processed locally. Fragment field, Particle bloom, and Point cloud are layered 2D effects inspired by the reference images; they do not reconstruct 3D geometry. The working image is capped at 1800 pixels on its longest side for interactive performance, so exported PNGs use that working resolution. Image Studio exports still PNGs; Video Studio exports Stage 1 MP4 clips.

## Video Studio Stage 1

Open a local MP4 or WebM in a recent Chrome, Edge, or Electron release with WebCodecs and OffscreenCanvas. Play or scrub the timeline, choose a frame-compatible effect, and click or drag on the preview to place it. **Save frame PNG** extracts the currently selected frame with the effect applied. **Export MP4** renders the effect over the full clip locally. Original AAC audio is copied into MP4 when present; other audio codecs produce a clear silent-export notice. Stage 1 limits input files to 500 MB, export duration to 60 seconds, working resolution to 1280 pixels, and output to 200 MB. Export runs in a worker and uses a bounded frame cache.

See [Video Studio design](docs/video-studio.md) for the audit, effect compatibility, module boundaries, and later-stage plans. Run `npm test` for timeline, cache, browser decoding, seeking, effects, exports, and Image Studio regression checks. On a fresh machine, run `npx playwright install chromium` first, or set `CHROMIUM_PATH` to an installed Chromium executable.

## Spacetime Cube

In Video Studio, open a video and choose **Spacetime Cube** from the Effect menu. Set the start and end times, frame count, and preview width, then choose **Generate volume**. Drag the view to rotate, Shift drag or right drag to pan, and scroll to zoom. Switch between Stacked frames, Solid volume, and Cross-sections. Choose XY, XZ, or YZ to inspect a frame or a position through time, and move or animate the cutting plane. The camera presets, opacity, spacing, time-axis length, surface visibility, orbit animation, and PNG screenshot control are in the same panel. Sampling and rendering stay local to the device. The cube exports a screenshot; MP4 export applies to the regular video effects.

## Slit Scan

Open a video in Video Studio and choose **Slit Scan**. Select a time interval, frame count, and preview width, then choose **Generate scan**. A vertical scan line makes time run left to right; a horizontal line makes time run top to bottom. Set Line start and Line end to the same position for a fixed slit, or separate them to sweep the line across the image as time passes. Scan width averages nearby pixels. Adjusting direction, position, or width updates the sampled result without decoding the video again. **Save Slit Scan PNG** exports the still image locally.

## Temporal Echoes

Choose **Temporal Echoes** in Video Studio to make moving parts of a clip leave fading copies of their earlier positions. Adjust the number of echoes, time between them, trail strength, and motion threshold. Play or scrub the video to preview the effect. **Save frame PNG** saves the current echoed frame, and **Export MP4** renders the echoed clip while copying compatible original AAC audio. Processing stays local. Echo MP4 export is capped at a 720-pixel working size to keep its frame history bounded.
