#!/usr/bin/env node
// Test obbligatori della Fase 1: lo script deve riprodurre esattamente due votazioni reali.
// I dati NON vengono corretti a mano: se un controllo fallisce, il test lo segnala e basta.
//
// Uso: node scripts/test-fase1.mjs   (oppure: npm test)

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaricaVotazione } from '../lib/scarica.mjs';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Il test usa la cache del progetto (data/raw) ma scrive i risultati in una cartella
// temporanea, così non sovrascrive data/votazioni né data/gruppi.json.
const radiceUscita = await fs.mkdtemp(path.join(os.tmpdir(), 'voti-test-'));

let falliti = 0;
function verifica(condizione, descrizione, dettaglio = '') {
  console.log(`  ${condizione ? '✓' : '✗'} ${descrizione}${!condizione && dettaglio ? `\n      → ${dettaglio}` : ''}`);
  if (!condizione) falliti++;
}

/** Normalizza i cognomi: maiuscolo, senza accenti né apostrofi ("Carè" = "CARE'"). */
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toUpperCase().trim();
const insiemiUguali = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const elenco = (pp) => pp.map((p) => `${p.cognome} ${p.nome} [${p.gruppo}, ${p.voto}]`).join('; ');

async function scarica(ramo, seduta, numero) {
  try {
    const r = await scaricaVotazione({ ramo, seduta, numero, radice, radiceUscita });
    for (const a of r.avvisi) console.log(`  (avviso) ${a}`);
    return r.votazione;
  } catch (e) {
    console.log(`  ✗ download/controlli falliti: ${e.message}`);
    falliti++;
    return null;
  }
}

// ---------------------------------------------------------------------------
console.log('\nTEST CAMERA — seduta 747 del 17/11/2026, votazione n. 53 (voto finale PDL 2830)');
const c = await scarica('camera', 747, 53);
if (c) {
  const nomeGruppo = (sigla) => c.gruppi.find((g) => g.sigla === sigla)?.nome ?? '';
  verifica(c.data === '2026-11-17', `data 17/11/2026 (trovata ${c.data})`);
  verifica(c.totali.favorevoli === 147 && c.totali.contrari === 93 && c.totali.astenuti === 5,
    `totali 147 / 93 / 5 (trovati ${c.totali.favorevoli} / ${c.totali.contrari} / ${c.totali.astenuti})`);

  const astenuti = c.parlamentari.filter((p) => p.voto === 'astenuto');
  verifica(insiemiUguali(astenuti.map((p) => norm(p.cognome)), ['FASSINO', 'GUERINI', 'QUARTAPELLE PROCOPIO', 'MEROLA', 'CARE']),
    'i 5 astenuti sono Fassino, Guerini, Quartapelle Procopio, Merola, Carè', elenco(astenuti));
  verifica(astenuti.every((p) => p.gruppo === 'PD-IDP'), 'i 5 astenuti sono del gruppo PD', elenco(astenuti));

  const fn = ['BERGAMINI', 'BOF', 'PIERRO', 'POZZOLO', 'RAVETTO', 'SASSO', 'ZIELLO'];
  const contrariFN = c.parlamentari.filter((p) => p.voto === 'contrario' && fn.includes(norm(p.cognome)));
  verifica(insiemiUguali(contrariFN.map((p) => norm(p.cognome)), fn), 'Bergamini, Bof, Pierro, Pozzolo, Ravetto, Sasso, Ziello hanno votato contro', elenco(contrariFN));
  const sigleFN = [...new Set(contrariFN.map((p) => p.gruppo))];
  verifica(sigleFN.length === 1 && /FUTURO NAZIONALE/i.test(nomeGruppo(sigleFN[0])),
    `i 7 sono nella componente Futuro Nazionale del Misto al 17/11/2026 (${sigleFN.map((s) => `${s} = ${nomeGruppo(s)}`).join(', ')})`);
  verifica(contrariFN.every((p) => !['LEGA', 'FI-PPE'].includes(p.gruppo)), 'nessuno dei 7 risulta ancora in Lega o FI', elenco(contrariFN));
  const contrariDelGruppo = c.parlamentari.filter((p) => p.voto === 'contrario' && p.gruppo === sigleFN[0]);
  verifica(contrariDelGruppo.length === 7, `nel gruppo ${sigleFN[0]} i contrari sono esattamente 7 (trovati ${contrariDelGruppo.length})`);

  const madia = c.parlamentari.filter((p) => norm(p.cognome) === 'MADIA');
  verifica(madia.length === 1 && madia[0].voto === 'favorevole', 'Madia ha votato a favore', elenco(madia));
  verifica(madia.length === 1 && /ITALIA VIVA/i.test(nomeGruppo(madia[0].gruppo)),
    `Madia al 17/11/2026 è in Italia Viva (${madia[0] ? `${madia[0].gruppo} = ${nomeGruppo(madia[0].gruppo)}` : '-'})`);
  verifica(c.parlamentari.every((p) => p.gruppo), 'tutti i deputati hanno un gruppo');
  console.log(`  (deputati in elenco: ${c.parlamentari.length})`);
}

// ---------------------------------------------------------------------------
console.log('\nTEST SENATO — seduta 395 del 4/3/2026, votazione finale ddl antisemitismo (S.1004)');
const s = await scarica('senato', 395, 2);
if (s) {
  verifica(s.data === '2026-03-04', `data 04/03/2026 (trovata ${s.data})`);
  verifica(/finale/i.test(s.titolo) && /S\.1004\b/.test(s.descrizione), `è la votazione finale del S.1004 ("${s.titolo}" — ${s.descrizione.slice(0, 80)}…)`);
  verifica(s.totali.favorevoli === 105 && s.totali.contrari === 24 && s.totali.astenuti === 21,
    `totali 105 / 24 / 21 (trovati ${s.totali.favorevoli} / ${s.totali.contrari} / ${s.totali.astenuti})`);

  const pdFav = s.parlamentari.filter((p) => p.gruppo === 'PD-IDP' && p.voto === 'favorevole');
  verifica(insiemiUguali(pdFav.map((p) => norm(p.cognome)), ['DELRIO', 'SENSI', 'VERINI', 'BAZOLI', 'CASINI', 'ZAMPA']),
    'i 6 senatori PD a favore sono Delrio, Sensi, Verini, Bazoli, Casini, Zampa', elenco(pdFav));

  const contrari = s.parlamentari.filter((p) => p.voto === 'contrario');
  const avs = ['CUCCHI', 'DE CRISTOFARO', 'MAGNI'];
  const contrariAVS = contrari.filter((p) => avs.includes(norm(p.cognome)));
  verifica(insiemiUguali(contrariAVS.map((p) => norm(p.cognome)), avs) && contrariAVS.every((p) => p.gruppo === 'Misto'),
    'Cucchi, De Cristofaro e Magni hanno votato contro e sono nel Misto', elenco(contrariAVS));
  const altri = contrari.filter((p) => !avs.includes(norm(p.cognome)));
  verifica(altri.every((p) => p.gruppo === 'M5S'), `tutti gli altri contrari sono M5S (${altri.length})`, elenco(altri.filter((p) => p.gruppo !== 'M5S')));
  verifica(s.parlamentari.every((p) => p.gruppo), 'tutti i senatori hanno un gruppo');
  console.log(`  (senatori in elenco: ${s.parlamentari.length})`);
}

await fs.rm(radiceUscita, { recursive: true, force: true });
console.log(falliti ? `\n${falliti} controlli FALLITI` : '\nTutti i controlli superati.');
process.exit(falliti ? 1 : 0);
