/**
 * Main-thread world model.
 *
 * Responsibilities:
 *  - own the chunk map (block ids + height map) and the streaming queue;
 *  - generate and mesh chunks inside a per-frame time budget, on the main
 *    thread. There is no worker on purpose: Web Workers cannot be loaded from
 *    `file://`, and the work is small enough (a few milliseconds per section)
 *    to interleave with rendering;
 *  - hand finished mesh buffers to the renderer through a small callback API;
 *  - service block reads/writes for physics, interaction and entity AI;
 *  - expose a voxel DDA raycast for mining and placing.
 */
import {
  CHUNK_SIZE, WORLD_HEIGHT, SECTION_HEIGHT, SECTION_COUNT, SEA_LEVEL, chunkIndex,
} from './constants.js';
import { isOpaque, isSolid, isLiquid } from './blocks.js';
import { generateChunk, meshSection } from './chunk-worker.js';

const CHUNK_KEY = (cx, cz) => `${cx},${cz}`;
const DIRS4 = [
  { dir: 0, dx: 1, dz: 0 },
  { dir: 1, dx: -1, dz: 0 },
  { dir: 4, dx: 0, dz: 1 },
  { dir: 5, dx: 0, dz: -1 },
];

/** Biome ids as produced by the generator, for the debug overlay. */
export const BIOME_NAMES = [
  'ocean', 'plains', 'forest', 'desert', 'mountains', 'taiga', 'swamp', 'beach', 'snowy', 'mushroom',
];

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = null;          // Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
    this.heights = null;         // Int16Array(CHUNK_SIZE * CHUNK_SIZE)
    this.biomes = null;
    this.state = 'pending';      // pending | ready
    this.dirtySections = new Set();
    /** @type {Map<number, {opaque: any, cutout: any, empty: boolean}>} */
    this.meshes = new Map();
    this.meshGeneration = 0;
  }

  get(x, y, z) {
    if (!this.blocks || x < 0 || z < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE) return 0;
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.blocks[chunkIndex(x, y, z)];
  }

  set(x, y, z, id) {
    if (!this.blocks || x < 0 || z < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE) return;
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[chunkIndex(x, y, z)] = id;
  }
}

export class World {
  /**
   * @param {object} options
   * @param {number} options.seed
   * @param {number} [options.renderDistance] in chunks
   * @param {(cx:number, cz:number, section:number, mesh:object|null) => void} [options.onMesh]
   */
  constructor({ seed = 12345, renderDistance = 8, onMesh = null, onChunkReady = null } = {}) {
    this.seed = seed >>> 0;
    this.renderDistance = renderDistance;
    /** @type {Map<string, Chunk>} */
    this.chunks = new Map();
    this.onMesh = onMesh;
    this.onChunkReady = onChunkReady;
    /** Player edits layered over generated terrain: chunkKey -> Map(blockIndex -> id). */
    this.edits = new Map();
    this.stats = { generated: 0, meshed: 0, queued: 0 };
    this.paused = false;
    this.time = 6000;            // world time in ticks, 0..24000
    this.dayLengthTicks = 24000;
    /** @type {string[]} generation/meshing problems, surfaced by the debug HUD. */
    this.errors = [];

    /** Sections waiting to be meshed, nearest-first. */
    this.meshQueue = [];
    this.queuedSections = new Set();
    /** Chunks whose column still needs generating, nearest-first. */
    this.genQueue = [];
    this.queuedChunks = new Set();
    /** Milliseconds of generation+meshing allowed per update() call. */
    this.frameBudgetMs = 6;
    this.lastJobsRun = 0;
  }

  /* ---------------- generation ---------------- */

