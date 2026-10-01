/**
 * The world generation worker.
 *
 * It owns two heavy jobs so the main thread never stalls:
 *   1. `gen`   鈥?build one 16 x 128 x 16 chunk column from layered noise
 *                (biomes, caves, ores, trees, water) and compute skylight.
 *   2. `mesh`  鈥?turn a chunk section (plus a one-block border of neighbours)
 *                into an interleaved vertex buffer with baked ambient occlusion
 *                and light, split into an opaque and a double-sided cutout pass.
 *
 * Protocol
 *   main -> worker : { id, kind: 'gen', seed, cx, cz }
 *                    { id, kind: 'mesh', cx, cz, section, blocks, neighbours }
 *   worker -> main : { id, kind: 'gen', cx, cz, blocks, heights, biomes, spawn }
 *                    { id, kind: 'mesh', cx, cz, section, opaque, cutout, bounds }
 */
import { Noise } from './noise.js';
import { ID } from './blocks-worker.js';
import manifest from './tile-manifest.js';
import {
  CHUNK_SIZE, WORLD_HEIGHT, SECTION_HEIGHT, SECTION_COUNT, SEA_LEVEL,
} from './constants.js';

const BLOCK_FACES = manifest.blockFaces;

/* ------------------------------------------------------------------ *
 * Block property tables (worker-local copies of what the generator needs)
 * ------------------------------------------------------------------ */

const isAir = (id) => id === 0;
const isWater = (id) => id === ID.WATER;
const isLiquid = (id) => id === ID.WATER || id === ID.LAVA;
const isLeaves = (id) => id === ID.OAK_LEAVES || id === ID.SPRUCE_LEAVES || id === ID.BIRCH_LEAVES;

/** Blocks that do not occlude their neighbours (faces are still drawn). */
const NON_OPAQUE = new Set([
  0, ID.WATER, ID.OAK_LEAVES, ID.SPRUCE_LEAVES, ID.BIRCH_LEAVES, ID.GLASS, ID.ICE,
  ID.TORCH, ID.SUGAR_CANE, ID.DEAD_BUSH, ID.RAIL, ID.DANDELION, ID.POPPY, ID.SPRUCE_SAPLING,
]);

/** Cross-shaped (billboard) blocks. */
const PLANTS = new Set([
  ID.TORCH, ID.SUGAR_CANE, ID.DEAD_BUSH, ID.RAIL, ID.DANDELION, ID.POPPY,
  ID.SPRUCE_SAPLING, ID.SHORT_GRASS,
]);

const FILTER = new Int8Array(256);
FILTER.fill(15);
for (const id of NON_OPAQUE) FILTER[id] = 0;
FILTER[ID.OAK_LEAVES] = 2;
FILTER[ID.SPRUCE_LEAVES] = 2;
FILTER[ID.BIRCH_LEAVES] = 2;
FILTER[ID.WATER] = 1;
FILTER[ID.ICE] = 2;

const EMISSION = new Int8Array(256);
EMISSION[ID.GLOWSTONE] = 15;
EMISSION[ID.TORCH] = 14;
EMISSION[ID.LAVA] = 15;

/* ------------------------------------------------------------------ *
 * Terrain generation
 * ------------------------------------------------------------------ */

const BIOME = { OCEAN: 0, PLAINS: 1, FOREST: 2, DESERT: 3, MOUNTAINS: 4, TAIGA: 5, SWAMP: 6, BEACH: 7, SNOWY: 8, MUSHROOM: 9 };
const MAT = { SANDSTONE: ID.SANDSTONE };

