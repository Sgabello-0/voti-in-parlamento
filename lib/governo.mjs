// Incarichi di Governo (Presidente del Consiglio, ministri, viceministri, sottosegretari)
// dagli open data della Camera (ontologia OCD: ocd:membroGoverno), con le date di inizio e fine.
// Gli open data della Camera elencano tutti i membri del Governo, anche quelli che sono
// senatori o non sono parlamentari: per il Senato l'abbinamento si fa in senato.mjs.

import { dataISO, pulisciTesto, periodiAttivi, raggruppa } from './comune.mjs';

const ENDPOINT = 'https://dati.camera.it/sparql';

/** Ruoli in ordine di importanza (dal centro del banco del Governo verso l'esterno). */
export const RUOLI_GOVERNO = ['presidente', 'vicepresidente', 'ministro', 'viceministro', 'sottosegretario'];

/** Dal ruolo scritto negli open data (es. "MINISTRO SENZA PORTAFOGLIO") alla nostra chiave. */
function chiaveRuolo(ruolo) {
  const r = ruolo.toUpperCase().replace(/\s+/g, ' ').trim();
  if (r === 'PRESIDENTE DEL CONSIGLIO') return 'presidente';
  if (r === 'VICEPRESIDENTE DEL CONSIGLIO') return 'vicepresidente';
  if (r.startsWith('MINISTRO')) return 'ministro'; // con o senza portafoglio
  if (r === 'VICE MINISTRO' || r === 'VICEMINISTRO') return 'viceministro';
  if (r.startsWith('SOTTOSEGRETARIO')) return 'sottosegretario';
  return null;
}

/**
 * Membri del Governo in carica alla data D (AAAA-MM-GG), per persona.
 * @returns {Promise<Map<string, {persona, nome, cognome, nascita, ruolo, incarichi:string[]}>>}
 *          chiave = identificativo numerico della persona negli open data della Camera
 */
export async function membriGoverno({ legislatura, data }, interroga, avvisi) {
  // Il Governo in carica può essere nato nella legislatura precedente (es. il governo Gentiloni,
  // XVII legislatura, ancora in carica a maggio 2018, nella XVIII): cerco in tutte e due e poi
  // tengo solo gli incarichi in corso alla data del voto.
  const correnti = await incarichiLegislatura(legislatura, interroga);
  const precedenti = legislatura > 1 ? await incarichiLegislatura(legislatura - 1, interroga) : [];
  // Negli open data gli incarichi dell'ultimo governo di una legislatura possono non avere la data
  // di fine (es. governo Draghi): finiscono al più tardi quando giura il primo governo della
  // legislatura nuova (il primo inizio di un incarico registrato nella legislatura nuova).
  const giuramento = correnti.map((r) => String(r.inizio)).sort()[0];
  const chiusi = precedenti.map((r) => (giuramento && (!r.fine || String(r.fine) > giuramento) ? { ...r, fine: giuramento } : r));
  return membriAllaData([...correnti, ...chiusi], data, avvisi);
}

/** Tutti gli incarichi di Governo registrati in una legislatura (una query: finisce in cache e si riusa). */
function incarichiLegislatura(legislatura, interroga) {
  return interroga(ENDPOINT, `PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX bio: <http://purl.org/vocab/bio/0.1/>
SELECT DISTINCT ?m ?persona ?nome ?cognome ?ruolo ?incarico ?inizio ?fine ?nascita WHERE {
  ?m a ocd:membroGoverno ; ocd:rif_leg <http://dati.camera.it/ocd/legislatura.rdf/repubblica_${legislatura}> ;
     ocd:rif_persona ?persona ; ocd:membroGoverno ?ruolo ; dc:title ?incarico ; ocd:startDate ?inizio .
  OPTIONAL { ?m ocd:endDate ?fine }
  OPTIONAL { ?m foaf:firstName ?nome } OPTIONAL { ?m foaf:surname ?cognome }
  OPTIONAL { ?persona bio:Birth ?b . ?b rdfs:label ?nascita }
}`);
}

function membriAllaData(righe, data, avvisi) {
  const periodi = righe.map((r) => ({ ...r, inizio: dataISO(r.inizio), fine: r.fine ? dataISO(r.fine) : null }));
  const membri = new Map();
  for (const [persona, rr] of raggruppa(periodiAttivi(periodi, data), 'persona')) {
    const id = persona.match(/p(\d+)$/)?.[1];
    if (!id) continue;
    const ruoli = [];
    for (const r of rr) {
      const k = chiaveRuolo(r.ruolo);
      if (k) ruoli.push(k);
      else avvisi.push(`Governo: ruolo non riconosciuto "${r.ruolo}" per ${r.cognome} ${r.nome}: ignorato.`);
    }
    if (!ruoli.length) continue;
    // Il ruolo più importante decide il posto nel banco; gli incarichi si elencano tutti.
    const ruolo = RUOLI_GOVERNO.find((k) => ruoli.includes(k));
    // Incarichi dal più importante, senza le date: "Ministro della Giustizia (23.10.2022)" -> "Ministro della Giustizia"
    const incarichi = [];
    const perImportanza = rr.filter((r) => chiaveRuolo(r.ruolo)).sort((a, b) => RUOLI_GOVERNO.indexOf(chiaveRuolo(a.ruolo)) - RUOLI_GOVERNO.indexOf(chiaveRuolo(b.ruolo)));
    for (const r of perImportanza) {
      const titolo = pulisciTesto(r.incarico).replace(/\s*\(\d{2}\.\d{2}\.\d{4}(?:-\d{2}\.\d{2}\.\d{4})?\)\s*$/, '');
      if (!incarichi.includes(titolo)) incarichi.push(titolo);
    }
    // "nato a ROMA, ROMA, LAZIO, il 15.01.1977" -> 1977-01-15
    const n = (rr.find((r) => r.nascita)?.nascita ?? '').match(/(\d{2})\.(\d{2})\.(\d{4})\s*$/);
    membri.set(id, {
      persona,
      nome: rr[0].nome ?? '',
      cognome: rr[0].cognome ?? '',
      nascita: n ? `${n[3]}-${n[2]}-${n[1]}` : null,
      ruolo,
      incarichi,
    });
  }
  return membri;
}

/** Testo normalizzato per confrontare nomi: maiuscolo, senza accenti né apostrofi. */
export function normalizzaNome(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
