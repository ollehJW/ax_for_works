import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const { config } = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
const host = process.env.FRONTEND_HOST || '127.0.0.1';
const port = Number(process.env.FRONTEND_PORT || config.frontend_port);
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
    "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
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
