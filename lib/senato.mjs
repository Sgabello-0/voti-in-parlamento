// Senato della Repubblica: open data di https://dati.senato.it (ontologia OSR),
// interrogati tramite l'endpoint SPARQL https://dati.senato.it/sparql.
//
// Cosa usiamo:
//  - osr:SedutaAssemblea -> data della seduta
//  - osr:Votazione       -> totali ufficiali, esito, e i senatori per ruolo:
//                           osr:favorevole, osr:contrario, osr:astenuto,
//                           osr:inCongedoMissione, osr:presidente, osr:presenteNonVotante
//                           (+ osr:votante e osr:presente, usati per i controlli)
//  - osr:mandato (ocd:mandatoSenato) -> chi è in carica alla data
//  - ocd:aderisce con osr:gruppo, osr:inizio, osr:fine -> gruppo alla data
//  - osr:denominazione del gruppo (titolo, titoloBreve, inizio, fine) -> nome e sigla alla data
//
// I senatori in carica che non compaiono in nessun ruolo della votazione sono "assente".
// Nota tecnica: l'endpoint del Senato usa una versione di Virtuoso che non accetta
// VALUES né NOT IN, quindi le query usano solo FILTER(... IN (...)).

import { ErroreDati, dataISO, pulisciTesto, periodiAttivi, raggruppa, distinti } from './comune.mjs';
import { membriGoverno, normalizzaNome } from './governo.mjs';
import { tipoSenato } from './tipi.mjs';

const ENDPOINT = 'https://dati.senato.it/sparql';
const OSR = 'http://dati.senato.it/osr/';
const PREFISSI = `PREFIX osr: <http://dati.senato.it/osr/>
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
`;
const RUOLI = ['favorevole', 'contrario', 'astenuto', 'inCongedoMissione', 'presidente', 'presenteNonVotante', 'votante', 'presente'];

/**
 * Scarica e ricostruisce una votazione del Senato.
 * @param {{legislatura:number, seduta:number, numero:number}} param
 * @param {(endpoint:string, query:string) => Promise<object[]>} interroga
 * @param {string[]} avvisi
 */
