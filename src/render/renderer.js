/**
 * World renderer: chunk sections, sky, block selection, breaking overlay and
 * mob geometry. One WebGL2 context, one draw call per section per pass.
 */
import { createProgram, createMesh, createTextureFromCanvas, createTextureArray, createDynamicMesh } from './gl.js';
import { SHADERS, CUBE_EDGES } from './shaders.js';
import { buildAtlas, buildCrackTexture, TILE_PX } from './atlas.js';
import { buildIconAtlas, iconCubeGeometry } from './icons.js';
import manifest from '../world/tile-manifest.js';

const manifestTileIds = manifest.tileIds;
const manifestAtlasCols = manifest.atlasCols;
const manifestTileNames = manifest.tileNames;
import {
  mat4, mat4Perspective, mat4ViewFromEuler, mat4Mul,
  sectionVisible, mat4TRS,
} from '../core/math.js';
import { CHUNK_SIZE } from '../world/constants.js';

const SECTION_KEY = (cx, cz, s) => `${cx},${cz},${s}`;

/** Unit-cube faces as (x, y, z, u, v) corners, used for the breaking overlay. */
const CUBE_FACE_QUADS = [
  // +X
  [[1, 0, 1, 0, 1], [1, 0, 0, 1, 1], [1, 1, 0, 1, 0], [1, 1, 1, 0, 0]],
  // -X
  [[0, 0, 0, 0, 1], [0, 0, 1, 1, 1], [0, 1, 1, 1, 0], [0, 1, 0, 0, 0]],
  // +Y
  [[0, 1, 1, 0, 1], [1, 1, 1, 1, 1], [1, 1, 0, 1, 0], [0, 1, 0, 0, 0]],
  // -Y
  [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]],
  // +Z
  [[0, 0, 1, 0, 1], [1, 0, 1, 1, 1], [1, 1, 1, 1, 0], [0, 1, 1, 0, 0]],
  // -Z
  [[1, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]],
];

