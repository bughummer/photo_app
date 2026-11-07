# Photo Flow Studio

An early desktop prototype for moving the colors of an existing image. It deliberately does not turn photos into paintings.

## Run

Install Node.js 20 or newer, then run `npm install` and `npm start` to open the Electron desktop app. For a browser preview, run `npm run web` and visit `http://127.0.0.1:4173`.

Open a JPG, PNG, or WebP image. Drag across it with a mouse or finger using Fluid smear, Swirl, Bulge, Disperse, Paint pull, Water lens, Smoke, Particle bloom, Fragment field, Wind trails, or Painterly dissolve. Paint pull draws broad directional patches with broken edges from the image's existing colors. Water lens bends the image into ripples and adds subtle color separation. Smoke drags source colors into soft wisps. Particle bloom lifts dense, glowing fibers while gently dimming the brushed image beneath them. Fragment field lifts small image shards into gold dust and has an optional perspective grid. Wind trails stretches colors and draws fine image-colored strands along the drag direction, with soft blur and slight color separation; turn on Warm glow before painting to add light around bright edges and strands. Painterly dissolve pulls image colors into layered, rough edged marks while breaking up the area beneath; it works especially well on an existing painting or textured image. For the layered effects, a source image with a dark background and a clear subject works best. Adjust brush size and strength. Keep moving lets strokes, fibers, fragments, and paint marks continue briefly after release; switch it off to stop at release. Undo, Reset image, and Export PNG are available.

## Custom PNG brushes

Choose **Create or import PNG brush** to turn a PNG into a brush shape. Transparent PNGs use their alpha by default; opaque PNGs use dark pixels by default. Change **Use image** to select transparency, dark areas, or light areas. The shape applies to whichever movement effect is selected. **Save brush PNG** exports the converted transparent shape for later reuse, and **Use round** restores the built-in brush. The imported PNG stays local to the running app; import it again after restarting. Photoshop `.abr` files are not supported.

Images are processed locally. Fragment field and Particle bloom are layered 2D effects inspired by the reference images; they do not reconstruct 3D geometry. The working image is capped at 1800 pixels on its longest side for interactive performance, so exported PNGs use that working resolution. Animation export is not part of this prototype.