export async function votazioneSenato({ legislatura, seduta, numero }, interroga, avvisi) {
  const q = (testo) => interroga(ENDPOINT, PREFISSI + testo);

  // --- 1. La seduta -------------------------------------------------------------
  const r1 = await q(`SELECT DISTINCT ?seduta ?data WHERE {
  ?seduta a osr:SedutaAssemblea ; osr:numeroSeduta ?n ; osr:legislatura ?l ; osr:dataSeduta ?data .
  FILTER(STR(?n) = "${seduta}" && STR(?l) = "${legislatura}") }`);
  if (r1.length === 0) throw new ErroreDati(`Senato: seduta ${seduta} della legislatura ${legislatura} non trovata negli open data.`);
  if (distinti(r1, 'seduta').length > 1) throw new ErroreDati(`Senato: più sedute con numero ${seduta}: ${distinti(r1, 'seduta').join(', ')}`);
  const S = r1[0].seduta;
  const data = dataISO(r1[0].data);
  const D = data;

  // --- 2. La votazione ----------------------------------------------------------
  const r2 = await q(`SELECT DISTINCT ?v ?p ?o WHERE {
  ?v a osr:Votazione ; osr:seduta <${S}> ; osr:numero ?n .
  FILTER(STR(?n) = "${numero}")
  ?v ?p ?o . FILTER(isLiteral(?o) || ?p = osr:oggetto) }`);
  const trovate = distinti(r2, 'v');
  if (trovate.length === 0) throw new ErroreDati(`Senato: votazione n. ${numero} della seduta ${seduta} (${data}) non trovata negli open data.`);
  if (trovate.length > 1) throw new ErroreDati(`Senato: più votazioni corrispondono a ${seduta}/${numero}: ${trovate.join(', ')}`);
  const V = trovate[0];
  const uno = (p) => distinti(r2.filter((r) => r.p === OSR + p), 'o')[0];
  const numeroDa = (p) => {
    const x = uno(p);
    if (x == null || !/^\d+$/.test(x.trim())) throw new ErroreDati(`Senato: la votazione ${V} non ha un valore valido per osr:${p}`);
    return Number(x);
  };
  const totali = {
    favorevoli: numeroDa('favorevoli'),
    contrari: numeroDa('contrari'),
    astenuti: numeroDa('astenuti'),
    presenti: numeroDa('presenti'),
    votanti: numeroDa('votanti'),
  };
  const missioneUfficiale = uno('congedoMissione') != null ? numeroDa('congedoMissione') : null;
  const esito = pulisciTesto(uno('esito')).toLowerCase() || null;
  const etichetta = pulisciTesto(distinti(r2.filter((r) => r.p === 'http://www.w3.org/2000/01/rdf-schema#label'), 'o')[0]) || `Votazione n. ${numero}`;

  // Titolo e descrizione leggibili, dai disegni di legge collegati all'oggetto della votazione.
  // Ddl principale: il primo non "assorbito"; titolo = suo titolo breve ufficiale + cosa si vota
  // (es. "Contrasto all'antisemitismo – voto finale"); descrizione = titolo completo + ddl abbinati.
  let titolo = etichetta;
  let descrizione = '';
  const oggetto = uno('oggetto');
  if (oggetto) {
    const rd = await q(`SELECT DISTINCT ?ddl ?fase ?titolo ?breve ?stato WHERE {
  <${oggetto}> osr:relativoA ?ddl . ?ddl osr:fase ?fase .
  OPTIONAL { ?ddl osr:titolo ?titolo } OPTIONAL { ?ddl osr:titoloBreve ?breve } OPTIONAL { ?ddl osr:statoDdl ?stato } }`);
    const ddl = [...raggruppa(rd, 'ddl').values()].map((rr) => ({
      fase: rr[0].fase,
      titolo: pulisciTesto(rr[0].titolo),
      breve: pulisciTesto(rr[0].breve),
      assorbito: /assorbit/i.test(rr[0].stato ?? ''),
    }));
    ddl.sort((a, b) => (parseInt(a.fase.replace(/\D/g, ''), 10) || 0) - (parseInt(b.fase.replace(/\D/g, ''), 10) || 0));
    const principale = ddl.find((d) => !d.assorbito) ?? ddl[0];
    if (principale) {
      const nome = principale.breve || principale.titolo || principale.fase;
      titolo = /^votazione finale$/i.test(etichetta) ? `${nome} – voto finale` : `${nome} – ${etichetta}`;
      const altri = ddl.filter((d) => d !== principale).map((d) => d.fase);
      const insieme = altri.length ? `, esaminato insieme a ${altri.slice(0, -1).join(', ')}${altri.length > 1 ? ' e ' : ''}${altri[altri.length - 1]}` : '';
      descrizione = `${principale.titolo || nome} (${principale.fase}${insieme})`;
    }
  }

  // --- 3. Ruoli dei senatori nella votazione -----------------------------------
  const r3 = await q(`SELECT DISTINCT ?ruolo ?sen WHERE {
  <${V}> ?ruolo ?sen .
  FILTER(?ruolo IN (${RUOLI.map((r) => 'osr:' + r).join(', ')})) }`);
  if (r3.length === 0) throw new ErroreDati(`Senato: la votazione ${V} non ha (ancora) i voti dei singoli senatori.`);
  const ruoliPer = new Map(); // URI senatore -> Set(ruoli)
  for (const r of r3) {
    if (!ruoliPer.has(r.sen)) ruoliPer.set(r.sen, new Set());
    ruoliPer.get(r.sen).add(r.ruolo.slice(OSR.length));
  }
  // Controlli sui totali ufficiali che non riguardano favorevoli/contrari/astenuti
  // (quelli li controlla comune.mjs dopo aver costruito l'elenco).
  const quanti = (ruolo) => [...ruoliPer.values()].filter((s) => s.has(ruolo)).length;
  const errori = [];
  if (quanti('votante') !== totali.votanti) errori.push(`votanti: ${quanti('votante')} nell'elenco, totale ufficiale ${totali.votanti}`);
  if (quanti('presente') !== totali.presenti) errori.push(`presenti: ${quanti('presente')} nell'elenco, totale ufficiale ${totali.presenti}`);
  if (missioneUfficiale != null && quanti('inCongedoMissione') !== missioneUfficiale) {
    errori.push(`in congedo/missione: ${quanti('inCongedoMissione')} nell'elenco, totale ufficiale ${missioneUfficiale}`);
  }
  if (errori.length) throw new ErroreDati('Senato: i conteggi non coincidono con i totali ufficiali:\n  - ' + errori.join('\n  - '));

  // --- 4. Senatori in carica alla data ------------------------------------------
  const r4 = await q(`SELECT DISTINCT ?sen ?inizio ?fine ?nome ?cognome WHERE {
  ?sen a osr:Senatore ; osr:mandato ?m .
  ?m a ocd:mandatoSenato ; osr:inizio ?inizio .
  OPTIONAL { ?m osr:fine ?fine }
  FILTER(STR(?inizio) <= "${D}" && (!BOUND(?fine) || STR(?fine) >= "${D}"))
  OPTIONAL { ?sen foaf:firstName ?nome }
  OPTIONAL { ?sen foaf:lastName ?cognome } }`);
  const anagrafica = new Map(); // URI -> { nome, cognome, inCarica }
  for (const [sen, righe] of raggruppa(r4, 'sen')) {
    const periodi = righe.map((r) => ({ inizio: dataISO(r.inizio), fine: r.fine ? dataISO(r.fine) : null }));
    anagrafica.set(sen, {
      nome: distinti(righe, 'nome')[0] ?? '',
      cognome: distinti(righe, 'cognome')[0] ?? '',
      // per chi non compare nella votazione uso la regola stretta (fine > data)
      inCarica: periodi.some((p) => p.inizio <= D && (!p.fine || p.fine > D)),
    });
  }

  // --- 5. Adesioni ai gruppi e nomi dei gruppi alla data ------------------------
  const r5 = await q(`SELECT DISTINCT ?sen ?gruppo ?inizio ?fine WHERE {
  ?sen a osr:Senatore ; osr:mandato ?m .
  ?m a ocd:mandatoSenato ; osr:inizio ?mi .
  OPTIONAL { ?m osr:fine ?mf }
  FILTER(STR(?mi) <= "${D}" && (!BOUND(?mf) || STR(?mf) >= "${D}"))
  ?sen ocd:aderisce ?a . ?a osr:gruppo ?gruppo ; osr:inizio ?inizio .
  OPTIONAL { ?a osr:fine ?fine }
  FILTER(STR(?inizio) <= "${D}" && (!BOUND(?fine) || STR(?fine) >= "${D}")) }`);
  const r6 = await q(`SELECT DISTINCT ?gruppo ?titolo ?breve ?inizio ?fine WHERE {
  ?gruppo a ocd:gruppoParlamentare ; osr:denominazione ?d .
  ?d osr:titolo ?titolo ; osr:inizio ?inizio .
  OPTIONAL { ?d osr:titoloBreve ?breve }
  OPTIONAL { ?d osr:fine ?fine }
  FILTER(STR(?inizio) <= "${D}" && (!BOUND(?fine) || STR(?fine) >= "${D}")) }`);

  const adesioniPer = raggruppa(r5.map((r) => ({ ...r, inizio: dataISO(r.inizio), fine: r.fine ? dataISO(r.fine) : null })), 'sen');
  const nomiGruppo = new Map(); // URI gruppo -> { sigla, nome }
  for (const [g, righe] of raggruppa(r6.map((r) => ({ ...r, inizio: dataISO(r.inizio), fine: r.fine ? dataISO(r.fine) : null })), 'gruppo')) {
    const attive = periodiAttivi(righe, D);
    const nomi = [...new Map(attive.map((r) => [r.titolo + '|' + (r.breve ?? ''), r])).values()];
    if (nomi.length > 1) throw new ErroreDati(`Senato: il gruppo ${g} ha più denominazioni valide il ${D}: ${nomi.map((r) => r.titolo).join(' / ')}`);
    if (nomi.length === 1) nomiGruppo.set(g, { nome: pulisciTesto(nomi[0].titolo), sigla: pulisciTesto(nomi[0].breve) || pulisciTesto(nomi[0].titolo) });
  }

  function gruppoDi(sen, chi) {
    const gruppi = distinti(periodiAttivi(adesioniPer.get(sen) ?? [], D), 'gruppo');
    if (gruppi.length > 1) throw new ErroreDati(`Senato: ${chi} risulta in più gruppi il ${D}: ${gruppi.join(', ')}`);
    if (gruppi.length === 0) return null;
    const n = nomiGruppo.get(gruppi[0]);
    if (!n) throw new ErroreDati(`Senato: nessuna denominazione valida il ${D} per il gruppo ${gruppi[0]} (di ${chi}).`);
    return n;
  }

  // --- 6. Elenco completo dei senatori ---------------------------------------------
  const parlamentari = [];
  const gruppi = new Map(); // sigla -> nome
  const tutti = new Set([...ruoliPer.keys(), ...[...anagrafica].filter(([, a]) => a.inCarica).map(([s]) => s)]);
  for (const sen of tutti) {
    const a = anagrafica.get(sen);
    if (!a) avvisi.push(`${sen}: compare nella votazione ma non risulta in carica il ${D} nei mandati.`);
    const nome = a?.nome ?? '';
    const cognome = a?.cognome ?? '';
    const chi = `${cognome} ${nome}`.trim() || sen;
    const ruoli = ruoliPer.get(sen) ?? new Set();
    const voto = votoSenato(ruoli);
    if (!voto) throw new ErroreDati(`Senato: combinazione di ruoli non riconosciuta per ${chi}: ${[...ruoli].join(', ')}`);
    const g = gruppoDi(sen, chi);
    if (g) gruppi.set(g.sigla, g.nome);
    parlamentari.push({ id_fonte: sen, nome, cognome, gruppo: g?.sigla ?? '', voto });
  }

  const fonti = [
    {
      nome: 'Senato della Repubblica – dati.senato.it (votazione e voti dei senatori)',
      url: V,
      licenza: 'CC BY 3.0 IT',
    },
  ];

  // --- 7. Membri del Governo alla data (per il "banco del Governo" nel sito) --------
  // Gli incarichi vengono dagli open data della Camera (che elencano tutto il Governo).
  // Abbinamento ai senatori (se non è sicuro, non lo faccio):
  //  - se la Camera ha la data di nascita: stessa data di nascita E cognome compatibile;
  //  - se non ce l'ha (succede per chi non è mai stato deputato): cognome E nome compatibili
  //    ("ALBERTI" / "Alberti Casellati", "MARIA ELISABETTA" / "Maria Elisabetta") e un solo
  //    senatore che corrisponde. Un nome diverso (es. "Sebastiano" / "Nello") non viene abbinato.
  const governo = await membriGoverno({ legislatura, data: D }, interroga, avvisi);
  const rn = await q(`SELECT DISTINCT ?sen ?nascita WHERE {
  ?sen a osr:Senatore ; osr:dataNascita ?nascita ; osr:mandato ?m .
  ?m a ocd:mandatoSenato ; osr:legislatura ?l .
  FILTER(STR(?l) = "${legislatura}") }`);
  const nascitaDi = new Map(rn.map((r) => [r.sen, r.nascita.slice(0, 10)]));
  let abbinati = 0;
  for (const m of governo.values()) {
    const candidati = m.nascita
      ? parlamentari.filter((p) => nascitaDi.get(p.id_fonte) === m.nascita && stessoCognome(p.cognome, m.cognome))
      : parlamentari.filter((p) => stessoCognome(p.cognome, m.cognome) && stessoCognome(p.nome, m.nome));
    if (candidati.length === 1) {
      candidati[0].governo = { ruolo: m.ruolo, incarichi: m.incarichi };
      abbinati++;
    } else if (candidati.length > 1) {
      avvisi.push(`Governo: ${m.cognome} ${m.nome} corrisponde a più senatori, non lo abbino.`);
    }
  }
  if (abbinati) fonti.push({ nome: 'Camera dei deputati – dati.camera.it (incarichi di Governo)', url: 'https://dati.camera.it', licenza: 'CC BY-SA 4.0' });

  return {
    ramo: 'senato',
    legislatura,
    seduta,
    numero_votazione: numero,
    data,
    titolo,
    tipo: tipoSenato(etichetta),
    descrizione,
    fonti,
    totali,
    esito,
    gruppi: [...gruppi].map(([sigla, nome]) => ({ sigla, nome })),
    parlamentari,
  };
}

/** Stesso cognome (o nome), anche se uno dei due ha una parola in più ("ALBERTI" / "Alberti Casellati"). */
function stessoCognome(a, b) {
  const A = normalizzaNome(a).split(' ');
  const B = normalizzaNome(b).split(' ');
  return A.join(' ') === B.join(' ') || A.every((x) => B.includes(x)) || B.every((x) => A.includes(x));
}

/** Traduce i ruoli di un senatore nella votazione nel valore del campo "voto". */
function votoSenato(ruoli) {
  const espressi = ['favorevole', 'contrario', 'astenuto'].filter((r) => ruoli.has(r));
  if (espressi.length > 1) return null;
  if (espressi.length === 1) return espressi[0];
  if (ruoli.has('inCongedoMissione')) return 'missione';
  if (ruoli.has('presidente') || ruoli.has('presenteNonVotante')) return 'non_votante';
  // Registrato come presente ma senza voto espresso (né "votante"): presente che non ha votato.
  if (ruoli.has('presente') && !ruoli.has('votante')) return 'non_votante';
  if (ruoli.size === 0) return 'assente';
  return null; // es. "votante" senza voto espresso: anomalia
}
