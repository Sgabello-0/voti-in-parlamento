#!/usr/bin/env node
// Build del sito statico.
// Legge data/votazioni/*.json e data/gruppi.json e scrive in public/:
//   public/index.html                     elenco delle votazioni
//   public/votazioni/<slug>/index.html    una pagina per votazione
//   public/404.html, public/sitemap.xml, public/robots.txt
//   public/assets/                        CSS e JS (con un'impronta nel nome, per la cache)
//
// Uso: node scripts/build.mjs   (oppure: npm run build)

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { paginaVotazione, paginaIndice, pagina404 } from '../lib/pagine.mjs';
import { nomeCompleto } from '../lib/html.mjs';

// ---------------------------------------------------------------------------
// Impostazioni del sito: l'indirizzo pubblico si cambia SOLO qui.
// ---------------------------------------------------------------------------
const URL_BASE = 'https://whosnext.web.app';
const NOME_SITO = 'Voti in Parlamento';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATI = path.join(radice, 'data');
const PUBBLICA = path.join(radice, 'public');

/** Ordine dei voti dentro ogni spicchio: favorevoli, astenuti, contrari, poi chi non ha votato. */
const ORDINE_VOTI = ['favorevole', 'astenuto', 'contrario', 'assente', 'missione', 'non_votante'];

const RAMI = {
  camera: {
    nome: 'Camera dei deputati',
    breve: 'Camera',
    singolare: 'deputato',
    plurale: 'deputati',
    titolo: 'Deputato',
    notaNonVotanti: 'Non votanti: il Presidente della Camera, che per prassi non vota, e chi presiede la seduta.',
    // pagina ufficiale con l'elenco delle votazioni della seduta (formato verificato su camera.it)
    urlUfficiale: (v) => `https://www.camera.it/leg${v.legislatura}/410?idSeduta=${String(v.seduta).padStart(4, '0')}&tipo=votazioni`,
    urlUfficialeNome: 'camera.it',
  },
  senato: {
    nome: 'Senato della Repubblica',
    breve: 'Senato',
    singolare: 'senatore',
    plurale: 'senatori',
    titolo: 'Senatore',
    notaNonVotanti: 'Non votanti: chi presiede la seduta e i senatori presenti che non hanno partecipato al voto.',
    urlUfficiale: null, // le pagine di senato.it non sono verificabili da script (protezione anti-bot)
    urlUfficialeNome: '',
  },
};

const avvisi = [];
// Gruppi a cui mancano impostazioni in data/gruppi.json, per ramo (stampati in fondo, una riga per tipo).
const mancanti = { ordine: new Set(), colore: new Set(), etichettaLunga: new Set() };

// ---------------------------------------------------------------------------
// Preparazione dei dati di una votazione per i modelli HTML
// ---------------------------------------------------------------------------

/**
 * Unisce la votazione con le impostazioni di data/gruppi.json (ordine, colore, etichetta)
 * e calcola tutto ciò che serve alla pagina: gruppi in ordine, conteggi, posti nell'emiciclo.
 */
function preparaVotazione(v, archivioGruppi) {
  const ramo = RAMI[v.ramo];
  if (!ramo) throw new Error(`${v.slug}: ramo sconosciuto "${v.ramo}"`);
  const impostazioni = Array.isArray(archivioGruppi[v.ramo]) ? archivioGruppi[v.ramo] : [];

  // Gruppi presenti in questa votazione, con le impostazioni di gruppi.json.
  const sigle = [...new Set(v.parlamentari.map((p) => p.gruppo))];
  const gruppi = sigle.map((sigla) => {
    const imp = impostazioni.find((x) => x.sigla === sigla) ?? {};
    const daVotazione = v.gruppi.find((x) => x.sigla === sigla) ?? {};
    const ordine = Number.isFinite(imp.ordine) ? imp.ordine : null;
    let colore = typeof imp.colore === 'string' && imp.colore.trim() ? imp.colore.trim() : null;
    if (colore && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colore)) {
      avvisi.push(`gruppi.json, ${v.ramo} "${sigla}": colore "${colore}" non valido (usa il formato #RRGGBB): ignorato.`);
      colore = null;
    }
    if (ordine === null) mancanti.ordine.add(`${v.ramo}: ${sigla}`);
    if (colore === null) mancanti.colore.add(`${v.ramo}: ${sigla}`);
    const etichetta = typeof imp.etichetta === 'string' && imp.etichetta.trim() ? imp.etichetta.trim() : sigla;
    if (etichetta.length > 14) mancanti.etichettaLunga.add(`${v.ramo}: ${sigla}`);
    return { sigla, etichetta, nome: imp.nome || daVotazione.nome || sigla, ordine, colore };
  });

  // Ordine da sinistra a destra: "ordine" di gruppi.json; i gruppi senza ordine vanno in fondo.
  gruppi.sort((a, b) => (a.ordine ?? Infinity) - (b.ordine ?? Infinity) || a.sigla.localeCompare(b.sigla, 'it'));
  gruppi.forEach((g, i) => {
    g.indice = i;
    g.conteggi = Object.fromEntries(ORDINE_VOTI.map((voto) => [voto, 0]));
    g.totale = 0;
  });
  const perSigla = new Map(gruppi.map((g) => [g.sigla, g]));

  for (const p of v.parlamentari) {
    const g = perSigla.get(p.gruppo);
    if (!(p.voto in g.conteggi)) throw new Error(`${v.slug}: voto sconosciuto "${p.voto}" per ${p.cognome}`);
    g.conteggi[p.voto]++;
    g.totale++;
  }

  // Posti nell'emiciclo: per gruppo, poi per voto, poi per cognome.
  const seggi = v.parlamentari
    .map((p) => ({ ...p, nomeCompleto: nomeCompleto(p), indiceGruppo: perSigla.get(p.gruppo).indice }))
    .sort((a, b) =>
      a.indiceGruppo - b.indiceGruppo ||
      ORDINE_VOTI.indexOf(a.voto) - ORDINE_VOTI.indexOf(b.voto) ||
      a.cognome.localeCompare(b.cognome, 'it') ||
      a.nome.localeCompare(b.nome, 'it'));

  // Elenco completo, in ordine alfabetico.
  const elenco = v.parlamentari
    .map((p) => ({ ...p, nomeCompleto: nomeCompleto(p), etichettaGruppo: perSigla.get(p.gruppo).etichetta, nomeGruppo: perSigla.get(p.gruppo).nome }))
    .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));

  return {
    ...v,
    gruppi,
    seggi,
    elenco,
    ramoNome: ramo.nome,
    ramoBreve: ramo.breve,
    parlamentareSingolare: ramo.singolare,
    parlamentariPlurale: ramo.plurale,
    parlamentareTitolo: ramo.titolo,
    notaNonVotanti: ramo.notaNonVotanti,
    urlUfficiale: ramo.urlUfficiale ? ramo.urlUfficiale(v) : null,
    urlUfficialeNome: ramo.urlUfficialeNome,
    url: `${URL_BASE}/votazioni/${v.slug}/`,
  };
}

