/**
 * GENERATED FILE - do not edit by hand.
 * Produced by tools/build.mjs from the modules listed there.
 */

/* Standalone bundle: runs from file:// and from GitHub Pages. */
window.__mc = window.__mc || {};
var __mc = window.__mc;

/* ---- src/core/math.js ---------------------------------------------------- */
(function (G) {
  /**
   * Small, dependency-free math helpers shared by the main thread and the
   * world-generation worker. Matrices are column-major Float32Array(16),
   * matching the layout WebGL expects for `uniformMatrix4fv`.
   */

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Smooth hermite interpolation, used for camera/entity easing. */
  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  /** Positive modulo, the flavour used by Minecraft-style chunk coordinates. */
  function floorMod(a, n) {
    return a - Math.floor(a / n) * n;
  }

  /** Floors a value to an integer. Kept as a function so call sites read alike. */
  function floorDiv(a, n) {
    return Math.floor(a / n);
  }

  function dist2(ax, ay, az, bx, by, bz) {
    const dx = ax - bx, dy = ay - by, dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
  }

  /* ------------------------------------------------------------------ *
   * Matrices
   * ------------------------------------------------------------------ */

  function mat4() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  function mat4Identity(out) {
    out.fill(0);
    out[0] = out[5] = out[10] = out[15] = 1;
    return out;
  }

  function mat4Perspective(out, fovYRad, aspect, near, far) {
    const f = 1 / Math.tan(fovYRad / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  }

  function mat4Ortho(out, left, right, bottom, top, near, far) {
    out.fill(0);
    out[0] = 2 / (right - left);
    out[5] = 2 / (top - bottom);
    out[10] = -2 / (far - near);
    out[12] = -(right + left) / (right - left);
    out[13] = -(top + bottom) / (top - bottom);
    out[14] = -(far + near) / (far - near);
    out[15] = 1;
    return out;
  }

  /**
   * Builds a view matrix from a yaw/pitch camera at `pos`.
   * yaw is rotation around +Y (0 = looking toward -Z), pitch is rotation around +X.
   */
  function mat4ViewFromEuler(out, px, py, pz, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);

    // Camera basis: forward = (-sy*cp, sp, -cy*cp)
    const fx = -sy * cp, fy = sp, fz = -cy * cp;
    // right = normalize(cross(forward, up))
    const rx = cy, ry = 0, rz = -sy;
    // up = cross(right, forward)
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * px + ry * py + rz * pz);
    out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * px + uy * py + uz * pz);
    out[2] = -fx; out[6] = -fy; out[10] = -fz; out[14] = fx * px + fy * py + fz * pz;
    out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
    return out;
  }

  function mat4Mul(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  }

  function mat4Translate(out, x, y, z) {
    mat4Identity(out);
    out[12] = x; out[13] = y; out[14] = z;
    return out;
  }

  function mat4RotateY(out, rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    mat4Identity(out);
    out[0] = c; out[2] = -s;
    out[8] = s; out[10] = c;
    return out;
  }

  function mat4Scale(out, x, y, z) {
    mat4Identity(out);
    out[0] = x; out[5] = y; out[10] = z;
    return out;
  }

  /** Composes T * Ry * S 鈥?the transform used for every entity box. */
  function mat4TRS(out, tx, ty, tz, yawRad, sx, sy, sz) {
    const c = Math.cos(yawRad), s = Math.sin(yawRad);
    out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0;
    out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
    out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0;
    out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Visibility
   * ------------------------------------------------------------------ */

  /**
   * Decides whether a section of the world can be skipped this frame.
   *
   * This deliberately avoids a frustum-plane test. Deriving the six planes from a
   * view-projection matrix is easy to get subtly wrong, and one plane with a
   * flipped normal silently deletes a whole slice of the world while the image
   * still looks plausible. Two obvious checks are used instead: a hard distance
   * limit, and a "clearly behind the camera" rejection that only applies beyond a
   * safe radius. Both err toward drawing too much rather than too little.
   *
   * @param {{x:number,y:number,z:number}} camera eye position
   * @param {number[]} forward camera forward unit vector
   * @param {number} centreX section centre
   * @param {number} centreY
   * @param {number} centreZ
   * @param {number} radius half the section diagonal
   * @param {number} maxDistance draw distance in blocks
   */
  function sectionVisible(camera, forward, centreX, centreY, centreZ, radius, maxDistance) {
    const dx = centreX - camera.x;
    const dy = centreY - camera.y;
    const dz = centreZ - camera.z;
    const distance = Math.hypot(dx, dy, dz);

    // Outside the draw distance, allowing for the section's own extent.
    if (distance - radius > maxDistance) return false;

    // Never cull anything close: turning around must not reveal a hole.
    if (distance < radius + 24) return true;

    const along = dx * forward[0] + dy * forward[1] + dz * forward[2];
    if (along < -radius) return false;

    const lateral = Math.hypot(
      dx - along * forward[0],
      dy - along * forward[1],
      dz - along * forward[2],
    );
    // A generous cone: about 58 degrees half-angle, plus slack for section size.
    return lateral < Math.abs(along) * 1.6 + radius + 16;
  }

  /* ------------------------------------------------------------------ *
   * Random
   * ------------------------------------------------------------------ */

  /** mulberry32 鈥?small, fast, seedable PRNG. Returns floats in [0,1). */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Hashes three integers into a uniform float in [0,1). Stable across runs. */
  function hash3(x, y, z, seed = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1013904223);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  G["clamp"] = clamp;
  G["lerp"] = lerp;
  G["smoothstep"] = smoothstep;
  G["mod"] = mod;
  G["floorMod"] = floorMod;
  G["floorDiv"] = floorDiv;
  G["dist2"] = dist2;
  G["mat4"] = mat4;
  G["mat4Identity"] = mat4Identity;
  G["mat4Perspective"] = mat4Perspective;
  G["mat4Ortho"] = mat4Ortho;
  G["mat4ViewFromEuler"] = mat4ViewFromEuler;
  G["mat4Mul"] = mat4Mul;
  G["mat4Translate"] = mat4Translate;
  G["mat4RotateY"] = mat4RotateY;
  G["mat4Scale"] = mat4Scale;
  G["mat4TRS"] = mat4TRS;
  G["sectionVisible"] = sectionVisible;
  G["mulberry32"] = mulberry32;
  G["hash3"] = hash3;
  G["DEG2RAD"] = DEG2RAD;
  G["RAD2DEG"] = RAD2DEG;
  G["TAU"] = TAU;
})(__mc);

/* ---- src/world/blocks-worker.js ------------------------------------------ */
(function (G) {
  /**
   * Numeric block ids mirrored from src/world/blocks.js.
   *
   * This file exists so the world generator / mesher worker can run without
   * importing the DOM-touching block registry. Keep the ids in sync with the
   * `BLOCK` export there; only the ids the generator actually places are listed.
   */
  const ID = {
    AIR: 0,
    STONE: 1,
    GRASS_BLOCK: 2,
    DIRT: 3,
    COBBLESTONE: 4,
    OAK_PLANKS: 5,
    BEDROCK: 6,
    WATER: 7,
    SAND: 8,
    GRAVEL: 9,
    OAK_LOG: 10,
    OAK_LEAVES: 11,
    SANDSTONE: 12,
    COAL_ORE: 13,
    IRON_ORE: 14,
    GOLD_ORE: 15,
    DIAMOND_ORE: 16,
    REDSTONE_ORE: 17,
    EMERALD_ORE: 18,
    GLASS: 19,
    ICE: 23,
    CACTUS: 24,
    PUMPKIN: 25,
    GLOWSTONE: 26,
    TORCH: 27,
    OBSIDIAN: 31,
    NETHERRACK: 32,
    CLAY: 44,
    SUGAR_CANE: 45,
    DEAD_BUSH: 46,
    SPRUCE_LOG: 48,
    SPRUCE_LEAVES: 50,
    BIRCH_LOG: 51,
    BIRCH_LEAVES: 53,
    DANDELION: 54,
    POPPY: 55,
    SPRUCE_SAPLING: 56,
    SHORT_GRASS: 57,
  };

  G["ID"] = ID;
})(__mc);

/* ---- src/world/tile-manifest.js ------------------------------------------ */
(function (G) {
  /**
   * GENERATED FILE — do not edit by hand.
   * Produced by tools/gen-tile-manifest.mjs from
   * src/render/textures.js (tile order) and src/world/blocks.js (face mapping).
   *
   * Tile ids are 1-based and follow TEXTURE_NAMES order; the atlas is row-major:
   *   index = id - 1, col = index % atlasCols, row = floor(index / atlasCols)
   */
  const atlasCols = 16;
  const atlasRows = 32;

  const tileNames = ["stone","dirt","grass_top","grass_side","cobblestone","sand","sandstone_top","sandstone_side","gravel","oak_log_side","oak_log_top","oak_planks","oak_leaves","water","bedrock","coal_ore","iron_ore","gold_ore","diamond_ore","redstone_ore","emerald_ore","bricks","stone_bricks","glass","snow","ice","cactus_side","cactus_top","pumpkin_side","pumpkin_top","pumpkin_face","crafting_table_top","crafting_table_side","furnace_side","furnace_front","furnace_top","bookshelf","obsidian","netherrack","glowstone","torch","tnt_side","tnt_top","wool_white","sponge","diamond_block","gold_block","iron_block","coal_block","farmland","grass_path","lava","mycelium_top","podzol_top","clay","sugar_cane","dead_bush","rail","dandelion","poppy"];

  const tileIds = {"stone":1,"dirt":2,"grass_top":3,"grass_side":4,"cobblestone":5,"sand":6,"sandstone_top":7,"sandstone_side":8,"gravel":9,"oak_log_side":10,"oak_log_top":11,"oak_planks":12,"oak_leaves":13,"water":14,"bedrock":15,"coal_ore":16,"iron_ore":17,"gold_ore":18,"diamond_ore":19,"redstone_ore":20,"emerald_ore":21,"bricks":22,"stone_bricks":23,"glass":24,"snow":25,"ice":26,"cactus_side":27,"cactus_top":28,"pumpkin_side":29,"pumpkin_top":30,"pumpkin_face":31,"crafting_table_top":32,"crafting_table_side":33,"furnace_side":34,"furnace_front":35,"furnace_top":36,"bookshelf":37,"obsidian":38,"netherrack":39,"glowstone":40,"torch":41,"tnt_side":42,"tnt_top":43,"wool_white":44,"sponge":45,"diamond_block":46,"gold_block":47,"iron_block":48,"coal_block":49,"farmland":50,"grass_path":51,"lava":52,"mycelium_top":53,"podzol_top":54,"clay":55,"sugar_cane":56,"dead_bush":57,"rail":58,"dandelion":59,"poppy":60};

  /** Fallbacks used for texture names textures.js does not paint. */
  const aliases = {};

  /** blockFaces[blockId] = [ +X, -X, +Y, -Y, +Z, -Z ] tile ids */
  const blockFaces = [[1,1,1,1,1,1],[1,1,1,1,1,1],[4,4,3,2,4,4],[2,2,2,2,2,2],[5,5,5,5,5,5],[12,12,12,12,12,12],[15,15,15,15,15,15],[14,14,14,14,14,14],[6,6,6,6,6,6],[9,9,9,9,9,9],[10,10,11,11,10,10],[13,13,13,13,13,13],[8,8,7,7,8,8],[16,16,16,16,16,16],[17,17,17,17,17,17],[18,18,18,18,18,18],[19,19,19,19,19,19],[20,20,20,20,20,20],[21,21,21,21,21,21],[24,24,24,24,24,24],[22,22,22,22,22,22],[23,23,23,23,23,23],[25,25,25,25,25,25],[26,26,26,26,26,26],[27,27,28,28,27,27],[29,29,30,30,29,29],[40,40,40,40,40,40],[41,41,41,41,41,41],[33,33,32,12,33,33],[34,34,36,36,34,34],[37,37,37,37,37,37],[38,38,38,38,38,38],[39,39,39,39,39,39],[42,42,43,43,42,42],[44,44,44,44,44,44],[46,46,46,46,46,46],[47,47,47,47,47,47],[48,48,48,48,48,48],[49,49,49,49,49,49],[50,50,50,50,50,50],[51,51,51,51,51,51],[52,52,52,52,52,52],[53,53,53,2,53,53],[2,2,54,2,2,2],[55,55,55,55,55,55],[56,56,56,56,56,56],[57,57,57,57,57,57],[58,58,58,58,58,58],[10,10,11,11,10,10],[12,12,12,12,12,12],[13,13,13,13,13,13],[10,10,11,11,10,10],[12,12,12,12,12,12],[13,13,13,13,13,13],[59,59,59,59,59,59],[60,60,60,60,60,60],[13,13,13,13,13,13],[3,3,3,3,3,3],[1,1,1,1,1,1]];

  const __default = { atlasCols, atlasRows, tileNames, tileIds, aliases, blockFaces };

  G["default"] = __default;
  G["atlasCols"] = atlasCols;
  G["atlasRows"] = atlasRows;
  G["tileNames"] = tileNames;
  G["tileIds"] = tileIds;
  G["aliases"] = aliases;
  G["blockFaces"] = blockFaces;
})(__mc);

/* ---- src/world/constants.js ---------------------------------------------- */
(function (G) {
  /** Shared world constants. Imported by both the main thread and the worker. */

  const CHUNK_SIZE = 16;          // X and Z extent of a chunk
  const WORLD_HEIGHT = 128;       // Y extent of the world
  const SECTION_HEIGHT = 16;      // Y extent of one render section
  const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT;
  const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

  const SEA_LEVEL = 64;
  const MAX_LIGHT = 15;

  /** Index of a block inside a chunk-local (x, y, z) triple. */
  function chunkIndex(x, y, z) {
    return (y << 8) | (z << 4) | x;
  }

  /* ---- Packed vertex layout (one uint32 per vertex) ------------------- *
   *  bits  0..5   x   (0..63, 1/16 block units)
   *  bits  6..11  y   (0..63, 1/16 block units)
   *  bits 12..17  z   (0..63, 1/16 block units)
   *  bits 18..27  u   (0..1023, 1/64 texel units)
   *  bits 28..33 (split across two words? no) -- see below
   *
   * 32 bits is not enough for 18 bits of position + 16 bits of UV + 8 bits of
   * light + face id, so the layout packs UV at 1/32 resolution:
   *  bits  0..5   x
   *  bits  6..11  y
   *  bits 12..17  z
   *  bits 18..22  u low  (5 bits)  -> combined with the tile origin in the shader
   *  ...
   *
   * To keep the shader simple and the data exact, positions use 1/16 units and
   * a tile's UV is expressed as (tile % 16, tile / 16) integer atlas coords that
   * the shader multiplies by 1/16. The per-vertex "corner" (0 or 1 in each axis)
   * is therefore derivable from the low bit of x/y/z, so UV does not need to be
   * stored at all: the shader reconstructs corner offsets from the position
   * fracture. See the vertex shader in src/render/shaders.js.
   */
  const VERTEX_STRIDE_BYTES = 4;

  /* ---- Worker message kinds ----------------------------------------- */
  const MSG = {
    INIT: 'init',
    GEN_RESULT: 'genResult',
    MESH_RESULT: 'meshResult',
    ERROR: 'error',
  };

  G["chunkIndex"] = chunkIndex;
  G["CHUNK_SIZE"] = CHUNK_SIZE;
  G["WORLD_HEIGHT"] = WORLD_HEIGHT;
  G["SECTION_HEIGHT"] = SECTION_HEIGHT;
  G["SECTION_COUNT"] = SECTION_COUNT;
  G["CHUNK_VOLUME"] = CHUNK_VOLUME;
  G["SEA_LEVEL"] = SEA_LEVEL;
  G["MAX_LIGHT"] = MAX_LIGHT;
  G["VERTEX_STRIDE_BYTES"] = VERTEX_STRIDE_BYTES;
  G["MSG"] = MSG;
})(__mc);

/* ---- src/world/noise.js -------------------------------------------------- */
(function (G) {
  /**
   * Seeded gradient (Perlin-style) noise with fractal helpers.
   * Dependency-free and deterministic: the same seed always produces the same world.
   */

  function makePermutation(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates driven by a small xorshift PRNG.
    let s = (seed >>> 0) || 1;
    const rand = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      permMod12[i] = perm[i] % 12;
    }
    return { perm, permMod12 };
  }

  const GRAD3 = new Float32Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  ]);

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  class Noise {
    constructor(seed) {
      const { perm, permMod12 } = makePermutation(seed);
      this.perm = perm;
      this.permMod12 = permMod12;
    }

    /** 2D gradient noise in roughly [-1, 1]. */
    noise2(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const v = fade(yf);

      const aa = this.perm[X + this.perm[Y]];
      const ab = this.perm[X + this.perm[Y + 1]];
      const ba = this.perm[X + 1 + this.perm[Y]];
      const bb = this.perm[X + 1 + this.perm[Y + 1]];

      const g = (h, dx, dy) => {
        const i = (h % 12) * 3;
        return GRAD3[i] * dx + GRAD3[i + 1] * dy;
      };

      const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
      const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
      return x1 + v * (x2 - x1);
    }

    /** 3D gradient noise in roughly [-1, 1]. */
    noise3(x, y, z) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const zf = z - Math.floor(z);
      const u = fade(xf), v = fade(yf), w = fade(zf);

      const A = this.perm[X] + Y, B = this.perm[X + 1] + Y;
      const aa = this.perm[A] + Z, ab = this.perm[A + 1] + Z;
      const ba = this.perm[B] + Z, bb = this.perm[B + 1] + Z;

      const g = (h, dx, dy, dz) => {
        const i = (h % 12) * 3;
        return GRAD3[i] * dx + GRAD3[i + 1] * dy + GRAD3[i + 2] * dz;
      };

      const lerp = (t, a, b) => a + t * (b - a);
      const x1 = lerp(u, g(aa, xf, yf, zf), g(ba, xf - 1, yf, zf));
      const x2 = lerp(u, g(ab, xf, yf - 1, zf), g(bb, xf - 1, yf - 1, zf));
      const y1 = lerp(v, x1, x2);
      const x3 = lerp(u, g(aa + 1, xf, yf, zf - 1), g(ba + 1, xf - 1, yf, zf - 1));
      const x4 = lerp(u, g(ab + 1, xf, yf - 1, zf - 1), g(bb + 1, xf - 1, yf - 1, zf - 1));
      const y2 = lerp(v, x3, x4);
      return lerp(w, y1, y2);
    }

    /** Fractal 2D noise: `octaves` layers, each half the amplitude and double the frequency. */
    fbm2(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.noise2(x * freq, y * freq);
        norm += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      return sum / norm;
    }

    /** Fractal 3D noise, used for caves and overhangs. */
    fbm3(x, y, z, octaves = 3, lacunarity = 2, persistence = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.noise3(x * freq, y * freq, z * freq);
        norm += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      return sum / norm;
    }

    /** Ridged multifractal — sharp creases, good for mountain ridges and cave tunnels. */
    ridged2(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        const n = 1 - Math.abs(this.noise2(x * freq, y * freq));
        sum += amp * n * n;
        norm += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      return sum / norm;
    }
  }

  G["Noise"] = Noise;
})(__mc);

/* ---- src/world/blocks.js ------------------------------------------------- */
(function (G) {
  /**
   * Block registry — the single source of truth for block ids, textures and
   * per-block behaviour. Imported by the renderer, the interaction code and the
   * HUD. The world generator worker keeps only a tiny mirror of the numeric ids
   * it needs (see src/world/blocks-worker.js) to stay free of DOM imports.
   */

  const RENDER_PASS = {
    OPAQUE: 0,
    CUTOUT: 1,   // alpha-tested (leaves, glass, plants)
    TRANSLUCENT: 2, // alpha-blended, drawn last (water, ice)
  };

  const BLOCK = {
    AIR: 0,
    STONE: 1,
    GRASS_BLOCK: 2,
    DIRT: 3,
    COBBLESTONE: 4,
    OAK_PLANKS: 5,
    BEDROCK: 6,
    WATER: 7,
    SAND: 8,
    GRAVEL: 9,
    OAK_LOG: 10,
    OAK_LEAVES: 11,
    SANDSTONE: 12,
    COAL_ORE: 13,
    IRON_ORE: 14,
    GOLD_ORE: 15,
    DIAMOND_ORE: 16,
    REDSTONE_ORE: 17,
    EMERALD_ORE: 18,
    GLASS: 19,
    BRICKS: 20,
    STONE_BRICKS: 21,
    SNOW_BLOCK: 22,
    ICE: 23,
    CACTUS: 24,
    PUMPKIN: 25,
    GLOWSTONE: 26,
    TORCH: 27,
    CRAFTING_TABLE: 28,
    FURNACE: 29,
    BOOKSHELF: 30,
    OBSIDIAN: 31,
    NETHERRACK: 32,
    TNT: 33,
    WOOL_WHITE: 34,
    DIAMOND_BLOCK: 35,
    GOLD_BLOCK: 36,
    IRON_BLOCK: 37,
    COAL_BLOCK: 38,
    FARMLAND: 39,
    GRASS_PATH: 40,
    LAVA: 41,
    MYCELIUM: 42,
    PODZOL: 43,
    CLAY: 44,
    SUGAR_CANE: 45,
    DEAD_BUSH: 46,
    RAIL: 47,
    SPRUCE_LOG: 48,
    SPRUCE_PLANKS: 49,
    SPRUCE_LEAVES: 50,
    BIRCH_LOG: 51,
    BIRCH_PLANKS: 52,
    BIRCH_LEAVES: 53,
    DANDELION: 54,
    POPPY: 55,
    SPRUCE_SAPLING: 56,
    SHORT_GRASS: 57,
    STONE_SLAB: 58,
  };

  const BLOCK_COUNT = 59;

  /** Texture atlas grid: 16 x 32 cells of 16 x 16 pixels = 256 x 512 pixels. */
  const ATLAS_COLS = 16;
  const ATLAS_ROWS = 32;

  /** Face order used by the mesher and the geometry tables: +X, -X, +Y, -Y, +Z, -Z. */
  const FACE = { EAST: 0, WEST: 1, TOP: 2, BOTTOM: 3, SOUTH: 4, NORTH: 5 };

  const FACE_NORMALS = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];

  /** Per-face brightness multipliers — stands in for real directional lighting. */
  const FACE_SHADE = [0.72, 0.72, 1.0, 0.5, 0.86, 0.86];

  /** Default sound group per block, used for dig/step/place sound selection. */
  const S = {
    STONE: 'stone', WOOD: 'wood', GRASS: 'grass', SAND: 'sand',
    GRAVEL: 'gravel', GLASS: 'glass', WOOL: 'wool',
  };

  /**
   * @typedef {Object} BlockDef
   * @property {number} id
   * @property {string} name         internal id, e.g. "grass_block"
   * @property {string} display      human label
   * @property {string[]|string} tex  one texture name, or per-face [+X,-X,+Y,-Y,+Z,-Z]
   * @property {string} [texTop]      sugar for {top: ...}
   * @property {string} [texSide]
   * @property {string} [texBottom]
   * @property {boolean} [solid]      participates in collision
   * @property {number} [height]      collision height (default 1; 0 = no collision)
   * @property {boolean} [opaque]     hides neighbouring faces and blocks light
   * @property {number} [light]       emitted light level 0..15
   * @property {number} [filter]      extra skylight attenuation 0..15
   * @property {number} [pass]        RENDER_PASS
   * @property {boolean} [cullSame]   faces between two of this block are hidden (glass/water/ice)
   * @property {boolean} [liquid]
   * @property {boolean} [plant]      flat cross-shaped geometry
   * @property {boolean} [fullBright] ignore lighting (liquids/lava)
   * @property {number} [hardness]    seconds-ish base break time
   * @property {string} [sound]
   * @property {number} [lightAtten]  how much light this block removes (default from opaque)
   */

  /** @type {BlockDef[]} */
  const BLOCKS = [];

  function def(id, name, display, tex, opts = {}) {
    const light = opts.light ?? 0;
    const opaque = opts.opaque ?? true;
    const d = {
      id,
      name,
      display,
      tex,
      solid: opts.solid ?? true,
      height: opts.height ?? 1,
      opaque,
      light,
      filter: opts.filter ?? (opaque ? 15 : 0),
      pass: opts.pass ?? RENDER_PASS.OPAQUE,
      cullSame: opts.cullSame ?? false,
      liquid: opts.liquid ?? false,
      plant: opts.plant ?? false,
      fullBright: opts.fullBright ?? false,
      hardness: opts.hardness ?? 1.5,
      sound: opts.sound ?? S.STONE,
      unbreakable: opts.unbreakable ?? false,
      gravity: opts.gravity ?? false,
      drop: opts.drop === undefined ? id : opts.drop,
      walkSound: opts.walkSound ?? opts.sound ?? S.STONE,
      tool: opts.tool ?? 'pickaxe',
    };
    if (opts.texTop || opts.texSide || opts.texBottom) {
      const side = opts.texSide ?? tex;
      d.tex = [side, side, opts.texTop ?? tex, opts.texBottom ?? tex, side, side];
    }
    BLOCKS[id] = d;
    return d;
  }

  /* --- 0..9 ---------------------------------------------------------- */
  def(BLOCK.AIR, 'air', '空气', 'stone', { solid: false, opaque: false, height: 0, filter: 0, pass: RENDER_PASS.CUTOUT });

  def(BLOCK.STONE, 'stone', '石头', 'stone', { hardness: 1.5 });

  def(BLOCK.GRASS_BLOCK, 'grass_block', '草方块', 'grass_side', {
    texTop: 'grass_top', texBottom: 'dirt', texSide: 'grass_side',
    hardness: 0.6, sound: S.GRASS, tool: 'shovel',
  });

  def(BLOCK.DIRT, 'dirt', '泥土', 'dirt', { hardness: 0.5, sound: S.GRAVEL, tool: 'shovel' });

  def(BLOCK.COBBLESTONE, 'cobblestone', '圆石', 'cobblestone', { hardness: 2.0 });

  def(BLOCK.OAK_PLANKS, 'oak_planks', '橡木木板', 'oak_planks', { hardness: 2.0, sound: S.WOOD, tool: 'axe' });

  def(BLOCK.BEDROCK, 'bedrock', '基岩', 'bedrock', { hardness: 999, unbreakable: true });

  def(BLOCK.WATER, 'water', '水', 'water', {
    solid: false, opaque: false, height: 0, filter: 1, liquid: true,
    pass: RENDER_PASS.TRANSLUCENT, cullSame: true, fullBright: true, hardness: 100, unbreakable: true,
  });

  def(BLOCK.SAND, 'sand', '沙子', 'sand', { hardness: 0.5, sound: S.SAND, gravity: true, tool: 'shovel' });

  def(BLOCK.GRAVEL, 'gravel', '砂砾', 'gravel', { hardness: 0.6, sound: S.GRAVEL, gravity: true, tool: 'shovel' });

  /* --- 10..19 -------------------------------------------------------- */
  def(BLOCK.OAK_LOG, 'oak_log', '橡木原木', 'oak_log_side', {
    texTop: 'oak_log_top', texBottom: 'oak_log_top', texSide: 'oak_log_side',
    hardness: 2.0, sound: S.WOOD, tool: 'axe',
  });

  def(BLOCK.OAK_LEAVES, 'oak_leaves', '橡树树叶', 'oak_leaves', {
    opaque: false, filter: 1, pass: RENDER_PASS.CUTOUT, hardness: 0.2,
    sound: S.GRASS, tool: 'shears',
  });

  def(BLOCK.SANDSTONE, 'sandstone', '砂岩', 'sandstone_side', {
    texTop: 'sandstone_top', texBottom: 'sandstone_top', texSide: 'sandstone_side',
    hardness: 0.8, sound: S.STONE,
  });

  def(BLOCK.COAL_ORE, 'coal_ore', '煤矿石', 'coal_ore', { hardness: 3.0 });
  def(BLOCK.IRON_ORE, 'iron_ore', '铁矿石', 'iron_ore', { hardness: 3.0 });
  def(BLOCK.GOLD_ORE, 'gold_ore', '金矿石', 'gold_ore', { hardness: 3.0 });
  def(BLOCK.DIAMOND_ORE, 'diamond_ore', '钻石矿石', 'diamond_ore', { hardness: 3.0 });
  def(BLOCK.REDSTONE_ORE, 'redstone_ore', '红石矿石', 'redstone_ore', { hardness: 3.0 });
  def(BLOCK.EMERALD_ORE, 'emerald_ore', '绿宝石矿石', 'emerald_ore', { hardness: 3.0 });

  def(BLOCK.GLASS, 'glass', '玻璃', 'glass', {
    opaque: false, pass: RENDER_PASS.CUTOUT, cullSame: true, hardness: 0.3, sound: S.GLASS,
  });

  /* --- 20..29 -------------------------------------------------------- */
  def(BLOCK.BRICKS, 'bricks', '砖块', 'bricks', { hardness: 2.0 });
  def(BLOCK.STONE_BRICKS, 'stone_bricks', '石砖', 'stone_bricks', { hardness: 2.0 });

  def(BLOCK.SNOW_BLOCK, 'snow_block', '雪块', 'snow', { hardness: 0.4, sound: S.SAND, tool: 'shovel' });

  def(BLOCK.ICE, 'ice', '冰', 'ice', {
    opaque: false, pass: RENDER_PASS.TRANSLUCENT, cullSame: true, hardness: 0.5, sound: S.GLASS,
  });

  def(BLOCK.CACTUS, 'cactus', '仙人掌', 'cactus_side', {
    texTop: 'cactus_top', texBottom: 'cactus_top', texSide: 'cactus_side',
    hardness: 0.4, sound: S.GRASS, height: 1, solid: false,
  });

  def(BLOCK.PUMPKIN, 'pumpkin', '南瓜', 'pumpkin_side', {
    texTop: 'pumpkin_top', texBottom: 'pumpkin_top', texSide: 'pumpkin_side',
    hardness: 1.0, sound: S.WOOD,
  });

  def(BLOCK.GLOWSTONE, 'glowstone', '荧石', 'glowstone', {
    light: 15, hardness: 0.3, sound: S.GLASS, fullBright: true,
  });

  def(BLOCK.TORCH, 'torch', '火把', 'torch', {
    solid: false, opaque: false, height: 0, plant: true, light: 14,
    pass: RENDER_PASS.CUTOUT, hardness: 0, sound: S.WOOD, tool: 'none',
  });

  def(BLOCK.CRAFTING_TABLE, 'crafting_table', '工作台', 'crafting_table_side', {
    texTop: 'crafting_table_top', texBottom: 'oak_planks', texSide: 'crafting_table_side',
    hardness: 2.5, sound: S.WOOD, tool: 'axe',
  });

  def(BLOCK.FURNACE, 'furnace', '熔炉', 'furnace_side', {
    texTop: 'furnace_top', texBottom: 'furnace_top', texSide: 'furnace_side',
    hardness: 3.5, tool: 'pickaxe',
  });

  /* --- 30..39 -------------------------------------------------------- */
  def(BLOCK.BOOKSHELF, 'bookshelf', '书架', 'bookshelf', { hardness: 1.5, sound: S.WOOD, tool: 'axe' });
  def(BLOCK.OBSIDIAN, 'obsidian', '黑曜石', 'obsidian', { hardness: 25 });
  def(BLOCK.NETHERRACK, 'netherrack', '地狱岩', 'netherrack', { hardness: 0.4 });
  def(BLOCK.TNT, 'tnt', 'TNT', 'tnt_side', {
    texTop: 'tnt_top', texBottom: 'tnt_top', texSide: 'tnt_side', hardness: 0, sound: S.GRASS,
  });
  def(BLOCK.WOOL_WHITE, 'wool_white', '白色羊毛', 'wool_white', { hardness: 0.8, sound: S.WOOL, tool: 'shears' });
  def(BLOCK.DIAMOND_BLOCK, 'diamond_block', '钻石块', 'diamond_block', { hardness: 5 });
  def(BLOCK.GOLD_BLOCK, 'gold_block', '金块', 'gold_block', { hardness: 3 });
  def(BLOCK.IRON_BLOCK, 'iron_block', '铁块', 'iron_block', { hardness: 5 });
  def(BLOCK.COAL_BLOCK, 'coal_block', '煤炭块', 'coal_block', { hardness: 5 });
  def(BLOCK.FARMLAND, 'farmland', '耕地', 'farmland', { hardness: 0.6, sound: S.GRAVEL, tool: 'shovel' });

  /* --- 40..49 -------------------------------------------------------- */
  def(BLOCK.GRASS_PATH, 'grass_path', '土径', 'grass_path', { hardness: 0.65, sound: S.GRASS, tool: 'shovel' });

  def(BLOCK.LAVA, 'lava', '岩浆', 'lava', {
    solid: false, opaque: false, height: 0, light: 15, liquid: true, fullBright: true,
    pass: RENDER_PASS.OPAQUE, cullSame: true, hardness: 100, unbreakable: true,
  });

  def(BLOCK.MYCELIUM, 'mycelium', '菌丝体', 'mycelium_top', {
    texTop: 'mycelium_top', texBottom: 'dirt', texSide: 'mycelium_top', hardness: 0.6, sound: S.GRASS, tool: 'shovel',
  });

  def(BLOCK.PODZOL, 'podzol', '灰化土', 'podzol_top', {
    texTop: 'podzol_top', texBottom: 'dirt', texSide: 'dirt', hardness: 0.6, sound: S.GRASS, tool: 'shovel',
  });

  def(BLOCK.CLAY, 'clay', '黏土', 'clay', { hardness: 0.6, sound: S.GRAVEL, tool: 'shovel' });

  def(BLOCK.SUGAR_CANE, 'sugar_cane', '甘蔗', 'sugar_cane', {
    solid: false, opaque: false, height: 0, plant: true,
    pass: RENDER_PASS.CUTOUT, hardness: 0, sound: S.GRASS, tool: 'none',
  });

  def(BLOCK.DEAD_BUSH, 'dead_bush', '枯萎的灌木', 'dead_bush', {
    solid: false, opaque: false, height: 0, plant: true,
    pass: RENDER_PASS.CUTOUT, hardness: 0, sound: S.GRASS, tool: 'none',
  });

  def(BLOCK.RAIL, 'rail', '铁轨', 'rail', {
    solid: false, opaque: false, height: 0, plant: true,
    pass: RENDER_PASS.CUTOUT, hardness: 0.7, sound: S.STONE, tool: 'pickaxe',
  });

  def(BLOCK.SPRUCE_LOG, 'spruce_log', '云杉原木', 'oak_log_side', {
    texTop: 'oak_log_top', texBottom: 'oak_log_top', texSide: 'oak_log_side',
    hardness: 2.0, sound: S.WOOD, tool: 'axe',
  });

  def(BLOCK.SPRUCE_PLANKS, 'spruce_planks', '云杉木板', 'oak_planks', { hardness: 2.0, sound: S.WOOD, tool: 'axe' });

  /* --- 50..58 -------------------------------------------------------- */
  def(BLOCK.SPRUCE_LEAVES, 'spruce_leaves', '云杉树叶', 'oak_leaves', {
    opaque: false, filter: 1, pass: RENDER_PASS.CUTOUT, hardness: 0.2, sound: S.GRASS, tool: 'shears',
  });

  def(BLOCK.BIRCH_LOG, 'birch_log', '白桦原木', 'oak_log_side', {
    texTop: 'oak_log_top', texBottom: 'oak_log_top', texSide: 'oak_log_side',
    hardness: 2.0, sound: S.WOOD, tool: 'axe',
  });

  def(BLOCK.BIRCH_PLANKS, 'birch_planks', '白桦木板', 'oak_planks', { hardness: 2.0, sound: S.WOOD, tool: 'axe' });

  def(BLOCK.BIRCH_LEAVES, 'birch_leaves', '白桦树叶', 'oak_leaves', {
    opaque: false, filter: 1, pass: RENDER_PASS.CUTOUT, hardness: 0.2, sound: S.GRASS, tool: 'shears',
  });

  def(BLOCK.DANDELION, 'dandelion', '蒲公英', 'dandelion', {
    solid: false, opaque: false, height: 0, plant: true,
    pass: RENDER_PASS.CUTOUT, hardness: 0, sound: S.GRASS, tool: 'none',
  });

  def(BLOCK.POPPY, 'poppy', '虞美人', 'poppy', {
    solid: false, opaque: false, height: 0, plant: true,
    pass: RENDER_PASS.CUTOUT, hardness: 0, sound: S.GRASS, tool: 'none',
  });

  def(BLOCK.SPRUCE_SAPLING, 'spruce_sapling', '云杉树苗', 'oak_leaves', {
    solid: false, opaque: false, height: 0, plant: true,
    pass: RENDER_PASS.CUTOUT, hardness: 0, sound: S.GRASS, tool: 'none',
  });

  def(BLOCK.SHORT_GRASS, 'short_grass', '草', 'grass_top', {
    solid: false, opaque: false, height: 0, plant: true,
    pass: RENDER_PASS.CUTOUT, hardness: 0, sound: S.GRASS, tool: 'none',
  });

  def(BLOCK.STONE_SLAB, 'stone_slab', '石台阶', 'stone', {
    height: 0.5, opaque: false, filter: 0, hardness: 2.0,
  });

  /* ------------------------------------------------------------------ *
   * Lookup helpers
   * ------------------------------------------------------------------ */

  /** Resolve the texture name for a block face (0..5, see FACE). */
  function textureFor(id, face) {
    const b = BLOCKS[id];
    if (!b) return 'stone';
    return typeof b.tex === 'string' ? b.tex : (b.tex[face] ?? b.tex[0]);
  }

  function isOpaque(id) {
    const b = BLOCKS[id];
    return b ? b.opaque : false;
  }

  function isSolid(id) {
    const b = BLOCKS[id];
    if (!b || !b.solid) return false;
    return b.height > 0;
  }

  function isLiquid(id) {
    const b = BLOCKS[id];
    return !!(b && b.liquid);
  }

  function lightEmission(id) {
    const b = BLOCKS[id];
    return b ? b.light : 0;
  }

  /** Skylight removed when passing through this block (15 = fully blocked). */
  function lightFilter(id) {
    const b = BLOCKS[id];
    if (!b) return 15;
    if (b.opaque) return 15;
    return b.filter;
  }

  function blockName(id) {
    return BLOCKS[id]?.display ?? `block_${id}`;
  }

  /** Sound group used for digging / stepping / placing. */
  function soundGroup(id) {
    return BLOCKS[id]?.sound ?? 'stone';
  }

  function walkSoundGroup(id) {
    return BLOCKS[id]?.walkSound ?? BLOCKS[id]?.sound ?? 'stone';
  }

  /** The flat, placeable blocks offered by the creative inventory. */
  const CREATIVE_BLOCKS = BLOCKS
    .filter((b) => b && b.id !== BLOCK.AIR && !b.liquid && !b.unbreakable)
    .map((b) => b.id);

  /** Blocks given to the player when a new survival world starts. */
  const SURVIVAL_STARTER = [BLOCK.OAK_PLANKS, BLOCK.DIRT, BLOCK.STONE, BLOCK.TORCH];

  G["textureFor"] = textureFor;
  G["isOpaque"] = isOpaque;
  G["isSolid"] = isSolid;
  G["isLiquid"] = isLiquid;
  G["lightEmission"] = lightEmission;
  G["lightFilter"] = lightFilter;
  G["blockName"] = blockName;
  G["soundGroup"] = soundGroup;
  G["walkSoundGroup"] = walkSoundGroup;
  G["RENDER_PASS"] = RENDER_PASS;
  G["BLOCK"] = BLOCK;
  G["BLOCK_COUNT"] = BLOCK_COUNT;
  G["ATLAS_COLS"] = ATLAS_COLS;
  G["ATLAS_ROWS"] = ATLAS_ROWS;
  G["FACE"] = FACE;
  G["FACE_NORMALS"] = FACE_NORMALS;
  G["FACE_SHADE"] = FACE_SHADE;
  G["BLOCKS"] = BLOCKS;
  G["CREATIVE_BLOCKS"] = CREATIVE_BLOCKS;
  G["SURVIVAL_STARTER"] = SURVIVAL_STARTER;
})(__mc);

/* ---- src/world/chunk-worker.js ------------------------------------------- */
(function (G) {
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





  const BLOCK_FACES = G["default"].blockFaces;

  /* ------------------------------------------------------------------ *
   * Block property tables (worker-local copies of what the generator needs)
   * ------------------------------------------------------------------ */

  const isAir = (id) => id === 0;
  const isWater = (id) => id === G["ID"].WATER;
  const isLiquid = (id) => id === G["ID"].WATER || id === G["ID"].LAVA;
  const isLeaves = (id) => id === G["ID"].OAK_LEAVES || id === G["ID"].SPRUCE_LEAVES || id === G["ID"].BIRCH_LEAVES;

  /** Blocks that do not occlude their neighbours (faces are still drawn). */
  const NON_OPAQUE = new Set([
    0, G["ID"].WATER, G["ID"].OAK_LEAVES, G["ID"].SPRUCE_LEAVES, G["ID"].BIRCH_LEAVES, G["ID"].GLASS, G["ID"].ICE,
    G["ID"].TORCH, G["ID"].SUGAR_CANE, G["ID"].DEAD_BUSH, G["ID"].RAIL, G["ID"].DANDELION, G["ID"].POPPY, G["ID"].SPRUCE_SAPLING,
  ]);

  /** Cross-shaped (billboard) blocks. */
  const PLANTS = new Set([
    G["ID"].TORCH, G["ID"].SUGAR_CANE, G["ID"].DEAD_BUSH, G["ID"].RAIL, G["ID"].DANDELION, G["ID"].POPPY,
    G["ID"].SPRUCE_SAPLING, G["ID"].SHORT_GRASS,
  ]);

  const FILTER = new Int8Array(256);
  FILTER.fill(15);
  for (const id of NON_OPAQUE) FILTER[id] = 0;
  FILTER[G["ID"].OAK_LEAVES] = 2;
  FILTER[G["ID"].SPRUCE_LEAVES] = 2;
  FILTER[G["ID"].BIRCH_LEAVES] = 2;
  FILTER[G["ID"].WATER] = 1;
  FILTER[G["ID"].ICE] = 2;

  const EMISSION = new Int8Array(256);
  EMISSION[G["ID"].GLOWSTONE] = 15;
  EMISSION[G["ID"].TORCH] = 14;
  EMISSION[G["ID"].LAVA] = 15;

  /* ------------------------------------------------------------------ *
   * Terrain generation
   * ------------------------------------------------------------------ */

  const BIOME = { OCEAN: 0, PLAINS: 1, FOREST: 2, DESERT: 3, MOUNTAINS: 4, TAIGA: 5, SWAMP: 6, BEACH: 7, SNOWY: 8, MUSHROOM: 9 };
  const MAT = { SANDSTONE: G["ID"].SANDSTONE };

  class Generator {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.continent = new G["Noise"](seed + 1);
      this.erosion = new G["Noise"](seed + 2);
      this.peaks = new G["Noise"](seed + 3);
      this.climate = new G["Noise"](seed + 4);
      this.cave = new G["Noise"](seed + 5);
      this.surface = new G["Noise"](seed + 6);
      this.ore = new G["Noise"](seed + 7);
      this.tree = new G["Noise"](seed + 8);
      this.tmp = new Uint8Array(G["CHUNK_SIZE"] * G["WORLD_HEIGHT"] * G["CHUNK_SIZE"]);
      this.tmpHeights = new Int16Array(G["CHUNK_SIZE"] * G["CHUNK_SIZE"]);
      this.tmpBiomes = new Uint8Array(G["CHUNK_SIZE"] * G["CHUNK_SIZE"]);
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
      if (height < G["SEA_LEVEL"] - 2) return BIOME.OCEAN;
      if (height <= G["SEA_LEVEL"] + 1) return BIOME.BEACH;
      if (height > G["SEA_LEVEL"] + 34) return temp < -0.15 ? BIOME.SNOWY : BIOME.MOUNTAINS;
      if (humid > 0.62 && temp > -0.1 && temp < 0.35) return BIOME.MUSHROOM;
      if (temp < -0.32) return BIOME.SNOWY;
      if (temp < -0.1 && humid > -0.15) return BIOME.TAIGA;
      if (temp > 0.3 && humid < -0.18) return BIOME.DESERT;
      if (humid > 0.36 && height < G["SEA_LEVEL"] + 5) return BIOME.SWAMP;
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
      const surface = this.tmpSurfaceRef ?? G["SEA_LEVEL"];
      if (wy > surface - 4) return false;
      if (cavern && wy > surface - 12) return false;
      return true;
    }

    /** Ore selection for a stone block at world (x, y, z). */
    oreAt(wx, wy, wz) {
      const r = this.ore.noise3(wx * 0.31, wy * 0.31, wz * 0.31);
      const r2 = this.ore.noise3(wx * 0.11 + 40, wy * 0.11 - 17, wz * 0.11 + 9);
      const chance = (base, scale) => r + r2 * scale > 1 - base;

      if (wy < 16 && chance(0.012, 0.35)) return G["ID"].DIAMOND_ORE;
      if (wy < 20 && chance(0.02, 0.3)) return G["ID"].REDSTONE_ORE;
      if (wy < 32 && chance(0.03, 0.3)) return G["ID"].GOLD_ORE;
      if (wy < 40 && chance(0.02, 0.3)) return G["ID"].EMERALD_ORE;
      if (wy < 64 && chance(0.06, 0.35)) return G["ID"].IRON_ORE;
      if (wy < 96 && chance(0.08, 0.35)) return G["ID"].COAL_ORE;
      return G["ID"].STONE;
    }

    /** Fills `out` (16 x 128 x 16, x-major, y-major) with a generated chunk. */
    generate(cx, cz, out, heights, biomes) {
      const ox = cx * G["CHUNK_SIZE"];
      const oz = cz * G["CHUNK_SIZE"];
      out.fill(0);

      // Pass 1: stone / dirt / surface material, water and bedrock.
      for (let lz = 0; lz < G["CHUNK_SIZE"]; lz++) {
        for (let lx = 0; lx < G["CHUNK_SIZE"]; lx++) {
          const wx = ox + lx, wz = oz + lz;
          const h = Math.max(1, Math.min(G["WORLD_HEIGHT"] - 8, Math.round(this.heightAt(wx, wz))));
          const biome = this.biomeAt(wx, wz, h);
          const colIdx = lz * G["CHUNK_SIZE"] + lx;
          heights[colIdx] = h;
          biomes[colIdx] = biome;
          this.tmpSurfaceRef = h;

          for (let y = 0; y <= h; y++) {
            const idx = (y * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx;
            if (y === 0) { out[idx] = G["ID"].BEDROCK; continue; }
            if (y <= 2 && this.ore.noise3(wx * 3.1, y * 3.1, wz * 3.1) > -0.1) { out[idx] = G["ID"].BEDROCK; continue; }

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
          for (let y = h + 1; y <= G["SEA_LEVEL"]; y++) {
            const idx = (y * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx;
            if (out[idx] === G["ID"].AIR) out[idx] = G["ID"].WATER;
          }

          // Snow / ice caps in cold biomes.
          if (biome === BIOME.SNOWY) {
            const top = h;
            const idx = (top * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx;
            if (out[idx] !== G["ID"].AIR && out[idx] !== G["ID"].WATER) out[idx] = G["ID"].SNOW_BLOCK;
            const above = ((top + 1) * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx;
            if (top + 1 < G["WORLD_HEIGHT"] && out[above] === G["ID"].WATER) out[above] = G["ID"].ICE;
            for (let y = G["SEA_LEVEL"] + 1; y < G["WORLD_HEIGHT"]; y++) {
              const i2 = (y * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx;
              if (out[i2] === G["ID"].WATER) out[i2] = G["ID"].ICE;
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
        case BIOME.BEACH: return G["ID"].SAND;
        case BIOME.DESERT: return G["ID"].SAND;
        case BIOME.SWAMP: return G["ID"].GRASS_BLOCK;
        case BIOME.SNOWY: return G["ID"].SNOW_BLOCK;
        case BIOME.MOUNTAINS:
          return h > G["SEA_LEVEL"] + 52 ? G["ID"].STONE : (h > G["SEA_LEVEL"] + 44 ? G["ID"].SNOW_BLOCK : G["ID"].GRASS_BLOCK);
        case BIOME.TAIGA: return G["ID"].PODZOL;
        case BIOME.MYCELIUM: return G["ID"].MYCELIUM;
        default: return G["ID"].GRASS_BLOCK;
      }
    }

    subsurfaceBlock(biome, depth) {
      switch (biome) {
        case BIOME.OCEAN:
        case BIOME.BEACH:
        case BIOME.DESERT: return depth <= 2 ? MAT.SANDSTONE : G["ID"].SAND;
        case BIOME.MOUNTAINS: return G["ID"].STONE;
        default: return G["ID"].DIRT;
      }
    }

    decorate(cx, cz, out, heights, biomes) {
      const ox = cx * G["CHUNK_SIZE"], oz = cz * G["CHUNK_SIZE"];
      const rnd = new G["Noise"](this.seed + 999);

      for (let lz = 0; lz < G["CHUNK_SIZE"]; lz++) {
        for (let lx = 0; lx < G["CHUNK_SIZE"]; lx++) {
          const wx = ox + lx, wz = oz + lz;
          const colIdx = lz * G["CHUNK_SIZE"] + lx;
          const h = heights[colIdx];
          const biome = biomes[colIdx];
          if (h < G["SEA_LEVEL"]) continue; // underwater columns get no plants

          const roll = rnd.fbm2(wx * 12.9898, wz * 78.233, 1) * 0.5 + 0.5;
          const roll2 = rnd.fbm2(wx * 39.346 + 7, wz * 11.135 - 3, 1) * 0.5 + 0.5;
          const surface = this.getLocal(out, lx, h, lz);
          if (surface !== G["ID"].GRASS_BLOCK && surface !== G["ID"].PODZOL && surface !== G["ID"].SNOW_BLOCK
            && surface !== G["ID"].SAND && surface !== G["ID"].MYCELIUM) continue;

          let treeDensity = 0;
          let treeKind = G["ID"].OAK_LOG, leafKind = G["ID"].OAK_LEAVES;
          switch (biome) {
            case BIOME.FOREST: treeDensity = 0.055; break;
            case BIOME.PLAINS: treeDensity = 0.007; break;
            case BIOME.SWAMP: treeDensity = 0.02; break;
            case BIOME.TAIGA: treeDensity = 0.045; treeKind = G["ID"].SPRUCE_LOG; leafKind = G["ID"].SPRUCE_LEAVES; break;
            case BIOME.SNOWY: treeDensity = 0.03; treeKind = G["ID"].SPRUCE_LOG; leafKind = G["ID"].SPRUCE_LEAVES; break;
            case BIOME.MOUNTAINS: treeDensity = h < G["SEA_LEVEL"] + 42 ? 0.02 : 0; treeKind = G["ID"].SPRUCE_LOG; leafKind = G["ID"].SPRUCE_LEAVES; break;
            default: treeDensity = 0; break;
          }

          if (roll < treeDensity) {
            this.placeTree(out, lx, h + 1, lz, treeKind, leafKind, roll2);
            continue;
          }

          if (biome === BIOME.DESERT) {
            if (roll < 0.008) this.placeCactus(out, lx, h + 1, lz);
            else if (roll < 0.02) this.setLocal(out, lx, h + 1, lz, G["ID"].DEAD_BUSH);
            continue;
          }

          if (biome === BIOME.SWAMP && roll < 0.05 && surface === G["ID"].GRASS_BLOCK) {
            this.setLocal(out, lx, h + 1, lz, G["ID"].SUGAR_CANE);
            if (roll < 0.02) this.setLocal(out, lx, h + 2, lz, G["ID"].SUGAR_CANE);
            continue;
          }

          // Ground cover.
          if (surface === G["ID"].GRASS_BLOCK || surface === G["ID"].PODZOL || surface === G["ID"].MYCELIUM) {
            const gr = roll2;
            if (gr < 0.16) this.setLocal(out, lx, h + 1, lz, G["ID"].SHORT_GRASS);
            else if (gr < 0.185) this.setLocal(out, lx, h + 1, lz, G["ID"].DANDELION);
            else if (gr < 0.21) this.setLocal(out, lx, h + 1, lz, G["ID"].POPPY);
            else if (gr < 0.215 && (biome === BIOME.FOREST || biome === BIOME.TAIGA)) {
              this.setLocal(out, lx, h + 1, lz, G["ID"].SPRUCE_SAPLING);
            }
          }
        }
      }

      // Beech: pumpkins are rare, place them from a separate roll.
      for (let i = 0; i < 2; i++) {
        const wx = ox + Math.floor(rnd.fbm2(ox * 1.7 + i * 13.3, oz * 2.3 - i * 7.1, 1) * 8 + 8);
        const wz = oz + Math.floor(rnd.fbm2(oz * 1.9 - i * 5.5, ox * 2.7 + i * 3.9, 1) * 8 + 8);
        const lx = wx - ox, lz = wz - oz;
        if (lx < 0 || lz < 0 || lx >= G["CHUNK_SIZE"] || lz >= G["CHUNK_SIZE"]) continue;
        const colIdx = lz * G["CHUNK_SIZE"] + lx;
        const h = heights[colIdx];
        if (h < G["SEA_LEVEL"] + 1) continue;
        if (this.getLocal(out, lx, h, lz) !== G["ID"].GRASS_BLOCK) continue;
        this.setLocal(out, lx, h + 1, lz, G["ID"].PUMPKIN);
      }
    }

    placeTree(out, lx, baseY, lz, logId, leafId, roll) {
      const height = 4 + Math.floor(roll * 3.99);
      const top = baseY + height;
      for (let y = baseY; y < top; y++) this.setLocal(out, lx, y, lz, logId);
      const radius = logId === G["ID"].SPRUCE_LOG ? 2 : 2;
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
      for (let i = 0; i < height; i++) this.setLocal(out, lx, baseY + i, lz, G["ID"].CACTUS);
    }

    getLocal(out, lx, y, lz) {
      if (lx < 0 || lz < 0 || lx >= G["CHUNK_SIZE"] || lz >= G["CHUNK_SIZE"] || y < 0 || y >= G["WORLD_HEIGHT"]) return G["ID"].AIR;
      return out[(y * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx];
    }

    setLocal(out, lx, y, lz, id) {
      if (lx < 0 || lz < 0 || lx >= G["CHUNK_SIZE"] || lz >= G["CHUNK_SIZE"] || y < 0 || y >= G["WORLD_HEIGHT"]) return;
      out[(y * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx] = id;
    }

    /** Writes only if the target is currently air, and never outside the chunk. */
    setLocalIfAir(out, lx, y, lz, id) {
      if (lx < 0 || lz < 0 || lx >= G["CHUNK_SIZE"] || lz >= G["CHUNK_SIZE"] || y < 0 || y >= G["WORLD_HEIGHT"]) return;
      const idx = (y * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx;
      if (out[idx] === G["ID"].AIR) out[idx] = id;
    }
  }

  /* ------------------------------------------------------------------ *
   * Mesher
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * Mesher
   * ------------------------------------------------------------------ */

  const PAD = 1;
  const PAD_W = G["CHUNK_SIZE"] + PAD * 2; // 18
  const PAD_AREA = PAD_W * PAD_W;
  const padIndex = (px, y, pz) => (y * PAD_W + pz) * PAD_W + px;
  const clampPx = (v) => (v < 0 ? 0 : v >= PAD_W ? PAD_W - 1 : v);
  const clampY = (v) => (v < 0 ? 0 : v >= G["WORLD_HEIGHT"] ? G["WORLD_HEIGHT"] - 1 : v);

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
          if (nx < 0 || nz < 0 || nx >= PAD_W || nz >= PAD_W || ny < 0 || ny >= G["WORLD_HEIGHT"]) continue;
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
        for (let y = G["WORLD_HEIGHT"] - 1; y >= 0; y--) {
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
        for (let y = 0; y < G["WORLD_HEIGHT"]; y++) {
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
    for (let y = 0; y < G["WORLD_HEIGHT"]; y++) {
      for (let lz = 0; lz < G["CHUNK_SIZE"]; lz++) {
        for (let lx = 0; lx < G["CHUNK_SIZE"]; lx++) {
          out[padIndex(lx + PAD, y, lz + PAD)] = blocks[(y * G["CHUNK_SIZE"] + lz) * G["CHUNK_SIZE"] + lx];
        }
      }
    }
    for (const side of neighbours ?? []) {
      const data = side.blocks;
      if (!data) continue;
      for (let y = 0; y < G["WORLD_HEIGHT"]; y++) {
        for (let i = 0; i < G["CHUNK_SIZE"]; i++) {
          let px, pz, src;
          if (side.dir === 0) {          // east neighbour: its x = 0, z = i
            px = PAD + G["CHUNK_SIZE"]; pz = PAD + i;
            src = (y * G["CHUNK_SIZE"] + i) * G["CHUNK_SIZE"] + 0;
          } else if (side.dir === 1) {   // west neighbour: its x = 15, z = i
            px = 0; pz = PAD + i;
            src = (y * G["CHUNK_SIZE"] + i) * G["CHUNK_SIZE"] + (G["CHUNK_SIZE"] - 1);
          } else if (side.dir === 4) {   // south neighbour: its z = 0, x = i
            px = PAD + i; pz = PAD + G["CHUNK_SIZE"];
            src = (y * G["CHUNK_SIZE"] + 0) * G["CHUNK_SIZE"] + i;
          } else {                       // north neighbour: its z = 15, x = i
            px = PAD + i; pz = 0;
            src = (y * G["CHUNK_SIZE"] + (G["CHUNK_SIZE"] - 1)) * G["CHUNK_SIZE"] + i;
          }
          out[padIndex(px, y, pz)] = data[src];
        }
      }
    }
  }

  const padBlocks = new Uint8Array(PAD_AREA * G["WORLD_HEIGHT"]);
  const padSky = new Uint8Array(PAD_AREA * G["WORLD_HEIGHT"]);
  const padLight = new Uint8Array(PAD_AREA * G["WORLD_HEIGHT"]);

  const isOpaqueBlock = (id) => FILTER[id] >= 15;

  /** Light level used for shading: the stronger of skylight and block light. */
  function lightAt(idx) {
    return padSky[idx] > padLight[idx] ? padSky[idx] : padLight[idx];
  }

  /** Decides whether the face of `id` towards direction `f` is visible. */
  function shouldDrawFace(px, y, pz, f, id) {
    const n = FACE_NORMALS_PAD[f];
    const ny = y + n[1];
    if (ny < 0 || ny >= G["WORLD_HEIGHT"]) return true;
    const nid = padBlocks[padIndex(clampPx(px + n[0]), ny, clampPx(pz + n[2]))];
    if (nid === id && (id === G["ID"].WATER || id === G["ID"].GLASS || id === G["ID"].ICE)) return false;
    if (id === G["ID"].WATER && nid !== 0) return false;
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
        if (ny < 0 || ny >= G["WORLD_HEIGHT"]) return false;
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
      if (id === G["ID"].LAVA || id === G["ID"].GLOWSTONE) value = Math.max(value, 0.95);
      light[i] = value > 1 ? 1 : value;
    }

    // Rotate the split direction so the darker pair of corners gets the shared edge.
    const flip = light[0] + light[2] < light[1] + light[3];
    builder.quad(vx, vy, vz, uv, tile, light, flip);
  }

  /** Two crossed quads for grass, flowers, saplings, torches and rails. */
  function emitCross(builder, id, lx, ly, lz, idx) {
    const tile = id === G["ID"].SHORT_GRASS
      ? (BLOCK_FACES[G["ID"].SHORT_GRASS]?.[2] ?? 0)
      : (BLOCK_FACES[id]?.[2] ?? 0);
    const level = lightAt(idx) / 15;
    const brightness = 0.07 + 0.93 * level;
    const light = [brightness * 0.92, brightness * 0.92, brightness, brightness];
    // Everything here is in 1/16-block units, matching emitFace.
    const bx = lx * 16, by = ly * 16, bz = lz * 16;

    if (id === G["ID"].RAIL) {
      const y = by + 1;
      builder.quad(
        [bx, bx + 16, bx + 16, bx], [y, y, y, y], [bz, bz, bz + 16, bz + 16],
        [0, 0, 16, 0, 16, 16, 0, 16], tile, light, false,
      );
      return;
    }

    const isTorch = id === G["ID"].TORCH;
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
    const y0 = section * G["SECTION_HEIGHT"];
    const y1 = Math.min(y0 + G["SECTION_HEIGHT"], G["WORLD_HEIGHT"]);

    for (let y = y0; y < y1; y++) {
      for (let lz = 0; lz < G["CHUNK_SIZE"]; lz++) {
        for (let lx = 0; lx < G["CHUNK_SIZE"]; lx++) {
          const px = lx + PAD, pz = lz + PAD;
          const idx = padIndex(px, y, pz);
          const id = padBlocks[idx];
          if (id === 0) continue;

          const ly = y - y0;
          if (PLANTS.has(id)) {
            emitCross(cutout, id, lx, ly, lz, idx);
            continue;
          }

          const builder = (isLeaves(id) || id === G["ID"].GLASS || id === G["ID"].ICE) ? cutout : solid;
          const waterSurface = isWater(id) && padBlocks[padIndex(px, clampY(y + 1), pz)] !== G["ID"].WATER;
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
    const blocks = new Uint8Array(G["CHUNK_SIZE"] * G["WORLD_HEIGHT"] * G["CHUNK_SIZE"]);
    const heights = new Int16Array(G["CHUNK_SIZE"] * G["CHUNK_SIZE"]);
    const biomes = new Uint8Array(G["CHUNK_SIZE"] * G["CHUNK_SIZE"]);
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



  G["Generator"] = Generator;
  G["meshSection"] = meshSection;
  G["generateChunk"] = generateChunk;
  G["MeshBuilder"] = MeshBuilder;
  G["FACES"] = FACES;
  G["padBlocks"] = padBlocks;
  G["padSky"] = padSky;
  G["padLight"] = padLight;
})(__mc);

/* ---- src/render/textures.js ---------------------------------------------- */
(function (G) {
  /**
   * textures.js — procedural 16x16 pixel-art block textures for a browser Minecraft clone.
   *
   * Dependency-free ES module. No imports, no network, no DOM elements appended to the document.
   * All pixels are written raw through ImageData (Uint8ClampedArray), never via gradients/rect fills.
   * Fully deterministic: a seeded mulberry32 PRNG is re-seeded per tile, so generateAtlas() is
   * byte-for-byte reproducible across calls.
   *
   * Atlas layout: ATLAS_COLS (16) x ATLAS_ROWS (32) cells of TILE_PX (16) texels each.
   * tileIndex = row * ATLAS_COLS + col.
   */

  const TILE_PX = 16;
  const ATLAS_COLS = 16;
  const ATLAS_ROWS = 32;

  /** Every tile name, in atlas index order (row-major). */
  const TEXTURE_NAMES = [
    // row 0 — natural stone-ish blocks
    'stone', 'dirt', 'grass_top', 'grass_side', 'cobblestone', 'sand', 'sandstone_top', 'sandstone_side',
    'gravel', 'oak_log_side', 'oak_log_top', 'oak_planks', 'oak_leaves', 'water', 'bedrock', 'coal_ore',
    // row 1 — ores + crafted mineral blocks
    'iron_ore', 'gold_ore', 'diamond_ore', 'redstone_ore', 'emerald_ore', 'bricks', 'stone_bricks', 'glass',
    'snow', 'ice', 'cactus_side', 'cactus_top', 'pumpkin_side', 'pumpkin_top', 'pumpkin_face', 'crafting_table_top',
    // row 2 — utility / decoration
    'crafting_table_side', 'furnace_side', 'furnace_front', 'furnace_top', 'bookshelf', 'obsidian', 'netherrack',
    'glowstone', 'torch', 'tnt_side', 'tnt_top', 'wool_white', 'sponge', 'diamond_block', 'gold_block', 'iron_block',
    // row 3 — blocks, terrain extras, plants, rail
    'coal_block', 'farmland', 'grass_path', 'lava', 'mycelium_top', 'podzol_top', 'clay', 'sugar_cane',
    'dead_bush', 'rail',
    // row 3 continued — cross-shaped flowers (append only: the tile manifest is
    // generated from this array, so new names must go at the very end)
    'dandelion', 'poppy',
  ];

  /** name -> tileIndex; filled by generateAtlas(), but usable before if accessed lazily. */
  const TILE_INDEX = {};

  // ---------------------------------------------------------------------------
  // PRNG — mulberry32, deterministic, no external state
  // ---------------------------------------------------------------------------

  /** @param {number} seed @returns {() => number} uniform [0,1) */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Stable 32-bit string hash so each tile gets its own reproducible seed. */
  function hashName(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // ---------------------------------------------------------------------------
  // Small pixel helpers
  // ---------------------------------------------------------------------------

  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

  /** Immutable-ish color object. */
  const rgb = (r, g, b) => ({ r: r | 0, g: g | 0, b: b | 0 });

  /** Shift an rgb color by a delta, clamped. */
  function shade(c, d) {
    return rgb(clamp255(c.r + d), clamp255(c.g + d), clamp255(c.b + d));
  }

  /**
   * A 16x16 RGBA scratch surface. All tile painters draw into one of these; the
   * surface is then blitted into the atlas (or into a standalone canvas).
   */
  class Surface {
    constructor(size = TILE_PX, fill = null) {
      this.size = size;
      this.data = new Uint8ClampedArray(size * size * 4);
      if (fill) this.fill(fill, 255);
    }

    idx(x, y) {
      return (y * this.size + x) * 4;
    }

    /** Write one texel. `a` defaults to 255. Out-of-range coords are ignored. */
    set(x, y, color, a = 255) {
      if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
      const i = this.idx(x, y);
      this.data[i] = color.r;
      this.data[i + 1] = color.g;
      this.data[i + 2] = color.b;
      this.data[i + 3] = a;
    }

    /** Read one texel as {r,g,b,a}. */
    get(x, y) {
      const i = this.idx(x, y);
      return { r: this.data[i], g: this.data[i + 1], b: this.data[i + 2], a: this.data[i + 3] };
    }

    /** Rec.601 luma of a texel (used for edge/outline detection). */
    luma(x, y) {
      const i = this.idx(x, y);
      return 0.299 * this.data[i] + 0.587 * this.data[i + 1] + 0.114 * this.data[i + 2];
    }

    alpha(x, y) {
      return this.data[this.idx(x, y) + 3];
    }

    fill(color, a = 255) {
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) this.set(x, y, color, a);
      }
    }

    clear() {
      this.data.fill(0);
    }
  }

  /** Per-pixel noise over the whole surface: c += rnd(-amp, amp). */
  function noiseFill(surf, base, amp, rnd) {
    for (let y = 0; y < surf.size; y++) {
      for (let x = 0; x < surf.size; x++) {
        const d = Math.round((rnd() * 2 - 1) * amp);
        surf.set(x, y, shade(base, d));
      }
    }
  }

  /** Sprinkle `count` single-pixel specks of `color` (with small jitter). */
  function speckle(surf, color, count, rnd, jitter = 10, allowTransparent = false) {
    for (let i = 0; i < count; i++) {
      const x = (rnd() * surf.size) | 0;
      const y = (rnd() * surf.size) | 0;
      if (!allowTransparent && surf.alpha(x, y) === 0) continue;
      surf.set(x, y, shade(color, Math.round((rnd() * 2 - 1) * jitter)), allowTransparent ? 255 : surf.alpha(x, y));
    }
  }

  /**
   * Ordered 4x4 Bayer dithering: draws `color` where the bayer threshold passes
   * for the given coverage in [0,1]. Keeps gradients readable at 1:1 texel scale.
   */
  const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  function dither(surf, color, coverage, rnd = null, region = null) {
    const [x0, y0, x1, y1] = region || [0, 0, surf.size - 1, surf.size - 1];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = (BAYER4[y & 3][x & 3] + 0.5) / 16;
        if (coverage > t) {
          const j = rnd ? Math.round((rnd() * 2 - 1) * 6) : 0;
          surf.set(x, y, shade(color, j), 255);
        }
      }
    }
  }

  /** Draw a darker outline around every opaque pixel that borders a transparent one. */
  function outlineTransparentEdges(surf, color, alphaLimit = 40) {
    const copy = surf.data.slice();
    const at = (x, y) => copy[(y * surf.size + x) * 4 + 3];
    for (let y = 0; y < surf.size; y++) {
      for (let x = 0; x < surf.size; x++) {
        if (surf.alpha(x, y) <= alphaLimit) continue;
        const edge =
          (x > 0 && at(x - 1, y) <= alphaLimit) ||
          (x < surf.size - 1 && at(x + 1, y) <= alphaLimit) ||
          (y > 0 && at(x, y - 1) <= alphaLimit) ||
          (y < surf.size - 1 && at(x, y + 1) <= alphaLimit);
        if (edge) surf.set(x, y, color, 255);
      }
    }
  }

  /** Darken the four border texels of a tile (subtle block edge definition). */
  function bevelBorder(surf, d = -14, inset = false) {
    const s = surf.size;
    for (let i = 0; i < s; i++) {
      const pts = [[i, 0], [i, s - 1], [0, i], [s - 1, i]];
      for (const [x, y] of pts) {
        const c = surf.get(x, y);
        if (c.a === 0) continue;
        surf.set(x, y, shade(c, d));
      }
    }
    if (inset) {
      // Light inner highlight on the top/left for a beveled look.
      for (let i = 1; i < s - 1; i++) {
        for (const [x, y] of [[i, 1], [1, i]]) {
          const c = surf.get(x, y);
          if (c.a === 0) continue;
          surf.set(x, y, shade(c, 10));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Shared painters
  // ---------------------------------------------------------------------------

  /** Stone base: mid gray with clustered noise (used by stone and every ore). */
  function paintStoneBase(surf, rnd, base = rgb(126, 126, 126), amp = 16) {
    noiseFill(surf, base, amp, rnd);
    // A few 2x2 darker/lighter blotches for classic stone mottling.
    for (let i = 0; i < 10; i++) {
      const x = 1 + ((rnd() * (surf.size - 3)) | 0);
      const y = 1 + ((rnd() * (surf.size - 3)) | 0);
      const d = rnd() < 0.5 ? -18 : 14;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const c = surf.get(x + dx, y + dy);
          surf.set(x + dx, y + dy, shade(c, d + Math.round((rnd() * 2 - 1) * 4)));
        }
      }
    }
    speckle(surf, shade(base, -26), 18, rnd, 6);
    speckle(surf, shade(base, 22), 12, rnd, 6);
  }

  /** Dirt base: brown noise with darker specks. Shared by dirt/grass_side/farmland. */
  function paintDirtBase(surf, rnd, base = rgb(134, 96, 67)) {
    noiseFill(surf, base, 18, rnd);
    speckle(surf, shade(base, -34), 26, rnd, 8);
    speckle(surf, shade(base, 20), 16, rnd, 8);
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * 14) | 0;
      const y = (rnd() * 14) | 0;
      const c = shade(base, -30);
      surf.set(x, y, c);
      surf.set(x + 1, y, shade(base, -20));
    }
  }

  /** Oak plank rows: 4 horizontal planks with dark separators + nail specks. */
  function paintOakPlanks(surf, rnd, base = rgb(162, 124, 74)) {
    for (let y = 0; y < 16; y++) {
      const plank = (y / 4) | 0;
      const rowTint = [0, 6, -5, 3][plank];
      const separator = y % 4 === 3;
      for (let x = 0; x < 16; x++) {
        if (separator) {
          surf.set(x, y, shade(base, -46 + Math.round((rnd() * 2 - 1) * 5)));
          continue;
        }
        let d = rowTint + Math.round((rnd() * 2 - 1) * 9);
        // Wood grain: faint horizontal streaks.
        if (rnd() < 0.14) d -= 12;
        else if (rnd() < 0.1) d += 9;
        surf.set(x, y, shade(base, d));
      }
    }
    // Vertical plank seams at a staggered x per row band.
    const seams = [7, 3, 11, 5];
    for (let plank = 0; plank < 4; plank++) {
      const sx = seams[plank];
      const y0 = plank * 4;
      for (let y = y0; y < y0 + 3; y++) {
        surf.set(sx, y, shade(base, -38));
      }
    }
    // Nail specks near the seams.
    const nails = [[7, 0], [7, 2], [3, 4], [3, 6], [11, 8], [11, 10], [5, 12], [5, 14]];
    for (const [x, y] of nails) {
      const c = surf.get(x, y);
      surf.set(x, y, shade(c, rnd() < 0.5 ? -40 : -28));
    }
  }

  /** Red brick wall with light mortar, offset (running bond) rows. */
  function paintBricks(surf, rnd) {
    const brick = rgb(150, 82, 62);
    const mortar = rgb(168, 158, 148);
    noiseFill(surf, brick, 12, rnd);
    for (let y = 0; y < 16; y++) {
      const course = (y / 4) | 0;
      const isMortarRow = y % 4 === 3;
      for (let x = 0; x < 16; x++) {
        if (isMortarRow) {
          surf.set(x, y, shade(mortar, Math.round((rnd() * 2 - 1) * 8)));
          continue;
        }
        // Head joints: offset by half a brick every other course.
        const offset = course % 2 === 0 ? 0 : 4;
        if ((x + offset) % 8 === 7) {
          surf.set(x, y, shade(mortar, Math.round((rnd() * 2 - 1) * 8)));
        } else {
          const c = surf.get(x, y);
          surf.set(x, y, shade(c, Math.round((rnd() * 2 - 1) * 7)));
        }
      }
    }
    speckle(surf, shade(brick, -30), 14, rnd, 6);
    speckle(surf, shade(brick, 18), 10, rnd, 6);
  }

  /** Gray stone-brick grid: 8x8-ish bricks in muted gray. */
  function paintStoneBricks(surf, rnd) {
    const brick = rgb(122, 122, 122);
    const mortar = rgb(88, 88, 88);
    noiseFill(surf, brick, 14, rnd);
    for (let y = 0; y < 16; y++) {
      const course = (y / 8) | 0;
      const mortarRow = y % 8 === 7;
      for (let x = 0; x < 16; x++) {
        if (mortarRow) {
          surf.set(x, y, shade(mortar, Math.round((rnd() * 2 - 1) * 7)));
          continue;
        }
        const offset = course % 2 === 0 ? 0 : 4;
        if ((x + offset) % 8 === 7) {
          surf.set(x, y, shade(mortar, Math.round((rnd() * 2 - 1) * 7)));
        } else {
          const c = surf.get(x, y);
          surf.set(x, y, shade(c, Math.round((rnd() * 2 - 1) * 6)));
        }
      }
    }
    speckle(surf, shade(brick, -24), 12, rnd, 5);
    speckle(surf, shade(brick, 16), 10, rnd, 5);
  }

  /** Cobblestone: rounded pebble blobs on dark mortar. */
  function paintCobblestone(surf, rnd) {
    const mortar = rgb(74, 74, 74);
    noiseFill(surf, mortar, 10, rnd);
    const cobbles = [
      [0, 0, 7, 6], [8, 0, 7, 4], [0, 7, 5, 5], [6, 5, 5, 6],
      [12, 5, 4, 7], [0, 13, 7, 3], [8, 12, 8, 4], [12, 0, 4, 4],
    ];
    for (const [bx, by, bw, bh] of cobbles) {
      const tone = rgb(112 + ((rnd() * 40) | 0), 112 + ((rnd() * 40) | 0), 112 + ((rnd() * 40) | 0));
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          // Round the corners by skipping pebble-edge texels.
          const cornerX = x === 0 || x === bw - 1;
          const cornerY = y === 0 || y === bh - 1;
          if (cornerX && cornerY && rnd() < 0.65) continue;
          let d = Math.round((rnd() * 2 - 1) * 14);
          if (y === 0) d += 16; // lit top edge
          if (y === bh - 1) d -= 18; // shadowed bottom edge
          surf.set(bx + x, by + y, shade(tone, d));
        }
      }
    }
  }

  /** Sand: pale yellow fine noise. */
  function paintSand(surf, rnd, base = rgb(219, 205, 148)) {
    noiseFill(surf, base, 12, rnd);
    speckle(surf, shade(base, -24), 30, rnd, 5);
    speckle(surf, shade(base, 14), 22, rnd, 5);
  }

  /** Gravel: mixed gray/brown pebbles. */
  function paintGravel(surf, rnd) {
    noiseFill(surf, rgb(126, 120, 116), 16, rnd);
    for (let i = 0; i < 26; i++) {
      const x = (rnd() * 15) | 0;
      const y = (rnd() * 15) | 0;
      const brown = rnd() < 0.35;
      const tone = brown
        ? rgb(118 + ((rnd() * 26) | 0), 96 + ((rnd() * 22) | 0), 70 + ((rnd() * 18) | 0))
        : rgb(88 + ((rnd() * 70) | 0), 88 + ((rnd() * 70) | 0), 88 + ((rnd() * 70) | 0));
      const w = 1 + ((rnd() * 2) | 0);
      const h = 1 + ((rnd() * 2) | 0);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) surf.set(x + dx, y + dy, shade(tone, Math.round((rnd() * 2 - 1) * 10)));
      }
    }
    speckle(surf, rgb(60, 58, 56), 16, rnd, 6);
  }

  /** Ore tile: stone base + clustered specks of the ore color. */
  function paintOre(surf, rnd, oreColor, clusters = 5, radius = 1) {
    paintStoneBase(surf, rnd);
    const placed = [];
    for (let i = 0; i < clusters; i++) {
      let cx = 0;
      let cy = 0;
      let ok = false;
      for (let attempt = 0; attempt < 24 && !ok; attempt++) {
        cx = 2 + ((rnd() * 12) | 0);
        cy = 2 + ((rnd() * 12) | 0);
        ok = true;
        for (const p of placed) {
          if (Math.abs(p[0] - cx) < 3 && Math.abs(p[1] - cy) < 3) { ok = false; break; }
        }
      }
      placed.push([cx, cy]);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const manhattan = Math.abs(dx) + Math.abs(dy);
          if (manhattan > radius + (rnd() < 0.35 ? 1 : 0)) continue;
          const jitter = Math.round((rnd() * 2 - 1) * 16);
          surf.set(cx + dx, cy + dy, shade(oreColor, jitter));
          // Bright pixel highlight on the upper-left of each cluster.
          if (dx <= 0 && dy <= 0 && rnd() < 0.7) {
            surf.set(cx + dx, cy + dy, shade(oreColor, 34));
          }
        }
      }
      // Dark rim so the ore reads against stone.
      surf.set(cx + radius + 1, cy, shade(rgb(70, 70, 70), Math.round((rnd() * 2 - 1) * 6)));
    }
    // A couple of stray specks.
    speckle(surf, oreColor, 3, rnd, 20);
  }

  /** Log bark: vertical darker streaks on brown. */
  function paintLogSide(surf, rnd, base = rgb(104, 78, 46)) {
    noiseFill(surf, base, 12, rnd);
    // 2px-wide vertical bark bands with irregular breaks.
    const bands = [1, 4, 8, 11, 14];
    for (const bx of bands) {
      const dark = shade(base, -30 - ((rnd() * 12) | 0));
      for (let y = 0; y < 16; y++) {
        if (rnd() < 0.12) continue; // break the streak
        surf.set(bx, y, shade(dark, Math.round((rnd() * 2 - 1) * 8)));
        if (rnd() < 0.5) surf.set(bx + 1, y, shade(base, -18));
      }
    }
    // Knots.
    for (let i = 0; i < 3; i++) {
      const x = 2 + ((rnd() * 12) | 0);
      const y = 2 + ((rnd() * 12) | 0);
      surf.set(x, y, shade(base, -44));
      surf.set(x + 1, y, shade(base, -30));
      surf.set(x, y + 1, shade(base, -34));
    }
    speckle(surf, shade(base, 16), 14, rnd, 6);
  }

  /** Log top: concentric growth rings. */
  function paintLogTop(surf, rnd) {
    const base = rgb(158, 126, 78);
    noiseFill(surf, base, 10, rnd);
    const cx = 7.5;
    const cy = 7.5;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        const ring = Math.round(d);
        const isRing = ring % 3 === 0;
        const c = surf.get(x, y);
        let delta = isRing ? -34 : 8;
        if (ring <= 1) delta = -22; // dark pith center
        surf.set(x, y, shade(c, delta + Math.round((rnd() * 2 - 1) * 6)));
      }
    }
    speckle(surf, shade(base, -30), 10, rnd, 5);
  }

  /** Leaves: dense green clusters with alpha holes. */
  function paintLeaves(surf, rnd) {
    const base = rgb(58, 116, 42);
    surf.clear();
    // Clustered blobs of leaf matter, deterministic layout + jitter.
    for (let by = 0; by < 16; by += 3) {
      for (let bx = 0; bx < 16; bx += 3) {
        const filled = rnd() < 0.9;
        if (!filled) continue;
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            if (rnd() < 0.22) continue; // interior gaps
            const x = bx + dx;
            const y = by + dy;
            if (x > 15 || y > 15) continue;
            const light = rnd() < 0.25;
            surf.set(x, y, shade(base, Math.round((rnd() * 2 - 1) * 20) + (light ? 26 : 0)));
          }
        }
      }
    }
    // Punch transparent holes (alpha 0) so the renderer can alpha-test.
    let holes = 0;
    for (let attempts = 0; attempts < 200 && holes < 26; attempts++) {
      const x = (rnd() * 16) | 0;
      const y = (rnd() * 16) | 0;
      const holeSize = rnd() < 0.25 ? 2 : 1;
      for (let dy = 0; dy < holeSize; dy++) {
        for (let dx = 0; dx < holeSize; dx++) {
          if (x + dx > 15 || y + dy > 15) continue;
          if (surf.alpha(x + dx, y + dy) === 0) continue;
          surf.set(x + dx, y + dy, rgb(0, 0, 0), 0);
          holes++;
        }
      }
    }
    // Darken leaf pixels that touch a hole: gives the foliage depth.
    const copy = surf.data.slice();
    const atA = (x, y) => copy[(y * 16 + x) * 4 + 3];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (surf.alpha(x, y) === 0) continue;
        const edge =
          (x > 0 && atA(x - 1, y) === 0) || (x < 15 && atA(x + 1, y) === 0) ||
          (y > 0 && atA(x, y - 1) === 0) || (y < 15 && atA(x, y + 1) === 0);
        if (edge) {
          const c = surf.get(x, y);
          surf.set(x, y, shade(c, -26));
        }
      }
    }
  }

  /** Water: blue with faint horizontal wave bands (fully opaque in-tile). */
  function paintWater(surf, rnd, base = rgb(52, 94, 198)) {
    noiseFill(surf, base, 8, rnd);
    for (let y = 0; y < 16; y++) {
      const band = Math.sin(y * 0.9) > 0.35;
      for (let x = 0; x < 16; x++) {
        const c = surf.get(x, y);
        let d = Math.round((rnd() * 2 - 1) * 6);
        if (band) d += 14;
        if (y % 4 === 0 && rnd() < 0.55) d += 12; // wave crest lines
        surf.set(x, y, shade(c, d));
      }
    }
    speckle(surf, shade(base, 26), 14, rnd, 6);
    speckle(surf, shade(base, -20), 12, rnd, 6);
  }

  /** Bedrock: very dark chaotic gray blocks. */
  function paintBedrock(surf, rnd) {
    noiseFill(surf, rgb(72, 72, 72), 26, rnd);
    for (let i = 0; i < 34; i++) {
      const x = (rnd() * 15) | 0;
      const y = (rnd() * 15) | 0;
      const w = 1 + ((rnd() * 3) | 0);
      const h = 1 + ((rnd() * 3) | 0);
      const tone = rnd() < 0.5 ? rgb(34, 34, 34) : rgb(112, 112, 112);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (rnd() < 0.15) continue;
          surf.set(x + dx, y + dy, shade(tone, Math.round((rnd() * 2 - 1) * 16)));
        }
      }
    }
  }

  /** Glass: fully transparent except a light border frame + highlights. */
  function paintGlass(surf, rnd) {
    surf.clear();
    const frame = rgb(214, 232, 240);
    // 1px border frame on all four sides.
    for (let i = 0; i < 16; i++) {
      surf.set(i, 0, shade(frame, -6));
      surf.set(i, 15, shade(frame, -22));
      surf.set(0, i, shade(frame, -8));
      surf.set(15, i, shade(frame, -26));
    }
    // Corner accents.
    surf.set(1, 1, shade(frame, -18));
    surf.set(14, 1, shade(frame, -18));
    surf.set(1, 14, shade(frame, -30));
    surf.set(14, 14, shade(frame, -30));
    // A couple of diagonal highlight lines inside the pane, blended toward the
    // frame color so the pane still reads as transparent glass. Alpha stays 255
    // (the renderer alpha-tests, so no partial alpha anywhere).
    const stroke = rgb(176, 196, 206);
    const lines = [
      [3, 3, 4], [4, 2, 4], [5, 3, 3],
      [10, 9, 4], [11, 8, 3], [9, 10, 3],
    ];
    for (const [x, y, len] of lines) {
      for (let i = 0; i < len; i++) {
        surf.set(x + i, y + i, shade(stroke, Math.round((rnd() * 2 - 1) * 8)));
      }
    }
  }

  /** Snow: near-white fine noise. */
  function paintSnow(surf, rnd) {
    noiseFill(surf, rgb(244, 247, 252), 6, rnd);
    speckle(surf, rgb(226, 233, 245), 34, rnd, 4);
    speckle(surf, rgb(255, 255, 255), 20, rnd, 2);
  }

  /** Ice: pale cyan with lighter streaks. */
  function paintIce(surf, rnd) {
    noiseFill(surf, rgb(146, 190, 232), 10, rnd);
    for (let i = 0; i < 4; i++) {
      let x = (rnd() * 12) | 0;
      let y = (rnd() * 4) | 0;
      const len = 6 + ((rnd() * 8) | 0);
      for (let s = 0; s < len; s++) {
        surf.set(x, y, shade(rgb(196, 226, 248), Math.round((rnd() * 2 - 1) * 8)));
        if (rnd() < 0.7) x++;
        if (rnd() < 0.35) y++;
      }
    }
    speckle(surf, rgb(120, 166, 214), 14, rnd, 5);
  }

  /** Cactus side: green with vertical ridges and small spines. */
  function paintCactusSide(surf, rnd) {
    const base = rgb(58, 110, 48);
    noiseFill(surf, base, 10, rnd);
    // Dark vertical ridges at the left/right, lighter center panel.
    for (let y = 0; y < 16; y++) {
      surf.set(0, y, shade(base, -26));
      surf.set(1, y, shade(base, -14));
      surf.set(14, y, shade(base, -14));
      surf.set(15, y, shade(base, -28));
    }
    for (let x = 2; x < 14; x++) {
      const center = Math.abs(x - 7.5) < 3;
      for (let y = 0; y < 16; y++) {
        const c = surf.get(x, y);
        surf.set(x, y, shade(c, center ? 10 : 0));
      }
    }
    // Spines: 1px light dots along the ridge lines.
    for (let y = 1; y < 16; y += 3) {
      surf.set(2, y, rgb(206, 226, 176));
      surf.set(13, y + 1 > 15 ? 15 : y + 1, rgb(206, 226, 176));
      if (rnd() < 0.4) surf.set(7, y, rgb(196, 220, 168));
    }
  }

  /** Cactus top: green with a lighter inner ring/needles. */
  function paintCactusTop(surf, rnd) {
    const base = rgb(64, 118, 52);
    noiseFill(surf, base, 10, rnd);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const c = surf.get(x, y);
        let delta = 0;
        if (d > 6.5) delta = -24;
        else if (d > 4.5) delta = -10;
        else delta = 12;
        surf.set(x, y, shade(c, delta));
      }
    }
    // Star of needles.
    for (let i = 3; i < 13; i += 2) {
      surf.set(i, 7, rgb(198, 222, 172));
      surf.set(7, i, rgb(198, 222, 172));
    }
  }

  /** Pumpkin side: orange with vertical ribs. */
  function paintPumpkinSide(surf, rnd) {
    const base = rgb(206, 122, 32);
    noiseFill(surf, base, 10, rnd);
    for (let y = 0; y < 16; y++) {
      for (const rx of [0, 1, 7, 8, 14, 15]) {
        const c = surf.get(rx, y);
        surf.set(rx, y, shade(c, rx === 1 || rx === 14 ? -18 : -30));
      }
      for (const lx of [4, 11]) {
        const c = surf.get(lx, y);
        surf.set(lx, y, shade(c, 14));
      }
    }
    // Top lip shadow.
    for (let x = 0; x < 16; x++) {
      const c = surf.get(x, 0);
      surf.set(x, 0, shade(c, -14));
    }
  }

  /** Pumpkin top: orange with a stem. */
  function paintPumpkinTop(surf, rnd) {
    const base = rgb(198, 118, 32);
    noiseFill(surf, base, 10, rnd);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const c = surf.get(x, y);
        surf.set(x, y, shade(c, d > 6.5 ? -20 : d > 4.5 ? -8 : 10));
      }
    }
    // Stem: dark brown 2x2-ish cross in the center.
    const stem = rgb(96, 66, 30);
    const cells = [[7, 6], [8, 6], [7, 7], [8, 7], [7, 8], [8, 8], [6, 7], [9, 7], [6, 6], [9, 8]];
    for (const [x, y] of cells) surf.set(x, y, shade(stem, Math.round((rnd() * 2 - 1) * 12)));
    speckle(surf, shade(base, -22), 12, rnd, 6);
  }

  /** Pumpkin face: pumpkin side + carved dark face. */
  function paintPumpkinFace(surf, rnd) {
    paintPumpkinSide(surf, rnd);
    const dark = rgb(48, 26, 8);
    const eyes = [
      // left eye (triangular)
      [3, 4], [4, 4], [5, 4], [3, 5], [4, 5], [3, 6],
      // right eye
      [12, 4], [11, 4], [10, 4], [12, 5], [11, 5], [12, 6],
    ];
    for (const [x, y] of eyes) surf.set(x, y, shade(dark, Math.round((rnd() * 2 - 1) * 8)));
    // Mouth: a 6-wide jagged grin on rows 10-12.
    const mouth = [
      [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10], [12, 10],
      [4, 11], [6, 11], [8, 11], [10, 11], [11, 11],
      [3, 12], [5, 12], [7, 12], [9, 12], [12, 12],
    ];
    for (const [x, y] of mouth) surf.set(x, y, shade(dark, Math.round((rnd() * 2 - 1) * 8)));
    // Nose.
    surf.set(7, 7, dark);
    surf.set(8, 7, dark);
    surf.set(7, 8, shade(dark, 10));
  }

  /** Crafting table top: oak planks with a dark grid. */
  function paintCraftingTableTop(surf, rnd) {
    paintOakPlanks(surf, rnd);
    const grid = rgb(72, 50, 26);
    for (let i = 0; i < 16; i++) {
      surf.set(i, 4, grid);
      surf.set(i, 11, grid);
      surf.set(4, i, grid);
      surf.set(11, i, grid);
    }
    for (let i = 0; i < 16; i++) {
      surf.set(i, 5, shade(grid, 18));
      surf.set(5, i, shade(grid, 18));
    }
  }

  /** Crafting table side: planks with tool silhouettes. */
  function paintCraftingTableSide(surf, rnd) {
    paintOakPlanks(surf, rnd);
    const dark = rgb(66, 46, 24);
    // Hammer silhouette (left half).
    for (let x = 2; x <= 5; x++) surf.set(x, 3, dark);
    for (let x = 2; x <= 5; x++) surf.set(x, 4, dark);
    for (let y = 5; y <= 8; y++) surf.set(3, y, dark);
    surf.set(4, 5, dark);
    // Saw silhouette (right half).
    for (let x = 9; x <= 13; x++) surf.set(x, 10, dark);
    for (let x = 9; x <= 13; x += 2) surf.set(x, 11, dark);
    surf.set(8, 10, dark);
    for (let y = 8; y <= 9; y++) surf.set(12, y, dark);
  }

  /** Furnace side: stone-like gray block with a faint border. */
  function paintFurnaceSide(surf, rnd) {
    paintStoneBase(surf, rnd, rgb(110, 110, 110), 12);
    bevelBorder(surf, -16, false);
  }

  /** Furnace front: stone with a dark arched opening. */
  function paintFurnaceFront(surf, rnd) {
    paintStoneBase(surf, rnd, rgb(110, 110, 110), 12);
    const dark = rgb(38, 38, 38);
    const stone = rgb(96, 96, 96);
    // Arch: rows 6..13, width tapering at the top.
    for (let y = 6; y < 14; y++) {
      let half = 4;
      if (y === 6) half = 2;
      else if (y === 7) half = 3;
      for (let x = 8 - half; x <= 7 + half; x++) {
        surf.set(x, y, shade(dark, Math.round((rnd() * 2 - 1) * 6)));
      }
    }
    // Stone lip around the opening.
    for (let x = 3; x <= 12; x++) surf.set(x, 5, shade(stone, 12));
    for (let y = 6; y < 14; y++) {
      surf.set(2, y + 1 > 15 ? 15 : y + 1, shade(stone, 8));
      surf.set(13, y + 1 > 15 ? 15 : y + 1, shade(stone, 8));
    }
    // Ember glow specks inside.
    for (let i = 0; i < 5; i++) {
      const x = 6 + ((rnd() * 4) | 0);
      const y = 11 + ((rnd() * 3) | 0);
      surf.set(x, y, rgb(150 + ((rnd() * 60) | 0), 70 + ((rnd() * 40) | 0), 24));
    }
    bevelBorder(surf, -14, false);
  }

  /** Furnace top: stone with a small ring. */
  function paintFurnaceTop(surf, rnd) {
    paintStoneBase(surf, rnd, rgb(112, 112, 112), 12);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 3.5 && d < 5.5) {
          const c = surf.get(x, y);
          surf.set(x, y, shade(c, -26));
        }
      }
    }
    for (let y = 6; y <= 9; y++) {
      for (let x = 6; x <= 9; x++) {
        const c = surf.get(x, y);
        surf.set(x, y, shade(c, 12));
      }
    }
    bevelBorder(surf, -12, false);
  }

  /** Bookshelf: plank border with colored book spines in two rows. */
  function paintBookshelf(surf, rnd) {
    paintOakPlanks(surf, rnd);
    const spineColors = [
      rgb(150, 60, 52), rgb(196, 168, 70), rgb(70, 110, 170), rgb(96, 150, 80),
      rgb(140, 84, 160), rgb(190, 120, 60), rgb(80, 150, 150), rgb(170, 170, 170),
    ];
    const rows = [
      { y0: 2, y1: 6 },
      { y0: 9, y1: 13 },
    ];
    for (const { y0, y1 } of rows) {
      let x = 1;
      let ci = (rnd() * spineColors.length) | 0;
      while (x <= 14) {
        const w = 1 + ((rnd() * 2) | 0);
        const color = spineColors[ci % spineColors.length];
        ci += 1 + ((rnd() * 2) | 0);
        for (let dx = 0; dx < w && x + dx <= 14; dx++) {
          for (let y = y0; y <= y1; y++) {
            let d = Math.round((rnd() * 2 - 1) * 12);
            if (y === y0) d += 16; // lit top
            if (y === y1) d -= 22; // shadowed base
            if (dx === 0) d -= 18; // spine gap shadow
            surf.set(x + dx, y, shade(color, d));
          }
        }
        x += w;
      }
    }
  }

  /** Obsidian: very dark purple-black with faint purple specks. */
  function paintObsidian(surf, rnd) {
    noiseFill(surf, rgb(22, 16, 34), 8, rnd);
    for (let i = 0; i < 22; i++) {
      const x = (rnd() * 16) | 0;
      const y = (rnd() * 16) | 0;
      const purple = rnd() < 0.6;
      const tone = purple
        ? rgb(72 + ((rnd() * 40) | 0), 44 + ((rnd() * 26) | 0), 108 + ((rnd() * 46) | 0))
        : rgb(52, 48, 66);
      surf.set(x, y, tone);
      if (rnd() < 0.4) surf.set(x + 1 > 15 ? 15 : x + 1, y, shade(tone, -20));
    }
    speckle(surf, rgb(96, 66, 140), 12, rnd, 12);
    speckle(surf, rgb(8, 6, 14), 12, rnd, 4);
  }

  /** Netherrack: dark red mottled. */
  function paintNetherrack(surf, rnd) {
    noiseFill(surf, rgb(104, 36, 36), 16, rnd);
    for (let i = 0; i < 26; i++) {
      const x = (rnd() * 15) | 0;
      const y = (rnd() * 15) | 0;
      const w = 1 + ((rnd() * 3) | 0);
      const h = 1 + ((rnd() * 2) | 0);
      const tone = rnd() < 0.5 ? rgb(66, 22, 22) : rgb(146, 58, 52);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) surf.set(x + dx, y + dy, shade(tone, Math.round((rnd() * 2 - 1) * 12)));
      }
    }
  }

  /** Glowstone: dark yellow with bright glowing speck clusters. */
  function paintGlowstone(surf, rnd) {
    noiseFill(surf, rgb(126, 96, 46), 14, rnd);
    for (let i = 0; i < 9; i++) {
      const cx = 1 + ((rnd() * 14) | 0);
      const cy = 1 + ((rnd() * 14) | 0);
      const core = rgb(252, 236, 148);
      surf.set(cx, cy, core);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (rnd() < 0.75) surf.set(cx + dx, cy + dy, shade(core, -26 - ((rnd() * 20) | 0)));
      }
      if (rnd() < 0.5) surf.set(cx + 1, cy + 1, shade(core, -60));
    }
    speckle(surf, rgb(186, 150, 76), 20, rnd, 10);
  }

  /** Torch: 2x10 centered stick, bright flame on top, rest transparent. */
  function paintTorch(surf, rnd) {
    surf.clear();
    const stick = rgb(122, 90, 52);
    const stickDark = rgb(88, 62, 34);
    // Stick spans x=7..8, y=6..15 (bottom row 15 reaches the block base).
    for (let y = 6; y < 16; y++) {
      for (let x = 7; x <= 8; x++) {
        let d = Math.round((rnd() * 2 - 1) * 10);
        if (x === 7) d -= 18; // shaded left half
        if (y % 4 === 0) d -= 8; // grain
        surf.set(x, y, shade(stick, d));
      }
    }
    // Dark base ring so the stick reads as planted.
    surf.set(7, 15, stickDark);
    surf.set(8, 15, shade(stickDark, 14));
    // Flame: bright yellow/white blob at the top.
    const flameCore = rgb(255, 248, 200);
    const flameMid = rgb(255, 208, 92);
    const flameOuter = rgb(232, 140, 40);
    const flame = [
      // y, list of [x, colorKey]
      [2, [[7, 'o'], [8, 'o']]],
      [3, [[6, 'o'], [7, 'm'], [8, 'm'], [9, 'o']]],
      [4, [[6, 'o'], [7, 'c'], [8, 'c'], [9, 'o']]],
      [5, [[7, 'm'], [8, 'm']]],
    ];
    const pick = { c: flameCore, m: flameMid, o: flameOuter };
    for (const [y, cells] of flame) {
      for (const [x, key] of cells) {
        surf.set(x, y, shade(pick[key], Math.round((rnd() * 2 - 1) * 8)));
      }
    }
    // A small white-hot core pixel.
    surf.set(7, 3, flameCore);
    surf.set(8, 4, flameCore);
  }

  /** TNT side: red body, white band with dark dashes. */
  function paintTntSide(surf, rnd) {
    noiseFill(surf, rgb(178, 52, 40), 12, rnd);
    // White band rows 5..10.
    for (let y = 5; y <= 10; y++) {
      for (let x = 0; x < 16; x++) {
        const edge = y === 5 || y === 10;
        surf.set(x, y, shade(rgb(232, 232, 226), edge ? -22 : Math.round((rnd() * 2 - 1) * 8)));
      }
    }
    // Dark "TNT" dashes: T, N, T across the band.
    const dark = rgb(48, 34, 32);
    const glyphs = [
      // T
      [[2, 6], [3, 6], [4, 6], [3, 7], [3, 8]],
      // N
      [[6, 6], [7, 6], [9, 6], [6, 7], [7, 7], [9, 7], [6, 8], [8, 8], [9, 8]],
      // T
      [[11, 6], [12, 6], [13, 6], [12, 7], [12, 8]],
    ];
    for (const glyph of glyphs) {
      for (const [x, y] of glyph) surf.set(x, y, dark);
    }
    // Darker top/bottom rim of the block.
    bevelBorder(surf, -16, false);
  }

  /** TNT top: red with a lighter fuse circle. */
  function paintTntTop(surf, rnd) {
    noiseFill(surf, rgb(178, 52, 40), 12, rnd);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
        if (d < 3) {
          const c = surf.get(x, y);
          surf.set(x, y, shade(c, 34));
        } else if (d < 4) {
          const c = surf.get(x, y);
          surf.set(x, y, shade(c, 12));
        }
      }
    }
    // Fuse: dark speck trail from the center to an edge.
    const fuse = [[7, 7], [8, 8], [9, 9], [10, 10], [11, 11], [12, 12]];
    for (const [x, y] of fuse) surf.set(x, y, rgb(58, 44, 38));
    surf.set(13, 13, rgb(240, 220, 140));
    surf.set(12, 12, rgb(30, 24, 20));
    bevelBorder(surf, -16, false);
  }

  /** Wool: fine noise in the given base color. */
  function paintWool(surf, rnd, base) {
    noiseFill(surf, base, 8, rnd);
    // Wool fiber: short 2px strokes.
    for (let i = 0; i < 30; i++) {
      const x = (rnd() * 15) | 0;
      const y = (rnd() * 15) | 0;
      const d = rnd() < 0.5 ? -14 : 12;
      surf.set(x, y, shade(base, d));
      if (rnd() < 0.6) surf.set(x + 1 > 15 ? 15 : x + 1, y, shade(base, d + 4));
    }
  }

  /** Sponge: yellow with dark holes. */
  function paintSponge(surf, rnd) {
    const base = rgb(206, 196, 84);
    noiseFill(surf, base, 10, rnd);
    // Holes: 1-2px dark cavities scattered evenly.
    for (let i = 0; i < 16; i++) {
      const x = 1 + ((rnd() * 14) | 0);
      const y = 1 + ((rnd() * 14) | 0);
      surf.set(x, y, rgb(120, 110, 40));
      if (rnd() < 0.5) surf.set(x + 1, y, rgb(146, 134, 52));
      if (rnd() < 0.4) surf.set(x, y + 1, rgb(96, 88, 30));
    }
    speckle(surf, shade(base, 20), 18, rnd, 8);
  }

  /** Diamond block: cyan gem pattern on light gray. */
  function paintDiamondBlock(surf, rnd) {
    noiseFill(surf, rgb(150, 150, 152), 8, rnd);
    // Four cyan gems in a 2x2 arrangement, plus a center gem.
    const gems = [[3, 3], [10, 3], [3, 10], [10, 10], [6, 6]];
    for (const [gx, gy] of gems) {
      const big = gx === 6;
      const size = big ? 4 : 3;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if ((x === 0 || x === size - 1) && (y === 0 || y === size - 1)) continue;
          const gem = rgb(96, 220, 220);
          let d = Math.round((rnd() * 2 - 1) * 12);
          if (x === 0 || y === 0) d += 22;
          if (x === size - 1 || y === size - 1) d -= 24;
          surf.set(gx + x, gy + y, shade(gem, d));
        }
      }
      surf.set(gx + (size >> 1), gy + (size >> 1), rgb(226, 252, 252));
    }
    speckle(surf, rgb(120, 120, 124), 14, rnd, 6);
  }

  /** Gold block: yellow with a blocky shine. */
  function paintGoldBlock(surf, rnd) {
    const base = rgb(246, 208, 62);
    noiseFill(surf, base, 8, rnd);
    // Beveled shine: light top-left, dark bottom-right.
    for (let i = 0; i < 16; i++) {
      surf.set(i, 0, shade(base, 22));
      surf.set(i, 1, shade(base, 14));
      surf.set(0, i, shade(base, 20));
      surf.set(1, i, shade(base, 12));
      surf.set(i, 15, shade(base, -34));
      surf.set(i, 14, shade(base, -20));
      surf.set(15, i, shade(base, -32));
      surf.set(14, i, shade(base, -18));
    }
    // Blocky glint patch.
    for (let y = 4; y <= 7; y++) {
      for (let x = 4; x <= 7; x++) {
        const c = surf.get(x, y);
        surf.set(x, y, shade(c, 12));
      }
    }
    speckle(surf, shade(base, -26), 14, rnd, 8);
  }

  /** Iron block: light gray with bevel edges. */
  function paintIronBlock(surf, rnd) {
    const base = rgb(198, 198, 198);
    noiseFill(surf, base, 8, rnd);
    for (let i = 0; i < 16; i++) {
      surf.set(i, 0, shade(base, 24));
      surf.set(i, 1, shade(base, 12));
      surf.set(0, i, shade(base, 22));
      surf.set(i, 15, shade(base, -34));
      surf.set(i, 14, shade(base, -18));
      surf.set(15, i, shade(base, -32));
    }
    // Inner panel outline.
    for (let i = 3; i < 13; i++) {
      surf.set(i, 3, shade(base, -18));
      surf.set(i, 12, shade(base, 12));
      surf.set(3, i, shade(base, -14));
      surf.set(12, i, shade(base, 8));
    }
    speckle(surf, shade(base, -18), 12, rnd, 6);
  }

  /** Coal block: near-black with a faint shine. */
  function paintCoalBlock(surf, rnd) {
    noiseFill(surf, rgb(30, 30, 30), 8, rnd);
    for (let i = 0; i < 10; i++) {
      const x = (rnd() * 14) | 0;
      const y = (rnd() * 14) | 0;
      const w = 2 + ((rnd() * 3) | 0);
      for (let dx = 0; dx < w; dx++) {
        const c = surf.get(x + dx, y);
        surf.set(x + dx, y, shade(c, 26));
      }
    }
    for (let i = 0; i < 16; i++) {
      const x = (rnd() * 16) | 0;
      const y = (rnd() * 16) | 0;
      surf.set(x, y, rgb(8, 8, 8));
    }
  }

  /** Farmland: dark brown with a slight grid of furrows. */
  function paintFarmland(surf, rnd) {
    paintDirtBase(surf, rnd, rgb(104, 68, 42));
    // Furrow grid: darker lines every 4 px, with a lighter ridge beside them.
    for (let i = 0; i < 16; i++) {
      for (const p of [3, 7, 11, 15]) {
        const c = surf.get(p, i);
        surf.set(p, i, shade(c, -26));
        const c2 = surf.get(i, p);
        surf.set(i, p, shade(c2, -20));
      }
      for (const p of [2, 6, 10, 14]) {
        const c = surf.get(p, i);
        surf.set(p, i, shade(c, 10));
        const c2 = surf.get(i, p);
        surf.set(i, p, shade(c2, 8));
      }
    }
    speckle(surf, rgb(66, 42, 26), 18, rnd, 8);
  }

  /** Grass path: tan/brown packed dirt. */
  function paintGrassPath(surf, rnd) {
    const base = rgb(148, 118, 76);
    noiseFill(surf, base, 12, rnd);
    speckle(surf, shade(base, -26), 28, rnd, 8);
    speckle(surf, shade(base, 18), 18, rnd, 6);
    // Packed-dirt plate edges.
    for (let i = 0; i < 16; i++) {
      const c = surf.get(i, 0);
      surf.set(i, 0, shade(c, 10));
      const c2 = surf.get(i, 15);
      surf.set(i, 15, shade(c2, -18));
    }
    for (let i = 0; i < 6; i++) {
      const x = (rnd() * 14) | 0;
      const y = (rnd() * 14) | 0;
      for (let dx = 0; dx < 3; dx++) {
        const c = surf.get(x + dx, y);
        surf.set(x + dx, y, shade(c, rnd() < 0.5 ? -18 : 12));
      }
    }
  }

  /** Lava: orange/red mottled with brighter cores. */
  function paintLava(surf, rnd) {
    noiseFill(surf, rgb(198, 74, 18), 18, rnd);
    for (let i = 0; i < 12; i++) {
      const cx = 1 + ((rnd() * 14) | 0);
      const cy = 1 + ((rnd() * 14) | 0);
      const core = rgb(252, 216, 96);
      surf.set(cx, cy, core);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]) {
        if (rnd() < 0.7) surf.set(cx + dx, cy + dy, shade(core, -50 - ((rnd() * 40) | 0)));
      }
    }
    // Dark crust patches.
    for (let i = 0; i < 14; i++) {
      const x = (rnd() * 15) | 0;
      const y = (rnd() * 15) | 0;
      const c = surf.get(x, y);
      surf.set(x, y, shade(c, -60));
    }
    speckle(surf, rgb(150, 40, 12), 16, rnd, 10);
  }

  /** Mycelium top: purple-gray with specks. */
  function paintMyceliumTop(surf, rnd) {
    noiseFill(surf, rgb(126, 116, 130), 12, rnd);
    speckle(surf, rgb(92, 82, 100), 30, rnd, 8);
    speckle(surf, rgb(168, 158, 174), 22, rnd, 8);
    // Scattered purple dots (mycelium spores).
    for (let i = 0; i < 22; i++) {
      const x = (rnd() * 16) | 0;
      const y = (rnd() * 16) | 0;
      surf.set(x, y, shade(rgb(146, 118, 168), Math.round((rnd() * 2 - 1) * 18)));
    }
  }

  /** Podzol top: dark brown/orange top soil. */
  function paintPodzolTop(surf, rnd) {
    noiseFill(surf, rgb(96, 62, 26), 14, rnd);
    speckle(surf, rgb(140, 92, 32), 30, rnd, 10);
    speckle(surf, rgb(58, 38, 16), 24, rnd, 8);
    for (let i = 0; i < 8; i++) {
      const x = (rnd() * 14) | 0;
      const y = (rnd() * 14) | 0;
      for (let dx = 0; dx < 3; dx++) {
        const c = surf.get(x + dx, y);
        surf.set(x + dx, y, shade(c, rnd() < 0.5 ? -20 : 16));
      }
    }
  }

  /** Clay: light gray-blue fine noise. */
  function paintClay(surf, rnd) {
    const base = rgb(160, 166, 179);
    noiseFill(surf, base, 8, rnd);
    speckle(surf, shade(base, -16), 34, rnd, 5);
    speckle(surf, shade(base, 12), 22, rnd, 4);
  }

  /** Sugar cane: green vertical stalks with alpha gaps. */
  function paintSugarCane(surf, rnd) {
    surf.clear();
    const stalk = rgb(122, 176, 76);
    const stalkDark = rgb(86, 136, 52);
    // Three vertical stalks at x=2..3, 7..8, 12..13 with gaps between them.
    const stalks = [[2, 3], [7, 8], [12, 13]];
    for (const [x0, x1] of stalks) {
      const top = (rnd() * 3) | 0;
      for (let y = top; y < 16; y++) {
        // Joint rings every 5 rows.
        const joint = (y - top) % 5 === 4;
        for (let x = x0; x <= x1; x++) {
          let d = Math.round((rnd() * 2 - 1) * 10);
          if (x === x0) d -= 20;
          if (joint) d -= 24;
          surf.set(x, y, shade(joint ? stalkDark : stalk, d));
        }
        if (rnd() < 0.18 && y + 1 < 16) surf.set(x0 + 1, y + 1, shade(stalk, 24));
      }
    }
  }

  /** Dead bush: brown twigs on transparency. */
  function paintDeadBush(surf, rnd) {
    surf.clear();
    const twig = rgb(122, 88, 46);
    const twigDark = rgb(88, 60, 30);
    // Central trunk.
    for (let y = 6; y < 16; y++) {
      surf.set(7, y, shade(twig, Math.round((rnd() * 2 - 1) * 12)));
      if (y > 9 && rnd() < 0.5) surf.set(8, y, twigDark);
    }
    // Branches: deterministic diagonals.
    const branches = [
      [[6, 9], [5, 8], [4, 7], [3, 6], [2, 5]],
      [[8, 10], [9, 9], [10, 8], [11, 7], [12, 6]],
      [[6, 12], [5, 11], [4, 11], [3, 10]],
      [[8, 13], [9, 12], [10, 12], [11, 11]],
      [[7, 7], [6, 6], [5, 5]],
      [[8, 8], [9, 7], [10, 6]],
    ];
    for (const chain of branches) {
      for (const [x, y] of chain) {
        if (x < 0 || x > 15 || y < 0 || y > 15) continue;
        surf.set(x, y, shade(rnd() < 0.3 ? twigDark : twig, Math.round((rnd() * 2 - 1) * 12)));
      }
    }
    // A few twig tips.
    for (const [x, y] of [[2, 4], [13, 5], [3, 9], [11, 10], [5, 4], [10, 5]]) {
      surf.set(x, y, shade(twigDark, 6));
    }
  }

  /** Rail: two gray rails on brown sleepers, alpha gaps elsewhere. */
  function paintRail(surf, rnd) {
    surf.clear();
    const sleeper = rgb(112, 78, 44);
    const railTop = rgb(184, 184, 184);
    const railDark = rgb(108, 108, 108);
    // Sleepers: rows 2, 7, 12 spanning x=2..13.
    for (const sy of [2, 7, 12]) {
      for (let x = 2; x <= 13; x++) {
        surf.set(x, sy, shade(sleeper, Math.round((rnd() * 2 - 1) * 10)));
        if (rnd() < 0.3) surf.set(x, sy + 1 > 15 ? 15 : sy + 1, shade(sleeper, -18));
      }
    }
    // Two vertical rails at x=4..5 and x=10..11 across the whole tile.
    for (const rx of [4, 10]) {
      for (let y = 0; y < 16; y++) {
        surf.set(rx, y, shade(railTop, Math.round((rnd() * 2 - 1) * 10)));
        surf.set(rx + 1, y, shade(railDark, Math.round((rnd() * 2 - 1) * 8)));
      }
    }
  }

  /**
   * Cross-shaped flower: a 2x2 blossom near the top-centre with a darker centre
   * pixel, a 1px green stem down the middle to the bottom edge, and two small
   * green leaves. Everything else stays transparent (alpha 0); drawn texels are
   * fully opaque (alpha 255).
   */
  function paintFlower(surf, rnd, blossom, blossomCentre, leaf = rgb(78, 138, 50)) {
    surf.clear();
    const stem = rgb(84, 140, 52);

    // Stem: x=7, rows 5..15 (reaches the block base).
    for (let y = 5; y < 16; y++) {
      let d = Math.round((rnd() * 2 - 1) * 10);
      if (y % 5 === 4) d -= 14; // faint joint rings
      surf.set(7, y, shade(stem, d));
    }

    // Leaves: one up-left, one down-right, 2 texels each.
    surf.set(6, 10, shade(leaf, Math.round((rnd() * 2 - 1) * 8)));
    surf.set(5, 9, shade(leaf, -12));
    surf.set(8, 12, shade(leaf, Math.round((rnd() * 2 - 1) * 8)));
    surf.set(9, 13, shade(leaf, -12));

    // Blossom: 2x2 of petals at x=6..7, y=3..4 plus a petal to the right,
    // with the centre pixel a shade darker.
    const petals = [
      [6, 3], [7, 3], [8, 3],
      [6, 4], [8, 4],
      [6, 5], [7, 5],
    ];
    for (const [x, y] of petals) {
      surf.set(x, y, shade(blossom, Math.round((rnd() * 2 - 1) * 10)));
    }
    // Centre (slightly darker) and a highlight on the lit upper-left petal.
    surf.set(7, 4, shade(blossomCentre, Math.round((rnd() * 2 - 1) * 8)));
    surf.set(6, 3, shade(blossom, 20));
    surf.set(7, 3, shade(blossom, 12));
  }

  // ---------------------------------------------------------------------------
  // Tile registry — name -> painter(surface, rnd)
  // ---------------------------------------------------------------------------

  const ORE_COLORS = {
    coal_ore: rgb(28, 28, 30),
    iron_ore: rgb(206, 160, 128),
    gold_ore: rgb(248, 214, 66),
    diamond_ore: rgb(106, 230, 228),
    redstone_ore: rgb(202, 36, 32),
    emerald_ore: rgb(56, 210, 96),
  };

  /** @type {Record<string, (s: Surface, rnd: () => number) => void>} */
  const PAINTERS = {
    stone: (s, r) => paintStoneBase(s, r),
    dirt: (s, r) => paintDirtBase(s, r),
    grass_top: (s, r) => {
      const base = rgb(96, 154, 62);
      noiseFill(s, base, 14, r);
      speckle(s, shade(base, -28), 30, r, 10);
      speckle(s, shade(base, 24), 24, r, 10);
      for (let i = 0; i < 8; i++) {
        const x = (r() * 15) | 0;
        const y = (r() * 15) | 0;
        s.set(x, y, shade(base, 30));
        if (r() < 0.5) s.set(x + 1 > 15 ? 15 : x + 1, y, shade(base, -22));
      }
    },
    grass_side: (s, r) => {
      paintDirtBase(s, r);
      const green = rgb(96, 154, 62);
      const greenDark = rgb(66, 116, 44);
      // Fringe ~4px tall with an irregular jagged bottom edge.
      const heights = [4, 4, 3, 5, 4, 3, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4];
      for (let x = 0; x < 16; x++) {
        const h = heights[x] + (r() < 0.25 ? (r() < 0.5 ? 1 : -1) : 0);
        for (let y = 0; y < Math.max(2, h); y++) {
          let d = Math.round((r() * 2 - 1) * 12);
          if (y === 0) d += 16;
          if (y >= h - 1) d -= 18;
          s.set(x, y, shade(y > 2 ? greenDark : green, d));
        }
        // Hanging grass lip below the fringe.
        if (r() < 0.5) {
          const y = Math.max(2, h);
          if (y < 16) s.set(x, y, shade(greenDark, -18));
        }
      }
    },
    cobblestone: (s, r) => paintCobblestone(s, r),
    sand: (s, r) => paintSand(s, r),
    sandstone_top: (s, r) => {
      paintSand(s, r, rgb(222, 210, 158));
      // Faint inner border like a cut stone slab.
      for (let i = 2; i < 14; i++) {
        s.set(i, 2, shade(rgb(222, 210, 158), -14));
        s.set(i, 13, shade(rgb(222, 210, 158), -10));
        s.set(2, i, shade(rgb(222, 210, 158), -12));
        s.set(13, i, shade(rgb(222, 210, 158), -8));
      }
      speckle(s, rgb(190, 176, 124), 20, r, 6);
    },
    sandstone_side: (s, r) => {
      const base = rgb(216, 202, 148);
      noiseFill(s, base, 8, r);
      // Banded layers: darker seams at rows 0, 4, 8, 12 with lighter bands between.
      for (let y = 0; y < 16; y++) {
        const seam = y % 4 === 0;
        for (let x = 0; x < 16; x++) {
          const c = s.get(x, y);
          let d = Math.round((r() * 2 - 1) * 5);
          if (seam) d -= 22;
          else if (y % 4 === 3) d -= 8;
          else d += 6;
          s.set(x, y, shade(c, d));
        }
      }
      speckle(s, rgb(184, 168, 118), 18, r, 6);
    },
    gravel: (s, r) => paintGravel(s, r),
    oak_log_side: (s, r) => paintLogSide(s, r),
    oak_log_top: (s, r) => paintLogTop(s, r),
    oak_planks: (s, r) => paintOakPlanks(s, r),
    oak_leaves: (s, r) => paintLeaves(s, r),
    water: (s, r) => paintWater(s, r),
    bedrock: (s, r) => paintBedrock(s, r),
    coal_ore: (s, r) => paintOre(s, r, ORE_COLORS.coal_ore, 5, 1),
    iron_ore: (s, r) => paintOre(s, r, ORE_COLORS.iron_ore, 5, 1),
    gold_ore: (s, r) => paintOre(s, r, ORE_COLORS.gold_ore, 5, 1),
    diamond_ore: (s, r) => paintOre(s, r, ORE_COLORS.diamond_ore, 5, 1),
    redstone_ore: (s, r) => paintOre(s, r, ORE_COLORS.redstone_ore, 6, 1),
    emerald_ore: (s, r) => paintOre(s, r, ORE_COLORS.emerald_ore, 5, 1),
    bricks: (s, r) => paintBricks(s, r),
    stone_bricks: (s, r) => paintStoneBricks(s, r),
    glass: (s, r) => paintGlass(s, r),
    snow: (s, r) => paintSnow(s, r),
    ice: (s, r) => paintIce(s, r),
    cactus_side: (s, r) => paintCactusSide(s, r),
    cactus_top: (s, r) => paintCactusTop(s, r),
    pumpkin_side: (s, r) => paintPumpkinSide(s, r),
    pumpkin_top: (s, r) => paintPumpkinTop(s, r),
    pumpkin_face: (s, r) => paintPumpkinFace(s, r),
    crafting_table_top: (s, r) => paintCraftingTableTop(s, r),
    crafting_table_side: (s, r) => paintCraftingTableSide(s, r),
    furnace_side: (s, r) => paintFurnaceSide(s, r),
    furnace_front: (s, r) => paintFurnaceFront(s, r),
    furnace_top: (s, r) => paintFurnaceTop(s, r),
    bookshelf: (s, r) => paintBookshelf(s, r),
    obsidian: (s, r) => paintObsidian(s, r),
    netherrack: (s, r) => paintNetherrack(s, r),
    glowstone: (s, r) => paintGlowstone(s, r),
    torch: (s, r) => paintTorch(s, r),
    tnt_side: (s, r) => paintTntSide(s, r),
    tnt_top: (s, r) => paintTntTop(s, r),
    wool_white: (s, r) => paintWool(s, r, rgb(232, 236, 236)),
    sponge: (s, r) => paintSponge(s, r),
    diamond_block: (s, r) => paintDiamondBlock(s, r),
    gold_block: (s, r) => paintGoldBlock(s, r),
    iron_block: (s, r) => paintIronBlock(s, r),
    coal_block: (s, r) => paintCoalBlock(s, r),
    farmland: (s, r) => paintFarmland(s, r),
    grass_path: (s, r) => paintGrassPath(s, r),
    lava: (s, r) => paintLava(s, r),
    mycelium_top: (s, r) => paintMyceliumTop(s, r),
    podzol_top: (s, r) => paintPodzolTop(s, r),
    clay: (s, r) => paintClay(s, r),
    sugar_cane: (s, r) => paintSugarCane(s, r),
    dead_bush: (s, r) => paintDeadBush(s, r),
    rail: (s, r) => paintRail(s, r),
    dandelion: (s, r) => paintFlower(s, r, rgb(246, 222, 82), rgb(212, 150, 34)),
    poppy: (s, r) => paintFlower(s, r, rgb(216, 56, 46), rgb(120, 22, 24)),
  };

  // ---------------------------------------------------------------------------
  // Tile painting + atlas assembly
  // ---------------------------------------------------------------------------

  /** Atlas cell for a tile index. */
  function cellFor(index) {
    return { col: index % ATLAS_COLS, row: Math.floor(index / ATLAS_COLS) };
  }

  /** Paint one named tile into a fresh Surface (deterministic per name). */
  function paintTile(name, index) {
    const painter = PAINTERS[name];
    const surf = new Surface(TILE_PX);
    if (!painter) {
      // Unknown tile: leave transparent black so the gap is obvious, but never throw.
      return surf;
    }
    // Seed mixes the name hash with the atlas index so identical painters that are
    // reused for different tiles (e.g. ore variants) still differ.
    const rnd = mulberry32((hashName(name) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
    painter(surf, rnd);
    return surf;
  }

  function makeCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  /**
   * Generates the full texture atlas.
   * @returns {{canvas: HTMLCanvasElement, size: number, columns: number, rows: number, tilePx: number, indexByName: Record<string, number>}}
   */
  function generateAtlas() {
    const size = ATLAS_COLS * TILE_PX;
    const width = ATLAS_COLS * TILE_PX;
    const height = ATLAS_ROWS * TILE_PX;
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const indexByName = {};
    for (let i = 0; i < TEXTURE_NAMES.length; i++) indexByName[TEXTURE_NAMES[i]] = i;
    // Mutate the exported object in place rather than rebinding it, so every
    // importer of TILE_INDEX holds the canonical map after this call.
    for (const key of Object.keys(TILE_INDEX)) delete TILE_INDEX[key];
    Object.assign(TILE_INDEX, indexByName);

    for (let i = 0; i < TEXTURE_NAMES.length; i++) {
      const name = TEXTURE_NAMES[i];
      const { col, row } = cellFor(i);
      if (row >= ATLAS_ROWS || col >= ATLAS_COLS) continue; // never overflow the atlas
      const surf = paintTile(name, i);
      const img = new ImageData(surf.data, TILE_PX, TILE_PX);
      ctx.putImageData(img, col * TILE_PX, row * TILE_PX);
    }

    return {
      canvas,
      size,
      columns: ATLAS_COLS,
      rows: ATLAS_ROWS,
      tilePx: TILE_PX,
      indexByName,
    };
  }

  /**
   * Renders a single named tile onto its own 16x16 canvas (for the inventory UI).
   * Works whether or not generateAtlas() has been called.
   * @param {string} name
   * @returns {HTMLCanvasElement}
   */
  function generateTileCanvas(name) {
    const canvas = makeCanvas(TILE_PX, TILE_PX);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    const index = Object.prototype.hasOwnProperty.call(TILE_INDEX, name)
      ? TILE_INDEX[name]
      : TEXTURE_NAMES.indexOf(name);
    if (index < 0) return canvas; // unknown name -> transparent tile
    const surf = paintTile(name, index);
    ctx.putImageData(new ImageData(surf.data, TILE_PX, TILE_PX), 0, 0);
    return canvas;
  }

  G["generateAtlas"] = generateAtlas;
  G["generateTileCanvas"] = generateTileCanvas;
  G["TILE_PX"] = TILE_PX;
  G["ATLAS_COLS"] = ATLAS_COLS;
  G["ATLAS_ROWS"] = ATLAS_ROWS;
  G["TEXTURE_NAMES"] = TEXTURE_NAMES;
  G["TILE_INDEX"] = TILE_INDEX;
})(__mc);

/* ---- src/render/atlas.js ------------------------------------------------- */
(function (G) {
  const manifest = {
 "generatedBy": "tools/gen-tile-manifest.mjs",
 "note": "tile id = index in TEXTURE_NAMES + 1; atlas layout is row-major",
 "atlasCols": 16,
 "atlasRows": 32,
 "tileNames": [
  "stone",
  "dirt",
  "grass_top",
  "grass_side",
  "cobblestone",
  "sand",
  "sandstone_top",
  "sandstone_side",
  "gravel",
  "oak_log_side",
  "oak_log_top",
  "oak_planks",
  "oak_leaves",
  "water",
  "bedrock",
  "coal_ore",
  "iron_ore",
  "gold_ore",
  "diamond_ore",
  "redstone_ore",
  "emerald_ore",
  "bricks",
  "stone_bricks",
  "glass",
  "snow",
  "ice",
  "cactus_side",
  "cactus_top",
  "pumpkin_side",
  "pumpkin_top",
  "pumpkin_face",
  "crafting_table_top",
  "crafting_table_side",
  "furnace_side",
  "furnace_front",
  "furnace_top",
  "bookshelf",
  "obsidian",
  "netherrack",
  "glowstone",
  "torch",
  "tnt_side",
  "tnt_top",
  "wool_white",
  "sponge",
  "diamond_block",
  "gold_block",
  "iron_block",
  "coal_block",
  "farmland",
  "grass_path",
  "lava",
  "mycelium_top",
  "podzol_top",
  "clay",
  "sugar_cane",
  "dead_bush",
  "rail",
  "dandelion",
  "poppy"
 ],
 "tileIds": {
  "stone": 1,
  "dirt": 2,
  "grass_top": 3,
  "grass_side": 4,
  "cobblestone": 5,
  "sand": 6,
  "sandstone_top": 7,
  "sandstone_side": 8,
  "gravel": 9,
  "oak_log_side": 10,
  "oak_log_top": 11,
  "oak_planks": 12,
  "oak_leaves": 13,
  "water": 14,
  "bedrock": 15,
  "coal_ore": 16,
  "iron_ore": 17,
  "gold_ore": 18,
  "diamond_ore": 19,
  "redstone_ore": 20,
  "emerald_ore": 21,
  "bricks": 22,
  "stone_bricks": 23,
  "glass": 24,
  "snow": 25,
  "ice": 26,
  "cactus_side": 27,
  "cactus_top": 28,
  "pumpkin_side": 29,
  "pumpkin_top": 30,
  "pumpkin_face": 31,
  "crafting_table_top": 32,
  "crafting_table_side": 33,
  "furnace_side": 34,
  "furnace_front": 35,
  "furnace_top": 36,
  "bookshelf": 37,
  "obsidian": 38,
  "netherrack": 39,
  "glowstone": 40,
  "torch": 41,
  "tnt_side": 42,
  "tnt_top": 43,
  "wool_white": 44,
  "sponge": 45,
  "diamond_block": 46,
  "gold_block": 47,
  "iron_block": 48,
  "coal_block": 49,
  "farmland": 50,
  "grass_path": 51,
  "lava": 52,
  "mycelium_top": 53,
  "podzol_top": 54,
  "clay": 55,
  "sugar_cane": 56,
  "dead_bush": 57,
  "rail": 58,
  "dandelion": 59,
  "poppy": 60
 },
 "aliases": {},
 "blockFaces": [
  [
   1,
   1,
   1,
   1,
   1,
   1
  ],
  [
   1,
   1,
   1,
   1,
   1,
   1
  ],
  [
   4,
   4,
   3,
   2,
   4,
   4
  ],
  [
   2,
   2,
   2,
   2,
   2,
   2
  ],
  [
   5,
   5,
   5,
   5,
   5,
   5
  ],
  [
   12,
   12,
   12,
   12,
   12,
   12
  ],
  [
   15,
   15,
   15,
   15,
   15,
   15
  ],
  [
   14,
   14,
   14,
   14,
   14,
   14
  ],
  [
   6,
   6,
   6,
   6,
   6,
   6
  ],
  [
   9,
   9,
   9,
   9,
   9,
   9
  ],
  [
   10,
   10,
   11,
   11,
   10,
   10
  ],
  [
   13,
   13,
   13,
   13,
   13,
   13
  ],
  [
   8,
   8,
   7,
   7,
   8,
   8
  ],
  [
   16,
   16,
   16,
   16,
   16,
   16
  ],
  [
   17,
   17,
   17,
   17,
   17,
   17
  ],
  [
   18,
   18,
   18,
   18,
   18,
   18
  ],
  [
   19,
   19,
   19,
   19,
   19,
   19
  ],
  [
   20,
   20,
   20,
   20,
   20,
   20
  ],
  [
   21,
   21,
   21,
   21,
   21,
   21
  ],
  [
   24,
   24,
   24,
   24,
   24,
   24
  ],
  [
   22,
   22,
   22,
   22,
   22,
   22
  ],
  [
   23,
   23,
   23,
   23,
   23,
   23
  ],
  [
   25,
   25,
   25,
   25,
   25,
   25
  ],
  [
   26,
   26,
   26,
   26,
   26,
   26
  ],
  [
   27,
   27,
   28,
   28,
   27,
   27
  ],
  [
   29,
   29,
   30,
   30,
   29,
   29
  ],
  [
   40,
   40,
   40,
   40,
   40,
   40
  ],
  [
   41,
   41,
   41,
   41,
   41,
   41
  ],
  [
   33,
   33,
   32,
   12,
   33,
   33
  ],
  [
   34,
   34,
   36,
   36,
   34,
   34
  ],
  [
   37,
   37,
   37,
   37,
   37,
   37
  ],
  [
   38,
   38,
   38,
   38,
   38,
   38
  ],
  [
   39,
   39,
   39,
   39,
   39,
   39
  ],
  [
   42,
   42,
   43,
   43,
   42,
   42
  ],
  [
   44,
   44,
   44,
   44,
   44,
   44
  ],
  [
   46,
   46,
   46,
   46,
   46,
   46
  ],
  [
   47,
   47,
   47,
   47,
   47,
   47
  ],
  [
   48,
   48,
   48,
   48,
   48,
   48
  ],
  [
   49,
   49,
   49,
   49,
   49,
   49
  ],
  [
   50,
   50,
   50,
   50,
   50,
   50
  ],
  [
   51,
   51,
   51,
   51,
   51,
   51
  ],
  [
   52,
   52,
   52,
   52,
   52,
   52
  ],
  [
   53,
   53,
   53,
   2,
   53,
   53
  ],
  [
   2,
   2,
   54,
   2,
   2,
   2
  ],
  [
   55,
   55,
   55,
   55,
   55,
   55
  ],
  [
   56,
   56,
   56,
   56,
   56,
   56
  ],
  [
   57,
   57,
   57,
   57,
   57,
   57
  ],
  [
   58,
   58,
   58,
   58,
   58,
   58
  ],
  [
   10,
   10,
   11,
   11,
   10,
   10
  ],
  [
   12,
   12,
   12,
   12,
   12,
   12
  ],
  [
   13,
   13,
   13,
   13,
   13,
   13
  ],
  [
   10,
   10,
   11,
   11,
   10,
   10
  ],
  [
   12,
   12,
   12,
   12,
   12,
   12
  ],
  [
   13,
   13,
   13,
   13,
   13,
   13
  ],
  [
   59,
   59,
   59,
   59,
   59,
   59
  ],
  [
   60,
   60,
   60,
   60,
   60,
   60
  ],
  [
   13,
   13,
   13,
   13,
   13,
   13
  ],
  [
   3,
   3,
   3,
   3,
   3,
   3
  ],
  [
   1,
   1,
   1,
   1,
   1,
   1
  ]
 ]
};
  /**
   * Builds the block texture atlas and the crack (block-breaking) overlay from
   * procedurally generated 16 x 16 tiles.
   *
   * Atlas geometry comes from src/world/tile-manifest.json so that the worker,
   * the renderer and this module all agree on tile ids.
   */



  const ATLAS_COLS = manifest.atlasCols;
  const ATLAS_ROWS = manifest.atlasRows;

  /** Atlas cell (column, row) of a texture name from the manifest. */
  function tileCell(name) {
    const id = manifest.tileIds[name];
    if (id === undefined) return null;
    const index = id - 1;
    return { col: index % ATLAS_COLS, row: Math.floor(index / ATLAS_COLS) };
  }

  /** Cache so repeated calls for the same tile do not regenerate pixels. */
  const tileCanvasCache = new Map();

  function tileCanvas(name) {
    let canvas = tileCanvasCache.get(name);
    if (canvas) return canvas;
    try {
      canvas = G["generateTileCanvas"](name);
    } catch (err) {
      console.warn(`[atlas] tile "${name}" failed to generate, using a placeholder`, err);
      canvas = placeholderTile();
    }
    tileCanvasCache.set(name, canvas);
    return canvas;
  }

  function placeholderTile() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = G["TILE_PX"];
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c020c0';
    ctx.fillRect(0, 0, G["TILE_PX"], G["TILE_PX"]);
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, G["TILE_PX"] / 2, G["TILE_PX"] / 2);
    ctx.fillRect(G["TILE_PX"] / 2, G["TILE_PX"] / 2, G["TILE_PX"] / 2, G["TILE_PX"] / 2);
    return canvas;
  }

  /**
   * Composes every texture the manifest references into one atlas canvas.
   * Tiles are laid out at the atlas cell the manifest assigned them.
   *
   * The result is cached because building it is the single most expensive thing
   * that happens at boot, and the renderer may be recreated (world reload).
   *
   * @returns {{ canvas: HTMLCanvasElement, size: [number, number], missing: string[], ms: number }}
   */
  let cachedAtlas = null;

  function buildAtlas() {
    if (cachedAtlas) return cachedAtlas;
    const started = performance.now();
    const width = ATLAS_COLS * G["TILE_PX"];
    const height = ATLAS_ROWS * G["TILE_PX"];
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    const missing = [];
    for (const name of manifest.tileNames) {
      const cell = tileCell(name);
      if (!cell) continue;
      let tile;
      try {
        tile = tileCanvas(name);
      } catch (err) {
        missing.push(name);
        tile = placeholderTile();
      }
      if (!tile || !tile.width) {
        missing.push(name);
        tile = placeholderTile();
      }
      ctx.drawImage(tile, cell.col * G["TILE_PX"], cell.row * G["TILE_PX"]);
    }

    if (missing.length) console.warn('[atlas] tiles that needed a placeholder:', missing);
    cachedAtlas = {
      canvas,
      size: [width, height],
      missing,
      ms: performance.now() - started,
      // The same per-tile canvases the atlas was composed from; the renderer
      // uploads these as array-texture layers.
      tileCanvas,
      tileNames: manifest.tileNames,
    };
    return cachedAtlas;
  }

  /**
   * Ten stacked 16 x 16 crack stages in a 16 x 160 texture, matching the classic
   * Minecraft destroy animation: progressively denser dark cracks.
   */
  function buildCrackTexture(stages = 10) {
    const canvas = document.createElement('canvas');
    canvas.width = G["TILE_PX"];
    canvas.height = G["TILE_PX"] * stages;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 1;

    // Deterministic pseudo-random so the cracks look the same every run.
    let seed = 1234567;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let stage = 0; stage < stages; stage++) {
      const y0 = stage * G["TILE_PX"];
      const crackCount = stage + 1;
      for (let c = 0; c < crackCount * 2; c++) {
        let x = Math.floor(rand() * G["TILE_PX"]);
        let y = Math.floor(rand() * G["TILE_PX"]);
        const len = 2 + Math.floor(rand() * 5);
        for (let i = 0; i < len; i++) {
          ctx.fillRect(x, y0 + y, 1, 1);
          x += Math.round(rand() * 2 - 1);
          y += Math.round(rand() * 2 - 1);
          if (x < 0 || x >= G["TILE_PX"] || y < 0 || y >= G["TILE_PX"]) break;
        }
      }
      // A few brighter spots make the last stages read as deep cracks.
      if (stage >= 6) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (let c = 0; c < stage; c++) {
          ctx.fillRect(Math.floor(rand() * G["TILE_PX"]), y0 + Math.floor(rand() * G["TILE_PX"]), 1, 1);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
      }
    }
    return canvas;
  }

  /**
   * Small helper the HUD uses to draw a block icon: returns the canvas of the
   * block's most representative face (top for grass-like blocks, side otherwise).
   */
  function blockIconCanvas(blockId, textureFor) {
    const name = textureFor(blockId, 4);
    return tileCanvas(name);
  }


  G["tileCell"] = tileCell;
  G["tileCanvas"] = tileCanvas;
  G["buildAtlas"] = buildAtlas;
  G["buildCrackTexture"] = buildCrackTexture;
  G["blockIconCanvas"] = blockIconCanvas;
  G["ATLAS_COLS"] = ATLAS_COLS;
  G["ATLAS_ROWS"] = ATLAS_ROWS;
  G["generateAtlas"] = G["generateAtlas"];
  G["generateTileCanvas"] = G["generateTileCanvas"];
  G["TILE_PX"] = G["TILE_PX"];
})(__mc);

/* ---- src/render/icons.js ------------------------------------------------- */
(function (G) {
  /**
   * Block icons for the HUD and for dropped items.
   *
   * Each icon shows the block's own textures as a small isometric cube: the top
   * face plus two side faces. Icons are packed into one atlas canvas so the UI
   * and the item billboards each need a single texture.
   *
   * Projection is the classic 2:1 isometric used by inventory icons:
   *   +X on screen = (16, -8)   +Z = (16, 8)   +Y = (0, 16)
   * so the top face occupies the upper half of the 32x32 slot and the two side
   * faces the lower half. Each face is a parallelogram, which maps exactly onto
   * one affine drawImage call.
   */



  const ICON_SIZE = 32;
  const ICON_COLS = 16;

  /**
   * Builds an atlas of block icons.
   * @param {number[]} blockIds blocks to include, in slot order
   * @returns {{ canvas: HTMLCanvasElement, size: [number, number], uvs: Map<number, number[]> }}
   */
  function buildIconAtlas(blockIds) {
    const rows = Math.max(1, Math.ceil(blockIds.length / ICON_COLS));
    const canvas = document.createElement('canvas');
    canvas.width = ICON_COLS * ICON_SIZE;
    canvas.height = rows * ICON_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const uvs = new Map();
    blockIds.forEach((id, index) => {
      const col = index % ICON_COLS;
      const row = Math.floor(index / ICON_COLS);
      try {
        drawIsoCube(ctx, id, col * ICON_SIZE, row * ICON_SIZE);
      } catch (err) {
        console.warn(`[icons] failed to draw icon for block ${id}`, err);
      }
      const u0 = (col * ICON_SIZE) / canvas.width;
      const v0 = (row * ICON_SIZE) / canvas.height;
      const du = ICON_SIZE / canvas.width;
      const dv = ICON_SIZE / canvas.height;
      uvs.set(id, [u0, v0, u0 + du, v0 + dv]);
    });

    return { canvas, size: [canvas.width, canvas.height], uvs };
  }

  /** Texture canvases for the three visible faces of a block icon. */
  function iconTextures(blockId) {
    const def = G["BLOCKS"][blockId];
    const flat = !!(def && (def.plant || def.pass === G["RENDER_PASS"].CUTOUT));
    return {
      top: G["tileCanvas"](G["textureFor"](blockId, flat ? 4 : 2)),
      front: G["tileCanvas"](G["textureFor"](blockId, 4)),
      right: G["tileCanvas"](G["textureFor"](blockId, 0)),
    };
  }

  /**
   * Draws one block's isometric icon into a 32x32 icon slot using affine
   * drawImage calls — one per visible face. This is what keeps boot fast: a
   * per-pixel version costs ~1000 canvas fill calls per face.
   */
  function drawIsoCube(ctx, blockId, ox, oy) {
    const s = ICON_SIZE;
    const { top, front, right } = iconTextures(blockId);

    // Screen-space face interpolation: (u, v) in the source tile maps to
    //   screen = origin + u * eu + v * ev
    // which for the isometric projection means:
    //   top   : right  (16, -8),  down (16, 8)
    //   front : right  (16, -8),  down (0, 16)
    //   right : rightZ (16, 8),   down (0, 16)
    const transform = (origin, eu, ev) => ctx.setTransform(
      eu[0] / G["TILE_PX"], ev[0] / G["TILE_PX"],
      eu[1] / G["TILE_PX"], ev[1] / G["TILE_PX"],
      ox + origin[0], oy + origin[1],
    );

    // Right (+X) face, drawn first so the front face's edge covers the seam.
    transform([16, 16], [16, 8], [0, 16]);
    ctx.drawImage(right, 0, 0);

    // Front (+Z) face.
    transform([0, 8], [16, -8], [0, 16]);
    ctx.drawImage(front, 0, 0);

    // Top (+Y) face.
    transform([0, 16], [16, -8], [16, 8]);
    ctx.drawImage(top, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Vertices for one icon cube (3 quads = 18 vertices) as a flat list of
   * (x, y, z, u, v, shade). The cube is centred on the origin and is `scale` wide.
   * Face order: +Y top, +Z front, +X right.
   */
  function iconCubeGeometry(uv, scale = 0.32) {
    const s = scale;
    const half = s / 2;
    const [u0, v0, u1, v1] = uv;
    const du = u1 - u0;
    const dv = v1 - v0;
    const out = [];

    const pushQuad = (verts, uvs, shade) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const v = verts[i];
        const tex = uvs[i];
        out.push(v[0], v[1], v[2], tex[0], tex[1], shade);
      }
    };

    // The 2D icon packs the top face into the upper half of the slot and the two
    // side faces into the lower half, so the UVs mirror that split.
    const uh = 0.5;  // u fraction where the front/right faces meet
    const vh = 0.5;  // v fraction where the top face ends

    // +Y top: corners (0,0) (1,0) (1,1) (0,1) in tile space.
    pushQuad(
      [[-half, half, -half], [half, half, -half], [half, half, 0], [-half, half, 0]],
      [
        [u0 + du * uh, v0],
        [u0 + du, v0 + dv * vh * 0.5],
        [u0 + du * uh, v0 + dv * vh],
        [u0, v0 + dv * vh * 0.5],
      ],
      1.0,
    );

    // +Z front.
    pushQuad(
      [[-half, half, -half], [-half, -half, -half], [half, -half, -half], [half, half, -half]],
      [
        [u0, v0 + dv * vh * 0.5],
        [u0, v1],
        [u0 + du * uh, v1],
        [u0 + du * uh, v0 + dv * vh],
      ],
      0.72,
    );

    // +X right.
    pushQuad(
      [[half, half, -half], [half, -half, -half], [half, -half, 0], [half, half, 0]],
      [
        [u0 + du * uh, v0 + dv * vh],
        [u0 + du * uh, v1],
        [u0 + du, v1],
        [u0 + du, v0 + dv * vh],
      ],
      0.86,
    );

    return out;
  }

  G["buildIconAtlas"] = buildIconAtlas;
  G["iconCubeGeometry"] = iconCubeGeometry;
  G["ICON_SIZE"] = ICON_SIZE;
  G["ICON_COLS"] = ICON_COLS;
})(__mc);

/* ---- src/render/shaders.js ----------------------------------------------- */
(function (G) {
  /**
   * GLSL ES 3.00 sources for the chunk renderer, the sky, the wireframe overlay
   * and the HUD. Kept in one module so the vertex contract with the mesher
   * (position in block units, tile id, baked light byte) stays in one place.
   */

  /* ------------------------------------------------------------------ *
   * Chunk geometry
   * ------------------------------------------------------------------ */

  const CHUNK_VERTEX = `#version 300 es
  precision highp float;

  in vec3 a_position;   // section-local, in 1/16-block units
  in float a_tile;      // 1-based tile id; selects the array-texture layer
  in vec2 a_uv;         // corner offset inside the tile, 0..16
  in float a_light;     // baked light + ambient occlusion, normalised 0..1

  uniform mat4 u_viewProj;
  uniform vec3 u_chunkOrigin;   // chunk min corner in world space (x, 0, z)
  uniform vec3 u_cameraPosition;
  uniform vec2 u_section;       // (sectionY * 16, unused)

  out float v_light;
  out float v_dist;
  out vec3 v_local;
  flat out float v_tile;
  flat out float v_layer;
  out vec2 v_inTile;

  void main() {
    int tile = int(a_tile + 0.5);
    v_tile = a_tile;
    // Tile ids are 1-based; each tile owns one layer of the array texture.
    v_layer = float(tile - 1);

    // The texture coordinate comes straight from the vertex data: the mesher
    // knows which corner of the tile each vertex is. Clamping keeps the sample
    // off the exact tile edge so CLAMP_TO_EDGE never mixes in a neighbour.
    v_inTile = clamp(a_uv / 16.0, vec2(0.0), vec2(0.999));

    vec3 localBlocks = a_position / 16.0;
    vec3 world = u_chunkOrigin + localBlocks;
    world.y += u_section.x;

    gl_Position = u_viewProj * vec4(world, 1.0);
    v_light = a_light;
    v_dist = length(world - u_cameraPosition);
    v_local = localBlocks;
  }
  `;

  /** Shared fragment body; the pass-selecting constant is prepended per program. */
  const CHUNK_FRAGMENT = (mode) => `#version 300 es
  precision highp float;
  precision highp sampler2DArray;

  in float v_light;
  in float v_dist;
  in vec3 v_local;
  in vec3 v_world;
  in vec2 v_inTile;
  flat in float v_tile;
  flat in float v_layer;

  uniform sampler2DArray u_atlas;   // one layer per block texture
  uniform vec3 u_fogColor;
  uniform float u_fogNear;
  uniform float u_fogFar;
  uniform float u_dayLight;     // 0 = midnight, 1 = noon
  uniform float u_alpha;

  out vec4 outColor;

  void main() {
    vec4 texel = texture(u_atlas, vec3(v_inTile, v_layer));
  ${mode === 'cutout' ? '  if (texel.a < 0.5) discard;\n' : ''}
    // The mesher already bakes face shading, ambient occlusion, and the
    // skylight/blocklight mix into v_light, so only a warm/cool tint and the
    // day-night dimming are applied here. The tints are deliberately close to
    // white: a saturated tint washes the terrain out to blue-grey.
    vec3 blockLight = vec3(1.0, 0.93, 0.80);
    vec3 skyLight = vec3(0.94, 0.97, 1.0);
    float l = clamp(v_light, 0.0, 1.0);
    // Only strongly lit surfaces get the sky tint; dim ones stay neutral.
    vec3 lightColor = mix(blockLight, skyLight, smoothstep(0.45, 1.0, l));
    float brightness = mix(0.26, 1.0, l) * mix(0.34, 1.0, u_dayLight) * 1.45;
    vec3 color = texel.rgb * lightColor * brightness;
    float fogFactor = smoothstep(u_fogNear, u_fogFar, v_dist);
    color = mix(color, u_fogColor, fogFactor);
    outColor = vec4(color, texel.a * ${mode === 'translucent' ? 'u_alpha' : '1.0'});
  }
  `;

  /* ------------------------------------------------------------------ *
   * Sky
   * ------------------------------------------------------------------ */

  const SKY_VERTEX = `#version 300 es
  precision highp float;
  in vec2 a_position;   // -1..1 quad in clip space
  out vec2 v_ndc;
  void main() {
    v_ndc = a_position;
    gl_Position = vec4(a_position, 0.999, 1.0);
  }
  `;

  const SKY_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 v_ndc;

  uniform vec3 u_horizon;
  uniform vec3 u_zenith;
  uniform vec3 u_sunDir;
  uniform vec3 u_camRight;
  uniform vec3 u_camUp;
  uniform vec3 u_camForward;
  uniform vec2 u_tanHalfFov;   // (tan(fovY/2) * aspect, tan(fovY/2))
  uniform float u_sunStrength;

  out vec4 outColor;

  void main() {
    // Rebuild the world-space view ray for this pixel so the gradient and the
    // sun track the camera instead of being pinned to the screen.
    vec3 dir = normalize(u_camForward
      + u_camRight * (v_ndc.x * u_tanHalfFov.x)
      + u_camUp * (v_ndc.y * u_tanHalfFov.y));

    float horizonFactor = smoothstep(-0.12, 0.82, dir.y);
    vec3 color = mix(u_horizon, u_zenith, horizonFactor);

    float sunDot = max(dot(dir, normalize(u_sunDir)), 0.0);
    float sun = pow(sunDot, 160.0);
    float halo = pow(sunDot, 24.0) * 0.05;
    color += vec3(1.0, 0.88, 0.66) * (sun + halo) * u_sunStrength;

    outColor = vec4(color, 1.0);
  }
  `;

  /* ------------------------------------------------------------------ *
   * Lines: block selection outline, debug helpers
   * ------------------------------------------------------------------ */

  const LINE_VERTEX = `#version 300 es
  precision highp float;
  in vec3 a_position;
  uniform mat4 u_viewProj;
  uniform vec3 u_offset;
  uniform float u_scale;
  void main() {
    // Lines arrive as unit-cube edge vertices; scale about the cube centre.
    vec3 local = (a_position - 0.5) * u_scale + 0.5;
    gl_Position = u_viewProj * vec4(local + u_offset, 1.0);
  }
  `;

  const LINE_FRAGMENT = `#version 300 es
  precision highp float;
  uniform vec4 u_color;
  out vec4 outColor;
  void main() { outColor = u_color; }
  `;

  /* ------------------------------------------------------------------ *
   * Entities (mobs, dropped items): shaded boxes
   * ------------------------------------------------------------------ */

  const ENTITY_VERTEX = `#version 300 es
  precision highp float;
  in vec3 a_position;
  in vec3 a_normal;
  in vec3 a_color;
  uniform mat4 u_viewProj;
  uniform mat4 u_model;
  uniform vec3 u_lightDir;
  uniform float u_brightness;
  out vec3 v_color;
  void main() {
    vec3 n = normalize(mat3(u_model) * a_normal);
    float diffuse = 0.62 + 0.38 * max(dot(n, normalize(u_lightDir)), 0.0);
    v_color = a_color * diffuse * u_brightness;
    gl_Position = u_viewProj * u_model * vec4(a_position, 1.0);
  }
  `;

  const ENTITY_FRAGMENT = `#version 300 es
  precision highp float;
  in vec3 v_color;
  uniform float u_alpha;
  out vec4 outColor;
  void main() { outColor = vec4(v_color, u_alpha); }
  `;

  /* ------------------------------------------------------------------ *
   * Crack overlay (block breaking progress)
   * ------------------------------------------------------------------ */

  const CRACK_VERTEX = `#version 300 es
  precision highp float;
  in vec3 a_position;
  in vec2 a_uv;
  uniform mat4 u_viewProj;
  uniform vec3 u_offset;
  uniform float u_scale;
  uniform float u_layer;
  out vec2 v_uv;
  void main() {
    vec3 local = (a_position - 0.5) * u_scale + 0.5;
    v_uv = a_uv;
    gl_Position = u_viewProj * vec4(local + u_offset, 1.0);
  }
  `;

  const CRACK_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_crack;
  uniform float u_layer;
  out vec4 outColor;

  void main() {
    // 10 stages are stacked vertically in a 16 x 160 texture.
    vec2 uv = vec2(v_uv.x, v_uv.y / 10.0 + u_layer * 0.1);
    float alpha = texture(u_crack, uv).a;
    if (alpha < 0.05) discard;
    outColor = vec4(0.0, 0.0, 0.0, alpha * 0.85);
  }
  `;

  /* ------------------------------------------------------------------ *
   * HUD: flat colour triangles in pixel space
   * ------------------------------------------------------------------ */

  const HUD_VERTEX = `#version 300 es
  precision highp float;
  in vec2 a_position;
  in vec4 a_color;
  uniform mat4 u_projection;
  out vec4 v_color;
  void main() {
    v_color = a_color;
    gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  }
  `;

  const HUD_FRAGMENT = `#version 300 es
  precision highp float;
  in vec4 v_color;
  out vec4 outColor;
  void main() { outColor = v_color; }
  `;

  /** HUD textured quads: hotbar icons, item counts share one pass. */
  const HUD_TEX_VERTEX = `#version 300 es
  precision highp float;
  in vec2 a_position;
  in vec2 a_uv;
  uniform mat4 u_projection;
  out vec2 v_uv;
  void main() {
    v_uv = a_uv;
    gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  }
  `;

  const HUD_TEX_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_texture;
  uniform vec4 u_color;
  out vec4 outColor;
  void main() {
    vec4 texel = texture(u_texture, v_uv);
    outColor = texel * u_color;
  }
  `;

  /* ------------------------------------------------------------------ *
   * Block icons: the isometric cubes shown in the HUD and dropped in the world
   * ------------------------------------------------------------------ */

  const ICON_VERTEX = `#version 300 es
  precision highp float;
  in vec3 a_position;
  in vec2 a_uv;
  in float a_shade;
  uniform mat4 u_viewProj;
  uniform mat4 u_model;
  out vec2 v_uv;
  out float v_shade;
  void main() {
    v_uv = a_uv;
    v_shade = a_shade;
    gl_Position = u_viewProj * u_model * vec4(a_position, 1.0);
  }
  `;

  const ICON_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  in float v_shade;
  uniform sampler2D u_texture;
  uniform float u_alpha;
  out vec4 outColor;
  void main() {
    vec4 texel = texture(u_texture, v_uv);
    if (texel.a < 0.02) discard;
    outColor = vec4(texel.rgb * v_shade, texel.a * u_alpha);
  }
  `;

  /**
   * HUD icons: one batched draw call for every inventory slot.
   * Per-vertex (x, y, u, v, r, g, b, a) in pixel space with an orthographic
   * projection, so highlighting a slot only changes the vertex colours.
   */
  const HUD_ICON_VERTEX = `#version 300 es
  precision highp float;
  in vec2 a_position;
  in vec2 a_uv;
  in vec4 a_color;
  uniform mat4 u_projection;
  out vec2 v_uv;
  out vec4 v_color;
  void main() {
    v_uv = a_uv;
    v_color = a_color;
    gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  }
  `;

  const HUD_ICON_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  in vec4 v_color;
  uniform sampler2D u_texture;
  out vec4 outColor;
  void main() {
    vec4 texel = texture(u_texture, v_uv);
    if (texel.a < 0.02) discard;
    outColor = vec4(texel.rgb * v_color.rgb * texel.a, v_color.a * texel.a);
  }
  `;

  /* ------------------------------------------------------------------ *
   * Exported shader table
   * ------------------------------------------------------------------ */

  const SHADERS = {
    chunk: {
      vertex: CHUNK_VERTEX,
      fragment: {
        opaque: CHUNK_FRAGMENT('opaque'),
        cutout: CHUNK_FRAGMENT('cutout'),
        translucent: CHUNK_FRAGMENT('translucent'),
      },
    },
    sky: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
    line: { vertex: LINE_VERTEX, fragment: LINE_FRAGMENT },
    entity: { vertex: ENTITY_VERTEX, fragment: ENTITY_FRAGMENT },
    crack: { vertex: CRACK_VERTEX, fragment: CRACK_FRAGMENT },
    hud: { vertex: HUD_VERTEX, fragment: HUD_FRAGMENT },
    hudTex: { vertex: HUD_TEX_VERTEX, fragment: HUD_TEX_FRAGMENT },
    icon: { vertex: ICON_VERTEX, fragment: ICON_FRAGMENT },
    hudIcon: { vertex: HUD_ICON_VERTEX, fragment: HUD_ICON_FRAGMENT },
  };

  /**
   * Unit-cube wireframe edges (12 lines, 24 vertices) used for the selection box.
   * The same array doubled is used as the triangle-soup cube for the breaking
   * overlay, so keep it in one place.
   */
  const CUBE_EDGES = new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0,
    0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0,
    0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1,
  ]);

  G["SHADERS"] = SHADERS;
  G["CUBE_EDGES"] = CUBE_EDGES;
})(__mc);

/* ---- src/render/gl.js ---------------------------------------------------- */
(function (G) {
  /** Thin WebGL2 helpers. No dependencies. */

  /** Compiles a shader and throws with the info log on failure. */
  function compileShader(gl, type, source, label) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      const numbered = source.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
      throw new Error(`[${label}] shader compile failed:\n${log}\n${numbered}`);
    }
    return shader;
  }

  /** Links a vertex/fragment pair into a program and caches its uniform locations. */
  function createProgram(gl, vertexSource, fragmentSource, label = 'program') {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label}.vert`);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}.frag`);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`[${label}] link failed: ${log}`);
    }

    const uniforms = new Map();
    const attribs = new Map();
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      uniforms.set(name, gl.getUniformLocation(program, info.name));
    }
    const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < attribCount; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (!info) continue;
      attribs.set(info.name, gl.getAttribLocation(program, info.name));
    }

    return {
      program,
      label,
      /** `u('name')` returns the cached location (null when unused). */
      u: (name) => (uniforms.has(name) ? uniforms.get(name) : null),
      a: (name) => (attribs.has(name) ? attribs.get(name) : -1),
      use: () => gl.useProgram(program),
      dispose: () => gl.deleteProgram(program),
    };
  }

  /** Creates a VAO + vertex/index buffers for one interleaved mesh part. */
  function createMesh(gl, part) {
    if (!part || part.vertexCount === 0) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);

    const tileBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tileBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, part.tiles, gl.STATIC_DRAW);

    const lightBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, part.lights, gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, part.uvs, gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);

    const upload = (program) => {
      const aPos = program.a('a_position');
      if (aPos >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);
      }
      const aTile = program.a('a_tile');
      if (aTile >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, tileBuffer);
        gl.enableVertexAttribArray(aTile);
        gl.vertexAttribPointer(aTile, 1, gl.FLOAT, false, 4, 0);
      }
      const aUv = program.a('a_uv');
      if (aUv >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.UNSIGNED_BYTE, false, 2, 0);
      }
      const aLight = program.a('a_light');
      if (aLight >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer);
        gl.enableVertexAttribArray(aLight);
        gl.vertexAttribPointer(aLight, 1, gl.UNSIGNED_BYTE, true, 1, 0);
      }
      return { aPos, aTile, aUv, aLight, program: program.label };
    };

    /** Diagnostics: prove the attribute arrays are live on this VAO. */
    const verify = () => {
      gl.bindVertexArray(vao);
      const read = (loc) => ({
        enabled: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_ENABLED),
        size: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_SIZE),
        stride: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
        buffer: !!gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),
      });
      const result = { a_position: read(0), a_tile: read(1), a_light: read(2), glError: gl.getError() };
      gl.bindVertexArray(null);
      return result;
    };

    gl.bindVertexArray(null);
    return {
      vao,
      indexBuffer,
      positionBuffer,
      tileBuffer,
      lightBuffer,
      indexCount: part.indexCount,
      vertexCount: part.vertexCount,
      verify,
      /** Binds this mesh and wires the chunk program's attributes for the draw. */
      attach: (program) => {
        gl.bindVertexArray(vao);
        return upload(program);
      },
      dispose: () => {
        gl.deleteBuffer(positionBuffer);
        gl.deleteBuffer(tileBuffer);
        gl.deleteBuffer(lightBuffer);
        gl.deleteBuffer(indexBuffer);
        gl.deleteVertexArray(vao);
      },
    };
  }

  /**
   * Creates a dynamic vertex buffer plus VAO for simple geometry.
   *
   * `floatsPerVertex` defaults to 3 (a bare position). Callers with a different
   * position width or a wider interleaved layout pass those values here, then
   * set up extra attributes after calling `attach`.
   */
  function createDynamicMesh(gl, maxVertices, floatsPerVertex = 3, positionSize = 3) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, maxVertices * floatsPerVertex * 4, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    const stride = floatsPerVertex * 4;

    return {
      vao,
      buffer,
      capacity: maxVertices,
      floatsPerVertex,
      stride,
      /**
       * Binds this VAO and wires its first attribute for `program`.
       *
       * Attribute pointers are part of VAO state, so every draw path must
       * (re-)establish its own pointers: two VAOs sharing attribute *locations*
       * otherwise overwrite each other and one of them draws garbage.
       */
      attach: (program) => {
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const loc = program.a('a_position');
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, positionSize, gl.FLOAT, false, stride, 0);
        }
        return loc;
      },
      /** Uploads `count` vertices worth of data. */
      upload: (data, count) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * floatsPerVertex);
      },
      /** Uploads raw float data and draws it in one call. */
      draw: (program, data, count, mode = null) => {
        const gl2 = gl;
        gl2.bindBuffer(gl2.ARRAY_BUFFER, buffer);
        gl2.bufferSubData(gl2.ARRAY_BUFFER, 0, data, 0, count * floatsPerVertex);
        gl2.bindVertexArray(vao);
        gl2.drawArrays(mode === null ? gl2.TRIANGLES : mode, 0, count);
      },
    };
  }

  /**
   * Builds a 2D array texture with one layer per tile, which removes all atlas
   * UV maths (and with it every bleeding and off-by-one failure mode).
   *
   * @param {HTMLCanvasElement[]} layers tile canvases, in tile-id order
   * @returns {WebGLTexture}
   */
  function createTextureArray(gl, layers, layerSize = 16) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    while (gl.getError() !== gl.NO_ERROR) { /* clear earlier errors */ }

    const count = layers.length;
    const data = new Uint8Array(layerSize * layerSize * 4 * count);
    for (let layer = 0; layer < count; layer++) {
      const canvas = layers[layer];
      if (!canvas) continue;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const image = ctx.getImageData(0, 0, Math.min(layerSize, canvas.width), Math.min(layerSize, canvas.height));
      const offset = layer * layerSize * layerSize * 4;
      // Copy row by row in case the source is smaller than the layer size.
      for (let y = 0; y < image.height; y++) {
        const srcStart = y * image.width * 4;
        data.set(image.data.subarray(srcStart, srcStart + image.width * 4), offset + y * layerSize * 4);
      }
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, layerSize, layerSize, count, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data,
    );
    const uploadError = gl.getError();
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    texture._atlasMeta = { kind: 'array', layerSize, layers: count, uploadError };
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    return texture;
  }

  /**
   * Uploads a canvas as a 2D texture.
   * `nearest` keeps the crunchy pixel-art look; mipmaps stay off because an
   * unpadded atlas would bleed between tiles at higher mip levels.
   */
  function createTextureFromCanvas(gl, canvas, opts = {}) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY ?? false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const filter = opts.nearest === false ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    texture._atlasMeta = {
      sourceWidth: canvas.width,
      sourceHeight: canvas.height,
      error: gl.getError(),
    };
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  G["compileShader"] = compileShader;
  G["createProgram"] = createProgram;
  G["createMesh"] = createMesh;
  G["createDynamicMesh"] = createDynamicMesh;
  G["createTextureArray"] = createTextureArray;
  G["createTextureFromCanvas"] = createTextureFromCanvas;
})(__mc);

/* ---- src/render/renderer.js ---------------------------------------------- */
(function (G) {
  /**
   * World renderer: chunk sections, sky, block selection, breaking overlay and
   * mob geometry. One WebGL2 context, one draw call per section per pass.
   */






  const manifestTileIds = G["default"].tileIds;
  const manifestAtlasCols = G["default"].atlasCols;
  const manifestTileNames = G["default"].tileNames;



  const SECTION_KEY = (cx, cz, s) => `${cx},${cz},${s}`;

  /** Unit-cube faces as (x, y, z, u, v) corners, used for the breaking overlay. */
  const CUBE_FACE_QUADS = [
    // +X
    [[1, 0, 1, 0, 1], [1, 0, 0, 1, 1], [1, 1, 0, 1, 0], [1, 1, 1, 0, 0]],
    // -X
    [[0, 0, 0, 0, 1], [0, 0, 1, 1, 1], [0, 1, 1, 1, 0], [0, 1, 0, 0, 0]],
    // +Y
    [[0, 1, 1, 0, 1], [1, 1, 1, 1, 1], [1, 1, 0, 1, 0], [0, 1, 0, 0, 0]],
    // -Y
    [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]],
    // +Z
    [[0, 0, 1, 0, 1], [1, 0, 1, 1, 1], [1, 1, 1, 1, 0], [0, 1, 1, 0, 0]],
    // -Z
    [[1, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]],
  ];

  /** Fog + sky palettes for day and night, blended by the time of day. */
  const SKY_DAY = { horizon: [0.62, 0.76, 1.0], zenith: [0.24, 0.45, 0.95], fog: [0.72, 0.84, 1.0] };
  const SKY_NIGHT = { horizon: [0.05, 0.07, 0.16], zenith: [0.01, 0.02, 0.07], fog: [0.04, 0.06, 0.13] };

  function mix3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} [options]
     * @param {number[]} [options.iconBlockIds] block ids that need an icon
     * @param {(step:string, ms:number)=>void} [options.onProgress] boot diagnostics
     */
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      const iconBlockIds = options.iconBlockIds ?? [1];
      const iconUvExtra = options.iconUvExtra ?? {};
      this.timings = {};
      let markStart = performance.now();
      const mark = (step) => {
        const now = performance.now();
        this.timings[step] = now - markStart;
        markStart = now;
        options.onProgress?.(step, this.timings[step]);
      };
      mark('start');
      const gl = canvas.getContext('webgl2', {
        antialias: true,
        alpha: false,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        // Needed only so a headless screenshot harness can read the frame back.
        preserveDrawingBuffer: new URLSearchParams(location.search).has('single'),
      });
      if (!gl) throw new Error('WebGL2 is not available in this browser.');
      this.gl = gl;
      mark('context');

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.clearColor(0.6, 0.75, 1, 1);

      this.programs = {
        opaque: G["createProgram"](gl, G["SHADERS"].chunk.vertex, G["SHADERS"].chunk.fragment.opaque, 'chunk.opaque'),
        cutout: G["createProgram"](gl, G["SHADERS"].chunk.vertex, G["SHADERS"].chunk.fragment.cutout, 'chunk.cutout'),
        translucent: G["createProgram"](gl, G["SHADERS"].chunk.vertex, G["SHADERS"].chunk.fragment.translucent, 'chunk.translucent'),
        sky: G["createProgram"](gl, G["SHADERS"].sky.vertex, G["SHADERS"].sky.fragment, 'sky'),
        line: G["createProgram"](gl, G["SHADERS"].line.vertex, G["SHADERS"].line.fragment, 'line'),
        entity: G["createProgram"](gl, G["SHADERS"].entity.vertex, G["SHADERS"].entity.fragment, 'entity'),
        crack: G["createProgram"](gl, G["SHADERS"].crack.vertex, G["SHADERS"].crack.fragment, 'crack'),
        icon: G["createProgram"](gl, G["SHADERS"].icon.vertex, G["SHADERS"].icon.fragment, 'icon'),
        hudIcon: G["createProgram"](gl, G["SHADERS"].hudIcon.vertex, G["SHADERS"].hudIcon.fragment, 'hudIcon'),
        hud: G["createProgram"](gl, G["SHADERS"].hud.vertex, G["SHADERS"].hud.fragment, 'hud'),
        hudTex: G["createProgram"](gl, G["SHADERS"].hudTex.vertex, G["SHADERS"].hudTex.fragment, 'hudTex'),
      };
      mark('programs');

      // Block icons: used for dropped items in the world and the HUD hotbar.
      const iconStart = performance.now();
      const iconIds = [...new Set([...iconBlockIds, ...Object.keys(iconUvExtra).map(Number)])];
      this.iconAtlas = G["buildIconAtlas"](iconIds.length ? iconIds : [1]);
      this.iconTexture = G["createTextureFromCanvas"](gl, this.iconAtlas.canvas, { nearest: true });
      // One shared vertex buffer holding every icon cube; each block id owns a slice.
      this.iconRanges = new Map();
      const iconVerts = [];
      iconIds.forEach((id, index) => {
        const uv = this.iconAtlas.uvs.get(id) ?? [0, 0, 0.05, 0.1];
        const first = iconVerts.length / 6;
        const data = G["iconCubeGeometry"](uv, 0.3);
        for (const value of data) iconVerts.push(value);
        this.iconRanges.set(id, { first, count: iconVerts.length / 6 - first });
      });
      this.iconVertexData = new Float32Array(iconVerts);
      this.iconVao = gl.createVertexArray();
      gl.bindVertexArray(this.iconVao);
      const iconBuffer = gl.createBuffer();
      this.iconBuffer = iconBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, iconBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.iconVertexData, gl.STATIC_DRAW);
      {
        const program = this.programs.icon;
        const aPos = program.a('a_position');
        const aUv = program.a('a_uv');
        const aShade = program.a('a_shade');
        if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0); }
        if (aUv >= 0) { gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 24, 12); }
        if (aShade >= 0) { gl.enableVertexAttribArray(aShade); gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, 24, 20); }
      }
      gl.bindVertexArray(null);

      // Block textures: one array-texture layer per tile. This removes all atlas
      // UV maths, and with it every bleeding/off-by-one failure mode.
      const atlasStart = performance.now();
      const atlas = G["buildAtlas"]();
      this.atlasSize = atlas.size;
      this.atlasCanvas = atlas.canvas;
      this.atlasTileIds = manifestTileIds;
      this.atlasColumns = manifestAtlasCols;
      const layers = manifestTileNames.map((name) => atlas.tileCanvas(name));
      this.atlasTexture = G["createTextureArray"](gl, layers, G["TILE_PX"]);
      this.textureUploadError = this.atlasTexture._atlasMeta?.uploadError ?? null;
      this.atlasMs = performance.now() - atlasStart;
      this.atlasMissing = atlas.missing;
      mark('atlas');

      // Breaking overlay.
      this.crackTexture = G["createTextureFromCanvas"](gl, G["buildCrackTexture"](10), { nearest: true });

      // Sky quad: clip-space triangles, 2 floats per vertex.
      this.skyMesh = G["createDynamicMesh"](gl, 6, 2, 2);
      this.skyMesh.attach(this.programs.sky);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyMesh.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

      // Block selection box: the 24 vertices of a unit cube's wireframe.
      this.cubeMesh = G["createDynamicMesh"](gl, G["CUBE_EDGES"].length / 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeMesh.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, G["CUBE_EDGES"], gl.STATIC_DRAW);

      // Breaking overlay: 18 vertices of a unit cube with UVs (5 floats each).
      const crackVerts = [];
      for (let f = 0; f < 6; f++) {
        const quad = CUBE_FACE_QUADS[f];
        for (const tri of [[0, 1, 2], [0, 2, 3]]) {
          for (const i of tri) {
            const v = quad[i];
            crackVerts.push(v[0], v[1], v[2], v[3], v[4]);
          }
        }
      }
      this.crackVertexCount = crackVerts.length / 5;
      this.crackMesh = G["createDynamicMesh"](gl, this.crackVertexCount, 5);
      this.crackMesh.attach(this.programs.crack);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.crackMesh.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(crackVerts), gl.STATIC_DRAW);
      {
        const aUv = this.programs.crack.a('a_uv');
        if (aUv >= 0) {
          gl.enableVertexAttribArray(aUv);
          gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 12);
        }
      }
      gl.bindVertexArray(null);

      // Entity (mob) geometry: dynamic interleaved position/normal/colour boxes.
      this.entityMesh = G["createDynamicMesh"](gl, 16384, 9);
      this.entityVertexCount = 0;
      this.iconMs = performance.now() - iconStart;
      mark('icons');

      /** @type {Map<string, {opaque:object|null, cutout:object|null, generation:number}>} */
      this.sectionMeshes = new Map();

      this.viewMatrix = G["mat4"]();
      this.projMatrix = G["mat4"]();
      this.viewProj = G["mat4"]();
      this.frustum = new Float32Array(24);
      this.renderDistanceBlocks = 128;
      this.fov = 70;
      this.stats = { sections: 0, drawCalls: 0, triangles: 0, culled: 0 };
      /** Set to false only by diagnostics, to isolate frustum culling. */
      this.cullEnabled = true;

      this.skyState = { horizon: [0, 0, 0], zenith: [0, 0, 0], fog: [0, 0, 0], sunDir: [0, 1, 0], daylight: 1 };
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.gl.viewport(0, 0, width, height);
      this.aspect = width / height;
    }

    /* ---------------- mesh lifecycle ---------------- */

    setSectionMesh(cx, cz, section, result) {
      const key = SECTION_KEY(cx, cz, section);
      const existing = this.sectionMeshes.get(key);
      const gl = this.gl;

      if (existing) {
        existing.opaque?.dispose();
        existing.cutout?.dispose();
        this.sectionMeshes.delete(key);
      }
      if (!result || result.empty) return;

      const opaque = G["createMesh"](gl, result.opaque);
      const cutout = G["createMesh"](gl, result.cutout);
      if (!opaque && !cutout) return;
      this.sectionMeshes.set(key, {
        cx, cz, section,
        origin: [cx * G["CHUNK_SIZE"], 0, cz * G["CHUNK_SIZE"]],
        opaque,
        cutout,
        opaqueBounds: result.opaqueBounds ?? null,
        cutoutBounds: result.cutoutBounds ?? null,
      });
    }

    /** A drawn block icon as an <img>-ready canvas, for the inventory grid. */
    iconCanvas(blockId, size = 32) {
      const uv = this.iconAtlas.uvs.get(blockId);
      if (!uv) return null;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const atlas = this.iconAtlas.canvas;
      ctx.drawImage(
        atlas,
        uv[0] * atlas.width, uv[1] * atlas.height,
        (uv[2] - uv[0]) * atlas.width, (uv[3] - uv[1]) * atlas.height,
        0, 0, size, size,
      );
      return canvas;
    }

    clear() {
      for (const entry of this.sectionMeshes.values()) {
        entry.opaque?.dispose();
        entry.cutout?.dispose();
      }
      this.sectionMeshes.clear();
    }

    /* ---------------- sky / camera ---------------- */

    /** World time is in ticks (0..24000, 6000 = noon). */
    updateSky(timeTicks, dayLength = 24000) {
      const t = ((timeTicks % dayLength) + dayLength) % dayLength / dayLength; // 0 = dawn
      const angle = (t - 0.25) * Math.PI * 2;             // noon at t = 0.5
      const sunY = Math.sin(angle + Math.PI / 2);
      const sunX = Math.cos(angle + Math.PI / 2);
      // Daylight ramps in around sunrise and out around sunset.
      const daylight = Math.max(0, Math.min(1, sunY * 2.2 + 0.35));

      const dayT = daylight;
      const horizon = mix3(SKY_NIGHT.horizon, SKY_DAY.horizon, dayT);
      const zenith = mix3(SKY_NIGHT.zenith, SKY_DAY.zenith, dayT);
      const fog = mix3(SKY_NIGHT.fog, SKY_DAY.fog, dayT);

      // Warm the horizon at sunrise/sunset.
      const sunset = Math.max(0, 1 - Math.abs(sunY) * 3);
      horizon[0] = Math.min(1, horizon[0] + sunset * 0.35 * dayT);
      horizon[1] = Math.min(1, horizon[1] + sunset * 0.12 * dayT);
      fog[0] = Math.min(1, fog[0] + sunset * 0.22 * dayT);
      fog[1] = Math.min(1, fog[1] + sunset * 0.06 * dayT);

      this.skyState = {
        horizon, zenith, fog,
        sunDir: [sunX * 0.9, sunY, sunX * 0.4],
        daylight: Math.max(0.08, daylight),
      };
    }

    updateCamera(camera) {
      this.resize();
      const far = Math.max(220, this.renderDistanceBlocks * 1.6);
      const fovRad = (this.fov * Math.PI) / 180;
      G["mat4Perspective"](this.projMatrix, fovRad, this.aspect, 0.05, far);
      G["mat4ViewFromEuler"](this.viewMatrix, camera.x, camera.y, camera.z, camera.yaw, camera.pitch);
      G["mat4Mul"](this.viewProj, this.projMatrix, this.viewMatrix);
      this.cameraPosition = { x: camera.x, y: camera.y, z: camera.z };

      // Keep the camera basis so the sky shader can rebuild view rays.
      const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
      const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
      this.cameraBasis = {
        right: [cy, 0, -sy],
        up: [sy * sp, cp, cy * sp],
        forward: [-sy * cp, sp, -cy * cp],
        tanHalfFov: [Math.tan(fovRad / 2) * this.aspect, Math.tan(fovRad / 2)],
      };
    }

    /* ---------------- rendering ---------------- */

    /**
     * Draws one frame.
     * @param {{x:number, y:number, z:number}} camera eye position, used for
     *   distance culling and for sorting the translucent pass back to front
     */
    render(camera) {
      const gl = this.gl;
      this.stats.drawCalls = 0;
      this.stats.triangles = 0;
      this.stats.sections = 0;
      this.stats.culled = 0;

      const fog = this.skyState.fog;
      gl.clearColor(fog[0], fog[1], fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      this.drawSky();

      const chunks = [];
      for (const entry of this.sectionMeshes.values()) {
        const originX = entry.origin[0];
        const originZ = entry.origin[2];
        const d2 = (originX + 8 - camera.x) ** 2 + (originZ + 8 - camera.z) ** 2;
        if (d2 > (this.renderDistanceBlocks + 24) ** 2) { this.stats.culled++; continue; }
        chunks.push({ entry, d2 });
      }
      chunks.sort((a, b) => a.d2 - b.d2);

      const visible = [];
      for (const item of chunks) {
        const e = item.entry;
        const occluded = !this._sectionVisible(e, e.opaqueBounds) && !this._sectionVisible(e, e.cutoutBounds);
        if (occluded) { this.stats.culled++; continue; }
        this.stats.sections++;
        visible.push(e);
      }

      // Pass 1: opaque, then cutout (alpha tested). Solid overrides cutout on
      // depth ties so leaves do not cut holes in the blocks they touch.
      this._drawPass(this.programs.opaque, visible, 'opaque', 1.0, false);
      gl.depthFunc(gl.LEQUAL);
      this._drawPass(this.programs.cutout, visible, 'cutout', 1.0, true);
      gl.depthFunc(gl.LEQUAL);

      // Pass 3: translucent from far to near with blending.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(true);
      const sorted = [...visible].sort((a, b) => {
        const ad = (a.origin[0] + 8 - camera.x) ** 2 + (a.origin[2] + 8 - camera.z) ** 2;
        const bd = (b.origin[0] + 8 - camera.x) ** 2 + (b.origin[2] + 8 - camera.z) ** 2;
        return bd - ad;
      });
      this._drawPass(this.programs.translucent, sorted, 'cutout', 0.78, true);
      gl.disable(gl.BLEND);

      return { fog: this.skyState.fog };
    }

    _sectionVisible(entry, bounds) {
      if (!bounds) return false;
      // A section can be reached by either pass, so it is culled only when both
      // its opaque and cutout bounds are off screen. A generous radius keeps this
      // conservative: a wrongly culled section leaves a hole in the world.
      if (this.cullEnabled === false) return true;
      if (this._boundsVisible(entry, entry.opaqueBounds)) return true;
      return this._boundsVisible(entry, entry.cutoutBounds);
    }

    /**
     * Decides whether a section's mesh can be skipped. The rule lives in
     * `G["sectionVisible"]` in core/math.js; see the note there on why a frustum-plane
     * test is not used.
     */
    _boundsVisible(entry, bounds) {
      if (!bounds) return false;
      if (this.cullEnabled === false) return true;
      const camera = this.cameraPosition;
      const basis = this.cameraBasis;
      if (!camera || !basis) return true;

      const centreX = entry.origin[0] + (bounds[0] + bounds[3]) / 2;
      const centreY = (bounds[1] + bounds[4]) / 2;
      const centreZ = entry.origin[2] + (bounds[2] + bounds[5]) / 2;
      // Half the section diagonal, so a section straddling a limit is kept.
      const radius = Math.hypot(
        (bounds[3] - bounds[0]) / 2, (bounds[4] - bounds[1]) / 2, (bounds[5] - bounds[2]) / 2,
      );
      return G["sectionVisible"](
        camera, basis.forward, centreX, centreY, centreZ, radius, this.renderDistanceBlocks,
      );
    }

    _drawPass(program, entries, key, alpha, twoSided) {
      const gl = this.gl;
      const drawn = entries.filter((e) => e[key]);
      if (!drawn.length) return;
      program.use();
      const gl2 = gl;
      if (twoSided) gl.disable(gl.CULL_FACE);

      gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
      gl.uniform1i(program.u('u_atlas'), 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTexture);
      gl.uniform3fv(program.u('u_fogColor'), this.skyState.fog);
      gl.uniform1f(program.u('u_fogNear'), this.renderDistanceBlocks * 0.55);
      gl.uniform1f(program.u('u_fogFar'), this.renderDistanceBlocks * 1.02);
      gl.uniform1f(program.u('u_dayLight'), this.skyState.daylight);
      gl.uniform1f(program.u('u_alpha'), alpha);
      gl.uniform3f(
        program.u('u_cameraPosition'),
        this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z,
      );

      for (const entry of drawn) {
        const mesh = entry[key];
        if (!mesh) continue;
        gl.uniform3f(program.u('u_chunkOrigin'), entry.origin[0], entry.origin[1], entry.origin[2]);
        gl.uniform2f(program.u('u_section'), entry.section * 16, entry.section);
        mesh.attach(program);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
        this.stats.drawCalls++;
        this.stats.triangles += mesh.indexCount / 3;
      }

      if (twoSided) gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(null);
    }

    drawSky() {
      const gl = this.gl;
      const program = this.programs.sky;
      const basis = this.cameraBasis;
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      program.use();
      gl.uniform3fv(program.u('u_horizon'), this.skyState.horizon);
      gl.uniform3fv(program.u('u_zenith'), this.skyState.zenith);
      gl.uniform3fv(program.u('u_sunDir'), this.skyState.sunDir);
      gl.uniform1f(program.u('u_sunStrength'), this.skyState.daylight > 0.35 ? 0.9 : 0.0);
      if (basis) {
        gl.uniform3fv(program.u('u_camRight'), basis.right);
        gl.uniform3fv(program.u('u_camUp'), basis.up);
        gl.uniform3fv(program.u('u_camForward'), basis.forward);
        gl.uniform2fv(program.u('u_tanHalfFov'), basis.tanHalfFov);
      }
      this.skyMesh.attach(program);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }

    /** Wireframe box around the targeted block, plus the crack overlay. */
    drawSelection(selection, breakProgress) {
      if (!selection) return;
      const gl = this.gl;
      const program = this.programs.line;
      program.use();
      gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
      gl.uniform4f(program.u('u_color'), 0, 0, 0, 0.55);
      gl.uniform3f(program.u('u_offset'), selection.x, selection.y, selection.z);
      gl.uniform1f(program.u('u_scale'), 1.004);

      this.cubeMesh.attach(program);
      gl.depthFunc(gl.LEQUAL);
      gl.drawArrays(gl.LINES, 0, G["CUBE_EDGES"].length / 3);
      gl.bindVertexArray(null);

      if (breakProgress > 0) {
        const stage = Math.min(9, Math.floor(breakProgress * 10));
        const crack = this.programs.crack;
        crack.use();
        gl.uniformMatrix4fv(crack.u('u_viewProj'), false, this.viewProj);
        gl.uniform3f(crack.u('u_offset'), selection.x, selection.y, selection.z);
        gl.uniform1f(crack.u('u_scale'), 1.002);
        gl.uniform1f(crack.u('u_layer'), stage);
        gl.uniform1i(crack.u('u_crack'), 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.crackTexture);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        this.crackMesh.attach(crack);
        gl.drawArrays(gl.TRIANGLES, 0, this.crackVertexCount);
        gl.bindVertexArray(null);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
      }
    }

    /**
     * Uploads and draws entity boxes.
     * @param {Float32Array} vertices interleaved position(3) normal(3) color(3)
     * @param {number} vertexCount
     * @param {Float32Array|number[]} boxes per box [x,y,z, yaw, sx,sy,sz, first, count, alpha]
     */
    drawEntities(vertices, vertexCount, boxes) {
      if (!vertexCount || !boxes.length) return;
      const gl = this.gl;
      const program = this.programs.entity;
      program.use();
      gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
      gl.uniform3f(program.u('u_lightDir'), 0.4, 1.0, 0.35);
      gl.uniform1f(program.u('u_brightness'), Math.max(0.45, this.skyState.daylight));

      this.entityMesh.upload(vertices, vertexCount);
      this.entityMesh.attach(program);
      // The entity layout is interleaved position(3) normal(3) colour(3).
      {
        const aNormal = program.a('a_normal');
        const aColor = program.a('a_color');
        const stride = 36;
        if (aNormal >= 0) {
          gl.enableVertexAttribArray(aNormal);
          gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 12);
        }
        if (aColor >= 0) {
          gl.enableVertexAttribArray(aColor);
          gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 24);
        }
      }

      const model = G["mat4"]();
      let blending = false;
      for (let i = 0; i < boxes.length; i += 10) {
        const alpha = boxes[i + 9] ?? 1;
        if (!blending && alpha < 1) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          blending = true;
        }
        gl.uniform1f(program.u('u_alpha'), alpha);
        G["mat4TRS"](model, boxes[i], boxes[i + 1], boxes[i + 2], boxes[i + 3], boxes[i + 4], boxes[i + 5], boxes[i + 6]);
        gl.uniformMatrix4fv(program.u('u_model'), false, model);
        gl.drawArrays(gl.TRIANGLES, boxes[i + 7], boxes[i + 8]);
        this.stats.drawCalls++;
        this.stats.triangles += boxes[i + 8] / 3;
      }
      if (blending) gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    /**
     * Draws dropped items as small camera-facing block icons.
     * @param {Array<{x:number,y:number,z:number,blockId:number,bob?:number,age:number}>} items
     * @param {object} camera {x,y,z}
     */
    drawItems(items, camera) {
      if (!items.length || !this.iconRanges.size) return;
      const gl = this.gl;
      const program = this.programs.icon;
      program.use();
      gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
      gl.uniform1i(program.u('u_texture'), 2);
      gl.uniform1f(program.u('u_alpha'), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.iconTexture);

      // Icon layout is interleaved position(3) uv(2) shade(1).
      this.iconVaoWired = false;
      const wireIconAttributes = () => {
        if (this.iconVaoWired) return;
        gl.bindVertexArray(this.iconVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iconBuffer);
        const aPos = program.a('a_position');
        const aUv = program.a('a_uv');
        const aShade = program.a('a_shade');
        if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0); }
        if (aUv >= 0) { gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 24, 12); }
        if (aShade >= 0) { gl.enableVertexAttribArray(aShade); gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, 24, 20); }
        this.iconVaoWired = true;
      };

      // Billboard basis from the view matrix rows (right and up vectors).
      const v = this.viewMatrix;
      const rightX = v[0], rightY = v[4], rightZ = v[8];
      const upX = v[1], upY = v[5], upZ = v[9];
      const scale = 0.42;

      const model = G["mat4"]();
      for (const item of items) {
        const range = this.iconRanges.get(item.blockId);
        if (!range) continue;
        const m = model;
        m[0] = rightX * scale; m[1] = rightY * scale; m[2] = rightZ * scale; m[3] = 0;
        m[4] = upX * scale; m[5] = upY * scale; m[6] = upZ * scale; m[7] = 0;
        // Depth axis: the icon cubes are flat on Z, so move them back slightly.
        m[8] = -rightX * 0.01; m[9] = -rightY * 0.01; m[10] = -rightZ * 0.01; m[11] = 0;
        m[12] = item.x;
        m[13] = item.y + 0.18 + (item.bob ?? 0);
        m[14] = item.z;
        m[15] = 1;
        gl.uniformMatrix4fv(program.u('u_model'), false, m);
        wireIconAttributes();
        gl.bindVertexArray(this.iconVao);
        gl.drawArrays(gl.TRIANGLES, range.first, range.count);
        this.stats.drawCalls++;
        this.stats.triangles += range.count / 3;
      }
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE0);
    }

    /** Diagnostics for the visible-section decision of one entry. */
    describeFrustumDecision() {
      const camera = this.cameraPosition ?? { x: 0, y: 0, z: 0 };
      const toWorld = (entry, bounds) => (bounds
        ? [
          entry.origin[0] + bounds[0], bounds[1], entry.origin[2] + bounds[2],
          entry.origin[0] + bounds[3], bounds[4], entry.origin[2] + bounds[5],
        ]
        : null);

      // How many sections each plane rejects on its own. A plane that rejects
      // almost everything while the others reject little is the broken one.
      const perPlane = [0, 0, 0, 0, 0, 0];
      const perPlaneOnly = [0, 0, 0, 0, 0, 0];
      let total = 0;
      let kept = 0;
      const samples = [];

      for (const entry of this.sectionMeshes.values()) {
        const bounds = entry.opaqueBounds ?? entry.cutoutBounds;
        if (!bounds) continue;
        total++;
        const box = toWorld(entry, bounds);
        const rejects = [];
        for (let i = 0; i < 6; i++) {
          const a = this.frustum[i * 4], b = this.frustum[i * 4 + 1];
          const c = this.frustum[i * 4 + 2], d = this.frustum[i * 4 + 3];
          const px = a >= 0 ? box[3] : box[0];
          const py = b >= 0 ? box[4] : box[1];
          const pz = c >= 0 ? box[5] : box[2];
          if (a * px + b * py + c * pz + d < 0) rejects.push(i);
        }
        for (const i of rejects) perPlane[i]++;
        if (rejects.length === 1) perPlaneOnly[rejects[0]]++;
        const visible = this._sectionVisible(entry, entry.opaqueBounds);
        if (visible) kept++;
        // Keep a few examples of sections rejected by exactly one plane.
        if (!visible && rejects.length === 1 && samples.length < 6) {
          samples.push({
            key: `${entry.cx},${entry.cz},${entry.section}`,
            box,
            rejectedBy: ['left', 'right', 'bottom', 'top', 'near', 'far'][rejects[0]],
            distance: +Math.hypot(box[0] + 8 - camera.x, box[2] + 8 - camera.z).toFixed(0),
          });
        }
      }

      return {
        camera,
        total,
        kept,
        cullEnabled: this.cullEnabled !== false,
        planes: [0, 1, 2, 3, 4, 5].map((i) => ({
          name: ['left', 'right', 'bottom', 'top', 'near', 'far'][i],
          values: [...this.frustum.slice(i * 4, i * 4 + 4)].map((v) => +v.toFixed(4)),
        })),
        perPlane: {
          left: perPlane[0], right: perPlane[1], bottom: perPlane[2],
          top: perPlane[3], near: perPlane[4], far: perPlane[5],
        },
        perPlaneExclusive: {
          left: perPlaneOnly[0], right: perPlaneOnly[1], bottom: perPlaneOnly[2],
          top: perPlaneOnly[3], near: perPlaneOnly[4], far: perPlaneOnly[5],
        },
        samples,
      };
    }

    dispose() {
      this.clear();
      for (const program of Object.values(this.programs)) program.dispose();
      this.gl.deleteTexture(this.atlasTexture);
      this.gl.deleteTexture(this.crackTexture);
      this.gl.deleteTexture(this.iconTexture);
    }
  }

  G["Renderer"] = Renderer;
})(__mc);

/* ---- src/render/hud.js --------------------------------------------------- */
(function (G) {
  /**
   * HUD renderer: crosshair, hotbar, hearts, hunger, breath, damage flash and
   * the in-game overlays that are drawn as flat coloured quads.
   *
   * Everything is expressed in CSS pixels with the origin at the top-left corner,
   * using an orthographic projection over the layout size.
   */




  const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, a
  const ICON_FLOATS_PER_VERTEX = 8; // x, y, u, v, r, g, b, a

  /** Human-readable name for a stack, used by the held-item label. */
  function stackDisplayName(blockId) {
    return G["BLOCKS"][blockId]?.display ?? `方块 ${blockId}`;
  }

  class Hud {
    /**
     * @param {import('./renderer.js').Renderer} renderer
     * @param {object} options {iconUv: Map<number, number[]>}
     */
    constructor(renderer, options = {}) {
      this.renderer = renderer;
      this.iconUv = options.iconUv ?? new Map();
      const gl = renderer.gl;
      this.gl = gl;
      this.projection = G["mat4Ortho"](new Float32Array(16), 0, 1, 1, 0, -1, 1);
      // Colour quads: x, y, r, g, b, a.
      this.mesh = G["createDynamicMesh"](gl, 24000, 6);
      // Icon quads: x, y, u, v, r, g, b, a.
      this.iconMesh = G["createDynamicMesh"](gl, 12000, 8);
      this.vertexBuffer = [];
      this.iconVertices = [];
      this.width = 1;
      this.height = 1;
      this.scale = 1;
    }

    /** Recomputes the pixel-space projection. `scale` enlarges the whole HUD. */
    resize(width, height, scale = 1) {
      this.width = width;
      this.height = height;
      this.scale = scale;
      G["mat4Ortho"](this.projection, 0, width, height, 0, -1, 1);
    }

    /* ---------------- primitive builders ---------------- */

    /** Adds one coloured quad in pixel space. */
    rect(x, y, w, h, color) {
      const [r, g, b, a = 1] = color;
      const verts = this.vertexBuffer;
      const x1 = x + w, y1 = y + h;
      const corners = [[x, y], [x1, y], [x1, y1], [x, y1]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const c = corners[i];
        verts.push(c[0], c[1], r, g, b, a);
      }
    }

    /** Adds one block icon quad, `uv` being the icon atlas rect. */
    icon(x, y, w, h, uv, tint = [1, 1, 1, 1]) {
      if (!uv) return;
      const [u0, v0, u1, v1] = uv;
      const [r, g, b, a = 1] = tint;
      const verts = this.iconVertices;
      const x1 = x + w, y1 = y + h;
      const corners = [
        [x, y, u0, v0], [x1, y, u1, v0], [x1, y1, u1, v1], [x, y1, u0, v1],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const c = corners[i];
        verts.push(c[0], c[1], c[2], c[3], r, g, b, a);
      }
    }

    /** A heart or hunger pip drawn from quads (keeps the HUD texture-free). */
    pip(x, y, size, color, filled, outlineColor) {
      const s = size;
      const [r, g, b] = color;
      // 5x5 pixel-art shape scaled by `size / 5`.
      const shape = [
        [0, 1, 1], [1, 0, 1], [2, 0, 1], [3, 1, 1], [4, 1, 1],
        [0, 2, 1], [1, 2, 1], [2, 2, 1], [3, 2, 1], [4, 2, 1],
        [0, 3, 1], [1, 3, 1], [2, 3, 1], [3, 3, 1], [4, 3, 1],
        [1, 4, 1], [2, 4, 1], [3, 4, 1],
        [2, 5, 1],
      ];
      const unit = s / 5;
      if (!filled) {
        this.rect(x, y, s, s * 1.2, [0, 0, 0, 0.35]);
        return;
      }
      for (const [px, py] of shape) {
        this.rect(x + px * unit, y + py * unit, unit + 0.5, unit + 0.5, [r, g, b, 1]);
      }
      if (outlineColor) {
        this.rect(x, y + unit * 0.9, unit * 5, unit * 0.25, outlineColor);
      }
    }

    /** Converts a discrete value into full/half/empty count for the stat bars. */
    _statPips(value, max, perPip) {
      const full = Math.floor(value / perPip);
      const half = value % perPip > 0 && value < max ? 1 : 0;
      return { full, half, total: Math.ceil(max / perPip) };
    }

    /* ---------------- the HUD itself ---------------- */

    /**
     * @param {object} state
     * @param {import('../game/player.js').Player} state.player
     * @param {import('../game/inventory.js').Inventory} state.inventory
     * @param {boolean} [state.showHotbar]
     * @param {number} [state.damageFlash] 0..1
     * @param {boolean} [state.underwater]
     * @param {string} [state.mode]
     */
    render(state) {
      this.vertexBuffer.length = 0;
      this.iconVertices.length = 0;

      const player = state.player;
      const inv = state.inventory;
      const s = this.scale;
      const w = this.width;
      const h = this.height;

      // --- underwater tint
      if (state.underwater) {
        this.rect(0, 0, w, h, [0.15, 0.35, 0.75, 0.28]);
      }

      // --- damage flash
      if (state.damageFlash > 0) {
        this.rect(0, 0, w, h, [0.7, 0.05, 0.05, Math.min(0.45, state.damageFlash * 0.45)]);
      }

      const showHotbar = state.showHotbar !== false;
      if (showHotbar) this._renderHotbar(inv, s, w, h, state);

      if (state.mode !== 'creative') {
        this._renderStats(player, s, w, h);
      }

      this._flush();
    }

    _renderHotbar(inv, s, w, h, state) {
      const slot = Math.round(22 * s);
      const gap = Math.round(2 * s);
      const totalWidth = slot * 9 + gap * 8;
      const startX = Math.round((w - totalWidth) / 2);
      const y = Math.round(h - slot - 6 * s);

      // Backing plate.
      this.rect(startX - 4 * s, y - 4 * s, totalWidth + 8 * s, slot + 8 * s, [0, 0, 0, 0.45]);

      for (let i = 0; i < 9; i++) {
        const x = startX + i * (slot + gap);
        const selected = i === inv.selected;
        this.rect(x, y, slot, slot, selected ? [1, 1, 1, 0.32] : [0, 0, 0, 0.32]);
        this.rect(x, y, slot, Math.max(1, Math.round(s)), [0, 0, 0, 0.5]);

        const stack = inv.slots[i];
        if (!stack) continue;
        const uv = this.iconUv.get(stack.id);
        if (uv) {
          const pad = Math.round(2.5 * s);
          this.icon(x + pad, y + pad, slot - pad * 2, slot - pad * 2, uv);
        }
        if (stack.count > 1) {
          const countColor = stack.count === 1 ? [1, 1, 1, 1] : [1, 1, 1, 1];
          this._digitBadge(x + slot - Math.round(2 * s), y + slot - Math.round(2 * s), stack.count, s, countColor);
        }
      }

      // Held item name above the hotbar.
      const stack = inv.slots[inv.selected];
      if (stack && state.showHeldName !== false) {
        this._textBadge(stackDisplayName(stack.id), Math.round(w / 2), y - Math.round(18 * s), s, state.heldNameAlpha ?? 1);
      }
    }

    _renderStats(player, s, w, h) {
      const pipSize = Math.round(9 * s);
      const pipGap = Math.round(1 * s);
      const rowY = Math.round(h - 22 * s - 24 * s);
      const heartStart = Math.round(w / 2 - (pipSize * 10 + pipGap * 9) / 2);
      const { full: fullHearts, half: halfHearts } = this._statPips(player.health, 20, 2);

      // Health: 10 hearts, right-to-left from the hotbar centre.
      for (let i = 0; i < 10; i++) {
        const x = heartStart + i * (pipSize + pipGap);
        const filled = i < fullHearts;
        const half = i === fullHearts && halfHearts > 0;
        this.pip(x, rowY, pipSize, [0.85, 0.12, 0.12], filled || half, [0.25, 0.05, 0.05]);
        if (half) {
          this.rect(x, rowY, pipSize / 2, pipSize * 1.2, [0.85, 0.12, 0.12, 0.95]);
        }
      }

      // Hunger: 10 drumsticks mirrored to the right side.
      const foodStart = Math.round(w / 2 + (pipSize * 10 + pipGap * 9) / 2 + 6 * s);
      const { full: fullFood, half: halfFood } = this._statPips(player.hunger, 20, 2);
      for (let i = 0; i < 10; i++) {
        const x = foodStart + i * (pipSize + pipGap);
        const filled = i < fullFood;
        const half = i === fullFood && halfFood > 0;
        this.pip(x, rowY, pipSize, [0.72, 0.45, 0.18], filled || half, [0.3, 0.18, 0.06]);
        if (half) {
          this.rect(x, rowY, pipSize / 2, pipSize * 1.2, [0.72, 0.45, 0.18, 0.95]);
        }
      }

      // Breath bubbles when air is draining.
      if (player.air < 300) {
        const bubbles = Math.ceil((player.air / 300) * 10);
        const bubbleY = rowY - pipSize - 4 * s;
        for (let i = 0; i < bubbles; i++) {
          const x = foodStart + i * (pipSize + pipGap);
          this.rect(x, bubbleY, pipSize, pipSize, [0.55, 0.8, 1, 0.9]);
        }
      }
    }

    /** Draws a small number badge using 3x5 pixel digits (no font needed). */
    _digitBadge(right, bottom, value, s, color) {
      const digits = String(Math.max(0, Math.min(999, Math.floor(value))));
      const digitW = Math.round(3 * s);
      const digitH = Math.round(5 * s);
      const spacing = Math.round(1 * s);
      const totalW = digits.length * digitW + (digits.length - 1) * spacing;
      let x = right - totalW;
      const y = bottom - digitH;
      for (const ch of digits) {
        const pattern = DIGITS[ch];
        if (pattern) {
          for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 3; col++) {
              if (pattern[row * 3 + col] === '1') {
                this.rect(x + col * s, y + row * s, s + 0.5, s + 0.5, color);
              }
            }
          }
        }
        x += digitW + spacing;
      }
    }

    /** Draws a short label centred at (cx, cy) using the 3x5 digit font. */
    _textBadge(text, cx, cy, s, alpha = 1) {
      const chars = String(text).toUpperCase();
      const charW = Math.round(4 * s);
      const charH = Math.round(5 * s);
      const totalW = chars.length * charW;
      let x = Math.round(cx - totalW / 2);
      const y = Math.round(cy);
      for (const ch of chars) {
        const pattern = GLYPHS[ch];
        if (pattern) {
          for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 3; col++) {
              if (pattern[row * 3 + col] === '1') {
                this.rect(x + col * s, y + row * s, s + 0.5, s + 0.5, [1, 1, 1, alpha]);
              }
            }
          }
        }
        x += charW;
      }
    }

    _flush() {
      const gl = this.gl;
      const program = this.renderer.programs.hud;
      if (this.vertexBuffer.length) {
        program.use();
        gl.uniformMatrix4fv(program.u('u_projection'), false, this.projection);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.mesh.upload(new Float32Array(this.vertexBuffer), this.vertexBuffer.length / FLOATS_PER_VERTEX);
        const aPos = program.a('a_position');
        const aColor = program.a('a_color');
        this.mesh.attach(program);
        if (aColor >= 0) {
          gl.enableVertexAttribArray(aColor);
          gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 24, 8);
        }
        gl.drawArrays(gl.TRIANGLES, 0, this.vertexBuffer.length / FLOATS_PER_VERTEX);
        gl.bindVertexArray(null);
        void aPos;
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
      }

      if (this.iconVertices.length) {
        const iconProgram = this.renderer.programs.hudIcon;
        iconProgram.use();
        gl.uniformMatrix4fv(iconProgram.u('u_projection'), false, this.projection);
        gl.uniform1i(iconProgram.u('u_texture'), 3);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.renderer.iconTexture);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const count = this.iconVertices.length / ICON_FLOATS_PER_VERTEX;
        this.iconMesh.upload(new Float32Array(this.iconVertices), count);
        const aUv = iconProgram.a('a_uv');
        const aColor = iconProgram.a('a_color');
        // attach() wires the vec3 position; the icon layout has uv+colour after it.
        this.iconMesh.attach(iconProgram);
        const stride = ICON_FLOATS_PER_VERTEX * 4;
        if (aUv >= 0) { gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 8); }
        if (aColor >= 0) { gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 16); }
        gl.drawArrays(gl.TRIANGLES, 0, count);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.activeTexture(gl.TEXTURE0);
      }
    }
  }

  /** Digits as 3x5 bitmaps, used for stack counts. */
  const DIGITS = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111',
    3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
    6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
    9: '111101111001111',
  };

  /** A tiny 3x5 uppercase font for HUD labels. */
  const GLYPHS = {
    A: '111101111101101', B: '110101110101110', C: '111100100100111',
    D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '111100101101111', H: '101101111101101', I: '111010010010111',
    J: '001001001101111', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '111101101101111',
    P: '111101111100100', Q: '111101101111011', R: '111101110101101',
    S: '111100111001111', T: '111010010010010', U: '101101101101111',
    V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101111010010', Z: '111001010100111',
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
    '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
    '6': '111100111101111', '7': '111001001001001', '8': '111101111101111',
    '9': '111101111001111', ' ': '000000000000000', ':': '000010000010000',
    '.': '000000000000010', '-': '000000111000000', '/': '001001010100100',
    '(': '001010010010001', ')': '100010010010100', '!': '010010010000010',
    '?': '111001011000010', '+': '000010111010000', '%': '101001010100101',
    ',': '000000000010100', "'": '010010000000000', '*': '101010101000000',
  };

  G["stackDisplayName"] = stackDisplayName;
  G["Hud"] = Hud;
})(__mc);

/* ---- src/audio/sfx.js ---------------------------------------------------- */
(function (G) {
  /**
   * sfx.js — procedural, dependency-free sound effects for a browser Minecraft clone.
   *
   * Everything is synthesized at runtime from oscillators, a shared noise buffer,
   * biquad filters, gain nodes and an optional stereo panner. There are no
   * imports, no network requests and no sample files.
   *
   * All entry points are safe to call before `initAudio()` and in environments
   * without a usable AudioContext: they degrade to silent no-ops and never throw
   * (including on suspended or closed contexts).
   *
   * @module audio/sfx
   */

  /* ------------------------------------------------------------------ *
   * Module state
   * ------------------------------------------------------------------ */

  /** Hard ceiling on simultaneously live voices. */
  const MAX_VOICES = 24;

  /** Current master volume, 0..1. */
  let volume = 0.8;

  /** @type {AudioContext|null} Live context, or null when audio is unavailable. */
  let ctx = null;

  /** Master gain node feeding the destination. */
  let master = null;

  /** True when no AudioContext could be created: every call becomes a no-op. */
  let silentMode = false;

  /** Cached shared white-noise buffer. */
  let noiseBuffer = null;

  /** Peak amplitude of the cached noise buffer. */
  const NOISE_AMPLITUDE = 0.9;

  /** Live voices: voiceId -> { nodes, timer, retire }. */
  const voices = new Map();

  /** Lifetime count of successfully scheduled voices (diagnostics). */
  let voicesScheduled = 0;

  /** Count of voices dropped because the concurrency cap was reached. */
  let voicesDropped = 0;

  /** Internal id source for voices. */
  let voiceSeq = 0;

  /** setTimeout that survives exotic sandboxes. */
  const later = typeof setTimeout === 'function' ? setTimeout : () => 0;

  /** clearTimeout that survives exotic sandboxes. */
  const cancelLater = typeof clearTimeout === 'function' ? clearTimeout : () => {};

  /* ------------------------------------------------------------------ *
   * Diagnostics hook (optional; used by tools/sfx-check.html)
   * ------------------------------------------------------------------ */

  try {
    if (typeof globalThis !== 'undefined') {
      Object.defineProperty(globalThis, '__sfxDebug', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: {
          get active() { return voices.size; },
          get scheduled() { return voicesScheduled; },
          get dropped() { return voicesDropped; },
          get cap() { return MAX_VOICES; },
          get silentMode() { return silentMode; },
          get hasContext() { return !!ctx; },
          get context() { return ctx; },
          get state() {
            try { return ctx && typeof ctx.state === 'string' ? ctx.state : null; } catch (_) { return null; }
          },
          get sampleRate() {
            try { return ctx && ctx.sampleRate ? ctx.sampleRate : 0; } catch (_) { return 0; }
          },
          names() { return Object.keys(SOUNDS); },
          reset() { voicesScheduled = 0; voicesDropped = 0; }
        }
      });
    }
  } catch (_) { /* diagnostics are optional */ }

  /* ------------------------------------------------------------------ *
   * Small utilities
   * ------------------------------------------------------------------ */

  /** @returns {number} random float in [lo, hi) */
  function rand(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  /** @returns {number} v clamped into [lo, hi] */
  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /** @returns {boolean} true for finite numbers */
  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /** @returns {AudioContext|null} the context if it still exists and is usable */
  function liveCtx() {
    if (!ctx) return null;
    try {
      if (ctx.state === 'closed') return null;
    } catch (_) {
      return null;
    }
    return ctx;
  }

  /**
   * Build (once per context) a shared white-noise AudioBuffer.
   * @returns {AudioBuffer|null}
   */
  function getNoiseBuffer() {
    const c = liveCtx();
    if (!c) return null;
    try {
      if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
    } catch (_) { noiseBuffer = null; }
    const frames = Math.max(1, Math.floor(c.sampleRate * 2));
    let buf;
    try {
      buf = c.createBuffer(1, frames, c.sampleRate);
    } catch (_) {
      return null;
    }
    let data;
    try {
      data = buf.getChannelData(0);
    } catch (_) {
      return null;
    }
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * NOISE_AMPLITUDE;
    noiseBuffer = buf;
    return buf;
  }

  /**
   * Apply a click-free attack/hold/decay envelope to a gain param.
   * @param {AudioParam} param
   * @param {number} t0 start time
   * @param {number} peak peak gain
   * @param {number} attack attack seconds
   * @param {number} hold seconds held at peak
   * @param {number} decay decay seconds
   */
  function applyEnv(param, t0, peak, attack, hold, decay) {
    const p = Math.max(peak, 1e-5);
    const a = Math.max(attack, 0.0008);
    const h = Math.max(hold, 0);
    const d = Math.max(decay, 0.005);
    try {
      param.setValueAtTime(1e-5, t0);
      param.exponentialRampToValueAtTime(p, t0 + a);
      if (h > 0) param.setValueAtTime(p, t0 + a + h);
      param.exponentialRampToValueAtTime(1e-5, t0 + a + h + d);
      param.setValueAtTime(0, t0 + a + h + d + 0.001);
    } catch (_) {
      try { param.value = 0; } catch (__) { /* give up quietly */ }
    }
  }

  /* ------------------------------------------------------------------ *
   * Voice plumbing
   * ------------------------------------------------------------------ */

  /**
   * Open a voice: a tracked set of nodes feeding one destination that retires
   * together as soon as the scheduled tail has elapsed (`onended` when available,
   * a timer as the backstop).
   * @param {AudioContext} c
   * @param {AudioNode} dest stereo panner or master gain
   * @returns {{id:number, shim:object, nodes:Array, retire:Function, arm:Function}|null}
   */
  function openVoice(c, dest) {
    let bus;
    try {
      bus = c.createGain();
      bus.gain.value = 1;
      bus.connect(dest);
    } catch (_) {
      return null;
    }
    const id = ++voiceSeq;
    const nodes = [bus];
    const record = { id, nodes, timer: 0, done: false };
    voices.set(id, record);
    voicesScheduled++;

    const retire = () => {
      if (record.done) return;
      record.done = true;
      voices.delete(id);
      if (record.timer) cancelLater(record.timer);
      for (let i = 0; i < nodes.length; i++) {
        try { nodes[i].disconnect(); } catch (_) { /* already gone */ }
      }
      nodes.length = 0;
    };
    record.retire = retire;

    const wrapNode = (node) => {
      if (!node) return node;
      nodes.push(node);
      if ('onended' in node) {
        try { node.onended = () => retire(); } catch (_) { /* optional */ }
      }
      return new Proxy(node, {
        get(target, prop) {
          if (prop === 'connect') {
            return (d, ...rest) => {
              const real = (d && d.__sfxReal) ? d.__sfxReal : d;
              try { target.connect(real, ...rest); } catch (_) { /* ignore */ }
              return d;
            };
          }
          const v = target[prop];
          return typeof v === 'function' ? v.bind(target) : v;
        },
        set(target, prop, value) {
          try { target[prop] = value; } catch (_) { /* ignore */ }
          return true;
        }
      });
    };

    // The shim looks like the AudioContext but hands out tracked node wrappers,
    // so designers can stay oblivious to voices, cleanup and panning.
    const shim = new Proxy(c, {
      get(target, prop) {
        if (prop === '__sfxReal') return target;
        if (prop === 'createGain') return () => wrapNode(target.createGain());
        if (prop === 'createOscillator') return () => wrapNode(target.createOscillator());
        if (prop === 'createBufferSource') return () => wrapNode(target.createBufferSource());
        if (prop === 'createBiquadFilter') return () => wrapNode(target.createBiquadFilter());
        const v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      }
    });

    /** Arm the release timer for the tail that was just scheduled. */
    const arm = (seconds) => {
      const ms = Math.max(40, (isNum(seconds) ? seconds : 0.3) * 1000 + 120);
      if (record.timer) cancelLater(record.timer);
      record.timer = later(retire, ms);
    };

    return { id, shim, nodes, bus, retire, arm };
  }

  /* ------------------------------------------------------------------ *
   * DSP builders
   * ------------------------------------------------------------------ */

  /**
   * Oscillator voice: pitch (optionally swept/wobbled) -> optional filters ->
   * amplitude envelope.
   * @returns {number} scheduled end time, or 0 when nothing was scheduled
   */
  function buildTone(c, opts) {
    const t0 = (isNum(opts.t0) ? opts.t0 : c.currentTime) + (isNum(opts.delay) ? opts.delay : 0);
    const dur = Math.max(0.01, opts.dur || 0.08);
    const atk = opts.attack === undefined ? 0.004 : opts.attack;
    const hold = opts.hold === undefined ? 0 : opts.hold;
    let osc;
    try {
      osc = c.createOscillator();
    } catch (_) {
      return 0;
    }
    try {
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(1, opts.from || 200), t0);
      if (opts.to && Math.abs(opts.to - (opts.from || 0)) > 0.5) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
      }
    } catch (_) { /* keep whatever the node accepted */ }

    // Non-linear pitch wobble (bleats, growls, squeals).
    if (opts.wobble > 0) {
      try {
        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = opts.wobbleRate || 22;
        const depth = c.createGain();
        depth.gain.value = opts.wobble;
        lfo.connect(depth);
        depth.connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t0 + dur + 0.02);
      } catch (_) { /* wobble is decorative */ }
    }

    let node = osc;
    if (opts.bandpass) {
      try {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(Math.max(20, opts.bandpass), t0);
        bp.Q.value = opts.q === undefined ? 1 : opts.q;
        if (opts.bandpassTo && Math.abs(opts.bandpassTo - opts.bandpass) > 1) {
          bp.frequency.exponentialRampToValueAtTime(Math.max(20, opts.bandpassTo), t0 + dur);
        }
        node.connect(bp);
        node = bp;
      } catch (_) { /* skip stage */ }
    }
    if (opts.lowpass) {
      try {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(Math.max(20, opts.lowpass), t0);
        lp.Q.value = opts.lpQ === undefined ? 0.7 : opts.lpQ;
        node.connect(lp);
        node = lp;
      } catch (_) { /* skip stage */ }
    }
    let amp;
    try {
      amp = c.createGain();
    } catch (_) {
      return 0;
    }
    applyEnv(amp.gain, t0, opts.gain === undefined ? 0.2 : opts.gain, atk, hold, dur - atk - hold);
    node.connect(amp);
    try {
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_) {
      return 0;
    }
    return t0 + dur + 0.05;
  }

  /**
   * Noise voice: shared noise buffer -> optional filter sweep -> envelope.
   * @returns {number} scheduled end time, or 0 when nothing was scheduled
   */
  function buildNoise(c, opts) {
    const buf = getNoiseBuffer();
    if (!buf) return 0;
    const t0 = (isNum(opts.t0) ? opts.t0 : c.currentTime) + (isNum(opts.delay) ? opts.delay : 0);
    const dur = Math.max(0.005, opts.dur || 0.08);
    const atk = opts.attack === undefined ? 0.002 : opts.attack;
    const hold = opts.hold === undefined ? 0 : opts.hold;
    let src;
    try {
      src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      if (src.playbackRate) src.playbackRate.value = clamp(opts.noiseRate || 1, 0.25, 4);
    } catch (_) {
      return 0;
    }
    let node = src;

    const stages = [];
    if (opts.bandpass) stages.push(['bandpass', opts.bandpass, opts.bandpassTo, opts.q === undefined ? 0.8 : opts.q]);
    if (opts.lowpass) stages.push(['lowpass', opts.lowpass, opts.lowpassTo, opts.lpQ === undefined ? 0.7 : opts.lpQ]);
    if (opts.highpass) stages.push(['highpass', opts.highpass, opts.highpassTo, opts.hpQ === undefined ? 0.7 : opts.hpQ]);
    for (let i = 0; i < stages.length; i++) {
      const spec = stages[i];
      try {
        const f = c.createBiquadFilter();
        f.type = spec[0];
        f.frequency.setValueAtTime(Math.max(20, spec[1]), t0);
        if (spec[2] && Math.abs(spec[2] - spec[1]) > 1) {
          f.frequency.exponentialRampToValueAtTime(Math.max(20, spec[2]), t0 + dur);
        }
        f.Q.value = spec[3];
        node.connect(f);
        node = f;
      } catch (_) { /* skip stage */ }
    }

    let amp;
    try {
      amp = c.createGain();
    } catch (_) {
      return 0;
    }
    applyEnv(amp.gain, t0, opts.gain === undefined ? 0.2 : opts.gain, atk, hold, dur - atk - hold);
    if (opts.ampSweep) {
      // Extra gain movement for swells and crunchy decays.
      try {
        const mult = c.createGain();
        mult.gain.setValueAtTime(opts.ampSweep[0], t0);
        mult.gain.linearRampToValueAtTime(opts.ampSweep[1], t0 + dur * 0.5);
        mult.gain.linearRampToValueAtTime(opts.ampSweep[2], t0 + dur);
        mult.connect(amp);
        node.connect(mult);
      } catch (_) {
        node.connect(amp);
      }
    } else {
      node.connect(amp);
    }
    try {
      src.start(t0, rand(0, 1.2));
      src.stop(t0 + dur + 0.02);
    } catch (_) {
      return 0;
    }
    return t0 + dur + 0.05;
  }

  /** Convert a note name such as "C5" or "A#4" to Hz. */
  function noteHz(name) {
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(name));
    if (!m) return 440;
    const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    let semi = base[m[1].toLowerCase()];
    if (m[2] === '#') semi += 1;
    else if (m[2] === 'b') semi -= 1;
    return 440 * Math.pow(2, (semi - 9) / 12 + (Number(m[3]) - 4));
  }

  /** @returns {number} the later of two candidate end times */
  function maxEnd(a, b) {
    return b > a ? b : a;
  }

  /* ------------------------------------------------------------------ *
   * Sound designers — (ctx, t0, gain, rate) -> end time
   * ------------------------------------------------------------------ */

  /** Stone: tight clicky bandpass burst around 800 Hz plus a low tick. */
  function digStone(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.115, gain: g * 0.52, bandpass: 800 * r, q: 1.5,
      bandpassTo: 640 * r, noiseRate: r * 1.1
    });
    end = maxEnd(end, buildTone(c, {
      t0, dur: 0.05, type: 'triangle', from: 176 * r, to: 104 * r, lowpass: 620, gain: g * 0.3
    }));
    return end;
  }

  /** Gravel: brighter, crunchier double-layer bandpass burst. */
  function digGravel(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.17, gain: g * 0.44, bandpass: 1200 * r, q: 0.9,
      bandpassTo: 820 * r, noiseRate: r * 1.05, ampSweep: [0.75, 1, 0.25]
    });
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + 0.02, dur: 0.07, gain: g * 0.24, bandpass: 2600 * r, q: 2.4, noiseRate: r * 2.1
    }));
    return end;
  }

  /** Sand: airy high-passed hiss with almost no low end. */
  function digSand(c, t0, g, r) {
    return buildNoise(c, {
      t0, dur: 0.2, gain: g * 0.34, bandpass: 3000 * r, q: 0.5, bandpassTo: 2000 * r,
      highpass: 1400, noiseRate: r * 1.3, ampSweep: [0.7, 1, 0.15]
    });
  }

  /** Grass: soft mid-range rustle with a little crunch on top. */
  function digGrass(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.14, gain: g * 0.34, bandpass: 1700 * r, q: 0.6, lowpass: 4200,
      noiseRate: r * 1.2, ampSweep: [0.4, 1, 0.2]
    });
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + 0.03, dur: 0.05, gain: g * 0.16, bandpass: 2600, q: 1.6
    }));
    return end;
  }

  /** Glass: sharp noise burst plus high inharmonic partials with fast decay. */
  function digGlass(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.09, gain: g * 0.42, bandpass: 3400 * r, q: 0.8, highpass: 1600, noiseRate: r * 1.4
    });
    end = maxEnd(end, buildTone(c, { t0, dur: 0.3, type: 'sine', from: 2489 * r, to: 2460 * r, gain: g * 0.2 }));
    end = maxEnd(end, buildTone(c, { t0: t0 + 0.006, dur: 0.19, type: 'sine', from: 3721 * r, to: 3660 * r, gain: g * 0.13 }));
    end = maxEnd(end, buildTone(c, { t0: t0 + 0.012, dur: 0.1, type: 'sine', from: 5610 * r, gain: g * 0.07 }));
    return end;
  }

  /** Wool: heavily lowpassed soft thud, no transient snap. */
  function digWool(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.17, gain: g * 0.4, lowpass: 420 * r, lpQ: 0.6, noiseRate: r * 0.8
    });
    end = maxEnd(end, buildTone(c, {
      t0, dur: 0.09, type: 'sine', from: 128 * r, to: 74 * r, gain: g * 0.22
    }));
    return end;
  }

  /** Wood: noise burst plus a short low marimba-ish tone. */
  function digWood(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.09, gain: g * 0.36, bandpass: 1150 * r, q: 1.1, bandpassTo: 900 * r, noiseRate: r * 1.2
    });
    end = maxEnd(end, buildTone(c, {
      t0, dur: 0.19, type: 'triangle', from: 344 * r, to: 322 * r, lowpass: 2400, gain: g * 0.34
    }));
    end = maxEnd(end, buildTone(c, { t0, dur: 0.09, type: 'sine', from: 688 * r, gain: g * 0.1 }));
    return end;
  }

  /** Block placement: soft woody thunk without the dig transient. */
  function place(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.16, type: 'triangle', from: 286 * r, to: 228 * r, lowpass: 2000, gain: g * 0.36
    });
    end = maxEnd(end, buildNoise(c, {
      t0, dur: 0.08, gain: g * 0.26, bandpass: 620 * r, q: 0.9, lowpass: 1800
    }));
    return end;
  }

  /** Player hurt: short down-pitched sawtooth growl. */
  function playerHurt(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.24, type: 'sawtooth', from: 330 * r, to: 118 * r,
      bandpass: 620, q: 0.8, lowpass: 1300, lpQ: 2.2, gain: g * 0.3
    });
    end = maxEnd(end, buildNoise(c, { t0, dur: 0.07, gain: g * 0.16, bandpass: 900, q: 1.2 }));
    return end;
  }

  /** Player death: longer, lower, two-stage groan. */
  function playerDeath(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.9, type: 'sawtooth', from: 268 * r, to: 62 * r,
      bandpass: 430, q: 0.9, lowpass: 1100, lpQ: 2, gain: g * 0.34,
      attack: 0.01, wobble: 8, wobbleRate: 7
    });
    end = maxEnd(end, buildTone(c, {
      t0: t0 + 0.05, dur: 0.7, type: 'triangle', from: 132 * r, to: 44 * r, gain: g * 0.2, attack: 0.02
    }));
    return end;
  }

  /** Pig: short nasal squeal with fast pitch jitter. */
  function mobPig(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.26, type: 'sawtooth', from: 540 * r, to: 700 * r,
      bandpass: 1250, q: 2.6, lowpass: 3200, gain: g * 0.24,
      attack: 0.012, wobble: 70 * r, wobbleRate: 26
    });
    end = maxEnd(end, buildTone(c, {
      t0: t0 + 0.05, dur: 0.18, type: 'square', from: 760 * r, to: 380 * r,
      bandpass: 1900, q: 3.2, gain: g * 0.1, wobble: 90, wobbleRate: 34
    }));
    return end;
  }

  /** Sheep: bleating vibrato tone. */
  function mobSheep(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.52, type: 'sawtooth', from: 372 * r, to: 322 * r,
      bandpass: 980, q: 1.6, lowpass: 3000, gain: g * 0.24,
      attack: 0.015, wobble: 34 * r, wobbleRate: 17
    });
    end = maxEnd(end, buildTone(c, { t0, dur: 0.4, type: 'sine', from: 186 * r, to: 168 * r, gain: g * 0.1 }));
    return end;
  }

  /** Zombie: low growled formant-ish pulse. */
  function mobZombie(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.58, type: 'sawtooth', from: 118 * r, to: 92 * r,
      bandpass: 340, q: 3.4, lowpass: 1500, gain: g * 0.3,
      attack: 0.03, wobble: 10 * r, wobbleRate: 9
    });
    end = maxEnd(end, buildTone(c, {
      t0: t0 + 0.28, dur: 0.36, type: 'sawtooth', from: 96 * r, to: 72 * r,
      bandpass: 470, q: 3, lowpass: 1400, gain: g * 0.24, attack: 0.03, wobble: 8, wobbleRate: 7
    }));
    end = maxEnd(end, buildNoise(c, { t0, dur: 0.5, gain: g * 0.09, bandpass: 520 * r, q: 1.1 }));
    return end;
  }

  /** Generic mob hurt: mid-range growl with a noise edge. */
  function mobHurt(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.26, type: 'sawtooth', from: 232 * r, to: 130 * r,
      bandpass: 660, q: 1.8, lowpass: 2200, gain: g * 0.28, attack: 0.008
    });
    end = maxEnd(end, buildNoise(c, { t0, dur: 0.09, gain: g * 0.14, bandpass: 1400 * r, q: 1.3 }));
    return end;
  }

  /** Item pickup: two quick rising blips. */
  function itemPickup(c, t0, g, r) {
    let end = buildTone(c, { t0, dur: 0.07, type: 'triangle', from: 780 * r, to: 900 * r, gain: g * 0.26 });
    end = maxEnd(end, buildTone(c, {
      t0: t0 + 0.055, dur: 0.1, type: 'triangle', from: 1170 * r, to: 1500 * r, gain: g * 0.24
    }));
    return end;
  }

  /** Item pop: very short sine blip with a fast pitch drop. */
  function itemPop(c, t0, g, r) {
    let end = buildTone(c, { t0, dur: 0.1, type: 'sine', from: 660 * r, to: 230 * r, gain: g * 0.32 });
    end = maxEnd(end, buildTone(c, { t0, dur: 0.05, type: 'triangle', from: 1320 * r, to: 900 * r, gain: g * 0.1 }));
    return end;
  }

  /** UI click: very short triangle blip with a fast pitch drop. */
  function click(c, t0, g, r) {
    return buildTone(c, {
      t0, dur: 0.045, type: 'triangle', from: 1150 * r, to: 620 * r,
      lowpass: 5200, gain: g * 0.28, attack: 0.001
    });
  }

  /** Open: rising woody creak plus a soft latch thunk. */
  function openSfx(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.36, type: 'sawtooth', from: 168 * r, to: 268 * r,
      bandpass: 900, bandpassTo: 1500, q: 4.5, lowpass: 2600, gain: g * 0.18,
      attack: 0.02, wobble: 12, wobbleRate: 15
    });
    end = maxEnd(end, buildNoise(c, {
      t0, dur: 0.34, gain: g * 0.14, bandpass: 1400 * r, bandpassTo: 2400 * r, q: 2.4,
      ampSweep: [0.35, 1, 0.3]
    }));
    end = maxEnd(end, buildTone(c, { t0: t0 + 0.3, dur: 0.12, type: 'sine', from: 150 * r, to: 96 * r, gain: g * 0.2 }));
    return end;
  }

  /** Close: descending creak and a solid thunk. */
  function closeSfx(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.26, type: 'sawtooth', from: 268 * r, to: 158 * r,
      bandpass: 1400, bandpassTo: 780, q: 4, lowpass: 2400, gain: g * 0.18, attack: 0.012
    });
    end = maxEnd(end, buildTone(c, {
      t0: t0 + 0.12, dur: 0.16, type: 'triangle', from: 310 * r, to: 150 * r, lowpass: 1800, gain: g * 0.3
    }));
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + 0.12, dur: 0.09, gain: g * 0.2, bandpass: 700 * r, q: 0.9, lowpass: 1500
    }));
    return end;
  }

  /** Splash: long noise swell through a sweeping lowpass. */
  function splash(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.95, gain: g * 0.4, lowpass: 500, lowpassTo: 3200, lpQ: 1.1,
      highpass: 220, noiseRate: r * 1.05, attack: 0.16, ampSweep: [0.25, 1, 0.18]
    });
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + 0.05, dur: 0.5, gain: g * 0.16, bandpass: 1800 * r, bandpassTo: 900 * r,
      q: 0.7, attack: 0.05
    }));
    end = maxEnd(end, buildTone(c, {
      t0, dur: 0.22, type: 'sine', from: 220 * r, to: 70 * r, gain: g * 0.18, attack: 0.01
    }));
    return end;
  }

  /** Explosion: broadband noise with a long tail plus a low sine thump. */
  function explode(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 1.5, gain: g * 0.55, lowpass: 2600, lowpassTo: 320, lpQ: 0.8,
      highpass: 40, noiseRate: r * 0.95, attack: 0.008, ampSweep: [1, 0.6, 0.2]
    });
    end = maxEnd(end, buildNoise(c, {
      t0, dur: 0.35, gain: g * 0.3, bandpass: 620 * r, bandpassTo: 180 * r, q: 0.6
    }));
    end = maxEnd(end, buildTone(c, {
      t0, dur: 0.75, type: 'sine', from: 92 * r, to: 32 * r, gain: g * 0.5, attack: 0.006
    }));
    return end;
  }

  /** TNT fuse: sparse crackling hiss. */
  function fuse(c, t0, g, r) {
    let end = 0;
    for (let i = 0; i < 7; i++) {
      end = maxEnd(end, buildNoise(c, {
        t0: t0 + i * 0.115 + rand(-0.02, 0.02),
        dur: rand(0.03, 0.07),
        gain: g * rand(0.12, 0.24),
        bandpass: rand(1800, 4200) * r,
        q: rand(1.5, 3),
        highpass: 900,
        noiseRate: r * rand(1.2, 1.8)
      }));
    }
    return end;
  }

  /** Level up: short rising bell arpeggio. */
  function levelup(c, t0, g, r) {
    const notes = ['C5', 'E5', 'G5', 'A5', 'C6', 'E6'];
    let end = 0;
    for (let i = 0; i < notes.length; i++) {
      const f = noteHz(notes[i]) * r;
      const st = t0 + i * 0.085;
      end = maxEnd(end, buildTone(c, {
        t0: st, dur: 0.7 - i * 0.05, type: 'triangle', from: f, to: f * 0.998, gain: g * 0.16
      }));
      end = maxEnd(end, buildTone(c, { t0: st, dur: 0.4, type: 'sine', from: f * 2.01, gain: g * 0.055 }));
    }
    return end;
  }

  /** Bow release: taut string thwip. */
  function bow(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 0.13, gain: g * 0.3, bandpass: 1500 * r, bandpassTo: 600 * r, q: 1.6, noiseRate: r * 1.4
    });
    end = maxEnd(end, buildTone(c, {
      t0, dur: 0.12, type: 'triangle', from: 420 * r, to: 170 * r, lowpass: 2200, gain: g * 0.18
    }));
    return end;
  }

  /** Arrow flight: short airy whoosh. */
  function arrow(c, t0, g, r) {
    return buildNoise(c, {
      t0, dur: 0.3, gain: g * 0.26, bandpass: 2400 * r, bandpassTo: 900 * r, q: 1.2,
      highpass: 700, attack: 0.03, ampSweep: [0.2, 1, 0.25], noiseRate: r * 1.2
    });
  }

  /** Door: hinge creak sweep plus a latch clunk. */
  function door(c, t0, g, r) {
    let end = buildTone(c, {
      t0, dur: 0.42, type: 'sawtooth', from: 142 * r, to: 236 * r,
      bandpass: 700, bandpassTo: 1150, q: 5, lowpass: 2400, gain: g * 0.16,
      attack: 0.025, wobble: 16, wobbleRate: 12
    });
    end = maxEnd(end, buildNoise(c, {
      t0, dur: 0.4, gain: g * 0.12, bandpass: 1100 * r, bandpassTo: 1700 * r, q: 3,
      ampSweep: [0.3, 1, 0.35]
    }));
    end = maxEnd(end, buildTone(c, {
      t0: t0 + 0.34, dur: 0.16, type: 'triangle', from: 240 * r, to: 120 * r, lowpass: 1600, gain: g * 0.28
    }));
    return end;
  }

  /** Chest: latch click, wooden thud and a short hinge creak. */
  function chest(c, t0, g, r) {
    let end = buildTone(c, { t0, dur: 0.06, type: 'triangle', from: 980 * r, to: 560 * r, lowpass: 4000, gain: g * 0.16 });
    end = maxEnd(end, buildTone(c, {
      t0: t0 + 0.03, dur: 0.22, type: 'triangle', from: 330 * r, to: 240 * r, lowpass: 1800, gain: g * 0.32
    }));
    end = maxEnd(end, buildNoise(c, {
      t0: t0 + 0.02, dur: 0.24, gain: g * 0.2, bandpass: 1250 * r, bandpassTo: 820 * r, q: 2.2
    }));
    return end;
  }

  /** Furnace: low rumble with crackling embers. */
  function furnace(c, t0, g, r) {
    let end = 0;
    for (let i = 0; i < 10; i++) {
      end = maxEnd(end, buildNoise(c, {
        t0: t0 + i * 0.075 + rand(-0.015, 0.015),
        dur: rand(0.025, 0.06),
        gain: g * rand(0.08, 0.2),
        bandpass: rand(900, 2600) * r,
        q: rand(1.6, 3.4),
        highpass: 500
      }));
    }
    end = maxEnd(end, buildNoise(c, {
      t0, dur: 0.75, gain: g * 0.16, lowpass: 420 * r, lpQ: 0.8, highpass: 80, ampSweep: [0.5, 1, 0.35]
    }));
    return end;
  }

  /** Anvil: metallic inharmonic clang with a bright strike transient. */
  function anvil(c, t0, g, r) {
    const f = 174 * r;
    const ratios = [1, 2.76, 5.4, 8.93];
    const gains = [0.24, 0.16, 0.1, 0.06];
    let end = 0;
    for (let i = 0; i < ratios.length; i++) {
      end = maxEnd(end, buildTone(c, {
        t0: t0 + i * 0.002, dur: 1.1 - i * 0.2, type: 'sine', from: f * ratios[i],
        gain: g * gains[i], attack: 0.002
      }));
    }
    end = maxEnd(end, buildNoise(c, {
      t0, dur: 0.14, gain: g * 0.28, bandpass: 3600 * r, bandpassTo: 1800 * r, q: 1.4, highpass: 900
    }));
    return end;
  }

  /** Water ambient: three gentle overlapping lowpassed swells. */
  function waterAmbient(c, t0, g, r) {
    const starts = [0, 0.9, 1.8];
    let end = 0;
    for (let i = 0; i < starts.length; i++) {
      end = maxEnd(end, buildNoise(c, {
        t0: t0 + starts[i], dur: 1.0, gain: g * 0.3,
        lowpass: rand(420, 780) * r, lowpassTo: rand(260, 460) * r, lpQ: 1.1, highpass: 120,
        attack: 0.4, noiseRate: r * rand(0.6, 0.9), ampSweep: [0.2, 1, 0.2]
      }));
    }
    return end;
  }

  /** Rain: sustained bandpassed noise bed with a soft amplitude drift. */
  function rain(c, t0, g, r) {
    let end = buildNoise(c, {
      t0, dur: 2.2, gain: g * 0.26, bandpass: 2200 * r, bandpassTo: 1500 * r, q: 0.5,
      highpass: 400, attack: 0.6, noiseRate: r * 1.1, ampSweep: [0.55, 1, 0.6]
    });
    end = maxEnd(end, buildNoise(c, {
      t0, dur: 2.2, gain: g * 0.12, bandpass: 5200 * r, q: 0.8, highpass: 2000, attack: 0.8
    }));
    return end;
  }

  /** Build a quieter, slightly brighter variant of a digging texture for steps. */
  function makeStep(base) {
    return function stepped(c, t0, g, r) {
      return base(c, t0, g * 0.45, r * 1.12);
    };
  }

  /* ------------------------------------------------------------------ *
   * Sound table
   * ------------------------------------------------------------------ */

  /** name -> designer(ctx, startTime, gain, rate) -> endTime */
  const SOUNDS = {
    'dig.stone': digStone,
    'dig.wood': digWood,
    'dig.grass': digGrass,
    'dig.sand': digSand,
    'dig.gravel': digGravel,
    'dig.glass': digGlass,
    'dig.wool': digWool,
    place,
    'step.stone': makeStep(digStone),
    'step.wood': makeStep(digWood),
    'step.grass': makeStep(digGrass),
    'step.sand': makeStep(digSand),
    'step.gravel': makeStep(digGravel),
    'step.wool': makeStep(digWool),
    'player.hurt': playerHurt,
    'player.death': playerDeath,
    'mob.pig': mobPig,
    'mob.sheep': mobSheep,
    'mob.zombie': mobZombie,
    'mob.hurt': mobHurt,
    'item.pickup': itemPickup,
    'item.pop': itemPop,
    click,
    open: openSfx,
    close: closeSfx,
    splash,
    explode,
    fuse,
    levelup,
    bow,
    arrow,
    door,
    chest,
    furnace,
    anvil,
    'water.ambient': waterAmbient,
    rain
  };

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  /**
   * Lazily create the shared AudioContext and master gain. Safe to call any
   * number of times: only the first successful call builds anything, later calls
   * just re-attempt a resume. When `AudioContext` is missing or construction
   * fails, the module switches to a permanent silent mode instead of throwing.
   * @returns {void}
   */
  function initAudio() {
    if (ctx || silentMode) {
      resumeAudio();
      return;
    }
    let Ctor = null;
    try {
      Ctor = (typeof globalThis !== 'undefined' &&
        (globalThis.AudioContext || globalThis.webkitAudioContext)) || null;
    } catch (_) {
      Ctor = null;
    }
    if (typeof Ctor !== 'function') {
      silentMode = true;
      return;
    }
    let c = null;
    try {
      c = new Ctor();
    } catch (_) {
      silentMode = true;
      return;
    }
    try {
      const m = c.createGain();
      m.gain.value = volume;
      m.connect(c.destination);
      ctx = c;
      master = m;
      getNoiseBuffer();
    } catch (_) {
      try { if (c && typeof c.close === 'function') c.close(); } catch (__) { /* ignore */ }
      ctx = null;
      master = null;
      silentMode = true;
      return;
    }
    // A fresh context is often suspended until autoplay policy allows it.
    try {
      if (typeof c.resume === 'function' && c.state !== 'running') {
        const p = c.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (_) { /* staying suspended is fine: scheduling still works */ }
  }

  /**
   * Set the master output gain.
   * @param {number} v desired volume in 0..1 (clamped; non-finite values ignored)
   * @returns {void}
   */
  function setVolume(v) {
    if (!isNum(v)) return;
    volume = clamp(v, 0, 1);
    const m = master;
    if (!m) return;
    const c = liveCtx();
    try {
      const t = c ? c.currentTime : 0;
      m.gain.cancelScheduledValues(t);
      m.gain.setTargetAtTime(volume, t, 0.01);
    } catch (_) {
      try { m.gain.value = volume; } catch (__) { /* ignore */ }
    }
  }

  /**
   * Read the current master volume.
   * @returns {number} volume in 0..1 (the last requested value when audio is unavailable)
   */
  function getVolume() {
    return volume;
  }

  /**
   * Suspend audio output (hidden tab, paused game). Never throws, including on an
   * already-suspended, closed or missing context.
   * @returns {void}
   */
  function suspendAudio() {
    const c = liveCtx();
    if (!c || typeof c.suspend !== 'function') return;
    if (c.state === 'suspended') return;
    try {
      const p = c.suspend();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  /**
   * Resume audio output. Never throws, including on a closed or missing context.
   * @returns {void}
   */
  function resumeAudio() {
    const c = liveCtx();
    if (!c || typeof c.resume !== 'function') return;
    if (c.state === 'running') return;
    try {
      const p = c.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  /**
   * Play a named sound effect. Unknown names are silently ignored and every
   * failure path (no context, closed context, node-construction error) is
   * swallowed, so callers never see an exception.
   * @param {string} name one of the supported sound names
   * @param {{volume?: number, rate?: number, pan?: number}} [opts]
   *        volume = per-call gain multiplier, rate = pitch multiplier,
   *        pan = -1 (left) .. 1 (right), ignored when panning is unsupported
   * @returns {void}
   */
  function playSfx(name, opts) {
    try {
      if (typeof name !== 'string') return;
      const design = SOUNDS[name];
      if (typeof design !== 'function') return;   // unknown name: ignore silently
      const c = liveCtx();
      if (!c || !master) return;                  // not initialised, or closed
      if (voices.size >= MAX_VOICES) {            // concurrency cap
        voicesDropped++;
        return;
      }
      const o = opts || {};
      const vGain = isNum(o.volume) ? clamp(o.volume, 0, 4) : 1;
      const rate = isNum(o.rate) ? clamp(o.rate, 0.25, 4) : 1;
      const pan = isNum(o.pan) ? clamp(o.pan, -1, 1) : 0;

      // Per-voice destination: stereo panner when available, else the master bus.
      let dest = master;
      if (pan !== 0 && typeof c.createStereoPanner === 'function') {
        try {
          const p = c.createStereoPanner();
          p.pan.value = pan;
          p.connect(master);
          dest = p;
        } catch (_) {
          dest = master;
        }
      }

      const voice = openVoice(c, dest);
      if (!voice) return;

      // Slight random detune/gain per call so repeats never machine-gun.
      const g = vGain * rand(0.88, 1.12);
      const r = rate * rand(0.94, 1.07);

      let end = 0;
      try {
        end = design(voice.shim, c.currentTime, g, r) || 0;
      } catch (_) {
        end = 0;
      }
      voice.arm(end > 0 ? end - c.currentTime : 0.3);
    } catch (_) {
      // Never propagate audio failures into gameplay.
    }
  }

  G["initAudio"] = initAudio;
  G["setVolume"] = setVolume;
  G["getVolume"] = getVolume;
  G["suspendAudio"] = suspendAudio;
  G["resumeAudio"] = resumeAudio;
  G["playSfx"] = playSfx;
})(__mc);

/* ---- src/world/world.js -------------------------------------------------- */
(function (G) {
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




  const CHUNK_KEY = (cx, cz) => `${cx},${cz}`;
  const DIRS4 = [
    { dir: 0, dx: 1, dz: 0 },
    { dir: 1, dx: -1, dz: 0 },
    { dir: 4, dx: 0, dz: 1 },
    { dir: 5, dx: 0, dz: -1 },
  ];

  /** Biome ids as produced by the generator, for the debug overlay. */
  const BIOME_NAMES = [
    'ocean', 'plains', 'forest', 'desert', 'mountains', 'taiga', 'swamp', 'beach', 'snowy', 'mushroom',
  ];

  class Chunk {
    constructor(cx, cz) {
      this.cx = cx;
      this.cz = cz;
      this.blocks = null;          // Uint8Array(G["CHUNK_SIZE"] * G["WORLD_HEIGHT"] * G["CHUNK_SIZE"])
      this.heights = null;         // Int16Array(G["CHUNK_SIZE"] * G["CHUNK_SIZE"])
      this.biomes = null;
      this.state = 'pending';      // pending | ready
      this.dirtySections = new Set();
      /** @type {Map<number, {opaque: any, cutout: any, empty: boolean}>} */
      this.meshes = new Map();
      this.meshGeneration = 0;
    }

    get(x, y, z) {
      if (!this.blocks || x < 0 || z < 0 || x >= G["CHUNK_SIZE"] || z >= G["CHUNK_SIZE"]) return 0;
      if (y < 0 || y >= G["WORLD_HEIGHT"]) return 0;
      return this.blocks[G["chunkIndex"](x, y, z)];
    }

    set(x, y, z, id) {
      if (!this.blocks || x < 0 || z < 0 || x >= G["CHUNK_SIZE"] || z >= G["CHUNK_SIZE"]) return;
      if (y < 0 || y >= G["WORLD_HEIGHT"]) return;
      this.blocks[G["chunkIndex"](x, y, z)] = id;
    }
  }

  class World {
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
        result = G["generateChunk"](this.seed, chunk.cx, chunk.cz);
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

      for (let s = 0; s < G["SECTION_COUNT"]; s++) chunk.dirtySections.add(s);
      this.enqueueMesh(chunk);

      // Neighbours that were waiting on this border need a re-mesh.
      for (const d of DIRS4) {
        const neighbour = this.chunks.get(CHUNK_KEY(chunk.cx + d.dx, chunk.cz + d.dz));
        if (neighbour && neighbour.state === 'ready') {
          for (let s = 0; s < G["SECTION_COUNT"]; s++) neighbour.dirtySections.add(s);
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
      map.set(G["chunkIndex"](x, y, z), id);
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
        result = G["meshSection"](chunk.cx, chunk.cz, section, chunk.blocks, this._neighbourColumns(chunk));
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
        for (let s = 0; s < G["SECTION_COUNT"]; s++) chunk.dirtySections.add(s);
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
      const pcx = Math.floor(px / G["CHUNK_SIZE"]);
      const pcz = Math.floor(pz / G["CHUNK_SIZE"]);
      const radius = this.renderDistance;
      const distance2 = (cx, cz) => ((cx * G["CHUNK_SIZE"] + 8 - px) ** 2) + ((cz * G["CHUNK_SIZE"] + 8 - pz) ** 2);

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
          for (let s = 0; s < G["SECTION_COUNT"]; s++) {
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
      const chunk = this.chunks.get(CHUNK_KEY(Math.floor(x / G["CHUNK_SIZE"]), Math.floor(z / G["CHUNK_SIZE"])));
      return !!(chunk && chunk.state === 'ready');
    }

    /* ---------------- block access ---------------- */

    getChunk(cx, cz) {
      return this.chunks.get(CHUNK_KEY(cx, cz)) || null;
    }

    /** Block id at world coordinates. Unloaded chunks read as air above y=0. */
    getBlock(x, y, z) {
      if (y < 0 || y >= G["WORLD_HEIGHT"]) return 0;
      const cx = Math.floor(x / G["CHUNK_SIZE"]);
      const cz = Math.floor(z / G["CHUNK_SIZE"]);
      const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
      if (!chunk || chunk.state !== 'ready') {
        // Treat the void below the world as bedrock so the player never falls out.
        return y <= 0 ? 6 : 0;
      }
      const lx = x - cx * G["CHUNK_SIZE"];
      const lz = z - cz * G["CHUNK_SIZE"];
      return chunk.blocks[G["chunkIndex"](lx, y, lz)];
    }

    isSolidAt(x, y, z) {
      return G["isSolid"](this.getBlock(x, y, z));
    }

    isOpaqueAt(x, y, z) {
      return G["isOpaque"](this.getBlock(x, y, z));
    }

    isLiquidAt(x, y, z) {
      return G["isLiquid"](this.getBlock(x, y, z));
    }

    /** Highest non-air block at (x, z) in a loaded chunk, or null. */
    heightAt(x, z) {
      const cx = Math.floor(x / G["CHUNK_SIZE"]);
      const cz = Math.floor(z / G["CHUNK_SIZE"]);
      const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
      if (!chunk || chunk.state !== 'ready') return null;
      const lx = x - cx * G["CHUNK_SIZE"];
      const lz = z - cz * G["CHUNK_SIZE"];
      for (let y = G["WORLD_HEIGHT"] - 1; y >= 0; y--) {
        if (chunk.blocks[G["chunkIndex"](lx, y, lz)] !== 0) return y;
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
      if (y < 0 || y >= G["WORLD_HEIGHT"]) return false;
      const cx = Math.floor(x / G["CHUNK_SIZE"]);
      const cz = Math.floor(z / G["CHUNK_SIZE"]);
      const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
      if (!chunk || chunk.state !== 'ready') return false;
      const lx = x - cx * G["CHUNK_SIZE"];
      const lz = z - cz * G["CHUNK_SIZE"];
      const index = G["chunkIndex"](lx, y, lz);
      if (chunk.blocks[index] === id) return false;
      chunk.blocks[index] = id;
      if (record) this._recordEdit(chunk, lx, y, lz, id);

      // Refresh the cached height map used for placement and spawning.
      if (chunk.heights) {
        const hIdx = lz * G["CHUNK_SIZE"] + lx;
        if (id !== 0 && y > chunk.heights[hIdx]) chunk.heights[hIdx] = y;
        else if (id === 0 && y === chunk.heights[hIdx]) {
          let ny = y;
          while (ny > 0 && chunk.blocks[G["chunkIndex"](lx, ny, lz)] === 0) ny--;
          chunk.heights[hIdx] = ny;
        }
      }

      this._markDirty(chunk, lx, y, lz);
      return true;
    }

    /** Marks a section dirty and, on chunk borders, asks the neighbour to re-mesh too. */
    _markDirty(chunk, lx, y, lz) {
      const section = Math.floor(y / G["SECTION_HEIGHT"]);
      chunk.dirtySections.add(section);
      this.enqueueMesh(chunk);

      const touch = (nx, nz, nsx, nsz) => {
        const neighbour = this.chunks.get(CHUNK_KEY(chunk.cx + nx, chunk.cz + nz));
        if (!neighbour || neighbour.state !== 'ready') return;
        neighbour.dirtySections.add(section);
        if (Math.floor((y + 1) / G["SECTION_HEIGHT"]) !== section) {
          neighbour.dirtySections.add(Math.floor((y + 1) / G["SECTION_HEIGHT"]));
        }
        this.enqueueMesh(neighbour);
      };
      if (lx === 0) touch(-1, 0);
      if (lx === G["CHUNK_SIZE"] - 1) touch(1, 0);
      if (lz === 0) touch(0, -1);
      if (lz === G["CHUNK_SIZE"] - 1) touch(0, 1);
    }

    /**
     * Also re-light/re-mesh the section above and below when light could leak
     * through the changed block. Called by the interaction layer before/after
     * placement so torches light up their surroundings correctly.
     */
    markLightDirty(x, y, z) {
      const cx = Math.floor(x / G["CHUNK_SIZE"]);
      const cz = Math.floor(z / G["CHUNK_SIZE"]);
      const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
      if (!chunk || chunk.state !== 'ready') return;
      const section = Math.floor(y / G["SECTION_HEIGHT"]);
      chunk.dirtySections.add(section);
      if (section > 0) chunk.dirtySections.add(section - 1);
      if (section < G["SECTION_COUNT"] - 1) chunk.dirtySections.add(section + 1);
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
        if (y < 0 || y >= G["WORLD_HEIGHT"]) {
          if (distance > maxDistance) break;
        }
      }
      return null;
    }

    /** Convenience: the highest safe standing Y at (x, z), never below 1. */
    surfaceY(x, z) {
      const h = this.heightAt(x, z);
      return h === null ? G["SEA_LEVEL"] + 1 : Math.max(1, h + 1);
    }

    /** Human-readable biome at a column, or 'unknown' outside loaded chunks. */
    biomeNameAt(x, z) {
      const cx = Math.floor(x / G["CHUNK_SIZE"]);
      const cz = Math.floor(z / G["CHUNK_SIZE"]);
      const chunk = this.chunks.get(CHUNK_KEY(cx, cz));
      if (!chunk || chunk.state !== 'ready' || !chunk.biomes) return 'unknown';
      const lx = x - cx * G["CHUNK_SIZE"];
      const lz = z - cz * G["CHUNK_SIZE"];
      return BIOME_NAMES[chunk.biomes[lz * G["CHUNK_SIZE"] + lx]] ?? 'unknown';
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
      const originCx = Math.floor(originX / G["CHUNK_SIZE"]);
      const originCz = Math.floor(originZ / G["CHUNK_SIZE"]);
      let best = null;
      let bestDistance = Infinity;

      for (const chunk of this.chunks.values()) {
        if (chunk.state !== 'ready' || !chunk.heights) continue;
        const distance = (chunk.cx - originCx) ** 2 + (chunk.cz - originCz) ** 2;
        if (distance > bestDistance) continue;
        for (let lz = 0; lz < G["CHUNK_SIZE"]; lz += 2) {
          for (let lx = 0; lx < G["CHUNK_SIZE"]; lx += 2) {
            const h = chunk.heights[lz * G["CHUNK_SIZE"] + lx];
            if (h <= G["SEA_LEVEL"] + 1) continue;
            const x = chunk.cx * G["CHUNK_SIZE"] + lx;
            const z = chunk.cz * G["CHUNK_SIZE"] + lz;
            const ground = this.getBlock(x, h, z);
            // Skip water, ice and anything not actually solid to stand on.
            if (!G["isSolid"](ground) || G["isLiquid"](ground)) continue;
            const spotDistance = (x - originX) ** 2 + (z - originZ) ** 2;
            if (spotDistance < bestDistance) {
              bestDistance = spotDistance;
              best = { x: x + 0.5, y: h + 1.2, z: z + 0.5 };
            }
          }
        }
      }
      return best ?? { x: originX + 0.5, y: G["SEA_LEVEL"] + 12, z: originZ + 0.5 };
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
          for (let s = 0; s < G["SECTION_COUNT"]; s++) chunk.dirtySections.add(s);
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



  G["Chunk"] = Chunk;
  G["World"] = World;
  G["BIOME_NAMES"] = BIOME_NAMES;
  G["CHUNK_SIZE"] = G["CHUNK_SIZE"];
  G["WORLD_HEIGHT"] = G["WORLD_HEIGHT"];
  G["SECTION_COUNT"] = G["SECTION_COUNT"];
  G["SECTION_HEIGHT"] = G["SECTION_HEIGHT"];
  G["SEA_LEVEL"] = G["SEA_LEVEL"];
})(__mc);

/* ---- src/game/input.js --------------------------------------------------- */
(function (G) {
  /**
   * Keyboard / mouse / pointer-lock input.
   *
   * The game asks the Input object for held keys and for "pressed this frame"
   * edges; it never touches DOM events directly.
   */

  const KEY_ALIASES = {
    Space: 'jump',
    ShiftLeft: 'sneak',
    ShiftRight: 'sneak',
    ControlLeft: 'sprint',
    ControlRight: 'sprint',
  };

  const UI_CONTROL_SELECTOR = 'button, input, select, textarea, a[href], label, [contenteditable="true"], [role="button"], [role="slider"]';

  function isUiControl(target) {
    return target instanceof Element && target.closest(UI_CONTROL_SELECTOR) !== null;
  }

  class Input {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.keys = new Set();
      this.pressedThisFrame = new Set();
      this.releasedThisFrame = new Set();
      this.mouse = { dx: 0, dy: 0, buttons: new Set(), wheel: 0 };
      this.mouseDownEvents = [];
      this.touchLook = { dx: 0, dy: 0 };
      this.touchMove = { x: 0, y: 0 };
      this.locked = false;
      this.sensitivity = options.sensitivity ?? 0.0022;
      this.invertY = options.invertY ?? false;
      this.enabled = true;
      this.onKey = options.onKey || null;
      this.onMouseDown = options.onMouseDown || null;
      this.onWheel = options.onWheel || null;
      this.onLockChange = options.onLockChange || null;
      /** Set while a text field (chat, seed input, search) owns the keyboard. */
      this.textMode = false;

      this._bind();
    }

    _bind() {
      this._onKeyDown = (event) => {
        if (this.textMode) return;
        if (isUiControl(event.target)) return;
        // Let the browser keep its own shortcuts (reload, close tab, devtools, ...).
        if (event.metaKey || event.altKey
          || (event.ctrlKey && event.code !== 'ControlLeft' && event.code !== 'ControlRight' && event.code !== 'Space')) {
          return;
        }
        const code = KEY_ALIASES[event.code] || event.code;
        if (!this.keys.has(code)) this.pressedThisFrame.add(code);
        this.keys.add(code);
        // Stop the browser from scrolling or tabbing away on game keys, but let
        // Ctrl+W / Ctrl+R through so the page stays closable.
        if (['Tab', 'F3', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
          && (!event.ctrlKey || event.code === 'Space')
          && !event.metaKey) {
          event.preventDefault();
        }
        if (this.onKey) this.onKey(code, event);
      };

      this._onKeyUp = (event) => {
        const code = KEY_ALIASES[event.code] || event.code;
        this.keys.delete(code);
        this.releasedThisFrame.add(code);
        if (this.textMode) return;
        if (this.onKey) this.onKey(code, event, true);
      };

      this._onMouseMove = (event) => {
        if (!this.locked) return;
        this.mouse.dx += event.movementX || 0;
        this.mouse.dy += event.movementY || 0;
      };

      this._onMouseDown = (event) => {
        if (this.textMode || !this.locked) return;
        this.mouse.buttons.add(event.button);
        this.mouseDownEvents.push(event.button);
        if (this.onMouseDown) this.onMouseDown(event.button, event);
        event.preventDefault();
      };

      this._onMouseUp = (event) => {
        this.mouse.buttons.delete(event.button);
        if (this.locked) event.preventDefault();
      };

      this._onWheel = (event) => {
        if (!this.locked || isUiControl(event.target)) return;
        this.mouse.wheel += Math.sign(event.deltaY);
        if (this.onWheel) this.onWheel(Math.sign(event.deltaY));
        event.preventDefault();
      };

      this._onContextMenu = (event) => event.preventDefault();

      this._onPointerLockChange = () => {
        this.locked = document.pointerLockElement === this.canvas;
        if (!this.locked) {
          this.keys.clear();
          this.mouse.buttons.clear();
        }
        if (this.onLockChange) this.onLockChange(this.locked);
      };

      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons.clear(); });
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mousedown', this._onMouseDown);
      document.addEventListener('mouseup', this._onMouseUp);
      document.addEventListener('wheel', this._onWheel, { passive: false });
      document.addEventListener('contextmenu', this._onContextMenu);
      document.addEventListener('pointerlockchange', this._onPointerLockChange);
    }

    requestLock() {
      if (this.locked) return;
      const promise = this.canvas.requestPointerLock?.();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    }

    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    }

    isDown(code) {
      return this.keys.has(code);
    }

    wasPressed(code) {
      return this.pressedThisFrame.has(code);
    }

    /** Call once per frame, after the game has consumed the edges. */
    endFrame() {
      this.pressedThisFrame.clear();
      this.releasedThisFrame.clear();
      this.mouse.dx = 0;
      this.mouse.dy = 0;
      this.mouse.wheel = 0;
      this.touchLook.dx = 0;
      this.touchLook.dy = 0;
      this.mouseDownEvents.length = 0;
    }

    /** Mouse buttons that went down during this frame (edge, not held). */
    consumeClicks() {
      const events = this.mouseDownEvents.slice();
      this.mouseDownEvents.length = 0;
      return events;
    }

    mouseButton(button) {
      return this.mouse.buttons.has(button);
    }

    setTouchKey(code, pressed) {
      if (pressed) this.keys.add(code);
      else this.keys.delete(code);
    }

    setTouchMove(x, y) {
      this.touchMove.x = x;
      this.touchMove.y = y;
    }

    setTouchButton(button, pressed) {
      if (pressed) this.mouse.buttons.add(button);
      else this.mouse.buttons.delete(button);
    }

    addTouchLook(dx, dy) {
      this.touchLook.dx += dx;
      this.touchLook.dy += dy;
    }

    /** Look delta in radians for this frame. */
    lookDelta() {
      if (!this.enabled || (!this.locked && this.touchLook.dx === 0 && this.touchLook.dy === 0)) {
        return { yaw: 0, pitch: 0 };
      }
      return {
        yaw: -(this.mouse.dx + this.touchLook.dx) * this.sensitivity,
        pitch: (this.invertY ? this.mouse.dy + this.touchLook.dy : -(this.mouse.dy + this.touchLook.dy)) * this.sensitivity,
      };
    }
  }

  G["Input"] = Input;
})(__mc);

/* ---- src/game/inventory.js ----------------------------------------------- */
(function (G) {
  /**
   * Inventory, item stacks and crafting.
   *
   * The inventory is 36 slots: 0..8 are the hotbar (index 0 rendered leftmost),
   * 9..35 are the main grid. A stack is `{ id, count }` where `id` is a block id;
   * there are no separate item ids, so every item is a placeable block.
   */


  const HOTBAR_SIZE = 9;
  const MAIN_SIZE = 27;
  const INVENTORY_SIZE = HOTBAR_SIZE + MAIN_SIZE;
  const MAX_STACK = 64;

  class Inventory {
    constructor(size = INVENTORY_SIZE) {
      /** @type {({id:number,count:number}|null)[]} */
      this.slots = new Array(size).fill(null);
      this.selected = 0;
    }

    get size() {
      return this.slots.length;
    }

    /** The stack in the currently selected hotbar slot (or null). */
    get held() {
      return this.slots[this.selected] ?? null;
    }

    selectHotbar(index) {
      this.selected = Math.max(0, Math.min(HOTBAR_SIZE - 1, index));
    }

    cycleHotbar(delta) {
      const next = (this.selected + delta) % HOTBAR_SIZE;
      this.selected = next < 0 ? next + HOTBAR_SIZE : next;
    }

    /**
     * Adds items, merging into existing stacks first.
     * @returns {number} the number left over that did not fit
     */
    add(id, count = 1) {
      let remaining = count;
      // Merge pass.
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.id === id && slot.count < MAX_STACK) {
          const space = MAX_STACK - slot.count;
          const moved = Math.min(space, remaining);
          slot.count += moved;
          remaining -= moved;
        }
      }
      // Fill empty slots.
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        if (!this.slots[i]) {
          const moved = Math.min(MAX_STACK, remaining);
          this.slots[i] = { id, count: moved };
          remaining -= moved;
        }
      }
      return remaining;
    }

    /** Consumes up to `count` of a block id; returns how many were actually removed. */
    remove(id, count = 1) {
      let remaining = count;
      for (let i = 0; i < this.slots.length && remaining > 0; i++) {
        const slot = this.slots[i];
        if (!slot || slot.id !== id) continue;
        const moved = Math.min(slot.count, remaining);
        slot.count -= moved;
        remaining -= moved;
        if (slot.count <= 0) this.slots[i] = null;
      }
      return count - remaining;
    }

    removeAt(index, count = 1) {
      const slot = this.slots[index];
      if (!slot) return 0;
      const moved = Math.min(slot.count, count);
      slot.count -= moved;
      if (slot.count <= 0) this.slots[index] = null;
      return moved;
    }

    /** Removes one item from the held stack and returns its block id. */
    consumeHeld() {
      const stack = this.held;
      if (!stack) return null;
      const id = stack.id;
      stack.count -= 1;
      if (stack.count <= 0) this.slots[this.selected] = null;
      return id;
    }

    countOf(id) {
      let total = 0;
      for (const slot of this.slots) if (slot && slot.id === id) total += slot.count;
      return total;
    }

    clear() {
      this.slots.fill(null);
    }

    serialize() {
      return {
        selected: this.selected,
        slots: this.slots.map((s) => (s ? [s.id, s.count] : null)),
      };
    }

    load(data) {
      if (!data || !Array.isArray(data.slots)) return;
      this.selected = data.selected ?? 0;
      for (let i = 0; i < this.slots.length; i++) {
        const entry = data.slots[i];
        this.slots[i] = entry ? { id: entry[0], count: entry[1] } : null;
      }
    }
  }

  /**
   * Crafting recipes. `out` is the produced block, `cost` the consumed blocks.
   * Deliberately small and Minecraft-flavoured rather than a full 3x3 grid.
   */
  const RECIPES = [
    { out: { id: G["BLOCK"].OAK_PLANKS, count: 4 }, cost: { id: G["BLOCK"].OAK_LOG, count: 1 } },
    { out: { id: G["BLOCK"].SPRUCE_PLANKS, count: 4 }, cost: { id: G["BLOCK"].SPRUCE_LOG, count: 1 } },
    { out: { id: G["BLOCK"].BIRCH_PLANKS, count: 4 }, cost: { id: G["BLOCK"].BIRCH_LOG, count: 1 } },
    { out: { id: G["BLOCK"].CRAFTING_TABLE, count: 1 }, cost: { id: G["BLOCK"].OAK_PLANKS, count: 4 } },
    { out: { id: G["BLOCK"].FURNACE, count: 1 }, cost: { id: G["BLOCK"].COBBLESTONE, count: 8 } },
    { out: { id: G["BLOCK"].TORCH, count: 4 }, cost: { id: G["BLOCK"].COAL_BLOCK, count: 1 } },
    { out: { id: G["BLOCK"].STONE_BRICKS, count: 4 }, cost: { id: G["BLOCK"].STONE, count: 4 } },
    { out: { id: G["BLOCK"].BRICKS, count: 4 }, cost: { id: G["BLOCK"].CLAY, count: 4 } },
    { out: { id: G["BLOCK"].SANDSTONE, count: 1 }, cost: { id: G["BLOCK"].SAND, count: 4 } },
    { out: { id: G["BLOCK"].COAL_BLOCK, count: 1 }, cost: { id: G["BLOCK"].COAL_ORE, count: 9 } },
    { out: { id: G["BLOCK"].IRON_BLOCK, count: 1 }, cost: { id: G["BLOCK"].IRON_ORE, count: 9 } },
    { out: { id: G["BLOCK"].GOLD_BLOCK, count: 1 }, cost: { id: G["BLOCK"].GOLD_ORE, count: 9 } },
    { out: { id: G["BLOCK"].DIAMOND_BLOCK, count: 1 }, cost: { id: G["BLOCK"].DIAMOND_ORE, count: 9 } },
    { out: { id: G["BLOCK"].STONE, count: 1 }, cost: { id: G["BLOCK"].COBBLESTONE, count: 1 } },
    { out: { id: G["BLOCK"].GLASS, count: 1 }, cost: { id: G["BLOCK"].SAND, count: 1 } },
    { out: { id: G["BLOCK"].BOOKSHELF, count: 1 }, cost: { id: G["BLOCK"].OAK_PLANKS, count: 6 } },
    { out: { id: G["BLOCK"].TNT, count: 1 }, cost: { id: G["BLOCK"].SAND, count: 4 } },
    { out: { id: G["BLOCK"].SNOW_BLOCK, count: 1 }, cost: { id: G["BLOCK"].ICE, count: 4 } },
  ];

  /** Recipes the player can currently afford, cheapest first. */
  function availableRecipes(inventory) {
    return RECIPES.filter((recipe) => inventory.countOf(recipe.cost.id) >= recipe.cost.count);
  }

  /**
   * Attempts to craft one recipe.
   * @returns {boolean} true when the ingredients were consumed and output added
   */
  function craft(inventory, recipe) {
    if (inventory.countOf(recipe.cost.id) < recipe.cost.count) return false;
    const removed = inventory.remove(recipe.cost.id, recipe.cost.count);
    if (removed < recipe.cost.count) {
      inventory.add(recipe.cost.id, removed);
      return false;
    }
    const leftover = inventory.add(recipe.out.id, recipe.out.count);
    if (leftover > 0) {
      // Should not happen with a 36-slot inventory, but never lose the output.
      console.warn('[inventory] crafting output did not fit, dropped', leftover);
    }
    return true;
  }

  /**
   * Starting inventory for a new survival world, plus the creative palette.
   * In creative mode every placeable block is available from the inventory UI.
   */
  function starterInventory() {
    const inventory = new Inventory();
    inventory.add(G["BLOCK"].OAK_PLANKS, 64);
    inventory.add(G["BLOCK"].TORCH, 64);
    inventory.add(G["BLOCK"].CRAFTING_TABLE, 1);
    inventory.add(G["BLOCK"].COBBLESTONE, 64);
    inventory.add(G["BLOCK"].GLASS, 32);
    inventory.add(G["BLOCK"].DIRT, 64);
    return inventory;
  }

  function isPlaceable(id) {
    const block = G["BLOCKS"][id];
    return !!block && id !== G["BLOCK"].AIR;
  }

  G["Inventory"] = Inventory;
  G["availableRecipes"] = availableRecipes;
  G["craft"] = craft;
  G["starterInventory"] = starterInventory;
  G["isPlaceable"] = isPlaceable;
  G["HOTBAR_SIZE"] = HOTBAR_SIZE;
  G["MAIN_SIZE"] = MAIN_SIZE;
  G["INVENTORY_SIZE"] = INVENTORY_SIZE;
  G["MAX_STACK"] = MAX_STACK;
  G["RECIPES"] = RECIPES;
})(__mc);

/* ---- src/game/mobs.js ---------------------------------------------------- */
(function (G) {
  /**
   * Entities: passive mobs, hostile mobs and dropped items.
   *
   * Mobs are rendered as coloured boxes (the classic blocky look) and use a very
   * small state machine: wander, flee, chase, attack. Everything is deterministic
   * per-mob through a seeded PRNG so behaviour is stable without a physics engine.
   */




  /** @typedef {{x:number,y:number,z:number}} Vec3 */

  const MOB_TYPES = {
    pig: {
      name: 'Pig',
      hostile: false,
      health: 10,
      width: 0.9,
      height: 0.9,
      speed: 1.3,
      color: [0.92, 0.55, 0.6],
      accent: [0.85, 0.45, 0.5],
      sound: 'mob.pig',
      drop: null,
      xp: 1,
    },
    sheep: {
      name: 'Sheep',
      hostile: false,
      health: 8,
      width: 0.9,
      height: 1.3,
      speed: 1.2,
      color: [0.94, 0.94, 0.9],
      accent: [0.82, 0.78, 0.72],
      sound: 'mob.sheep',
      drop: null,
      xp: 1,
    },
    cow: {
      name: 'Cow',
      hostile: false,
      health: 10,
      width: 0.9,
      height: 1.4,
      speed: 1.15,
      color: [0.35, 0.24, 0.18],
      accent: [0.72, 0.68, 0.62],
      sound: 'mob.pig',
      drop: null,
      xp: 1,
    },
    zombie: {
      name: 'Zombie',
      hostile: true,
      health: 20,
      width: 0.6,
      height: 1.95,
      speed: 1.55,
      attackDamage: 3,
      attackRange: 1.4,
      attackCooldown: 1.0,
      color: [0.25, 0.45, 0.32],
      accent: [0.35, 0.6, 0.45],
      sound: 'mob.zombie',
      drop: null,
      xp: 5,
    },
  };

  let nextEntityId = 1;

  class Entity {
    constructor(type, x, y, z, seed = 1) {
      this.id = nextEntityId++;
      this.type = type;
      this.def = MOB_TYPES[type];
      this.x = x; this.y = y; this.z = z;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.yaw = 0;
      this.health = this.def.health;
      this.onGround = false;
      this.hurtTime = 0;
      this.wanderTimer = 0;
      this.attackTimer = 0;
      this.dead = false;
      this.removeTimer = 0;      // > 0 means it is playing its death animation
      this.swingPhase = 0;
      this.rand = G["mulberry32"](seed * 2654435761 + 1);
      this.wanderDir = this.rand() * Math.PI * 2;
      this.inWater = false;
      this.moving = false;
    }

    get width() { return this.def.width; }
    get height() { return this.def.height; }

    damage(amount, knockbackFrom = null) {
      if (this.dead) return;
      this.health -= amount;
      this.hurtTime = 0.45;
      if (knockbackFrom) {
        const dx = this.x - knockbackFrom.x;
        const dz = this.z - knockbackFrom.z;
        const len = Math.hypot(dx, dz) || 1;
        this.vx += (dx / len) * 5;
        this.vz += (dz / len) * 5;
        this.vy = Math.max(this.vy, 4.2);
      }
      if (this.health <= 0) {
        this.dead = true;
        this.removeTimer = 0.9;
      }
    }
  }

  class ItemEntity {
    constructor(blockId, x, y, z, count = 1) {
      this.id = nextEntityId++;
      this.blockId = blockId;
      this.count = count;
      this.x = x; this.y = y; this.z = z;
      this.vx = (Math.random() - 0.5) * 1.6;
      this.vy = 1.6;
      this.vz = (Math.random() - 0.5) * 1.6;
      this.age = 0;
      this.onGround = false;
      this.pickupDelay = 0.5;
      this.dead = false;
      this.isItem = true;
      this.bob = 0;
      this.width = 0.25;
      this.height = 0.25;
    }
  }

  const GRAVITY = 26;

  /** Tests a mob-sized AABB against the world. */
  function boxCollides(world, x, y, z, width, height) {
    const half = width / 2 - 0.001;
    const minX = Math.floor(x - half), maxX = Math.ceil(x + half) - 1;
    const minY = Math.floor(y + 0.001), maxY = Math.ceil(y + height - 0.001) - 1;
    const minZ = Math.floor(z - half), maxZ = Math.ceil(z + half) - 1;
    for (let by = minY; by <= maxY; by++) {
      if (by < 0 || by >= G["WORLD_HEIGHT"]) continue;
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (G["isSolid"](world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  function moveEntity(world, entity, dx, dy, dz) {
    const width = entity.width ?? 0.25;
    const height = entity.height ?? 0.25;
    let hitX = false, hitY = false, hitZ = false;

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
    const sx = dx / steps, sy = dy / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      if (!boxCollides(world, entity.x + sx, entity.y, entity.z, width, height)) entity.x += sx;
      else { hitX = true; entity.vx = 0; }

      if (!boxCollides(world, entity.x, entity.y + sy, entity.z, width, height)) entity.y += sy;
      else { hitY = true; entity.vy = 0; }

      if (!boxCollides(world, entity.x, entity.y, entity.z + sz, width, height)) entity.z += sz;
      else { hitZ = true; entity.vz = 0; }
    }
    return { hitX, hitY, hitZ };
  }

  /** True when a solid block sits directly under the entity (or a liquid). */
  function hasGround(world, entity) {
    return boxCollides(world, entity.x, entity.y - 0.08, entity.z, entity.width ?? 0.25, 0.08);
  }

  /** True when the entity can step up one block in the given direction. */
  function canStepUp(world, entity, dirX, dirZ) {
    const width = entity.width ?? 0.25;
    const height = entity.height ?? 0.25;
    const nx = entity.x + dirX * 0.55;
    const nz = entity.z + dirZ * 0.55;
    if (!boxCollides(world, nx, entity.y, nz, width, height)) return 'flat';
    // Try climbing a single block.
    for (const lift of [0.55, 1.05]) {
      if (!boxCollides(world, nx, entity.y + lift, nz, width, height)) return lift;
    }
    return 'blocked';
  }

  class EntityManager {
    constructor(world, options = {}) {
      this.world = world;
      /** @type {Entity[]} */
      this.mobs = [];
      /** @type {ItemEntity[]} */
      this.items = [];
      this.maxMobs = options.maxMobs ?? 18;
      this.spawnTimer = 0;
      this.stats = { spawns: 0, deaths: 0 };
      this.rng = G["mulberry32"]((world.seed ^ 0x9e3779b9) >>> 0);
    }

    get entityCount() {
      return this.mobs.length + this.items.length;
    }

    /* ---------------- spawning ---------------- */

    /** Attempts to spawn mobs around the player, respecting caps and light rules. */
    trySpawnAround(player, { spawnHostile = true, spawnPassive = true } = {}) {
      if (this.mobs.length >= this.maxMobs) return;
      const tries = 6;
      for (let i = 0; i < tries; i++) {
        const angle = this.rng() * Math.PI * 2;
        const distance = 18 + this.rng() * 22;
        const x = Math.floor(player.x + Math.cos(angle) * distance);
        const z = Math.floor(player.z + Math.sin(angle) * distance);
        if (!this.world.isLoaded(x, z)) continue;

        const h = this.world.heightAt(x, z);
        if (h === null || h < 1) continue;
        const ground = this.world.getBlock(x, h, z);
        if (!G["isSolid"](ground) || G["isLiquid"](ground)) continue;
        const above1 = this.world.getBlock(x, h + 1, z);
        const above2 = this.world.getBlock(x, h + 2, z);
        if (above1 !== 0 || above2 !== 0) continue;

        const isNight = this.world.time % 24000 > 13000 || this.world.time % 24000 < 1000;
        const hostile = spawnHostile && isNight && this.rng() < 0.62;
        if (!hostile && !spawnPassive) continue;

        const type = hostile
          ? 'zombie'
          : ['pig', 'sheep', 'cow'][Math.floor(this.rng() * 3)];
        const def = MOB_TYPES[type];
        const y = h + 1;
        if (boxCollides(this.world, x + 0.5, y, z + 0.5, def.width, def.height)) continue;
        this.spawn(type, x + 0.5, y, z + 0.5);
        this.stats.spawns++;
        return;
      }
    }

    spawn(type, x, y, z) {
      const entity = new Entity(type, x, y, z, this.rng() * 1e6 + 1);
      this.mobs.push(entity);
      return entity;
    }

    spawnItem(blockId, x, y, z, count = 1) {
      const item = new ItemEntity(blockId, x, y, z, count);
      this.items.push(item);
      return item;
    }

    /** Random horizontal offset used to scatter loot. */
    _scatter() {
      return (this.rng() - 0.5) * 0.5;
    }

    /* ---------------- update ---------------- */

    /**
     * @param {object} player the Player instance (for AI targeting and pickup)
     * @param {number} dt
     * @param {object} hooks {onSound, onPickup, onPlayerHurt, onMobHurt, onMobDeath}
     */
    update(player, dt, hooks = {}) {
      this.spawnTimer += dt;
      if (this.spawnTimer > 6) {
        this.spawnTimer = 0;
        this.trySpawnAround(player);
        this._despawnFar(player);
      }

      for (const mob of this.mobs) this._updateMob(mob, player, dt, hooks);
      for (const item of this.items) this._updateItem(item, player, dt, hooks);

      // Compact dead entities out of the arrays.
      if (this.mobs.some((m) => m.removeTimer <= 0 && m.dead)) {
        this.mobs = this.mobs.filter((m) => !(m.dead && m.removeTimer <= 0));
      }
      if (this.items.some((i) => i.dead)) this.items = this.items.filter((i) => !i.dead);
    }

    _despawnFar(player) {
      this.mobs = this.mobs.filter((mob) => {
        const d2 = (mob.x - player.x) ** 2 + (mob.z - player.z) ** 2;
        return d2 < 90 * 90;
      });
    }

    _updateMob(mob, player, dt, hooks) {
      if (mob.dead) {
        mob.removeTimer -= dt;
        if (mob.removeTimer <= 0) {
          if (mob.def.drop) {
            this.spawnItem(mob.def.drop, mob.x, mob.y + 0.4, mob.z, 1);
          }
          hooks.onMobDeath?.(mob);
        }
        return;
      }

      mob.hurtTime = Math.max(0, mob.hurtTime - dt);
      mob.swingPhase += dt * (mob.moving ? 9 : 2);

      const feetBlock = this.world.getBlock(Math.floor(mob.x), Math.floor(mob.y + 0.1), Math.floor(mob.z));
      mob.inWater = feetBlock === G["BLOCK"].WATER;

      const dxp = player.x - mob.x;
      const dzp = player.z - mob.z;
      const dyp = (player.y + player.height / 2) - (mob.y + mob.height / 2);
      const distToPlayer = Math.hypot(dxp, dzp, dyp);
      const horizontalDist = Math.hypot(dxp, dzp);

      let dirX = 0, dirZ = 0;
      let speed = mob.def.speed;

      if (mob.def.hostile) {
        if (distToPlayer < 24 && !player.dead) {
          // Chase the player.
          if (horizontalDist > 0.001) {
            dirX = dxp / horizontalDist;
            dirZ = dzp / horizontalDist;
          }
          if (distToPlayer < mob.def.attackRange + 0.6) {
            speed = 0;
            mob.attackTimer -= dt;
            if (mob.attackTimer <= 0) {
              mob.attackTimer = mob.def.attackCooldown;
              player.damage(mob.def.attackDamage, 'zombie');
              hooks.onPlayerHurt?.(mob.def.attackDamage);
            }
          } else {
            mob.attackTimer = Math.min(mob.attackTimer, 0.35);
          }
        } else {
          this._wander(mob, dt);
          dirX = Math.cos(mob.wanderDir);
          dirZ = Math.sin(mob.wanderDir);
        }
      } else {
        this._wander(mob, dt);
        dirX = Math.cos(mob.wanderDir);
        dirZ = Math.sin(mob.wanderDir);
        // Passive mobs bolt when hit.
        if (mob.hurtTime > 0) {
          dirX = -dirX; dirZ = -dirZ;
          speed = mob.def.speed * 2.1;
        }
      }

      // Face the direction of travel.
      if (dirX !== 0 || dirZ !== 0) {
        const targetYaw = Math.atan2(-dirX, -dirZ);
        let delta = targetYaw - mob.yaw;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        mob.yaw += G["clamp"](delta, -6 * dt, 6 * dt);
      }

      mob.moving = speed > 0.05;

      // Obstacle handling: step up or pick a new wander direction.
      if (mob.moving && mob.onGround) {
        const step = canStepUp(this.world, mob, dirX, dirZ);
        if (step === 'blocked') {
          if (mob.def.hostile && horizontalDist > 2) {
            // Zombies try to jump one-block walls.
            if (hasGround(this.world, mob)) mob.vy = 7.2;
          } else {
            mob.wanderDir = mob.yaw + Math.PI + (this.rng() - 0.5) * 1.4;
            dirX = Math.cos(mob.wanderDir);
            dirZ = Math.sin(mob.wanderDir);
          }
        } else if (typeof step === 'number') {
          if (hasGround(this.world, mob)) mob.vy = 7.0;
        }
      }

      const friction = mob.onGround ? 0.62 : 0.87;
      const drag = Math.pow(friction, dt * 20);
      mob.vx = mob.vx * drag + dirX * speed * dt * 7.5;
      mob.vz = mob.vz * drag + dirZ * speed * dt * 7.5;

      if (mob.inWater) {
        mob.vy += 14 * dt;                 // buoyancy
        mob.vy = G["clamp"](mob.vy, -2.4, 2.4);
      } else {
        mob.vy -= GRAVITY * dt;
        if (mob.vy < -50) mob.vy = -50;
      }

      const result = moveEntity(this.world, mob, mob.vx * dt, mob.vy * dt, mob.vz * dt);
      mob.onGround = hasGround(this.world, mob);
      if (mob.onGround && mob.vy < 0) mob.vy = 0;

      // Never let a mob fall out of the world.
      if (mob.y < -6) mob.y = G["WORLD_HEIGHT"];
    }

    _wander(mob, dt) {
      mob.wanderTimer -= dt;
      if (mob.wanderTimer <= 0) {
        mob.wanderTimer = 1.5 + this.rng() * 4.5;
        if (this.rng() < 0.35) {
          mob.wanderDir = mob.yaw + Math.PI;   // idle
          mob.wanderTimer = 1 + this.rng() * 2;
        } else {
          mob.wanderDir = this.rng() * Math.PI * 2;
        }
      }
    }

    _updateItem(item, player, dt, hooks) {
      item.age += dt;
      item.pickupDelay = Math.max(0, item.pickupDelay - dt);

      const block = this.world.getBlock(Math.floor(item.x), Math.floor(item.y), Math.floor(item.z));
      const liquid = block === G["BLOCK"].WATER;

      if (liquid) {
        item.vy += 12 * dt;
        item.vy = G["clamp"](item.vy, -1.5, 1.5);
      } else {
        item.vy -= GRAVITY * dt;
        if (item.vy < -40) item.vy = -40;
      }

      const drag = Math.pow(item.onGround ? 0.6 : 0.94, dt * 20);
      item.vx *= drag;
      item.vz *= drag;

      moveEntity(this.world, item, item.vx * dt, item.vy * dt, item.vz * dt);
      item.onGround = hasGround(this.world, item);
      if (item.onGround && item.vy < 0) item.vy = 0;

      // Float and shrink the render height so items look like they hover.
      item.bob = Math.sin(item.age * 2.4) * 0.09;

      // Pickup.
      if (item.pickupDelay <= 0 && !player.dead) {
        const dx = player.x - item.x;
        const dy = (player.y + 0.9) - item.y;
        const dz = player.z - item.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 2.2 * 2.2) {
          const leftover = hooks.onPickup?.(item.blockId, item.count) ?? item.count;
          if (leftover <= 0) {
            item.dead = true;
          } else {
            item.count = leftover;
            item.pickupDelay = 0.6;
          }
        }
      }

      if (item.age > 300) item.dead = true;
      if (item.y < -8) item.y = G["WORLD_HEIGHT"];
    }

    /**
     * Damages the closest mob along the player's look ray (the vanilla-style
     * "hit the entity you are aiming at" behaviour).
     * @returns {boolean} true when a mob was hit
     */
    attackFrom(player, reach = 3.2, damage = 4) {
      const [lx, ly, lz] = player.lookVector();
      const eyeY = player.eyeY;
      let best = null;
      let bestT = Infinity;

      for (const mob of this.mobs) {
        if (mob.dead) continue;
        // Ray vs. the mob's AABB, expanded slightly for a forgiving hitbox.
        const half = mob.width / 2 + 0.1;
        const t = rayBox(
          [player.x, eyeY, player.z], [lx, ly, lz],
          [mob.x - half, mob.y - 0.05, mob.z - half],
          [mob.x + half, mob.y + mob.height + 0.05, mob.z + half],
        );
        if (t !== null && t < reach && t < bestT) {
          bestT = t;
          best = mob;
        }
      }

      if (!best) return false;
      best.damage(damage, player);
      return true;
    }

    /** Nearest mob to the player within `radius`, or null. */
    nearest(player, radius = 1.6) {
      let best = null;
      let bestD2 = radius * radius;
      for (const mob of this.mobs) {
        if (mob.dead) continue;
        const d2 = (mob.x - player.x) ** 2 + (mob.z - player.z) ** 2 + (mob.y - player.y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = mob;
        }
      }
      return best;
    }
  }

  /** Slab method ray/AABB intersection; returns the entry distance or null. */
  function rayBox(origin, dir, min, max) {
    let tmin = 0;
    let tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dir[i]) < 1e-8) {
        if (origin[i] < min[i] || origin[i] > max[i]) return null;
      } else {
        const inv = 1 / dir[i];
        let t1 = (min[i] - origin[i]) * inv;
        let t2 = (max[i] - origin[i]) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  /* ------------------------------------------------------------------ *
   * Box geometry for rendering
   * ------------------------------------------------------------------ */

  /**
   * Appends one box to an interleaved (position3, normal3, color3) vertex array.
   * When `rot` is non-zero the box is rotated around the X axis through `pivotY`,
   * which is how the limb swing animation is baked into the geometry.
   *
   * @param {number[]} out     flat vertex list
   * @param {number[]} box     [x, y, z, sx, sy, sz] in model space
   * @param {number[]} color   rgb in 0..1
   * @param {number} [rot]     rotation around X in radians
   * @param {number} [pivotY]  rotation pivot on the Y axis
   */
  function pushBox(out, box, color, rot = 0, pivotY = 0) {
    const [bx, by, bz, sx, sy, sz] = box;
    const x0 = bx, x1 = bx + sx;
    const y0 = by, y1 = by + sy;
    const z0 = bz, z1 = bz + sz;
    const [r, g, b] = color;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const spin = (y, z) => [pivotY + (y - pivotY) * cos - z * sin, pivotY + (y - pivotY) * sin + z * cos];

    const corner = (x, y, z) => {
      if (rot === 0) return [x, y, z];
      const [ny, nz] = spin(y, z);
      return [x, ny, nz];
    };

    const c000 = corner(x0, y0, z0), c100 = corner(x1, y0, z0);
    const c010 = corner(x0, y1, z0), c110 = corner(x1, y1, z0);
    const c001 = corner(x0, y0, z1), c101 = corner(x1, y0, z1);
    const c011 = corner(x0, y1, z1), c111 = corner(x1, y1, z1);

    const quads = [
      { n: [1, 0, 0], v: [c101, c100, c110, c111] },
      { n: [-1, 0, 0], v: [c000, c001, c011, c010] },
      { n: [0, 1, 0], v: [c011, c111, c110, c010] },
      { n: [0, -1, 0], v: [c000, c100, c101, c001] },
      { n: [0, 0, 1], v: [c001, c101, c111, c011] },
      { n: [0, 0, -1], v: [c100, c000, c010, c110] },
    ];

    for (const quad of quads) {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const v = quad.v[i];
        out.push(v[0], v[1], v[2], quad.n[0], quad.n[1], quad.n[2], r, g, b);
      }
    }
    return out.length / 9;
  }

  /**
   * Box parts of a mob in model space: origin at the feet, facing -Z.
   * Each part is [x, y, z, sx, sy, sz, color, rotX, pivotY].
   */
  function mobBoxes(mob) {
    const def = mob.def;
    const w = def.width;
    const h = def.height;
    const parts = [];
    const body = def.color;
    const accent = def.accent;

    if (mob.type === 'zombie') {
      const legH = 0.85;
      const swing = Math.sin(mob.swingPhase) * (mob.moving ? 0.55 : 0.06);
      // Legs swing around the hip (top of the leg).
      parts.push([-w / 2, 0, -0.12, w / 2 - 0.02, legH, 0.24, [0.2, 0.3, 0.55], swing, legH]);
      parts.push([0.02, 0, -0.12, w / 2 - 0.02, legH, 0.24, [0.2, 0.3, 0.55], -swing, legH]);
      // Torso and head.
      parts.push([-w / 2, legH, -0.16, w, 0.62, 0.32, body, 0, 0]);
      parts.push([-0.22, legH + 0.62, -0.22, 0.44, 0.44, 0.44, [0.32, 0.55, 0.38], 0, 0]);
      // Arms held out in front, swinging slightly as it walks.
      const armSwing = Math.sin(mob.swingPhase) * (mob.moving ? 0.3 : 0.03);
      parts.push([-w / 2 - 0.16, legH + 0.55, -0.52, 0.16, 0.16, 0.72, accent, armSwing, legH + 0.55]);
      parts.push([w / 2, legH + 0.55, -0.52, 0.16, 0.16, 0.72, accent, -armSwing, legH + 0.55]);
      return parts;
    }

    if (mob.type === 'sheep' || mob.type === 'cow') {
      const legH = 0.55;
      const bodyH = h - legH;
      const swing = Math.sin(mob.swingPhase) * (mob.moving ? 0.5 : 0.04);
      const legColor = mob.type === 'sheep' ? [0.75, 0.72, 0.68] : [0.3, 0.24, 0.2];
      const legs = [
        [-w / 2 + 0.02, -0.32, swing], [w / 2 - 0.17, -0.32, -swing],
        [-w / 2 + 0.02, 0.22, -swing], [w / 2 - 0.17, 0.22, swing],
      ];
      for (const [ox, oz, phase] of legs) {
        parts.push([ox, 0, oz, 0.15, legH, 0.15, legColor, phase, legH]);
      }
      parts.push([-w / 2, legH, -0.45, w, bodyH, 0.95, body, 0, 0]);
      const headColor = mob.type === 'sheep' ? [0.85, 0.82, 0.78] : [0.28, 0.2, 0.15];
      parts.push([-0.2, legH + bodyH * 0.3, -0.82, 0.4, 0.42, 0.36, headColor, 0, 0]);
      return parts;
    }

    // Pig: the default quadruped.
    const legH = 0.32;
    const bodyH = h - legH;
    const swing = Math.sin(mob.swingPhase) * (mob.moving ? 0.55 : 0.04);
    const legs = [
      [-w / 2 + 0.03, -0.3, swing], [w / 2 - 0.17, -0.3, -swing],
      [-w / 2 + 0.03, 0.2, -swing], [w / 2 - 0.17, 0.2, swing],
    ];
    for (const [ox, oz, phase] of legs) {
      parts.push([ox, 0, oz, 0.14, legH, 0.14, accent, phase, legH]);
    }
    parts.push([-w / 2, legH, -0.42, w, bodyH, 0.84, body, 0, 0]);
    parts.push([-0.18, legH + bodyH * 0.25, -0.7, 0.36, 0.34, 0.3, body, 0, 0]);
    // Snout.
    parts.push([-0.09, legH + bodyH * 0.38, -0.76, 0.18, 0.13, 0.08, [0.95, 0.68, 0.72], 0, 0]);
    return parts;
  }

  /**
   * Builds every mob's geometry once and returns the vertex data plus one
   * transform record per box: [x, y, z, yaw, sx, sy, sz, firstVertex, vertexCount].
   *
   * @param {Entity[]} mobs
   */
  function buildMobGeometry(mobs) {
    const verts = [];
    const boxes = [];

    for (const mob of mobs) {
      if (mob.dead && mob.removeTimer <= 0) continue;
      // Death animation: the model sinks and flattens.
      let scaleY = 1;
      let sink = 0;
      if (mob.dead) {
        const t = 1 - Math.max(0, mob.removeTimer / 0.9);
        scaleY = Math.max(0.05, 1 - t);
        sink = 0;
      }

      for (const part of mobBoxes(mob)) {
        const [px, py, pz, sx, sy, sz, color, rot, pivotY] = part;
        const first = verts.length / 9;
        pushBox(verts, [px, py, pz, sx, sy, sz], color, rot ?? 0, pivotY ?? 0);
        const count = verts.length / 9 - first;
        boxes.push(mob.x, mob.y + sink, mob.z, mob.yaw, 1, scaleY, 1, first, count, 1);
      }

      if (mob.hurtTime > 0) {
        // Damage flash: a slightly inflated translucent red shell of the model.
        const alpha = Math.min(0.75, mob.hurtTime * 1.8);
        for (const part of mobBoxes(mob)) {
          const [px, py, pz, sx, sy, sz] = part;
          const first = verts.length / 9;
          pushBox(verts, [px - 0.02, py - 0.02, pz - 0.02, sx + 0.04, sy + 0.04, sz + 0.04], [1, 0.25, 0.25]);
          boxes.push(mob.x, mob.y, mob.z, mob.yaw, 1, 1, 1, first, verts.length / 9 - first, alpha);
        }
      }
    }

    return { vertices: new Float32Array(verts), count: verts.length / 9, boxes };
  }

  G["Entity"] = Entity;
  G["ItemEntity"] = ItemEntity;
  G["EntityManager"] = EntityManager;
  G["pushBox"] = pushBox;
  G["mobBoxes"] = mobBoxes;
  G["buildMobGeometry"] = buildMobGeometry;
  G["MOB_TYPES"] = MOB_TYPES;
})(__mc);

/* ---- src/game/player.js -------------------------------------------------- */
(function (G) {
  /**
   * The player: AABB physics against the voxel world, movement modes, and the
   * survival stats (health, hunger, air, fall damage).
   *
   * Coordinates: `x/y/z` is the feet position. `yaw` is rotation around +Y
   * (0 looks toward -Z, increasing yaw turns left), `pitch` is positive upward.
   */




  const PLAYER = {
    width: 0.6,
    height: 1.8,
    sneakHeight: 1.5,
    eyeHeight: 1.62,
    eyeHeightSneak: 1.32,
    /**
     * Upward velocity applied on jump.
     *
     * With semi-implicit Euler at 20 ticks per second the apex is
     * `v^2 / (2 * g) + v * tick / 2`, so this value gives the classic
     * 1.25-block jump. Keeping the formula in the comment means the number can be
     * re-derived if gravity or the tick rate ever changes.
     */
    jumpVelocity: 9.72,
    gravity: 32,
    terminalVelocity: 78,
    walkSpeed: 4.317,
    sprintSpeed: 5.612,
    sneakSpeed: 1.295,
    swimSpeed: 2.6,
    flySpeed: 10.9,
    flySprintSpeed: 21.8,
    swimGravity: 4.5,
    maxHealth: 20,
    maxHunger: 20,
  };

  /** How far the physics step may move before it is split into sub-steps. */
  const MAX_STEP = 0.4;

  class Player {
    constructor(spawn = { x: 0.5, y: 80, z: 0.5 }) {
      this.x = spawn.x;
      this.y = spawn.y;
      this.z = spawn.z;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.yaw = 0;
      this.pitch = 0;
      this.onGround = false;
      this.inWater = false;
      this.headInWater = false;
      this.inLava = false;
      this.sneaking = false;
      /** True while the player is sprinting; named to avoid shadowing PLAYER.sprintSpeed. */
      this.isSprinting = false;
      this.flying = false;
      this.gameMode = 'survival';   // 'survival' | 'creative'
      this.height = PLAYER.height;
      this.eyeHeight = PLAYER.eyeHeight;
      this.fallDistance = 0;
      this.health = PLAYER.maxHealth;
      this.hunger = PLAYER.maxHunger;
      this.saturation = 5;
      this.air = 300;                 // ticks of breath, 300 = full
      this.hurtTime = 0;
      this.deathTime = 0;
      this.dead = false;
      this.spawnPoint = { ...spawn };
      this.walkDistance = 0;          // drives footstep sounds
      this.stepTimer = 0;
      this.exhaustion = 0;
      this.regenTimer = 0;
      this.lastDamageCause = '';
    }

    get eyeY() {
      return this.y + (this.sneaking ? PLAYER.eyeHeightSneak : this.eyeHeight);
    }

    /** Unit forward vector from yaw/pitch. */
    lookVector() {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      return [-sy * cp, sp, -cy * cp];
    }

    /** Horizontal forward vector (used for movement). */
    forwardVector() {
      return [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    }

    rightVector() {
      return [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    }

    setGameMode(mode) {
      this.gameMode = mode;
      if (mode === 'creative') {
        this.health = PLAYER.maxHealth;
        this.hunger = PLAYER.maxHunger;
        this.air = 300;
        this.dead = false;
      } else {
        this.flying = false;
      }
    }

    heal(amount) {
      this.health = G["clamp"](this.health + amount, 0, PLAYER.maxHealth);
    }

    damage(amount, cause = 'generic') {
      if (this.gameMode === 'creative' || this.dead) return;
      if (this.hurtTime > 0.35) return;
      this.health = Math.max(0, this.health - amount);
      this.hurtTime = 0.6;
      this.lastDamageCause = cause;
      if (this.health <= 0) {
        this.dead = true;
        this.deathTime = 0;
      }
    }

    respawn() {
      this.x = this.spawnPoint.x;
      this.y = this.spawnPoint.y;
      this.z = this.spawnPoint.z;
      this.vx = this.vy = this.vz = 0;
      this.health = PLAYER.maxHealth;
      this.hunger = PLAYER.maxHunger;
      this.air = 300;
      this.fallDistance = 0;
      this.dead = false;
      this.hurtTime = 0;
    }

    /* ---------------- collision ---------------- */

    aabb() {
      const half = PLAYER.width / 2;
      return [this.x - half, this.y, this.z - half, this.x + half, this.y + this.height, this.z + half];
    }

    /** True when the player's box overlaps any solid block. */
    collides(world, x, y, z, height = this.height) {
      const half = PLAYER.width / 2 - 0.001;
      const minX = Math.floor(x - half), maxX = Math.ceil(x + half) - 1;
      const minY = Math.floor(y + 0.001), maxY = Math.ceil(y + height - 0.001) - 1;
      const minZ = Math.floor(z - half), maxZ = Math.ceil(z + half) - 1;
      for (let by = minY; by <= maxY; by++) {
        if (by < 0 || by >= G["WORLD_HEIGHT"]) continue;
        for (let bz = minZ; bz <= maxZ; bz++) {
          for (let bx = minX; bx <= maxX; bx++) {
            const id = world.getBlock(bx, by, bz);
            if (!G["isSolid"](id)) continue;
            const blockHeight = G["BLOCKS"][id]?.height ?? 1;
            if (by + blockHeight > y + 0.001) return true;
          }
        }
      }
      return false;
    }

    /** Moves along one axis, stopping at the first collision and zeroing that axis. */
    moveAxis(world, axis, amount) {
      if (amount === 0) return false;
      const steps = Math.ceil(Math.abs(amount) / MAX_STEP);
      const stepAmount = amount / steps;
      for (let i = 0; i < steps; i++) {
        const nx = axis === 0 ? this.x + stepAmount : this.x;
        const ny = axis === 1 ? this.y + stepAmount : this.y;
        const nz = axis === 2 ? this.z + stepAmount : this.z;
        if (this.collides(world, nx, ny, nz)) {
          if (axis === 0) this.vx = 0;
          else if (axis === 1) this.vy = 0;
          else this.vz = 0;
          return true;
        }
        this.x = nx; this.y = ny; this.z = nz;
      }
      return false;
    }

    /* ---------------- per-frame update ---------------- */

    /**
     * @param {object} world  the World instance
     * @param {object} intent {forward, backward, left, right, jump, sneak, sprint}
     * @param {number} dt     seconds
     * @param {object} hooks  {onStep, onLand, onHurt, onDeath, onSwim}
     */
    update(world, intent, dt, hooks = {}) {
      if (this.dead) {
        this.deathTime += dt;
        this.vx = this.vy = this.vz = 0;
        return;
      }
      this.hurtTime = Math.max(0, this.hurtTime - dt);

      this.sneaking = !!intent.sneak && !this.flying;
      const targetHeight = this.sneaking ? PLAYER.sneakHeight : PLAYER.height;
      if (targetHeight !== this.height) {
        // Only stand up when there is room above.
        if (targetHeight > this.height && this.collides(world, this.x, this.y, this.z, targetHeight)) {
          this.sneaking = true;
        } else {
          this.height = targetHeight;
        }
      }

      // Sample the fluid state at the feet and at the head.
      const feet = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z));
      const head = world.getBlock(Math.floor(this.x), Math.floor(this.eyeY), Math.floor(this.z));
      this.inWater = G["isLiquid"](feet) && feet === G["BLOCK"].WATER;
      this.headInWater = G["isLiquid"](head) && head === G["BLOCK"].WATER;
      this.inLava = feet === G["BLOCK"].LAVA || head === G["BLOCK"].LAVA;

      // --- desired horizontal direction
      let fx = 0, fz = 0;
      const forward = this.forwardVector();
      const right = this.rightVector();
      const forwardInput = Number(!!intent.forward) - Number(!!intent.backward) + (intent.moveY ?? 0);
      const rightInput = Number(!!intent.right) - Number(!!intent.left) + (intent.moveX ?? 0);
      const inputStrength = Math.min(1, Math.hypot(forwardInput, rightInput));
      if (forwardInput) { fx += forward[0] * forwardInput; fz += forward[2] * forwardInput; }
      if (rightInput) { fx += right[0] * rightInput; fz += right[2] * rightInput; }
      const len = Math.hypot(fx, fz);
      if (len > 0.0001) { fx = (fx / len) * inputStrength; fz = (fz / len) * inputStrength; }

      this.isSprinting = !!intent.sprint && inputStrength > 0.0001 && this.hunger > 6 && !this.sneaking;

      let speed;
      if (this.flying) speed = this.isSprinting ? PLAYER.flySprintSpeed : PLAYER.flySpeed;
      else if (this.inWater) speed = PLAYER.swimSpeed * (this.isSprinting ? 1.35 : 1);
      else if (this.sneaking) speed = PLAYER.sneakSpeed;
      else speed = this.isSprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      // --- vertical
      if (this.flying) {
        let vy = 0;
        if (intent.jump) vy += speed;
        if (intent.sneak || intent.descend) vy -= speed;
        this.vy = vy;
        this.fallDistance = 0;
      } else if (this.inWater) {
        if (intent.jump) this.vy = 3.1;
        else this.vy -= PLAYER.swimGravity * dt;
        this.vy = G["clamp"](this.vy, -3.5, 3.5);
        this.fallDistance = 0;
      } else if (this.inLava) {
        this.vy -= PLAYER.gravity * 0.35 * dt;
        if (intent.jump) this.vy = 1.6;
        this.vy = G["clamp"](this.vy, -6, 3);
        this.fallDistance = 0;
      } else {
        if (intent.jump && this.onGround) {
          this.vy = PLAYER.jumpVelocity;
          this.onGround = false;
          // Sprint jumping gets a small speed boost, like the original.
          if (this.isSprinting) { this.vx += fx * 1.6; this.vz += fz * 1.6; }
        }
        this.vy -= PLAYER.gravity * dt;
        if (this.vy < -PLAYER.terminalVelocity) this.vy = -PLAYER.terminalVelocity;
      }

      // --- horizontal movement
      // Approach the intended speed directly and ease toward it, rather than
      // accumulating small impulses: that makes the top speed exact and keeps
      // stopping responsive. `response` is how fast the velocity converges.
      const response = this.flying ? 9 : this.onGround ? 16 : (this.inWater ? 5 : 4.5);
      const blend = 1 - Math.exp(-response * dt);
      this.vx += (fx * speed - this.vx) * blend;
      this.vz += (fz * speed - this.vz) * blend;

      // Extra easing so a released key stops the player instead of gliding.
      if (fx === 0 && fz === 0) {
        const stopBlend = 1 - Math.exp(-(this.onGround ? 18 : 2.2) * dt);
        this.vx -= this.vx * stopBlend;
        this.vz -= this.vz * stopBlend;
      }

      // A hard cap: the easing above can never overshoot, but collisions and
      // jumping add impulses, so G["clamp"] defensively.
      const maxHorizontal = speed * 1.6;
      const horizontal = Math.hypot(this.vx, this.vz);
      if (horizontal > maxHorizontal) {
        const scale = maxHorizontal / horizontal;
        this.vx *= scale;
        this.vz *= scale;
      }

      // --- integrate with collision
      const beforeY = this.y;
      const wasOnGround = this.onGround;
      this.moveAxis(world, 0, this.vx * dt);
      const hitVertical = this.moveAxis(world, 1, this.vy * dt);
      this.moveAxis(world, 2, this.vz * dt);

      // Sneaking stops the player from walking off ledges.
      if (this.sneaking && wasOnGround && this.onGround) {
        const half = PLAYER.width / 2 + 0.05;
        const probeY = this.y - 0.1;
        const solidUnder = (px, pz) => G["isSolid"](world.getBlock(Math.floor(px), Math.floor(probeY), Math.floor(pz)));
        const movingX = Math.abs(this.vx) > 1e-4;
        const movingZ = Math.abs(this.vz) > 1e-4;
        const wouldFall = (movingX && !solidUnder(this.x + Math.sign(this.vx) * half, this.z))
          || (movingZ && !solidUnder(this.x, this.z + Math.sign(this.vz) * half));
        if (wouldFall) {
          this.x -= this.vx * dt;
          this.z -= this.vz * dt;
          this.vx = 0;
          this.vz = 0;
        }
      }

      // --- ground detection
      // The probe has to be wide enough to catch a resting player: a zero-velocity
      // body stops a few millimetres above the floor, and a probe thinner than
      // that gap never reports "on ground", which breaks jumping and walking.
      const wasFalling = this.vy <= 0;
      this.onGround = this.collides(world, this.x, this.y - 0.08, this.z, 0.12)
        || this.collides(world, this.x, this.y - 0.02, this.z, 0.04);

      // Snap onto the floor instead of hovering above it. Without this the player
      // rests a fraction of a block high, which shortens every jump and makes the
      // eye height drift.
      if (this.onGround && wasFalling) {
        const half = PLAYER.width / 2;
        let landed = false;
        for (let step = 0; step < 8 && !landed; step++) {
          const next = this.y - 1 / 32;
          const by = Math.floor(next);
          const probe = world.getBlock(Math.floor(this.x), by, Math.floor(this.z));
          if (G["isSolid"](probe)) {
            // Rest exactly on the surface of the block that stopped the fall.
            const surface = by + (G["BLOCKS"][probe]?.height ?? 1);
            if (surface <= this.y) this.y = surface;
            landed = true;
          } else if (!this.collides(world, this.x, next, this.z)) {
            this.y = next;
          } else {
            landed = true;
          }
        }
        // The x/z edges of the box may rest on a different block than its centre.
        if (!landed) this.y = Math.max(0, Math.round(this.y * 32) / 32);
      }

      // --- fall damage
      if (!this.flying && !this.inWater) {
        if (this.vy < 0 && !this.onGround) {
          this.fallDistance += beforeY - this.y;
        }
        if (hitVertical && this.vy === 0 && this.fallDistance > 0) {
          if (this.onGround) {
            const blocks = Math.floor(this.fallDistance - 3);
            if (blocks > 0) {
              this.damage(blocks, 'fall');
              hooks.onHurt?.('fall');
            }
            this.fallDistance = 0;
          }
        }
        if (this.onGround) this.fallDistance = 0;
      }

      // --- footsteps
      const moved = Math.hypot(this.x - (this._lastX ?? this.x), this.z - (this._lastZ ?? this.z));
      this.walkDistance += moved;
      this._lastX = this.x;
      this._lastZ = this.z;
      const stepLength = this.isSprinting ? 1.6 : 2.1;
      if (this.onGround && this.walkDistance > stepLength) {
        this.walkDistance = 0;
        hooks.onStep?.(world, Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
      }
      if (this.inWater && Math.hypot(this.vx, this.vz) > 2.5) hooks.onSwim?.();

      // --- survival stats
      this.updateSurvival(world, dt, intent, hooks);
    }

    updateSurvival(world, dt, intent, hooks) {
      if (this.gameMode === 'creative') {
        this.air = 300;
        return;
      }

      // Hunger drain from movement and jumping.
      const speed2 = this.vx * this.vx + this.vz * this.vz;
      if (this.onGround && speed2 > 0.02) {
        this.exhaustion += (this.isSprinting ? 0.1 : 0.01) * dt * 20;
      }
      if (intent.jump && this.onGround) this.exhaustion += 0.05;
      if (this.exhaustion >= 4) {
        this.exhaustion -= 4;
        if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
        else this.hunger = Math.max(0, this.hunger - 1);
      }

      // Regeneration when well fed, starvation when empty.
      this.regenTimer += dt;
      if (this.regenTimer > 4) {
        this.regenTimer = 0;
        if (this.hunger >= 18 && this.health < PLAYER.maxHealth) {
          this.heal(1);
          this.exhaustion += 3;
        } else if (this.hunger === 0) {
          this.damage(1, 'starve');
        }
      }

      // Breath.
      if (this.headInWater) {
        this.air -= dt * 20;
        if (this.air <= 0) {
          this.air = 0;
          if (Math.floor(this.hurtTime * 20) === 0) this.damage(2, 'drown');
        }
      } else {
        this.air = Math.min(300, this.air + dt * 80);
      }

      if (this.inLava) {
        this.damage(4 * dt * 2, 'lava');
        hooks.onHurt?.('lava');
      }

      // Cactus hurts anything brushing against it, at most twice per second.
      this.cactusTimer = (this.cactusTimer ?? 0) + dt;
      if (this.cactusTimer >= 0.5) {
        this.cactusTimer = 0;
        const half = PLAYER.width / 2;
        const x0 = Math.floor(this.x - half - 0.05), x1 = Math.floor(this.x + half + 0.05);
        const y0 = Math.floor(this.y), y1 = Math.floor(this.y + this.height - 0.1);
        const z0 = Math.floor(this.z - half - 0.05), z1 = Math.floor(this.z + half + 0.05);
        outer:
        for (let by = y0; by <= y1; by++) {
          for (let bz = z0; bz <= z1; bz++) {
            for (let bx = x0; bx <= x1; bx++) {
              if (world.getBlock(bx, by, bz) === G["BLOCK"].CACTUS) {
                this.damage(1, 'cactus');
                break outer;
              }
            }
          }
        }
      }
    }
  }

  G["Player"] = Player;
  G["PLAYER"] = PLAYER;
})(__mc);

/* ---- src/game/interaction.js --------------------------------------------- */
(function (G) {
  /**
   * Block interaction: mining with per-block hardness, placing blocks with
   * collision checks, tool/block sounds, and item pickup into the inventory.
   */


  /** Blocks a placement may overwrite (air, water, plants, torches). */
  function isReplaceable(id) {
    const def = G["BLOCKS"][id];
    if (!def) return true;
    if (id === G["BLOCK"].AIR) return true;
    return !def.solid && !def.liquid;
  }

  class Interaction {
    /**
     * @param {object} ctx
     * @param {import('../world/world.js').World} ctx.world
     * @param {import('./player.js').Player} ctx.player
     * @param {import('./inventory.js').Inventory} ctx.inventory
     * @param {import('./mobs.js').EntityManager} ctx.mobs
     * @param {(name:string, opts?:object)=>void} ctx.playSound
     */
    constructor({ world, player, inventory, mobs, playSound }) {
      this.world = world;
      this.player = player;
      this.inventory = inventory;
      this.mobs = mobs;
      this.playSound = playSound || (() => {});

      this.reach = 6.0;
      this.target = null;         // raycast hit
      this.breakProgress = 0;
      this.breakKey = null;
      this.breakCooldown = 0;
      this.placeCooldown = 0;
      this.swingTime = 0;
      this.lastBreakSound = 0;
    }

    /** Re-runs the look raycast; call once per frame before update(). */
    updateTarget() {
      const origin = [this.player.x, this.player.eyeY, this.player.z];
      const dir = this.player.lookVector();
      const hit = this.world.raycast(origin, dir, this.reach, (id) => !G["isLiquid"](id));
      this.target = hit;
      return hit;
    }

    /**
     * Applies the player's intent for this frame.
     * @param {object} intent {mine:boolean, place:boolean, attack:boolean}
     * @param {number} dt
     */
    update(intent, dt) {
      this.breakCooldown = Math.max(0, this.breakCooldown - dt);
      this.placeCooldown = Math.max(0, this.placeCooldown - dt);
      this.swingTime = Math.max(0, this.swingTime - dt);
      this.updateTarget();

      if (intent.attack) {
        const hit = this._attack(!intent.placeOnMiss);
        if (hit === false && intent.placeOnMiss) this._place();
        return;
      }
      if (intent.mine) this._mine(dt);
      else this._resetBreak();

      if (intent.place) this._place();
    }

    _resetBreak() {
      this.breakProgress = 0;
      this.breakKey = null;
    }

    _attack(playMissSound = true) {
      if (this.swingTime > 0) return null;
      this.swingTime = 0.28;
      if (this.mobs?.attackFrom(this.player, 3.4, 4)) {
        this.playSound('mob.hurt', { rate: 1.1 });
        return true;
      } else {
        if (playMissSound) this.playSound('click', { volume: 0.15 });
        return false;
      }
    }

    _mine(dt) {
      const target = this.target;
      if (!target) {
        this._resetBreak();
        return;
      }
      const id = target.id;
      const def = G["BLOCKS"][id];
      if (!def) return;
      this.swingTime = Math.max(this.swingTime, 0.05);

      // Creative mode breaks everything instantly (except bedrock).
      if (this.player.gameMode === 'creative') {
        if (!def.unbreakable) {
          this._breakBlock(target);
          this.breakCooldown = 0.2;
        }
        return;
      }

      if (def.unbreakable) {
        this.playSound('click', { volume: 0.1 });
        return;
      }

      const key = `${target.x},${target.y},${target.z}`;
      if (this.breakKey !== key) {
        this.breakKey = key;
        this.breakProgress = 0;
      }

      // Hardness 0 (plants, torches) breaks on the first hit.
      const required = Math.max(0.02, def.hardness * 1.5);
      const inWater = this.player.headInWater;
      const speed = inWater ? 0.25 : 1;
      this.breakProgress += (dt * speed) / required;

      if (this.breakProgress > 0 && this.lastBreakSound <= 0) {
        this.playSound(`dig.${G["soundGroup"](id)}`, { rate: 0.9 + Math.random() * 0.25, volume: 0.5 });
        this.lastBreakSound = 0.22;
      }
      this.lastBreakSound -= dt;

      if (this.breakProgress >= 1) {
        this._breakBlock(target);
        this.breakProgress = 0;
        this.breakKey = null;
        this.breakCooldown = 0.12;
      }
    }

    _breakBlock(target) {
      const id = this.world.getBlock(target.x, target.y, target.z);
      if (id === 0) return;
      const def = G["BLOCKS"][id];
      if (!def || def.unbreakable) return;

      this.world.setBlock(target.x, target.y, target.z, G["BLOCK"].AIR, { record: true });
      this.world.markLightDirty(target.x, target.y, target.z);
      this.playSound(`dig.${G["soundGroup"](id)}`, { rate: 1.0, volume: 0.8 });

      // Drop the block as an item entity unless in creative mode.
      if (this.player.gameMode !== 'creative' && this.mobs?.spawnItem) {
        const dropId = def.drop === undefined ? id : def.drop;
        if (dropId !== null && this.mobs.spawnItem(dropId, target.x + 0.5, target.y + 0.35, target.z + 0.5, 1)) {
          // spawned
        }
      }
    }

    _place() {
      const target = this.target;
      const stack = this.inventory.held;
      if (!stack || !target) return;
      if (this.placeCooldown > 0) return;

      const def = G["BLOCKS"][stack.id];
      if (!def) return;

      // Water is not placeable from the hotbar, matching the original.
      if (stack.id === G["BLOCK"].WATER || stack.id === G["BLOCK"].LAVA) return;

      // If the targeted block is replaceable, fill it; otherwise place against
      // the face the player is looking at.
      let px = target.x, py = target.y, pz = target.z;
      const targetId = this.world.getBlock(px, py, pz);
      if (!isReplaceable(targetId)) {
        px += target.normal[0];
        py += target.normal[1];
        pz += target.normal[2];
      }

      const existing = this.world.getBlock(px, py, pz);
      if (!isReplaceable(existing)) return;
      // Never place a solid block inside the player.
      if (def.solid && this._overlapsPlayer(px, py, pz)) return;

      if (!this.world.setBlock(px, py, pz, stack.id, { record: true })) return;
      this.world.markLightDirty(px, py, pz);
      this.playSound('place', { rate: 0.95 + Math.random() * 0.15 });

      if (this.player.gameMode !== 'creative') this.inventory.consumeHeld();
      this.placeCooldown = 0.18;
      this.swingTime = 0.25;
    }

    /** True when a full block at (x, y, z) would intersect the player's box. */
    _overlapsPlayer(x, y, z) {
      const half = 0.3;
      const p = this.player;
      const overlapX = p.x + half > x && p.x - half < x + 1;
      const overlapZ = p.z + half > z && p.z - half < z + 1;
      const overlapY = p.y + p.height > y && p.y < y + 1;
      return overlapX && overlapY && overlapZ;
    }

    /** Called by the game when a dropped item is picked up. */
    giveItem(blockId, count) {
      return this.inventory.add(blockId, count);
    }
  }

  G["Interaction"] = Interaction;
})(__mc);

/* ---- src/game/main.js ---------------------------------------------------- */
(function (G) {
  /**
   * 游戏主壳：启动世界、驱动主循环，并把渲染器、玩家、实体、物品栏、
   * 交互与 HUD 连接起来。
   *
   * 循环结构与原版一致（每秒 20 刻）：
   *   每帧 -> 在时间预算内流式生成区块 -> 读取输入 -> 以固定 50 毫秒为一刻
   *   推进物理与 AI -> 渲染 -> HUD。
   */













  /** 一刻的时长。固定步长让物理与帧率无关。 */
  const TICK = 1 / 20;

  /** 没有输入时的意图对象，复用可避免每帧分配。 */
  const IDLE_INTENT = {
    forward: false, backward: false, left: false, right: false,
    jump: false, sneak: false, sprint: false,
  };

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ui = {
        loading: document.getElementById('loading'),
        loadingText: document.getElementById('loading-text'),
        loadingBar: document.getElementById('loading-bar'),
        menu: document.getElementById('menu'),
        menuTitle: document.getElementById('menu-title'),
        menuBody: document.getElementById('menu-body'),
        menuButtons: document.getElementById('menu-buttons'),
        hint: document.getElementById('hint'),
        debug: document.getElementById('debug'),
        toast: document.getElementById('toast'),
        inventory: document.getElementById('inventory-panel'),
        inventoryGrid: document.getElementById('inventory-grid'),
        recipeList: document.getElementById('recipe-list'),
        options: document.getElementById('options-panel'),
        hudScale: document.getElementById('opt-hud-scale'),
        sensitivity: document.getElementById('opt-sensitivity'),
        fov: document.getElementById('opt-fov'),
        volume: document.getElementById('opt-volume'),
        renderDistance: document.getElementById('opt-render-distance'),
        mobileControls: document.getElementById('mobile-controls'),
        joystick: document.getElementById('mobile-joystick'),
        joystickKnob: document.getElementById('mobile-joystick-knob'),
        crosshair: document.getElementById('crosshair'),
      };

      this.clock = { last: performance.now(), accumulator: 0, fps: 0, frames: 0, fpsTimer: 0 };
      this.running = false;
      this.paused = true;
      this.isMobile = window.matchMedia?.('(pointer: coarse) and (hover: none)').matches === true;
      this._touchLookPointer = null;
      this._touchHoldTimer = null;
      this._touchHoldActive = false;
      this._touchDragged = false;
      this._touchPlaceTimer = 0;
      this._joystickPointer = null;
      this._previousPlayerPosition = null;
      this._fullscreenButton = null;
      document.addEventListener('fullscreenchange', () => this._syncFullscreenButton());

      // ?seed=123 可以固定世界种子，便于复现问题与截图。
      const seedParam = new URLSearchParams(location.search).get('seed');
      this.seed = seedParam !== null ? (Number(seedParam) >>> 0) : ((Math.random() * 0xffffffff) >>> 0);

      // 默认渲染距离刻意保守：渲染在主线程上，远景越大帧率越低。
      this.renderDistance = 4;
      this.hudScale = 1;
      this.sensitivity = 0.0022;
      this.fov = 70;
      this.volume = 0.7;
      this.showDebug = false;
      this.toastTimer = 0;
      this.heldNameTimer = 0;
      this.damageFlash = 0;
      this.doubleTapTimer = 0;
      this.doubleTapSprint = false;
      this.deathShown = false;
      this._frameSample = null;

      this.input = new G["Input"](this.canvas, {
        sensitivity: this.sensitivity,
        onKey: (code, event, isUp) => this._onKey(code, event, isUp),
        onLockChange: (locked) => this._onLockChange(locked),
        onWheel: (delta) => {
          if (!this.running || this.paused) return;
          this.inventory.cycleHotbar(delta);
          this._toast(G["stackDisplayName"](this.inventory.held?.id ?? G["BLOCK"].AIR), 1.2);
        },
      });

      this.inventory = G["starterInventory"]();
      document.getElementById('inv-close')?.addEventListener('click', () => this.resume());
      this._bindOptionControls();
      this._setupMobileControls();
    }

    _clearTouchInput() {
      if (!this.input) return;
      this._setJoystickKeys(0, 0);
      this.input.setTouchKey('jump', false);
      this.input.setTouchKey('sneak', false);
      this.input.setTouchButton(0, false);
      this.input.setTouchButton(2, false);
      clearTimeout(this._touchHoldTimer);
      this._touchHoldTimer = null;
      this._touchHoldActive = false;
      this._touchPlaceTimer = 0;
      this.input.setTouchMove(0, 0);
      this.input.touchLook.dx = 0;
      this.input.touchLook.dy = 0;
      this._joystickPointer = null;
      this._touchLookPointer = null;
      if (this.ui.joystickKnob) this.ui.joystickKnob.style.transform = '';
    }

    /* ---------------- 启动 ---------------- */

    async boot() {
      this._setLoading('正在生成贴图…', 0.05);
      await nextFrame();

      const iconIds = [...new Set([...G["CREATIVE_BLOCKS"], ...this.inventory.slots.filter(Boolean).map((s) => s.id)])];
      this.renderer = new G["Renderer"](this.canvas, { iconBlockIds: iconIds });

      this._setLoading('正在准备世界…', 0.2);
      await nextFrame();

      this.world = new G["World"]({
        seed: this.seed,
        renderDistance: this.renderDistance,
        onMesh: (cx, cz, section, mesh) => this.renderer.setSectionMesh(cx, cz, section, mesh),
      });

      this.player = new G["Player"]({ x: 0.5, y: G["SEA_LEVEL"] + 20, z: 0.5 });
      this.mobs = new G["EntityManager"](this.world, { maxMobs: 16 });
      this.interaction = new G["Interaction"]({
        world: this.world,
        player: this.player,
        inventory: this.inventory,
        mobs: this.mobs,
        playSound: (name, opts) => G["playSfx"](name, opts),
      });
      this.hud = new G["Hud"](this.renderer, { iconUv: this.renderer.iconAtlas.uvs });

      this.ui.hint.addEventListener('click', () => {
        if (!this.paused) { G["resumeAudio"](); G["initAudio"](); this.input.requestLock(); }
      });
      this._restoreSave();
      this._applyOptions();
      this._resize();
      window.addEventListener('resize', () => this._resize());

      await this._waitForWorld();
      await this._settlePlayer();
      this.ui.loading.classList.add('hidden');
      this.showMenu('title');
      this.running = true;
      this._loop();
    }

    /** 在出生点附近流式生成区块，直到脚下确实有地面。 */
    async _waitForWorld() {
      const start = performance.now();
      for (;;) {
        this.world.update(this.player.x, this.player.z, 8);
        const elapsed = (performance.now() - start) / 1000;
        const chunk = this.world.getChunk(0, 0);
        const neighboursReady = [[-1, 0], [1, 0], [0, -1], [0, 1]]
          .every(([dx, dz]) => this.world.getChunk(dx, dz)?.state === 'ready');
        if (chunk?.state === 'ready' && neighboursReady) {
          const spawn = this.world.findSpawn(0, 0);
          this.player.x = spawn.x;
          this.player.y = spawn.y + 1;
          this.player.z = spawn.z;
          break;
        }
        this._setLoading(
          `正在生成地形… ${this.world.chunks.size} 个区块`,
          Math.min(0.75, 0.2 + elapsed * 0.25),
        );
        if (elapsed > 30) {
          console.warn('[game] 地形生成超时，改为在海面上方出生');
          break;
        }
        await nextFrame();
      }
    }

    /**
     * 让玩家落到地面上，并等到附近区块真正完成网格化。
     *
     * 只判断“网格队列为空”是不够的：新区块生成会让队列重新填满，所以这里按
     * 实际覆盖率等待，否则第一帧会看到千疮百孔的世界。
     */
    async _settlePlayer() {
      const fallDeadline = performance.now() + 6000;
      while (performance.now() < fallDeadline) {
        this.world.update(this.player.x, this.player.z, 10);
        // 用固定步长模拟下落，落地结果与帧率无关。
        for (let i = 0; i < 3; i++) this.player.update(this.world, IDLE_INTENT, TICK);
        if (this.player.onGround) break;
        await nextFrame();
      }

      const meshDeadline = performance.now() + 20000;
      let quietFrames = 0;
      while (performance.now() < meshDeadline) {
        this.world.update(this.player.x, this.player.z, 12);
        this._setLoading(
          `正在生成地形… 已就绪 ${this._loadedChunkCount()} 个区块`,
          Math.min(0.99, 0.75 + this._loadedChunkCount() / 200),
        );
        if (this.world.meshQueue.length === 0 && this.world.genQueue.length === 0) {
          quietFrames++;
          if (quietFrames > 30) break;
        } else {
          quietFrames = 0;
        }
        await nextFrame();
      }
      this.player.spawnPoint = { x: this.player.x, y: this.player.y, z: this.player.z };
    }

    /** 已经生成、并且至少有一个区块段完成网格化的区块数量。 */
    _loadedChunkCount() {
      let count = 0;
      for (const chunk of this.world.chunks.values()) {
        if (chunk.state === 'ready' && chunk.meshes.size > 0) count++;
      }
      return count;
    }

    _setLoading(text, progress) {
      this.ui.loadingText.textContent = text;
      this.ui.loadingBar.style.width = `${Math.round(progress * 100)}%`;
    }

    /* ---------------- 菜单 ---------------- */

    showMenu(kind) {
      const ui = this.ui;
      this.paused = true;
      this._clearTouchInput();
      this.input.exitLock();
      ui.menu.classList.remove('hidden');
      ui.menuButtons.innerHTML = '';
      ui.menuBody.innerHTML = '';
      ui.inventory.classList.add('hidden');
      ui.options.classList.add('hidden');
      this._updateMobileControls();

      if (kind === 'title') {
        ui.menuTitle.textContent = '我的世界 · 网页版';
        ui.menuBody.innerHTML = `
          <p>用 WebGL2 从零写的体素沙盒（手机端需要自己将手机横屏）</p>
          <p class="dim">世界种子：${this.seed}</p>`;
        this._addButton('开始游戏', () => this.resume());
        this._addButton('读取存档', () => {
          if (this._restoreSave()) this.resume();
          else this._toast('没有找到存档', 2);
        });
        this._addButton('操作说明', () => this.showMenu('controls'));
        this._addButton('选项', () => this.showMenu('options'));
        this._addButton('新的世界', () => this.newWorld());
      } else if (kind === 'pause') {
        ui.menuTitle.textContent = '游戏菜单';
        this._addButton('返回游戏', () => this.resume());
        this._addButton('物品栏', () => this.openInventory());
        this._addButton('选项', () => this.showMenu('options'));
        this._addButton('保存世界', () => {
          if (this.saveWorld()) this._toast('世界已保存', 1.5);
          else this._toast('保存失败', 2);
        });
        this._addButton('操作说明', () => this.showMenu('controls'));
        this._addButton('新的世界', () => this.newWorld());
      } else if (kind === 'controls') {
        ui.menuTitle.textContent = '操作说明';
        ui.menuBody.innerHTML = `
          <ul class="controls">
            <li><b>W A S D</b><span>前后左右移动</span></li>
            <li><b>手机触控</b><span>左侧摇杆移动，拖动屏幕转向</span></li>
            <li><b>点击 / 长按画面</b><span>点击放置方块，长按挖掘或攻击</span></li>
            <li><b>手机按钮</b><span>跳跃、潜行、物品栏、暂停</span></li>
            <li><b>点击快捷栏</b><span>手机上点击底部物品切换</span></li>
            <li><b>空格</b><span>跳跃 / 上浮 / 上升</span></li>
            <li><b>Shift</b><span>潜行 / 下降</span></li>
            <li><b>Ctrl 或双击 W</b><span>疾跑</span></li>
            <li><b>移动鼠标</b><span>转动视角</span></li>
            <li><b>鼠标左键</b><span>挖掘方块 / 攻击生物</span></li>
            <li><b>鼠标右键</b><span>放置方块</span></li>
            <li><b>鼠标中键</b><span>复制准星所指的方块</span></li>
            <li><b>1 - 9 / 滚轮</b><span>切换快捷栏</span></li>
            <li><b>E</b><span>打开物品栏与合成</span></li>
            <li><b>F</b><span>切换创造模式飞行</span></li>
            <li><b>G</b><span>切换生存 / 创造模式</span></li>
            <li><b>R</b><span>创造模式下回到地面</span></li>
            <li><b>F3</b><span>显示调试信息</span></li>
            <li><b>Esc</b><span>暂停菜单</span></li>
          </ul>`;
        this._addButton('返回', () => this.showMenu('pause'));
      } else if (kind === 'options') {
        ui.menuTitle.textContent = '选项';
        // 选项就嵌在本面板内，直接显示即可，它不再是独立浮层。
        ui.options.classList.remove('hidden');
        this._syncOptionControls();
        this._addButton('完成', () => this.showMenu(this.player.dead ? 'death' : 'pause'));
      } else if (kind === 'death') {
        ui.menuTitle.textContent = '你死了！';
        ui.menuBody.innerHTML = `<p>死因：${this.deathCause()}</p>`;
        this._addButton('重生', () => this.respawn());
        this._addButton('新的世界', () => this.newWorld());
      }
      this._fullscreenButton = this._addButton(
        this._fullscreenLabel(),
        () => this._toggleFullscreen(),
      );
      this._fullscreenButton.dataset.action = 'fullscreen';
      this._updateHint();
    }

    /** 把记录下来的死因翻译成中文。 */
    deathCause() {
      const causes = {
        fall: '摔落伤害',
        drown: '溺水',
        lava: '被岩浆烧死',
        starve: '饿死',
        cactus: '被仙人掌扎死',
        zombie: '被僵尸杀死',
      };
      return causes[this.player.lastDamageCause] ?? '未知原因';
    }

    _addButton(label, onClick) {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => {
        G["resumeAudio"]();
        G["initAudio"]();
        onClick();
      });
      this.ui.menuButtons.appendChild(button);
      return button;
    }

    _fullscreenLabel() {
      return document.fullscreenElement ? '退出全屏' : '全屏';
    }

    _syncFullscreenButton() {
      if (this._fullscreenButton) this._fullscreenButton.textContent = this._fullscreenLabel();
      if (!document.fullscreenElement) window.screen?.orientation?.unlock?.();
    }

    async _toggleFullscreen() {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch (err) {
          console.warn('[game] 退出全屏失败', err);
          this._toast('退出全屏失败', 2);
        }
        return;
      }

      if (!document.documentElement.requestFullscreen) {
        this._toast('当前浏览器不支持全屏', 2);
        return;
      }

      try {
        await document.documentElement.requestFullscreen();
        if (this.isMobile) await this._lockLandscape();
      } catch (err) {
        console.warn('[game] 进入全屏失败', err);
        this._toast('进入全屏失败，请检查浏览器权限', 2);
      }
    }

    async _lockLandscape() {
      const orientation = window.screen?.orientation;
      if (!orientation?.lock) {
        this._toast('当前浏览器不支持自动横屏，请旋转设备', 3);
        return;
      }
      try {
        await orientation.lock('landscape');
      } catch (err) {
        console.warn('[game] 横屏锁定失败', err);
        this._toast('无法自动横屏，请旋转设备继续游戏', 3);
      }
    }

    resume() {
      this.paused = false;
      this.ui.menu.classList.add('hidden');
      this.ui.inventory.classList.add('hidden');
      this.ui.options.classList.add('hidden');
      if (!this.isMobile) this.input.requestLock();
      else if (!document.fullscreenElement) void this._toggleFullscreen();
      this._updateHint();
      this._updateMobileControls();
    }

    newWorld() {
      try { localStorage.removeItem('mc-web-save'); } catch { /* 存储被禁用 */ }
      location.reload();
    }

    respawn() {
      this.player.respawn();
      this.mobs.mobs.length = 0;
      this.deathShown = false;
      this.resume();
    }

    saveWorld() {
      try {
        localStorage.setItem('mc-web-save', JSON.stringify({
          world: this.world.serialize(),
          inventory: this.inventory.serialize(),
          player: {
            x: this.player.x, y: this.player.y, z: this.player.z,
            yaw: this.player.yaw, pitch: this.player.pitch,
            health: this.player.health, hunger: this.player.hunger,
            mode: this.player.gameMode,
            spawn: this.player.spawnPoint,
          },
        }));
        return true;
      } catch (err) {
        console.error('[game] 保存失败', err);
        return false;
      }
    }

    _restoreSave() {
      let raw;
      try { raw = localStorage.getItem('mc-web-save'); } catch { return false; }
      if (!raw) return false;
      try {
        const save = JSON.parse(raw);
        if (!save?.world) return false;
        this.world.loadSave(save.world);
        if (save.inventory) this.inventory.load(save.inventory);
        if (save.player) {
          this.player.x = save.player.x;
          this.player.y = save.player.y;
          this.player.z = save.player.z;
          this.player.yaw = save.player.yaw ?? 0;
          this.player.pitch = save.player.pitch ?? 0;
          this.player.health = save.player.health ?? G["PLAYER"].maxHealth;
          this.player.hunger = save.player.hunger ?? G["PLAYER"].maxHunger;
          this.player.setGameMode(save.player.mode ?? 'survival');
          if (save.player.spawn) this.player.spawnPoint = save.player.spawn;
        }
        return true;
      } catch (err) {
        console.warn('[game] 存档无法解析', err);
        return false;
      }
    }

    /* ---------------- 物品栏界面 ---------------- */

    openInventory() {
      this.paused = true;
      this._clearTouchInput();
      this.input.exitLock();
      this.ui.menu.classList.add('hidden');
      this.ui.inventory.classList.remove('hidden');
      this._renderInventoryGrid();
      this._renderRecipes();
      this._updateHint();
      this._updateMobileControls();
    }

    _renderInventoryGrid() {
      const grid = this.ui.inventoryGrid;
      grid.innerHTML = '';
      // 创造模式下这里会变成方块选择面板，和原版一样。
      const palette = this.player.gameMode === 'creative' ? G["CREATIVE_BLOCKS"] : null;
      const entries = palette
        ? palette.map((id) => ({ id, palette: true }))
        : this.inventory.slots.map((stack, index) => ({ stack, index }));

      entries.forEach((entry) => {
        const cell = document.createElement('button');
        cell.className = 'inv-slot';
        const id = entry.palette ? entry.id : entry.stack?.id;
        const count = entry.palette ? null : entry.stack?.count;
        if (id !== undefined && id !== null) {
          cell.title = G["stackDisplayName"](id);
          const icon = this.renderer.iconCanvas(id);
          if (icon) cell.appendChild(icon);
          if (count && count > 1) {
            const badge = document.createElement('span');
            badge.className = 'count';
            badge.textContent = String(count);
            cell.appendChild(badge);
          }
        }
        cell.addEventListener('click', () => {
          if (entry.palette) {
            this.inventory.slots[this.inventory.selected] = { id: entry.id, count: 64 };
          } else if (entry.stack) {
            this.inventory.selected = entry.index % G["HOTBAR_SIZE"];
            this.inventory.slots[this.inventory.selected] = entry.stack;
          }
          this._renderInventoryGrid();
        });
        grid.appendChild(cell);
      });
    }

    _renderRecipes() {
      const list = this.ui.recipeList;
      list.innerHTML = '';
      const affordable = G["availableRecipes"](this.inventory);
      for (const recipe of G["RECIPES"]) {
        const button = document.createElement('button');
        button.className = 'recipe';
        if (!affordable.includes(recipe)) button.classList.add('disabled');
        button.innerHTML = `<span>${recipe.out.count} × ${G["stackDisplayName"](recipe.out.id)}</span>`
          + `<small>消耗 ${recipe.cost.count} × ${G["stackDisplayName"](recipe.cost.id)}</small>`;
        button.addEventListener('click', () => {
          if (G["craft"](this.inventory, recipe)) {
            G["playSfx"]('item.pickup');
            this._renderInventoryGrid();
            this._renderRecipes();
          } else {
            G["playSfx"]('click', { volume: 0.3 });
          }
        });
        list.appendChild(button);
      }
    }

    /* ---------------- 选项 ---------------- */

    _bindOptionControls() {
      const { hudScale, sensitivity, fov, volume, renderDistance } = this.ui;
      hudScale?.addEventListener('input', () => {
        this.hudScale = Number(hudScale.value);
        this._syncOptionControls();
        this._resize();
      });
      sensitivity?.addEventListener('input', () => {
        this.sensitivity = Number(sensitivity.value) / 1000;
        this.input.sensitivity = this.sensitivity;
        this._syncOptionControls();
      });
      fov?.addEventListener('input', () => {
        this.fov = Number(fov.value);
        if (this.renderer) this.renderer.fov = this.fov;
        this._syncOptionControls();
      });
      volume?.addEventListener('input', () => {
        this.volume = Number(volume.value) / 100;
        G["setVolume"](this.volume);
        this._syncOptionControls();
      });
      renderDistance?.addEventListener('change', () => {
        this.renderDistance = Number(renderDistance.value);
        if (this.world) {
          this.world.renderDistance = this.renderDistance;
          this.renderer.renderDistanceBlocks = this.renderDistance * G["CHUNK_SIZE"];
        }
      });
    }

    /** 把当前设置写回控件，并刷新旁边的数值标签。 */
    _syncOptionControls() {
      const { hudScale, sensitivity, fov, volume, renderDistance } = this.ui;
      if (hudScale) hudScale.value = String(this.hudScale);
      if (sensitivity) sensitivity.value = (this.sensitivity * 1000).toFixed(1);
      if (fov) fov.value = String(this.fov);
      if (volume) volume.value = String(Math.round(this.volume * 100));
      if (renderDistance) renderDistance.value = String(this.renderDistance);

      const label = (id, text) => {
        const node = document.getElementById(id);
        if (node) node.textContent = text;
      };
      label('opt-fov-value', String(this.fov));
      label('opt-sensitivity-value', (this.sensitivity * 1000).toFixed(1));
      label('opt-hud-scale-value', String(this.hudScale));
      label('opt-volume-value', String(Math.round(this.volume * 100)));
    }

    _applyOptions() {
      G["setVolume"](this.volume);
      this.renderer.fov = this.fov;
      this.renderer.renderDistanceBlocks = this.renderDistance * G["CHUNK_SIZE"];
      this.input.sensitivity = this.sensitivity;
    }

    /* ---------------- 输入 ---------------- */

    _onKey(code, event, isUp) {
      if (isUp || !this.running) return;

      // 双击 W 疾跑，和原版一致。
      if (code === 'KeyW' && !this.paused) {
        const now = performance.now();
        if (now - this.doubleTapTimer < 320) this.doubleTapSprint = true;
        this.doubleTapTimer = now;
      } else if (code !== 'KeyW') {
        this.doubleTapSprint = false;
      }

      if (code === 'Escape') {
        if (!this.ui.inventory.classList.contains('hidden')) this.resume();
        else if (this.paused) this.showMenu('title');
        else this.showMenu('pause');
        return;
      }
      if (this.paused) {
        if (code === 'KeyE' && !this.ui.inventory.classList.contains('hidden')) this.resume();
        return;
      }

      switch (code) {
        case 'KeyE':
          this.openInventory();
          break;
        case 'F3':
          this.showDebug = !this.showDebug;
          this.ui.debug.classList.toggle('hidden', !this.showDebug);
          break;
        case 'KeyF':
          if (this.player.gameMode === 'creative') {
            this.player.flying = !this.player.flying;
            this._toast(`飞行：${this.player.flying ? '开' : '关'}`, 1.4);
          }
          break;
        case 'KeyG': {
          const mode = this.player.gameMode === 'creative' ? 'survival' : 'creative';
          this.player.setGameMode(mode);
          this._toast(`游戏模式：${mode === 'creative' ? '创造' : '生存'}`, 1.6);
          break;
        }
        case 'KeyR':
          if (this.player.gameMode === 'creative') {
            this.player.y = this.world.surfaceY(Math.floor(this.player.x), Math.floor(this.player.z)) + 1;
            this.player.vy = 0;
          }
          break;
        default:
          if (/^Digit[1-9]$/.test(code)) {
            this.inventory.selectHotbar(Number(code.slice(5)) - 1);
            this._toast(G["stackDisplayName"](this.inventory.held?.id ?? G["BLOCK"].AIR), 1.2);
          }
      }
    }

    _onLockChange(locked) {
      if (!locked && this.running && !this.paused && !this.player.dead) this.showMenu('pause');
      this._updateHint();
    }

    _updateHint() {
      const hint = this.ui.hint;
      if (!this.isMobile && this.running && !this.paused && !this.input.locked) {
        hint.classList.remove('hidden');
        hint.textContent = '点击开始游戏';
      } else {
        hint.classList.add('hidden');
      }
    }

    _toast(message, seconds = 1.5) {
      if (!message) return;
      this.ui.toast.textContent = message;
      this.ui.toast.classList.remove('hidden');
      this.toastTimer = seconds;
      this.heldNameTimer = 2.0;
    }

    /* ---------------- 主循环 ---------------- */

    _loop() {
      requestAnimationFrame(() => this._frame());
    }

    _frame() {
      const now = performance.now();
      // 上限 0.25 秒：从后台切回来时不会因为累积时间而瞬移。
      const dt = Math.min((now - this.clock.last) / 1000, 0.25);
      this.clock.last = now;

      this.clock.frames++;
      this.clock.fpsTimer += dt;
      if (this.clock.fpsTimer >= 0.5) {
        this.clock.fps = Math.round(this.clock.frames / this.clock.fpsTimer);
        this.clock.frames = 0;
        this.clock.fpsTimer = 0;
      }

      if (this.running) {
        this.world.update(this.player.x, this.player.z, this.paused ? 10 : 3);
        if (!this.paused) {
          this.input.enabled = this.isMobile || this.input.locked;
          this._applyLook();
          this._tick(dt);
        }
        this._render();
      }
      this.input.endFrame();
      this._loop();
    }

    _applyLook() {
      const look = this.input.lookDelta();
      if (look.yaw || look.pitch) {
        this.player.yaw += look.yaw;
        this.player.pitch = G["clamp"](this.player.pitch + look.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
      }
    }

    _setupMobileControls() {
      document.body.classList.toggle('mobile-device', this.isMobile);
      if (!this.ui.mobileControls) return;

      this.ui.mobileControls.addEventListener('pointerdown', (event) => {
        if (event.target.closest('[data-touch-action]')) event.preventDefault();
      });

      this.ui.mobileControls.querySelectorAll('[data-touch-key]').forEach((button) => {
        const pointerIds = new Set();
        const setPressed = (pressed) => this.input.setTouchKey(button.dataset.touchKey, pressed);
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          pointerIds.add(event.pointerId);
          button.setPointerCapture(event.pointerId);
          setPressed(true);
        });
        const release = (event) => {
          if (!pointerIds.delete(event.pointerId)) return;
          if (!pointerIds.size) setPressed(false);
        };
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('lostpointercapture', release);
      });

      this.ui.mobileControls.querySelector('[data-touch-action="inventory"]')
        ?.addEventListener('click', () => this.openInventory());
      this.ui.mobileControls.querySelector('[data-touch-action="pause"]')
        ?.addEventListener('click', () => this.showMenu('pause'));

      const joystick = this.ui.joystick;
      joystick?.addEventListener('pointerdown', (event) => {
        if (this.paused || this._joystickPointer !== null) return;
        event.preventDefault();
        this._joystickPointer = event.pointerId;
        joystick.setPointerCapture(event.pointerId);
        this._updateJoystick(event);
      });
      joystick?.addEventListener('pointermove', (event) => {
        if (event.pointerId === this._joystickPointer) this._updateJoystick(event);
      });
      const releaseJoystick = (event) => {
        if (event.pointerId !== this._joystickPointer) return;
        this._joystickPointer = null;
        this._setJoystickKeys(0, 0);
        this.ui.joystickKnob.style.transform = '';
      };
      joystick?.addEventListener('pointerup', releaseJoystick);
      joystick?.addEventListener('pointercancel', releaseJoystick);
      joystick?.addEventListener('lostpointercapture', releaseJoystick);

      this.canvas.addEventListener('pointerdown', (event) => {
        if (!this.isMobile || this.paused || event.pointerType === 'mouse') return;
        const slot = this._hotbarSlotAt(event.offsetX, event.offsetY);
        if (slot >= 0) {
          this.inventory.selectHotbar(slot);
          event.preventDefault();
          return;
        }
        if (this._touchLookPointer !== null) return;
        this._touchLookPointer = event.pointerId;
        this._touchDragged = false;
        this._touchHoldActive = false;
        this._touchStartPosition = { x: event.clientX, y: event.clientY };
        this._lastTouchPosition = { x: event.clientX, y: event.clientY };
        this._touchPlaceTimer = 0;
        this.canvas.setPointerCapture(event.pointerId);
        this._touchHoldTimer = setTimeout(() => {
          if (this._touchLookPointer !== event.pointerId || this._touchDragged) return;
          this._touchHoldActive = true;
          this.input.setTouchButton(0, true);
        }, 350);
        event.preventDefault();
      });
      this.canvas.addEventListener('pointermove', (event) => {
        if (event.pointerId !== this._touchLookPointer) return;
        const previous = this._lastTouchPosition;
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        const start = this._touchStartPosition;
        if (!this._touchDragged && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
          this._touchDragged = true;
          clearTimeout(this._touchHoldTimer);
          this._touchHoldTimer = null;
        }
        if (this._touchDragged) this.input.addTouchLook(dx, dy);
        this._lastTouchPosition = { x: event.clientX, y: event.clientY };
      });
      const releaseTouch = (event, cancelled = false) => {
        if (event.pointerId !== this._touchLookPointer) return;
        clearTimeout(this._touchHoldTimer);
        this._touchHoldTimer = null;
        if (this._touchHoldActive) this.input.setTouchButton(0, false);
        else if (!cancelled && !this._touchDragged) this._touchPlaceTimer = 0.12;
        this._touchHoldActive = false;
        this._touchLookPointer = null;
      };
      this.canvas.addEventListener('pointerup', (event) => releaseTouch(event));
      this.canvas.addEventListener('pointercancel', (event) => releaseTouch(event, true));
      this.canvas.addEventListener('lostpointercapture', (event) => releaseTouch(event, true));
    }

    _updateJoystick(event) {
      const rect = this.ui.joystick.getBoundingClientRect();
      const radius = rect.width * 0.36;
      const dx = G["clamp"](event.clientX - (rect.left + rect.width / 2), -radius, radius);
      const dy = G["clamp"](event.clientY - (rect.top + rect.height / 2), -radius, radius);
      const x = dx / radius, y = dy / radius;
      this._setJoystickKeys(x, y);
      this.ui.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    _setJoystickKeys(x, y) {
      const magnitude = Math.hypot(x, y);
      const deadZone = 0.12;
      const strength = magnitude > deadZone
        ? Math.min(1, (magnitude - deadZone) / (1 - deadZone))
        : 0;
      const scale = magnitude > 0 ? strength / magnitude : 0;
      this.input.setTouchMove(x * scale, -y * scale);
    }

    _hotbarSlotAt(x, y) {
      const scale = this.hudScale;
      const slot = Math.round(22 * scale);
      const gap = Math.round(2 * scale);
      const totalWidth = slot * 9 + gap * 8;
      const startX = Math.round((this.canvas.clientWidth - totalWidth) / 2);
      const top = Math.round(this.canvas.clientHeight - slot - 6 * scale) - 4 * scale;
      if (y < top || y > top + slot + 8 * scale) return -1;
      const index = Math.floor((x - startX) / (slot + gap));
      if (index < 0 || index >= 9 || x > startX + index * (slot + gap) + slot) return -1;
      return index;
    }

    _updateMobileControls() {
      this.ui.mobileControls?.classList.toggle(
        'hidden',
        !this.isMobile || !this.running || this.paused
          || !this.ui.inventory.classList.contains('hidden'),
      );
      this.ui.crosshair?.classList.toggle('hidden', !this.running || this.paused);
      this._updateHint();
    }

    _tick(dt) {
      const input = this.input;
      const player = this.player;
      const intent = {
        forward: input.isDown('KeyW'),
        backward: input.isDown('KeyS'),
        left: input.isDown('KeyA'),
        right: input.isDown('KeyD'),
        moveX: input.touchMove.x,
        moveY: input.touchMove.y,
        jump: input.isDown('jump'),
        sneak: input.isDown('sneak'),
        sprint: input.isDown('sprint') || this.doubleTapSprint,
      };

      this.clock.accumulator += dt;
      let steps = 0;
      while (this.clock.accumulator >= TICK && steps < 10) {
        this.clock.accumulator -= TICK;
        steps++;
        this.world.time = (this.world.time + 1) % 24000;
        this._previousPlayerPosition = { x: player.x, y: player.y, z: player.z };

        player.update(this.world, intent, TICK, {
          onStep: (world, x, y, z) => {
            const id = world.getBlock(x, y, z);
            if (id !== 0) {
              G["playSfx"](`step.${G["BLOCKS"][id]?.walkSound ?? 'stone'}`, { rate: 0.9 + Math.random() * 0.2, volume: 0.35 });
            }
          },
          onSwim: () => { if (Math.random() < 0.25) G["playSfx"]('splash', { volume: 0.3 }); },
          onHurt: () => { G["playSfx"]('player.hurt', { volume: 0.8 }); this.damageFlash = 1; },
        });

        this.mobs.update(player, TICK, {
          onPlayerHurt: () => { this.damageFlash = 1; },
          onPickup: (blockId, count) => {
            const leftover = this.inventory.add(blockId, count);
            if (leftover < count) G["playSfx"]('item.pickup', { rate: 1 + Math.random() * 0.2, volume: 0.5 });
            return leftover;
          },
        });

        if (player.dead && !this.deathShown) {
          this.deathShown = true;
          G["playSfx"]('player.death');
          setTimeout(() => { if (player.dead) this.showMenu('death'); }, 900);
        }
      }

      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);

      // 左键在够得着生物时是攻击，否则是挖掘。
      const mining = input.mouseButton(0);
      const touchTap = this.isMobile && this._touchPlaceTimer > 0;
      const placing = input.mouseButton(2) || touchTap;
      const aimingAtMob = mining && !!this.mobs.nearest(player, 3.4);
      this.interaction.update({
        mine: mining && !aimingAtMob,
        place: placing,
        attack: (aimingAtMob && !this.isMobile) || touchTap,
        placeOnMiss: touchTap,
      }, dt);
      this._touchPlaceTimer = touchTap ? 0 : Math.max(0, this._touchPlaceTimer - dt);

      for (const button of input.consumeClicks()) {
        if (button === 1 && this.interaction.target) {
          const id = this.world.getBlock(
            this.interaction.target.x, this.interaction.target.y, this.interaction.target.z,
          );
          if (id) {
            this.inventory.slots[this.inventory.selected] = { id, count: 64 };
            this._toast(G["stackDisplayName"](id), 1.2);
          }
        }
      }

      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0) this.ui.toast.classList.add('hidden');
      }
      if (this.heldNameTimer > 0) this.heldNameTimer -= dt;
    }

    _render() {
      const player = this.player;
      let previous = this._previousPlayerPosition ?? player;
      if (Math.hypot(player.x - previous.x, player.y - previous.y, player.z - previous.z) > 3) {
        previous = player;
      }
      const alpha = Math.min(1, this.clock.accumulator / TICK);
      const renderX = previous.x + (player.x - previous.x) * alpha;
      const renderY = previous.y + (player.y - previous.y) * alpha;
      const renderZ = previous.z + (player.z - previous.z) * alpha;
      const eyeOffset = player.eyeY - player.y;
      this.renderer.updateSky(this.world.time, 24000);
      this.renderer.updateCamera({
        x: renderX, y: renderY + eyeOffset, z: renderZ, yaw: player.yaw, pitch: player.pitch,
      });
      this.renderer.render({ x: renderX, y: renderY + eyeOffset, z: renderZ });

      const target = this.interaction.target;
      if (target) {
        this.renderer.drawSelection({ x: target.x, y: target.y, z: target.z }, this.interaction.breakProgress);
      }

      const geometry = G["buildMobGeometry"](this.mobs.mobs);
      this.renderer.drawEntities(geometry.vertices, geometry.count, geometry.boxes);
      this.renderer.drawItems(this.mobs.items, { x: renderX, y: renderY + eyeOffset, z: renderZ });

      this.hud.resize(this.canvas.clientWidth, this.canvas.clientHeight, this.hudScale);
      this.hud.render({
        player,
        inventory: this.inventory,
        damageFlash: this.damageFlash,
        underwater: player.headInWater,
        mode: player.gameMode,
        aimingAtEntity: !!this.mobs.nearest(player, 3.4),
        showHotbar: !this.paused,
        heldNameAlpha: this.heldNameTimer > 0 ? Math.min(1, this.heldNameTimer) : 0,
        showHeldName: !this.paused,
      });

      if (this.showDebug) this._updateDebug();
      this._deliverFrameSample();
    }

    _updateDebug() {
      const p = this.player;
      const stats = this.renderer.stats;
      const world = this.world;
      const target = this.interaction.target;
      this.ui.debug.textContent = [
        `我的世界 · 网页版    ${this.clock.fps} 帧/秒`,
        `坐标：${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
        `区块：${Math.floor(p.x / G["CHUNK_SIZE"])} ${Math.floor(p.z / G["CHUNK_SIZE"])}    世界时间：${Math.floor(world.time)}`,
        `朝向：${facingName(p.yaw)}   偏航 ${(p.yaw * 57.2958).toFixed(1)}°   俯仰 ${(p.pitch * 57.2958).toFixed(1)}°`,
        `生物群系：${world.biomeNameAt(Math.floor(p.x), Math.floor(p.z))}`,
        `区块段：绘制 ${stats.sections}，剔除 ${stats.culled}   绘制调用 ${stats.drawCalls}   三角面 ${Math.round(stats.triangles)}`,
        `已加载区块：${world.chunks.size}   待处理 ${world.meshQueue.length + world.genQueue.length}`,
        `实体：${this.mobs.mobs.length} 个生物，${this.mobs.items.length} 个掉落物`,
        `准星目标：${target ? `${target.x} ${target.y} ${target.z}（${G["BLOCKS"][target.id]?.display ?? target.id}）` : '无'}`,
        `状态：${p.onGround ? '在地面' : '在空中'}${p.inWater ? ' 水中' : ''}${p.flying ? ' 飞行' : ''}`
          + `   模式 ${p.gameMode === 'creative' ? '创造' : '生存'}   种子 ${this.seed}`,
      ].join('\n');
    }

    _resize() {
      if (!this.renderer) return;
      this.renderer.resize();
      this.hud.resize(this.canvas.clientWidth, this.canvas.clientHeight, this.hudScale);
    }

    /* ---------------- 截图与自检支持 ---------------- */

    /**
     * 让地形流入 `seconds` 秒后画一帧，并把画面编码成 PNG data URL。
     *
     * 供 `?shot=1` 使用：软件渲染下合成器截图会得到空图，而 gl.readPixels
     * 能读到真实像素，所以由页面自己导出画面。
     */
    async captureFrame(seconds = 8, scale = 1) {
      const until = performance.now() + seconds * 1000;
      while (performance.now() < until) {
        this.world.update(this.player.x, this.player.z, 12);
        // 继续模拟，保证相机处于真实的站立高度。
        for (let i = 0; i < 3; i++) this.player.update(this.world, IDLE_INTENT, TICK);
        await nextFrame();
      }

      // 等网格补齐，避免截到满是空洞的画面。
      const meshUntil = performance.now() + 8000;
      let quietFrames = 0;
      while (performance.now() < meshUntil && quietFrames < 45) {
        this.world.update(this.player.x, this.player.z, 12);
        quietFrames = (this.world.meshQueue.length === 0 && this.world.genQueue.length === 0)
          ? quietFrames + 1
          : 0;
        await nextFrame();
      }

      this._render();
      this._render();

      const gl = this.renderer.gl;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(4 * w * h);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // WebGL 原点在左下角，翻成左上角原点的 ImageData。
      const flipped = new Uint8ClampedArray(pixels.length);
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        flipped.set(pixels.subarray(y * rowBytes, y * rowBytes + rowBytes), (h - 1 - y) * rowBytes);
      }
      const full = document.createElement('canvas');
      full.width = w;
      full.height = h;
      full.getContext('2d').putImageData(new ImageData(flipped, w, h), 0, 0);

      const factor = Math.max(0.1, Math.min(1, Number(scale) || 1));
      let source = full;
      if (factor < 1) {
        const small = document.createElement('canvas');
        small.width = Math.max(1, Math.round(w * factor));
        small.height = Math.max(1, Math.round(h * factor));
        const ctx = small.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(full, 0, 0, small.width, small.height);
        source = small;
      }
      return source.toDataURL('image/png');
    }

    /**
     * 从 WebGL 上下文读回画面中部的统计信息，用来判断“画面是不是又黑又平”。
     * 必须在画完这一帧、缓冲区被提交之前读取。
     */
    sampleFramebuffer(timeoutMs = 15000) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          this._frameSample = null;
          resolve({ ok: false, detail: `等待 ${timeoutMs} 毫秒仍没有渲染出帧` });
        }, timeoutMs);
        this._frameSample = (result) => {
          clearTimeout(timer);
          resolve(result);
        };
      });
    }

    /** 一帧渲染结束后，如果有采样请求就交付统计结果。 */
    _deliverFrameSample() {
      const deliver = this._frameSample;
      if (!deliver) return;
      this._frameSample = null;

      const gl = this.renderer.gl;
      const width = Math.min(gl.drawingBufferWidth, 200);
      const height = Math.min(Math.max(40, Math.floor(gl.drawingBufferHeight * 0.25)), 200);
      const x0 = Math.floor((gl.drawingBufferWidth - width) / 2);
      const y0 = Math.floor((gl.drawingBufferHeight - height) / 2);
      const pixels = new Uint8Array(4 * width * height);
      gl.readPixels(x0, y0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      let sum = 0;
      const colors = new Set();
      const bands = new Array(8).fill(0);
      const total = width * height;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        sum += luma;
        bands[Math.min(7, Math.floor(luma / 32))]++;
        colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      }
      const meanLuma = sum / total;
      const usedBands = bands.filter((count) => count > total * 0.01).length;
      deliver({
        ok: meanLuma > 40 && colors.size > 24 && usedBands >= 2,
        detail: `中部 ${width}×${height}：平均亮度 ${meanLuma.toFixed(1)}，`
          + `${colors.size} 种颜色，${usedBands} 个亮度区间`,
      });
    }
  }

  function facingName(yaw) {
    const deg = ((yaw * 57.2958) % 360 + 360) % 360;
    if (deg < 45 || deg >= 315) return '北 (-Z)';
    if (deg < 135) return '西 (-X)';
    if (deg < 225) return '南 (+Z)';
    return '东 (+X)';
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  const QUERY = new URLSearchParams(location.search);
  const game = new Game();
  window.game = game;

  game.boot().then(async () => {
    if (QUERY.has('test')) runSelfTest(game);

    // ?shot=1 只渲染一帧并把 PNG 放进 DOM，便于无头运行抓图检查渲染。
    if (QUERY.has('shot')) {
      document.getElementById('menu')?.classList.add('hidden');
      document.getElementById('loading')?.classList.add('hidden');
      document.getElementById('hint')?.classList.add('hidden');
      if (QUERY.has('yaw')) game.player.yaw = Number(QUERY.get('yaw'));
      if (QUERY.has('pitch')) game.player.pitch = Number(QUERY.get('pitch'));
      if (QUERY.has('time')) game.world.time = Number(QUERY.get('time'));
      if (QUERY.has('fly')) {
        game.player.setGameMode('creative');
        game.player.flying = true;
        game.player.y += Number(QUERY.get('up') || 14);
      }
      if (QUERY.has('nocull')) game.renderer.cullEnabled = false;

      const png = await game.captureFrame(
        Number(QUERY.get('settle') || 10),
        Number(QUERY.get('scale') || 1),
      );
      const holder = document.createElement('pre');
      holder.id = 'shot-data';
      holder.textContent = png;
      document.body.appendChild(holder);

      const info = document.createElement('pre');
      info.id = 'shot-info';
      const p = game.player;
      info.textContent = JSON.stringify({
        camera: {
          x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1),
          yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
          eyeY: +p.eyeY.toFixed(2), onGround: p.onGround, flying: p.flying,
        },
        groundY: game.world.heightAt(Math.floor(p.x), Math.floor(p.z)),
        chunks: game.world.chunks.size,
        meshedChunks: game._loadedChunkCount(),
        pending: game.world.meshQueue.length + game.world.genQueue.length,
        sections: game.renderer.stats.sections,
        culled: game.renderer.stats.culled,
        calls: game.renderer.stats.drawCalls,
      });
      document.body.appendChild(info);
      document.title = 'SHOT-READY';
    }
  }).catch((err) => {
    console.error('[game] 启动失败', err);
    const box = document.getElementById('loading-text');
    if (box) {
      box.textContent = `无法启动：${err?.message || err}`;
      if (/WebGL2/i.test(String(err?.message))) {
        box.textContent += ' —— 当前浏览器不支持 WebGL2。';
      }
    }
    document.getElementById('loading')?.classList.remove('hidden');
    document.title = 'BOOT-FAILED';
    writeTestResult([`FAIL 启动 :: ${err?.message || err}`]);
  });

  /**
   * 自检：把 PASS/FAIL 列表写进 #test-output，供 tools/smoke-test.mjs 读取。
   * 覆盖世界生成、网格化、渲染、物理与玩法链路。
   */
  function writeTestResult(lines) {
    let output = document.getElementById('test-output');
    if (!output) {
      output = document.createElement('pre');
      output.id = 'test-output';
      output.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre;';
      document.body.appendChild(output);
    }
    output.textContent = `${lines.join('\n')}\n`;
  }

  async function runSelfTest(instance) {
    const results = [];
    const record = (name, ok, detail = '') => {
      results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
      writeTestResult(results);
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      instance.paused = false;
      instance._updateMobileControls();
      await wait(3000);

      const world = instance.world;
      const renderer = instance.renderer;
      instance.showMenu('pause');
      const fullscreenButton = instance.ui.menuButtons.querySelector('[data-action="fullscreen"]');
      record('fullscreen-menu-button', !!fullscreenButton && fullscreenButton.textContent === '全屏',
        '菜单包含全屏切换按钮');
      instance.resume();

      const input = instance.input;
      const interaction = instance.interaction;
      const savedInteractionMethods = {
        updateTarget: interaction.updateTarget,
        attack: interaction._attack,
        place: interaction._place,
      };
      let tapFallbackPlaces = 0;
      interaction.updateTarget = () => {};
      interaction._attack = () => false;
      interaction._place = () => { tapFallbackPlaces++; };
      interaction.update({ mine: false, attack: true, place: true, placeOnMiss: true }, 0);
      const tapMissPlaces = tapFallbackPlaces === 1;
      interaction._attack = () => true;
      interaction.update({ mine: false, attack: true, place: true, placeOnMiss: true }, 0);
      record('mobile-tap-attack-placement', tapMissPlaces && tapFallbackPlaces === 1,
        '点击命中攻击，未命中仍放置');
      interaction.updateTarget = savedInteractionMethods.updateTarget;
      interaction._attack = savedInteractionMethods.attack;
      interaction._place = savedInteractionMethods.place;

      const sensitivityControl = instance.ui.sensitivity;
      const initialSensitivity = instance.sensitivity;
      sensitivityControl.value = '20';
      sensitivityControl.dispatchEvent(new Event('input', { bubbles: true }));
      record('sensitivity-scale', Math.abs(instance.sensitivity - 0.02) < 1e-9
        && sensitivityControl.value === '20'
        && document.getElementById('opt-sensitivity-value').textContent === '20.0',
      '选项上限 20 对应 0.02 rad/px');
      sensitivityControl.value = (initialSensitivity * 1000).toFixed(1);
      sensitivityControl.dispatchEvent(new Event('input', { bubbles: true }));

      input.keys.clear();
      const fakeKeyEvent = (code, ctrlKey = false) => ({
        code, ctrlKey, metaKey: false, altKey: false, target: instance.canvas,
        preventDefault() {},
      });
      input._onKeyDown(fakeKeyEvent('ControlLeft', true));
      input._onKeyDown(fakeKeyEvent('Space', true));
      record('ctrl-space-input', input.isDown('sprint') && input.isDown('jump'),
        'Ctrl 疾跑与空格跳跃同时生效');
      input.keys.clear();

      const crosshair = document.getElementById('crosshair');
      const crosshairRect = crosshair?.getBoundingClientRect();
      record('crosshair-visible', !!crosshair && !crosshair.classList.contains('hidden')
        && Math.abs(crosshairRect.x + crosshairRect.width / 2 - innerWidth / 2) < 1
        && Math.abs(crosshairRect.y + crosshairRect.height / 2 - innerHeight / 2) < 1,
      '可见且位于屏幕中心');
      record('webgl2', !!renderer.gl, renderer.gl?.getParameter(renderer.gl.VERSION));
      record('textures', renderer.atlasMissing.length === 0,
        `缺失：${renderer.atlasMissing.join(',') || '无'}`);
      record('world-generated', world.chunks.size > 20, `${world.chunks.size} 个区块`);
      record('sections-meshed', world.stats.meshed > 20, `${world.stats.meshed} 个区块段`);
      record('rendered', renderer.stats.drawCalls > 0 && renderer.stats.sections > 0,
        `绘制 ${renderer.stats.sections} 段 / ${renderer.stats.drawCalls} 次调用 / ${Math.round(renderer.stats.triangles)} 三角面`);
      record('player-on-ground', instance.player.onGround, `y=${instance.player.y.toFixed(1)}`);

      const groundY = world.heightAt(Math.floor(instance.player.x), Math.floor(instance.player.z));
      record('terrain-solid', groundY !== null && groundY > 1, `地表 y=${groundY}`);

      const bx = Math.floor(instance.player.x);
      const by = groundY ?? 60;
      const bz = Math.floor(instance.player.z);
      const before = world.getBlock(bx, by, bz);
      world.setBlock(bx, by, bz, 0);
      record('block-edit', before !== 0 && world.getBlock(bx, by, bz) === 0, `${before} -> 0`);
      world.setBlock(bx, by, bz, before);

      const hit = world.raycast([instance.player.x, instance.player.y + 1, instance.player.z], [0, -1, 0], 12);
      record('raycast', !!hit, hit ? `命中地面 y=${hit.y}` : '没有命中');

      for (let i = 0; i < 30; i++) instance.mobs.trySpawnAround(instance.player);
      record('mob-spawn', instance.mobs.mobs.length > 0, `${instance.mobs.mobs.length} 个生物`);
      const geometry = G["buildMobGeometry"](instance.mobs.mobs);
      record('mob-geometry', geometry.count > 0, `${geometry.count} 个顶点`);

      instance.inventory.clear();
      instance.inventory.add(G["BLOCK"].OAK_LOG, 2);
      record('crafting', G["craft"](instance.inventory, G["RECIPES"][0])
        && instance.inventory.countOf(G["BLOCK"].OAK_PLANKS) === 4,
      `木板=${instance.inventory.countOf(G["BLOCK"].OAK_PLANKS)}`);

      let missingIcons = 0;
      for (const id of G["CREATIVE_BLOCKS"]) if (!renderer.iconAtlas.uvs.has(id)) missingIcons++;
      record('icons', missingIcons === 0, `${missingIcons} 个方块缺少图标`);

      // 画面必须明亮且有色阶：纯黑或纯色说明贴图或光照链路坏了，
      // 而“没有抛异常”是发现不了这种问题的。
      const sample = await instance.sampleFramebuffer();
      record('frame-content', sample.ok, sample.detail);
    } catch (err) {
      record('exception', false, String((err && err.stack) || err));
    }
  }

  G["Game"] = Game;
})(__mc);


window.__mc = __mc;
