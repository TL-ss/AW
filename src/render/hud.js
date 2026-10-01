/**
 * HUD renderer: crosshair, hotbar, hearts, hunger, breath, damage flash and
 * the in-game overlays that are drawn as flat coloured quads.
 *
 * Everything is expressed in CSS pixels with the origin at the top-left corner,
 * using an orthographic projection over the layout size.
 */
import { createDynamicMesh } from './gl.js';
import { mat4Ortho } from '../core/math.js';
import { BLOCKS } from '../world/blocks.js';

const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, a
const ICON_FLOATS_PER_VERTEX = 8; // x, y, u, v, r, g, b, a

/** Human-readable name for a stack, used by the held-item label. */
export function stackDisplayName(blockId) {
  return BLOCKS[blockId]?.display ?? `方块 ${blockId}`;
}

export class Hud {
  /**
   * @param {import('./renderer.js').Renderer} renderer
   * @param {object} options {iconUv: Map<number, number[]>}
   */
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.iconUv = options.iconUv ?? new Map();
    const gl = renderer.gl;
    this.gl = gl;
    this.projection = mat4Ortho(new Float32Array(16), 0, 1, 1, 0, -1, 1);
    // Colour quads: x, y, r, g, b, a.
    this.mesh = createDynamicMesh(gl, 24000, 6);
    // Icon quads: x, y, u, v, r, g, b, a.
    this.iconMesh = createDynamicMesh(gl, 12000, 8);
    this.vertexBuffer = [];
    this.iconVertices = [];
    this.width = 1;
    this.height = 1;
    this.scale = 1;
  }

  /** Recomputes the pixel-space projection. `scale` enlarges the whole HUD. */
  resize(width, height, scale = 1) {
    this.width = width;
    this.height = height;
    this.scale = scale;
    mat4Ortho(this.projection, 0, width, height, 0, -1, 1);
  }

  /* ---------------- primitive builders ---------------- */

  /** Adds one coloured quad in pixel space. */
  rect(x, y, w, h, color) {
    const [r, g, b, a = 1] = color;
    const verts = this.vertexBuffer;
    const x1 = x + w, y1 = y + h;
    const corners = [[x, y], [x1, y], [x1, y1], [x, y1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const c = corners[i];
      verts.push(c[0], c[1], r, g, b, a);
    }
  }

  /** Adds one block icon quad, `uv` being the icon atlas rect. */
  icon(x, y, w, h, uv, tint = [1, 1, 1, 1]) {
    if (!uv) return;
    const [u0, v0, u1, v1] = uv;
    const [r, g, b, a = 1] = tint;
    const verts = this.iconVertices;
    const x1 = x + w, y1 = y + h;
    const corners = [
      [x, y, u0, v0], [x1, y, u1, v0], [x1, y1, u1, v1], [x, y1, u0, v1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const c = corners[i];
      verts.push(c[0], c[1], c[2], c[3], r, g, b, a);
    }
  }

  /** A heart or hunger pip drawn from quads (keeps the HUD texture-free). */
  pip(x, y, size, color, filled, outlineColor) {
    const s = size;
    const [r, g, b] = color;
    // 5x5 pixel-art shape scaled by `size / 5`.
    const shape = [
      [0, 1, 1], [1, 0, 1], [2, 0, 1], [3, 1, 1], [4, 1, 1],
      [0, 2, 1], [1, 2, 1], [2, 2, 1], [3, 2, 1], [4, 2, 1],
      [0, 3, 1], [1, 3, 1], [2, 3, 1], [3, 3, 1], [4, 3, 1],
      [1, 4, 1], [2, 4, 1], [3, 4, 1],
      [2, 5, 1],
    ];
    const unit = s / 5;
    if (!filled) {
      this.rect(x, y, s, s * 1.2, [0, 0, 0, 0.35]);
      return;
    }
    for (const [px, py] of shape) {
      this.rect(x + px * unit, y + py * unit, unit + 0.5, unit + 0.5, [r, g, b, 1]);
    }
    if (outlineColor) {
      this.rect(x, y + unit * 0.9, unit * 5, unit * 0.25, outlineColor);
    }
  }

  /** Converts a discrete value into full/half/empty count for the stat bars. */
  _statPips(value, max, perPip) {
    const full = Math.floor(value / perPip);
    const half = value % perPip > 0 && value < max ? 1 : 0;
    return { full, half, total: Math.ceil(max / perPip) };
  }

  /* ---------------- the HUD itself ---------------- */

  /**
   * @param {object} state
   * @param {import('../game/player.js').Player} state.player
   * @param {import('../game/inventory.js').Inventory} state.inventory
   * @param {boolean} [state.showHotbar]
   * @param {number} [state.damageFlash] 0..1
   * @param {boolean} [state.underwater]
   * @param {string} [state.mode]
   */
  render(state) {
    this.vertexBuffer.length = 0;
    this.iconVertices.length = 0;

    const player = state.player;
    const inv = state.inventory;
    const s = this.scale;
    const w = this.width;
    const h = this.height;

    // --- underwater tint
    if (state.underwater) {
      this.rect(0, 0, w, h, [0.15, 0.35, 0.75, 0.28]);
    }

    // --- damage flash
    if (state.damageFlash > 0) {
      this.rect(0, 0, w, h, [0.7, 0.05, 0.05, Math.min(0.45, state.damageFlash * 0.45)]);
    }

    const showHotbar = state.showHotbar !== false;
    if (showHotbar) this._renderHotbar(inv, s, w, h, state);

    if (state.mode !== 'creative') {
      this._renderStats(player, s, w, h);
    }

    this._flush();
  }

  _renderHotbar(inv, s, w, h, state) {
    const slot = Math.round(22 * s);
    const gap = Math.round(2 * s);
    const totalWidth = slot * 9 + gap * 8;
    const startX = Math.round((w - totalWidth) / 2);
    const y = Math.round(h - slot - 6 * s);

    // Backing plate.
    this.rect(startX - 4 * s, y - 4 * s, totalWidth + 8 * s, slot + 8 * s, [0, 0, 0, 0.45]);

    for (let i = 0; i < 9; i++) {
      const x = startX + i * (slot + gap);
      const selected = i === inv.selected;
      this.rect(x, y, slot, slot, selected ? [1, 1, 1, 0.32] : [0, 0, 0, 0.32]);
      this.rect(x, y, slot, Math.max(1, Math.round(s)), [0, 0, 0, 0.5]);

      const stack = inv.slots[i];
      if (!stack) continue;
      const uv = this.iconUv.get(stack.id);
      if (uv) {
        const pad = Math.round(2.5 * s);
        this.icon(x + pad, y + pad, slot - pad * 2, slot - pad * 2, uv);
      }
      if (stack.count > 1) {
        const countColor = stack.count === 1 ? [1, 1, 1, 1] : [1, 1, 1, 1];
        this._digitBadge(x + slot - Math.round(2 * s), y + slot - Math.round(2 * s), stack.count, s, countColor);
      }
    }

    // Held item name above the hotbar.
    const stack = inv.slots[inv.selected];
    if (stack && state.showHeldName !== false) {
      this._textBadge(stackDisplayName(stack.id), Math.round(w / 2), y - Math.round(18 * s), s, state.heldNameAlpha ?? 1);
    }
  }

  _renderStats(player, s, w, h) {
    const pipSize = Math.round(9 * s);
    const pipGap = Math.round(1 * s);
    const rowY = Math.round(h - 22 * s - 24 * s);
    const heartStart = Math.round(w / 2 - (pipSize * 10 + pipGap * 9) / 2);
    const { full: fullHearts, half: halfHearts } = this._statPips(player.health, 20, 2);

    // Health: 10 hearts, right-to-left from the hotbar centre.
    for (let i = 0; i < 10; i++) {
      const x = heartStart + i * (pipSize + pipGap);
      const filled = i < fullHearts;
      const half = i === fullHearts && halfHearts > 0;
      this.pip(x, rowY, pipSize, [0.85, 0.12, 0.12], filled || half, [0.25, 0.05, 0.05]);
      if (half) {
        this.rect(x, rowY, pipSize / 2, pipSize * 1.2, [0.85, 0.12, 0.12, 0.95]);
      }
    }

    // Hunger: 10 drumsticks mirrored to the right side.
    const foodStart = Math.round(w / 2 + (pipSize * 10 + pipGap * 9) / 2 + 6 * s);
    const { full: fullFood, half: halfFood } = this._statPips(player.hunger, 20, 2);
    for (let i = 0; i < 10; i++) {
      const x = foodStart + i * (pipSize + pipGap);
      const filled = i < fullFood;
      const half = i === fullFood && halfFood > 0;
      this.pip(x, rowY, pipSize, [0.72, 0.45, 0.18], filled || half, [0.3, 0.18, 0.06]);
      if (half) {
        this.rect(x, rowY, pipSize / 2, pipSize * 1.2, [0.72, 0.45, 0.18, 0.95]);
      }
    }

    // Breath bubbles when air is draining.
    if (player.air < 300) {
      const bubbles = Math.ceil((player.air / 300) * 10);
      const bubbleY = rowY - pipSize - 4 * s;
      for (let i = 0; i < bubbles; i++) {
        const x = foodStart + i * (pipSize + pipGap);
        this.rect(x, bubbleY, pipSize, pipSize, [0.55, 0.8, 1, 0.9]);
      }
    }
  }

  /** Draws a small number badge using 3x5 pixel digits (no font needed). */
  _digitBadge(right, bottom, value, s, color) {
    const digits = String(Math.max(0, Math.min(999, Math.floor(value))));
    const digitW = Math.round(3 * s);
    const digitH = Math.round(5 * s);
    const spacing = Math.round(1 * s);
    const totalW = digits.length * digitW + (digits.length - 1) * spacing;
    let x = right - totalW;
    const y = bottom - digitH;
    for (const ch of digits) {
      const pattern = DIGITS[ch];
      if (pattern) {
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 3; col++) {
            if (pattern[row * 3 + col] === '1') {
              this.rect(x + col * s, y + row * s, s + 0.5, s + 0.5, color);
            }
          }
        }
      }
      x += digitW + spacing;
    }
  }

  /** Draws a short label centred at (cx, cy) using the 3x5 digit font. */
  _textBadge(text, cx, cy, s, alpha = 1) {
    const chars = String(text).toUpperCase();
    const charW = Math.round(4 * s);
    const charH = Math.round(5 * s);
    const totalW = chars.length * charW;
    let x = Math.round(cx - totalW / 2);
    const y = Math.round(cy);
    for (const ch of chars) {
      const pattern = GLYPHS[ch];
      if (pattern) {
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 3; col++) {
            if (pattern[row * 3 + col] === '1') {
              this.rect(x + col * s, y + row * s, s + 0.5, s + 0.5, [1, 1, 1, alpha]);
            }
          }
        }
      }
      x += charW;
    }
  }

  _flush() {
    const gl = this.gl;
    const program = this.renderer.programs.hud;
    if (this.vertexBuffer.length) {
      program.use();
      gl.uniformMatrix4fv(program.u('u_projection'), false, this.projection);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.mesh.upload(new Float32Array(this.vertexBuffer), this.vertexBuffer.length / FLOATS_PER_VERTEX);
      const aPos = program.a('a_position');
      const aColor = program.a('a_color');
      this.mesh.attach(program);
      if (aColor >= 0) {
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 24, 8);
      }
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexBuffer.length / FLOATS_PER_VERTEX);
      gl.bindVertexArray(null);
      void aPos;
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }

    if (this.iconVertices.length) {
      const iconProgram = this.renderer.programs.hudIcon;
      iconProgram.use();
      gl.uniformMatrix4fv(iconProgram.u('u_projection'), false, this.projection);
      gl.uniform1i(iconProgram.u('u_texture'), 3);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.renderer.iconTexture);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const count = this.iconVertices.length / ICON_FLOATS_PER_VERTEX;
      this.iconMesh.upload(new Float32Array(this.iconVertices), count);
      const aUv = iconProgram.a('a_uv');
      const aColor = iconProgram.a('a_color');
      // attach() wires the vec3 position; the icon layout has uv+colour after it.
      this.iconMesh.attach(iconProgram);
      const stride = ICON_FLOATS_PER_VERTEX * 4;
      if (aUv >= 0) { gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 8); }
      if (aColor >= 0) { gl.enableVertexAttribArray(aColor); gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 16); }
      gl.drawArrays(gl.TRIANGLES, 0, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.activeTexture(gl.TEXTURE0);
    }
  }
}

/** Digits as 3x5 bitmaps, used for stack counts. */
const DIGITS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111',
  3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
  9: '111101111001111',
};

/** A tiny 3x5 uppercase font for HUD labels. */
const GLYPHS = {
  A: '111101111101101', B: '110101110101110', C: '111100100100111',
  D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '111100101101111', H: '101101111101101', I: '111010010010111',
  J: '001001001101111', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '111101101101111',
  P: '111101111100100', Q: '111101101111011', R: '111101110101101',
  S: '111100111001111', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101111010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
  '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001001001001', '8': '111101111101111',
  '9': '111101111001111', ' ': '000000000000000', ':': '000010000010000',
  '.': '000000000000010', '-': '000000111000000', '/': '001001010100100',
  '(': '001010010010001', ')': '100010010010100', '!': '010010010000010',
  '?': '111001011000010', '+': '000010111010000', '%': '101001010100101',
  ',': '000000000010100', "'": '010010000000000', '*': '101010101000000',
};
