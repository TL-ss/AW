/**
 * Bundler for the standalone build.
 *
 * Why this exists: ES modules and Web Workers are blocked under the `file://`
 * protocol, so the game cannot be opened by double-clicking minecraft.html when it
 * ships as a module graph or uses a Worker. This script flattens the project
 * into two classic scripts — one for the page, one for the world generator —
 * that run from `file://`, from any static host, and from GitHub Pages.
 *
 * How it works: each source file becomes a function receiving a shared
 * namespace `G`. An imported name is read from `G` at its point of use (a lazy
 * namespace read), so module order only matters for code that runs at load
 * time. Exported declarations are assigned onto `G` at the end of the file.
 *
 * Usage:
 *   node tools/build.mjs           # writes minecraft.bundle.js and worldgen.js
 *   node tools/build.mjs --check   # fails if the bundles are stale
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Chunk generation + meshing, shared by both bundles. */
export const WORLD_CORE = [
  'src/core/math.js',
  'src/world/blocks-worker.js',
  'src/world/tile-manifest.js',
  'src/world/constants.js',
  'src/world/noise.js',
  'src/world/chunk-worker.js',
];

/** Everything the page needs, in dependency order. */
export const MAIN_FILES = [
  'src/core/math.js',
  // World constants, block registry and the tile manifest come first: the
  // renderer reads them while its own module body evaluates.
  'src/world/blocks-worker.js',
  'src/world/tile-manifest.js',
  'src/world/constants.js',
  'src/world/noise.js',
  'src/world/blocks.js',
  'src/world/chunk-worker.js',
  'src/render/textures.js',
  'src/render/atlas.js',
  'src/render/icons.js',
  'src/render/shaders.js',
  'src/render/gl.js',
  'src/render/renderer.js',
  'src/render/hud.js',
  'src/audio/sfx.js',
  'src/world/world.js',
  'src/game/input.js',
  'src/game/inventory.js',
  'src/game/mobs.js',
  'src/game/player.js',
  'src/game/interaction.js',
  'src/game/main.js',
];

