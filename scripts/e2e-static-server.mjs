import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

const [portArg, directoryArg = '.'] = process.argv.slice(2);
const port = Number(portArg);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Usage: node scripts/e2e-static-server.mjs <port> [directory]');
}

const root = path.resolve(directoryArg);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function isWithinRoot(candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function resolveFile(requestUrl) {
  const { pathname } = new URL(requestUrl, 'http://127.0.0.1');
  const relativePath = decodeURIComponent(pathname).replace(/^[/\\]+/, '');
  let candidate = path.resolve(root, relativePath || 'index.html');
  if (!isWithinRoot(candidate)) return null;

  const stats = await fs.stat(candidate);
  if (stats.isDirectory()) {
    candidate = path.join(candidate, 'index.html');
    if (!isWithinRoot(candidate)) return null;
  }
  return candidate;
}

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  try {
    const file = await resolveFile(request.url || '/');
    if (!file) {
      response.writeHead(403).end();
      return;
    }
    const stats = await fs.stat(file);
    if (!stats.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Length': stats.size,
      'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 400).end();
  }
});

server.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    server.closeAllConnections?.();
    process.exit(0);
  });
}
