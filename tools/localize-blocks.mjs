/**
 * One-off maintenance script: translates the block display names in
 * src/world/blocks.js to Chinese.
 *
 * Written in Node rather than PowerShell so the file is read and written as
 * real UTF-8 (PowerShell's default encoding silently mangles CJK text).
 *
 * Usage: node tools/localize-blocks.mjs [--check]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = 'src/world/blocks.js';

/** English display name -> Chinese. */
const NAMES = {
  Air: '空气',
  Stone: '石头',
  'Grass Block': '草方块',
  Dirt: '泥土',
  Cobblestone: '圆石',
  'Oak Planks': '橡木木板',
  Bedrock: '基岩',
  Water: '水',
  Sand: '沙子',
  Gravel: '砂砾',
  'Oak Log': '橡木原木',
  'Oak Leaves': '橡树树叶',
  Sandstone: '砂岩',
  'Coal Ore': '煤矿石',
  'Iron Ore': '铁矿石',
  'Gold Ore': '金矿石',
  'Diamond Ore': '钻石矿石',
  'Redstone Ore': '红石矿石',
  'Emerald Ore': '绿宝石矿石',
  Glass: '玻璃',
  Bricks: '砖块',
  'Stone Bricks': '石砖',
  'Snow Block': '雪块',
  Ice: '冰',
  Cactus: '仙人掌',
  Pumpkin: '南瓜',
  Glowstone: '荧石',
  Torch: '火把',
  'Crafting Table': '工作台',
  Furnace: '熔炉',
  Bookshelf: '书架',
  Obsidian: '黑曜石',
  Netherrack: '地狱岩',
  TNT: 'TNT',
  'White Wool': '白色羊毛',
  'Block of Diamond': '钻石块',
  'Block of Gold': '金块',
  'Block of Iron': '铁块',
  'Block of Coal': '煤炭块',
  Farmland: '耕地',
  'Dirt Path': '土径',
  Lava: '岩浆',
  Mycelium: '菌丝体',
  Podzol: '灰化土',
  Clay: '黏土',
  'Sugar Cane': '甘蔗',
  'Dead Bush': '枯萎的灌木',
  Rail: '铁轨',
  'Spruce Log': '云杉原木',
  'Spruce Planks': '云杉木板',
  'Spruce Leaves': '云杉树叶',
  'Birch Log': '白桦原木',
  'Birch Planks': '白桦木板',
  'Birch Leaves': '白桦树叶',
  Dandelion: '蒲公英',
  Poppy: '虞美人',
  Sapling: '云杉树苗',
  Grass: '草',
  'Stone Slab': '石台阶',
};

const source = await readFile(`${ROOT}/${FILE}`, 'utf8');
let converted = source;
const applied = [];
const missing = [];

for (const [english, chinese] of Object.entries(NAMES)) {
  const needle = `'${english}'`;
  // Only the display argument uses the bare English name in quotes; `name`
  // and texture fields are separate string literals with different values.
  if (!converted.includes(needle)) {
    missing.push(english);
    continue;
  }
  converted = converted.replaceAll(needle, `'${chinese}'`);
  applied.push(`${english} -> ${chinese}`);
}

if (process.argv.includes('--check')) {
  console.log(`${applied.length} names present, ${missing.length} not found`);
  if (missing.length) console.log('not found:', missing.join(', '));
  process.exit(missing.length ? 1 : 0);
}

if (missing.length) {
  console.log(`warning: no literal found for: ${missing.join(', ')}`);
}
await writeFile(`${ROOT}/${FILE}`, converted);
console.log(`localized ${applied.length} block names in ${FILE}`);
