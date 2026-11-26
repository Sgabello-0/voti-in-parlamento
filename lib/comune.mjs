// Funzioni comuni a Camera e Senato: date, pulizia dei testi, periodi
// (mandati, adesioni ai gruppi), controlli finali e salvataggio dei file.

import fs from 'node:fs/promises';
import path from 'node:path';

/** Errore "atteso" (dati mancanti o incoerenti): il programma lo stampa e si ferma. */
export class ErroreDati extends Error {}

/** Valori ammessi per il campo "voto". */
export const VOTI = ['favorevole', 'contrario', 'astenuto', 'assente', 'missione', 'non_votante'];

/** "20261117" oppure "2026-11-17" -> "2026-11-17". */
export function dataISO(s) {
  const t = String(s ?? '').trim();
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  throw new ErroreDati(`Data in un formato sconosciuto: "${s}"`);
}

const ENTITA = {
  quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»',
  ndash: '–', mdash: '—', hellip: '…', deg: '°',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
};

/** Decodifica le entità HTML, toglie i tag e normalizza gli spazi. */
export function pulisciTesto(s) {
  if (s == null) return '';
  let t = String(s);
  // Alcuni titoli hanno entità "doppie" (&amp;quot;): decodifico al massimo due volte.
  for (let i = 0; i < 2; i++) {
    t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tutto, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : tutto;
      }
      return ENTITA[e] ?? tutto;
    });
  }
  return t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Tra più periodi { inizio, fine } (date ISO, fine facoltativa) restituisce quelli
 * in corso alla data D.
 * Regola: inizio <= D e (fine assente oppure fine > D). Quindi il giorno di un
 * cambio di gruppo vale il gruppo NUOVO: negli open data della Camera, ad esempio,
 * Madia esce dal PD il 06.05.2026 ed entra in IV lo stesso 06.05.2026, e i voti
 * di quel giorno la riportano già in IV.
 * Se nessun periodo soddisfa la regola, si accettano quelli che finiscono proprio il giorno D.
 */
export function periodiAttivi(periodi, D) {
  const inCorso = periodi.filter((p) => p.inizio <= D && (!p.fine || p.fine > D));
  if (inCorso.length) return inCorso;
  return periodi.filter((p) => p.inizio <= D && p.fine === D);
}

