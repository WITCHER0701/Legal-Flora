// Local preview for the Vercel static pages and API. Binds to loopback only.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.LEGALFLORA_PREVIEW_PORT || 8766);

for (const line of require('node:fs').readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const entry = /^([A-Z_]+)=(.*)$/.exec(line);
  if (entry && !process.env[entry[1]]) process.env[entry[1]] = entry[2];
}

const api = require('../api/index');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const aliases = new Map([
  ['/', '/index.html'], ['/admin', '/admin.html'],
  ['/privacy', '/privacy.html'], ...['services', 'funding', 'incubation', 'approach', 'process', 'contact']
    .map(name => ['/' + name, '/' + name + '.html'])
]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 16384) {
            res.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: 'Request too large' }));
            return;
          }
        }
        try { req.body = JSON.parse(raw); }
        catch {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
      }
      req.query = Object.fromEntries(url.searchParams);
      req.query.route = url.pathname.slice('/api/'.length);
      await api(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405); res.end(); return;
    }
    if (url.pathname === '/about' || url.pathname === '/index') {
      res.writeHead(308, { Location: '/' + url.search, 'Cache-Control': 'no-store' }); res.end(); return;
    }
    const oldPage = /^\/(index|services|funding|incubation|approach|process|contact|admin|privacy)\.html$/.exec(url.pathname);
    if (oldPage) {
      res.writeHead(308, { Location: (oldPage[1] === 'index' ? '/' : '/' + oldPage[1]) + url.search,
        'Cache-Control': 'no-store' }); res.end(); return;
    }
    const requested = aliases.get(url.pathname) || decodeURIComponent(url.pathname);
    const file = path.resolve(dist, '.' + requested);
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return; }
    let data;
    try { data = await fs.readFile(file); }
    catch { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error('Preview request failed', error.name || 'error');
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Legal Flora preview: http://127.0.0.1:${port}/`));
