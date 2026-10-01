/**
 * Captures a frame from the game for visual inspection.
 *
 * Runs minecraft.html?shot=1 in headless Chrome. That mode streams terrain, renders
 * one frame and stores the pixels as a PNG data URL in #shot-data, which this
 * script decodes and writes to a file. The game renders its own frame because
 * the compositor's screenshot path returns an empty image under software
 * rendering, while gl.readPixels sees the true contents.
 *
 * Usage: node tools/capture-frame.mjs [out.png] [extraQuery] [port]
 */
import { createServer } from 'node:http';
import { readFile, stat, rm, mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, sep, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTFILE = resolve(process.argv[2] || join(ROOT, 'frame.png'));
const EXTRA_QUERY = process.argv[3] || '';
const PORT = Number(process.argv[4] || 8210);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
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

/** Waits for Chrome's DevTools port file. */
async function waitForPort(profileDir, timeoutMs = 30000) {
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
      }, 60000);
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

const main = async () => {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  const query = `shot=1&settle=${process.env.SHOT_SETTLE_S || 12}${EXTRA_QUERY ? `&${EXTRA_QUERY}` : ''}`;
  const url = `http://127.0.0.1:${PORT}/minecraft.html?${query}`;
  console.log(`[capture] ${url}`);

  const binary = CHROME_CANDIDATES.find((candidate) => candidate) ?? '';
  const profile = await mkdtemp(join(tmpdir(), 'mc-shot-'));
  const child = spawn(binary, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--hide-scrollbars', '--window-size=1280,720',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, url,
  ], { windowsHide: true, stdio: 'ignore' });

  let dataUrl = null;
  let note = '';
  try {
    const port = await waitForPort(profile);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page' && t.url.includes('minecraft.html'))
      ?? targets.find((t) => t.type === 'page');
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');

    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      await delay(1000);
      const probe = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          title: document.title,
          error: document.getElementById('loading-text')?.textContent || '',
        })`,
        returnByValue: true,
      });
      const state = JSON.parse(probe.result.value);
      note = state.title;
      if (state.title === 'SHOT-READY') {
        const full = await cdp.send('Runtime.evaluate', {
          expression: `document.getElementById('shot-data').textContent`,
          returnByValue: true,
        });
        dataUrl = full.result.value;
        const info = await cdp.send('Runtime.evaluate', {
          expression: `document.getElementById('shot-info')?.textContent || ''`,
          returnByValue: true,
        });
        console.log(`[capture] ${info.result.value}`);
        break;
      }
      if (state.title === 'BOOT-FAILED') throw new Error(`boot failed: ${state.error}`);
    }
    if (cdp.errors.length) {
      console.error('[capture] page exceptions:');
      for (const err of cdp.errors.slice(0, 4)) console.error(`  ${err.split('\n')[0]}`);
    }
  } finally {
    try { child.kill(); } catch { /* gone */ }
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    server.close();
  }

  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    console.error(`[capture] no frame captured (page state: ${note})`);
    process.exit(1);
  }
  const png = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  await mkdir(dirname(OUTFILE), { recursive: true });
  await writeFile(OUTFILE, png);
  console.log(`[capture] wrote ${OUTFILE} (${png.readUInt32BE(16)}x${png.readUInt32BE(20)}, ${png.length} bytes)`);
};

main().catch((err) => {
  console.error('[capture] fatal:', err.message);
  process.exit(1);
});