/** Raggruppa un array in una Map: chiave -> array di elementi. */
export function raggruppa(array, chiave) {
  const m = new Map();
  for (const x of array) {
    const k = typeof chiave === 'function' ? chiave(x) : x[chiave];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

/** Valori distinti (non vuoti) di un campo in un array di righe. */
export function distinti(righe, campo) {
  return [...new Set(righe.map((r) => r[campo]).filter((v) => v != null && v !== ''))];
}

export const ISTRUZIONI_GRUPPI =
  'Compila "ordine" (numero: posizione da sinistra a destra nell\'emiciclo) e "colore" (es. "#1F77B4") ' +
  'per ogni gruppo. Facoltativo: "etichetta", una sigla breve da mostrare al posto di quella ufficiale ' +
  '(utile per le sigle lunghe). Puoi anche correggere "nome". Lo script aggiunge da solo i gruppi nuovi ' +
  'e non modifica mai i valori già scritti. Le sigle sono quelle delle fonti ufficiali e possono cambiare ' +
  'nel tempo (es. un gruppo che cambia nome).';

/**
 * Controlla la votazione, aggiorna data/gruppi.json e scrive data/votazioni/<slug>.json.
 * Si ferma con ErroreDati se i conteggi non tornano o se manca un gruppo.
 *
 * @param {object} v  votazione già costruita da camera.mjs o senato.mjs
 * @param {object} opzioni { radice }  cartella del progetto
 * @returns {{ file: string, nuoviGruppi: string[] }}
 */
export async function controllaESalva(v, { radice }) {
  // --- 1. Controlli ---------------------------------------------------------
  const errori = [];
  const visti = new Set();
  const sigle = new Set(v.gruppi.map((g) => g.sigla));
  for (const p of v.parlamentari) {
    const chi = `${p.cognome} ${p.nome} (${p.id_fonte})`;
    if (visti.has(p.id_fonte)) errori.push(`parlamentare presente due volte: ${chi}`);
    visti.add(p.id_fonte);
    if (!String(p.cognome ?? '').trim()) errori.push(`parlamentare senza nome nei dati: ${p.id_fonte}`);
    if (!p.gruppo) errori.push(`parlamentare senza gruppo: ${chi}`);
    else if (!sigle.has(p.gruppo)) errori.push(`gruppo "${p.gruppo}" di ${chi} non è nell'elenco dei gruppi`);
    if (!VOTI.includes(p.voto)) errori.push(`voto non valido "${p.voto}" per ${chi}`);
    if (p.governo && !['presidente', 'vicepresidente', 'ministro', 'viceministro', 'sottosegretario'].includes(p.governo.ruolo)) {
      errori.push(`ruolo di Governo non valido "${p.governo.ruolo}" per ${chi}`);
    }
  }
  const conta = (voto) => v.parlamentari.filter((p) => p.voto === voto).length;
  for (const [voto, campo] of [['favorevole', 'favorevoli'], ['contrario', 'contrari'], ['astenuto', 'astenuti']]) {
    if (conta(voto) !== v.totali[campo]) {
      errori.push(`${campo}: contati ${conta(voto)} parlamentari, ma il totale ufficiale è ${v.totali[campo]}`);
    }
  }
  if (errori.length) throw new ErroreDati('Controlli non superati:\n  - ' + errori.join('\n  - '));

  // --- 2. data/gruppi.json: aggiungo i gruppi nuovi, leggo ordine e colore ---
  // Gli aggiornamenti si fanno uno alla volta (scarica-periodo scarica Camera e Senato insieme).
  const nuoviGruppi = [];
  const fileGruppi = path.join(radice, 'data', 'gruppi.json');
  const turno = codaGruppi.then(() => aggiornaGruppi(v, fileGruppi, nuoviGruppi));
  codaGruppi = turno.catch(() => {});
  await turno;

  // --- 3. Scrittura del file della votazione ---------------------------------
  v.gruppi.sort((a, b) => (a.ordine ?? Infinity) - (b.ordine ?? Infinity) || a.sigla.localeCompare(b.sigla, 'it'));
  v.parlamentari.sort((a, b) => a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
  return scriviVotazione(v, radice, nuoviGruppi);
}

let codaGruppi = Promise.resolve();

async function aggiornaGruppi(v, fileGruppi, nuoviGruppi) {
  let archivio;
  try {
    archivio = JSON.parse(await fs.readFile(fileGruppi, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw new ErroreDati(`data/gruppi.json non è leggibile: ${e.message}`);
    archivio = { _istruzioni: ISTRUZIONI_GRUPPI, camera: [], senato: [] };
  }
  if (!Array.isArray(archivio[v.ramo])) archivio[v.ramo] = [];
  for (const g of v.gruppi) {
    let voce = archivio[v.ramo].find((x) => x.sigla === g.sigla);
    if (!voce) {
      voce = { sigla: g.sigla, nome: g.nome, ordine: null, colore: null };
      archivio[v.ramo].push(voce);
      nuoviGruppi.push(g.sigla);
    } else if (!voce.nome && g.nome) {
      voce.nome = g.nome;
    }
    g.ordine = voce.ordine ?? null;
    g.colore = voce.colore ?? null;
  }
  await fs.mkdir(path.dirname(fileGruppi), { recursive: true });
  await scriviAtomico(fileGruppi, JSON.stringify(archivio, null, 2) + '\n');
}

async function scriviVotazione(v, radice, nuoviGruppi) {
  const uscita = {
    slug: v.slug,
    ramo: v.ramo,
    legislatura: v.legislatura,
    seduta: v.seduta,
    numero_votazione: v.numero_votazione,
    data: v.data,
    titolo: v.titolo,
    descrizione: v.descrizione,
    fonti: v.fonti,
    totali: v.totali,
    esito: v.esito,
    tipo: v.tipo ?? null,
    gruppi: v.gruppi.map(({ sigla, nome, ordine, colore }) => ({ sigla, nome, ordine, colore })),
    // "governo" c'è solo per chi fa parte del Governo: { ruolo, incarichi: [...] }
    parlamentari: v.parlamentari.map(({ id_fonte, nome, cognome, gruppo, voto, governo }) => ({ id_fonte, nome, cognome, gruppo, voto, ...(governo ? { governo } : {}) })),
  };
  const file = path.join(radice, 'data', 'votazioni', `${v.slug}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await scriviAtomico(file, JSON.stringify(uscita, null, 2) + '\n');
  return { file, nuoviGruppi };
}

/**
 * Scrive un file "tutto o niente": prima in un file temporaneo, poi lo rinomina.
 * Così chi legge nello stesso momento (es. la build durante un download) non trova mai un file a metà.
 */
async function scriviAtomico(file, contenuto) {
  const temporaneo = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporaneo, contenuto);
  await fs.rename(temporaneo, file);
}

/**
 * Tiene le righe "valide alla data D", con la stessa regola che prima stava nelle query SPARQL:
 * inizio <= D e (nessuna fine oppure fine >= D). Le date sono confrontate come testo, nel formato
 * della fonte (Camera AAAAMMGG, Senato AAAA-MM-GG), esattamente come faceva STR() nella query.
 */
export function valideAllaData(righe, D, inizio = 'inizio', fine = 'fine') {
  return righe.filter((r) => String(r[inizio]) <= D && (r[fine] == null || String(r[fine]) >= D));
}

/**
 * Pezzo da aggiungere (dentro il WHERE) alle query "per legislatura" (mandati, adesioni…): per la
 * legislatura in corso contiene la data di oggi, così la risposta in cache vale solo per oggi
 * (i gruppi cambiano); per le legislature finite è vuoto e la risposta resta valida per sempre.
 * È un filtro sempre vero: non cambia i risultati. (Non un commento "#": il Senato li rifiuta.)
 */
export function validitaCache(legislaturaInCorso) {
  return legislaturaInCorso ? `\n  FILTER(STRLEN("dati al ${new Date().toISOString().slice(0, 10)}") > 0)` : '';
}
