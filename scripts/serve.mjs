// Tiny local server. Web MIDI needs http://localhost (a "secure context").
//   http://localhost:5173/          → Harmonic
//   http://localhost:5173/explorer  → engine review tool
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 5173);
const pages = { '/': 'index.html', '/index.html': 'index.html', '/explorer': 'explorer.html', '/explorer.html': 'explorer.html' };
createServer((req, res) => {
  const file = pages[(req.url ?? '/').split('?')[0]];
  if (!file) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(readFileSync(new URL(`../dist/local/${file}`, import.meta.url)));
}).listen(PORT, '127.0.0.1', () => console.log(`Harmonic running → http://localhost:${PORT}  (Ctrl+C to stop)`));