class Generator {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.continent = new Noise(seed + 1);
    this.erosion = new Noise(seed + 2);
    this.peaks = new Noise(seed + 3);
    this.climate = new Noise(seed + 4);
    this.cave = new Noise(seed + 5);
    this.surface = new Noise(seed + 6);
    this.ore = new Noise(seed + 7);
    this.tree = new Noise(seed + 8);
    this.tmp = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    this.tmpHeights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    this.tmpBiomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  }

  /** Raw terrain height (before water) for a world column. */
  heightAt(wx, wz) {
    const cont = this.continent.fbm2(wx / 620, wz / 620, 4);
    const hills = this.erosion.fbm2(wx / 145, wz / 145, 4);
    const detail = this.surface.fbm2(wx / 46, wz / 46, 3);
    const ridge = this.peaks.ridged2(wx / 300, wz / 300, 4);

    // Squash the continent curve so most of the map is land near sea level.
    const land = cont * 1.35;
    const base = 66 + land * 14;

    // Mountain mask: only where the continent is high and ridges are strong.
    const mountainMask = Math.max(0, cont - 0.18) * 3.4;
    const mountain = ridge * ridge * 52 * mountainMask;

    const rolling = hills * (5.5 + mountainMask * 9);
    return base + rolling + mountain + detail * 2.2;
  }

  climateAt(wx, wz) {
    const t = this.climate.fbm2(wx / 900 + 51.3, wz / 900 - 12.7, 3);
    const h = this.climate.fbm2(wx / 760 - 21.1, wz / 760 + 77.9, 3);
    return { temp: t, humid: h };
  }

  biomeAt(wx, wz, height) {
    const { temp, humid } = this.climateAt(wx, wz);
    if (height < SEA_LEVEL - 2) return BIOME.OCEAN;
    if (height <= SEA_LEVEL + 1) return BIOME.BEACH;
    if (height > SEA_LEVEL + 34) return temp < -0.15 ? BIOME.SNOWY : BIOME.MOUNTAINS;
    if (humid > 0.62 && temp > -0.1 && temp < 0.35) return BIOME.MUSHROOM;
    if (temp < -0.32) return BIOME.SNOWY;
    if (temp < -0.1 && humid > -0.15) return BIOME.TAIGA;
    if (temp > 0.3 && humid < -0.18) return BIOME.DESERT;
    if (humid > 0.36 && height < SEA_LEVEL + 5) return BIOME.SWAMP;
    if (humid > 0.06) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  /** True when the block at (x, y, z) should be carved out as a cave. */
  isCave(wx, wy, wz) {
    // Two ridged fields intersecting gives tunnel-like caves instead of blobs.
    const a = this.cave.fbm3(wx / 92, wy / 46, wz / 92, 2);
    const b = this.cave.fbm3(wx / 92 + 100, wy / 46 + 100, wz / 92 + 100, 2);
    const tunnel = Math.abs(a) < 0.085 && Math.abs(b) < 0.085;
    const cavern = this.cave.fbm3(wx / 210, wy / 70, wz / 210, 3) > 0.52;
    if (!tunnel && !cavern) return false;
    // Fade caves out near the surface so we do not punch holes in the landscape.
    const surface = this.tmpSurfaceRef ?? SEA_LEVEL;
    if (wy > surface - 4) return false;
    if (cavern && wy > surface - 12) return false;
    return true;
  }

  /** Ore selection for a stone block at world (x, y, z). */
  oreAt(wx, wy, wz) {
    const r = this.ore.noise3(wx * 0.31, wy * 0.31, wz * 0.31);
    const r2 = this.ore.noise3(wx * 0.11 + 40, wy * 0.11 - 17, wz * 0.11 + 9);
    const chance = (base, scale) => r + r2 * scale > 1 - base;

    if (wy < 16 && chance(0.012, 0.35)) return ID.DIAMOND_ORE;
    if (wy < 20 && chance(0.02, 0.3)) return ID.REDSTONE_ORE;
    if (wy < 32 && chance(0.03, 0.3)) return ID.GOLD_ORE;
    if (wy < 40 && chance(0.02, 0.3)) return ID.EMERALD_ORE;
    if (wy < 64 && chance(0.06, 0.35)) return ID.IRON_ORE;
    if (wy < 96 && chance(0.08, 0.35)) return ID.COAL_ORE;
    return ID.STONE;
  }

  /** Fills `out` (16 x 128 x 16, x-major, y-major) with a generated chunk. */
  generate(cx, cz, out, heights, biomes) {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    out.fill(0);

    // Pass 1: stone / dirt / surface material, water and bedrock.
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const h = Math.max(1, Math.min(WORLD_HEIGHT - 8, Math.round(this.heightAt(wx, wz))));
        const biome = this.biomeAt(wx, wz, h);
        const colIdx = lz * CHUNK_SIZE + lx;
        heights[colIdx] = h;
        biomes[colIdx] = biome;
        this.tmpSurfaceRef = h;

        for (let y = 0; y <= h; y++) {
          const idx = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          if (y === 0) { out[idx] = ID.BEDROCK; continue; }
          if (y <= 2 && this.ore.noise3(wx * 3.1, y * 3.1, wz * 3.1) > -0.1) { out[idx] = ID.BEDROCK; continue; }

          const depth = h - y;
          if (this.isCave(wx, y, wz) && y > 1 && y < h - 1) continue; // cave = air

          if (depth === 0) {
            out[idx] = this.surfaceBlock(biome, wx, y, wz, h);
          } else if (depth <= 3) {
            out[idx] = this.subsurfaceBlock(biome, depth);
          } else {
            out[idx] = this.oreAt(wx, y, wz);
          }
        }

        // Water fills everything below sea level.
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          const idx = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          if (out[idx] === ID.AIR) out[idx] = ID.WATER;
        }

        // Snow / ice caps in cold biomes.
        if (biome === BIOME.SNOWY) {
          const top = h;
          const idx = (top * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          if (out[idx] !== ID.AIR && out[idx] !== ID.WATER) out[idx] = ID.SNOW_BLOCK;
          const above = ((top + 1) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          if (top + 1 < WORLD_HEIGHT && out[above] === ID.WATER) out[above] = ID.ICE;
          for (let y = SEA_LEVEL + 1; y < WORLD_HEIGHT; y++) {
            const i2 = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
            if (out[i2] === ID.WATER) out[i2] = ID.ICE;
          }
        }
      }
    }

    // Pass 2: surface decoration (trees, cacti, flowers, sugar cane).
    this.decorate(cx, cz, out, heights, biomes);
  }

  surfaceBlock(biome, wx, y, wz, h) {
    switch (biome) {
      case BIOME.OCEAN:
      case BIOME.BEACH: return ID.SAND;
      case BIOME.DESERT: return ID.SAND;
      case BIOME.SWAMP: return ID.GRASS_BLOCK;
      case BIOME.SNOWY: return ID.SNOW_BLOCK;
      case BIOME.MOUNTAINS:
        return h > SEA_LEVEL + 52 ? ID.STONE : (h > SEA_LEVEL + 44 ? ID.SNOW_BLOCK : ID.GRASS_BLOCK);
      case BIOME.TAIGA: return ID.PODZOL;
      case BIOME.MYCELIUM: return ID.MYCELIUM;
      default: return ID.GRASS_BLOCK;
    }
  }

  subsurfaceBlock(biome, depth) {
    switch (biome) {
      case BIOME.OCEAN:
      case BIOME.BEACH:
      case BIOME.DESERT: return depth <= 2 ? MAT.SANDSTONE : ID.SAND;
      case BIOME.MOUNTAINS: return ID.STONE;
      default: return ID.DIRT;
    }
  }

  decorate(cx, cz, out, heights, biomes) {
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    const rnd = new Noise(this.seed + 999);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const colIdx = lz * CHUNK_SIZE + lx;
        const h = heights[colIdx];
        const biome = biomes[colIdx];
        if (h < SEA_LEVEL) continue; // underwater columns get no plants

        const roll = rnd.fbm2(wx * 12.9898, wz * 78.233, 1) * 0.5 + 0.5;
        const roll2 = rnd.fbm2(wx * 39.346 + 7, wz * 11.135 - 3, 1) * 0.5 + 0.5;
        const surface = this.getLocal(out, lx, h, lz);
        if (surface !== ID.GRASS_BLOCK && surface !== ID.PODZOL && surface !== ID.SNOW_BLOCK
          && surface !== ID.SAND && surface !== ID.MYCELIUM) continue;

        let treeDensity = 0;
        let treeKind = ID.OAK_LOG, leafKind = ID.OAK_LEAVES;
        switch (biome) {
          case BIOME.FOREST: treeDensity = 0.055; break;
          case BIOME.PLAINS: treeDensity = 0.007; break;
          case BIOME.SWAMP: treeDensity = 0.02; break;
          case BIOME.TAIGA: treeDensity = 0.045; treeKind = ID.SPRUCE_LOG; leafKind = ID.SPRUCE_LEAVES; break;
          case BIOME.SNOWY: treeDensity = 0.03; treeKind = ID.SPRUCE_LOG; leafKind = ID.SPRUCE_LEAVES; break;
          case BIOME.MOUNTAINS: treeDensity = h < SEA_LEVEL + 42 ? 0.02 : 0; treeKind = ID.SPRUCE_LOG; leafKind = ID.SPRUCE_LEAVES; break;
          default: treeDensity = 0; break;
        }

        if (roll < treeDensity) {
          this.placeTree(out, lx, h + 1, lz, treeKind, leafKind, roll2);
          continue;
        }

        if (biome === BIOME.DESERT) {
          if (roll < 0.008) this.placeCactus(out, lx, h + 1, lz);
          else if (roll < 0.02) this.setLocal(out, lx, h + 1, lz, ID.DEAD_BUSH);
          continue;
        }

        if (biome === BIOME.SWAMP && roll < 0.05 && surface === ID.GRASS_BLOCK) {
          this.setLocal(out, lx, h + 1, lz, ID.SUGAR_CANE);
          if (roll < 0.02) this.setLocal(out, lx, h + 2, lz, ID.SUGAR_CANE);
          continue;
        }

        // Ground cover.
        if (surface === ID.GRASS_BLOCK || surface === ID.PODZOL || surface === ID.MYCELIUM) {
          const gr = roll2;
          if (gr < 0.16) this.setLocal(out, lx, h + 1, lz, ID.SHORT_GRASS);
          else if (gr < 0.185) this.setLocal(out, lx, h + 1, lz, ID.DANDELION);
          else if (gr < 0.21) this.setLocal(out, lx, h + 1, lz, ID.POPPY);
          else if (gr < 0.215 && (biome === BIOME.FOREST || biome === BIOME.TAIGA)) {
            this.setLocal(out, lx, h + 1, lz, ID.SPRUCE_SAPLING);
          }
        }
      }
    }

    // Beech: pumpkins are rare, place them from a separate roll.
    for (let i = 0; i < 2; i++) {
      const wx = ox + Math.floor(rnd.fbm2(ox * 1.7 + i * 13.3, oz * 2.3 - i * 7.1, 1) * 8 + 8);
      const wz = oz + Math.floor(rnd.fbm2(oz * 1.9 - i * 5.5, ox * 2.7 + i * 3.9, 1) * 8 + 8);
      const lx = wx - ox, lz = wz - oz;
      if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) continue;
      const colIdx = lz * CHUNK_SIZE + lx;
      const h = heights[colIdx];
      if (h < SEA_LEVEL + 1) continue;
      if (this.getLocal(out, lx, h, lz) !== ID.GRASS_BLOCK) continue;
      this.setLocal(out, lx, h + 1, lz, ID.PUMPKIN);
    }
  }

  placeTree(out, lx, baseY, lz, logId, leafId, roll) {
    const height = 4 + Math.floor(roll * 3.99);
    const top = baseY + height;
    for (let y = baseY; y < top; y++) this.setLocal(out, lx, y, lz, logId);
    const radius = logId === ID.SPRUCE_LOG ? 2 : 2;
    for (let dy = -2; dy <= 1; dy++) {
      const y = top + dy;
      const r = dy <= -1 ? radius : (dy === 0 ? 1 : 1);
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const d = Math.abs(dx) + Math.abs(dz);
          if (d > r + (dy >= 0 ? 0 : 1)) continue;
          if (dx === 0 && dz === 0 && dy <= 0) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && r > 1) continue;
          this.setLocalIfAir(out, lx + dx, y, lz + dz, leafId);
        }
      }
    }
    this.setLocalIfAir(out, lx, top + 1, lz, leafId);
  }

  placeCactus(out, lx, baseY, lz) {
    const height = 1 + Math.floor((Math.abs(this.tree.noise2(lx * 3.3, lz * 4.7)) * 3.99));
    for (let i = 0; i < height; i++) this.setLocal(out, lx, baseY + i, lz, ID.CACTUS);
  }

  getLocal(out, lx, y, lz) {
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return ID.AIR;
    return out[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
  }

  setLocal(out, lx, y, lz, id) {
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    out[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = id;
  }

  /** Writes only if the target is currently air, and never outside the chunk. */
  setLocalIfAir(out, lx, y, lz, id) {
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    const idx = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
    if (out[idx] === ID.AIR) out[idx] = id;
  }
}

/* ------------------------------------------------------------------ *
 * Mesher
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * Mesher
 * ------------------------------------------------------------------ */

const PAD = 1;
const PAD_W = CHUNK_SIZE + PAD * 2; // 18
const PAD_AREA = PAD_W * PAD_W;
const padIndex = (px, y, pz) => (y * PAD_W + pz) * PAD_W + px;
const clampPx = (v) => (v < 0 ? 0 : v >= PAD_W ? PAD_W - 1 : v);
const clampY = (v) => (v < 0 ? 0 : v >= WORLD_HEIGHT ? WORLD_HEIGHT - 1 : v);

/**
 * Each face lists its four corners in counter-clockwise order as seen from
 * outside the block, in 1/16 block units. `uAxis`/`vAxis` name the world axes
 * the texture coordinates follow (0 = x, 1 = y, 2 = z).
 *
 * `ao[i]` is the diagonal neighbour of corner i in the plane in front of the
 * face; the two axis neighbours are derived from it, which gives the classic
 * three-sample ambient occlusion.
 */
const FACES = [
  { // 0 east (+X)
    normal: [1, 0, 0], shade: 0.72, uAxis: 2, vAxis: 1,
    corners: [[16, 0, 16], [16, 0, 0], [16, 16, 0], [16, 16, 16]],
    diag: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], face: 0,
  },
  { // 1 west (-X)
    normal: [-1, 0, 0], shade: 0.72, uAxis: 2, vAxis: 1,
    corners: [[0, 0, 0], [0, 0, 16], [0, 16, 16], [0, 16, 0]],
    diag: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], face: 1,
  },
  { // 2 top (+Y)
    normal: [0, 1, 0], shade: 1.0, uAxis: 0, vAxis: 2,
    corners: [[0, 16, 16], [16, 16, 16], [16, 16, 0], [0, 16, 0]],
    diag: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], face: 2,
  },
  { // 3 bottom (-Y)
    normal: [0, -1, 0], shade: 0.5, uAxis: 0, vAxis: 2,
    corners: [[0, 0, 0], [16, 0, 0], [16, 0, 16], [0, 0, 16]],
    diag: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], face: 3,
  },
  { // 4 south (+Z)
    normal: [0, 0, 1], shade: 0.86, uAxis: 0, vAxis: 1,
    corners: [[0, 0, 16], [16, 0, 16], [16, 16, 16], [0, 16, 16]],
    diag: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], face: 4,
  },
  { // 5 north (-Z)
    normal: [0, 0, -1], shade: 0.86, uAxis: 0, vAxis: 1,
    corners: [[16, 0, 0], [0, 0, 0], [0, 16, 0], [16, 16, 0]],
    diag: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], face: 5,
  },
];

