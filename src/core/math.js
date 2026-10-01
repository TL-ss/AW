/**
 * Small, dependency-free math helpers shared by the main thread and the
 * world-generation worker. Matrices are column-major Float32Array(16),
 * matching the layout WebGL expects for `uniformMatrix4fv`.
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth hermite interpolation, used for camera/entity easing. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function mod(a, n) {
  return ((a % n) + n) % n;
}

/** Positive modulo, the flavour used by Minecraft-style chunk coordinates. */
export function floorMod(a, n) {
  return a - Math.floor(a / n) * n;
}

/** Floors a value to an integer. Kept as a function so call sites read alike. */
export function floorDiv(a, n) {
  return Math.floor(a / n);
}

export function dist2(ax, ay, az, bx, by, bz) {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/* ------------------------------------------------------------------ *
 * Matrices
 * ------------------------------------------------------------------ */

export function mat4() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Identity(out) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function mat4Perspective(out, fovYRad, aspect, near, far) {
  const f = 1 / Math.tan(fovYRad / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function mat4Ortho(out, left, right, bottom, top, near, far) {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

/**
 * Builds a view matrix from a yaw/pitch camera at `pos`.
 * yaw is rotation around +Y (0 = looking toward -Z), pitch is rotation around +X.
 */
export function mat4ViewFromEuler(out, px, py, pz, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  // Camera basis: forward = (-sy*cp, sp, -cy*cp)
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  // right = normalize(cross(forward, up))
  const rx = cy, ry = 0, rz = -sy;
  // up = cross(right, forward)
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  out[0] = rx; out[4] = ry; out[8] = rz; out[12] = -(rx * px + ry * py + rz * pz);
  out[1] = ux; out[5] = uy; out[9] = uz; out[13] = -(ux * px + uy * py + uz * pz);
  out[2] = -fx; out[6] = -fy; out[10] = -fz; out[14] = fx * px + fy * py + fz * pz;
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  return out;
}

export function mat4Mul(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export function mat4Translate(out, x, y, z) {
  mat4Identity(out);
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

export function mat4RotateY(out, rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  mat4Identity(out);
  out[0] = c; out[2] = -s;
  out[8] = s; out[10] = c;
  return out;
}

export function mat4Scale(out, x, y, z) {
  mat4Identity(out);
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}

/** Composes T * Ry * S 鈥?the transform used for every entity box. */
export function mat4TRS(out, tx, ty, tz, yawRad, sx, sy, sz) {
  const c = Math.cos(yawRad), s = Math.sin(yawRad);
  out[0] = c * sx; out[1] = 0; out[2] = -s * sx; out[3] = 0;
  out[4] = 0; out[5] = sy; out[6] = 0; out[7] = 0;
  out[8] = s * sz; out[9] = 0; out[10] = c * sz; out[11] = 0;
  out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
  return out;
}

/* ------------------------------------------------------------------ *
 * Visibility
 * ------------------------------------------------------------------ */

/**
 * Decides whether a section of the world can be skipped this frame.
 *
 * This deliberately avoids a frustum-plane test. Deriving the six planes from a
 * view-projection matrix is easy to get subtly wrong, and one plane with a
 * flipped normal silently deletes a whole slice of the world while the image
 * still looks plausible. Two obvious checks are used instead: a hard distance
 * limit, and a "clearly behind the camera" rejection that only applies beyond a
 * safe radius. Both err toward drawing too much rather than too little.
 *
 * @param {{x:number,y:number,z:number}} camera eye position
 * @param {number[]} forward camera forward unit vector
 * @param {number} centreX section centre
 * @param {number} centreY
 * @param {number} centreZ
 * @param {number} radius half the section diagonal
 * @param {number} maxDistance draw distance in blocks
 */
export function sectionVisible(camera, forward, centreX, centreY, centreZ, radius, maxDistance) {
  const dx = centreX - camera.x;
  const dy = centreY - camera.y;
  const dz = centreZ - camera.z;
  const distance = Math.hypot(dx, dy, dz);

  // Outside the draw distance, allowing for the section's own extent.
  if (distance - radius > maxDistance) return false;

  // Never cull anything close: turning around must not reveal a hole.
  if (distance < radius + 24) return true;

  const along = dx * forward[0] + dy * forward[1] + dz * forward[2];
  if (along < -radius) return false;

  const lateral = Math.hypot(
    dx - along * forward[0],
    dy - along * forward[1],
    dz - along * forward[2],
  );
  // A generous cone: about 58 degrees half-angle, plus slack for section size.
  return lateral < Math.abs(along) * 1.6 + radius + 16;
}

/* ------------------------------------------------------------------ *
 * Random
 * ------------------------------------------------------------------ */

/** mulberry32 鈥?small, fast, seedable PRNG. Returns floats in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes three integers into a uniform float in [0,1). Stable across runs. */
export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
