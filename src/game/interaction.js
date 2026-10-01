/**
 * Block interaction: mining with per-block hardness, placing blocks with
 * collision checks, tool/block sounds, and item pickup into the inventory.
 */
import { BLOCKS, isSolid, isLiquid, soundGroup, BLOCK } from '../world/blocks.js';

/** Blocks a placement may overwrite (air, water, plants, torches). */
function isReplaceable(id) {
  const def = BLOCKS[id];
  if (!def) return true;
  if (id === BLOCK.AIR) return true;
  return !def.solid && !def.liquid;
}

export class Interaction {
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
    const hit = this.world.raycast(origin, dir, this.reach, (id) => !isLiquid(id));
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
      this._attack();
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

  _attack() {
    if (this.swingTime > 0) return;
    this.swingTime = 0.28;
    if (this.mobs?.attackFrom(this.player, 3.4, 4)) {
      this.playSound('mob.hurt', { rate: 1.1 });
    } else {
      this.playSound('click', { volume: 0.15 });
    }
  }

  _mine(dt) {
    const target = this.target;
    if (!target) {
      this._resetBreak();
      return;
    }
    const id = target.id;
    const def = BLOCKS[id];
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
      this.playSound(`dig.${soundGroup(id)}`, { rate: 0.9 + Math.random() * 0.25, volume: 0.5 });
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
    const def = BLOCKS[id];
    if (!def || def.unbreakable) return;

    this.world.setBlock(target.x, target.y, target.z, BLOCK.AIR, { record: true });
    this.world.markLightDirty(target.x, target.y, target.z);
    this.playSound(`dig.${soundGroup(id)}`, { rate: 1.0, volume: 0.8 });

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

    const def = BLOCKS[stack.id];
    if (!def) return;

    // Water is not placeable from the hotbar, matching the original.
    if (stack.id === BLOCK.WATER || stack.id === BLOCK.LAVA) return;

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
