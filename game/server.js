// Freeze: a tiny local web server, so the browser allows the camera.
// Browsers only give a page the camera on a secure address, and http://localhost counts as one.
// Run:  node server.js        then open http://localhost:8080
// It only serves the files in this folder, and only to this laptop.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const SERVED = new Set(['.html', '.css', '.js', '.png', '.svg']);

function resolve(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]);
  } catch (e) {
    return null;
  }
  if (p.endsWith('/')) p += 'index.html';
  const full = path.normalize(path.join(ROOT, p));
  if (!full.startsWith(ROOT + path.sep)) return null; // nothing outside this folder
  const rel = path.relative(ROOT, full);
  if (rel.split(path.sep).some((part) => part.startsWith('.') || part === 'node_modules' || part === 'test')) return null;
  if (!SERVED.has(path.extname(full))) return null;
  return full;
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const file = resolve(req.url || '/');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Permissions-Policy': 'camera=(self), microphone=()',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Freeze is running. Open http://localhost:${PORT} in Chrome, Edge, Firefox or Safari.`);
    console.log('Press Ctrl+C to stop.');
  });
}

module.exports = { createServer, resolve };
