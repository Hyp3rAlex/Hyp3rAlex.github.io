#!/usr/bin/env node
// Minimal static server for dist/ that behaves like GitHub Pages: directory indexes and 404.html with status 404.
// Used by the end-to-end tests so they do not depend on a dev-tool preview server.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? process.env.PORT ?? 4329);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf', '.ico': 'image/x-icon',
};

async function resolveFile(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, safe);
  if (!file.startsWith(root)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) {
      if (!urlPath.endsWith('/')) return { redirect: urlPath + '/' };
      file = join(file, 'index.html');
      await stat(file);
    }
    return { file };
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const hit = await resolveFile(pathname);
  if (hit?.redirect) {
    res.writeHead(301, { Location: hit.redirect }).end();
    return;
  }
  if (hit?.file) {
    res.writeHead(200, { 'Content-Type': types[extname(hit.file)] ?? 'application/octet-stream' });
    res.end(await readFile(hit.file));
    return;
  }
  const notFound = await readFile(join(root, '404.html')).catch(() => 'Not found');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(notFound);
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}/`));
