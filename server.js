import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { searchOptions, searchMarktplaats, SourceError } from './lib.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
]);
export function createServer(search = searchMarktplaats) {
  const cache = new Map();
  let lastRequest = 0;
  let pending = false;
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://*.marktplaats.nl https://*.marktplaats.com https://*.mpcdn.net; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return send(403, { error: 'Alleen lokale toegang toegestaan.' });
    if (req.method !== 'GET') return send(405, { error: 'Alleen GET is toegestaan.' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return send(200, { status: 'ok' });
    if (url.pathname === '/api/search') {
      try {
        const options = searchOptions(url.searchParams);
        const key = JSON.stringify(options);
        const cached = cache.get(key);
        if (cached && Date.now() - cached.time < 120000) return send(200, { ...cached.data, cached: true });
        if (pending || Date.now() - lastRequest < 5000) return send(429, { error: 'Wacht vijf seconden voordat je opnieuw zoekt.' });
        lastRequest = Date.now();
        pending = true;
        try {
          const data = await search(options);
          if (cache.size >= 100) cache.delete(cache.keys().next().value);
          cache.set(key, { data, time: Date.now() });
          return send(200, data);
        } finally { pending = false; }
      } catch (error) { return send(error instanceof SourceError ? error.status : 502, { error: error.message || 'Zoeken mislukt.' }); }
    }
    const asset = assets.get(url.pathname);
    if (!asset) return send(404, { error: 'Niet gevonden.' });
    try {
      const body = await readFile(fileURLToPath(new URL(`./public/${asset[0]}`, import.meta.url)));
      res.writeHead(200, { 'Content-Type': asset[1] });
      res.end(body);
    } catch { send(500, { error: 'Bestand kon niet worden geladen.' }); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, '127.0.0.1', () => console.log(`KoopjesJagertje draait op http://localhost:${port} — stop met Ctrl+C`));
}
