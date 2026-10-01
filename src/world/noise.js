/**
 * Seeded gradient (Perlin-style) noise with fractal helpers.
 * Dependency-free and deterministic: the same seed always produces the same world.
 */

function makePermutation(seed) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates driven by a small xorshift PRNG.
  let s = (seed >>> 0) || 1;
  const rand = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
}

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class Noise {
  constructor(seed) {
    const { perm, permMod12 } = makePermutation(seed);
    this.perm = perm;
    this.permMod12 = permMod12;
  }

  /** 2D gradient noise in roughly [-1, 1]. */
  noise2(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = this.perm[X + this.perm[Y]];
    const ab = this.perm[X + this.perm[Y + 1]];
    const ba = this.perm[X + 1 + this.perm[Y]];
    const bb = this.perm[X + 1 + this.perm[Y + 1]];

    const g = (h, dx, dy) => {
      const i = (h % 12) * 3;
      return GRAD3[i] * dx + GRAD3[i + 1] * dy;
    };

    const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
    const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
    return x1 + v * (x2 - x1);
  }

  /** 3D gradient noise in roughly [-1, 1]. */
  noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf), v = fade(yf), w = fade(zf);

    const A = this.perm[X] + Y, B = this.perm[X + 1] + Y;
    const aa = this.perm[A] + Z, ab = this.perm[A + 1] + Z;
    const ba = this.perm[B] + Z, bb = this.perm[B + 1] + Z;

    const g = (h, dx, dy, dz) => {
      const i = (h % 12) * 3;
      return GRAD3[i] * dx + GRAD3[i + 1] * dy + GRAD3[i + 2] * dz;
    };

    const lerp = (t, a, b) => a + t * (b - a);
    const x1 = lerp(u, g(aa, xf, yf, zf), g(ba, xf - 1, yf, zf));
    const x2 = lerp(u, g(ab, xf, yf - 1, zf), g(bb, xf - 1, yf - 1, zf));
    const y1 = lerp(v, x1, x2);
    const x3 = lerp(u, g(aa + 1, xf, yf, zf - 1), g(ba + 1, xf - 1, yf, zf - 1));
    const x4 = lerp(u, g(ab + 1, xf, yf - 1, zf - 1), g(bb + 1, xf - 1, yf - 1, zf - 1));
    const y2 = lerp(v, x3, x4);
    return lerp(w, y1, y2);
  }

  /** Fractal 2D noise: `octaves` layers, each half the amplitude and double the frequency. */
  fbm2(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Fractal 3D noise, used for caves and overhangs. */
  fbm3(x, y, z, octaves = 3, lacunarity = 2, persistence = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal — sharp creases, good for mountain ridges and cave tunnels. */
  ridged2(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
