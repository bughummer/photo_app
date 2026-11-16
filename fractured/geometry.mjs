export function seededRandom(seed) {
  let state = (Math.trunc(seed) >>> 0) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const hash = (x, y, seed) => {
  let n = Math.imul(x + seed * 17, 374761393) + Math.imul(y - seed * 11, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};

export function generateFractureGeometry({ seed = 1, density = .5, fragmentSize = .5, resolution = 256 } = {}) {
  if (!Number.isInteger(resolution) || resolution < 32 || resolution > 512) throw new Error('Fracture resolution must be 32–512 pixels.');
  const rng = seededRandom(seed);
  const sectorCount = Math.max(3, Math.min(7, Math.round(3 + density * 4)));
  const siteCount = Math.max(sectorCount * 2, Math.min(64, Math.round((18 + density * 30) * (1.25 - fragmentSize * .55))));
  const impact = { x: .47 + (rng() - .5) * .1, y: .45 + (rng() - .5) * .1 };
  const shift = rng() * Math.PI * 2;
  const boundaries = Array.from({ length: sectorCount }, (_, i) => shift + i * Math.PI * 2 / sectorCount + (rng() - .5) * .16);
  const sites = [];
  for (let sector = 0; sector < sectorCount; sector++) {
    const count = Math.floor(siteCount / sectorCount) + (sector < siteCount % sectorCount ? 1 : 0);
    const start = boundaries[sector], end = sector === sectorCount - 1 ? boundaries[0] + Math.PI * 2 : boundaries[sector + 1];
    for (let i = 0; i < count; i++) {
      const a = start + (end - start) * (.12 + .76 * (i + rng() * .7) / Math.max(1, count));
      const radius = .09 + Math.sqrt(rng()) * .66;
      sites.push({ x: Math.min(1, Math.max(0, impact.x + Math.cos(a) * radius)),
        y: Math.min(1, Math.max(0, impact.y + Math.sin(a) * radius)), sector });
    }
  }
  const metaA = new Uint8Array(64 * 4), metaB = new Uint8Array(64 * 4);
  for (let i = 0; i < sites.length; i++) {
    metaA.set([Math.round(rng() * 255), Math.round(rng() * 255), Math.round(rng() * 255), Math.round(rng() * 255)], i * 4);
    metaB.set([Math.round((.6 + rng() * .4) * 255), Math.round(rng() * 255), Math.round(rng() * 255), Math.round(rng() * 255)], i * 4);
  }
  const map = new Uint8Array(resolution * resolution * 4);
  for (let py = 0; py < resolution; py++) for (let px = 0; px < resolution; px++) {
    const x = (px + .5) / resolution, y = (py + .5) / resolution;
    const dx = x - impact.x, dy = y - impact.y;
    const radius = Math.hypot(dx, dy);
    const warp = Math.sin(radius * 23 + shift) * .032 + (hash(px >> 5, py >> 5, seed) - .5) * .025;
    const angle = Math.atan2(dy, dx) + warp;
    let sector = 0, nearestBoundary = Infinity;
    for (let s = 0; s < sectorCount; s++) {
      const a = boundaries[s], b = s === sectorCount - 1 ? boundaries[0] + Math.PI * 2 : boundaries[s + 1];
      const span = b - a;
      const relative = ((angle - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (relative < span) sector = s;
      nearestBoundary = Math.min(nearestBoundary, angleDistance(angle, a) * radius);
    }
    const textureWarpX = (hash(px >> 3, py >> 3, seed + 5) - .5) * .009;
    const textureWarpY = (hash(px >> 3, py >> 3, seed + 9) - .5) * .009;
    let closest = Infinity, second = Infinity, id = 0;
    for (let i = 0; i < sites.length; i++) {
      if (sites[i].sector !== sector) continue;
      const sx = x + textureWarpX - sites[i].x, sy = y + textureWarpY - sites[i].y;
      const distance = sx * sx + sy * sy;
      if (distance < closest) { second = closest; closest = distance; id = i; }
      else if (distance < second) second = distance;
    }
    const localBoundary = Number.isFinite(second) ? (second - closest) / (2 * Math.max(.04, Math.sqrt(second))) : 1;
    const edgeDistance = Math.min(nearestBoundary, localBoundary);
    const edge = Math.exp(-edgeDistance * resolution / 2.1);
    const reflection = hash(px >> 2, py >> 2, seed + 23);
    const offset = (py * resolution + px) * 4;
    map[offset] = id;
    map[offset + 1] = Math.round(edge * 255);
    map[offset + 2] = Math.round(reflection * 255);
    map[offset + 3] = 255;
  }
  return { resolution, siteCount: sites.length, sectorCount, impact, sites, map, metaA, metaB };
}
