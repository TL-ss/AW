/**
 * GLSL ES 3.00 sources for the chunk renderer, the sky, the wireframe overlay
 * and the HUD. Kept in one module so the vertex contract with the mesher
 * (position in block units, tile id, baked light byte) stays in one place.
 */

/* ------------------------------------------------------------------ *
 * Chunk geometry
 * ------------------------------------------------------------------ */

const CHUNK_VERTEX = `#version 300 es
precision highp float;

in vec3 a_position;   // section-local, in 1/16-block units
in float a_tile;      // 1-based tile id; selects the array-texture layer
in vec2 a_uv;         // corner offset inside the tile, 0..16
in float a_light;     // baked light + ambient occlusion, normalised 0..1

uniform mat4 u_viewProj;
uniform vec3 u_chunkOrigin;   // chunk min corner in world space (x, 0, z)
uniform vec3 u_cameraPosition;
uniform vec2 u_section;       // (sectionY * 16, unused)

out float v_light;
out float v_dist;
out vec3 v_local;
flat out float v_tile;
flat out float v_layer;
out vec2 v_inTile;

void main() {
  int tile = int(a_tile + 0.5);
  v_tile = a_tile;
  // Tile ids are 1-based; each tile owns one layer of the array texture.
  v_layer = float(tile - 1);

  // The texture coordinate comes straight from the vertex data: the mesher
  // knows which corner of the tile each vertex is. Clamping keeps the sample
  // off the exact tile edge so CLAMP_TO_EDGE never mixes in a neighbour.
  v_inTile = clamp(a_uv / 16.0, vec2(0.0), vec2(0.999));

  vec3 localBlocks = a_position / 16.0;
  vec3 world = u_chunkOrigin + localBlocks;
  world.y += u_section.x;

  gl_Position = u_viewProj * vec4(world, 1.0);
  v_light = a_light;
  v_dist = length(world - u_cameraPosition);
  v_local = localBlocks;
}
`;

/** Shared fragment body; the pass-selecting constant is prepended per program. */
const CHUNK_FRAGMENT = (mode) => `#version 300 es
precision highp float;
precision highp sampler2DArray;

in float v_light;
in float v_dist;
in vec3 v_local;
in vec3 v_world;
in vec2 v_inTile;
flat in float v_tile;
flat in float v_layer;

uniform sampler2DArray u_atlas;   // one layer per block texture
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_dayLight;     // 0 = midnight, 1 = noon
uniform float u_alpha;

out vec4 outColor;

void main() {
  vec4 texel = texture(u_atlas, vec3(v_inTile, v_layer));
${mode === 'cutout' ? '  if (texel.a < 0.5) discard;\n' : ''}
  // The mesher already bakes face shading, ambient occlusion, and the
  // skylight/blocklight mix into v_light, so only a warm/cool tint and the
  // day-night dimming are applied here. The tints are deliberately close to
  // white: a saturated tint washes the terrain out to blue-grey.
  vec3 blockLight = vec3(1.0, 0.93, 0.80);
  vec3 skyLight = vec3(0.94, 0.97, 1.0);
  float l = clamp(v_light, 0.0, 1.0);
  // Only strongly lit surfaces get the sky tint; dim ones stay neutral.
  vec3 lightColor = mix(blockLight, skyLight, smoothstep(0.45, 1.0, l));
  float brightness = mix(0.26, 1.0, l) * mix(0.34, 1.0, u_dayLight) * 1.45;
  vec3 color = texel.rgb * lightColor * brightness;
  float fogFactor = smoothstep(u_fogNear, u_fogFar, v_dist);
  color = mix(color, u_fogColor, fogFactor);
  outColor = vec4(color, texel.a * ${mode === 'translucent' ? 'u_alpha' : '1.0'});
}
`;

/* ------------------------------------------------------------------ *
 * Sky
 * ------------------------------------------------------------------ */

const SKY_VERTEX = `#version 300 es
precision highp float;
in vec2 a_position;   // -1..1 quad in clip space
out vec2 v_ndc;
void main() {
  v_ndc = a_position;
  gl_Position = vec4(a_position, 0.999, 1.0);
}
`;

const SKY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_ndc;

uniform vec3 u_horizon;
uniform vec3 u_zenith;
uniform vec3 u_sunDir;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform vec3 u_camForward;
uniform vec2 u_tanHalfFov;   // (tan(fovY/2) * aspect, tan(fovY/2))
uniform float u_sunStrength;

out vec4 outColor;

void main() {
  // Rebuild the world-space view ray for this pixel so the gradient and the
  // sun track the camera instead of being pinned to the screen.
  vec3 dir = normalize(u_camForward
    + u_camRight * (v_ndc.x * u_tanHalfFov.x)
    + u_camUp * (v_ndc.y * u_tanHalfFov.y));

  float horizonFactor = smoothstep(-0.12, 0.82, dir.y);
  vec3 color = mix(u_horizon, u_zenith, horizonFactor);

  float sunDot = max(dot(dir, normalize(u_sunDir)), 0.0);
  float sun = pow(sunDot, 160.0);
  float halo = pow(sunDot, 24.0) * 0.05;
  color += vec3(1.0, 0.88, 0.66) * (sun + halo) * u_sunStrength;

  outColor = vec4(color, 1.0);
}
`;

/* ------------------------------------------------------------------ *
 * Lines: block selection outline, debug helpers
 * ------------------------------------------------------------------ */

const LINE_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform float u_scale;
void main() {
  // Lines arrive as unit-cube edge vertices; scale about the cube centre.
  vec3 local = (a_position - 0.5) * u_scale + 0.5;
  gl_Position = u_viewProj * vec4(local + u_offset, 1.0);
}
`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() { outColor = u_color; }
`;

/* ------------------------------------------------------------------ *
 * Entities (mobs, dropped items): shaded boxes
 * ------------------------------------------------------------------ */

const ENTITY_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec3 a_color;
uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform vec3 u_lightDir;
uniform float u_brightness;
out vec3 v_color;
void main() {
  vec3 n = normalize(mat3(u_model) * a_normal);
  float diffuse = 0.62 + 0.38 * max(dot(n, normalize(u_lightDir)), 0.0);
  v_color = a_color * diffuse * u_brightness;
  gl_Position = u_viewProj * u_model * vec4(a_position, 1.0);
}
`;

