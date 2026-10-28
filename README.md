# Photo Flow Studio

An early desktop prototype for moving the colors of an existing image. It deliberately does not turn photos into paintings.

## Run

Install Node.js 20 or newer, then run `npm install` and `npm start` to open the Electron desktop app. For a browser preview, run `npm run web` and visit `http://127.0.0.1:4173`.

Open a JPG, PNG, or WebP image. Drag across it with a mouse or finger using Fluid smear, Swirl, Bulge, or Disperse. Adjust brush size and strength. Keep moving lets the stroke continue briefly with momentum after release; switch it off to stop at release. Undo, Reset image, and Export PNG are available.

Images are processed locally. The working image is capped at 1800 pixels on its longest side for interactive performance, so exported PNGs use that working resolution. Animation export is not part of this prototype.
