/**
 * Block registry — the single source of truth for block ids, textures and
 * per-block behaviour. Imported by the renderer, the interaction code and the
 * HUD. The world generator worker keeps only a tiny mirror of the numeric ids
 * it needs (see src/world/blocks-worker.js) to stay free of DOM imports.
 */

export const RENDER_PASS = {
  OPAQUE: 0,
  CUTOUT: 1,   // alpha-tested (leaves, glass, plants)
  TRANSLUCENT: 2, // alpha-blended, drawn last (water, ice)
};

export const BLOCK = {
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

export const BLOCK_COUNT = 59;

/** Texture atlas grid: 16 x 32 cells of 16 x 16 pixels = 256 x 512 pixels. */
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 32;

/** Face order used by the mesher and the geometry tables: +X, -X, +Y, -Y, +Z, -Z. */
export const FACE = { EAST: 0, WEST: 1, TOP: 2, BOTTOM: 3, SOUTH: 4, NORTH: 5 };

export const FACE_NORMALS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Per-face brightness multipliers — stands in for real directional lighting. */
export const FACE_SHADE = [0.72, 0.72, 1.0, 0.5, 0.86, 0.86];

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
export const BLOCKS = [];

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
export function textureFor(id, face) {
  const b = BLOCKS[id];
  if (!b) return 'stone';
  return typeof b.tex === 'string' ? b.tex : (b.tex[face] ?? b.tex[0]);
}

export function isOpaque(id) {
  const b = BLOCKS[id];
  return b ? b.opaque : false;
}

export function isSolid(id) {
  const b = BLOCKS[id];
  if (!b || !b.solid) return false;
  return b.height > 0;
}

export function isLiquid(id) {
  const b = BLOCKS[id];
  return !!(b && b.liquid);
}

export function lightEmission(id) {
  const b = BLOCKS[id];
  return b ? b.light : 0;
}

/** Skylight removed when passing through this block (15 = fully blocked). */
export function lightFilter(id) {
  const b = BLOCKS[id];
  if (!b) return 15;
  if (b.opaque) return 15;
  return b.filter;
}

export function blockName(id) {
  return BLOCKS[id]?.display ?? `block_${id}`;
}

/** Sound group used for digging / stepping / placing. */
export function soundGroup(id) {
  return BLOCKS[id]?.sound ?? 'stone';
}

export function walkSoundGroup(id) {
  return BLOCKS[id]?.walkSound ?? BLOCKS[id]?.sound ?? 'stone';
}

/** The flat, placeable blocks offered by the creative inventory. */
export const CREATIVE_BLOCKS = BLOCKS
  .filter((b) => b && b.id !== BLOCK.AIR && !b.liquid && !b.unbreakable)
  .map((b) => b.id);

/** Blocks given to the player when a new survival world starts. */
export const SURVIVAL_STARTER = [BLOCK.OAK_PLANKS, BLOCK.DIRT, BLOCK.STONE, BLOCK.TORCH];
