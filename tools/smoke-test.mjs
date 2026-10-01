/**
 * Headless smoke test for the whole game.
 *
 * serves the project over http, loads minecraft.html?test=1 in headless Chrome and
 * reads the PASS/FAIL list the page writes into #test-output. Reading it over
 * the DevTools protocol keeps the page free of any test-only transport.
 *
 * Usage:
 *   node tools/smoke-test.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2] || 8199);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
  const full = join(root, rel);
  return full.startsWith(root.endsWith(sep) ? root : root + sep) ? full : null;
}

const server = createServer(async (req, res) => {
  try {
    let target = safeJoin(ROOT, req.url || '/');
    if (!target) { res.writeHead(403).end('forbidden'); return; }
    let info = await stat(target).catch(() => null);
    if (info?.isDirectory()) {
      target = join(target, 'minecraft.html');
      info = await stat(target).catch(() => null);
    }
    if (!info?.isFile()) { res.writeHead(404).end('not found'); return; }
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
});

/** Minimal DevTools-protocol client over the built-in WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        this.errors.push(details.exception?.description || details.text);
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }
      }, 30000);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('websocket failed')), { once: true });
    });
    return new Cdp(ws);
  }
}

/** Waits for the DevTools port file Chrome writes into its profile directory. */
async function waitForDevToolsPort(profileDir, timeoutMs = 30000) {
  const file = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await readFile(file, 'utf8').catch(() => null);
    if (raw) {
      const [port] = raw.split('\n');
      if (port) return Number(port);
    }
    await delay(150);
  }
  throw new Error('Chrome never wrote DevToolsActivePort');
}

/** First Chrome/Edge binary that exists on this machine. */
async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) return candidate;
  }
  throw new Error(`no Chrome/Edge binary found. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
}

const main = async () => {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${PORT}/minecraft.html?test=1`;
  console.log(`[smoke-test] serving ${ROOT} at http://127.0.0.1:${PORT}/`);
  const binary = await findChrome();
  console.log(`[smoke-test] using ${binary}`);

  const profile = await mkdtemp(join(tmpdir(), 'mc-smoke-'));
  // No --virtual-time-budget: this page does real synchronous work at boot
  // (procedural textures, shader compilation), and a virtual clock can expire
  // mid-boot and freeze the page before the test reports.
  const child = spawn(binary, [
    '--headless=new',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,800',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    url,
  ], { windowsHide: true, stdio: 'ignore' });
  child.on('error', (err) => console.error(`[smoke-test] chrome spawn error: ${err.message}`));

  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 240000);
  let output = null;
  let pageErrors = [];
  try {
    const port = await waitForDevToolsPort(profile);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    // The page was launched directly, so find its target rather than navigating.
    const page = targets.find((t) => t.type === 'page' && t.url.includes('minecraft.html'))
      ?? targets.find((t) => t.type === 'page');
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await delay(1000);
      const probe = await cdp.send('Runtime.evaluate', {
        expression: `document.getElementById('test-output')?.textContent ?? ''`,
        returnByValue: true,
      });
      const text = probe.result.value || '';
      if (text.includes('FAIL frame-content') || (text.includes('PASS frame-content'))) {
        output = text;
        break;
      }
      if (text.includes('FAIL boot')) { output = text; break; }
    }
    pageErrors = cdp.errors ?? [];
    if (pageErrors.length) {
      console.error('[smoke-test] page exceptions:');
      for (const err of pageErrors.slice(0, 5)) console.error(`  ${err.split('\n')[0]}`);
    }
  } catch (err) {
    console.error(`[smoke-test] ${err.message}`);
  }

  try { child.kill(); } catch { /* already gone */ }
  await rm(profile, { recursive: true, force: true }).catch(() => {});

  if (!output) {
    console.error(`[smoke-test] the page did not finish its self-test within ${timeoutMs} ms.`);
    server.close();
    process.exit(1);
  }

  console.log(output.trim());
  server.close();
  process.exit(/FAIL/.test(output) ? 1 : 0);
};

main().catch((err) => {
  console.error('[smoke-test] fatal:', err);
  server.close();
  process.exit(1);
});
