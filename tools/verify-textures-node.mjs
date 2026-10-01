// tools/verify-textures-node.mjs
//
// Fallback verifier for environments where headless Chrome cannot start
// (e.g. the DSH Windows sandbox denies the named pipes Chrome's mojo IPC needs,
// and Node's piped child_process.spawn fails with EPERM).
//
// It runs the EXACT script embedded in tools/texture-check.html, but against a
// minimal, strict Canvas2D/ImageData shim implemented on Uint8ClampedArray, so
// every pixel assertion in the HTML page is still exercised for real.
//
// Usage: node tools/verify-textures-node.mjs
// Exits 0 only when the page reports "RESULT: ALL CHECKS PASSED".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');
const PAGE = path.join(HERE, 'texture-check.html');

// ---------------------------------------------------------------------------
// Strict Canvas2D shim
// ---------------------------------------------------------------------------

class ImageDataShim {
  constructor(a, b, c) {
    if (typeof a === 'number') {
      if (typeof b !== 'number') throw new TypeError('ImageData(width, height) needs height');
      this.width = a;
      this.height = b;
      this.data = new Uint8ClampedArray(a * b * 4);
    } else {
      this.data = a;
      this.width = b;
      this.height = c ?? (a.length / 4 / b);
    }
    if (this.data.length !== this.width * this.height * 4) {
      throw new Error(`ImageData size mismatch: ${this.data.length} != ${this.width}x${this.height}x4`);
    }
  }
}

class CanvasRenderingContext2DShim {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = { clearRect: 0, putImageData: 0, getImageData: 0 };
  }

  clearRect(x, y, w, h) {
    this.calls.clearRect++;
    // The textures module only clears the whole canvas.
    if (x !== 0 || y !== 0 || w !== this.canvas.width || h !== this.canvas.height) {
      throw new Error(`shim: unexpected clearRect(${x},${y},${w},${h})`);
    }
    this.canvas._px.fill(0);
  }

  putImageData(img, dx, dy) {
    this.calls.putImageData++;
    if (!(img instanceof ImageDataShim)) throw new TypeError('putImageData expects ImageData');
    const { width: cw, height: ch, _px: px } = this.canvas;
    // Strict: writing outside the canvas is an atlas-layout bug, so fail loudly.
    if (dx < 0 || dy < 0 || dx + img.width > cw || dy + img.height > ch) {
      throw new Error(
        `shim: putImageData out of bounds at (${dx},${dy}) size ${img.width}x${img.height} in ${cw}x${ch}` +
        ' — atlas cell overflow'
      );
    }
    for (let y = 0; y < img.height; y++) {
      const src = y * img.width * 4;
      const dst = ((dy + y) * cw + dx) * 4;
      px.set(img.data.subarray(src, src + img.width * 4), dst);
    }
  }

  getImageData(x, y, w, h) {
    this.calls.getImageData++;
    if (x < 0 || y < 0 || x + w > this.canvas.width || y + h > this.canvas.height) {
      throw new Error(`shim: getImageData out of bounds (${x},${y},${w},${h})`);
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
      const src = ((y + row) * this.canvas.width + x) * 4;
      out.set(this.canvas._px.subarray(src, src + w * 4), row * w * 4);
    }
    return new ImageDataShim(out, w, h);
  }
}

class CanvasShim {
  constructor() {
    this._w = 300;
    this._h = 150;
    this._px = new Uint8ClampedArray(this._w * this._h * 4);
    this._ctx = new CanvasRenderingContext2DShim(this);
  }

  get width() { return this._w; }
  set width(v) {
    const n = Number(v) | 0;
    if (n <= 0) throw new Error(`invalid canvas width ${v}`);
    this._w = n;
    this._px = new Uint8ClampedArray(this._w * this._h * 4);
  }

  get height() { return this._h; }
  set height(v) {
    const n = Number(v) | 0;
    if (n <= 0) throw new Error(`invalid canvas height ${v}`);
    this._h = n;
    this._px = new Uint8ClampedArray(this._w * this._h * 4);
  }

  getContext(kind) {
    if (kind !== '2d') throw new Error(`shim: unsupported context ${kind}`);
    return this._ctx;
  }
}

const nodeList = [];
const fakeOut = { textContent: '', id: 'out' };
const fakeTitleHolder = { title: '' };

/** Counts canvases attributed to the module function that created them. */
const createdBy = new Map();
function noteCreation(label) {
  createdBy.set(label, (createdBy.get(label) || 0) + 1);
}

/** The single `document` the page and the module both see. */
const documentShim = {
  getElementById(id) {
    if (id !== 'out') throw new Error(`shim: unexpected getElementById(${id})`);
    return fakeOut;
  },
  createElement(tag) {
    if (String(tag).toLowerCase() !== 'canvas') throw new Error(`shim: createElement(${tag})`);
    const c = new CanvasShim();
    nodeList.push(c);
    return c;
  },
  get title() { return fakeTitleHolder.title; },
  set title(v) { fakeTitleHolder.title = v; },
  // Deliberately no appendChild / body: the module must not touch the DOM tree.
  get body() { throw new Error('shim: module must not touch document.body'); },
  appendChild() { throw new Error('shim: module must not append to the document'); },
};

