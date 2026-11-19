#!/usr/bin/env node
// Piccolo server per vedere il sito in locale (nessuna dipendenza).
// Serve la cartella public/ come farebbe Firebase Hosting:
//   /                     -> public/index.html
//   /votazioni/<slug>/    -> public/votazioni/<slug>/index.html
//   pagina inesistente    -> public/404.html
//
// Uso: node scripts/anteprima.mjs [porta]   (oppure: npm run anteprima)
// poi apri http://localhost:8080

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBBLICA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORTA = Number(process.argv[2]) || 8080;

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function trovaFile(percorsoUrl) {
  let p = decodeURIComponent(percorsoUrl.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBBLICA, path.normalize(p));
  if (!file.startsWith(PUBBLICA + path.sep)) return null; // niente uscite da public/
  try {
    const info = await fs.stat(file);
    if (info.isDirectory()) return { reindirizza: percorsoUrl.split('?')[0] + '/' };
    return { file };
  } catch {
    return null;
  }
}

http
  .createServer(async (req, res) => {
    const trovato = await trovaFile(req.url);
    if (trovato?.reindirizza) {
      res.writeHead(301, { Location: trovato.reindirizza });
      return res.end();
    }
    const file = trovato?.file ?? path.join(PUBBLICA, '404.html');
    try {
      const contenuto = await fs.readFile(file);
      res.writeHead(trovato ? 200 : 404, { 'Content-Type': TIPI[path.extname(file)] ?? 'application/octet-stream' });
      res.end(contenuto);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Non trovato. Hai eseguito la build (npm run build)?');
    }
  })
  .listen(PORTA, () => console.log(`Anteprima del sito: http://localhost:${PORTA}  (Ctrl+C per fermare)`));
