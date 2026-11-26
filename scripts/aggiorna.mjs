#!/usr/bin/env node
// Aggiornamento automatico (da lanciare una volta al giorno, es. con un timer di systemd):
//   1. scarica le votazioni nuove della legislatura in corso degli ultimi giorni
//      (senza cache: così riprova anche quelle a cui prima mancava qualche dato nelle fonti);
//   2. se ce ne sono di nuove, rigenera il sito e lo pubblica su Firebase Hosting.
// Se non c'è niente di nuovo non pubblica niente: nessun consumo inutile dei limiti di Firebase.
//
// Uso: node scripts/aggiorna.mjs [--giorni N] [--senza-deploy]
//   --giorni N       quanti giorni indietro controllare (predefinito: 10)
//   --senza-deploy   scarica e rigenera il sito, ma non lo pubblica

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGISLATURA = 19;
const PROGETTO_FIREBASE = 'voti-in-parlamento'; // SOLO questo progetto (vedi .firebaserc)
const FIREBASE_TOOLS = 'firebase-tools@15.37.0';

const argv = process.argv.slice(2);
const giorni = Number(argv[argv.indexOf('--giorni') + 1]) || 10;
const senzaDeploy = argv.includes('--senza-deploy');

const ora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg) => console.log(`[${ora()}] ${msg}`);

/** Lancia un comando e aspetta che finisca; si ferma se esce con errore. */
function esegui(comando, argomenti) {
  return new Promise((ok, ko) => {
    const p = spawn(comando, argomenti, { cwd: radice, stdio: 'inherit' });
    p.on('error', ko);
    p.on('close', (codice) => (codice === 0 ? ok() : ko(new Error(`${comando} ${argomenti.join(' ')}: uscito con codice ${codice}`))));
  });
}

const contaVotazioni = async () => (await fs.readdir(path.join(radice, 'data', 'votazioni'))).filter((f) => f.endsWith('.json')).length;

// Un solo aggiornamento alla volta (niente doppie richieste ai server delle fonti).
const blocco = path.join(radice, 'data', '.aggiornamento-in-corso');
let fd;
try {
  fd = await fs.open(blocco, 'wx');
  await fd.write(String(process.pid));
} catch {
  log(`Un altro aggiornamento è in corso (c'è il file ${path.relative(radice, blocco)}): esco. Se non è vero, cancella quel file.`);
  process.exit(0);
}

try {
  const dal = new Date(Date.now() - giorni * 86400000).toISOString().slice(0, 10);
  const prima = await contaVotazioni();
  log(`Scarico le votazioni della legislatura ${LEGISLATURA} dal ${dal}…`);
  await esegui(process.execPath, ['scripts/scarica-periodo.mjs', '--legislatura', String(LEGISLATURA), '--dal', dal, '--fresco']);
  const nuove = (await contaVotazioni()) - prima;
  if (nuove <= 0) {
    log('Nessuna votazione nuova: non rigenero e non pubblico il sito.');
  } else if (senzaDeploy) {
    log(`${nuove} votazioni nuove: rigenero il sito (senza pubblicarlo).`);
    await esegui(process.execPath, ['scripts/build.mjs']);
  } else {
    // Il deploy esegue da solo la build (predeploy in firebase.json).
    log(`${nuove} votazioni nuove: rigenero il sito e lo pubblico sul progetto Firebase "${PROGETTO_FIREBASE}".`);
    await esegui('npx', ['-y', FIREBASE_TOOLS, 'deploy', '--only', 'hosting', '--project', PROGETTO_FIREBASE, '--non-interactive']);
  }
  log('Fatto.');
} catch (e) {
  log(`ERRORE: ${e.message}`);
  process.exitCode = 1;
} finally {
  await fd.close();
  await fs.rm(blocco, { force: true });
}