// ---------------------------------------------------------------------------
// Run the page script verbatim
// ---------------------------------------------------------------------------

const html = fs.readFileSync(PAGE, 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error(`no <script type="module"> found in ${PAGE}`);
let code = m[1];

// The page imports the module by relative URL; resolve it for Node.
const importMatches = [...code.matchAll(/import\('([^']+)'\)/g)];
for (const [, spec] of importMatches) {
  if (spec.startsWith('.') || spec.startsWith('/')) {
    const abs = path.resolve(HERE, spec);
    code = code.replaceAll(`'${spec}'`, `'${new URL(`file://${abs}`).href}'`);
  }
}
// Rewrite ES module import/export syntax into plain awaits for Function().
code = code.replace(/^\s*import\s+[\s\S]*?from\s+'[^']*';\s*$/gm, '');
code = code.replace(/\bexport\s+/g, '');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction(
  'document', 'ImageData', 'HTMLCanvasElement', 'URL', 'window', 'globalThis',
  `"use strict";\n${code}`
);

// The page script uses dynamic import(), which resolves against the real global
// scope, so the shim must be installed there while it runs.
const saved = {};
for (const [key, value] of [
  ['document', documentShim],
  ['ImageData', ImageDataShim],
  ['HTMLCanvasElement', CanvasShim],
]) {
  saved[key] = globalThis[key];
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}

// Import the module once to learn the tile count. Any canvas created at import
// time would be a top-level side effect; measure that, then reset the counters
// so the numbers below describe only the page script's own run.
const canvasesAtImport = nodeList.length;
const { TEXTURE_NAMES } = await import(new URL('../src/render/textures.js', import.meta.url).href);
const canvasesAfterImport = nodeList.length;
const importSideEffects = canvasesAfterImport - canvasesAtImport;
nodeList.length = 0;
createdBy.clear();

const started = Date.now();
let thrown = null;
try {
  await run(documentShim, ImageDataShim, CanvasShim, URL, { __canvasNodes: nodeList }, globalThis);
} catch (err) {
  thrown = err;
} finally {
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete globalThis[key];
    else Object.defineProperty(globalThis, key, { value: saved[key], writable: true, configurable: true });
  }
}

const fromPage = nodeList.length;

console.log('# page:', path.relative(PROJECT_ROOT, PAGE));
console.log('# runtime: node DOM-shim (Canvas2D + ImageData on Uint8ClampedArray)');
console.log(`# TEXTURE_NAMES.length: ${TEXTURE_NAMES.length}`);
console.log('# ---- page output (verbatim from <pre id="out">) ----');
console.log(fakeOut.textContent);

const passed = fakeOut.textContent.includes('RESULT: ALL CHECKS PASSED');
console.log('# ---- harness ----');
console.log(`# page title: ${fakeTitleHolder.title}`);
console.log(`# elapsed: ${Date.now() - started} ms`);
console.log(`# canvases created by the page script: ${fromPage}` +
  ` (2 generateAtlas passes + 1 generateTileCanvas per name = ${TEXTURE_NAMES.length + 2})`);
console.log(`# canvases created while importing the module: ${importSideEffects}`);

if (thrown) {
  console.error(`# harness error: ${thrown.stack || thrown}`);
  process.exit(1);
}
// The module must never touch the DOM tree, and must be lazy: no canvas at import.
if (importSideEffects !== 0) {
  console.error(`# FAIL: ${importSideEffects} canvas(es) created while importing the module (must be lazy)`);
  process.exitCode = 1;
}
// This page script makes exactly 2 generateAtlas() passes, 1 generateTileCanvas()
// call per name, and 2 extra tilePixels() reads for each of the two flower
// determinism checks (dandelion/poppy). Anything else is a stray allocation.
const FLOWER_CHECKS = 4; // 2 flowers x 2 pixel reads
const expectedFromPage = TEXTURE_NAMES.length + 2 + FLOWER_CHECKS;
if (fromPage !== expectedFromPage) {
  console.error(
    `# FAIL: expected ${expectedFromPage} canvases from the page script, got ${fromPage}` +
    ` (${TEXTURE_NAMES.length} tile canvases + 2 atlas passes + ${FLOWER_CHECKS} flower checks)`
  );
  process.exitCode = 1;
}
if (!passed) {
  console.error('# VERIFY FAILED: page did not report success');
  process.exit(1);
}
if (process.exitCode) {
  console.error('# VERIFY FAILED: harness assertions above failed');
  process.exit(process.exitCode);
}
console.log('# VERIFY OK: page reported success');
process.exit(0);
