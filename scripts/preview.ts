// Preview without OpenChamber: a small stand-in host that loads the docked
// toolbar and the status section in sandboxed iframes, draws the surface
// picture, and sends pointer, wheel, keyboard and paste to the service the way
// the real host does. `<prefix>/page` shows the full-screen page the same way.
//
//   bun run preview                         # http://127.0.0.1:4790/<random>/
//   bun run preview -- 4790 <tailscale-ip>  # reachable from another device in your tailnet
//
// Everything sits under a random path; without it there is only 404. Never
// binds to 0.0.0.0. Run `bun run build` first.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const port = Number(process.argv[2] ?? 4790);
const hostname = process.argv[3] ?? '127.0.0.1';
if (hostname === '0.0.0.0' || hostname === '::') throw new Error('Refusing to bind to every interface.');
const servicePort = port + 1;
const token = randomBytes(16).toString('hex');
const prefix = `/${randomBytes(12).toString('hex')}`;

// Start it with Node like OpenChamber's server does, when Node is there.
const service = spawn(Bun.which('node') ?? process.execPath, [resolve(root, 'dist/service/main.js')], {
  env: { ...process.env, OPENCHAMBER_SERVICE_PORT: String(servicePort), OPENCHAMBER_SERVICE_TOKEN: token },
  stdio: ['ignore', 'inherit', 'inherit'],
});
process.on('exit', () => service.kill());
process.on('SIGINT', () => process.exit(0));

