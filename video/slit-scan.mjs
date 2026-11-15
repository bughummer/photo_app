// A vertical line makes an image whose X axis is time. A horizontal line makes
// an image whose Y axis is time. Source rows in a temporal volume are stored
// bottom-up for WebGL, so output rows are reversed when reading them.
export function slitScanOptions(volume, options = {}) {
  if (!volume || !Number.isInteger(volume.width) || !Number.isInteger(volume.height) || !Number.isInteger(volume.depth) || volume.depth < 2 || volume.data.length !== volume.width * volume.height * volume.depth * 4) throw new Error('Sample video frames before making a slit scan.');
  const direction = options.direction;
  if (direction !== 'vertical' && direction !== 'horizontal') throw new Error('Choose a vertical or horizontal scan line.');
  const start = Number(options.start), end = Number(options.end), band = Number(options.band);
  if (![start, end, band].every(Number.isFinite) || start < 0 || start > 1 || end < 0 || end > 1 || band < 1 || band > 64) throw new Error('Scan position or width is outside the allowed range.');
  return { direction, start, end, band: Math.round(band), width: volume.width, height: volume.height };
}

function paintAxis(volume, output, options, axisIndex) {
  const { width, height, depth, data } = volume;
  const { direction, start, end, band } = options;
  const vertical = direction === 'vertical';
  const length = vertical ? Math.max(width, depth) : Math.max(height, depth);
  const outWidth = vertical ? length : width;
  const fraction = length === 1 ? 0 : axisIndex / (length - 1);
  const z = Math.min(depth - 1, Math.round(fraction * (depth - 1)));
  const sourceLength = vertical ? width : height;
  const center = Math.round((start + (end - start) * fraction) * (sourceLength - 1));
  const first = Math.max(0, center - Math.floor((band - 1) / 2));
  const last = Math.min(sourceLength - 1, first + band - 1);
  for (let cross = 0; cross < (vertical ? height : width); cross++) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let scan = first; scan <= last; scan++) {
      const x = vertical ? scan : cross;
      const y = vertical ? cross : scan;
      const offset = ((z * height + (height - 1 - y)) * width + x) * 4;
      r += data[offset]; g += data[offset + 1]; b += data[offset + 2]; count++;
    }
    const target = (vertical ? cross * outWidth + axisIndex : axisIndex * outWidth + cross) * 4;
    output[target] = Math.round(r / count);
    output[target + 1] = Math.round(g / count);
    output[target + 2] = Math.round(b / count);
    output[target + 3] = 255;
  }
}

export function composeSlitScan(volume, rawOptions) {
  const options = slitScanOptions(volume, rawOptions);
  const vertical = options.direction === 'vertical';
  const width = vertical ? Math.max(volume.width, volume.depth) : volume.width;
  const height = vertical ? volume.height : Math.max(volume.height, volume.depth);
  const output = new Uint8ClampedArray(width * height * 4);
  const length = vertical ? width : height;
  for (let axis = 0; axis < length; axis++) paintAxis(volume, output, options, axis);
  return { width, height, pixels: output };
}

export async function composeSlitScanAsync(volume, rawOptions, signal, onProgress = () => {}) {
  const options = slitScanOptions(volume, rawOptions);
  const vertical = options.direction === 'vertical';
  const width = vertical ? Math.max(volume.width, volume.depth) : volume.width;
  const height = vertical ? volume.height : Math.max(volume.height, volume.depth);
  const output = new Uint8ClampedArray(width * height * 4);
  const length = vertical ? width : height;
  for (let axis = 0; axis < length; axis++) {
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    paintAxis(volume, output, options, axis);
    if (axis % 16 === 15 || axis === length - 1) {
      onProgress((axis + 1) / length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
  return { width, height, pixels: output };
}
