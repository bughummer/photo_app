# Photo Flow Studio

An early desktop prototype for moving the colors of an existing image. It deliberately does not turn photos into paintings.

## Run

Install Node.js 20 or newer, then run `npm install` and `npm start` to open the Electron desktop app. For a browser preview, run `npm run web` and visit `http://127.0.0.1:4173`.

Open a JPG, PNG, or WebP image. Drag across it with a mouse or finger using Fluid smear, Swirl, Bulge, Disperse, Paint pull, Water lens, or Smoke. Paint pull draws broad directional patches with broken edges from the image's existing colors; it works best with an image that already has a painted look. Water lens bends the image into ripples and adds subtle color separation. Smoke drags source colors into soft, broken wisps; starting near a subject's edge makes the trail easier to see. Adjust brush size and strength. Keep moving lets the stroke continue briefly with momentum after release; switch it off to stop at release. Undo, Reset image, and Export PNG are available.

## Custom PNG brushes

Choose **Create or import PNG brush** to turn a PNG into a brush shape. Transparent PNGs use their alpha by default; opaque PNGs use dark pixels by default. Change **Use image** to select transparency, dark areas, or light areas. The shape applies to whichever movement effect is selected. **Save brush PNG** exports the converted transparent shape for later reuse, and **Use round** restores the built-in brush. The imported PNG stays local to the running app; import it again after restarting. Photoshop `.abr` files are not supported.

Images are processed locally. The working image is capped at 1800 pixels on its longest side for interactive performance, so exported PNGs use that working resolution. Animation export is not part of this prototype.
