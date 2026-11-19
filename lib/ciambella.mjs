// Grafico a ciambella (cerchio con il vuoto dentro): favorevoli, contrari e astenuti,
// con il numero dei presenti al centro. L'SVG è generato dalla build; il passaggio del
// mouse (o il tocco) su uno spicchio lo gestisce assets/emiciclo.js: lo spicchio si
// ingrossa e al centro compaiono il suo numero e la sua percentuale.
//
// Tecnica: ogni spicchio è un cerchio con un bordo spesso (stroke) "tratteggiato"
// con stroke-dasharray, in modo che si veda solo l'arco che gli spetta.

import { esc } from './html.mjs';

const RAGGIO = 80;
const SPESSORE = 26;
const STACCO = 2.5; // piccolo spazio tra uno spicchio e l'altro (unità SVG)

/**
 * @param {{favorevoli:number, contrari:number, astenuti:number, presenti:number}} totali
 * @returns {string} markup SVG
 */
export function disegnaCiambella(totali) {
  const voci = [
    { classe: 'c-favorevoli', etichetta: 'favorevoli', valore: totali.favorevoli },
    { classe: 'c-contrari', etichetta: 'contrari', valore: totali.contrari },
    { classe: 'c-astenuti', etichetta: 'astenuti', valore: totali.astenuti },
  ].filter((x) => x.valore > 0);
  const somma = voci.reduce((s, x) => s + x.valore, 0);
  const circonferenza = 2 * Math.PI * RAGGIO;
  const fmt = (x) => (Math.round(x * 100) / 100).toString();

  let inizio = 0;
  const archi = voci.map((x) => {
    const lunghezza = (x.valore / somma) * circonferenza;
    const visibile = voci.length > 1 ? Math.max(lunghezza - STACCO, 0.5) : lunghezza;
    // percentuale sul totale degli spicchi (favorevoli + contrari + astenuti)
    const percentuale = Math.round((x.valore / somma) * 100);
    const arco = `<circle class="arco ${x.classe}" data-etichetta="${x.etichetta}" data-valore="${x.valore}" data-percentuale="${percentuale}" cx="100" cy="100" r="${RAGGIO}" fill="none" stroke-width="${SPESSORE}" stroke-dasharray="${fmt(visibile)} ${fmt(circonferenza - visibile)}" stroke-dashoffset="${fmt(-inizio)}" transform="rotate(-90 100 100)"/>`;
    inizio += lunghezza;
    return arco;
  });

  const descrizione = `${totali.presenti} presenti: ${totali.favorevoli} favorevoli, ${totali.contrari} contrari, ${totali.astenuti} astenuti`;
  // Tre righe al centro: sopra (vuota finché non si punta uno spicchio), numero, sotto.
  return `<svg class="ciambella-svg" viewBox="0 0 200 200" role="img" aria-label="${esc(descrizione)}" xmlns="http://www.w3.org/2000/svg">
<circle class="c-fondo" cx="100" cy="100" r="${RAGGIO}" fill="none" stroke-width="${SPESSORE}"/>
${archi.join('\n')}
<text class="ciambella-sopra" x="100" y="70" text-anchor="middle" dominant-baseline="central"></text>
<text class="ciambella-numero" x="100" y="100" text-anchor="middle" dominant-baseline="central" data-iniziale="${totali.presenti}">${totali.presenti}</text>
<text class="ciambella-etichetta" x="100" y="130" text-anchor="middle" dominant-baseline="central" data-iniziale="presenti">presenti</text>
</svg>`;
}