/* In-plane tangents per face, used to derive the two axis samples from `diag`. */
const TANGENTS = [
  [[0, 0, 1], [0, 1, 0]], // east
  [[0, 0, 1], [0, 1, 0]], // west
  [[1, 0, 0], [0, 0, 1]], // top
  [[1, 0, 0], [0, 0, 1]], // bottom
  [[1, 0, 0], [0, 1, 0]], // south
  [[1, 0, 0], [0, 1, 0]], // north
];

/** Sign of a tangent-axis offset taken from the diagonal corner vector. */
function axisSign(ao, axis) {
  return axis === 0 ? ao[0] : axis === 1 ? ao[1] : ao[2];
}

class MeshBuilder {
  constructor(initial = 2048) {
    this.capacity = initial;
    this.positions = new Float32Array(this.capacity * 3);
    this.tiles = new Float32Array(this.capacity);
    /** Corner offsets (0 or 16) of this vertex inside its texture tile. */
    this.uvs = new Uint8Array(this.capacity * 2);
    this.lights = new Float32Array(this.capacity);
    this.vertices = 0;
    this.indexCapacity = initial * 2;
    this.indices = new Uint16Array(this.indexCapacity);
    this.indexCount = 0;
    this.minX = Infinity; this.minY = Infinity; this.minZ = Infinity;
    this.maxX = -Infinity; this.maxY = -Infinity; this.maxZ = -Infinity;
  }

