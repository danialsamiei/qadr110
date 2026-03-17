import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const distDir = path.resolve(process.cwd(), process.env.DIST_DIR || 'dist');
const predictDistDir = path.resolve(process.cwd(), process.env.PREDICT_DIST_DIR || 'predict/frontend/dist');
const predictBackendUrl = process.env.PREDICT_BACKEND_URL || 'http://127.0.0.1:5101';
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

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function safePathname(rawPathname) {
  const normalized = path.posix.normalize(rawPathname);
  if (!normalized.startsWith('/')) return '/';
  if (normalized.includes('..')) return '/';
  return normalized;
}

function isPredictHost(hostHeader) {
  const hostName = (hostHeader || '').split(':')[0].toLowerCase();
  return hostName === 'predict.alefba.dev';
}

function shouldFallbackToIndex(cleanPath) {
  return !path.posix.extname(cleanPath) || cleanPath.endsWith('/');
}

function resolveSpaFile(baseDir, rawPathname, options = {}) {
  const cleanPath = safePathname(rawPathname);
  const explicitPath = cleanPath.endsWith('/')
    ? `${cleanPath}index.html`
    : cleanPath;

  const directFile = path.join(baseDir, explicitPath.slice(1));
  if (existsSync(directFile) && statSync(directFile).isFile()) {
    return directFile;
  }

  if (options.enableProFallback && (cleanPath === '/pro' || cleanPath.startsWith('/pro/'))) {
    return path.join(baseDir, 'pro', 'index.html');
  }

  if (options.spaFallback && shouldFallbackToIndex(cleanPath)) {
    const indexFile = path.join(baseDir, 'index.html');
    if (existsSync(indexFile)) {
      return indexFile;
    }
  }

  return null;
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

function sendNotFound(res, message = 'Not Found') {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function sendStaticFile(req, res, filePath) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    sendNotFound(res);
    return;
  }

  const extname = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mimeTypes[extname] || 'application/octet-stream');
  setCacheHeaders(res, extname);

  if ((req.method || 'GET') === 'HEAD') {
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
}

async function readRequestBody(req) {
  if ((req.method || 'GET') === 'GET' || (req.method || 'GET') === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function copyHeaders(sourceHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(sourceHeaders)) {
    if (value == null || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

async function proxyRequest(req, res, upstreamUrl) {
  const upstreamHeaders = copyHeaders(req.headers);
  upstreamHeaders.set('x-forwarded-host', req.headers.host || '');
  upstreamHeaders.set('x-forwarded-proto', 'https');
  upstreamHeaders.set('x-forwarded-for', req.socket.remoteAddress || '');

  const body = await readRequestBody(req);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method || 'GET',
    headers: upstreamHeaders,
    body,
    duplex: body ? 'half' : undefined,
    redirect: 'manual',
  });

  res.statusCode = upstreamResponse.status;
  res.statusMessage = upstreamResponse.statusText;
  upstreamResponse.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });

  if (!upstreamResponse.body || (req.method || 'GET') === 'HEAD') {
    res.end();
    return;
  }

  Readable.fromWeb(upstreamResponse.body)
    .on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Bad Gateway');
    })
    .pipe(res);
}

function normalizePredictSubpath(pathname) {
  if (pathname === '/predict' || pathname === '/predict/') return '/';
  return pathname.startsWith('/predict/') ? pathname.slice('/predict'.length) || '/' : pathname;
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = safePathname(decodeURIComponent(url.pathname));
  const predictHostRequest = isPredictHost(req.headers.host);

  try {
    if (predictHostRequest) {
      if (pathname === '/health') {
        await proxyRequest(req, res, `${predictBackendUrl}/health${url.search}`);
        return;
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        await proxyRequest(req, res, `${predictBackendUrl}${pathname}${url.search}`);
        return;
      }
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }
      if (!existsSync(predictDistDir)) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Predict frontend build is not available');
        return;
      }
      sendStaticFile(req, res, resolveSpaFile(predictDistDir, pathname, { spaFallback: true }));
      return;
    }

    if (pathname === '/predict') {
      res.writeHead(308, { Location: '/predict/' });
      res.end();
      return;
    }

    if (pathname === '/predict/health') {
      await proxyRequest(req, res, `${predictBackendUrl}/health${url.search}`);
      return;
    }

    if (pathname === '/predict/api' || pathname.startsWith('/predict/api/')) {
      const backendPath = pathname.replace(/^\/predict/, '') || '/api';
      await proxyRequest(req, res, `${predictBackendUrl}${backendPath}${url.search}`);
      return;
    }

    if (pathname === '/predict/' || pathname.startsWith('/predict/')) {
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
      }
      if (!existsSync(predictDistDir)) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Predict frontend build is not available');
        return;
      }
      sendStaticFile(
        req,
        res,
        resolveSpaFile(predictDistDir, normalizePredictSubpath(pathname), { spaFallback: true }),
      );
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    sendStaticFile(req, res, resolveSpaFile(distDir, pathname, { spaFallback: true, enableProFallback: true }));
  } catch (error) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Upstream error: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    `Serving QADR dist from ${distDir} and Predict dist from ${predictDistDir} on http://${host}:${port}\n`,
  );
});
