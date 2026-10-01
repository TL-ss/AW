/**
 * Inventory, item stacks and crafting.
 *
 * The inventory is 36 slots: 0..8 are the hotbar (index 0 rendered leftmost),
 * 9..35 are the main grid. A stack is `{ id, count }` where `id` is a block id;
 * there are no separate item ids, so every item is a placeable block.
 */
import { BLOCK, BLOCKS } from '../world/blocks.js';

export const HOTBAR_SIZE = 9;
export const MAIN_SIZE = 27;
export const INVENTORY_SIZE = HOTBAR_SIZE + MAIN_SIZE;
export const MAX_STACK = 64;

export class Inventory {
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
export const RECIPES = [
  { out: { id: BLOCK.OAK_PLANKS, count: 4 }, cost: { id: BLOCK.OAK_LOG, count: 1 } },
  { out: { id: BLOCK.SPRUCE_PLANKS, count: 4 }, cost: { id: BLOCK.SPRUCE_LOG, count: 1 } },
  { out: { id: BLOCK.BIRCH_PLANKS, count: 4 }, cost: { id: BLOCK.BIRCH_LOG, count: 1 } },
  { out: { id: BLOCK.CRAFTING_TABLE, count: 1 }, cost: { id: BLOCK.OAK_PLANKS, count: 4 } },
  { out: { id: BLOCK.FURNACE, count: 1 }, cost: { id: BLOCK.COBBLESTONE, count: 8 } },
  { out: { id: BLOCK.TORCH, count: 4 }, cost: { id: BLOCK.COAL_BLOCK, count: 1 } },
  { out: { id: BLOCK.STONE_BRICKS, count: 4 }, cost: { id: BLOCK.STONE, count: 4 } },
  { out: { id: BLOCK.BRICKS, count: 4 }, cost: { id: BLOCK.CLAY, count: 4 } },
  { out: { id: BLOCK.SANDSTONE, count: 1 }, cost: { id: BLOCK.SAND, count: 4 } },
  { out: { id: BLOCK.COAL_BLOCK, count: 1 }, cost: { id: BLOCK.COAL_ORE, count: 9 } },
  { out: { id: BLOCK.IRON_BLOCK, count: 1 }, cost: { id: BLOCK.IRON_ORE, count: 9 } },
  { out: { id: BLOCK.GOLD_BLOCK, count: 1 }, cost: { id: BLOCK.GOLD_ORE, count: 9 } },
  { out: { id: BLOCK.DIAMOND_BLOCK, count: 1 }, cost: { id: BLOCK.DIAMOND_ORE, count: 9 } },
  { out: { id: BLOCK.STONE, count: 1 }, cost: { id: BLOCK.COBBLESTONE, count: 1 } },
  { out: { id: BLOCK.GLASS, count: 1 }, cost: { id: BLOCK.SAND, count: 1 } },
  { out: { id: BLOCK.BOOKSHELF, count: 1 }, cost: { id: BLOCK.OAK_PLANKS, count: 6 } },
  { out: { id: BLOCK.TNT, count: 1 }, cost: { id: BLOCK.SAND, count: 4 } },
  { out: { id: BLOCK.SNOW_BLOCK, count: 1 }, cost: { id: BLOCK.ICE, count: 4 } },
];

/** Recipes the player can currently afford, cheapest first. */
export function availableRecipes(inventory) {
  return RECIPES.filter((recipe) => inventory.countOf(recipe.cost.id) >= recipe.cost.count);
}

/**
 * Attempts to craft one recipe.
 * @returns {boolean} true when the ingredients were consumed and output added
 */
export function craft(inventory, recipe) {
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
export function starterInventory() {
  const inventory = new Inventory();
  inventory.add(BLOCK.OAK_PLANKS, 64);
  inventory.add(BLOCK.TORCH, 64);
  inventory.add(BLOCK.CRAFTING_TABLE, 1);
  inventory.add(BLOCK.COBBLESTONE, 64);
  inventory.add(BLOCK.GLASS, 32);
  inventory.add(BLOCK.DIRT, 64);
  return inventory;
}

export function isPlaceable(id) {
  const block = BLOCKS[id];
  return !!block && id !== BLOCK.AIR;
}
