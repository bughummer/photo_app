export function samplingSchedule(start, end, count, duration) {
  if (![start, end, count, duration].every(Number.isFinite) || start < 0 || end <= start || end > duration || count < 2 || !Number.isInteger(count)) throw new Error('Choose a valid video interval and at least two temporal frames.');
  return Array.from({ length: count }, (_, index) => Math.min(duration - 0.000001, start + (end - start) * index / (count - 1)));
}

export function voxelOffset(x, y, z, width, height, depth) {
  if (![x, y, z, width, height, depth].every(Number.isInteger) || x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) throw new RangeError('Voxel coordinate is outside the video volume.');
  return ((z * height + (height - 1 - y)) * width + x) * 4;
}

export function setFrame(volume, frame, z, width, height, depth) {
  if (frame.length !== width * height * 4) throw new Error('Decoded frame dimensions do not match the volume.');
  for (let y = 0; y < height; y++) {
    const source = y * width * 4;
    volume.set(frame.subarray(source, source + width * 4), voxelOffset(0, y, z, width, height, depth));
  }
}

export function crossSection(volume, width, height, depth, axis, position) {
  const index = Math.min((axis === 'xy' ? depth : axis === 'xz' ? height : width) - 1, Math.max(0, Math.round(position)));
  const outWidth = axis === 'yz' ? depth : width;
  const outHeight = axis === 'xy' ? height : axis === 'xz' ? depth : height;
  if (!['xy', 'xz', 'yz'].includes(axis)) throw new Error('Unknown slice axis.');
  const pixels = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let row = 0; row < outHeight; row++) for (let col = 0; col < outWidth; col++) {
    const x = axis === 'yz' ? index : col;
    const y = axis === 'xz' ? index : row;
    const z = axis === 'xy' ? index : axis === 'xz' ? row : col;
    pixels.set(volume.subarray(voxelOffset(x, y, z, width, height, depth), voxelOffset(x, y, z, width, height, depth) + 4), (row * outWidth + col) * 4);
  }
  return { width: outWidth, height: outHeight, pixels };
}
