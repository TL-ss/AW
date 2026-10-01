/**
 * Verifies the standalone bundle works from the `file://` protocol, with no
 * server involved — the exact case of double-clicking minecraft.html.
 *
 * It drives headless Chrome over the DevTools protocol, loads minecraft.html from
 * disk, and reports the page title, the loading text, and any JS exceptions,
 * then checks that the game actually built a world.
 *
 * Usage: node tools/check-file-protocol.mjs [timeoutMs]
 */
import { rm, mkdtemp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE = pathToFileURL(join(ROOT, 'minecraft.html')).href;
const TIMEOUT = Number(process.argv[2] || 45000);

const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
].find((candidate) => candidate);

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.errors = [];
    this.console = [];
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        this.errors.push(details.exception?.description || details.text);
      }
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = (message.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
        this.console.push(`${message.params.type}: ${text}`);
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

async function waitForPort(profileDir, timeoutMs = 30000) {
  const file = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(file, 'utf8')).catch(() => null);
    if (raw) {
      const [port] = raw.split('\n');
      if (port) return Number(port);
    }
    await delay(150);
  }
  throw new Error('Chrome never wrote DevToolsActivePort');
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const main = async () => {
  console.log(`[file://] loading ${PAGE}`);
  const profile = await mkdtemp(join(tmpdir(), 'mc-file-'));
  const child = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--window-size=1024,640',
    '--allow-file-access-from-files',
    '--remote-debugging-port=0', '--remote-allow-origins=*',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    const port = await waitForPort(profile);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: PAGE });

    // Give the game time to boot, generate terrain and render.
    const deadline = Date.now() + TIMEOUT;
    let state = null;
    while (Date.now() < deadline) {
      await delay(1000);
      const probe = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify({
          title: document.title,
          loadingHidden: document.getElementById('loading')?.classList.contains('hidden') ?? null,
          loadingText: document.getElementById('loading-text')?.textContent ?? null,
          running: !!(window.game && window.game.running),
          chunks: window.game?.world?.chunks?.size ?? -1,
          meshed: window.game?.world?.stats?.meshed ?? -1,
          sections: window.game?.renderer?.stats?.sections ?? -1,
          playerY: window.game?.player ? +window.game.player.y.toFixed(1) : null,
          scripts: document.scripts.length,
        })`,
        returnByValue: true,
      });
      state = JSON.parse(probe.result.value);
      if (state.running && state.chunks > 8) break;
      if (state.title === 'BOOT-FAILED') break;
    }

    console.log(`[file://] page state: ${JSON.stringify(state)}`);
    check('no page exceptions', cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | '));
    check('booted from file://', state?.running === true, `title=${state?.title}`);
    check('world generated', (state?.chunks ?? 0) > 8, `${state?.chunks} chunks`);
    check('sections meshed', (state?.meshed ?? 0) > 8, `${state?.meshed} meshes`);
    check('something rendered', (state?.sections ?? 0) > 0, `${state?.sections} sections drawn`);
    check('player placed on terrain', state?.playerY !== null && state.playerY > 0, `y=${state?.playerY}`);
    check('loading screen dismissed', state?.loadingHidden === true, `text="${state?.loadingText}"`);
    if (cdp.console.length) {
      console.log('[file://] console output:');
      for (const line of cdp.console.slice(0, 12)) console.log(`  ${line}`);
    }
  } finally {
    try { child.kill(); } catch { /* gone */ }
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  console.log(failures.length ? `RESULT: FAIL (${failures.join(', ')})` : 'RESULT: OK');
  process.exit(failures.length ? 1 : 0);
};

main().catch((err) => {
  console.error('[file://] fatal:', err);
  process.exit(1);
});
