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
import { paginaVotazione, paginaIndice, pagina404, paginaParlamentare, paginaElencoTipo, paginaGiorno } from '../lib/pagine.mjs';
import { nomeCompleto } from '../lib/html.mjs';
import { RUOLI_GOVERNO } from '../lib/governo.mjs';
import { TIPI } from '../lib/tipi.mjs';
import { percorsoParlamentare, percorsoTipo, percorsoGiorno, idNumerico } from '../lib/percorsi.mjs';
import { faviconSvg } from '../lib/logo.mjs';
import { LEGISLATURE } from '../lib/legislature.mjs';

// ---------------------------------------------------------------------------
// Impostazioni del sito: l'indirizzo pubblico si cambia SOLO qui.
// ---------------------------------------------------------------------------
const URL_BASE = 'https://voti-in-parlamento.web.app';
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
function preparaVotazione(v, archivioGruppi, anagrafica) {
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

  // Posti nell'emiciclo. Nelle file: per gruppo, poi per voto, poi per cognome.
  // Poi i membri del Governo, che siedono nel banco del Governo: in ordine di importanza
  // (il primo va al centro del banco), poi per cognome.
  const tutti = v.parlamentari.map((p) => ({
    ...p,
    nomeCompleto: nomeCompleto(p),
    indiceGruppo: perSigla.get(p.gruppo).indice,
    percorso: percorsoParlamentare(v.ramo, anagrafica.get(chiavePersona(v.ramo, p.id_fonte)) ?? p), // pagina del parlamentare
  }));
  const nelleFile = tutti
    .filter((p) => !p.governo)
    .sort((a, b) =>
      a.indiceGruppo - b.indiceGruppo ||
      ORDINE_VOTI.indexOf(a.voto) - ORDINE_VOTI.indexOf(b.voto) ||
      a.cognome.localeCompare(b.cognome, 'it') ||
      a.nome.localeCompare(b.nome, 'it'));
  const alGoverno = tutti
    .filter((p) => p.governo)
    .sort((a, b) => RUOLI_GOVERNO.indexOf(a.governo.ruolo) - RUOLI_GOVERNO.indexOf(b.governo.ruolo) || a.cognome.localeCompare(b.cognome, 'it'));
  const seggi = [...nelleFile, ...alGoverno];
  // Quanti membri del Governo per ruolo (per la spiegazione sotto l'emiciclo)
  const ruoliGoverno = RUOLI_GOVERNO.map((ruolo) => ({ ruolo, numero: alGoverno.filter((p) => p.governo.ruolo === ruolo).length })).filter((r) => r.numero > 0);

  // Elenco completo: diviso per gruppo (nell'ordine dell'emiciclo), alfabetico dentro ogni gruppo.
  const alfabetico = v.parlamentari
    .map((p) => ({ ...p, nomeCompleto: nomeCompleto(p) }))
    .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
  const elencoPerGruppo = gruppi.map((g) => ({ gruppo: g, membri: alfabetico.filter((p) => p.gruppo === g.sigla) }));

  return {
    ...v,
    gruppi,
    seggi,
    ruoliGoverno,
    elencoPerGruppo,
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

/**
 * Una persona, in tutte le legislature: alla Camera l'identificativo cambia con la legislatura
 * (d302103_18, d302103_19) ma il numero della persona resta lo stesso; al Senato è già unico.
 */
function chiavePersona(ramo, idFonte) {
  return `${ramo}:${idNumerico(idFonte)}`;
}

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

  // 1. Primo giro veloce: nome di ogni parlamentare (serve per l'indirizzo della sua pagina,
  //    che deve essere lo stesso in tutte le votazioni).
  // Una scheda per persona (anche su più legislature), con il nome e l'identificativo più recenti.
  const anagrafica = new Map(); // chiavePersona -> { id_fonte, nome, cognome, ramo, data }
  for (const f of nomiFile) {
    const v = await leggiJson(path.join(cartellaVotazioni, f));
    for (const p of v.parlamentari) {
      const k = chiavePersona(v.ramo, p.id_fonte);
      const prima = anagrafica.get(k);
      if (!prima || v.data > prima.data) anagrafica.set(k, { id_fonte: p.id_fonte, nome: p.nome, cognome: p.cognome, ramo: v.ramo, data: v.data });
    }
  }

  // Riparto da zero: public/ contiene solo file generati.
  await fs.rm(PUBBLICA, { recursive: true, force: true });
  const ctx = {
    URL_BASE,
    NOME_SITO,
    css: await copiaAsset('stile.css'),
    js: await copiaAsset('emiciclo.js'),
    jsRicerca: await copiaAsset('ricerca.js'),
  };
  await scrivi('favicon.svg', faviconSvg());

  // 2. Una votazione alla volta: scrivo la sua pagina e tengo solo un riassunto
  //    (per home, liste per tipo e ricerca) e i voti di ogni parlamentare (per le loro pagine).
  const riassunti = [];
  const voti = new Map(); // chiavePersona -> [{ slug, voto, gruppo, incarico }]
  const ultimoGruppo = new Map(); // chiavePersona -> { data, sigla, nome, colore }
  for (const f of nomiFile) {
    const grezza = await leggiJson(path.join(cartellaVotazioni, f));
    if (`${grezza.slug}.json` !== f) throw new Error(`${f}: lo slug interno ("${grezza.slug}") non corrisponde al nome del file`);
    const v = preparaVotazione(grezza, archivioGruppi, anagrafica);
    await scrivi(path.join('votazioni', v.slug, 'index.html'), paginaVotazione(v, ctx));
    riassunti.push({
      slug: v.slug, url: `/votazioni/${v.slug}/`, legislatura: v.legislatura, ramo: v.ramo, ramoNome: v.ramoNome, ramoBreve: v.ramoBreve,
      data: v.data, seduta: v.seduta, numero_votazione: v.numero_votazione, titolo: v.titolo, descrizione: v.descrizione,
      tipo: v.tipo || 'altro', esito: v.esito, totali: v.totali,
    });
    const perSigla = new Map(v.gruppi.map((g) => [g.sigla, g]));
    for (const p of grezza.parlamentari) {
      const k = chiavePersona(v.ramo, p.id_fonte);
      if (!voti.has(k)) voti.set(k, []);
      voti.get(k).push({ slug: v.slug, voto: p.voto, gruppo: p.gruppo, incarico: p.governo ? p.governo.incarichi.join(' · ') : '' });
      const u = ultimoGruppo.get(k);
      if (!u || v.data >= u.data) {
        const g = perSigla.get(p.gruppo);
        ultimoGruppo.set(k, { data: v.data, sigla: g.etichetta, nome: g.nome, colore: g.colore, incarico: p.governo ? p.governo.incarichi.join(' · ') : '' });
      }
    }
  }
  const recentiPrima = (a, b) => b.data.localeCompare(a.data) || b.seduta - a.seduta || b.numero_votazione - a.numero_votazione;
  riassunti.sort(recentiPrima);
  const riassuntoDi = new Map(riassunti.map((r) => [r.slug, r]));

  // 3. Pagine dei parlamentari
  const schede = [];
  for (const [id, righe] of voti) {
    const a = anagrafica.get(id);
    const p = {
      ...a,
      nomeCompleto: nomeCompleto(a),
      percorso: percorsoParlamentare(a.ramo, a),
      gruppo: ultimoGruppo.get(id),
      voti: righe.map((r) => ({ ...r, ...riassuntoDi.get(r.slug), gruppoVoto: r.gruppo })).sort(recentiPrima),
    };
    await scrivi(path.join(p.percorso, 'index.html'), paginaParlamentare(p, ctx));
    schede.push({ percorso: p.percorso, nomeCompleto: p.nomeCompleto, cognome: a.cognome, ramo: a.ramo, gruppo: p.gruppo });
  }

  // 4. Liste per tipo (una pagina per legislatura, ramo e tipo)
  const numeriLegislature = [...new Set(riassunti.map((r) => r.legislatura))].sort((a, b) => b - a);
  const liste = [];
  for (const legislatura of numeriLegislature) {
    for (const ramo of ['camera', 'senato']) {
      for (const t of TIPI) {
        const righe = riassunti.filter((r) => r.legislatura === legislatura && r.ramo === ramo && r.tipo === t.chiave);
        if (!righe.length) continue;
        const percorso = percorsoTipo(legislatura, ramo, t.chiave);
        await scrivi(path.join(percorso, 'index.html'), paginaElencoTipo({ legislatura, ramo, ramoNome: RAMI[ramo].nome, tipo: t, righe, percorso }, ctx));
        liste.push({ percorso, data: righe[0].data });
      }
    }
  }

  // 5. Una pagina per ogni giorno con votazioni, con i collegamenti al giorno prima e dopo
  const giorni = [...new Set(riassunti.map((r) => r.data))].sort();
  for (const [i, data] of giorni.entries()) {
    const righe = riassunti.filter((r) => r.data === data);
    await scrivi(path.join(percorsoGiorno(data), 'index.html'), paginaGiorno({ data, righe, precedente: giorni[i - 1], successivo: giorni[i + 1] }, ctx));
  }

  // 6. Pagina iniziale: voti dell'ultimo giorno, poi le legislature. Per ogni legislatura dico
  //    da quando ci sono tutte le votazioni (e non solo i voti finali e le fiducie): è la data da
  //    cui il progetto scarica tutto (LEGISLATURE[n].tutteDal), non la prima votazione "minore"
  //    presente (ce ne possono essere di isolate, es. quelle dei test).
  const legislature = numeriLegislature.map((numero) => {
    const dellaLeg = riassunti.filter((r) => r.legislatura === numero);
    const completaDal = LEGISLATURE[numero]?.tutteDal ?? null;
    return { numero, completaDal, importantiPrima: !!completaDal && dellaLeg.some((r) => r.data < completaDal) };
  });
  await scrivi('index.html', paginaIndice(riassunti, ctx, { legislature, giorno: riassunti[0].data }));
  await scrivi('404.html', pagina404(ctx));

  // 7. Indice per la barra di ricerca (lo carica ricerca.js solo quando serve)
  await scrivi('indice.json', JSON.stringify({
    votazioni: riassunti.map((r) => [r.url, r.titolo, r.data, r.ramo, r.tipo, r.esito ?? '', r.legislatura]),
    parlamentari: schede
      .sort((a, b) => a.cognome.localeCompare(b.cognome, 'it'))
      .map((s) => [s.percorso, s.nomeCompleto, s.ramo, s.gruppo?.nome || s.gruppo?.sigla || '']),
  }));

  // 8. Sitemap e robots.txt
  const ultimaData = riassunti[0].data;
  await scrivi('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${URL_BASE}/</loc><lastmod>${ultimaData}</lastmod></url>
${liste.map((l) => `<url><loc>${URL_BASE}${l.percorso}</loc><lastmod>${l.data}</lastmod></url>`).join('\n')}
${giorni.map((d) => `<url><loc>${URL_BASE}${percorsoGiorno(d)}</loc><lastmod>${d}</lastmod></url>`).join('\n')}
${riassunti.map((r) => `<url><loc>${URL_BASE}${r.url}</loc><lastmod>${r.data}</lastmod></url>`).join('\n')}
${schede.map((s) => `<url><loc>${URL_BASE}${s.percorso}</loc><lastmod>${ultimaData}</lastmod></url>`).join('\n')}
</urlset>
`);
  await scrivi('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${URL_BASE}/sitemap.xml\n`);

  console.log(`Sito generato in public/: ${riassunti.length} votazioni (legislature ${numeriLegislature.join(', ')}), ${schede.length} parlamentari, ${liste.length} liste per tipo, ${giorni.length} giorni.`);
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
