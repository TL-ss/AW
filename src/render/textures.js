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

export const TILE_PX = 16;
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 32;

/** Every tile name, in atlas index order (row-major). */
export const TEXTURE_NAMES = [
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
export const TILE_INDEX = {};

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
export function generateAtlas() {
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
export function generateTileCanvas(name) {
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
