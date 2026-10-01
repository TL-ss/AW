/**
 * Compares the two candidate AABB-vs-frustum tests against a hand-computed box.
 *
 * Expected result: a flat ground patch roughly 16 blocks across, sitting about
 * 1.6 blocks below the camera, must be reported as VISIBLE. Both conventions
 * are printed so the correct one can be identified rather than assumed.
 */
import { mat4, mat4Perspective, mat4ViewFromEuler, mat4Mul, extractFrustum } from '../src/core/math.js';

const proj = mat4();
const view = mat4();
const vp = mat4();
mat4Perspective(proj, (70 * Math.PI) / 180, 16 / 9, 0.05, 220);
mat4ViewFromEuler(view, 0.5, 68.62, 0.5, 0, 0);
mat4Mul(vp, proj, view);
const planes = extractFrustum(vp);

const nearPlaneNames = ['left', 'right', 'bottom', 'top', 'near', 'far'];

/** Convention A: reject when the corner FARTHEST along the normal is outside. */
function farthestCornerTest(x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 6; i++) {
    const a = planes[i * 4], b = planes[i * 4 + 1], c = planes[i * 4 + 2], d = planes[i * 4 + 3];
    const px = a >= 0 ? x1 : x0;
    const py = b >= 0 ? y1 : y0;
    const pz = c >= 0 ? z1 : z0;
    if (a * px + b * py + c * pz + d < 0) return { visible: false, plane: nearPlaneNames[i] };
  }
  return { visible: true, plane: null };
}

/** Convention B: reject when the corner NEAREST along the normal is outside. */
function nearestCornerTest(x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 6; i++) {
    const a = planes[i * 4], b = planes[i * 4 + 1], c = planes[i * 4 + 2], d = planes[i * 4 + 3];
    const nx = a >= 0 ? x0 : x1;
    const ny = b >= 0 ? y0 : y1;
    const nz = c >= 0 ? z0 : z1;
    if (a * nx + b * ny + c * nz + d < 0) return { visible: false, plane: nearPlaneNames[i] };
  }
  return { visible: true, plane: null };
}

const cases = [
  ['ground at chunk 0,0 (x 0..16, y 0..7, z 0..16)     ', 0, 0, 0, 16, 7, 16, true],
  ['ground ahead (x 0..16, y 0..7, z -16..0)           ', 0, 0, -16, 16, 7, 0, true],
  ['ground ahead, surface only (y 64..72, z -16..0)    ', 0, 64, -16, 16, 72, 0, true],
  ['ground patch under camera (y 64..72, z 0..16)      ', 0, 64, 0, 16, 72, 16, true],
  ['far ahead (y 64..80, z -128..-112)                 ', 0, 64, -128, 16, 80, -112, true],
  ['behind camera (y 64..80, z 40..56)                 ', 0, 64, 40, 16, 80, 56, false],
  ['far behind (y 64..80, z 200..216)                  ', 0, 64, 200, 16, 80, 216, false],
];

let conventionAFailures = 0;
let conventionBFailures = 0;
console.log('box                                              expect   farthest  nearest');
for (const [name, x0, y0, z0, x1, y1, z1, expected] of cases) {
  const a = farthestCornerTest(x0, y0, z0, x1, y1, z1);
  const b = nearestCornerTest(x0, y0, z0, x1, y1, z1);
  const label = (result) => (result.visible ? 'keep  ' : `cull(${result.plane})`);
  console.log(`${name} ${expected ? 'keep  ' : 'cull  '}   ${label(a).padEnd(14)} ${label(b)}`);
  if (a.visible !== expected) conventionAFailures++;
  if (b.visible !== expected) conventionBFailures++;
}

console.log('');
console.log(`farthest-corner mismatches: ${conventionAFailures}`);
console.log(`nearest-corner mismatches : ${conventionBFailures}`);
const winner = conventionAFailures === 0 ? 'farthest-corner'
  : conventionBFailures === 0 ? 'nearest-corner' : 'neither';
console.log(`correct convention: ${winner}`);
process.exit(winner === 'neither' ? 1 : 0);
