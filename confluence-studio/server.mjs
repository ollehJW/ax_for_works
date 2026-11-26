import { createServer, request as backendRequest } from 'node:http';
import { readFile } from 'node:fs/promises';

const { config } = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
const host = process.env.FRONTEND_HOST || '127.0.0.1';
const port = Number(process.env.FRONTEND_PORT || config.frontend_port);
const backendPort = Number(process.env.BACKEND_PORT || config.backend_port);
const loginUrl = process.env.PLATFORM_LOGIN_URL || 'https://axforwork.wia.co.kr/';
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/studio.css', ['studio.css', 'text/css']],
  ['/connection.js', ['connection.js', 'text/javascript']],
]);

createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy',
    "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  const path = request.url.split('?')[0];
  if (path === '/login' && request.method === 'GET') {
    const destination = new URL('/login', loginUrl);
    destination.searchParams.set('next', '/confluencestudio/');
    const localHost = /^(localhost|127\.0\.0\.1)(?::[0-9]+)?$/.exec(request.headers.host || '');
    if (localHost && ['localhost', '127.0.0.1'].includes(destination.hostname)) {
      destination.hostname = localHost[1];
    }
    response.writeHead(302, { Location: destination.href }).end();
    return;
  }
  const readConnection = path === '/api/connection' && request.method === 'GET';
  const studioPost = request.method === 'POST' && ['/api/connection', '/api/spaces', '/api/pages', '/api/draft', '/api/draft/preview', '/api/draft/publish'].includes(path);
  if (readConnection || studioPost) {
    let body;
    if (request.method === 'POST') {
      const origin = request.headers.origin;
      if (request.headers['x-studio-request'] !== '1' ||
          request.headers['sec-fetch-site'] === 'cross-site' ||
          (origin && !['https://' + request.headers.host, 'http://' + request.headers.host].includes(origin))) {
        response.writeHead(403).end();
        return;
      }
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
        response.writeHead(415).end();
        return;
      }
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of request) {
          size += chunk.length;
          if (size > (path === '/api/draft/publish' ? 48000000 : path === '/api/draft' ? 11500000 : path === '/api/draft/preview' ? 650000 : 12000)) {
            response.writeHead(413).end();
            return;
          }
          chunks.push(chunk);
        }
      } catch {
        response.destroy();
        return;
      }
      body = Buffer.concat(chunks);
    }
    const session = (request.headers.cookie || '').split(';').map(s => s.trim())
      .find(s => s.startsWith('ax_platform_session='));
    const upstream = backendRequest({
      host: '127.0.0.1', port: backendPort, path, method: request.method,
      headers: { Cookie: session || '', 'Content-Type': 'application/json', 'X-Studio-Request': '1' },
      timeout: path === '/api/draft/publish' ? 120000 : path.startsWith('/api/draft') ? 30000 : 12000,
    }, reply => {
      response.writeHead(reply.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      reply.pipe(response);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(503);
      response.end();
    });
    upstream.end(body);
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const asset = assets.get(request.url.split('?')[0]);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL('./frontend/' + asset[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(500).end();
  }
}).listen(port, host, () => console.log('Confluence Studio UI: http://' + host + ':' + port));
