#!/usr/bin/env node
// Scarica tutte le votazioni di un periodo (Camera e/o Senato) in data/votazioni/.
// Usa lo stesso codice di scarica-votazione.mjs, una votazione alla volta, con le stesse
// pause tra le richieste. Le votazioni già scaricate vengono saltate (salvo --aggiorna).
//
// Uso:
//   node scripts/scarica-periodo.mjs --dal 2026-09-01 [opzioni]
//
// Opzioni:
//   --al AAAA-MM-GG     fine del periodo (predefinita: oggi)
//   --ramo camera|senato  solo un ramo (predefiniti: tutti e due)
//   --solo-finali       solo le votazioni finali (sui testi interi: leggi, decreti, ratifiche…)
//   --importanti        solo i voti importanti: votazioni finali e questioni di fiducia
//   --elenco            mostra solo l'elenco, senza scaricare
//   --aggiorna          riscarica anche le votazioni già presenti (e ignora la cache)
//   --fresco            scarica le votazioni mancanti senza usare la cache (dati sempre aggiornati:
//                       serve a riprovare quelle che prima mancavano di qualche dato nelle fonti)
//   --legislatura N     (predefinita: 19)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sparql } from '../lib/sparql.mjs';
import { elencoCamera, elencoSenato } from '../lib/elenco.mjs';
import { scaricaVotazione } from '../lib/scarica.mjs';
import { ErroreDati } from '../lib/comune.mjs';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Opzioni ------------------------------------------------------------------
const argv = process.argv.slice(2);
const opz = { legislatura: 19, al: new Date().toISOString().slice(0, 10) };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--solo-finali') opz.soloFinali = true;
  else if (a === '--importanti') opz.importanti = true;
  else if (a === '--elenco') opz.elenco = true;
  else if (a === '--aggiorna') opz.aggiorna = true;
  else if (a === '--fresco') opz.fresco = true;
  else if (['--dal', '--al', '--ramo', '--legislatura'].includes(a) && i + 1 < argv.length) opz[a.slice(2)] = argv[++i];
  else {
    console.error(`Opzione non riconosciuta: ${a}`);
    process.exit(1);
  }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(opz.dal ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(opz.al)) {
  console.error('Uso: node scripts/scarica-periodo.mjs --dal AAAA-MM-GG [--al AAAA-MM-GG] [--ramo camera|senato] [--legislatura N] [--solo-finali | --importanti] [--elenco] [--aggiorna]');
  process.exit(1);
}
const rami = opz.ramo ? [opz.ramo] : ['camera', 'senato'];

// --- Elenco (sempre dalla fonte, senza cache: le votazioni nuove compaiono ogni giorno) ---
const cartellaCache = path.join(radice, 'data', 'raw');
const senzaCache = (endpoint, query) => sparql(endpoint, query, { cartellaCache, aggiorna: true });
const parametri = { legislatura: Number(opz.legislatura), dal: opz.dal, al: opz.al, soloImportanti: !!opz.importanti };
let elenco = [];
if (rami.includes('camera')) elenco.push(...(await elencoCamera(parametri, senzaCache)));
if (rami.includes('senato')) elenco.push(...(await elencoSenato(parametri, senzaCache)));
const totaleTrovate = elenco.length;
if (opz.soloFinali) elenco = elenco.filter((v) => v.finale);
if (opz.importanti) elenco = elenco.filter((v) => v.finale || v.fiducia);
elenco.sort((a, b) => a.data.localeCompare(b.data) || a.ramo.localeCompare(b.ramo) || a.seduta - b.seduta || a.numero - b.numero);

const slug = (v) => `${v.ramo}-${opz.legislatura}-${v.seduta}-${v.numero}`;
const presente = (v) => fs.existsSync(path.join(radice, 'data', 'votazioni', `${slug(v)}.json`));

console.log(`Legislatura ${opz.legislatura}, dal ${opz.dal} al ${opz.al}: ${totaleTrovate} votazioni negli open data${opz.soloFinali ? `, di cui ${elenco.length} finali` : opz.importanti ? `, di cui ${elenco.length} importanti (finali e fiducie)` : ''}.`);
if (opz.elenco) {
  for (const v of elenco) {
    const stato = v.salta ? `SALTATA (${v.salta})` : presente(v) ? 'già scaricata' : 'da scaricare';
    console.log(`  ${v.data}  ${v.ramo.padEnd(6)} ${String(v.seduta).padStart(4)}/${String(v.numero).padEnd(4)} ${stato.padEnd(16)} ${v.descrizione.slice(0, 90)}`);
  }
  process.exit(0);
}

// --- Download: Camera e Senato in parallelo (server diversi), una votazione alla volta per ramo ---
const esito = { scaricate: 0, presenti: 0, saltate: [], errori: [] };
async function scaricaRamo(ramo) {
  const daFare = elenco.filter((v) => v.ramo === ramo);
  for (const [i, v] of daFare.entries()) {
    const etichetta = `[${ramo} ${i + 1}/${daFare.length}] ${v.seduta}/${v.numero} (${v.data})`;
    if (v.salta) {
      esito.saltate.push(`${etichetta}: ${v.salta}`);
      continue;
    }
    if (presente(v) && !opz.aggiorna) {
      esito.presenti++;
      continue;
    }
    try {
      const r = await scaricaVotazione({ ramo: v.ramo, seduta: v.seduta, numero: v.numero, legislatura: Number(opz.legislatura), aggiorna: !!opz.aggiorna || !!opz.fresco, radice });
      esito.scaricate++;
      console.log(`${etichetta} ok — ${r.votazione.titolo.slice(0, 90)}${r.nuoviGruppi.length ? `  (gruppi nuovi: ${r.nuoviGruppi.join(', ')})` : ''}`);
    } catch (e) {
      const messaggio = e instanceof ErroreDati ? e.message : `errore imprevisto: ${e.message}`;
      esito.errori.push(`${etichetta}: ${messaggio.split('\n')[0]}`);
      console.log(`${etichetta} ERRORE — ${messaggio.split('\n')[0]}`);
      // Il server ci rifiuta (403 accesso negato, 429 troppe richieste): smetto di interrogarlo.
      if (/HTTP (403|429)\b/.test(messaggio)) {
        const restanti = daFare.length - i - 1;
        console.log(`[${ramo}] il server ha rifiutato le richieste: mi fermo per questo ramo (${restanti} votazioni non scaricate). Riprova più tardi.`);
        esito.errori.push(`${ramo}: fermato dopo un rifiuto del server; ${restanti} votazioni non scaricate`);
        return;
      }
    }
  }
}
await Promise.all(rami.map(scaricaRamo));

console.log(`\nScaricate ${esito.scaricate}, già presenti ${esito.presenti}, saltate ${esito.saltate.length}, errori ${esito.errori.length}.`);
for (const s of esito.saltate) console.log(`  saltata: ${s}`);
for (const e of esito.errori) console.log(`  errore: ${e}`);
if (esito.scaricate) console.log('\nRicorda: npm run build per rigenerare il sito; compila in data/gruppi.json ordine e colore degli eventuali gruppi nuovi.');
