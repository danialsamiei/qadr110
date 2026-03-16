import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), process.env.DIST_DIR || 'dist');
const port = Number.parseInt(process.env.PORT || process.argv[2] || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function safePathname(rawPathname) {
  const normalized = path.posix.normalize(rawPathname);
  if (!normalized.startsWith('/')) return '/';
  if (normalized.includes('..')) return '/';
  return normalized;
}

function resolveFile(pathname) {
  const cleanPath = safePathname(pathname);
  const explicitPath = cleanPath.endsWith('/')
    ? `${cleanPath}index.html`
    : cleanPath;

  const directFile = path.join(distDir, explicitPath.slice(1));
  if (existsSync(directFile) && statSync(directFile).isFile()) {
    return directFile;
  }

  if (cleanPath === '/pro' || cleanPath.startsWith('/pro/')) {
    return path.join(distDir, 'pro', 'index.html');
  }

  return path.join(distDir, 'index.html');
}

function setCacheHeaders(res, extname) {
  if (extname === '.html' || extname === '.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return;
  }

  if (['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2'].includes(extname)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
}

const server = http.createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const filePath = resolveFile(decodeURIComponent(url.pathname));

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const extname = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mimeTypes[extname] || 'application/octet-stream');
  setCacheHeaders(res, extname);

  if (method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return;
  }

  createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal Server Error');
    })
    .pipe(res);
});

server.listen(port, host, () => {
  process.stdout.write(`Serving ${distDir} on http://${host}:${port}\n`);
});
