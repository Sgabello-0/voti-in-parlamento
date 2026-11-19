#!/usr/bin/env node
// Scarica una votazione dagli open data ufficiali e la salva in data/votazioni/<slug>.json
//
// Uso:
//   node scripts/scarica-votazione.mjs <camera|senato> <seduta> <votazione> [opzioni]
//
// Opzioni:
//   --legislatura N      (default 19)
//   --slug testo         nome del file / dell'URL (default: <ramo>-<legislatura>-<seduta>-<votazione>)
//   --titolo "..."       titolo da mostrare al posto di quello ufficiale
//   --descrizione "..."  descrizione da mostrare al posto di quella ricavata dalle fonti
//   --aggiorna           ignora la cache in data/raw e riscarica dalle fonti
//
// Esempi:
//   node scripts/scarica-votazione.mjs camera 747 53
//   node scripts/scarica-votazione.mjs senato 395 2 --slug ddl-antisemitismo-senato

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaricaVotazione } from '../lib/scarica.mjs';
import { ErroreDati } from '../lib/comune.mjs';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function leggiArgomenti(argv) {
  const posizionali = [];
  const opzioni = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--aggiorna') opzioni.aggiorna = true;
    else if (a === '-h' || a === '--help') opzioni.aiuto = true;
    else if (a.startsWith('--')) {
      const nome = a.slice(2);
      if (!['legislatura', 'slug', 'titolo', 'descrizione'].includes(nome)) throw new ErroreDati(`Opzione sconosciuta: ${a}`);
      if (i + 1 >= argv.length) throw new ErroreDati(`Manca il valore per ${a}`);
      opzioni[nome] = argv[++i];
    } else posizionali.push(a);
  }
  return { posizionali, opzioni };
}

const USO = 'Uso: node scripts/scarica-votazione.mjs <camera|senato> <seduta> <votazione> [--legislatura N] [--slug s] [--titolo t] [--descrizione d] [--aggiorna]';

try {
  const { posizionali, opzioni } = leggiArgomenti(process.argv.slice(2));
  if (opzioni.aiuto || posizionali.length !== 3) {
    console.log(USO);
    process.exit(opzioni.aiuto ? 0 : 1);
  }
  const [ramo, seduta, numero] = posizionali;
  console.log(`Scarico ${ramo} – seduta ${seduta}, votazione ${numero}…`);
  const { file, votazione: v, avvisi, nuoviGruppi } = await scaricaVotazione({ ramo, seduta, numero, ...opzioni, radice });

  const conta = (voto) => v.parlamentari.filter((p) => p.voto === voto).length;
  console.log(`\n${v.titolo} — ${v.data} — ${v.esito ?? 'esito non indicato'}`);
  console.log(`Favorevoli ${v.totali.favorevoli} · Contrari ${v.totali.contrari} · Astenuti ${v.totali.astenuti} · Presenti ${v.totali.presenti} · Votanti ${v.totali.votanti}`);
  console.log(`Parlamentari in elenco: ${v.parlamentari.length} (missione ${conta('missione')}, assenti ${conta('assente')}, non votanti ${conta('non_votante')})`);
  console.log(`Gruppi: ${v.gruppi.map((g) => g.sigla).join(', ')}`);
  if (nuoviGruppi.length) console.log(`Aggiunti a data/gruppi.json (ordine e colore da compilare): ${nuoviGruppi.join(', ')}`);
  for (const a of avvisi) console.log(`AVVISO: ${a}`);
  console.log(`\nSalvato: ${path.relative(radice, file)}`);
} catch (e) {
  if (e instanceof ErroreDati) {
    console.error(`\nERRORE: ${e.message}`);
  } else {
    console.error(`\nERRORE imprevisto: ${e.stack ?? e}`);
  }
  process.exit(1);
}