  #grow() {
    const cap = this.capacity * 2;
    const p = new Float32Array(cap * 3); p.set(this.positions); this.positions = p;
    const t = new Float32Array(cap); t.set(this.tiles); this.tiles = t;
    const u = new Uint8Array(cap * 2); u.set(this.uvs); this.uvs = u;
    const l = new Float32Array(cap); l.set(this.lights); this.lights = l;
    this.capacity = cap;
  }

  #growIndices() {
    const cap = this.indexCapacity * 2;
    const i = new Uint16Array(cap); i.set(this.indices); this.indices = i;
    this.indexCapacity = cap;
  }

  /**
   * Adds four vertices + two triangles.
   * `uv` holds the per-corner tile offsets in 1/16 units, which is what the
   * vertex shader feeds to the texture sampler.
   */
  quad(vx, vy, vz, uv, tile, light, flip) {
    if (this.vertices + 4 > this.capacity) this.#grow();
    if (this.indexCount + 6 > this.indexCapacity) this.#growIndices();

    const base = this.vertices;
    for (let i = 0; i < 4; i++) {
      const v = base + i;
      this.positions[v * 3] = vx[i];
      this.positions[v * 3 + 1] = vy[i];
      this.positions[v * 3 + 2] = vz[i];
      this.tiles[v] = tile;
      this.uvs[v * 2] = uv[i * 2];
      this.uvs[v * 2 + 1] = uv[i * 2 + 1];
      this.lights[v] = light[i];
      if (vx[i] < this.minX) this.minX = vx[i];
      if (vy[i] < this.minY) this.minY = vy[i];
      if (vz[i] < this.minZ) this.minZ = vz[i];
      if (vx[i] > this.maxX) this.maxX = vx[i];
      if (vy[i] > this.maxY) this.maxY = vy[i];
      if (vz[i] > this.maxZ) this.maxZ = vz[i];
    }
    this.vertices += 4;

    const n = this.indexCount;
    if (flip) {
      this.indices[n] = base + 1; this.indices[n + 1] = base + 2; this.indices[n + 2] = base + 3;
      this.indices[n + 3] = base + 1; this.indices[n + 4] = base + 3; this.indices[n + 5] = base;
    } else {
      this.indices[n] = base; this.indices[n + 1] = base + 1; this.indices[n + 2] = base + 2;
      this.indices[n + 3] = base; this.indices[n + 4] = base + 2; this.indices[n + 5] = base + 3;
    }
    this.indexCount += 6;
  }

  finish() {
    const v = this.vertices;
    const lights = new Uint8Array(v);
    for (let i = 0; i < v; i++) {
      const value = this.lights[i];
      lights[i] = value <= 0 ? 0 : value >= 1 ? 255 : Math.round(value * 255);
    }
    // AABB in chunk-local block units (y already absolute), for frustum culling.
    let bounds = null;
    if (v > 0) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < v; i++) {
        // Positions are stored in 1/16-block units.
        const x = this.positions[i * 3] / 16;
        const y = this.positions[i * 3 + 1] / 16;
        const z = this.positions[i * 3 + 2] / 16;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
      bounds = [minX, minY, minZ, maxX, maxY, maxZ];
    }
    return {
      positions: this.positions.slice(0, v * 3),
      tiles: this.tiles.slice(0, v),
      uvs: this.uvs.slice(0, v * 2),
      lights,
      indices: this.indices.slice(0, this.indexCount),
      vertexCount: v,
      indexCount: this.indexCount,
      bounds,
    };
  }
}

