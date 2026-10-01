/**
 * The player: AABB physics against the voxel world, movement modes, and the
 * survival stats (health, hunger, air, fall damage).
 *
 * Coordinates: `x/y/z` is the feet position. `yaw` is rotation around +Y
 * (0 looks toward -Z, increasing yaw turns left), `pitch` is positive upward.
 */
import { clamp } from '../core/math.js';
import { isSolid, isLiquid, BLOCK, BLOCKS } from '../world/blocks.js';
import { WORLD_HEIGHT } from '../world/constants.js';

export const PLAYER = {
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

export class Player {
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
    this.health = clamp(this.health + amount, 0, PLAYER.maxHealth);
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
      if (by < 0 || by >= WORLD_HEIGHT) continue;
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          const id = world.getBlock(bx, by, bz);
          if (!isSolid(id)) continue;
          const blockHeight = BLOCKS[id]?.height ?? 1;
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
    this.inWater = isLiquid(feet) && feet === BLOCK.WATER;
    this.headInWater = isLiquid(head) && head === BLOCK.WATER;
    this.inLava = feet === BLOCK.LAVA || head === BLOCK.LAVA;

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
      this.vy = clamp(this.vy, -3.5, 3.5);
      this.fallDistance = 0;
    } else if (this.inLava) {
      this.vy -= PLAYER.gravity * 0.35 * dt;
      if (intent.jump) this.vy = 1.6;
      this.vy = clamp(this.vy, -6, 3);
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
    // jumping add impulses, so clamp defensively.
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
      const solidUnder = (px, pz) => isSolid(world.getBlock(Math.floor(px), Math.floor(probeY), Math.floor(pz)));
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
        if (isSolid(probe)) {
          // Rest exactly on the surface of the block that stopped the fall.
          const surface = by + (BLOCKS[probe]?.height ?? 1);
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
            if (world.getBlock(bx, by, bz) === BLOCK.CACTUS) {
              this.damage(1, 'cactus');
              break outer;
            }
          }
        }
      }
    }
  }
}
