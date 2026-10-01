// tools/verify-textures.mjs
//
// General-purpose headless verification harness for this project.
//
// It serves the project folder over http://127.0.0.1:8123 with a small static
// server, launches Chrome headless with --dump-dom against a page inside the
// project, prints the resulting DOM to stdout, and (by default) exits non-zero
// unless the page reports success.
//
// Node built-ins only: node:http, node:fs, node:path, node:child_process, node:url.
//
// Usage:
//   node tools/verify-textures.mjs                       # verify tools/texture-check.html
//   node tools/verify-textures.mjs <page> [options]
// Options:
//   --port <n>            listen port (default 8123)
//   --chrome <path>       chrome executable (default C:\Program Files\Google\Chrome\Application\chrome.exe)
//   --success <marker>    text that must appear in the DOM (default "RESULT: ALL CHECKS PASSED")
//   --no-assert           just print the DOM, never fail on the marker
//   --budget <ms>         --virtual-time-budget (default 8000)
//   --keep-alive          leave the server running (not useful for CI; omit normally)
//
// Known environment limitation: inside the DSH Windows sandbox this script cannot
// run, because Chrome's mojo IPC needs named pipes and both the sandbox and Node's
// piped child_process.spawn refuse them:
//   chrome: FATAL:mojo\public\cpp\platform\platform_channel.cc:112 Check failed (0x5)
//   node:   Error: spawn EPERM
// In that environment, verify with the Canvas-shim fallback instead:
//   node tools/verify-textures-node.mjs
// It runs this same page's script (tools/texture-check.html) against a strict
// Canvas2D/ImageData shim, so the pixel assertions still run for real.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
function takeFlag(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v === undefined ? fallback : v;
}
const hasFlag = (name) => {
  const i = argv.indexOf(name);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
};

const PORT = Number(takeFlag('--port', '8123'));
const CHROME = takeFlag('--chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
const SUCCESS_MARKER = takeFlag('--success', 'RESULT: ALL CHECKS PASSED');
const BUDGET = takeFlag('--budget', '8000');
const NO_ASSERT = hasFlag('--no-assert');
const KEEP_ALIVE = hasFlag('--keep-alive');
const PAGE = (argv[0] || 'tools/texture-check.html').replace(/\\/g, '/').replace(/^\/+/, '');
const PAGE_URL = `http://127.0.0.1:${PORT}/${PAGE}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = decoded === '/' ? 'tools/texture-check.html' : decoded.replace(/^\/+/, '');
  const abs = path.resolve(PROJECT_ROOT, rel);
  if (!abs.startsWith(PROJECT_ROOT)) return null; // no path traversal
  return abs;
}

// --- static server ----------------------------------------------------------

const requestLog = [];
const server = http.createServer((req, res) => {
  const abs = safeResolve(req.url || '/');
  if (!abs) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(abs, (err, buf) => {
    if (err) {
      requestLog.push(`404 ${req.url}`);
      res.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${req.url}`);
      return;
    }
    requestLog.push(`200 ${req.url}`);
    res.writeHead(200, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, '127.0.0.1', resolve);
});

// --- chrome -----------------------------------------------------------------

function runChrome() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CHROME)) {
      reject(new Error(`Chrome not found at ${CHROME} (override with --chrome <path>)`));
      return;
    }
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      `--virtual-time-budget=${BUDGET}`,
      '--dump-dom',
      PAGE_URL,
    ];
    const child = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

let exitCode = 0;
try {
  const { code, stdout, stderr } = await runChrome();
  console.log(`# page: ${PAGE_URL}`);
  console.log(`# chrome exit code: ${code}`);
  console.log(`# requests: ${requestLog.join(', ') || '(none)'}`);
  console.log('# ---- DOM ----');
  console.log(stdout);

  const text = stdout.replace(/<[^>]+>/g, ' ');
  const ok = text.includes(SUCCESS_MARKER);
  if (!ok && !NO_ASSERT) {
    exitCode = 1;
    console.error(`\n# VERIFY FAILED: DOM does not contain ${JSON.stringify(SUCCESS_MARKER)}`);
    const errMatch = stdout.match(/RESULT: ERROR[\s\S]*?<\/pre>/);
    if (errMatch) console.error(`# page error:\n${errMatch[0].replace(/<[^>]+>/g, '')}`);
    if (stderr.trim()) console.error(`# chrome stderr:\n${stderr.trim().split('\n').slice(-20).join('\n')}`);
  } else if (ok) {
    console.log(`\n# VERIFY OK: found ${JSON.stringify(SUCCESS_MARKER)}`);
  }
} catch (err) {
  exitCode = 1;
  console.error(`# harness error: ${err && err.stack ? err.stack : err}`);
} finally {
  if (!KEEP_ALIVE) {
    await new Promise((resolve) => server.close(resolve));
  }
}

process.exit(exitCode);