/** Resolves an import specifier relative to the importing file. */
function resolveSpecifier(fromFile, spec) {
  const out = fromFile.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * Rewrites one module's ESM source as a classic-script body.
 *
 * @param {string} file   relative path, for error messages
 * @param {string} source file contents (BOM already stripped)
 * @param {(spec: string) => Promise<string>} read  reads a sibling file
 * @returns {Promise<{code: string, imports: string[], exports: {name: string, value: string}[]}>}
 */
async function convertModule(file, source, read) {
  let code = source;
  /** local name -> exported name it should be read from on G */
  const imports = new Map();
  const exports = [];

  // `export default <expr>` -> a named local, so it can be published normally.
  code = code.replace(/^export\s+default\s+/gm, () => {
    exports.push({ name: 'default', value: '__default' });
    return 'const __default = ';
  });

  // JSON imports become inlined literals: JSON modules need import attributes
  // that are not portable, and the manifest is generated anyway.
  const jsonImports = [...code.matchAll(
    /import\s+(\w+)\s+from\s+['"]([^'"]+\.json)['"]\s*(?:with\s*\{[^}]*\})?;?/g,
  )];
  const prelude = [];
  for (const match of jsonImports) {
    const raw = (await read(resolveSpecifier(file, match[2]))).replace(/^\uFEFF/, '');
    prelude.push(`const ${match[1]} = ${raw.trim()};`);
  }
  code = code.replace(
    /import\s+(\w+)\s+from\s+['"]([^'"]+\.json)['"]\s*(?:with\s*\{[^}]*\})?;?/g,
    '',
  );

  if (/import\s*\*\s*as\s/.test(code)) {
    throw new Error(`${file}: namespace imports are not supported by this bundler`);
  }

  // Named / aliased imports.
  code = code.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"];?/g, (match, names) => {
    for (const raw of names.split(',')) {
      const entry = raw.trim();
      if (!entry || entry.startsWith('//')) continue;
      const [exported, alias] = entry.split(/\s+as\s+/).map((part) => part.trim());
      imports.set(alias || exported, exported);
    }
    return '';
  });

  // Default JS imports.
  code = code.replace(/import\s+(\w+)\s+from\s*['"][^'"]+['"];?/g, (match, name) => {
    imports.set(name, 'default');
    return '';
  });

  if (/^\s*import\s/m.test(code)) {
    const line = code.split('\n').find((candidate) => /^\s*import\s/.test(candidate));
    throw new Error(`${file}: unconverted import remains: ${line.trim()}`);
  }

  // Exported declarations: drop the keyword and record the name.
  const record = (name) => exports.push({ name, value: name });
  code = code.replace(/^export\s+(?:async\s+)?(?:function|class)\s+(\w+)/gm, (match, name) => {
    record(name);
    return match.replace(/^export\s+/, '');
  });
  code = code.replace(/^export\s+(?:const|let|var)\s+(\w+)/gm, (match, name) => {
    record(name);
    return match.replace(/^export\s+/, '');
  });
  /**
   * Names this file declares at the top level. Computed after the `export`
   * keywords are stripped (above) but before import substitution, because
   * `isOpaque` in blocks.js (a local helper) must not be rewritten into a read
   * of the same-named export.
   */
  const declaredHere = new Set(
    [...code.matchAll(/^(?:const|let|var|function|class)\s+(\w+)/gm)].map((m) => m[1]),
  );

  /**
   * A bare `export { a, b }` is usually a re-export of an imported binding, so
   * it forwards from G. If the file also declares `a`, the declaration wins.
   */
  code = code.replace(/^export\s*\{([^}]*)\};?/gm, (match, names) => {
    for (const raw of names.split(',')) {
      const entry = raw.trim();
      if (!entry) continue;
      const [local, exported] = entry.split(/\s+as\s+/).map((part) => part.trim());
      const name = exported || local;
      if (exports.some((existing) => existing.name === name)) continue;
      if (imports.has(local) && !declaredHere.has(local)) {
        exports.push({ name, value: `G[${JSON.stringify(imports.get(local))}]` });
      } else {
        exports.push({ name, value: local });
      }
    }
    return '';
  });

  const leftover = code.split('\n').find((line) => /^\s*export\s/.test(line));
  if (leftover) {
    throw new Error(`${file}: unconverted export remains: ${leftover.trim()}`);
  }

  /**
   * Imported names are read lazily: each reference becomes a read of G.
   * A tiny scanner is used rather than a regex, because building an
   * identifier-boundary regex from a name is error-prone to escape.
   */
  for (const [local, exported] of imports) {
    if (declaredHere.has(local)) continue;
    code = replaceIdentifier(code, local, `G[${JSON.stringify(exported)}]`);
  }

  return { code, prelude, imports: [...imports.keys()], exports };
}

const IDENTIFIER_CHAR = /[\w$]/;

/**
 * Replaces every standalone occurrence of `name`.
 *
 * A reference is skipped only when it is a member access (`obj.name`) or part
 * of a longer word. A dot directly before the name is not enough on its own:
 * `[...BLOCKS]` also has one, and that reference must be rewritten.
 *
 * @param {string} source
 * @param {string} name
 * @param {string} replacement
 */
function replaceIdentifier(source, name, replacement) {
  let out = '';
  let index = 0;
  for (;;) {
    const at = source.indexOf(name, index);
    if (at < 0) {
      out += source.slice(index);
      return out;
    }
    const before = at > 0 ? source[at - 1] : '';
    const beforeBefore = at > 1 ? source[at - 2] : '';
    const after = source[at + name.length] ?? '';
    // `obj.name`: a dot that itself follows a word character.
    const isMemberAccess = before === '.' && beforeBefore !== '' && IDENTIFIER_CHAR.test(beforeBefore);
    const isPartOfWord = before !== '' && IDENTIFIER_CHAR.test(before);
    const isLongerWord = after !== '' && IDENTIFIER_CHAR.test(after);
    const isStandalone = !isMemberAccess && !isPartOfWord && !isLongerWord;
    out += source.slice(index, at);
    out += isStandalone ? replacement : name;
    index = at + name.length;
  }
}

