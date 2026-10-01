/** Thin WebGL2 helpers. No dependencies. */

/** Compiles a shader and throws with the info log on failure. */
export function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    const numbered = source.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    throw new Error(`[${label}] shader compile failed:\n${log}\n${numbered}`);
  }
  return shader;
}

/** Links a vertex/fragment pair into a program and caches its uniform locations. */
export function createProgram(gl, vertexSource, fragmentSource, label = 'program') {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label}.vert`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}.frag`);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[${label}] link failed: ${log}`);
  }

  const uniforms = new Map();
  const attribs = new Map();
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    uniforms.set(name, gl.getUniformLocation(program, info.name));
  }
  const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < attribCount; i++) {
    const info = gl.getActiveAttrib(program, i);
    if (!info) continue;
    attribs.set(info.name, gl.getAttribLocation(program, info.name));
  }

  return {
    program,
    label,
    /** `u('name')` returns the cached location (null when unused). */
    u: (name) => (uniforms.has(name) ? uniforms.get(name) : null),
    a: (name) => (attribs.has(name) ? attribs.get(name) : -1),
    use: () => gl.useProgram(program),
    dispose: () => gl.deleteProgram(program),
  };
}

/** Creates a VAO + vertex/index buffers for one interleaved mesh part. */
export function createMesh(gl, part) {
  if (!part || part.vertexCount === 0) return null;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);

  const tileBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tileBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, part.tiles, gl.STATIC_DRAW);

  const lightBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, part.lights, gl.STATIC_DRAW);

  const uvBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, part.uvs, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.indices, gl.STATIC_DRAW);

  const upload = (program) => {
    const aPos = program.a('a_position');
    if (aPos >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);
    }
    const aTile = program.a('a_tile');
    if (aTile >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, tileBuffer);
      gl.enableVertexAttribArray(aTile);
      gl.vertexAttribPointer(aTile, 1, gl.FLOAT, false, 4, 0);
    }
    const aUv = program.a('a_uv');
    if (aUv >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.UNSIGNED_BYTE, false, 2, 0);
    }
    const aLight = program.a('a_light');
    if (aLight >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lightBuffer);
      gl.enableVertexAttribArray(aLight);
      gl.vertexAttribPointer(aLight, 1, gl.UNSIGNED_BYTE, true, 1, 0);
    }
    return { aPos, aTile, aUv, aLight, program: program.label };
  };

  /** Diagnostics: prove the attribute arrays are live on this VAO. */
  const verify = () => {
    gl.bindVertexArray(vao);
    const read = (loc) => ({
      enabled: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_ENABLED),
      size: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_SIZE),
      stride: gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
      buffer: !!gl.getVertexAttrib(loc, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),
    });
    const result = { a_position: read(0), a_tile: read(1), a_light: read(2), glError: gl.getError() };
    gl.bindVertexArray(null);
    return result;
  };

  gl.bindVertexArray(null);
  return {
    vao,
    indexBuffer,
    positionBuffer,
    tileBuffer,
    lightBuffer,
    indexCount: part.indexCount,
    vertexCount: part.vertexCount,
    verify,
    /** Binds this mesh and wires the chunk program's attributes for the draw. */
    attach: (program) => {
      gl.bindVertexArray(vao);
      return upload(program);
    },
    dispose: () => {
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(tileBuffer);
      gl.deleteBuffer(lightBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteVertexArray(vao);
    },
  };
}

/**
 * Creates a dynamic vertex buffer plus VAO for simple geometry.
 *
 * `floatsPerVertex` defaults to 3 (a bare position). Callers with a different
 * position width or a wider interleaved layout pass those values here, then
 * set up extra attributes after calling `attach`.
 */
export function createDynamicMesh(gl, maxVertices, floatsPerVertex = 3, positionSize = 3) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, maxVertices * floatsPerVertex * 4, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(null);
  const stride = floatsPerVertex * 4;

  return {
    vao,
    buffer,
    capacity: maxVertices,
    floatsPerVertex,
    stride,
    /**
     * Binds this VAO and wires its first attribute for `program`.
     *
     * Attribute pointers are part of VAO state, so every draw path must
     * (re-)establish its own pointers: two VAOs sharing attribute *locations*
     * otherwise overwrite each other and one of them draws garbage.
     */
    attach: (program) => {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const loc = program.a('a_position');
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, positionSize, gl.FLOAT, false, stride, 0);
      }
      return loc;
    },
    /** Uploads `count` vertices worth of data. */
    upload: (data, count) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * floatsPerVertex);
    },
    /** Uploads raw float data and draws it in one call. */
    draw: (program, data, count, mode = null) => {
      const gl2 = gl;
      gl2.bindBuffer(gl2.ARRAY_BUFFER, buffer);
      gl2.bufferSubData(gl2.ARRAY_BUFFER, 0, data, 0, count * floatsPerVertex);
      gl2.bindVertexArray(vao);
      gl2.drawArrays(mode === null ? gl2.TRIANGLES : mode, 0, count);
    },
  };
}

/**
 * Builds a 2D array texture with one layer per tile, which removes all atlas
 * UV maths (and with it every bleeding and off-by-one failure mode).
 *
 * @param {HTMLCanvasElement[]} layers tile canvases, in tile-id order
 * @returns {WebGLTexture}
 */
export function createTextureArray(gl, layers, layerSize = 16) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  while (gl.getError() !== gl.NO_ERROR) { /* clear earlier errors */ }

  const count = layers.length;
  const data = new Uint8Array(layerSize * layerSize * 4 * count);
  for (let layer = 0; layer < count; layer++) {
    const canvas = layers[layer];
    if (!canvas) continue;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, Math.min(layerSize, canvas.width), Math.min(layerSize, canvas.height));
    const offset = layer * layerSize * layerSize * 4;
    // Copy row by row in case the source is smaller than the layer size.
    for (let y = 0; y < image.height; y++) {
      const srcStart = y * image.width * 4;
      data.set(image.data.subarray(srcStart, srcStart + image.width * 4), offset + y * layerSize * 4);
    }
  }

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage3D(
    gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, layerSize, layerSize, count, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, data,
  );
  const uploadError = gl.getError();
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  texture._atlasMeta = { kind: 'array', layerSize, layers: count, uploadError };
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return texture;
}

/**
 * Uploads a canvas as a 2D texture.
 * `nearest` keeps the crunchy pixel-art look; mipmaps stay off because an
 * unpadded atlas would bleed between tiles at higher mip levels.
 */
export function createTextureFromCanvas(gl, canvas, opts = {}) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY ?? false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const filter = opts.nearest === false ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  texture._atlasMeta = {
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    error: gl.getError(),
  };
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}
