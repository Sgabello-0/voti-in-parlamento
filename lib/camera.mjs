// Camera dei deputati: open data di https://dati.camera.it (ontologia OCD),
// interrogati tramite l'endpoint SPARQL https://dati.camera.it/sparql.
//
// Cosa usiamo:
//  - ocd:votazione  -> totali ufficiali, data, descrizione, esito
//  - ocd:voto       -> voto di ogni deputato + sigla del gruppo AL MOMENTO DEL VOTO (ocd:siglaGruppo)
//  - ocd:mandatoCamera -> chi è in carica alla data (anche chi non compare nel tabulato)
//  - ocd:adesioneGruppo (ocd:aderisce) con date di inizio/fine -> gruppo alla data
//  - ocd:componenteGruppoMisto (ocd:siComponeDi) con date -> componente del Misto alla data
//
// La sigla del gruppo viene presa dal voto stesso; le adesioni con date servono
// come controllo incrociato e per i deputati in carica che non compaiono nel
// tabulato (il Presidente della Camera, che per prassi non vota).

import { ErroreDati, dataISO, pulisciTesto, periodiAttivi, raggruppa, distinti, valideAllaData, validitaCache } from './comune.mjs';
import { LEGISLATURE } from './legislature.mjs';
import { membriGoverno } from './governo.mjs';
import { tipoCamera, codiceLeggibile } from './tipi.mjs';

const ENDPOINT = 'https://dati.camera.it/sparql';
const OCD = 'http://dati.camera.it/ocd/';
const DC = 'http://purl.org/dc/elements/1.1/';
const PREFISSI = `PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
`;

/**
 * Scarica e ricostruisce una votazione della Camera.
 * @param {{legislatura:number, seduta:number, numero:number}} param
 * @param {(endpoint:string, query:string) => Promise<object[]>} interroga
 * @param {string[]} avvisi  array in cui aggiungere gli avvisi non bloccanti
 */