const FACE_NORMALS_PAD = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * Light propagation queue: 16 buckets (one per light level) of fixed-capacity
 * ring buffers. Overflow simply drops the entry, which can only cost a little
 * smoothness, never correctness of the level values themselves.
 */
const QUEUE_CAP = 1 << 16;
const LIGHT_QUEUES = [];
for (let level = 0; level < 16; level++) {
  LIGHT_QUEUES.push({ data: new Int32Array(QUEUE_CAP), head: 0, tail: 0, count: 0 });
}

function queueClear() {
  for (let i = 0; i < 16; i++) {
    const q = LIGHT_QUEUES[i];
    q.head = 0; q.tail = 0; q.count = 0;
  }
}

function queuePush(level, idx) {
  const q = LIGHT_QUEUES[level];
  if (q.count >= QUEUE_CAP) return;
  q.data[q.tail] = idx;
  q.tail = (q.tail + 1) & (QUEUE_CAP - 1);
  q.count++;
}

function queuePop(level) {
  const q = LIGHT_QUEUES[level];
  if (q.count === 0) return -1;
  const value = q.data[q.head];
  q.head = (q.head + 1) & (QUEUE_CAP - 1);
  q.count--;
  return value;
}

/** Runs one BFS over the light grid, visiting the brightest cells first. */
function floodFill(pad, light) {
  for (let level = 15; level >= 2; level--) {
    let idx;
    while ((idx = queuePop(level)) !== -1) {
      if (light[idx] < level) continue; // superseded by a brighter write
      const y = Math.floor(idx / PAD_AREA);
      const rem = idx - y * PAD_AREA;
      const pz = Math.floor(rem / PAD_W);
      const px = rem - pz * PAD_W;
      for (let d = 0; d < 6; d++) {
        const n = FACE_NORMALS_PAD[d];
        const nx = px + n[0], ny = y + n[1], nz = pz + n[2];
        if (nx < 0 || nz < 0 || nx >= PAD_W || nz >= PAD_W || ny < 0 || ny >= WORLD_HEIGHT) continue;
        const nIdx = padIndex(nx, ny, nz);
        const target = level - 1 - FILTER[pad[nIdx]];
        if (target > light[nIdx]) {
          light[nIdx] = target;
          if (target > 1) queuePush(target, nIdx);
        }
      }
    }
  }
}

