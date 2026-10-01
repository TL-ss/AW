/**
 * Simulates a jump against a flat floor and reports the arc.
 *
 * Expected: about 1.25 blocks of height, every jump identical, and a clean
 * landing back on the floor (no sinking, no sticking, no double jump).
 *
 * Usage: node tools/jump-check.mjs
 */
import { Player, PLAYER } from '../src/game/player.js';

/** A world that is air above y = 64 and solid below. */
function flatWorld(groundY = 64) {
  return {
    getBlock(x, y, z) {
      if (y < groundY) return 1;   // stone
      return 0;                    // air
    },
  };
}

const world = flatWorld();
const TICK = 1 / 20;
const idle = { forward: false, backward: false, left: false, right: false, jump: false, sneak: false, sprint: false };

/** Runs one jump and returns a trace of the feet height. */
function jumpTrace({ sprint = false, holdJumpTicks = 1 } = {}) {
  const player = new Player({ x: 0.5, y: 64, z: 0.5 });
  // Let it settle on the floor first.
  for (let i = 0; i < 10; i++) player.update(world, idle, TICK);

  const start = player.y;
  const trace = [];
  let peak = start;
  let airTicks = 0;
  let landedTick = -1;

  for (let tick = 0; tick < 60; tick++) {
    const intent = {
      ...idle,
      jump: tick < holdJumpTicks,
      sprint,
    };
    player.update(world, intent, TICK);
    trace.push(+player.y.toFixed(4));
    if (player.y > peak) peak = player.y;
    if (!player.onGround) airTicks++;
    if (landedTick < 0 && tick > 2 && player.onGround) landedTick = tick;
  }
  return {
    start,
    peak,
    height: +(peak - start).toFixed(3),
    airTicks,
    landedTick,
    end: player.y,
    trace: Array.from(trace),
    player,
  };
}

const first = jumpTrace();
console.log(`站立高度      : ${first.start.toFixed(3)}`);
console.log(`跳跃最高点    : ${first.peak.toFixed(3)}  (高度 ${first.height} 格)`);
console.log(`滞空刻数      : ${first.airTicks}  (${(first.airTicks / 20).toFixed(2)} 秒)`);
console.log(`落地刻数      : ${first.landedTick}`);
console.log(`落地后高度    : ${first.end.toFixed(3)}`);
console.log(`弧线(每刻 y)  : ${first.trace.slice(0, 22).join(', ')}`);
// Every jump must be identical: a variable arc usually means dt-dependent physics.
const heights = [];
for (let i = 0; i < 5; i++) heights.push(jumpTrace().height);
const identical = heights.every((h) => Math.abs(h - heights[0]) < 0.001);
console.log(`\n连续 5 次跳跃高度: ${heights.join(', ')}`);

// Holding jump must not give extra height (no repeated impulses while airborne).
const held = jumpTrace({ holdJumpTicks: 20 });
console.log(`长按跳跃高度  : ${held.height} 格`);

const checks = [
  ['跳跃高度约 1.25 格', Math.abs(first.height - 1.25) < 0.1],
  ['每次跳跃高度一致', identical],
  ['滞空时间约 0.55 秒', Math.abs(first.airTicks / 20 - 0.55) < 0.12],
  ['落地后停在格子上', Math.abs(first.end - Math.round(first.end)) < 0.02],
  ['长按不会跳得更高', Math.abs(held.height - first.height) < 0.05],
];

let failed = 0;
console.log('');
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
void PLAYER;
console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: OK');
process.exit(failed ? 1 : 0);