/** Fog + sky palettes for day and night, blended by the time of day. */
const SKY_DAY = { horizon: [0.62, 0.76, 1.0], zenith: [0.24, 0.45, 0.95], fog: [0.72, 0.84, 1.0] };
const SKY_NIGHT = { horizon: [0.05, 0.07, 0.16], zenith: [0.01, 0.02, 0.07], fog: [0.04, 0.06, 0.13] };

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {number[]} [options.iconBlockIds] block ids that need an icon
   * @param {(step:string, ms:number)=>void} [options.onProgress] boot diagnostics
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    const iconBlockIds = options.iconBlockIds ?? [1];
    const iconUvExtra = options.iconUvExtra ?? {};
    this.timings = {};
    let markStart = performance.now();
    const mark = (step) => {
      const now = performance.now();
      this.timings[step] = now - markStart;
      markStart = now;
      options.onProgress?.(step, this.timings[step]);
    };
    mark('start');
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      // Needed only so a headless screenshot harness can read the frame back.
      preserveDrawingBuffer: new URLSearchParams(location.search).has('single'),
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    mark('context');

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(0.6, 0.75, 1, 1);

    this.programs = {
      opaque: createProgram(gl, SHADERS.chunk.vertex, SHADERS.chunk.fragment.opaque, 'chunk.opaque'),
      cutout: createProgram(gl, SHADERS.chunk.vertex, SHADERS.chunk.fragment.cutout, 'chunk.cutout'),
      translucent: createProgram(gl, SHADERS.chunk.vertex, SHADERS.chunk.fragment.translucent, 'chunk.translucent'),
      sky: createProgram(gl, SHADERS.sky.vertex, SHADERS.sky.fragment, 'sky'),
      line: createProgram(gl, SHADERS.line.vertex, SHADERS.line.fragment, 'line'),
      entity: createProgram(gl, SHADERS.entity.vertex, SHADERS.entity.fragment, 'entity'),
      crack: createProgram(gl, SHADERS.crack.vertex, SHADERS.crack.fragment, 'crack'),
      icon: createProgram(gl, SHADERS.icon.vertex, SHADERS.icon.fragment, 'icon'),
      hudIcon: createProgram(gl, SHADERS.hudIcon.vertex, SHADERS.hudIcon.fragment, 'hudIcon'),
      hud: createProgram(gl, SHADERS.hud.vertex, SHADERS.hud.fragment, 'hud'),
      hudTex: createProgram(gl, SHADERS.hudTex.vertex, SHADERS.hudTex.fragment, 'hudTex'),
    };
    mark('programs');

    // Block icons: used for dropped items in the world and the HUD hotbar.
    const iconStart = performance.now();
    const iconIds = [...new Set([...iconBlockIds, ...Object.keys(iconUvExtra).map(Number)])];
    this.iconAtlas = buildIconAtlas(iconIds.length ? iconIds : [1]);
    this.iconTexture = createTextureFromCanvas(gl, this.iconAtlas.canvas, { nearest: true });
    // One shared vertex buffer holding every icon cube; each block id owns a slice.
    this.iconRanges = new Map();
    const iconVerts = [];
    iconIds.forEach((id, index) => {
      const uv = this.iconAtlas.uvs.get(id) ?? [0, 0, 0.05, 0.1];
      const first = iconVerts.length / 6;
      const data = iconCubeGeometry(uv, 0.3);
      for (const value of data) iconVerts.push(value);
      this.iconRanges.set(id, { first, count: iconVerts.length / 6 - first });
    });
    this.iconVertexData = new Float32Array(iconVerts);
    this.iconVao = gl.createVertexArray();
    gl.bindVertexArray(this.iconVao);
    const iconBuffer = gl.createBuffer();
    this.iconBuffer = iconBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, iconBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.iconVertexData, gl.STATIC_DRAW);
    {
      const program = this.programs.icon;
      const aPos = program.a('a_position');
      const aUv = program.a('a_uv');
      const aShade = program.a('a_shade');
      if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0); }
      if (aUv >= 0) { gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 24, 12); }
      if (aShade >= 0) { gl.enableVertexAttribArray(aShade); gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, 24, 20); }
    }
    gl.bindVertexArray(null);

    // Block textures: one array-texture layer per tile. This removes all atlas
    // UV maths, and with it every bleeding/off-by-one failure mode.
    const atlasStart = performance.now();
    const atlas = buildAtlas();
    this.atlasSize = atlas.size;
    this.atlasCanvas = atlas.canvas;
    this.atlasTileIds = manifestTileIds;
    this.atlasColumns = manifestAtlasCols;
    const layers = manifestTileNames.map((name) => atlas.tileCanvas(name));
    this.atlasTexture = createTextureArray(gl, layers, TILE_PX);
    this.textureUploadError = this.atlasTexture._atlasMeta?.uploadError ?? null;
    this.atlasMs = performance.now() - atlasStart;
    this.atlasMissing = atlas.missing;
    mark('atlas');

    // Breaking overlay.
    this.crackTexture = createTextureFromCanvas(gl, buildCrackTexture(10), { nearest: true });

    // Sky quad: clip-space triangles, 2 floats per vertex.
    this.skyMesh = createDynamicMesh(gl, 6, 2, 2);
    this.skyMesh.attach(this.programs.sky);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyMesh.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

    // Block selection box: the 24 vertices of a unit cube's wireframe.
    this.cubeMesh = createDynamicMesh(gl, CUBE_EDGES.length / 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeMesh.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, CUBE_EDGES, gl.STATIC_DRAW);

    // Breaking overlay: 18 vertices of a unit cube with UVs (5 floats each).
    const crackVerts = [];
    for (let f = 0; f < 6; f++) {
      const quad = CUBE_FACE_QUADS[f];
      for (const tri of [[0, 1, 2], [0, 2, 3]]) {
        for (const i of tri) {
          const v = quad[i];
          crackVerts.push(v[0], v[1], v[2], v[3], v[4]);
        }
      }
    }
    this.crackVertexCount = crackVerts.length / 5;
    this.crackMesh = createDynamicMesh(gl, this.crackVertexCount, 5);
    this.crackMesh.attach(this.programs.crack);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackMesh.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(crackVerts), gl.STATIC_DRAW);
    {
      const aUv = this.programs.crack.a('a_uv');
      if (aUv >= 0) {
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 12);
      }
    }
    gl.bindVertexArray(null);

    // Entity (mob) geometry: dynamic interleaved position/normal/colour boxes.
    this.entityMesh = createDynamicMesh(gl, 16384, 9);
    this.entityVertexCount = 0;
    this.iconMs = performance.now() - iconStart;
    mark('icons');

    /** @type {Map<string, {opaque:object|null, cutout:object|null, generation:number}>} */
    this.sectionMeshes = new Map();

    this.viewMatrix = mat4();
    this.projMatrix = mat4();
    this.viewProj = mat4();
    this.frustum = new Float32Array(24);
    this.renderDistanceBlocks = 128;
    this.fov = 70;
    this.stats = { sections: 0, drawCalls: 0, triangles: 0, culled: 0 };
    /** Set to false only by diagnostics, to isolate frustum culling. */
    this.cullEnabled = true;

    this.skyState = { horizon: [0, 0, 0], zenith: [0, 0, 0], fog: [0, 0, 0], sunDir: [0, 1, 0], daylight: 1 };
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.aspect = width / height;
  }

  /* ---------------- mesh lifecycle ---------------- */

  setSectionMesh(cx, cz, section, result) {
    const key = SECTION_KEY(cx, cz, section);
    const existing = this.sectionMeshes.get(key);
    const gl = this.gl;

    if (existing) {
      existing.opaque?.dispose();
      existing.cutout?.dispose();
      this.sectionMeshes.delete(key);
    }
    if (!result || result.empty) return;

    const opaque = createMesh(gl, result.opaque);
    const cutout = createMesh(gl, result.cutout);
    if (!opaque && !cutout) return;
    this.sectionMeshes.set(key, {
      cx, cz, section,
      origin: [cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE],
      opaque,
      cutout,
      opaqueBounds: result.opaqueBounds ?? null,
      cutoutBounds: result.cutoutBounds ?? null,
    });
  }

  /** A drawn block icon as an <img>-ready canvas, for the inventory grid. */
  iconCanvas(blockId, size = 32) {
    const uv = this.iconAtlas.uvs.get(blockId);
    if (!uv) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const atlas = this.iconAtlas.canvas;
    ctx.drawImage(
      atlas,
      uv[0] * atlas.width, uv[1] * atlas.height,
      (uv[2] - uv[0]) * atlas.width, (uv[3] - uv[1]) * atlas.height,
      0, 0, size, size,
    );
    return canvas;
  }

  clear() {
    for (const entry of this.sectionMeshes.values()) {
      entry.opaque?.dispose();
      entry.cutout?.dispose();
    }
    this.sectionMeshes.clear();
  }

  /* ---------------- sky / camera ---------------- */

  /** World time is in ticks (0..24000, 6000 = noon). */
  updateSky(timeTicks, dayLength = 24000) {
    const t = ((timeTicks % dayLength) + dayLength) % dayLength / dayLength; // 0 = dawn
    const angle = (t - 0.25) * Math.PI * 2;             // noon at t = 0.5
    const sunY = Math.sin(angle + Math.PI / 2);
    const sunX = Math.cos(angle + Math.PI / 2);
    // Daylight ramps in around sunrise and out around sunset.
    const daylight = Math.max(0, Math.min(1, sunY * 2.2 + 0.35));

    const dayT = daylight;
    const horizon = mix3(SKY_NIGHT.horizon, SKY_DAY.horizon, dayT);
    const zenith = mix3(SKY_NIGHT.zenith, SKY_DAY.zenith, dayT);
    const fog = mix3(SKY_NIGHT.fog, SKY_DAY.fog, dayT);

    // Warm the horizon at sunrise/sunset.
    const sunset = Math.max(0, 1 - Math.abs(sunY) * 3);
    horizon[0] = Math.min(1, horizon[0] + sunset * 0.35 * dayT);
    horizon[1] = Math.min(1, horizon[1] + sunset * 0.12 * dayT);
    fog[0] = Math.min(1, fog[0] + sunset * 0.22 * dayT);
    fog[1] = Math.min(1, fog[1] + sunset * 0.06 * dayT);

    this.skyState = {
      horizon, zenith, fog,
      sunDir: [sunX * 0.9, sunY, sunX * 0.4],
      daylight: Math.max(0.08, daylight),
    };
  }

  updateCamera(camera) {
    this.resize();
    const far = Math.max(220, this.renderDistanceBlocks * 1.6);
    const fovRad = (this.fov * Math.PI) / 180;
    mat4Perspective(this.projMatrix, fovRad, this.aspect, 0.05, far);
    mat4ViewFromEuler(this.viewMatrix, camera.x, camera.y, camera.z, camera.yaw, camera.pitch);
    mat4Mul(this.viewProj, this.projMatrix, this.viewMatrix);
    this.cameraPosition = { x: camera.x, y: camera.y, z: camera.z };

    // Keep the camera basis so the sky shader can rebuild view rays.
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
    this.cameraBasis = {
      right: [cy, 0, -sy],
      up: [sy * sp, cp, cy * sp],
      forward: [-sy * cp, sp, -cy * cp],
      tanHalfFov: [Math.tan(fovRad / 2) * this.aspect, Math.tan(fovRad / 2)],
    };
  }

  /* ---------------- rendering ---------------- */

  /**
   * Draws one frame.
   * @param {{x:number, y:number, z:number}} camera eye position, used for
   *   distance culling and for sorting the translucent pass back to front
   */
  render(camera) {
    const gl = this.gl;
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.sections = 0;
    this.stats.culled = 0;

    const fog = this.skyState.fog;
    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.drawSky();

    const chunks = [];
    for (const entry of this.sectionMeshes.values()) {
      const originX = entry.origin[0];
      const originZ = entry.origin[2];
      const d2 = (originX + 8 - camera.x) ** 2 + (originZ + 8 - camera.z) ** 2;
      if (d2 > (this.renderDistanceBlocks + 24) ** 2) { this.stats.culled++; continue; }
      chunks.push({ entry, d2 });
    }
    chunks.sort((a, b) => a.d2 - b.d2);

    const visible = [];
    for (const item of chunks) {
      const e = item.entry;
      const occluded = !this._sectionVisible(e, e.opaqueBounds) && !this._sectionVisible(e, e.cutoutBounds);
      if (occluded) { this.stats.culled++; continue; }
      this.stats.sections++;
      visible.push(e);
    }

    // Pass 1: opaque, then cutout (alpha tested). Solid overrides cutout on
    // depth ties so leaves do not cut holes in the blocks they touch.
    this._drawPass(this.programs.opaque, visible, 'opaque', 1.0, false);
    gl.depthFunc(gl.LEQUAL);
    this._drawPass(this.programs.cutout, visible, 'cutout', 1.0, true);
    gl.depthFunc(gl.LEQUAL);

    // Pass 3: translucent from far to near with blending.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    const sorted = [...visible].sort((a, b) => {
      const ad = (a.origin[0] + 8 - camera.x) ** 2 + (a.origin[2] + 8 - camera.z) ** 2;
      const bd = (b.origin[0] + 8 - camera.x) ** 2 + (b.origin[2] + 8 - camera.z) ** 2;
      return bd - ad;
    });
    this._drawPass(this.programs.translucent, sorted, 'cutout', 0.78, true);
    gl.disable(gl.BLEND);

    return { fog: this.skyState.fog };
  }

  _sectionVisible(entry, bounds) {
    if (!bounds) return false;
    // A section can be reached by either pass, so it is culled only when both
    // its opaque and cutout bounds are off screen. A generous radius keeps this
    // conservative: a wrongly culled section leaves a hole in the world.
    if (this.cullEnabled === false) return true;
    if (this._boundsVisible(entry, entry.opaqueBounds)) return true;
    return this._boundsVisible(entry, entry.cutoutBounds);
  }

  /**
   * Decides whether a section's mesh can be skipped. The rule lives in
   * `sectionVisible` in core/math.js; see the note there on why a frustum-plane
   * test is not used.
   */
  _boundsVisible(entry, bounds) {
    if (!bounds) return false;
    if (this.cullEnabled === false) return true;
    const camera = this.cameraPosition;
    const basis = this.cameraBasis;
    if (!camera || !basis) return true;

    const centreX = entry.origin[0] + (bounds[0] + bounds[3]) / 2;
    const centreY = (bounds[1] + bounds[4]) / 2;
    const centreZ = entry.origin[2] + (bounds[2] + bounds[5]) / 2;
    // Half the section diagonal, so a section straddling a limit is kept.
    const radius = Math.hypot(
      (bounds[3] - bounds[0]) / 2, (bounds[4] - bounds[1]) / 2, (bounds[5] - bounds[2]) / 2,
    );
    return sectionVisible(
      camera, basis.forward, centreX, centreY, centreZ, radius, this.renderDistanceBlocks,
    );
  }

  _drawPass(program, entries, key, alpha, twoSided) {
    const gl = this.gl;
    const drawn = entries.filter((e) => e[key]);
    if (!drawn.length) return;
    program.use();
    const gl2 = gl;
    if (twoSided) gl.disable(gl.CULL_FACE);

    gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
    gl.uniform1i(program.u('u_atlas'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTexture);
    gl.uniform3fv(program.u('u_fogColor'), this.skyState.fog);
    gl.uniform1f(program.u('u_fogNear'), this.renderDistanceBlocks * 0.55);
    gl.uniform1f(program.u('u_fogFar'), this.renderDistanceBlocks * 1.02);
    gl.uniform1f(program.u('u_dayLight'), this.skyState.daylight);
    gl.uniform1f(program.u('u_alpha'), alpha);
    gl.uniform3f(
      program.u('u_cameraPosition'),
      this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z,
    );

    for (const entry of drawn) {
      const mesh = entry[key];
      if (!mesh) continue;
      gl.uniform3f(program.u('u_chunkOrigin'), entry.origin[0], entry.origin[1], entry.origin[2]);
      gl.uniform2f(program.u('u_section'), entry.section * 16, entry.section);
      mesh.attach(program);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
      this.stats.drawCalls++;
      this.stats.triangles += mesh.indexCount / 3;
    }

    if (twoSided) gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);
  }

  drawSky() {
    const gl = this.gl;
    const program = this.programs.sky;
    const basis = this.cameraBasis;
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    program.use();
    gl.uniform3fv(program.u('u_horizon'), this.skyState.horizon);
    gl.uniform3fv(program.u('u_zenith'), this.skyState.zenith);
    gl.uniform3fv(program.u('u_sunDir'), this.skyState.sunDir);
    gl.uniform1f(program.u('u_sunStrength'), this.skyState.daylight > 0.35 ? 0.9 : 0.0);
    if (basis) {
      gl.uniform3fv(program.u('u_camRight'), basis.right);
      gl.uniform3fv(program.u('u_camUp'), basis.up);
      gl.uniform3fv(program.u('u_camForward'), basis.forward);
      gl.uniform2fv(program.u('u_tanHalfFov'), basis.tanHalfFov);
    }
    this.skyMesh.attach(program);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  /** Wireframe box around the targeted block, plus the crack overlay. */
  drawSelection(selection, breakProgress) {
    if (!selection) return;
    const gl = this.gl;
    const program = this.programs.line;
    program.use();
    gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
    gl.uniform4f(program.u('u_color'), 0, 0, 0, 0.55);
    gl.uniform3f(program.u('u_offset'), selection.x, selection.y, selection.z);
    gl.uniform1f(program.u('u_scale'), 1.004);

    this.cubeMesh.attach(program);
    gl.depthFunc(gl.LEQUAL);
    gl.drawArrays(gl.LINES, 0, CUBE_EDGES.length / 3);
    gl.bindVertexArray(null);

    if (breakProgress > 0) {
      const stage = Math.min(9, Math.floor(breakProgress * 10));
      const crack = this.programs.crack;
      crack.use();
      gl.uniformMatrix4fv(crack.u('u_viewProj'), false, this.viewProj);
      gl.uniform3f(crack.u('u_offset'), selection.x, selection.y, selection.z);
      gl.uniform1f(crack.u('u_scale'), 1.002);
      gl.uniform1f(crack.u('u_layer'), stage);
      gl.uniform1i(crack.u('u_crack'), 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.crackTexture);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      this.crackMesh.attach(crack);
      gl.drawArrays(gl.TRIANGLES, 0, this.crackVertexCount);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
    }
  }

  /**
   * Uploads and draws entity boxes.
   * @param {Float32Array} vertices interleaved position(3) normal(3) color(3)
   * @param {number} vertexCount
   * @param {Float32Array|number[]} boxes per box [x,y,z, yaw, sx,sy,sz, first, count, alpha]
   */
  drawEntities(vertices, vertexCount, boxes) {
    if (!vertexCount || !boxes.length) return;
    const gl = this.gl;
    const program = this.programs.entity;
    program.use();
    gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
    gl.uniform3f(program.u('u_lightDir'), 0.4, 1.0, 0.35);
    gl.uniform1f(program.u('u_brightness'), Math.max(0.45, this.skyState.daylight));

    this.entityMesh.upload(vertices, vertexCount);
    this.entityMesh.attach(program);
    // The entity layout is interleaved position(3) normal(3) colour(3).
    {
      const aNormal = program.a('a_normal');
      const aColor = program.a('a_color');
      const stride = 36;
      if (aNormal >= 0) {
        gl.enableVertexAttribArray(aNormal);
        gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 12);
      }
      if (aColor >= 0) {
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 24);
      }
    }

    const model = mat4();
    let blending = false;
    for (let i = 0; i < boxes.length; i += 10) {
      const alpha = boxes[i + 9] ?? 1;
      if (!blending && alpha < 1) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        blending = true;
      }
      gl.uniform1f(program.u('u_alpha'), alpha);
      mat4TRS(model, boxes[i], boxes[i + 1], boxes[i + 2], boxes[i + 3], boxes[i + 4], boxes[i + 5], boxes[i + 6]);
      gl.uniformMatrix4fv(program.u('u_model'), false, model);
      gl.drawArrays(gl.TRIANGLES, boxes[i + 7], boxes[i + 8]);
      this.stats.drawCalls++;
      this.stats.triangles += boxes[i + 8] / 3;
    }
    if (blending) gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /**
   * Draws dropped items as small camera-facing block icons.
   * @param {Array<{x:number,y:number,z:number,blockId:number,bob?:number,age:number}>} items
   * @param {object} camera {x,y,z}
   */
  drawItems(items, camera) {
    if (!items.length || !this.iconRanges.size) return;
    const gl = this.gl;
    const program = this.programs.icon;
    program.use();
    gl.uniformMatrix4fv(program.u('u_viewProj'), false, this.viewProj);
    gl.uniform1i(program.u('u_texture'), 2);
    gl.uniform1f(program.u('u_alpha'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.iconTexture);

    // Icon layout is interleaved position(3) uv(2) shade(1).
    this.iconVaoWired = false;
    const wireIconAttributes = () => {
      if (this.iconVaoWired) return;
      gl.bindVertexArray(this.iconVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.iconBuffer);
      const aPos = program.a('a_position');
      const aUv = program.a('a_uv');
      const aShade = program.a('a_shade');
      if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0); }
      if (aUv >= 0) { gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 24, 12); }
      if (aShade >= 0) { gl.enableVertexAttribArray(aShade); gl.vertexAttribPointer(aShade, 1, gl.FLOAT, false, 24, 20); }
      this.iconVaoWired = true;
    };

    // Billboard basis from the view matrix rows (right and up vectors).
    const v = this.viewMatrix;
    const rightX = v[0], rightY = v[4], rightZ = v[8];
    const upX = v[1], upY = v[5], upZ = v[9];
    const scale = 0.42;

    const model = mat4();
    for (const item of items) {
      const range = this.iconRanges.get(item.blockId);
      if (!range) continue;
      const m = model;
      m[0] = rightX * scale; m[1] = rightY * scale; m[2] = rightZ * scale; m[3] = 0;
      m[4] = upX * scale; m[5] = upY * scale; m[6] = upZ * scale; m[7] = 0;
      // Depth axis: the icon cubes are flat on Z, so move them back slightly.
      m[8] = -rightX * 0.01; m[9] = -rightY * 0.01; m[10] = -rightZ * 0.01; m[11] = 0;
      m[12] = item.x;
      m[13] = item.y + 0.18 + (item.bob ?? 0);
      m[14] = item.z;
      m[15] = 1;
      gl.uniformMatrix4fv(program.u('u_model'), false, m);
      wireIconAttributes();
      gl.bindVertexArray(this.iconVao);
      gl.drawArrays(gl.TRIANGLES, range.first, range.count);
      this.stats.drawCalls++;
      this.stats.triangles += range.count / 3;
    }
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Diagnostics for the visible-section decision of one entry. */
  describeFrustumDecision() {
    const camera = this.cameraPosition ?? { x: 0, y: 0, z: 0 };
    const toWorld = (entry, bounds) => (bounds
      ? [
        entry.origin[0] + bounds[0], bounds[1], entry.origin[2] + bounds[2],
        entry.origin[0] + bounds[3], bounds[4], entry.origin[2] + bounds[5],
      ]
      : null);

    // How many sections each plane rejects on its own. A plane that rejects
    // almost everything while the others reject little is the broken one.
    const perPlane = [0, 0, 0, 0, 0, 0];
    const perPlaneOnly = [0, 0, 0, 0, 0, 0];
    let total = 0;
    let kept = 0;
    const samples = [];

    for (const entry of this.sectionMeshes.values()) {
      const bounds = entry.opaqueBounds ?? entry.cutoutBounds;
      if (!bounds) continue;
      total++;
      const box = toWorld(entry, bounds);
      const rejects = [];
      for (let i = 0; i < 6; i++) {
        const a = this.frustum[i * 4], b = this.frustum[i * 4 + 1];
        const c = this.frustum[i * 4 + 2], d = this.frustum[i * 4 + 3];
        const px = a >= 0 ? box[3] : box[0];
        const py = b >= 0 ? box[4] : box[1];
        const pz = c >= 0 ? box[5] : box[2];
        if (a * px + b * py + c * pz + d < 0) rejects.push(i);
      }
      for (const i of rejects) perPlane[i]++;
      if (rejects.length === 1) perPlaneOnly[rejects[0]]++;
      const visible = this._sectionVisible(entry, entry.opaqueBounds);
      if (visible) kept++;
      // Keep a few examples of sections rejected by exactly one plane.
      if (!visible && rejects.length === 1 && samples.length < 6) {
        samples.push({
          key: `${entry.cx},${entry.cz},${entry.section}`,
          box,
          rejectedBy: ['left', 'right', 'bottom', 'top', 'near', 'far'][rejects[0]],
          distance: +Math.hypot(box[0] + 8 - camera.x, box[2] + 8 - camera.z).toFixed(0),
        });
      }
    }

    return {
      camera,
      total,
      kept,
      cullEnabled: this.cullEnabled !== false,
      planes: [0, 1, 2, 3, 4, 5].map((i) => ({
        name: ['left', 'right', 'bottom', 'top', 'near', 'far'][i],
        values: [...this.frustum.slice(i * 4, i * 4 + 4)].map((v) => +v.toFixed(4)),
      })),
      perPlane: {
        left: perPlane[0], right: perPlane[1], bottom: perPlane[2],
        top: perPlane[3], near: perPlane[4], far: perPlane[5],
      },
      perPlaneExclusive: {
        left: perPlaneOnly[0], right: perPlaneOnly[1], bottom: perPlaneOnly[2],
        top: perPlaneOnly[3], near: perPlaneOnly[4], far: perPlaneOnly[5],
      },
      samples,
    };
  }

  dispose() {
    this.clear();
    for (const program of Object.values(this.programs)) program.dispose();
    this.gl.deleteTexture(this.atlasTexture);
    this.gl.deleteTexture(this.crackTexture);
    this.gl.deleteTexture(this.iconTexture);
  }
}
