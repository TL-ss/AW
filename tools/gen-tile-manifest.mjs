/**
 * Build-time helper: reads the block registry and the procedural texture list,
 * then emits src/world/tile-manifest.json.
 *
 * The manifest is the contract between three places:
 *   - src/world/chunk-worker.js, which maps a block face to an atlas tile id
 *     and bakes that id into the vertex data;
 *   - src/render/atlas.js, which copies each tile into its atlas cell;
 *   - src/render/textures.js, which owns the tile order.
 *
 * Tile ids are 1-based and follow TEXTURE_NAMES order exactly, because
 * generateAtlas() lays the tiles out row-major in that same order:
 *   index = id - 1, col = index % ATLAS_COLS, row = floor(index / ATLAS_COLS)
 *
 * Run with:  node tools/gen-tile-manifest.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/* ------------------------------------------------------------------ *
 * 1. Read the authoritative tile order out of src/render/textures.js
 * ------------------------------------------------------------------ */

const texturesSource = await readFile(`${root}/src/render/textures.js`, 'utf8');

function readExportedNumber(name) {
  const match = texturesSource.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
  if (!match) throw new Error(`could not read ${name} from src/render/textures.js`);
  return Number(match[1]);
}

function readTextureNames() {
  const start = texturesSource.indexOf('export const TEXTURE_NAMES');
  if (start < 0) throw new Error('TEXTURE_NAMES not found in src/render/textures.js');
  const open = texturesSource.indexOf('[', start);
  // Walk to the matching closing bracket so nested arrays would still parse.
  let depth = 0;
  let end = -1;
  for (let i = open; i < texturesSource.length; i++) {
    const ch = texturesSource[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error('could not find the end of TEXTURE_NAMES');
  const body = texturesSource.slice(open + 1, end);
  const names = [...body.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  if (!names.length) throw new Error('TEXTURE_NAMES appears to be empty');
  return names;
}

const ATLAS_COLS = readExportedNumber('ATLAS_COLS');
const ATLAS_ROWS = readExportedNumber('ATLAS_ROWS');
const TEXTURE_NAMES = readTextureNames();

const tileIdByName = new Map();
TEXTURE_NAMES.forEach((name, index) => {
  if (tileIdByName.has(name)) throw new Error(`duplicate texture name "${name}" in TEXTURE_NAMES`);
  tileIdByName.set(name, index + 1);
});

/* ------------------------------------------------------------------ *
 * 2. Map every block face onto a tile id
 * ------------------------------------------------------------------ */

const { BLOCKS, textureFor } = await import('../src/world/blocks.js');

/**
 * Fallbacks for names the texture module does not paint. Whenever a block asks
 * for one of these it borrows a painted tile instead of showing a placeholder.
 */
const TEXTURE_ALIASES = {
  dandelion: 'grass_top',
  poppy: 'grass_top',
  pumpkin_face: 'pumpkin_side',
  furnace_front: 'furnace_side',
  sponge: 'wool_white',
};

const missing = new Set();
const usedAliases = new Map();

function resolveTileId(name) {
  let id = tileIdByName.get(name);
  if (id !== undefined) return id;
  const alias = TEXTURE_ALIASES[name];
  if (alias !== undefined) {
    usedAliases.set(name, alias);
    id = tileIdByName.get(alias);
    if (id !== undefined) return id;
  }
  missing.add(name);
  return 0; // 0 renders as the first atlas cell; reported below.
}

/** @type {number[][]} blockId -> [6 face tile ids] in +X -X +Y -Y +Z -Z order */
const blockFaces = [];
for (let id = 0; id < BLOCKS.length; id++) {
  const block = BLOCKS[id];
  if (!block) { blockFaces[id] = [0, 0, 0, 0, 0, 0]; continue; }
  blockFaces[id] = [0, 1, 2, 3, 4, 5].map((face) => resolveTileId(textureFor(id, face)));
}

if (missing.size) {
  throw new Error(
    `these textures are requested by blocks.js but not painted by textures.js: ${[...missing].join(', ')}\n`
    + 'Add them to TEXTURE_NAMES or map them in TEXTURE_ALIASES.',
  );
}

const capacity = ATLAS_COLS * ATLAS_ROWS;
if (TEXTURE_NAMES.length > 255) {
  throw new Error(`too many tiles (${TEXTURE_NAMES.length}); tile ids are stored in one byte`);
}
if (TEXTURE_NAMES.length > capacity) {
  throw new Error(`tile count ${TEXTURE_NAMES.length} exceeds atlas capacity ${capacity}`);
}

const manifest = {
  generatedBy: 'tools/gen-tile-manifest.mjs',
  note: 'tile id = index in TEXTURE_NAMES + 1; atlas layout is row-major',
  atlasCols: ATLAS_COLS,
  atlasRows: ATLAS_ROWS,
  tileNames: TEXTURE_NAMES,
  tileIds: Object.fromEntries(tileIdByName),
  aliases: Object.fromEntries(usedAliases),
  blockFaces,
};

await writeFile(`${root}/src/world/tile-manifest.json`, JSON.stringify(manifest, null, 1) + '\n');

/**
 * A JavaScript twin of the manifest. The worker imports this one so the same
 * modules can also be driven from Node (benchmarks, tests) without needing
 * JSON import attributes.
 */
const jsSource = `/**
 * GENERATED FILE — do not edit by hand.
 * Produced by tools/gen-tile-manifest.mjs from
 * src/render/textures.js (tile order) and src/world/blocks.js (face mapping).
 *
 * Tile ids are 1-based and follow TEXTURE_NAMES order; the atlas is row-major:
 *   index = id - 1, col = index % atlasCols, row = floor(index / atlasCols)
 */
export const atlasCols = ${manifest.atlasCols};
export const atlasRows = ${manifest.atlasRows};

export const tileNames = ${JSON.stringify(manifest.tileNames)};

export const tileIds = ${JSON.stringify(manifest.tileIds)};

/** Fallbacks used for texture names textures.js does not paint. */
export const aliases = ${JSON.stringify(manifest.aliases)};

/** blockFaces[blockId] = [ +X, -X, +Y, -Y, +Z, -Z ] tile ids */
export const blockFaces = ${JSON.stringify(manifest.blockFaces)};

export default { atlasCols, atlasRows, tileNames, tileIds, aliases, blockFaces };
`;
await writeFile(`${root}/src/world/tile-manifest.js`, jsSource);

console.log(`tile-manifest.json written`);
console.log(`  tiles      : ${TEXTURE_NAMES.length} (of ${capacity} atlas cells)`);
console.log(`  blocks     : ${BLOCKS.filter(Boolean).length}`);
if (usedAliases.size) {
  console.log(`  aliases    : ${[...usedAliases].map(([a, b]) => `${a}->${b}`).join(', ')}`);
}
const faces = blockFaces.flat().filter((v) => v === 0).length;
if (faces) console.log(`  warning    : ${faces} block faces still map to tile 0`);
