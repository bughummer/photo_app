import { generateFractureGeometry } from './geometry.mjs';

self.onmessage = ({ data }) => {
  try {
    const result = generateFractureGeometry(data.options);
    self.postMessage({ id: data.id, result }, [result.map.buffer, result.metaA.buffer, result.metaB.buffer]);
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
