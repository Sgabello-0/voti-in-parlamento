// Interrogazione degli endpoint SPARQL ufficiali, con:
//  - cache su disco in data/raw (la stessa query non viene rifatta);
//  - richieste lente: almeno PAUSA_MS millisecondi tra una richiesta e l'altra;
//  - pochi tentativi in caso di errore temporaneo del server (5xx o rete).

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const USER_AGENT = 'voti-in-parlamento/0.1 (visualizzazione dei voti parlamentari dagli open data ufficiali)';

const PAUSA_MS = 2000;     // pausa minima tra due richieste allo stesso server
// Server che chiedono più calma: il Senato ha bloccato (HTTP 403) dopo molte richieste ravvicinate.
const PAUSA_PER_SERVER = { 'dati.senato.it': 5000 };
const TENTATIVI = 3;       // tentativi massimi per una query
const TIMEOUT_MS = 90000;  // tempo massimo di attesa per una risposta

// Momento dell'ultima richiesta per ogni server (la pausa vale per server: Camera e Senato
// sono server diversi e possono essere interrogati in parallelo).
const ultimaRichiesta = new Map();
// Coda per server: una richiesta alla volta verso lo stesso server.
const coda = new Map();

const dormi = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Esegue una query SPARQL SELECT e restituisce le righe come oggetti semplici
 * { variabile: valore }. Le variabili non legate (OPTIONAL) mancano dall'oggetto.
 *
 * @param {string} endpoint  es. https://dati.camera.it/sparql
 * @param {string} query     testo della query
 * @param {object} opzioni   { cartellaCache, aggiorna }  aggiorna=true ignora la cache
 */
export async function sparql(endpoint, query, { cartellaCache, aggiorna = false }) {
  // Il nome del file di cache dipende da endpoint + testo della query.
  const chiave = crypto.createHash('sha256').update(endpoint + '\n' + query).digest('hex').slice(0, 24);
  const file = path.join(cartellaCache, new URL(endpoint).hostname, chiave + '.json');

  let json;
  if (!aggiorna) {
    try {
      json = JSON.parse(await fs.readFile(file, 'utf8')).risposta;
    } catch {
      json = undefined; // non in cache
    }
  }
  if (json === undefined) {
    json = await scarica(endpoint, query);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Salvo anche la query, così il file di cache si capisce da solo.
    await fs.writeFile(file, JSON.stringify({ endpoint, query, scaricato_il: new Date().toISOString(), risposta: json }));
  }
  return righe(json);
}

/** Converte il formato "SPARQL results JSON" in un array di oggetti {variabile: valore}. */
function righe(json) {
  return json.results.bindings.map((b) => {
    const r = {};
    for (const [k, v] of Object.entries(b)) r[k] = v.value;
    return r;
  });
}

function scarica(endpoint, query) {
  const server = new URL(endpoint).hostname;
  const turno = (coda.get(server) ?? Promise.resolve()).then(() => scaricaOra(endpoint, server, query));
  coda.set(server, turno.catch(() => {}));
  return turno;
}

async function scaricaOra(endpoint, server, query) {
  const url = endpoint + '?' + new URLSearchParams({ query, format: 'application/sparql-results+json' });
  let errore;
  for (let tentativo = 1; tentativo <= TENTATIVI; tentativo++) {
    // Rispetto la pausa minima dall'ultima richiesta a questo server.
    const attesa = (ultimaRichiesta.get(server) ?? 0) + (PAUSA_PER_SERVER[server] ?? PAUSA_MS) - Date.now();
    if (attesa > 0) await dormi(attesa);
    ultimaRichiesta.set(server, Date.now());

    try {
      const r = await fetch(url, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const testo = await r.text();
      if (r.ok) return JSON.parse(testo);
      errore = new Error(`HTTP ${r.status} da ${endpoint}: ${testo.slice(0, 300)}`);
      if (r.status < 500) break; // errore nella query: inutile riprovare
    } catch (e) {
      errore = e;
    }
    if (tentativo < TENTATIVI) {
      const pausa = 10000 * tentativo;
      console.warn(`  (${endpoint}: ${String(errore.message).split('\n')[0]} — riprovo tra ${pausa / 1000} s)`);
      await dormi(pausa);
    }
  }
  throw errore;
}
