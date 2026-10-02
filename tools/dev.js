// tools/dev.js — fast local dev server using Bun.serve
import { serve } from 'bun';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const rootDir = resolve(import.meta.dir, '..');
const port = Number(process.env.PORT) || 8000;

const server = serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    const filePath = join(rootDir, pathname);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(rootDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return new Response(Bun.file(filePath));
    }

    return new Response('404 Not Found: ' + pathname, { status: 404 });
  },
});

console.log(`\n  🎮 KERNEL ARCHITECT dev server running at:`);
console.log(`  > Local:   http://localhost:${server.port}/\n`);
