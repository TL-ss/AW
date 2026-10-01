/** Shared world constants. Imported by both the main thread and the worker. */

export const CHUNK_SIZE = 16;          // X and Z extent of a chunk
export const WORLD_HEIGHT = 128;       // Y extent of the world
export const SECTION_HEIGHT = 16;      // Y extent of one render section
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

export const SEA_LEVEL = 64;
export const MAX_LIGHT = 15;

/** Index of a block inside a chunk-local (x, y, z) triple. */
export function chunkIndex(x, y, z) {
  return (y << 8) | (z << 4) | x;
}

/* ---- Packed vertex layout (one uint32 per vertex) ------------------- *
 *  bits  0..5   x   (0..63, 1/16 block units)
 *  bits  6..11  y   (0..63, 1/16 block units)
 *  bits 12..17  z   (0..63, 1/16 block units)
 *  bits 18..27  u   (0..1023, 1/64 texel units)
 *  bits 28..33 (split across two words? no) -- see below
 *
 * 32 bits is not enough for 18 bits of position + 16 bits of UV + 8 bits of
 * light + face id, so the layout packs UV at 1/32 resolution:
 *  bits  0..5   x
 *  bits  6..11  y
 *  bits 12..17  z
 *  bits 18..22  u low  (5 bits)  -> combined with the tile origin in the shader
 *  ...
 *
 * To keep the shader simple and the data exact, positions use 1/16 units and
 * a tile's UV is expressed as (tile % 16, tile / 16) integer atlas coords that
 * the shader multiplies by 1/16. The per-vertex "corner" (0 or 1 in each axis)
 * is therefore derivable from the low bit of x/y/z, so UV does not need to be
 * stored at all: the shader reconstructs corner offsets from the position
 * fracture. See the vertex shader in src/render/shaders.js.
 */
export const VERTEX_STRIDE_BYTES = 4;

/* ---- Worker message kinds ----------------------------------------- */
export const MSG = {
  INIT: 'init',
  GEN_RESULT: 'genResult',
  MESH_RESULT: 'meshResult',
  ERROR: 'error',
};
