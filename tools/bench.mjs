/**
 * CPU benchmark for world generation and chunk meshing.
 *
 * Runs the real worker code in Node (the worker module guards its
 * `self.onmessage` installation, so importing it here is safe) and reports how
 * long a chunk takes to generate and how long each render section takes to mesh.
 *
 * Usage:
 *   node tools/bench.mjs [chunks] [seed]
 */
import { performance } from 'node:perf_hooks';
import { Generator, meshSection } from '../src/world/chunk-worker.js';
import {
  CHUNK_SIZE, WORLD_HEIGHT, SECTION_COUNT, SECTION_HEIGHT,
} from '../src/world/constants.js';

const CHUNKS = Number(process.argv[2] || 4);
const SEED = Number(process.argv[3] || 12345) >>> 0;

const generator = new Generator(SEED);
const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

const timings = { generate: [], meshSection: [], skyAndLight: 0 };

console.log(`bench: seed=${SEED} chunks=${CHUNKS} worldHeight=${WORLD_HEIGHT} sections=${SECTION_COUNT}`);

// --- generation
for (let i = 0; i < CHUNKS; i++) {
  const cx = i % 4;
  const cz = Math.floor(i / 4);
  const t0 = performance.now();
  generator.generate(cx, cz, blocks, heights, biomes);
  const dt = performance.now() - t0;
  timings.generate.push(dt);
  console.log(`  gen   chunk (${cx},${cz}): ${dt.toFixed(1)} ms`);
}

// Keep one generated chunk to mesh.
const blocksCopy = blocks.slice();

// --- meshing (all sections of one chunk, with no neighbours)
let totalVerts = 0;
let totalIndexes = 0;
for (let section = 0; section < SECTION_COUNT; section++) {
  const t0 = performance.now();
  const result = meshSection(0, 0, section, blocksCopy, []);
  const dt = performance.now() - t0;
  timings.meshSection.push(dt);
  totalVerts += result.opaque.vertexCount + result.cutout.vertexCount;
  totalIndexes += result.opaque.indexCount + result.cutout.indexCount;
  if (result.opaque.vertexCount || result.cutout.vertexCount) {
    console.log(
      `  mesh  section ${section} (y ${section * SECTION_HEIGHT}-${section * SECTION_HEIGHT + SECTION_HEIGHT - 1}): `
      + `${dt.toFixed(1)} ms  verts=${result.opaque.vertexCount + result.cutout.vertexCount} `
      + `tris=${(result.opaque.indexCount + result.cutout.indexCount) / 3}`,
    );
  }
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0);
const max = (arr) => (arr.length ? Math.max(...arr) : 0);
const min = (arr) => (arr.length ? Math.min(...arr) : 0);

const genAvg = avg(timings.generate);
const meshTotal = sum(timings.meshSection);

console.log('');
console.log('--- summary -------------------------------------------------');
console.log(`generate : avg ${genAvg.toFixed(1)} ms  min ${min(timings.generate).toFixed(1)}  max ${max(timings.generate).toFixed(1)}`);
console.log(`mesh     : avg ${avg(timings.meshSection).toFixed(1)} ms per section, ${meshTotal.toFixed(1)} ms per chunk (${SECTION_COUNT} sections)`);
console.log(`cost     : ${(genAvg + meshTotal).toFixed(1)} ms per full chunk column`);
console.log(`geometry : ${totalVerts} vertices, ${totalIndexes / 3} triangles for one chunk`);
console.log(`estimate : ${(60000 / (genAvg + meshTotal)).toFixed(1)} chunks/minute on one core`);

// --- a coarse pass/fail gate so the benchmark doubles as a regression test
const limits = { generate: 400, meshSection: 250 };
let failed = 0;
if (genAvg > limits.generate) { console.error(`FAIL generate avg ${genAvg.toFixed(1)} ms > ${limits.generate} ms`); failed++; }
if (avg(timings.meshSection) > limits.meshSection) {
  console.error(`FAIL mesh avg ${avg(timings.meshSection).toFixed(1)} ms > ${limits.meshSection} ms`);
  failed++;
}
if (totalVerts === 0) { console.error('FAIL no geometry was produced'); failed++; }

console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK');
process.exit(failed ? 1 : 0);