export async function votazioneCamera({ legislatura, seduta, numero }, interroga, avvisi) {
  const q = (testo) => interroga(ENDPOINT, PREFISSI + testo);
  const LEG = `<${OCD}legislatura.rdf/repubblica_${legislatura}>`;

  // --- 1. La votazione --------------------------------------------------------
  // Gli URI sono del tipo .../votazione.rdf/vs19_747_053: cerco, tra le
  // votazioni della seduta, quella che termina con "_053".
  // La seduta di solito è .../seduta.rdf/s19_747, ma nelle prime sedute della XIX il numero
  // ha gli zeri davanti (s19_004): se la prima forma non trova niente, provo l'altra.
  const suffisso = '_' + String(numero).padStart(3, '0');
  const cercaVotazione = (sedutaUri) => q(`SELECT DISTINCT ?v ?p ?o WHERE {
  ?v a ocd:votazione ; ocd:rif_seduta ${sedutaUri} .
  FILTER(STRENDS(STR(?v), "${suffisso}"))
  ?v ?p ?o }`);
  let r1 = await cercaVotazione(`<${OCD}seduta.rdf/s${legislatura}_${seduta}>`);
  const conZeri = String(seduta).padStart(3, '0');
  if (r1.length === 0 && conZeri !== String(seduta)) r1 = await cercaVotazione(`<${OCD}seduta.rdf/s${legislatura}_${conZeri}>`);
  const trovate = distinti(r1, 'v');
  if (trovate.length === 0) {
    throw new ErroreDati(
      `Camera: votazione n. ${numero} della seduta ${seduta} (legislatura ${legislatura}) non trovata negli open data.\n` +
        `  Controlla i numeri su https://www.camera.it/leg${legislatura}/410?idSeduta=${String(seduta).padStart(4, '0')}&tipo=votazioni\n` +
        `  Nota: dati.camera.it pubblica i voti di solito il giorno dopo la seduta (primo pomeriggio).`,
    );
  }
  if (trovate.length > 1) throw new ErroreDati(`Camera: più votazioni corrispondono a ${seduta}/${numero}: ${trovate.join(', ')}`);
  const V = trovate[0];
  const valori = (p) => distinti(r1.filter((r) => r.p === p), 'o');
  const uno = (p) => valori(p)[0];
  const numeroDa = (p) => {
    const x = uno(p);
    if (x == null || !/^\d+$/.test(x.trim())) throw new ErroreDati(`Camera: la votazione ${V} non ha un valore valido per ${p}`);
    return Number(x);
  };

  if (uno(OCD + 'votazioneSegreta') === '1') {
    throw new ErroreDati(`Camera: la votazione ${seduta}/${numero} è a scrutinio segreto: i voti dei singoli deputati non sono pubblici.`);
  }

  const data = dataISO(uno(DC + 'date'));
  const D = data; // data del voto, formato AAAA-MM-GG
  const Dc = data.replaceAll('-', ''); // la Camera scrive le date come AAAAMMGG

  const totali = {
    favorevoli: numeroDa(OCD + 'favorevoli'),
    contrari: numeroDa(OCD + 'contrari'),
    astenuti: numeroDa(OCD + 'astenuti'),
    presenti: numeroDa(OCD + 'presenti'),
    votanti: numeroDa(OCD + 'votanti'),
  };
  // Alla Camera: presenti = votanti + astenuti, votanti = favorevoli + contrari
  // (vedi la legenda della scheda di votazione su documenti.camera.it).
  if (totali.presenti !== totali.favorevoli + totali.contrari + totali.astenuti ||
      totali.votanti !== totali.favorevoli + totali.contrari) {
    throw new ErroreDati(`Camera: totali ufficiali incoerenti tra loro: ${JSON.stringify(totali)}`);
  }
  const approvato = uno(OCD + 'approvato');
  const esito = approvato === '1' ? 'approvato' : approvato === '0' ? 'respinto' : null;
  const ufficiale = pulisciTesto(uno(DC + 'description')) || pulisciTesto(uno(DC + 'title'));
  const finale = uno(OCD + 'votazioneFinale') === '1';

  // Atto votato: uso il collegamento ocd:rif_attoCamera se c'è; altrimenti, se la
  // descrizione ufficiale contiene "PDL <n>" o "DDL <n>", cerco l'atto Camera con quel numero.
  let atto = uno(OCD + 'rif_attoCamera');
  if (!atto) {
    // "PDL 2830 …" / "DDL 3043-A …", oppure il numero di un ordine del giorno: "9/2830 E ABB/4" (atto 2830)
    const m = ufficiale.match(/\b(?:PDL|DDL)\s+(\d+)/i) || ufficiale.match(/\b9\/(\d+)/);
    if (m) atto = `${OCD}attocamera.rdf/ac${legislatura}_${m[1]}`;
  }
  let titoloAtto = '';
  if (atto) {
    const ra = await q(`SELECT DISTINCT ?t WHERE { <${atto}> dc:title ?t }`);
    titoloAtto = pulisciTesto(ra[0]?.t);
    if (!titoloAtto) avvisi.push(`Titolo dell'atto ${atto} non trovato.`);
  }
  const { titolo, descrizione } = titoloLeggibile(ufficiale, titoloAtto, finale);
  const tipo = tipoCamera({ tipoUfficiale: uno(DC + 'type') ?? '', descrizione: ufficiale, finale, fiducia: uno(OCD + 'richiestaFiducia') === '1' });

  // --- 2. I voti dei singoli deputati ----------------------------------------
  const r2 = await q(`SELECT DISTINCT ?dep ?tipo ?etichetta ?sigla ?nome ?cognome WHERE {
  ?x ocd:rif_votazione <${V}> ; ocd:rif_deputato ?dep ; dc:type ?tipo ; dc:title ?etichetta .
  OPTIONAL { ?x ocd:siglaGruppo ?sigla }
  OPTIONAL { ?dep foaf:firstName ?nome }
  OPTIONAL { ?dep foaf:surname ?cognome } }`);
  if (r2.length === 0) throw new ErroreDati(`Camera: la votazione ${V} esiste ma non ha (ancora) i voti dei singoli deputati.`);

  const votanti = new Map(); // URI deputato -> { voto, sigla, nome, cognome }
  for (const [dep, righe] of raggruppa(r2, 'dep')) {
    const tipi = distinti(righe, 'tipo');
    const etichette = distinti(righe, 'etichetta').map((e) => e.trim());
    const sigle = distinti(righe, 'sigla');
    if (tipi.length !== 1 || etichette.length !== 1) {
      throw new ErroreDati(`Camera: voti contraddittori per ${dep}: ${tipi.join(' / ')} — ${etichette.join(' / ')}`);
    }
    // Più sigle per lo stesso voto: incoerente. Nessuna sigla (succede nella XVIII): il gruppo si
    // ricava dopo dall'adesione ufficiale al gruppo alla data (vedi il controllo incrociato, sezione 7).
    if (sigle.length > 1) {
      throw new ErroreDati(`Camera: il voto di ${etichette[0]} (${dep}) ha ${sigle.length} sigle di gruppo: [${sigle.join(', ')}]`);
    }
    const voto = votoCamera(tipi[0], etichette[0]);
    if (!voto) throw new ErroreDati(`Camera: tipo di voto non riconosciuto per ${dep}: "${tipi[0]}" / "${etichette[0]}"`);
    votanti.set(dep, {
      voto,
      sigla: sigle[0] ?? null,
      nome: distinti(righe, 'nome')[0] ?? '',
      cognome: distinti(righe, 'cognome')[0] ?? '',
    });
  }

  // Mandati, adesioni e componenti del Misto: una query per legislatura (in cache per tutte le
  // votazioni), poi filtro alla data del voto con la stessa regola che prima stava nella query.
  const cache = validitaCache(!LEGISLATURE[legislatura]?.fine);

  // --- 3. Deputati in carica alla data ---------------------------------------
  const r3 = valideAllaData(await q(`SELECT DISTINCT ?dep ?inizio ?fine ?nome ?cognome WHERE {
  ?m a ocd:mandatoCamera ; ocd:rif_leg ${LEG} ; ocd:rif_deputato ?dep ; ocd:startDate ?inizio .
  OPTIONAL { ?m ocd:endDate ?fine }
  OPTIONAL { ?dep foaf:firstName ?nome }
  OPTIONAL { ?dep foaf:surname ?cognome } ${cache} }`), Dc);
  const inCarica = new Map(); // URI -> { nome, cognome }
  for (const [dep, righe] of raggruppa(r3, 'dep')) {
    const periodi = righe.map((r) => ({ inizio: dataISO(r.inizio), fine: r.fine ? dataISO(r.fine) : null }));
    // Per chi NON compare nel tabulato uso la regola stretta (fine > data).
    if (periodi.some((p) => p.inizio <= D && (!p.fine || p.fine > D))) {
      inCarica.set(dep, { nome: distinti(righe, 'nome')[0] ?? '', cognome: distinti(righe, 'cognome')[0] ?? '' });
    }
  }

  // --- 4. Adesioni ai gruppi alla data -----------------------------------------
  const r4 = valideAllaData(valideAllaData(await q(`SELECT DISTINCT ?dep ?gruppo ?inizio ?fine ?mi ?mf WHERE {
  ?m a ocd:mandatoCamera ; ocd:rif_leg ${LEG} ; ocd:rif_deputato ?dep ; ocd:startDate ?mi .
  OPTIONAL { ?m ocd:endDate ?mf }
  ?dep ocd:aderisce ?a . ?a ocd:rif_gruppoParlamentare ?gruppo ; ocd:startDate ?inizio .
  OPTIONAL { ?a ocd:endDate ?fine } ${cache} }`), Dc, 'mi', 'mf'), Dc);

  // --- 5. Gruppi della legislatura con i nomi precedenti -----------------------
  const r5 = await q(`SELECT DISTINCT ?gruppo ?titolo ?sigla ?dTitolo ?dSigla ?dFine WHERE {
  ?gruppo a ocd:gruppoParlamentare ; ocd:rif_leg ${LEG} ; dc:title ?titolo .
  OPTIONAL { ?gruppo dct:alternative ?sigla }
  OPTIONAL { ?gruppo ocd:denominazione ?d . ?d dc:title ?dTitolo ; dc:date ?dFine .
             OPTIONAL { ?d dct:alternative ?dSigla } } }`);

  // --- 6. Componenti del gruppo Misto alla data --------------------------------
  const r6 = valideAllaData(await q(`SELECT DISTINCT ?dep ?comp ?titolo ?sigla ?inizio ?fine ?dTitolo ?dSigla ?dFine WHERE {
  ?comp a ocd:componenteGruppoMisto ; ocd:rif_leg ${LEG} ; dc:title ?titolo ; ocd:siComponeDi ?n .
  OPTIONAL { ?comp dct:alternative ?sigla }
  OPTIONAL { ?comp ocd:denominazione ?d . ?d dc:title ?dTitolo ; dc:date ?dFine .
             OPTIONAL { ?d dct:alternative ?dSigla } }
  ?n ocd:rif_deputato ?dep ; ocd:startDate ?inizio .
  OPTIONAL { ?n ocd:endDate ?fine } ${cache} }`), Dc);

  const infoGruppi = descriviGruppi(r5, 'gruppo');
  const infoComponenti = descriviGruppi(r6, 'comp');
  const adesioniPer = raggruppa(r4.map((r) => ({ ...r, inizio: dataISO(r.inizio), fine: r.fine ? dataISO(r.fine) : null })), 'dep');
  const componentiPer = raggruppa(r6.map((r) => ({ ...r, inizio: dataISO(r.inizio), fine: r.fine ? dataISO(r.fine) : null })), 'dep');

  /** Gruppo (ed eventuale componente del Misto) di un deputato alla data, dalle adesioni. */
  // precedente=true: il gruppo (o la componente) che il deputato lascia proprio il giorno D.
  // Serve perché, il giorno di un cambio di gruppo, il voto può essere avvenuto prima o dopo
  // il cambio: la sigla registrata nel voto dice quale dei due vale (vedi controllo qui sotto).
  function affiliazione(dep, chi, precedente = false) {
    // "Prima": la situazione del giorno precedente (periodi iniziati prima di D e non finiti prima di D).
    // Comprende sia chi lascia un gruppo il giorno D sia chi entra in una componente del Misto il giorno D
    // (es. Sangregorio, 8/5/2018: entra in "Noi con l'Italia" e il voto è registrato come Misto).
    const giornoPrima = (p) => p.inizio < D && (!p.fine || p.fine >= D);
    const adesioni = adesioniPer.get(dep) ?? [];
    const gruppi = distinti(precedente ? adesioni.filter(giornoPrima) : periodiAttivi(adesioni, D), 'gruppo');
    if (gruppi.length > 1) throw new ErroreDati(`Camera: ${chi} risulta in più gruppi il ${D}: ${gruppi.join(', ')}`);
    if (gruppi.length === 0) return null;
    const membri = componentiPer.get(dep) ?? [];
    let componenti = distinti(precedente ? membri.filter(giornoPrima) : periodiAttivi(membri, D), 'comp');
    // Negli open data della XVII la stessa componente del Misto può avere più identificativi con la
    // stessa base (es. cgm1629 e cgm1629+1769, MAIE), con gli stessi iscritti negli stessi giorni:
    // li tratto come una sola componente (identificata dalla base) e uso il primo per il nome.
    const base = (c) => c.replace(/\+[^/]*$/, '');
    if (componenti.length > 1 && new Set(componenti.map(base)).size === 1) componenti = [componenti.sort((a, b) => a.length - b.length)[0]];
    if (componenti.length > 1) throw new ErroreDati(`Camera: ${chi} risulta in più componenti del Misto il ${D}: ${componenti.join(', ')}`);
    if (componenti.length === 1) {
      const c = infoComponenti.get(componenti[0]);
      return { chiave: gruppi[0] + ' | ' + base(componenti[0]), nome: nomeAllaData(c, D), siglaOpenData: c.sigla };
    }
    const g = infoGruppi.get(gruppi[0]);
    return { chiave: gruppi[0], nome: g ? nomeAllaData(g, D) : '', siglaOpenData: g?.sigla ?? '' };
  }

  // --- 7. Controllo incrociato: sigla nel voto <-> adesione alla data ----------
  const aff = new Map();
  const chiaviPerSigla = new Map(); // sigla del voto -> Map(chiave -> [deputati])
  const siglePerChiave = new Map(); // chiave -> Set(sigle del voto)
  // Prima i deputati che non cambiano gruppo il giorno del voto (danno la corrispondenza
  // sigla <-> gruppo), poi quelli che lo cambiano proprio quel giorno.
  const cambiOggi = new Map(); // dep -> affiliazione del gruppo lasciato il giorno D
  const ordine = [...votanti].map(([dep, x]) => {
    const chi = `${x.cognome} ${x.nome}`.trim() || dep;
    const prima = affiliazione(dep, chi, true);
    const dopo = affiliazione(dep, chi);
    if (prima && dopo && prima.chiave !== dopo.chiave) cambiOggi.set(dep, prima);
    aff.set(dep, dopo);
    return [dep, x, chi];
  }).sort((a, b) => (cambiOggi.has(a[0]) ? 1 : 0) - (cambiOggi.has(b[0]) ? 1 : 0));
  for (const [dep, x, chi] of ordine) {
    if (!x.sigla) continue; // senza sigla nel voto: si risolve più sotto, dalle adesioni
    let a = aff.get(dep);
    if (!a) {
      avvisi.push(`${chi}: adesione al gruppo non trovata negli open data per il ${D}; uso solo la sigla del voto (${x.sigla}).`);
      continue;
    }
    // Cambio di gruppo il giorno stesso del voto: se la sigla del voto corrisponde al gruppo
    // lasciato, il voto è avvenuto prima del cambio e vale quello (es. Fabrizio Sala, 28/10/2026).
    const prima = cambiOggi.get(dep);
    const nota = chiaviPerSigla.get(x.sigla);
    const sigleNuovo = siglePerChiave.get(a.chiave);
    const votoPrimaDelCambio = prima && (
      // la sigla del voto è quella del gruppo lasciato (e non del nuovo)
      (nota && nota.has(prima.chiave) && !nota.has(a.chiave)) ||
      // oppure: i compagni del nuovo gruppo votano con un'altra sigla, e questa non è usata da nessun altro
      (!nota && sigleNuovo && !sigleNuovo.has(x.sigla)));
    if (votoPrimaDelCambio) {
      a = prima;
      aff.set(dep, a);
      avvisi.push(`${chi}: ha cambiato gruppo il ${D}; il voto è registrato con il gruppo che ha lasciato quel giorno (${x.sigla}).`);
    }
    if (!chiaviPerSigla.has(x.sigla)) chiaviPerSigla.set(x.sigla, new Map());
    const perChiave = chiaviPerSigla.get(x.sigla);
    if (!perChiave.has(a.chiave)) perChiave.set(a.chiave, []);
    perChiave.get(a.chiave).push(chi);
    if (!siglePerChiave.has(a.chiave)) siglePerChiave.set(a.chiave, new Set());
    siglePerChiave.get(a.chiave).add(x.sigla);
  }
  const incoerenze = [];
  for (const [sigla, perChiave] of chiaviPerSigla) {
    if (perChiave.size > 1) {
      const dett = [...perChiave].map(([k, deps]) => `${k} (${deps.slice(0, 5).join(', ')}${deps.length > 5 ? ', …' : ''})`);
      incoerenze.push(`la sigla "${sigla}" nei voti corrisponde a gruppi diversi nelle adesioni: ${dett.join(' ; ')}`);
    }
  }
  for (const [chiave, sigle] of siglePerChiave) {
    if (sigle.size > 1) incoerenze.push(`il gruppo ${chiave} compare con più sigle nei voti: ${[...sigle].join(', ')}`);
  }
  if (incoerenze.length) {
    throw new ErroreDati(
      `Camera: le sigle di gruppo dei voti non coincidono con le adesioni ai gruppi al ${D}:\n  - ` + incoerenze.join('\n  - ') +
        '\n  Possibili cause: adesioni non ancora aggiornate negli open data, o cambio di gruppo il giorno stesso del voto.',
    );
  }
  const nomeDiSigla = new Map();
  for (const [sigla, perChiave] of chiaviPerSigla) {
    const chiave = [...perChiave.keys()][0];
    const dep = [...votanti].find(([d, x]) => x.sigla === sigla && aff.get(d)?.chiave === chiave)[0];
    nomeDiSigla.set(sigla, aff.get(dep).nome);
  }

  // Voti senza la sigla del gruppo: uso l'adesione ufficiale al gruppo (o alla componente del
  // Misto) alla data del voto, ma solo se è sicura: un'adesione sola, nessun cambio di gruppo
  // quel giorno, e una sigla sola usata nel voto dagli altri deputati dello stesso gruppo
  // (altrimenti la sigla ufficiale del gruppo negli open data). Se non è sicura: errore.
  for (const [dep, x, chi] of ordine) {
    if (x.sigla) continue;
    const a = aff.get(dep);
    if (!a) throw new ErroreDati(`Camera: il voto di ${chi} non ha la sigla del gruppo e non c'è un'adesione a un gruppo il ${D}.`);
    if (cambiOggi.has(dep)) throw new ErroreDati(`Camera: il voto di ${chi} non ha la sigla del gruppo e il deputato ha cambiato gruppo proprio il ${D}.`);
    const usate = siglePerChiave.get(a.chiave);
    let sigla = usate && usate.size === 1 ? [...usate][0] : null;
    if (!sigla && !usate && a.siglaOpenData && !chiaviPerSigla.has(a.siglaOpenData)) {
      sigla = a.siglaOpenData;
      nomeDiSigla.set(sigla, a.nome);
    }
    if (!sigla) throw new ErroreDati(`Camera: il voto di ${chi} non ha la sigla del gruppo e non riesco a ricavarla con certezza dall'adesione (${a.chiave}).`);
    x.sigla = sigla;
    avvisi.push(`${chi}: nel voto manca la sigla del gruppo; uso l'adesione ufficiale al gruppo il ${D} (${sigla}).`);
  }

  // --- 8. Elenco completo dei deputati -----------------------------------------
  const parlamentari = [];
  for (const [dep, x] of votanti) {
    if (!inCarica.has(dep)) avvisi.push(`${x.cognome} ${x.nome}: compare nel tabulato ma non risulta in carica il ${D} nei mandati.`);
    parlamentari.push({ id_fonte: dep, nome: x.nome, cognome: x.cognome, gruppo: x.sigla, voto: x.voto });
  }
  for (const [dep, p] of inCarica) {
    if (votanti.has(dep)) continue;
    // In carica ma assente dal tabulato: per la Camera è il caso del Presidente
    // della Camera, che non partecipa alle votazioni.
    const chi = `${p.cognome} ${p.nome}`;
    const a = affiliazione(dep, chi);
    let sigla = '';
    if (a) {
      const s = siglePerChiave.get(a.chiave);
      if (s && s.size === 1) sigla = [...s][0];
      else if (a.siglaOpenData) {
        sigla = a.siglaOpenData;
        if (!nomeDiSigla.has(sigla)) nomeDiSigla.set(sigla, a.nome);
        avvisi.push(`${chi}: nessun altro deputato del suo gruppo nel tabulato, uso la sigla degli open data "${sigla}".`);
      }
    }
    avvisi.push(`${chi}: in carica ma non presente nel tabulato della votazione -> "non_votante" (atteso solo per il Presidente della Camera).`);
    parlamentari.push({ id_fonte: dep, nome: p.nome, cognome: p.cognome, gruppo: sigla, voto: 'non_votante' });
  }

  // --- 9. Membri del Governo alla data (per il "banco del Governo" nel sito) --------
  // Negli open data della Camera la persona p302103 e il deputato d302103_19 sono la stessa.
  const governo = await membriGoverno({ legislatura, data: D }, interroga, avvisi);
  for (const p of parlamentari) {
    const id = p.id_fonte.match(/\/d(\d+)_\d+$/)?.[1];
    const m = id ? governo.get(id) : null;
    if (m) p.governo = { ruolo: m.ruolo, incarichi: m.incarichi };
  }

  const sigleUsate = [...new Set(parlamentari.map((p) => p.gruppo).filter(Boolean))];
  const gruppi = sigleUsate.map((sigla) => {
    const nome = nomeDiSigla.get(sigla) ?? '';
    if (!nome) avvisi.push(`Nome per esteso del gruppo "${sigla}" non ricavabile dagli open data: lasciato vuoto.`);
    return { sigla, nome };
  });

  return {
    ramo: 'camera',
    legislatura,
    seduta,
    numero_votazione: numero,
    data,
    titolo,
    tipo,
    descrizione,
    fonti: [
      {
        nome: 'Camera dei deputati – dati.camera.it (votazione e voti dei deputati)',
        url: V,
        licenza: 'CC BY-SA 4.0',
      },
    ],
    totali,
    esito,
    gruppi,
    parlamentari,
  };
}

