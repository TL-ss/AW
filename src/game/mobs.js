/**
 * Entities: passive mobs, hostile mobs and dropped items.
 *
 * Mobs are rendered as coloured boxes (the classic blocky look) and use a very
 * small state machine: wander, flee, chase, attack. Everything is deterministic
 * per-mob through a seeded PRNG so behaviour is stable without a physics engine.
 */
import { mulberry32, clamp } from '../core/math.js';
import { BLOCK, isSolid, isLiquid } from '../world/blocks.js';
import { WORLD_HEIGHT } from '../world/constants.js';

/** @typedef {{x:number,y:number,z:number}} Vec3 */

export const MOB_TYPES = {
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

export class Entity {
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
    this.rand = mulberry32(seed * 2654435761 + 1);
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

export class ItemEntity {
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
    if (by < 0 || by >= WORLD_HEIGHT) continue;
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if (isSolid(world.getBlock(bx, by, bz))) return true;
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

export class EntityManager {
  constructor(world, options = {}) {
    this.world = world;
    /** @type {Entity[]} */
    this.mobs = [];
    /** @type {ItemEntity[]} */
    this.items = [];
    this.maxMobs = options.maxMobs ?? 18;
    this.spawnTimer = 0;
    this.stats = { spawns: 0, deaths: 0 };
    this.rng = mulberry32((world.seed ^ 0x9e3779b9) >>> 0);
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
      if (!isSolid(ground) || isLiquid(ground)) continue;
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
    mob.inWater = feetBlock === BLOCK.WATER;

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
      mob.yaw += clamp(delta, -6 * dt, 6 * dt);
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
      mob.vy = clamp(mob.vy, -2.4, 2.4);
    } else {
      mob.vy -= GRAVITY * dt;
      if (mob.vy < -50) mob.vy = -50;
    }

    const result = moveEntity(this.world, mob, mob.vx * dt, mob.vy * dt, mob.vz * dt);
    mob.onGround = hasGround(this.world, mob);
    if (mob.onGround && mob.vy < 0) mob.vy = 0;

    // Never let a mob fall out of the world.
    if (mob.y < -6) mob.y = WORLD_HEIGHT;
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
    const liquid = block === BLOCK.WATER;

    if (liquid) {
      item.vy += 12 * dt;
      item.vy = clamp(item.vy, -1.5, 1.5);
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
    if (item.y < -8) item.y = WORLD_HEIGHT;
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
export function pushBox(out, box, color, rot = 0, pivotY = 0) {
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
export function mobBoxes(mob) {
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
export function buildMobGeometry(mobs) {
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
