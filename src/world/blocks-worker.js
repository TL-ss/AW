/**
 * Numeric block ids mirrored from src/world/blocks.js.
 *
 * This file exists so the world generator / mesher worker can run without
 * importing the DOM-touching block registry. Keep the ids in sync with the
 * `BLOCK` export there; only the ids the generator actually places are listed.
 */
export const ID = {
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
