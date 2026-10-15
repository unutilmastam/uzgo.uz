// Serves the web export of the app (dist-web) and proxies /api to the API, so
// the preview is same-origin like production (ADR 0007). Test tooling only.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist-web');
const port = Number(process.env.PORT ?? 8090);
const api = new URL(process.env.API_TARGET ?? 'http://localhost:4100');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://preview');
  if (url.pathname.startsWith('/api/')) {
    const upstream = request(
      {
        hostname: api.hostname,
        port: api.port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502).end();
    });
    req.pipe(upstream);
    return;
  }
  const path = normalize(join(root, decodeURIComponent(url.pathname)));
  const file =
    path.startsWith(root) && existsSync(path) && statSync(path).isFile()
      ? path
      : join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port);