/**
 * Titolo leggibile e descrizione di una votazione, ricavati dai testi ufficiali.
 * - Se la descrizione ufficiale è un codice (es. "DDL 3043-A - VOTO FINALE",
 *   "PDL 2830 E ABB - EM 1.1"), il titolo è l'oggetto dell'atto (il testo tra virgolette
 *   nel suo titolo) seguito da cosa si vota: "Disposizioni per … – voto finale".
 * - Se la descrizione ufficiale è già un titolo vero e proprio, resta quella.
 * Nessun testo è inventato: sono pezzi dei titoli ufficiali.
 */
function titoloLeggibile(ufficiale, titoloAtto, finale) {
  // Formula detta in Aula all'inizio della descrizione ("Indico la votazione per appello nominale
  // sulla mozione di fiducia …"): nel titolo resta solo l'oggetto ("Mozione di fiducia …").
  const formula = ufficiale.match(/^Indico la votazione[^,]*?\s+su(?:lla|llo|l|i|gli|lle)?\s+(.+)$/i);
  if (formula) ufficiale = formula[1][0].toUpperCase() + formula[1].slice(1);
  const virgolette = titoloAtto.match(/["“]([^"”]{10,})["”]/);
  const oggetto = virgolette ? virgolette[1].trim() : titoloAtto;
  const codice = ufficiale.match(/^[^a-z]*\b(?:PDL|DDL)\s+\d+[^a-z]*?\s+-\s+([^a-z]+)$/);
  if (codice && oggetto) {
    return { titolo: `${oggetto} – ${codiceLeggibile(codice[1])}`, descrizione: titoloAtto !== oggetto ? titoloAtto : ufficiale };
  }
  // Solo un codice, senza l'atto (es. "EM 4.101"): lo rendo leggibile ("Emendamento 4.101").
  if (!/[a-z]/.test(ufficiale) && /^(SUB-?)?EM|^ODG|^ART|^MANTENIMENTO/i.test(ufficiale)) {
    const leggibile = codiceLeggibile(ufficiale);
    const titolo = leggibile[0].toUpperCase() + leggibile.slice(1);
    return { titolo: oggetto ? `${oggetto} – ${leggibile}` : titolo, descrizione: titoloAtto || '' };
  }
  // Descrizione breve (es. "Ordine del giorno 9/2830 E ABB/4") e atto noto: "Oggetto – ordine del giorno …"
  if (oggetto && !finale && ufficiale.length <= 80) {
    return { titolo: `${oggetto} – ${ufficiale[0].toLowerCase()}${ufficiale.slice(1)}`, descrizione: titoloAtto };
  }
  const titolo = finale && !/voto finale/i.test(ufficiale) ? `${ufficiale} – voto finale` : ufficiale;
  return { titolo, descrizione: titoloAtto && titoloAtto !== ufficiale ? titoloAtto : '' };
}

/**
 * Traduce il voto della Camera nei valori del progetto.
 * dc:type vale "Favorevole", "Contrario", "Astensione" o "Non ha votato";
 * per "Non ha votato" il motivo è nella frase (dc:title), es. "... in missione".
 */
function votoCamera(tipo, etichetta) {
  const t = tipo.trim().toLowerCase();
  const e = etichetta.trim().toLowerCase();
  if (t === 'favorevole') return 'favorevole';
  if (t === 'contrario') return 'contrario';
  if (t === 'astensione') return 'astenuto';
  if (t === 'non ha votato') {
    if (e.endsWith('in missione')) return 'missione';
    if (e.endsWith('ha presieduto')) return 'non_votante'; // presidente di turno
    if (e.endsWith('non ha partecipato')) return 'assente';
  }
  return null;
}

/** Da righe SPARQL a Map(uri -> { titolo, sigla, denominazioni: [{titolo, sigla, fine}] }). */
function descriviGruppi(righe, campo) {
  const m = new Map();
  for (const [uri, rr] of raggruppa(righe, campo)) {
    const denominazioni = [];
    for (const r of rr) {
      if (r.dTitolo && r.dFine && !denominazioni.some((d) => d.titolo === r.dTitolo && d.fine === dataISO(r.dFine))) {
        denominazioni.push({ titolo: r.dTitolo, sigla: r.dSigla ?? '', fine: dataISO(r.dFine) });
      }
    }
    m.set(uri, { titolo: rr[0].titolo, sigla: rr[0].sigla ?? '', denominazioni });
  }
  return m;
}

/**
 * Nome di un gruppo (o componente) alla data D.
 * Le "denominazioni" sono i nomi PRECEDENTI, ognuno valido fino alla sua data:
 * se D è prima di una di queste date vale il nome precedente, altrimenti il nome attuale.
 */
function nomeAllaData(info, D) {
  const precedenti = info.denominazioni.filter((d) => d.fine > D).sort((a, b) => a.fine.localeCompare(b.fine));
  if (precedenti.length) return pulisciNome(precedenti[0].titolo, precedenti[0].sigla);
  return pulisciNome(info.titolo, info.sigla);
}

/** "FRATELLI D'ITALIA (FDI) (18.10.2022" -> "FRATELLI D'ITALIA";  "gia' X (S) fino a 07.07.2026" -> "X". */
function pulisciNome(titolo, sigla) {
  let t = pulisciTesto(titolo).replace(/^gia'?\s+/i, '');
  t = t.replace(/\s*fino a \d{2}\.\d{2}\.\d{4}\s*$/i, '');
  t = t.replace(/\s*\(\d{2}\.\d{2}\.\d{4}(?:\s*-\s*\d{2}\.\d{2}\.\d{4})?\)?\s*$/, '');
  if (sigla && t.endsWith(`(${sigla})`)) t = t.slice(0, -(sigla.length + 2)).trim();
  return t;
}
