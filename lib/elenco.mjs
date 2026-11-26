// Elenco delle votazioni di un periodo, per scaricarle in blocco (scripts/scarica-periodo.mjs).
// Una sola query per ramo. Per ogni votazione dice anche se va saltata e perché.

const CAMERA = 'https://dati.camera.it/sparql';
const SENATO = 'https://dati.senato.it/sparql';

// I server SPARQL restituiscono al massimo un certo numero di righe (es. 10.000 o 20.000) e
// tagliano il resto senza dirlo: se le righe sono un numero "tondo" così, l'elenco è incompleto.
function controllaTaglio(righe, chi) {
  if (righe.length >= 10000 && righe.length % 10000 === 0) {
    throw new Error(`${chi}: l'elenco ha esattamente ${righe.length} righe, probabilmente tagliato dal server. Restringi il periodo (--dal/--al) o usa --importanti.`);
  }
}

/**
 * @param {{legislatura:number, dal:string, al:string, soloImportanti?:boolean}} p  date AAAA-MM-GG;
 *        soloImportanti: solo votazioni finali e questioni di fiducia (filtrate già nella query)
 * @param {(endpoint:string, query:string) => Promise<object[]>} interroga  (senza cache: l'elenco cambia ogni giorno)
 * @returns {Promise<{ramo, seduta, numero, data, finale, fiducia, descrizione, salta}[]>}
 */
export async function elencoCamera({ legislatura, dal, al, soloImportanti = false }, interroga) {
  const righe = await interroga(CAMERA, `PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT DISTINCT ?v ?d ?finale ?fiducia ?segreta ?desc WHERE {
  ?v a ocd:votazione ; ocd:rif_leg <http://dati.camera.it/ocd/legislatura.rdf/repubblica_${legislatura}> ; dc:date ?d .
  OPTIONAL { ?v ocd:votazioneFinale ?finale } OPTIONAL { ?v ocd:richiestaFiducia ?fiducia }
  OPTIONAL { ?v ocd:votazioneSegreta ?segreta } OPTIONAL { ?v dc:description ?desc }
  FILTER(STR(?d) >= "${dal.replaceAll('-', '')}" && STR(?d) <= "${al.replaceAll('-', '')}")${soloImportanti ? '\n  FILTER(STR(?finale) = "1" || STR(?fiducia) = "1")' : ''} }`);
  controllaTaglio(righe, 'Camera');
  const viste = new Map();
  for (const r of righe) {
    const m = r.v.match(/vs\d+_(\d+)_(\d+)$/); // es. .../vs19_747_053 -> seduta 747, votazione 53
    if (!m || viste.has(r.v)) continue;
    const d = r.d;
    viste.set(r.v, {
      ramo: 'camera',
      seduta: Number(m[1]),
      numero: Number(m[2]),
      data: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      finale: r.finale === '1',
      fiducia: r.fiducia === '1',
      descrizione: r.desc ?? '',
      salta: r.segreta === '1' ? 'voto segreto: i voti dei singoli non sono pubblici' : null,
    });
  }
  return [...viste.values()];
}

export async function elencoSenato({ legislatura, dal, al, soloImportanti = false }, interroga) {
  const righe = await interroga(SENATO, `PREFIX osr: <http://dati.senato.it/osr/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?v ?n ?ns ?d ?etichetta ?tipo WHERE {
  ?v a osr:Votazione ; osr:seduta ?s ; osr:numero ?n .
  OPTIONAL { ?v rdfs:label ?etichetta } OPTIONAL { ?v osr:tipoVotazione ?tipo }
  ?s osr:dataSeduta ?d ; osr:numeroSeduta ?ns ; osr:legislatura ?l .
  FILTER(STR(?l) = "${legislatura}" && STR(?d) >= "${dal}" && STR(?d) <= "${al}")${soloImportanti ? '\n  FILTER(REGEX(STR(?etichetta), "^votazione finale$|fiducia", "i"))' : ''} }`);
  controllaTaglio(righe, 'Senato');
  const viste = new Map();
  for (const r of righe) {
    if (viste.has(r.v)) continue;
    const etichetta = r.etichetta ?? '';
    let salta = null;
    if (/annullata/i.test(etichetta)) salta = 'votazione annullata';
    else if (/verifica del numero legale/i.test(etichetta) || /verifica numero legale/i.test(r.tipo ?? '')) salta = 'verifica del numero legale (non è un voto su un testo)';
    viste.set(r.v, {
      ramo: 'senato',
      seduta: Number(r.ns),
      numero: Number(r.n),
      data: r.d.slice(0, 10),
      finale: /^votazione finale$/i.test(etichetta),
      fiducia: /fiducia/i.test(etichetta),
      descrizione: etichetta,
      salta,
    });
  }
  return [...viste.values()];
}
