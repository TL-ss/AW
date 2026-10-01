/**
 * GENERATED FILE - do not edit by hand.
 * Produced by tools/build.mjs from the modules listed there.
 */

/* World generator + mesher. */
var __mc = (typeof self !== 'undefined' && !self.document) ? self : window;
__mc.__worldgen = __mc.__worldgen || {};
__mc = __mc.__worldgen;

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


