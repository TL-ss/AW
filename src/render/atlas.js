/**
 * Builds the block texture atlas and the crack (block-breaking) overlay from
 * procedurally generated 16 x 16 tiles.
 *
 * Atlas geometry comes from src/world/tile-manifest.json so that the worker,
 * the renderer and this module all agree on tile ids.
 */
import { generateAtlas, generateTileCanvas, TILE_PX } from './textures.js';
import manifest from '../world/tile-manifest.json' with { type: 'json' };

export const ATLAS_COLS = manifest.atlasCols;
export const ATLAS_ROWS = manifest.atlasRows;

/** Atlas cell (column, row) of a texture name from the manifest. */
export function tileCell(name) {
  const id = manifest.tileIds[name];
  if (id === undefined) return null;
  const index = id - 1;
  return { col: index % ATLAS_COLS, row: Math.floor(index / ATLAS_COLS) };
}

/** Cache so repeated calls for the same tile do not regenerate pixels. */
const tileCanvasCache = new Map();

export function tileCanvas(name) {
  let canvas = tileCanvasCache.get(name);
  if (canvas) return canvas;
  try {
    canvas = generateTileCanvas(name);
  } catch (err) {
    console.warn(`[atlas] tile "${name}" failed to generate, using a placeholder`, err);
    canvas = placeholderTile();
  }
  tileCanvasCache.set(name, canvas);
  return canvas;
}

function placeholderTile() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c020c0';
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, TILE_PX / 2, TILE_PX / 2);
  ctx.fillRect(TILE_PX / 2, TILE_PX / 2, TILE_PX / 2, TILE_PX / 2);
  return canvas;
}

/**
 * Composes every texture the manifest references into one atlas canvas.
 * Tiles are laid out at the atlas cell the manifest assigned them.
 *
 * The result is cached because building it is the single most expensive thing
 * that happens at boot, and the renderer may be recreated (world reload).
 *
 * @returns {{ canvas: HTMLCanvasElement, size: [number, number], missing: string[], ms: number }}
 */
let cachedAtlas = null;

export function buildAtlas() {
  if (cachedAtlas) return cachedAtlas;
  const started = performance.now();
  const width = ATLAS_COLS * TILE_PX;
  const height = ATLAS_ROWS * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  const missing = [];
  for (const name of manifest.tileNames) {
    const cell = tileCell(name);
    if (!cell) continue;
    let tile;
    try {
      tile = tileCanvas(name);
    } catch (err) {
      missing.push(name);
      tile = placeholderTile();
    }
    if (!tile || !tile.width) {
      missing.push(name);
      tile = placeholderTile();
    }
    ctx.drawImage(tile, cell.col * TILE_PX, cell.row * TILE_PX);
  }

  if (missing.length) console.warn('[atlas] tiles that needed a placeholder:', missing);
  cachedAtlas = {
    canvas,
    size: [width, height],
    missing,
    ms: performance.now() - started,
    // The same per-tile canvases the atlas was composed from; the renderer
    // uploads these as array-texture layers.
    tileCanvas,
    tileNames: manifest.tileNames,
  };
  return cachedAtlas;
}

/**
 * Ten stacked 16 x 16 crack stages in a 16 x 160 texture, matching the classic
 * Minecraft destroy animation: progressively denser dark cracks.
 */
export function buildCrackTexture(stages = 10) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = TILE_PX * stages;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 1;

  // Deterministic pseudo-random so the cracks look the same every run.
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let stage = 0; stage < stages; stage++) {
    const y0 = stage * TILE_PX;
    const crackCount = stage + 1;
    for (let c = 0; c < crackCount * 2; c++) {
      let x = Math.floor(rand() * TILE_PX);
      let y = Math.floor(rand() * TILE_PX);
      const len = 2 + Math.floor(rand() * 5);
      for (let i = 0; i < len; i++) {
        ctx.fillRect(x, y0 + y, 1, 1);
        x += Math.round(rand() * 2 - 1);
        y += Math.round(rand() * 2 - 1);
        if (x < 0 || x >= TILE_PX || y < 0 || y >= TILE_PX) break;
      }
    }
    // A few brighter spots make the last stages read as deep cracks.
    if (stage >= 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let c = 0; c < stage; c++) {
        ctx.fillRect(Math.floor(rand() * TILE_PX), y0 + Math.floor(rand() * TILE_PX), 1, 1);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
    }
  }
  return canvas;
}

/**
 * Small helper the HUD uses to draw a block icon: returns the canvas of the
 * block's most representative face (top for grass-like blocks, side otherwise).
 */
export function blockIconCanvas(blockId, textureFor) {
  const name = textureFor(blockId, 4);
  return tileCanvas(name);
}

export { generateAtlas, generateTileCanvas, TILE_PX };