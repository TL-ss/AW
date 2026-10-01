/**
 * Inspects the exact vertex data the mesher produces for a generated chunk:
 * per-vertex position, tile id and baked light. This is the fastest way to tell
 * a shading bug from a texture or geometry bug.
 *
 * Usage: node tools/mesh-inspect.mjs [seed] [cx] [cz] [section]
 */
import { Generator, meshSection } from '../src/world/chunk-worker.js';
import {
  CHUNK_SIZE, WORLD_HEIGHT, SECTION_COUNT, SEA_LEVEL,
} from '../src/world/constants.js';
import manifest from '../src/world/tile-manifest.js';

const SEED = Number(process.argv[2] || 12345) >>> 0;
const CX = Number(process.argv[3] || 0);
const CZ = Number(process.argv[4] || 0);
const SECTION = process.argv[5] !== undefined ? Number(process.argv[5]) : null;

const generator = new Generator(SEED);
const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
generator.generate(CX, CZ, blocks, heights, biomes);

const surface = heights[0];
console.log(`seed=${SEED} chunk=(${CX},${CZ}) surfaceHeight[0,0]=${surface} seaLevel=${SEA_LEVEL}`);

// Dump the top of the first column so the block ids are visible.
const column = [];
for (let y = Math.max(0, surface - 4); y <= Math.min(WORLD_HEIGHT - 1, surface + 3); y++) {
  column.push(`y${y}=${blocks[(y * CHUNK_SIZE + 0) * CHUNK_SIZE + 0]}`);
}
console.log(`column: ${column.join(' ')}`);

const sections = SECTION === null ? [...Array(SECTION_COUNT).keys()] : [SECTION];

// A per-section light histogram makes an under-lit bake obvious at a glance.
console.log('');
console.log('section  verts  luma histogram (16 buckets across the light byte)  mean');
for (const section of sections) {
  const result = meshSection(CX, CZ, section, blocks, []);
  const bytes = result.opaque.lights;
  if (!bytes.length) { console.log(`${String(section).padStart(7)}  empty`); continue; }
  const hist = new Array(16).fill(0);
  let sum = 0;
  for (const value of bytes) { hist[Math.min(15, value >> 4)]++; sum += value; }
  const spark = ' .:-=+*#%@';
  const bar = hist.map((h) => spark[Math.min(9, Math.floor((h / bytes.length) * 10))]).join('');
  const pctHigh = ((hist.slice(12).reduce((a, b) => a + b, 0) / bytes.length) * 100).toFixed(0);
  console.log(`${String(section).padStart(7)}  ${String(bytes.length).padStart(5)}  [${bar}]  mean=${(sum / bytes.length).toFixed(0)} (${pctHigh}% bright)`);
}
console.log('');

for (const section of sections) {
  const result = meshSection(CX, CZ, section, blocks, []);
  const parts = [['opaque', result.opaque], ['cutout', result.cutout]];
  for (const [name, part] of parts) {
    if (!part.vertexCount) continue;
    // Position sanity: positions are in 1/16-block units, so a face that spans a
  // whole block still has fractional block coordinates once divided by 16.
  {
    let subBlock = 0;
    let minX = Infinity, maxX = -Infinity;
    for (let v = 0; v < part.vertexCount; v++) {
      const x = part.positions[v * 3];
      const y = part.positions[v * 3 + 1];
      const z = part.positions[v * 3 + 2];
      if (x % 16 !== 0 || y % 16 !== 0 || z % 16 !== 0) subBlock++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    console.log(
      `  positions: ${subBlock}/${part.vertexCount} vertices sit inside a block`
      + ` (1/16 units, x ${minX}..${maxX})`,
    );
    console.log(`  first 6 vertices (1/16 units): ${[...Array(6)].map((_, v) => `(${part.positions[v * 3]},${part.positions[v * 3 + 1]},${part.positions[v * 3 + 2]})`).join(' ')}`);
  }

  // Light statistics.
    let min = 255, max = 0, sum = 0;
    for (let i = 0; i < part.lights.length; i++) {
      const v = part.lights[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const tileIds = new Set();
    for (let i = 0; i < part.tiles.length; i++) tileIds.add(part.tiles[i]);
    const tileNames = [...tileIds].map((id) => manifest.tileNames[id - 1] ?? `?${id}`);
    console.log(
      `section ${section} ${name}: verts=${part.vertexCount} tris=${part.indexCount / 3} `
      + `light min=${min} max=${max} avg=${(sum / part.lights.length).toFixed(1)} `
      + `tiles=[${tileNames.join(',')}]`,
    );

    // First few vertices of the topmost face found.
    let bestY = -Infinity;
    let bestIndex = -1;
    for (let v = 0; v < part.vertexCount; v++) {
      const y = part.positions[v * 3 + 1];
      if (y > bestY) { bestY = y; bestIndex = v - (v % 4); }
    }
    if (bestIndex >= 0) {
      console.log(`  topmost quad at y=${bestY.toFixed(2)}:`);
      for (let k = 0; k < 4; k++) {
        const v = bestIndex + k;
        const x = part.positions[v * 3];
        const y = part.positions[v * 3 + 1];
        const z = part.positions[v * 3 + 2];
        console.log(
          `    v${k} pos(${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}) `
          + `tile=${part.tiles[v]}(${manifest.tileNames[part.tiles[v] - 1]}) light=${part.lights[v]} (${(part.lights[v] / 255).toFixed(3)})`,
        );
      }
    }
  }
}

// Sanity: is the surface air at the top of the column?
const topY = WORLD_HEIGHT - 1;
console.log(`top of world block id: ${blocks[(topY * CHUNK_SIZE + 0) * CHUNK_SIZE + 0]} (expect 0 = air)`);