// ---------------------------------------------------------------------------
// Supporto
// ---------------------------------------------------------------------------

async function leggiJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    throw new Error(`Non riesco a leggere ${path.relative(radice, file)}: ${e.message}`);
  }
}

async function scrivi(relativo, contenuto) {
  const file = path.join(PUBBLICA, relativo);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contenuto);
}

/** Copia un file di assets/ in public/assets/ aggiungendo un'impronta al nome (es. stile.3f2a1c9b.css). */
async function copiaAsset(nome) {
  const contenuto = await fs.readFile(path.join(radice, 'assets', nome));
  const impronta = crypto.createHash('sha256').update(contenuto).digest('hex').slice(0, 10);
  const est = path.extname(nome);
  const nomeFinale = `${path.basename(nome, est)}.${impronta}${est}`;
  await scrivi(path.join('assets', nomeFinale), contenuto);
  return `/assets/${nomeFinale}`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function build() {
  const archivioGruppi = await leggiJson(path.join(DATI, 'gruppi.json'));
  const cartellaVotazioni = path.join(DATI, 'votazioni');
  const nomiFile = (await fs.readdir(cartellaVotazioni)).filter((f) => f.endsWith('.json')).sort();
  if (nomiFile.length === 0) throw new Error('Nessuna votazione in data/votazioni/: scaricane una con scripts/scarica-votazione.mjs');

  const votazioni = [];
  for (const f of nomiFile) {
    const v = await leggiJson(path.join(cartellaVotazioni, f));
    if (`${v.slug}.json` !== f) throw new Error(`${f}: lo slug interno ("${v.slug}") non corrisponde al nome del file`);
    votazioni.push(preparaVotazione(v, archivioGruppi));
  }
  // Più recenti in alto.
  votazioni.sort((a, b) => b.data.localeCompare(a.data) || a.slug.localeCompare(b.slug));

  // Riparto da zero: public/ contiene solo file generati.
  await fs.rm(PUBBLICA, { recursive: true, force: true });
  const ctx = {
    URL_BASE,
    NOME_SITO,
    css: await copiaAsset('stile.css'),
    js: await copiaAsset('emiciclo.js'),
  };

  for (const v of votazioni) await scrivi(path.join('votazioni', v.slug, 'index.html'), paginaVotazione(v, ctx));
  await scrivi('index.html', paginaIndice(votazioni, ctx));
  await scrivi('404.html', pagina404(ctx));

  const ultimaData = votazioni[0].data;
  await scrivi('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${URL_BASE}/</loc><lastmod>${ultimaData}</lastmod></url>
${votazioni.map((v) => `<url><loc>${v.url}</loc><lastmod>${v.data}</lastmod></url>`).join('\n')}
</urlset>
`);
  await scrivi('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${URL_BASE}/sitemap.xml\n`);

  console.log(`Sito generato in public/: ${votazioni.length} votazioni.`);
  for (const v of votazioni) console.log(`  /votazioni/${v.slug}/`);
  const elenca = (insieme) => [...insieme].join(', ');
  if (mancanti.ordine.size) avvisi.push(`Gruppi senza "ordine" in data/gruppi.json (vanno in fondo a destra): ${elenca(mancanti.ordine)}`);
  if (mancanti.colore.size) avvisi.push(`Gruppi senza "colore" in data/gruppi.json (grigi nella vista Partito): ${elenca(mancanti.colore)}`);
  if (mancanti.etichettaLunga.size) avvisi.push(`Sigle lunghe, accorciate nell'emiciclo (puoi impostare un'"etichetta" in data/gruppi.json): ${elenca(mancanti.etichettaLunga)}`);
  const unici = [...new Set(avvisi)];
  if (unici.length) {
    console.log(`\n${unici.length} avvisi (il sito è stato generato comunque):`);
    for (const a of unici) console.log(`  - ${a}`);
  }
}

build().catch((e) => {
  console.error(`\nERRORE: ${e.message}`);
  process.exit(1);
});