/** Column-wise skylight falloff from the top of the world, then a horizontal flood fill. */
function computeSkyLight(pad, light) {
  light.fill(0);
  queueClear();
  for (let pz = 0; pz < PAD_W; pz++) {
    for (let px = 0; px < PAD_W; px++) {
      let level = 15;
      const interior = px >= 1 && px < PAD_W - 1 && pz >= 1 && pz < PAD_W - 1;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const idx = padIndex(px, y, pz);
        level -= FILTER[pad[idx]];
        if (level < 0) level = 0;
        light[idx] = level;
        // Seed the flood fill from the vertical shafts inside this chunk; the
        // border columns only need to propagate inwards.
        if (level > 1 && interior) queuePush(level, idx);
      }
    }
  }
  floodFill(pad, light);
}

/** Block light from torches, glowstone and lava, written into `out`. */
function computeBlockLight(pad, out) {
  out.fill(0);
  queueClear();
  for (let pz = 0; pz < PAD_W; pz++) {
    for (let px = 0; px < PAD_W; px++) {
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const e = EMISSION[pad[padIndex(px, y, pz)]];
        if (e > 0) {
          const idx = padIndex(px, y, pz);
          out[idx] = e;
          queuePush(e, idx);
        }
      }
    }
  }
  floodFill(pad, out);
}

/** Copies a chunk column plus its four neighbours' edge columns into the padded buffer. */
function buildPad(blocks, neighbours, out) {
  out.fill(0);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        out[padIndex(lx + PAD, y, lz + PAD)] = blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
      }
    }
  }
  for (const side of neighbours ?? []) {
    const data = side.blocks;
    if (!data) continue;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let i = 0; i < CHUNK_SIZE; i++) {
        let px, pz, src;
        if (side.dir === 0) {          // east neighbour: its x = 0, z = i
          px = PAD + CHUNK_SIZE; pz = PAD + i;
          src = (y * CHUNK_SIZE + i) * CHUNK_SIZE + 0;
        } else if (side.dir === 1) {   // west neighbour: its x = 15, z = i
          px = 0; pz = PAD + i;
          src = (y * CHUNK_SIZE + i) * CHUNK_SIZE + (CHUNK_SIZE - 1);
        } else if (side.dir === 4) {   // south neighbour: its z = 0, x = i
          px = PAD + i; pz = PAD + CHUNK_SIZE;
          src = (y * CHUNK_SIZE + 0) * CHUNK_SIZE + i;
        } else {                       // north neighbour: its z = 15, x = i
          px = PAD + i; pz = 0;
          src = (y * CHUNK_SIZE + (CHUNK_SIZE - 1)) * CHUNK_SIZE + i;
        }
        out[padIndex(px, y, pz)] = data[src];
      }
    }
  }
}

const padBlocks = new Uint8Array(PAD_AREA * WORLD_HEIGHT);
const padSky = new Uint8Array(PAD_AREA * WORLD_HEIGHT);
const padLight = new Uint8Array(PAD_AREA * WORLD_HEIGHT);

const isOpaqueBlock = (id) => FILTER[id] >= 15;

/** Light level used for shading: the stronger of skylight and block light. */
function lightAt(idx) {
  return padSky[idx] > padLight[idx] ? padSky[idx] : padLight[idx];
}

/** Decides whether the face of `id` towards direction `f` is visible. */
function shouldDrawFace(px, y, pz, f, id) {
  const n = FACE_NORMALS_PAD[f];
  const ny = y + n[1];
  if (ny < 0 || ny >= WORLD_HEIGHT) return true;
  const nid = padBlocks[padIndex(clampPx(px + n[0]), ny, clampPx(pz + n[2]))];
  if (nid === id && (id === ID.WATER || id === ID.GLASS || id === ID.ICE)) return false;
  if (id === ID.WATER && nid !== 0) return false;
  return !isOpaqueBlock(nid);
}

