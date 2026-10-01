/**
 * Zero-dependency static file server for the Minecraft clone.
 *
 *   node serve.mjs [port]
 *
 * Serves the project folder over http://127.0.0.1:<port>/ so that ES modules,
 * Web Workers and WebGL work correctly (file:// blocks module + worker loading).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const full = join(root, rel);
  if (!full.startsWith(root.endsWith(sep) ? root : root + sep)) return null;
  return full;
}

const server = createServer(async (req, res) => {
  try {
    let target = safeJoin(ROOT, req.url || '/');
    if (!target) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let info = await stat(target).catch(() => null);
    if (info?.isDirectory()) {
      target = join(target, 'minecraft.html');
      info = await stat(target).catch(() => null);
    }
    if (!info?.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 Not Found: ' + req.url);
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
      // Required for SharedArrayBuffer / high-resolution timers if ever needed.
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'cross-origin-resource-policy': 'same-origin',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('500 ' + String(err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Minecraft clone running at http://127.0.0.1:${PORT}/`);
  console.log('Press Ctrl+C to stop.');
});
