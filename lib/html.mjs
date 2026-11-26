// Piccole funzioni di supporto per scrivere HTML.

/** Rende sicuro un testo da inserire nell'HTML (o in un attributo). */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

/** "2026-11-19" -> "giovedì 19 novembre 2026" */
export function giornoLeggibile(iso) {
  const [a, m, g] = iso.split('-').map(Number);
  return `${GIORNI[new Date(Date.UTC(a, m - 1, g)).getUTCDay()]} ${dataLeggibile(iso)}`;
}

/** "2026-11-17" -> "17 novembre 2026" */
export function dataLeggibile(iso) {
  const [a, m, g] = iso.split('-').map(Number);
  return `${g === 1 ? '1°' : g} ${MESI[m - 1]} ${a}`;
}

/**
 * Nomi della Camera, che negli open data sono tutti in MAIUSCOLO:
 * "QUARTAPELLE PROCOPIO" -> "Quartapelle Procopio", "D'ALESSIO" -> "D'Alessio".
 * I nomi che non sono tutti maiuscoli (Senato) restano come sono.
 * Gli accenti scritti con l'apostrofo (es. "CARE'") restano così: la fonte non dice quale accento sia.
 */
export function maiuscoleLeggibili(s) {
  const t = String(s ?? '');
  if (t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, prima, lettera) => prima + lettera.toUpperCase());
}

/** "Nome Cognome" per la visualizzazione. */
export function nomeCompleto(p) {
  return `${maiuscoleLeggibili(p.nome)} ${maiuscoleLeggibili(p.cognome)}`.trim();
}
