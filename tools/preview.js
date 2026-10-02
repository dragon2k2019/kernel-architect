// tools/preview.js — preview production build in dist/
import { serve } from 'bun';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const distDir = resolve(import.meta.dir, '../dist');
const port = Number(process.env.PORT) || 4173;

if (!existsSync(distDir)) {
  console.error("Error: dist/ directory not found. Please run 'bun run build' first.");
  process.exit(1);
}

const server = serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    const filePath = join(distDir, pathname);

    if (!filePath.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return new Response(Bun.file(filePath));
    }

    return new Response('404 Not Found: ' + pathname, { status: 404 });
  },
});

console.log(`\n  🚀 Production preview running at:`);
console.log(`  > Local:   http://localhost:${server.port}/\n`);
