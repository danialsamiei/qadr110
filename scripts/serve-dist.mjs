import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const distDir = path.resolve(process.cwd(), process.env.DIST_DIR || 'dist');
const predictDistDir = path.resolve(process.cwd(), process.env.PREDICT_DIST_DIR || 'predict/frontend/dist');
const predictBackendUrl = process.env.PREDICT_BACKEND_URL || 'http://127.0.0.1:5101';
const apiDir = path.resolve(process.cwd(), 'api');
const port = Number.parseInt(process.env.PORT || process.argv[2] || '3000', 10);
const host = process.env.HOST || '0.0.0.0';
const localApiModuleCache = new Map();

const LOCAL_EDGE_API_ROUTES = new Map([
  ['/api/ais-snapshot', 'ais-snapshot.js'],
  ['/api/economic/v1/get-macro-signals', 'economic/v1/get-macro-signals.ts'],
  ['/api/infrastructure/v1/list-temporal-anomalies', 'infrastructure/v1/list-temporal-anomalies.ts'],
  ['/api/intelligence/v1/get-risk-scores', 'intelligence/v1/get-risk-scores.ts'],
  ['/api/intelligence/v1/search-gdelt-documents', 'intelligence/v1/search-gdelt-documents.ts'],
  ['/api/intelligence/v1/searchGdeltDocuments', 'intelligence/v1/searchGdeltDocuments.ts'],
  ['/api/market/v1/list-etf-flows', 'market/v1/list-etf-flows.ts'],
  ['/api/market/v1/list-gulf-quotes', 'market/v1/list-gulf-quotes.ts'],
  ['/api/market/v1/list-stablecoin-markets', 'market/v1/list-stablecoin-markets.ts'],
  ['/api/supply-chain/v1/get-chokepoint-status', 'supply-chain/v1/get-chokepoint-status.ts'],
  ['/api/supply-chain/v1/get-shipping-rates', 'supply-chain/v1/get-shipping-rates.ts'],
]);

const LOCAL_EDGE_DYNAMIC_SUFFIXES = [
  '[rpc].ts',
  '[rpc].js',
  '[...path].ts',
  '[...path].js',
  '[[...path]].ts',
  '[[...path]].js',
];

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

function normalizeRoutePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
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

async function writeFetchResponse(req, res, response) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  response.headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });

  if (!response.body || (req.method || 'GET') === 'HEAD') {
    res.end();
    return;
  }

  Readable.fromWeb(response.body)
    .on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Bad Gateway');
    })
    .pipe(res);
}

async function loadLocalApiModule(relativePath) {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const filePath = path.join(apiDir, normalizedPath);
  let cachedModulePromise = localApiModuleCache.get(filePath);
  if (!cachedModulePromise) {
    cachedModulePromise = tsImport(pathToFileURL(filePath).href, import.meta.url);
    localApiModuleCache.set(filePath, cachedModulePromise);
  }
  return cachedModulePromise;
}

function resolveLocalApiModulePath(pathname) {
  const aliasPath = LOCAL_EDGE_API_ROUTES.get(pathname);
  if (aliasPath) return aliasPath;
  if (!pathname.startsWith('/api/')) return null;

  const relativePath = pathname.slice('/api/'.length).replace(/^\/+/, '');
  if (!relativePath) return null;

  const candidatePaths = [
    `${relativePath}.js`,
    `${relativePath}.ts`,
  ];

  const lastSlashIndex = relativePath.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    const parentPath = relativePath.slice(0, lastSlashIndex);
    for (const suffix of LOCAL_EDGE_DYNAMIC_SUFFIXES) {
      candidatePaths.push(`${parentPath}/${suffix}`);
    }
  }

  for (const candidatePath of candidatePaths) {
    if (existsSync(path.join(apiDir, candidatePath))) {
      return candidatePath;
    }
  }

  return null;
}

async function maybeHandleLocalApiRequest(req, res, pathname, url) {
  const modulePath = resolveLocalApiModulePath(pathname);
  if (!modulePath) return false;

  const requestHeaders = copyHeaders(req.headers);
  const requestBody = await readRequestBody(req);
  const protocolHeader = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : req.headers['x-forwarded-proto'];
  const protocol = (protocolHeader || 'https').split(',')[0]?.trim() || 'https';
  const requestUrl = `${protocol}://${req.headers.host || 'localhost'}${pathname}${url.search}`;
  const requestInit = {
    method: req.method || 'GET',
    headers: requestHeaders,
    body: requestBody?.length ? requestBody : undefined,
    duplex: requestBody?.length ? 'half' : undefined,
  };

  try {
    const module = await loadLocalApiModule(modulePath);
    const handler = module?.default;
    if (typeof handler !== 'function') {
      sendNotFound(res, 'API handler is not available');
      return true;
    }

    const response = await handler(new Request(requestUrl, requestInit));
    if (!(response instanceof Response)) {
      throw new TypeError(`API handler ${modulePath} did not return a Response`);
    }

    await writeFetchResponse(req, res, response);
    return true;
  } catch (error) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Local API handler failed',
      path: pathname,
      details: error instanceof Error ? error.message : 'unknown error',
    }));
    return true;
  }
}

function normalizePredictSubpath(pathname) {
  if (pathname === '/predict' || pathname === '/predict/') return '/';
  return pathname.startsWith('/predict/') ? pathname.slice('/predict'.length) || '/' : pathname;
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = safePathname(decodeURIComponent(url.pathname));
  const routePathname = normalizeRoutePath(pathname);
  const predictHostRequest = isPredictHost(req.headers.host);

  try {
    if (!predictHostRequest && (routePathname === '/api' || routePathname.startsWith('/api/'))) {
      const handled = await maybeHandleLocalApiRequest(req, res, routePathname, url);
      if (handled) {
        return;
      }
    }

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