/**
 * Concatenates source files into one classic script.
 *
 * @param {string[]} files dependency-ordered relative paths
 * @param {{header: string, banner: string, footer?: string}} options
 */
async function bundle(files, { header, banner, footer = '' }) {
  const chunks = [header, banner];
  const read = (path) => readFile(join(ROOT, path), 'utf8');

  for (const file of files) {
    // Normalise to LF and drop any BOM. Every regex below is line-anchored, and
    // a stray CR before the newline makes `^` fail to match the next line.
    const source = (await read(file)).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const converted = await convertModule(file, source, read);
    if (process.env.BUILD_DEBUG && /game\/main\.js$/.test(file)) {
      console.error(`[build-debug] declaredHere=${JSON.stringify(converted.debug.declaredHere)}`);
      console.error(`[build-debug] hasCREATIVE=${converted.debug.declaredHere.includes('CREATIVE_BLOCKS')}`);
    }
    const assignments = converted.exports.map(
      (entry) => `G[${JSON.stringify(entry.name)}] = ${entry.value};`,
    );

    chunks.push([
      `/* ${'-'.repeat(4)} ${file} ${'-'.repeat(Math.max(2, 68 - file.length))} */`,
      '(function (G) {',
      ...converted.prelude.map((line) => `  ${line}`),
      converted.code.replace(/^(?=.)/gm, '  '),
      ...assignments.map((line) => `  ${line}`),
      '})(__mc);',
      '',
    ].join('\n'));
  }

  chunks.push(footer);
  return chunks.join('\n');
}

/** Builds both bundles and returns their contents. */
async function generate() {
  const generatedHeader = `/**
 * GENERATED FILE - do not edit by hand.
 * Produced by tools/build.mjs from the modules listed there.
 */
`;

  const main = await bundle(MAIN_FILES, {
    header: generatedHeader,
    banner: '/* Standalone bundle: runs from file:// and from GitHub Pages. */\n'
      + 'window.__mc = window.__mc || {};\n'
      + 'var __mc = window.__mc;\n',
    footer: '\nwindow.__mc = __mc;\n',
  });

  // The worker variant is self-contained so it can be shipped as a classic
  // worker script; the page does not use it, but keeping it makes the
  // main-thread path easy to swap back later.
  const worker = await bundle(WORLD_CORE, {
    header: generatedHeader,
    banner: '/* World generator + mesher. */\n'
      + 'var __mc = (typeof self !== \'undefined\' && !self.document) ? self : window;\n'
      + '__mc.__worldgen = __mc.__worldgen || {};\n'
      + '__mc = __mc.__worldgen;\n',
    footer: '\n',
  });

  return { main, worker };
}

async function build() {
  const { main, worker } = await generate();
  await writeFile(join(ROOT, 'minecraft.bundle.js'), main);
  await writeFile(join(ROOT, 'worldgen.js'), worker);
  return { main, worker };
}

const isEntryPoint = process.argv[1] && process.argv[1].endsWith('build.mjs');
if (isEntryPoint) {
  if (process.argv.includes('--check')) {
    const { main, worker } = await generate();
    let stale = 0;
    for (const [name, expected] of [['minecraft.bundle.js', main], ['worldgen.js', worker]]) {
      const actual = await readFile(join(ROOT, name), 'utf8').catch(() => null);
      const upToDate = actual === expected;
      console.log(`${upToDate ? 'up-to-date' : 'STALE     '} ${name}`);
      if (!upToDate) stale++;
    }
    process.exit(stale ? 1 : 0);
  } else {
    const { main, worker } = await build();
    console.log(`minecraft.bundle.js ${(main.length / 1024).toFixed(1)} KB`);
    console.log(`worldgen.js ${(worker.length / 1024).toFixed(1)} KB`);
  }
}
