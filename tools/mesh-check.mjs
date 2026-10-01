/**
 * Sanity checks on mesher output: triangle areas, winding, and vertex spread.
 *
 * Usage: node tools/mesh-check.mjs [seed] [cx] [cz]
 */
import { Generator, meshSection } from '../src/world/chunk-worker.js';
import { CHUNK_SIZE, WORLD_HEIGHT, SECTION_HEIGHT, SECTION_COUNT } from '../src/world/constants.js';
import { tileIds } from '../src/world/tile-manifest.js';

const SEED = Number(process.argv[2] || 12345) >>> 0;
const CX = Number(process.argv[3] || 0);
const CZ = Number(process.argv[4] || 0);

const generator = new Generator(SEED);
const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
generator.generate(CX, CZ, blocks, heights, biomes);

let totalTris = 0;
let tinyTris = 0;
let degenerate = 0;
let badIndices = 0;
let totalVerts = 0;
let badBounds = 0;
let grassSideVerts = 0;
let flippedGrassSideUvs = 0;
const areaHistogram = { '<0.01': 0, '0.01-0.1': 0, '0.1-1': 0, '1-10': 0, '>10': 0 };

for (let section = 0; section < SECTION_COUNT; section++) {
  const result = meshSection(CX, CZ, section, blocks, []);
  const part = result.opaque;
  for (const [meshPart, bounds] of [
    [result.opaque, result.opaqueBounds],
    [result.cutout, result.cutoutBounds],
  ]) {
    if (!meshPart.vertexCount) continue;
    const expectedBounds = [
      meshPart.bounds[0], section * SECTION_HEIGHT + meshPart.bounds[1], meshPart.bounds[2],
      meshPart.bounds[3], section * SECTION_HEIGHT + meshPart.bounds[4], meshPart.bounds[5],
    ];
    if (!bounds || bounds.some((value, i) => value !== expectedBounds[i])) badBounds++;
  }
  if (!part.vertexCount) continue;
  totalVerts += part.vertexCount;

  const pos = part.positions;
  const idx = part.indices;
  for (let v = 0; v < part.vertexCount; v += 4) {
    if (part.tiles[v] !== tileIds.grass_side) continue;
    const ys = [0, 1, 2, 3].map((i) => pos[(v + i) * 3 + 1]);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    for (let i = 0; i < 4; i++) {
      grassSideVerts++;
      const expectedV = ys[i] === minY ? 16 : 0;
      if (part.uvs[(v + i) * 2 + 1] !== expectedV) flippedGrassSideUvs++;
    }
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (a >= part.vertexCount || b >= part.vertexCount || c >= part.vertexCount) {
      badIndices++;
      continue;
    }
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];

    // Cross product magnitude = 2 * area, in square 1/16-block units.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const doubleArea = Math.hypot(nx, ny, nz);
    const area = doubleArea / 2 / 256;      // convert to square blocks

    totalTris++;
    if (doubleArea === 0) degenerate++;
    else if (area < 0.01) tinyTris++;

    if (area < 0.01) areaHistogram['<0.01']++;
    else if (area < 0.1) areaHistogram['0.01-0.1']++;
    else if (area < 1) areaHistogram['0.1-1']++;
    else if (area < 10) areaHistogram['1-10']++;
    else areaHistogram['>10']++;
  }
}

console.log(`seed=${SEED} chunk=(${CX},${CZ})`);
console.log(`vertices       : ${totalVerts}`);
console.log(`triangles      : ${totalTris}`);
console.log(`degenerate     : ${degenerate}`);
console.log(`tiny (<0.01 blk): ${tinyTris}  (${((tinyTris / totalTris) * 100).toFixed(2)}%)`);
console.log(`out-of-range idx: ${badIndices}`);
console.log(`section-bound errors: ${badBounds}`);
console.log(`grass-side UV errors: ${flippedGrassSideUvs} / ${grassSideVerts}`);
console.log('area histogram (square blocks):');
for (const [bucket, count] of Object.entries(areaHistogram)) {
  console.log(`  ${bucket.padEnd(9)} ${String(count).padStart(7)}  ${((count / totalTris) * 100).toFixed(2)}%`);
}
console.log(totalTris > 0 && degenerate === 0 && badIndices === 0 && badBounds === 0 && flippedGrassSideUvs === 0
  ? 'RESULT: OK'
  : 'RESULT: PROBLEM');
