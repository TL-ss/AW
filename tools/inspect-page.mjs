/**
 * Loads any page in the project in headless Chrome and returns the fully
 * rendered DOM plus the console output, so a diagnostic page can be inspected
 * without a GPU or a visible window.
 *
 * Usage:
 *   node tools/inspect-page.mjs <relative-page-path> [port]
 */
import { createServer } from 'node:http';
import { readFile, stat, rm, mkdtemp } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = process.argv[2] || 'tools/atlas-diagnostic.html';
const PORT = Number(process.argv[3] || 8202);

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
    this.console = [];
    this.errors = [];
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = (message.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
        this.console.push(`${message.params.type}: ${text}`);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const d = message.params.exceptionDetails;
        this.errors.push(d.exception?.description || d.text);
      }
      if (message.method === 'Log.entryAdded') {
        this.console.push(`${message.params.entry.level}: ${message.params.entry.text}`);
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
  const url = `http://127.0.0.1:${PORT}/${PAGE}`;
  const profile = await mkdtemp(join(tmpdir(), 'mc-inspect-'));
  const binary = CHROME_CANDIDATES[0];
  const child = spawn(binary, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--window-size=1400,1000',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let output = '';
  try {
    const port = await waitForPort(profile);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.navigate', { url });
    await delay(Number(process.env.INSPECT_WAIT_MS || 12000));

    const dom = await cdp.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
    });
    output = String(dom.result.value || '');
    if (cdp.errors.length) {
      console.error('[inspect] page exceptions:');
      for (const err of cdp.errors) console.error(`  ${err}`);
    }
    if (cdp.console.length) {
      console.error('[inspect] console:');
      for (const line of cdp.console.slice(0, 40)) console.error(`  ${line}`);
    }
  } finally {
    try { child.kill(); } catch { /* gone */ }
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    server.close();
  }

  // Print just the text content so the output is readable in a terminal.
  const text = output
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((l) => l.trim()).filter((l, i, arr) => l || (arr[i - 1] !== ''))
    .join('\n');
  console.log(text);
};

main().catch((err) => {
  console.error('[inspect] fatal:', err);
  process.exit(1);
});