const shim = `<script>
const P = ${JSON.stringify(prefix)};
const theme = { background:'#151313', elevated:'#1d1b1b', foreground:'#c9c5ba', muted:'#8a857c', subtle:'#2a2727', border:'#2f2c2c',
  hover:'#262323', selection:'#3a3330', focus:'#d98a5a', primary:'#d98a5a', mutedSurface:'#1a1818', elevatedForeground:'#c9c5ba',
  active:'#302c2c', selectionForeground:'#f0ece4', primaryForeground:'#1a1310', primaryText:'#e09a6e', successText:'#7fc28a',
  warningText:'#e3b85c', errorText:'#e57a6e', infoText:'#7fb0e0', success:'#5fa86c', warning:'#d4a03c', error:'#d4604f', info:'#5a90c8',
  font:'-apple-system, system-ui, sans-serif', mono:'ui-monospace, monospace', radius:'8px' };
const envelope = { channel: 'openchamber.sdk', v: 1 };
const frames = [...document.querySelectorAll('iframe')];
const statusFrame = document.getElementById('status');
const log = (text) => { const node = document.getElementById('log'); if (node) node.textContent = new Date().toLocaleTimeString() + '  ' + text; };
addEventListener('message', async (event) => {
  const message = event.data;
  const frame = frames.find((candidate) => candidate.contentWindow === event.source);
  if (!frame || !message || message.channel !== 'openchamber.sdk') return;
  const reply = (body) => frame.contentWindow.postMessage({ ...envelope, type: 'result', id: message.id, ...body }, '*');
  if (message.type === 'hello') {
    frame.contentWindow.postMessage({ ...envelope, type: 'ready', payload: { theme: { mode: 'dark', tokens: theme }, locale: 'de',
      directory: null, session: null, surface: frame.dataset.surface, connection: { connected: false, account: null }, settings: {}, item: null } }, '*');
    return;
  }
  if (message.type === 'resize' && statusFrame && frame === statusFrame) statusFrame.style.height = Math.max(24, Math.min(200, message.payload.height)) + 'px';
  if (!message.id) return;
  if (message.type === 'service-request') {
    const { method, path, body, query } = message.payload;
    const search = query ? '?' + new URLSearchParams(query) : '';
    const response = await fetch(P + '/service' + path + search, { method, body: method === 'GET' ? undefined : body, headers: { 'content-type': 'application/json' } });
    // Like the host: answers are cut at GUEST_REQUEST_RESPONSE_MAX characters.
    const text = (await response.text()).slice(0, 256000);
    if (path !== '/blob' && path !== '/page/frame') log(method + ' ' + path + ' -> ' + response.status);
    reply({ ok: true, payload: { status: response.status, body: text } });
    return;
  }
  if (message.type === 'toast') log('Toast: ' + (message.payload && message.payload.message));
  reply({ ok: true });
});
</script>`;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>iOS Simulator preview</title>
<style>
  html,body{margin:0;height:100%;background:#151313;color:#c9c5ba;font:13px -apple-system,system-ui,sans-serif}
  #wrap{display:flex;flex-direction:column;height:100%;max-width:520px;margin:0 auto;border-left:1px solid #2f2c2c;border-right:1px solid #2f2c2c}
  #dock{display:block;border:0;width:100%;height:44px;border-bottom:1px solid #2f2c2c;flex:none}
  #stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;outline:none}
  #stage img{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;cursor:pointer}
  #statusbox{flex:none;border-top:1px solid #2f2c2c;padding:6px 12px}
  #statusbox .title{font-size:11px;color:#8a857c;margin-bottom:4px}
  #status{display:block;border:0;width:100%;height:56px}
  #log{flex:none;font:11px ui-monospace,monospace;color:#8a857c;padding:4px 8px;border-top:1px solid #2f2c2c;white-space:nowrap;overflow:hidden}
</style></head>
<body><div id="wrap">
  <iframe id="dock" data-surface="panel" sandbox="allow-scripts" src="${prefix}/dist/panel/index.html"></iframe>
  <div id="stage" tabindex="0"><img id="frame" alt="Simulator"></div>
  <div id="log">-</div>
  <div id="statusbox"><div class="title">iOS Simulator &middot; <a href="${prefix}/page" target="_blank" style="color:inherit">Vollbild-Seite</a></div><iframe id="status" data-surface="status" sandbox="allow-scripts" src="${prefix}/dist/status/index.html"></iframe></div>
</div>
${shim}
<script>
// Surface: fetch frames one at a time.
const img = document.getElementById('frame');
let seq = 0, drawn = 0, width = 1, height = 1;
(async function pump() {
  for (;;) {
    try {
      const response = await fetch(P + '/service/surface/frame?after=' + seq + '&wait=25000');
      if (response.status === 200) {
        seq = Number(response.headers.get('x-surface-seq'));
        width = Number(response.headers.get('x-surface-width'));
        height = Number(response.headers.get('x-surface-height'));
        const url = URL.createObjectURL(await response.blob());
        await new Promise((done) => { img.onload = done; img.onerror = done; const old = img.src; img.src = url; if (old) URL.revokeObjectURL(old); });
        drawn = seq;
      }
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
})();

// Input like the host: frame pixels, batched, with the number of the frame on screen.
const mods = (e) => ({ alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
const toFrame = (e) => { const r = img.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * width, y: (e.clientY - r.top) / r.height * height }; };
let queue = [], flushing = false;
const send = (event) => { queue.push(event); if (!flushing) flush(); };
async function flush() {
  flushing = true;
  while (queue.length) {
    const events = queue.splice(0, 256);
    const response = await fetch(P + '/service/surface/input', { method: 'POST', headers: { 'content-type': 'application/json', 'x-surface-frame-seq': String(drawn) }, body: JSON.stringify({ events }) });
    log('input ' + events.map((e) => e.type + (e.action ? ':' + e.action : '')).join(',').slice(0, 120) + ' -> ' + response.status);
  }
  flushing = false;
}
let down = false;
img.addEventListener('pointerdown', (e) => { e.preventDefault(); img.setPointerCapture(e.pointerId); down = true; document.getElementById('stage').focus(); send({ type: 'pointer', action: 'down', ...toFrame(e), button: e.button, buttons: e.buttons, modifiers: mods(e) }); });
img.addEventListener('pointermove', (e) => { if (down) send({ type: 'pointer', action: 'move', ...toFrame(e), button: -1, buttons: e.buttons, modifiers: mods(e) }); });
img.addEventListener('pointerup', (e) => { down = false; send({ type: 'pointer', action: 'up', ...toFrame(e), button: e.button, buttons: e.buttons, modifiers: mods(e) }); });
img.addEventListener('wheel', (e) => { e.preventDefault(); send({ type: 'wheel', ...toFrame(e), deltaX: e.deltaX, deltaY: e.deltaY, modifiers: mods(e) }); }, { passive: false });
const stage = document.getElementById('stage');
stage.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') return; e.preventDefault(); send({ type: 'key', action: 'down', key: e.key, code: e.code, modifiers: mods(e) }); });
stage.addEventListener('keyup', (e) => { e.preventDefault(); send({ type: 'key', action: 'up', key: e.key, code: e.code, modifiers: mods(e) }); });
stage.addEventListener('paste', (e) => { e.preventDefault(); send({ type: 'text', text: e.clipboardData.getData('text/plain') }); });
</script></body></html>`;

const fullPage = `<!doctype html>
<html><head><meta charset="utf-8"><title>iOS Simulator page preview</title>
<style>html,body{margin:0;height:100%;background:#151313}#page{display:block;border:0;width:100%;height:100%}</style></head>
<body><iframe id="page" data-surface="page" sandbox="allow-scripts" src="${prefix}/dist/page/index.html"></iframe>
${shim}
</body></html>`;

Bun.serve({
  port,
  hostname,
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${prefix}/`)) return new Response('Not found', { status: 404 });
    const path = url.pathname.slice(prefix.length);
    if (path === '/') return new Response(page, { headers: { 'content-type': 'text/html' } });
    if (path === '/page') return new Response(fullPage, { headers: { 'content-type': 'text/html' } });
    if (path.startsWith('/service/')) {
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      const seq = request.headers.get('x-surface-frame-seq');
      if (seq) headers['x-surface-frame-seq'] = seq;
      return fetch(`http://127.0.0.1:${servicePort}${path.slice('/service'.length)}${url.search}`, {
        method: request.method,
        headers,
        body: request.method === 'GET' ? undefined : await request.text(),
      });
    }
    if (path.startsWith('/dist/')) {
      const file = Bun.file(resolve(root, `.${path}`));
      if (await file.exists()) return new Response(file);
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(`iOS Simulator preview: http://${hostname}:${port}${prefix}/`);
