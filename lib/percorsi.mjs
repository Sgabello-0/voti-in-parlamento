// Indirizzi (percorsi) delle pagine del sito, in un posto solo.

import { nomeCompleto } from './html.mjs';

/** "Giorgia Meloni" -> "giorgia-meloni" (senza accenti, solo lettere, cifre e trattini). */
export function slugify(testo) {
  return String(testo)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Numero identificativo nella fonte: ".../deputato.rdf/d302103_19" -> "302103", ".../senatore/1275" -> "1275". */
export function idNumerico(idFonte) {
  return String(idFonte).match(/(\d+)(?:_\d+)?$/)?.[1] ?? slugify(idFonte);
}

/** Pagina di un parlamentare: /deputati/giorgia-meloni-302103/ oppure /senatori/ignazio-la-russa-1275/ */
export function percorsoParlamentare(ramo, p) {
  return `/${ramo === 'camera' ? 'deputati' : 'senatori'}/${slugify(nomeCompleto(p))}-${idNumerico(p.id_fonte)}/`;
}

/** Pagina della lista di un tipo di votazioni: /votazioni/camera/emendamento/ */
export function percorsoTipo(ramo, tipo) {
  return `/votazioni/${ramo}/${tipo.replaceAll('_', '-')}/`;
}

/** Scheda ufficiale del parlamentare negli open data (la pagina che si apre dall'identificativo). */
export function schedaUfficiale(idFonte) {
  return String(idFonte).replace(/^http:/, 'https:');
}