/**
 * Emits one block face.
 *
 * Positions are written in 1/16-block units. That matters: the fragment shader
 * derives the in-tile texture coordinate from the fractional part of the
 * position, and block corners only have a fractional part once the face is
 * finer than one block unit (which is also what water surfaces and slabs need).
 */
function emitFace(builder, face, id, lx, ly, lz, px, y, pz, waterSurface) {
  const tile = BLOCK_FACES[id]?.[face.face] ?? 0;
  const normal = face.normal;
  const [t1, t2] = TANGENTS[face.face];
  const vx = new Array(4), vy = new Array(4), vz = new Array(4);
  const uv = new Array(8);
  const light = new Array(4);

  const airY = clampY(y + normal[1]);
  const airIdx = padIndex(clampPx(px + normal[0]), airY, clampPx(pz + normal[2]));
  const airLight = lightAt(airIdx);

  for (let i = 0; i < 4; i++) {
    const c16 = face.corners[i];

    // Water surfaces sit 2/16 below a full block.
    let y16 = c16[1];
    if (waterSurface && normal[1] > 0) y16 -= 2;
    else if (waterSurface && normal[1] === 0 && c16[1] === 16) y16 -= 2;

    vx[i] = lx * 16 + c16[0];
    vy[i] = ly * 16 + y16;
    vz[i] = lz * 16 + c16[2];
    // Per-corner offset inside the tile, 0..16 (1/16 of the tile).
    uv[i * 2] = c16[face.uAxis];
    uv[i * 2 + 1] = 16 - c16[face.vAxis];

    // Three-sample ambient occlusion: two axis neighbours plus the diagonal.
    const d = face.diag[i];
    const s1 = axisSign(d, t1[0] ? 0 : t1[1] ? 1 : 2);
    const s2 = axisSign(d, t2[0] ? 0 : t2[1] ? 1 : 2);
    const nb = (ox, oy, oz) => {
      const ny = y + oy;
      if (ny < 0 || ny >= WORLD_HEIGHT) return false;
      return isOpaqueBlock(padBlocks[padIndex(clampPx(px + ox), ny, clampPx(pz + oz))]);
    };
    const side1 = nb(normal[0] + t1[0] * s1, normal[1] + t1[1] * s1, normal[2] + t1[2] * s1);
    const side2 = nb(normal[0] + t2[0] * s2, normal[1] + t2[1] * s2, normal[2] + t2[2] * s2);
    const corner_ = nb(d[0], d[1], d[2]);
    const occluders = (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner_ ? 1 : 0);
    const ao = occluders >= 3 ? 0.45 : occluders === 2 ? (side1 && side2 ? 0.45 : 0.66) : occluders === 1 ? 0.85 : 1;

    // Diagonal light sampling for a smooth gradient across the quad.
    const dIdx = padIndex(clampPx(px + d[0]), clampY(y + d[1]), clampPx(pz + d[2]));
    const diagonal = lightAt(dIdx);
    const level = airLight * 0.62 + diagonal * 0.38;
    const brightness = 0.05 + 0.95 * (level / 15);

    let value = face.shade * ao * brightness;
    if (id === ID.LAVA || id === ID.GLOWSTONE) value = Math.max(value, 0.95);
    light[i] = value > 1 ? 1 : value;
  }

  // Rotate the split direction so the darker pair of corners gets the shared edge.
  const flip = light[0] + light[2] < light[1] + light[3];
  builder.quad(vx, vy, vz, uv, tile, light, flip);
}

/** Two crossed quads for grass, flowers, saplings, torches and rails. */
function emitCross(builder, id, lx, ly, lz, idx) {
  const tile = id === ID.SHORT_GRASS
    ? (BLOCK_FACES[ID.SHORT_GRASS]?.[2] ?? 0)
    : (BLOCK_FACES[id]?.[2] ?? 0);
  const level = lightAt(idx) / 15;
  const brightness = 0.07 + 0.93 * level;
  const light = [brightness * 0.92, brightness * 0.92, brightness, brightness];
  // Everything here is in 1/16-block units, matching emitFace.
  const bx = lx * 16, by = ly * 16, bz = lz * 16;

  if (id === ID.RAIL) {
    const y = by + 1;
    builder.quad(
      [bx, bx + 16, bx + 16, bx], [y, y, y, y], [bz, bz, bz + 16, bz + 16],
      [0, 0, 16, 0, 16, 16, 0, 16], tile, light, false,
    );
    return;
  }

  const isTorch = id === ID.TORCH;
  const x0 = isTorch ? 7 : 0;
  const x1 = isTorch ? 9 : 16;
  const top = isTorch ? 10 : 16;
  const uv = [0, top, 16, top, 16, 0, 0, 0];

  // Quad A along the (+,+) diagonal, quad B along the (+,-) diagonal.
  const a = [
    [bx + x0, by + top, bz + x1], [bx + x1, by + top, bz + x0],
    [bx + x1, by, bz + x0], [bx + x0, by, bz + x1],
  ];
  const b = [
    [bx + x1, by + top, bz + x1], [bx + x0, by + top, bz + x0],
    [bx + x0, by, bz + x0], [bx + x1, by, bz + x1],
  ];
  emitDoubleSided(builder, a, uv, tile, light);
  emitDoubleSided(builder, b, uv, tile, light);
}

