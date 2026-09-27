// Tiny local server for the MIDI-enabled app. Web MIDI needs http://localhost (a "secure context").
// Usage: npm start   → open http://localhost:5173 in Chrome.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 5173);
createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(readFileSync(new URL('../dist/local/index.html', import.meta.url)));
}).listen(PORT, '127.0.0.1', () => console.log(`Harmonic running → http://localhost:${PORT}  (Ctrl+C to stop)`));
