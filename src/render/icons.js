/**
 * Block icons for the HUD and for dropped items.
 *
 * Each icon shows the block's own textures as a small isometric cube: the top
 * face plus two side faces. Icons are packed into one atlas canvas so the UI
 * and the item billboards each need a single texture.
 *
 * Projection is the classic 2:1 isometric used by inventory icons:
 *   +X on screen = (16, -8)   +Z = (16, 8)   +Y = (0, 16)
 * so the top face occupies the upper half of the 32x32 slot and the two side
 * faces the lower half. Each face is a parallelogram, which maps exactly onto
 * one affine drawImage call.
 */
import { TILE_PX, tileCanvas } from './atlas.js';
import { textureFor, BLOCKS, RENDER_PASS } from '../world/blocks.js';

export const ICON_SIZE = 32;
export const ICON_COLS = 16;

/**
 * Builds an atlas of block icons.
 * @param {number[]} blockIds blocks to include, in slot order
 * @returns {{ canvas: HTMLCanvasElement, size: [number, number], uvs: Map<number, number[]> }}
 */
export function buildIconAtlas(blockIds) {
  const rows = Math.max(1, Math.ceil(blockIds.length / ICON_COLS));
  const canvas = document.createElement('canvas');
  canvas.width = ICON_COLS * ICON_SIZE;
  canvas.height = rows * ICON_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const uvs = new Map();
  blockIds.forEach((id, index) => {
    const col = index % ICON_COLS;
    const row = Math.floor(index / ICON_COLS);
    try {
      drawIsoCube(ctx, id, col * ICON_SIZE, row * ICON_SIZE);
    } catch (err) {
      console.warn(`[icons] failed to draw icon for block ${id}`, err);
    }
    const u0 = (col * ICON_SIZE) / canvas.width;
    const v0 = (row * ICON_SIZE) / canvas.height;
    const du = ICON_SIZE / canvas.width;
    const dv = ICON_SIZE / canvas.height;
    uvs.set(id, [u0, v0, u0 + du, v0 + dv]);
  });

  return { canvas, size: [canvas.width, canvas.height], uvs };
}

/** Texture canvases for the three visible faces of a block icon. */
function iconTextures(blockId) {
  const def = BLOCKS[blockId];
  const flat = !!(def && (def.plant || def.pass === RENDER_PASS.CUTOUT));
  return {
    top: tileCanvas(textureFor(blockId, flat ? 4 : 2)),
    front: tileCanvas(textureFor(blockId, 4)),
    right: tileCanvas(textureFor(blockId, 0)),
  };
}

/**
 * Draws one block's isometric icon into a 32x32 icon slot using affine
 * drawImage calls — one per visible face. This is what keeps boot fast: a
 * per-pixel version costs ~1000 canvas fill calls per face.
 */
function drawIsoCube(ctx, blockId, ox, oy) {
  const s = ICON_SIZE;
  const { top, front, right } = iconTextures(blockId);

  // Screen-space face interpolation: (u, v) in the source tile maps to
  //   screen = origin + u * eu + v * ev
  // which for the isometric projection means:
  //   top   : right  (16, -8),  down (16, 8)
  //   front : right  (16, -8),  down (0, 16)
  //   right : rightZ (16, 8),   down (0, 16)
  const transform = (origin, eu, ev) => ctx.setTransform(
    eu[0] / TILE_PX, ev[0] / TILE_PX,
    eu[1] / TILE_PX, ev[1] / TILE_PX,
    ox + origin[0], oy + origin[1],
  );

  // Right (+X) face, drawn first so the front face's edge covers the seam.
  transform([16, 16], [16, 8], [0, 16]);
  ctx.drawImage(right, 0, 0);

  // Front (+Z) face.
  transform([0, 8], [16, -8], [0, 16]);
  ctx.drawImage(front, 0, 0);

  // Top (+Y) face.
  transform([0, 16], [16, -8], [16, 8]);
  ctx.drawImage(top, 0, 0);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * Vertices for one icon cube (3 quads = 18 vertices) as a flat list of
 * (x, y, z, u, v, shade). The cube is centred on the origin and is `scale` wide.
 * Face order: +Y top, +Z front, +X right.
 */
export function iconCubeGeometry(uv, scale = 0.32) {
  const s = scale;
  const half = s / 2;
  const [u0, v0, u1, v1] = uv;
  const du = u1 - u0;
  const dv = v1 - v0;
  const out = [];

  const pushQuad = (verts, uvs, shade) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const v = verts[i];
      const tex = uvs[i];
      out.push(v[0], v[1], v[2], tex[0], tex[1], shade);
    }
  };

  // The 2D icon packs the top face into the upper half of the slot and the two
  // side faces into the lower half, so the UVs mirror that split.
  const uh = 0.5;  // u fraction where the front/right faces meet
  const vh = 0.5;  // v fraction where the top face ends

  // +Y top: corners (0,0) (1,0) (1,1) (0,1) in tile space.
  pushQuad(
    [[-half, half, -half], [half, half, -half], [half, half, 0], [-half, half, 0]],
    [
      [u0 + du * uh, v0],
      [u0 + du, v0 + dv * vh * 0.5],
      [u0 + du * uh, v0 + dv * vh],
      [u0, v0 + dv * vh * 0.5],
    ],
    1.0,
  );

  // +Z front.
  pushQuad(
    [[-half, half, -half], [-half, -half, -half], [half, -half, -half], [half, half, -half]],
    [
      [u0, v0 + dv * vh * 0.5],
      [u0, v1],
      [u0 + du * uh, v1],
      [u0 + du * uh, v0 + dv * vh],
    ],
    0.72,
  );

  // +X right.
  pushQuad(
    [[half, half, -half], [half, -half, -half], [half, -half, 0], [half, half, 0]],
    [
      [u0 + du * uh, v0 + dv * vh],
      [u0 + du * uh, v1],
      [u0 + du, v1],
      [u0 + du, v0 + dv * vh],
    ],
    0.86,
  );

  return out;
}