  ensureChunk(cx, cz) {
    const key = CHUNK_KEY(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    chunk = new Chunk(cx, cz);
    this.chunks.set(key, chunk);
    if (!this.queuedChunks.has(key)) {
      this.queuedChunks.add(key);
      this.genQueue.push(chunk);
    }
    return chunk;
  }

  /** Generates one queued column. Returns true when work was done. */
  _runGeneration(chunk) {
    this.queuedChunks.delete(CHUNK_KEY(chunk.cx, chunk.cz));
    let result;
    try {
      result = generateChunk(this.seed, chunk.cx, chunk.cz);
    } catch (err) {
      this.errors.push(`generation failed for ${chunk.cx},${chunk.cz}: ${err.message}`);
      console.error('[world] generation failed', err);
      return false;
    }
    chunk.blocks = result.blocks;
    chunk.heights = result.heights;
    chunk.biomes = result.biomes;
    chunk.state = 'ready';
    this.stats.generated++;

    // Re-apply any edits the player made before this chunk existed.
    this._applyEdits(chunk);

    for (let s = 0; s < SECTION_COUNT; s++) chunk.dirtySections.add(s);
    this.enqueueMesh(chunk);

    // Neighbours that were waiting on this border need a re-mesh.
    for (const d of DIRS4) {
      const neighbour = this.chunks.get(CHUNK_KEY(chunk.cx + d.dx, chunk.cz + d.dz));
      if (neighbour && neighbour.state === 'ready') {
        for (let s = 0; s < SECTION_COUNT; s++) neighbour.dirtySections.add(s);
        this.enqueueMesh(neighbour);
      }
    }

    if (this.onChunkReady) this.onChunkReady(chunk);
    return true;
  }

  _applyEdits(chunk) {
    const map = this.edits.get(CHUNK_KEY(chunk.cx, chunk.cz));
    if (!map) return;
    for (const [index, id] of map) chunk.blocks[index] = id;
  }

  _recordEdit(chunk, x, y, z, id) {
    const key = CHUNK_KEY(chunk.cx, chunk.cz);
    let map = this.edits.get(key);
    if (!map) {
      map = new Map();
      this.edits.set(key, map);
    }
    map.set(chunkIndex(x, y, z), id);
  }

  /* ---------------- meshing ---------------- */

  enqueueMesh(chunk) {
    if (chunk.state !== 'ready' || chunk.dirtySections.size === 0) return;
    for (const section of chunk.dirtySections) {
      const key = `${chunk.cx},${chunk.cz},${section}`;
      if (this.queuedSections.has(key)) continue;
      this.queuedSections.add(key);
      this.meshQueue.push({ chunk, section, key });
    }
    chunk.dirtySections.clear();
  }

  /** The four edge columns a section mesher needs from adjacent chunks. */
  _neighbourColumns(chunk) {
    const out = [];
    for (const d of DIRS4) {
      const neighbour = this.chunks.get(CHUNK_KEY(chunk.cx + d.dx, chunk.cz + d.dz));
      if (neighbour && neighbour.state === 'ready') {
        out.push({ dir: d.dir, blocks: neighbour.blocks });
      }
    }
    return out;
  }

  /** Meshes one queued section and hands the result to the renderer. */
  _runMeshing(chunk, section) {
    let result;
    try {
      result = meshSection(chunk.cx, chunk.cz, section, chunk.blocks, this._neighbourColumns(chunk));
    } catch (err) {
      this.errors.push(`meshing failed for ${chunk.cx},${chunk.cz},${section}: ${err.message}`);
      console.error('[world] meshing failed', err);
      return false;
    }
    this.stats.meshed++;
    if (result.empty) {
      chunk.meshes.delete(section);
      if (this.onMesh) this.onMesh(chunk.cx, chunk.cz, section, null);
    } else {
      chunk.meshes.set(section, result);
      if (this.onMesh) this.onMesh(chunk.cx, chunk.cz, section, result);
    }
    return true;
  }

  /** Forces every section of every loaded chunk to be re-meshed. */
  remeshAll() {
    for (const chunk of this.chunks.values()) {
      if (chunk.state !== 'ready') continue;
      for (let s = 0; s < SECTION_COUNT; s++) chunk.dirtySections.add(s);
      this.enqueueMesh(chunk);
    }
  }

  /* ---------------- streaming around the player ---------------- */

  /**
   * Streams chunks around the player and runs generation/meshing jobs until
   * `frameBudgetMs` is used up. Returns how many jobs ran.
   */
  update(px, pz, budget = 3) {
    const started = performance.now();
    this.lastJobsRun = 0;
    const pcx = Math.floor(px / CHUNK_SIZE);
    const pcz = Math.floor(pz / CHUNK_SIZE);
    const radius = this.renderDistance;
    const distance2 = (cx, cz) => ((cx * CHUNK_SIZE + 8 - px) ** 2) + ((cz * CHUNK_SIZE + 8 - pz) ** 2);

    // Queue the nearest missing chunks (no work yet, just bookkeeping).
    const candidates = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius) continue;
        const cx = pcx + dx, cz = pcz + dz;
        if (this.chunks.has(CHUNK_KEY(cx, cz))) continue;
        candidates.push({ cx, cz, d2 });
      }
    }
    candidates.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < Math.min(budget, candidates.length); i++) {
      this.ensureChunk(candidates[i].cx, candidates[i].cz);
    }

    this.genQueue.sort((a, b) => distance2(a.cx, a.cz) - distance2(b.cx, b.cz));
    this.meshQueue.sort((a, b) => (
      distance2(a.chunk.cx, a.chunk.cz) - distance2(b.chunk.cx, b.chunk.cz)
    ));

    // Generate first: a mesher needs its own column to exist. Do a little
    // meshing between generations so nearby terrain appears promptly.
    while (performance.now() - started < this.frameBudgetMs && this.lastJobsRun < 40) {
      if (this.genQueue.length) {
        const chunk = this.genQueue.shift();
        if (chunk.state !== 'ready') {
          this._runGeneration(chunk);
          this.lastJobsRun++;
        }
        if (performance.now() - started >= this.frameBudgetMs * 0.6 && this.meshQueue.length) break;
        continue;
      }
      const job = this.meshQueue.shift();
      if (!job) break;
      this.queuedSections.delete(job.key);
      if (job.chunk.state === 'ready') {
        this._runMeshing(job.chunk, job.section);
        this.lastJobsRun++;
      }
    }

    // Unload chunks far outside the render distance.
    const unloadRadius = radius + 4;
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > unloadRadius * unloadRadius) {
        chunk.blocks = null;
        chunk.meshes.clear();
        this.chunks.delete(key);
        // Drop any pending work for this chunk so the queues stay bounded.
        this.queuedChunks.delete(key);
        for (let s = 0; s < SECTION_COUNT; s++) {
          this.queuedSections.delete(`${chunk.cx},${chunk.cz},${s}`);
          if (this.onMesh) this.onMesh(chunk.cx, chunk.cz, s, null);
        }
      }
    }
    if (this.queuedChunks.size) {
      this.genQueue = this.genQueue.filter((chunk) => this.chunks.has(CHUNK_KEY(chunk.cx, chunk.cz)));
      this.genQueue.forEach((chunk) => this.queuedChunks.add(CHUNK_KEY(chunk.cx, chunk.cz)));
    }
    return this.chunks.size;
  }

  /** True once the chunk containing (x, z) is generated. */
  isLoaded(x, z) {
    const chunk = this.chunks.get(CHUNK_KEY(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    return !!(chunk && chunk.state === 'ready');
  }

  /* ---------------- block access ---------------- */

  getChunk(cx, cz) {
    return this.chunks.get(CHUNK_KEY(cx, cz)) || null;
  }

  /** Block id at world coordinates. Unloaded chunks read as air above y=0. */
  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
    if (!chunk || chunk.state !== 'ready') {
      // Treat the void below the world as bedrock so the player never falls out.
      return y <= 0 ? 6 : 0;
    }
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return chunk.blocks[chunkIndex(lx, y, lz)];
  }

  isSolidAt(x, y, z) {
    return isSolid(this.getBlock(x, y, z));
  }

  isOpaqueAt(x, y, z) {
    return isOpaque(this.getBlock(x, y, z));
  }

  isLiquidAt(x, y, z) {
    return isLiquid(this.getBlock(x, y, z));
  }

  /** Highest non-air block at (x, z) in a loaded chunk, or null. */
  heightAt(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
    if (!chunk || chunk.state !== 'ready') return null;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (chunk.blocks[chunkIndex(lx, y, lz)] !== 0) return y;
    }
    return 0;
  }

  /**
   * Writes a block and re-meshes the affected sections (plus neighbours when
   * the change sits on a chunk border, since their lighting may change).
   *
   * @returns {boolean} true when something actually changed
   */
  setBlock(x, y, z, id, { record = true } = {}) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
    if (!chunk || chunk.state !== 'ready') return false;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const index = chunkIndex(lx, y, lz);
    if (chunk.blocks[index] === id) return false;
    chunk.blocks[index] = id;
    if (record) this._recordEdit(chunk, lx, y, lz, id);

    // Refresh the cached height map used for placement and spawning.
    if (chunk.heights) {
      const hIdx = lz * CHUNK_SIZE + lx;
      if (id !== 0 && y > chunk.heights[hIdx]) chunk.heights[hIdx] = y;
      else if (id === 0 && y === chunk.heights[hIdx]) {
        let ny = y;
        while (ny > 0 && chunk.blocks[chunkIndex(lx, ny, lz)] === 0) ny--;
        chunk.heights[hIdx] = ny;
      }
    }

    this._markDirty(chunk, lx, y, lz);
    return true;
  }

  /** Marks a section dirty and, on chunk borders, asks the neighbour to re-mesh too. */
  _markDirty(chunk, lx, y, lz) {
    const section = Math.floor(y / SECTION_HEIGHT);
    chunk.dirtySections.add(section);
    this.enqueueMesh(chunk);

    const touch = (nx, nz, nsx, nsz) => {
      const neighbour = this.chunks.get(CHUNK_KEY(chunk.cx + nx, chunk.cz + nz));
      if (!neighbour || neighbour.state !== 'ready') return;
      neighbour.dirtySections.add(section);
      if (Math.floor((y + 1) / SECTION_HEIGHT) !== section) {
        neighbour.dirtySections.add(Math.floor((y + 1) / SECTION_HEIGHT));
      }
      this.enqueueMesh(neighbour);
    };
    if (lx === 0) touch(-1, 0);
    if (lx === CHUNK_SIZE - 1) touch(1, 0);
    if (lz === 0) touch(0, -1);
    if (lz === CHUNK_SIZE - 1) touch(0, 1);
  }

  /**
   * Also re-light/re-mesh the section above and below when light could leak
   * through the changed block. Called by the interaction layer before/after
   * placement so torches light up their surroundings correctly.
   */
  markLightDirty(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
    if (!chunk || chunk.state !== 'ready') return;
    const section = Math.floor(y / SECTION_HEIGHT);
    chunk.dirtySections.add(section);
    if (section > 0) chunk.dirtySections.add(section - 1);
    if (section < SECTION_COUNT - 1) chunk.dirtySections.add(section + 1);
    this.enqueueMesh(chunk);
  }

  /* ---------------- ray casting ---------------- */

  /**
   * Amanatides & Woo voxel traversal.
   *
   * @returns {null | {
   *   x:number, y:number, z:number,        // hit block coordinates
   *   distance:number,
   *   normal:[number,number,number],       // face the ray entered through
   * }}
   */
  raycast(origin, direction, maxDistance = 6, filter = null) {
    let x = Math.floor(origin[0]);
    let y = Math.floor(origin[1]);
    let z = Math.floor(origin[2]);

    const dx = direction[0], dy = direction[1], dz = direction[2];
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;

    const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

    const boundary = (o, i, step) => (step > 0 ? i + 1 - o : o - i);
    let tMaxX = dx === 0 ? Infinity : boundary(origin[0], x, stepX) * tDeltaX;
    let tMaxY = dy === 0 ? Infinity : boundary(origin[1], y, stepY) * tDeltaY;
    let tMaxZ = dz === 0 ? Infinity : boundary(origin[2], z, stepZ) * tDeltaZ;

    let normal = [0, 0, 0];
    let distance = 0;

    // Bounded loop: the longest possible traversal at 1/16 steps.
    const limit = Math.ceil(maxDistance * 4) + 8;
    for (let i = 0; i < limit; i++) {
      const id = this.getBlock(x, y, z);
      if (id !== 0 && (!filter || filter(id, x, y, z))) {
        return { x, y, z, id, distance, normal };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; distance = tMaxX; tMaxX += tDeltaX; normal = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; distance = tMaxY; tMaxY += tDeltaY; normal = [0, -stepY, 0];
      } else {
        z += stepZ; distance = tMaxZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ];
      }
      if (distance > maxDistance) break;
      if (y < 0 || y >= WORLD_HEIGHT) {
        if (distance > maxDistance) break;
      }
    }
    return null;
  }

  /** Convenience: the highest safe standing Y at (x, z), never below 1. */
  surfaceY(x, z) {
    const h = this.heightAt(x, z);
    return h === null ? SEA_LEVEL + 1 : Math.max(1, h + 1);
  }

  /** Human-readable biome at a column, or 'unknown' outside loaded chunks. */
  biomeNameAt(x, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
    if (!chunk || chunk.state !== 'ready' || !chunk.biomes) return 'unknown';
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return BIOME_NAMES[chunk.biomes[lz * CHUNK_SIZE + lx]] ?? 'unknown';
  }

  /**
   * Finds a safe spawn point on land above sea level, searching outward from
   * (originX, originZ) through *loaded* chunks.
   *
   * Searching outward matters: picking the first ready chunk in map order can
   * land the player in a region that has not been generated or meshed yet, and
   * they then stand above a half-built world.
   */
  findSpawn(originX = 0, originZ = 0) {
    const originCx = Math.floor(originX / CHUNK_SIZE);
    const originCz = Math.floor(originZ / CHUNK_SIZE);
    let best = null;
    let bestDistance = Infinity;

    for (const chunk of this.chunks.values()) {
      if (chunk.state !== 'ready' || !chunk.heights) continue;
      const distance = (chunk.cx - originCx) ** 2 + (chunk.cz - originCz) ** 2;
      if (distance > bestDistance) continue;
      for (let lz = 0; lz < CHUNK_SIZE; lz += 2) {
        for (let lx = 0; lx < CHUNK_SIZE; lx += 2) {
          const h = chunk.heights[lz * CHUNK_SIZE + lx];
          if (h <= SEA_LEVEL + 1) continue;
          const x = chunk.cx * CHUNK_SIZE + lx;
          const z = chunk.cz * CHUNK_SIZE + lz;
          const ground = this.getBlock(x, h, z);
          // Skip water, ice and anything not actually solid to stand on.
          if (!isSolid(ground) || isLiquid(ground)) continue;
          const spotDistance = (x - originX) ** 2 + (z - originZ) ** 2;
          if (spotDistance < bestDistance) {
            bestDistance = spotDistance;
            best = { x: x + 0.5, y: h + 1.2, z: z + 0.5 };
          }
        }
      }
    }
    return best ?? { x: originX + 0.5, y: SEA_LEVEL + 12, z: originZ + 0.5 };
  }

  /* ---------------- persistence ---------------- */

  /** Serialises the seed plus every player edit, which is all that is needed. */
  serialize() {
    const edits = {};
    for (const [key, map] of this.edits) {
      if (!map.size) continue;
      const entries = new Array(map.size);
      let i = 0;
      for (const [index, id] of map) {
        entries[i++] = index;
        entries[i++] = id;
      }
      edits[key] = entries;
    }
    return { version: 1, seed: this.seed, time: this.time, edits };
  }

  /** Loads a save produced by serialize() and re-meshes everything. */
  loadSave(save) {
    if (!save || save.version !== 1) return false;
    this.edits.clear();
    for (const [key, entries] of Object.entries(save.edits || {})) {
      const map = new Map();
      for (let i = 0; i < entries.length; i += 2) map.set(entries[i], entries[i + 1]);
      this.edits.set(key, map);
    }
    if (typeof save.time === 'number') this.time = save.time;
    for (const chunk of this.chunks.values()) {
      if (chunk.state === 'ready') {
        this._applyEdits(chunk);
        for (let s = 0; s < SECTION_COUNT; s++) chunk.dirtySections.add(s);
        this.enqueueMesh(chunk);
      }
    }
    return true;
  }

  dispose() {
    this.chunks.clear();
    this.genQueue.length = 0;
    this.meshQueue.length = 0;
    this.queuedChunks.clear();
    this.queuedSections.clear();
  }
}

export { CHUNK_SIZE, WORLD_HEIGHT, SECTION_COUNT, SECTION_HEIGHT, SEA_LEVEL };