const ENTITY_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_color;
uniform float u_alpha;
out vec4 outColor;
void main() { outColor = vec4(v_color, u_alpha); }
`;

/* ------------------------------------------------------------------ *
 * Crack overlay (block breaking progress)
 * ------------------------------------------------------------------ */

const CRACK_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position;
in vec2 a_uv;
uniform mat4 u_viewProj;
uniform vec3 u_offset;
uniform float u_scale;
uniform float u_layer;
out vec2 v_uv;
void main() {
  vec3 local = (a_position - 0.5) * u_scale + 0.5;
  v_uv = a_uv;
  gl_Position = u_viewProj * vec4(local + u_offset, 1.0);
}
`;

const CRACK_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_crack;
uniform float u_layer;
out vec4 outColor;

void main() {
  // 10 stages are stacked vertically in a 16 x 160 texture.
  vec2 uv = vec2(v_uv.x, v_uv.y / 10.0 + u_layer * 0.1);
  float alpha = texture(u_crack, uv).a;
  if (alpha < 0.05) discard;
  outColor = vec4(0.0, 0.0, 0.0, alpha * 0.85);
}
`;

/* ------------------------------------------------------------------ *
 * HUD: flat colour triangles in pixel space
 * ------------------------------------------------------------------ */

const HUD_VERTEX = `#version 300 es
precision highp float;
in vec2 a_position;
in vec4 a_color;
uniform mat4 u_projection;
out vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const HUD_FRAGMENT = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() { outColor = v_color; }
`;

/** HUD textured quads: hotbar icons, item counts share one pass. */
const HUD_TEX_VERTEX = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_uv;
uniform mat4 u_projection;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const HUD_TEX_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  vec4 texel = texture(u_texture, v_uv);
  outColor = texel * u_color;
}
`;

/* ------------------------------------------------------------------ *
 * Block icons: the isometric cubes shown in the HUD and dropped in the world
 * ------------------------------------------------------------------ */

const ICON_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position;
in vec2 a_uv;
in float a_shade;
uniform mat4 u_viewProj;
uniform mat4 u_model;
out vec2 v_uv;
out float v_shade;
void main() {
  v_uv = a_uv;
  v_shade = a_shade;
  gl_Position = u_viewProj * u_model * vec4(a_position, 1.0);
}
`;

const ICON_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_shade;
uniform sampler2D u_texture;
uniform float u_alpha;
out vec4 outColor;
void main() {
  vec4 texel = texture(u_texture, v_uv);
  if (texel.a < 0.02) discard;
  outColor = vec4(texel.rgb * v_shade, texel.a * u_alpha);
}
`;

/**
 * HUD icons: one batched draw call for every inventory slot.
 * Per-vertex (x, y, u, v, r, g, b, a) in pixel space with an orthographic
 * projection, so highlighting a slot only changes the vertex colours.
 */
const HUD_ICON_VERTEX = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_uv;
in vec4 a_color;
uniform mat4 u_projection;
out vec2 v_uv;
out vec4 v_color;
void main() {
  v_uv = a_uv;
  v_color = a_color;
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const HUD_ICON_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  vec4 texel = texture(u_texture, v_uv);
  if (texel.a < 0.02) discard;
  outColor = vec4(texel.rgb * v_color.rgb * texel.a, v_color.a * texel.a);
}
`;

/* ------------------------------------------------------------------ *
 * Exported shader table
 * ------------------------------------------------------------------ */

export const SHADERS = {
  chunk: {
    vertex: CHUNK_VERTEX,
    fragment: {
      opaque: CHUNK_FRAGMENT('opaque'),
      cutout: CHUNK_FRAGMENT('cutout'),
      translucent: CHUNK_FRAGMENT('translucent'),
    },
  },
  sky: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  line: { vertex: LINE_VERTEX, fragment: LINE_FRAGMENT },
  entity: { vertex: ENTITY_VERTEX, fragment: ENTITY_FRAGMENT },
  crack: { vertex: CRACK_VERTEX, fragment: CRACK_FRAGMENT },
  hud: { vertex: HUD_VERTEX, fragment: HUD_FRAGMENT },
  hudTex: { vertex: HUD_TEX_VERTEX, fragment: HUD_TEX_FRAGMENT },
  icon: { vertex: ICON_VERTEX, fragment: ICON_FRAGMENT },
  hudIcon: { vertex: HUD_ICON_VERTEX, fragment: HUD_ICON_FRAGMENT },
};

/**
 * Unit-cube wireframe edges (12 lines, 24 vertices) used for the selection box.
 * The same array doubled is used as the triangle-soup cube for the breaking
 * overlay, so keep it in one place.
 */
export const CUBE_EDGES = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0,
  0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0,
  0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1,
]);
