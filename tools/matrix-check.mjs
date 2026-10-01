/**
 * Verifies view-projection composition against a hand-checked projection.
 *
 * Projecting a point and reading its clip-space coordinates is the ground
 * truth: if the matrix is wrong, the frustum planes derived from it are wrong
 * too, and most of the world gets culled.
 *
 * Usage: node tools/matrix-check.mjs
 */
import { mat4, mat4Perspective, mat4ViewFromEuler, mat4Mul, extractFrustum } from '../src/core/math.js';

const fov = (70 * Math.PI) / 180;
const aspect = 16 / 9;
const near = 0.05;
const far = 220;
const camera = { x: 0, y: 68, z: 0, yaw: 0, pitch: 0 };

const proj = mat4();
const view = mat4();
const viewProj = mat4();
mat4Perspective(proj, fov, aspect, near, far);
mat4ViewFromEuler(view, camera.x, camera.y, camera.z, camera.yaw, camera.pitch);
mat4Mul(viewProj, proj, view);

const project = (x, y, z, matrix) => {
  const out = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) {
    out[row] = matrix[row] * x + matrix[4 + row] * y + matrix[8 + row] * z + matrix[12 + row];
  }
  return out;
};

console.log('proj  [0..3] :', [...proj.slice(0, 4)].map((v) => +v.toFixed(5)).join(', '));
console.log('proj  [4..7] :', [...proj.slice(4, 8)].map((v) => +v.toFixed(5)).join(', '));
console.log('view  [0..3] :', [...view.slice(0, 4)].map((v) => +v.toFixed(5)).join(', '));
console.log('view  [12..15]:', [...view.slice(12, 16)].map((v) => +v.toFixed(5)).join(', '));
console.log('vp    [0..3] :', [...viewProj.slice(0, 4)].map((v) => +v.toFixed(5)).join(', '));
console.log('vp    [12..15]:', [...viewProj.slice(12, 16)].map((v) => +v.toFixed(5)).join(', '));
console.log('');

// A point dead ahead of the camera: centred horizontally, at eye height, 10 ahead.
const ahead = project(0, 68, -10, viewProj);
const w = ahead[3];
console.log(`point (0,68,-10) -> clip ${ahead.map((v) => +v.toFixed(4)).join(', ')}  ndc `
  + `${ahead.slice(0, 3).map((v) => +(v / w).toFixed(4)).join(', ')}`);

// Straight down from the camera: should be below the view, so ndc.y < -1.
const down = project(0, 60, -10, viewProj);
console.log(`point (0,60,-10) -> ndc ${down.slice(0, 3).map((v) => +(v / down[3]).toFixed(4)).join(', ')}`);

const okAhead = Math.abs(ahead[0] / w) < 0.01 && Math.abs(ahead[1] / w) < 0.01 && ahead[2] / w > -1 && ahead[2] / w < 1;
const okDown = down[1] / down[3] < -1;
console.log('');
console.log(okAhead ? 'ahead point projects to the screen centre: OK' : 'ahead point projects WRONG');
console.log(okDown ? 'point below the camera projects below the view: OK' : 'point below the camera projects WRONG');

// The bottom plane must be able to see the ground receding to the horizon.
const planes = extractFrustum(viewProj);
let groundVisible = false;
for (const z of [-2, -5, -10, -40, -120]) {
  const ax = 0, ay = 68 - 1.6, az = z;
  const inside = planes.every((_, i) => {
    if (i % 4 !== 0) return true;
    return true;
  });
  void inside;
  let pass = true;
  for (let p = 0; p < 6; p++) {
    const a = planes[p * 4], b = planes[p * 4 + 1], c = planes[p * 4 + 2], d = planes[p * 4 + 3];
    if (a * ax + b * ay + c * az + d < 0) { pass = false; break; }
  }
  console.log(`  ground point z=${String(z).padStart(5)}: ${pass ? 'inside frustum' : 'outside'}`);
  if (pass && z < -2) groundVisible = true;
}
console.log(groundVisible ? 'ground ahead is inside the frustum: OK' : 'ground ahead is OUTSIDE the frustum: PROBLEM');
process.exit(okAhead && okDown && groundVisible ? 0 : 1);