function emitDoubleSided(builder, verts, uv, tile, light) {
  builder.quad(
    [verts[0][0], verts[1][0], verts[2][0], verts[3][0]],
    [verts[0][1], verts[1][1], verts[2][1], verts[3][1]],
    [verts[0][2], verts[1][2], verts[2][2], verts[3][2]],
    uv, tile, light, false,
  );
  // For the back face the horizontal texture axis is mirrored.
  const ruv = [16 - uv[6], uv[7], 16 - uv[4], uv[5], 16 - uv[2], uv[3], 16 - uv[0], uv[1]];
  builder.quad(
    [verts[3][0], verts[2][0], verts[1][0], verts[0][0]],
    [verts[3][1], verts[2][1], verts[1][1], verts[0][1]],
    [verts[3][2], verts[2][2], verts[1][2], verts[0][2]],
    ruv, tile, light, false,
  );
}

/**
 * Builds the two draw passes for one 16-block-tall section of a chunk.
 * `blocks` is the full chunk column, `neighbours` supplies the four edge columns.
 */
function meshSection(cx, cz, section, blocks, neighbours) {
  buildPad(blocks, neighbours, padBlocks);
  computeSkyLight(padBlocks, padSky);
  computeBlockLight(padBlocks, padLight);

  const solid = new MeshBuilder();
  const cutout = new MeshBuilder();
  const y0 = section * SECTION_HEIGHT;
  const y1 = Math.min(y0 + SECTION_HEIGHT, WORLD_HEIGHT);

  for (let y = y0; y < y1; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const px = lx + PAD, pz = lz + PAD;
        const idx = padIndex(px, y, pz);
        const id = padBlocks[idx];
        if (id === 0) continue;

        const ly = y - y0;
        if (PLANTS.has(id)) {
          emitCross(cutout, id, lx, ly, lz, idx);
          continue;
        }

        const builder = (isLeaves(id) || id === ID.GLASS || id === ID.ICE) ? cutout : solid;
        const waterSurface = isWater(id) && padBlocks[padIndex(px, clampY(y + 1), pz)] !== ID.WATER;
        for (let f = 0; f < 6; f++) {
          if (!shouldDrawFace(px, y, pz, f, id)) continue;
          emitFace(builder, FACES[f], id, lx, ly, lz, px, y, pz, waterSurface);
        }
      }
    }
  }

  const opaque = solid.finish();
  const cut = cutout.finish();
  const empty = opaque.vertexCount === 0 && cut.vertexCount === 0;

  return {
    cx, cz, section,
    opaque,
    cutout: cut,
    empty,
    opaqueBounds: opaque.vertexCount
      ? [opaque.bounds[0], y0 + opaque.bounds[1], opaque.bounds[2], opaque.bounds[3], y0 + opaque.bounds[4], opaque.bounds[5]]
      : null,
    cutoutBounds: cut.vertexCount
      ? [cut.bounds[0], y0 + cut.bounds[1], cut.bounds[2], cut.bounds[3], y0 + cut.bounds[4], cut.bounds[5]]
      : null,
  };
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

/** One generator instance, created on demand from a seed. */
let generator = null;

/** Set once the first mesh has been reported, for the boot diagnostics. */
let meshDebugSent = false;
/**
 * Generates one chunk column. Used directly by the world in single-threaded
 * mode, and by the classic worker wrapper below.
 */
function generateChunk(seed, cx, cz) {
  const normalizedSeed = seed >>> 0;
  if (!generator || generator.seed !== normalizedSeed) generator = new Generator(normalizedSeed);
  const blocks = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  generator.generate(cx, cz, blocks, heights, biomes);
  return { cx, cz, blocks, heights, biomes };
}

/** Classic-worker wrapper. Harmless when the bundle also runs on the main thread. */
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && !self.document) {
  self.onmessage = (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    try {
      if (msg.kind === 'gen') {
        const result = generateChunk(msg.seed, msg.cx, msg.cz);
        self.postMessage(
          { id: msg.id, kind: 'gen', ...result },
          [result.blocks.buffer, result.heights.buffer, result.biomes.buffer],
        );
        return;
      }
      if (msg.kind === 'mesh') {
        const result = meshSection(msg.cx, msg.cz, msg.section, msg.blocks, msg.neighbours);
        const transfer = [];
        for (const part of [result.opaque, result.cutout]) {
          transfer.push(part.positions.buffer, part.tiles.buffer, part.uvs.buffer, part.lights.buffer, part.indices.buffer);
        }
        self.postMessage({ id: msg.id, kind: 'mesh', result }, transfer);
      }
    } catch (err) {
      self.postMessage({ id: msg.id, kind: 'error', context: msg.kind, message: String((err && err.stack) || err) });
    }
  };
}

export {
  Generator, meshSection, generateChunk, MeshBuilder, FACES,
  padBlocks, padSky, padLight,
};
