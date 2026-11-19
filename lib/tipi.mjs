// Tipi di votazione, in ordine di importanza, con una breve spiegazione per il sito.
// Il tipo viene ricavato dai dati ufficiali (vedi tipoCamera e tipoSenato qui sotto).

export const TIPI = [
  { chiave: 'finale', nome: 'Voti finali', spiegazione: "Il voto sull'intero testo (una legge, la conversione di un decreto, una ratifica): se è approvato, il testo passa all'altra Camera o diventa legge." },
  { chiave: 'fiducia', nome: 'Questioni di fiducia', spiegazione: "Il Governo lega la propria permanenza in carica all'approvazione di un testo: se la fiducia viene negata, il Governo si dimette." },
  { chiave: 'risoluzione', nome: 'Risoluzioni e mozioni', spiegazione: "Atti con cui l'Assemblea indica al Governo una linea politica, per esempio su un documento di finanza pubblica o prima di un Consiglio europeo." },
  { chiave: 'pregiudiziale', nome: 'Questioni pregiudiziali e sospensive', spiegazione: "Proposte di non esaminare un testo (per esempio perché ritenuto incostituzionale) o di rinviarne l'esame." },
  { chiave: 'articolo', nome: 'Articoli', spiegazione: 'Il voto su un singolo articolo del testo, dopo quelli sugli emendamenti che lo riguardano.' },
  { chiave: 'emendamento', nome: 'Emendamenti', spiegazione: 'Proposte di modifica di una parte del testo: se approvate, il testo cambia.' },
  { chiave: 'ordine_del_giorno', nome: 'Ordini del giorno', spiegazione: 'Indicazioni o impegni rivolti al Governo su come applicare il testo: non lo modificano.' },
  { chiave: 'altro', nome: 'Altre votazioni', spiegazione: 'Votazioni procedurali, controprove (ripetizione di un voto) e altri casi.' },
];
export const CHIAVI_TIPI = TIPI.map((t) => t.chiave);

/**
 * Camera: dc:type ufficiale ("Finale atto Camera", "Emendamento", "Ordine del Giorno",
 * "Articolo", "Risoluzione", "Pregiudiziali", "Altre"), ocd:richiestaFiducia e la descrizione
 * (le votazioni "Altre" sono spesso emendamenti: "EM 4.101").
 */
export function tipoCamera({ tipoUfficiale = '', descrizione = '', finale = false, fiducia = false }) {
  const t = tipoUfficiale.toLowerCase();
  const d = descrizione.trim();
  if (fiducia) return 'fiducia';
  if (finale || t.startsWith('finale')) return 'finale';
  if (t.startsWith('risoluzion') || t.startsWith('mozion') || /^(risoluzione|mozione)/i.test(d)) return 'risoluzione';
  if (t.startsWith('pregiudizial') || t.startsWith('sospensiv') || /^question[ei] (pregiudizial|sospensiv)/i.test(d)) return 'pregiudiziale';
  if (t.startsWith('ordine del giorno') || /^ODG\b/i.test(d)) return 'ordine_del_giorno';
  if (t.startsWith('emendament') || /^(SUB-?)?EM(M|END\w*)?\b/i.test(d) || /\s-\s(SUB-?)?EM\b/i.test(d)) return 'emendamento';
  if (t.startsWith('articol') || /^(MANTENIMENTO )?ART(\.|ICOLO)\b/i.test(d) || /\s-\s(MANTENIMENTO )?ART(\.|ICOLO)?\b/i.test(d)) return 'articolo';
  return 'altro';
}

/** Senato: dall'etichetta della votazione ("Votazione finale", "Em. 2.17, …", "ODG G8.3, …", "Articolo 1"…). */
export function tipoSenato(etichetta = '') {
  const e = etichetta.trim();
  if (/^votazione finale$/i.test(e)) return 'finale';
  if (/fiducia/i.test(e)) return 'fiducia';
  if (/risoluzion|mozion/i.test(e)) return 'risoluzione';
  if (/pregiudizial|sospensiv|non passare all'esame/i.test(e)) return 'pregiudiziale';
  if (/^(ODG|ordine del giorno)\b/i.test(e)) return 'ordine_del_giorno';
  if (/^(emm?\.|emendament|subemendament)/i.test(e)) return 'emendamento';
  if (/^(mantenimento )?articol/i.test(e)) return 'articolo';
  return 'altro';
}

/** "EM 4.101" -> "emendamento 4.101", "ODG 9/2360/20" -> "ordine del giorno 9/2360/20", ecc. */
export function codiceLeggibile(codice) {
  return codice
    .trim()
    .replace(/^SUB-?EM\b\.?/i, 'subemendamento')
    .replace(/^EMM?\b\.?/i, 'emendamento')
    .replace(/^ODG\b/i, 'ordine del giorno')
    .replace(/^MANTENIMENTO ARTICOLO\b/i, 'mantenimento articolo')
    .replace(/^ART(\.|ICOLO)?\b\.?/i, 'articolo')
    .replace(/^VOTO FINALE$/i, 'voto finale');
}
