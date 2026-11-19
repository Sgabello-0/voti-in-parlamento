// Geometria dell'emiciclo e disegno dell'SVG. Lo usa la build (lato Node):
// l'SVG finisce già pronto nell'HTML e il JavaScript del browser aggiunge solo l'interattività.
//
// Come funziona:
//  1. si sceglie il numero di file (semicerchi concentrici). In ogni fila il numero di
//     posti è proporzionale alla lunghezza dell'arco, così la distanza tra i pallini è
//     circa la stessa ovunque. Tra tutti i numeri di file possibili si prende quello che
//     dà la distanza minima più grande: così i pallini sono i più grandi possibile
//     senza sovrapporsi;
//  2. si ordinano tutti i posti per angolo, da sinistra a destra;
//  3. si assegnano ai parlamentari, già ordinati per gruppo e, dentro il gruppo, per voto:
//     ogni gruppo occupa così uno spicchio che va dalla fila interna a quella esterna.
// Gli spicchi sono attaccati: l'emiciclo è un semicerchio continuo. Solo quando il puntatore
// è su un pallino, il suo spicchio si stacca dagli altri (vedi assets/emiciclo.js e stile.css).
//
// Convenzioni: "phi" è l'angolo misurato da sinistra (0 = estremo sinistro, π = estremo destro);
// "r" è il raggio normalizzato (1 = fila esterna).

import { esc } from './html.mjs';

const RAGGIO_INTERNO = 0.4; // raggio della fila interna rispetto a quella esterna
const R = 480;              // raggio della fila esterna, in unità SVG
const MAX_FILE = 60;

// Dimensioni del testo delle sigle (unità SVG). Su telefono (CSS) le sigle dei gruppi
// grandi diventano più grandi e quelle dei gruppi piccoli si nascondono.
const SIGLA_FONT = 18;
const SIGLA_FONT_MOBILE = 30;
const SIGLA_MAX_CARATTERI = 14; // oltre, la sigla viene accorciata con "…" (vedi "etichetta" in gruppi.json)
const SPICCHIO_MINORE = (8 * Math.PI) / 180; // spicchi più stretti di 8° = gruppo "minore"

/** Ripartisce n posti tra le file in proporzione al raggio (metodo dei resti più grandi). */
function ripartisci(n, raggi) {
  const somma = raggi.reduce((a, b) => a + b, 0);
  const quote = raggi.map((r) => (n * r) / somma);
  const posti = quote.map(Math.floor);
  let mancanti = n - posti.reduce((a, b) => a + b, 0);
  const perResto = quote.map((q, i) => [q - Math.floor(q), i]).sort((a, b) => b[0] - a[0]);
  for (let j = 0; mancanti > 0; j++, mancanti--) posti[perResto[j][1]]++;
  return posti;
}

/** Sceglie il numero di file che rende massima la distanza minima tra pallini. */
function scegliFile(n) {
  let migliore = null;
  for (let file = 1; file <= MAX_FILE; file++) {
    const raggi = Array.from({ length: file }, (_, i) => (file === 1 ? 1 : RAGGIO_INTERNO + ((1 - RAGGIO_INTERNO) * i) / (file - 1)));
    const posti = ripartisci(n, raggi);
    if (posti.some((p) => p === 0)) continue; // ogni fila deve avere almeno un posto
    const passoTraFile = file === 1 ? Infinity : (1 - RAGGIO_INTERNO) / (file - 1);
    const passoSullArco = Math.min(...raggi.map((r, i) => (posti[i] > 1 ? (Math.PI * r) / (posti[i] - 1) : Infinity)));
    const d = Math.min(passoTraFile, passoSullArco);
    if (!migliore || d > migliore.d) migliore = { file, raggi, posti, d };
  }
  return migliore;
}

/**
 * Calcola le posizioni dei pallini.
 * @param {number[]} indiceGruppo  per ogni parlamentare (già ordinati), l'indice 0..G-1 del suo gruppo
 * @returns {{ posti: {r:number, phi:number}[], raggioPallino:number, file:number }}
 *          posti[i] è il posto del parlamentare i; raggioPallino è in unità normalizzate
 */
export function calcolaPosti(indiceGruppo) {
  const n = indiceGruppo.length;
  const scelta = scegliFile(n);

  // Tutti i posti, ordinati per angolo da sinistra a destra (a parità di angolo, dall'interno).
  const posti = [];
  scelta.raggi.forEach((r, i) => {
    const m = scelta.posti[i];
    for (let j = 0; j < m; j++) posti.push({ r, phi: m === 1 ? Math.PI / 2 : (Math.PI * j) / (m - 1) });
  });
  posti.sort((a, b) => a.phi - b.phi || a.r - b.r);

  // Il posto i-esimo (in ordine di angolo) va al parlamentare i-esimo (in ordine di gruppo e voto).
  return {
    posti: posti.map((p) => ({ r: p.r, phi: p.phi })),
    raggioPallino: 0.42 * scelta.d,
    file: scelta.file,
  };
}

/**
 * Sposta le etichette (angoli) per non farle sovrapporre: quelle "fisse" (gruppi grandi)
 * restano al centro del loro spicchio, le altre si spostano il minimo necessario.
 */
function distanziaEtichette(etichette, separazione) {
  const e = [...etichette].sort((a, b) => a.phi - b.phi);
  for (let giro = 0; giro < 200; giro++) {
    let mosso = false;
    for (let i = 1; i < e.length; i++) {
      const a = e[i - 1];
      const b = e[i];
      const manca = separazione(a, b) - (b.phi - a.phi);
      if (manca <= 1e-9) continue;
      mosso = true;
      if (a.fissa && b.fissa) continue;
      if (a.fissa) b.phi += manca;
      else if (b.fissa) a.phi -= manca;
      else { a.phi -= manca / 2; b.phi += manca / 2; }
    }
    for (const x of e) x.phi = Math.min(Math.PI, Math.max(0, x.phi));
    if (!mosso) break;
  }
  return e;
}

const fmt = (x) => (Math.round(x * 10) / 10).toString();

/**
 * Posti del banco del Governo: una fila sotto il centro dell'emiciclo (più file se sono tanti).
 * I membri arrivano in ordine di importanza: il primo va al centro, gli altri a destra e a
 * sinistra alternati, così i ruoli più importanti stanno vicino al centro. Tra un ruolo e
 * l'altro c'è un piccolo spazio: sono le "sezioni" del banco.
 * @param {string[]} ruoli  ruolo di ogni membro, già in ordine di importanza
 * @returns {{x:number, y:number}[]}
 */
function postiBanco(ruoli, rp) {
  const passo = rp * 2.3;   // distanza tra due pallini vicini
  const stacco = rp * 1.4;  // spazio in più tra due sezioni (ruoli diversi)
  const capienza = Math.max(1, Math.floor((2 * R * 0.95 - 8 * stacco) / passo)); // posti per fila
  const posti = [];
  for (let inizio = 0, fila = 0; inizio < ruoli.length; inizio += capienza, fila++) {
    const membri = ruoli.slice(inizio, inizio + capienza);
    const y = rp * 3.6 + fila * passo;
    let xDestra = 0, xSinistra = 0;
    let ruoloDestra = membri[0], ruoloSinistra = membri[0];
    membri.forEach((ruolo, k) => {
      if (k === 0) return posti.push({ x: 0, y });
      if (k % 2 === 1) {
        xDestra += passo + (ruolo !== ruoloDestra ? stacco : 0);
        ruoloDestra = ruolo;
        posti.push({ x: xDestra, y });
      } else {
        xSinistra -= passo + (ruolo !== ruoloSinistra ? stacco : 0);
        ruoloSinistra = ruolo;
        posti.push({ x: xSinistra, y });
      }
    });
  }
  return posti;
}

/**
 * Disegna l'SVG dell'emiciclo.
 * @param {object} v  votazione "preparata" dalla build:
 *   v.gruppi:       [{ indice, sigla, etichetta, nome, colore }] nell'ordine dell'emiciclo
 *   v.seggi:        [{ nome, indiceGruppo, voto, governo? }] già ordinati: prima chi siede nelle
 *                   file (per gruppo, poi voto), poi i membri del Governo (per importanza)
 *   v.totali:       { favorevoli, contrari, astenuti, ... }
 * @returns {string} markup SVG
 */
export function disegnaEmiciclo(v) {
  // Chi è al Governo siede nel banco del Governo, non nelle file del suo gruppo.
  const nFile = v.seggi.filter((s) => !s.governo).length;
  const { posti, raggioPallino } = calcolaPosti(v.seggi.slice(0, nFile).map((s) => s.indiceGruppo));
  const rp = raggioPallino * R;
  const n = v.seggi.length;

  // Coordinate: centro (0, 0) sulla linea di base, y verso il basso come in SVG.
  const xy = (r, phi) => [-r * Math.cos(phi), -r * Math.sin(phi)];

  // Posizione (x, y) e ritardo dell'animazione d'ingresso (da sinistra a destra) di ogni seggio.
  const banco = postiBanco(v.seggi.slice(nFile).map((s) => s.governo.ruolo), rp);
  const punto = (i) => (i < nFile ? xy(posti[i].r * R, posti[i].phi) : [banco[i - nFile].x, banco[i - nFile].y]);
  const ritardo = (i) => (i < nFile ? posti[i].phi / Math.PI : (banco[i - nFile].x + R) / (2 * R)).toFixed(3);

  // --- Sigle dei gruppi, fuori dall'arco -------------------------------------------
  const rEtichetta = R + rp + 14;
  const conPosto = v.gruppi.filter((g) => v.seggi.slice(0, nFile).some((s) => s.indiceGruppo === g.indice));
  const etichette = conPosto.map((g) => {
    const angoli = posti.filter((_, i) => v.seggi[i].indiceGruppo === g.indice).map((p) => p.phi);
    const min = Math.min(...angoli);
    const max = Math.max(...angoli);
    const testo = g.etichetta.length > SIGLA_MAX_CARATTERI ? g.etichetta.slice(0, SIGLA_MAX_CARATTERI - 1) + '…' : g.etichetta;
    const minore = max - min < SPICCHIO_MINORE;
    return { g, testo, centro: (min + max) / 2, phi: (min + max) / 2, fissa: !minore, minore };
  });
  // Separazione minima tra due etichette radiali: circa l'altezza del testo.
  distanziaEtichette(etichette, () => (SIGLA_FONT * 1.3) / rEtichetta);

  // Di quanto si sposta verso l'esterno uno spicchio quando il puntatore è su un suo pallino.
  const spostamento = rp * 2.2;

  // Ingombro per calcolare il viewBox: pallini + sigle (alla dimensione più grande che possono
  // avere), più lo spostamento, così anche uno spicchio staccato resta dentro il disegno.
  let minX = -R - rp * 1.6 - spostamento, maxX = R + rp * 1.6 + spostamento, minY = -R - rp * 1.6 - spostamento;
  // In basso: il banco del Governo (se c'è) con la sua didascalia, più lo spostamento in giù.
  const fondoBanco = banco.length ? Math.max(...banco.map((p) => p.y)) : 0;
  const yDidascaliaBanco = fondoBanco + rp + 24;
  const maxY = banco.length ? yDidascaliaBanco + 12 + rp * 1.2 : rp + 12;
  for (const et of etichette) {
    const font = et.minore ? SIGLA_FONT : SIGLA_FONT_MOBILE;
    const lunghezza = et.testo.length * font * 0.62 + 6 + spostamento;
    const [x, y] = xy(rEtichetta + lunghezza, et.phi);
    const [x0, y0] = xy(rEtichetta, et.phi);
    minX = Math.min(minX, x - font / 2, x0 - font / 2);
    maxX = Math.max(maxX, x + font / 2, x0 + font / 2);
    minY = Math.min(minY, y - font / 2, y0 - font / 2);
  }
  // viewBox simmetrico, così il centro dell'emiciclo resta al centro della pagina.
  const meta = Math.max(-minX, maxX) + 4;
  const viewBox = `${fmt(-meta)} ${fmt(minY - 4)} ${fmt(2 * meta)} ${fmt(maxY - minY + 8)}`;

  // --- Pallini, raggruppati per spicchio (un <g> per gruppo), e bagliori --------------
  // Quando il puntatore è su un pallino, emiciclo.js stacca il suo spicchio dagli altri:
  // lo sposta verso l'esterno (di --dx, --dy, lungo la direzione del centro dello spicchio)
  // e ne ingrandisce i pallini.
  // Bagliori (solo vista Partito): cerchi poco più grandi dei pallini, raccolti in 3 gruppi
  // (favorevoli, contrari, astenuti) con una sola sfocatura per gruppo, sotto ai pallini.
  const bagliori = { favorevole: [], contrario: [], astenuto: [] };
  const spostamenti = {}; // spicchio (indice del gruppo, o "governo") -> [dx, dy]

  /** Un <g class="spicchio"> con i pallini indicati; data-s sui bagliori dice a quale spicchio appartengono. */
  const disegnaSpicchio = (id, indici, dx, dy) => {
    spostamenti[id] = [dx, dy];
    const cerchi = indici.map((i) => {
      const [x, y] = punto(i);
      const k = n > 1 ? ritardo(i) : '0';
      const s = v.seggi[i];
      if (bagliori[s.voto]) {
        bagliori[s.voto].push(`<circle data-g="${s.indiceGruppo}" data-s="${id}" cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(rp * 1.2)}" style="--k:${k};--dx:${fmt(dx)}px;--dy:${fmt(dy)}px"/>`);
      }
      return `<circle class="pallino v-${s.voto}" data-i="${i}" data-g="${s.indiceGruppo}" cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(rp)}" style="--k:${k}"/>`;
    });
    return `<g class="spicchio${id === 'governo' ? ' banco-governo' : ''}" data-spicchio="${id}" style="--dx:${fmt(dx)}px;--dy:${fmt(dy)}px">\n${cerchi.join('\n')}\n</g>`;
  };

  // Gli spicchi dei gruppi: si staccano verso l'esterno, lungo la direzione del loro centro.
  const spicchi = conPosto.map((g) => {
    const indici = [];
    for (let i = 0; i < nFile; i++) if (v.seggi[i].indiceGruppo === g.indice) indici.push(i);
    const angoli = indici.map((i) => posti[i].phi);
    const [dx, dy] = xy(spostamento, (Math.min(...angoli) + Math.max(...angoli)) / 2);
    return disegnaSpicchio(g.indice, indici, dx, dy);
  });
  // Il banco del Governo: si stacca verso il basso.
  if (banco.length) {
    spicchi.push(disegnaSpicchio('governo', v.seggi.map((_, i) => i).slice(nFile), 0, rp * 1.2));
  }

  // --- Sigle -------------------------------------------------------------------------
  const sigle = etichette.map((et) => {
    const [x, y] = xy(rEtichetta, et.phi);
    const gradi = (-(Math.PI - et.phi) * 180) / Math.PI; // rotazione per leggere il testo in direzione radiale
    const aSinistra = et.phi < Math.PI / 2;
    const rotazione = aSinistra ? gradi + 180 : gradi;
    const ancora = aSinistra ? 'end' : 'start';
    let linea = '';
    if (Math.abs(et.phi - et.centro) > 0.004) {
      // l'etichetta è stata spostata: un trattino la collega al suo spicchio
      const [x1, y1] = xy(R + rp + 2, et.centro);
      const [x2, y2] = xy(rEtichetta - 3, et.phi);
      linea = `<line class="guida${et.minore ? ' minore' : ''}" data-g="${et.g.indice}" x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}"/>`;
    }
    // La sigla è in un <g> a parte, così può seguire lo spicchio quando si stacca.
    const [dx, dy] = spostamenti[et.g.indice];
    return `<g class="etichetta" data-etichetta="${et.g.indice}" style="--dx:${fmt(dx)}px;--dy:${fmt(dy)}px">${linea}<text class="sigla${et.minore ? ' minore' : ''}" data-g="${et.g.indice}" data-filtro="${et.g.indice}" x="${fmt(x)}" y="${fmt(y)}" transform="rotate(${fmt(rotazione)} ${fmt(x)} ${fmt(y)})" text-anchor="${ancora}" dominant-baseline="central"><title>${esc(et.g.nome || et.g.sigla)}</title>${esc(et.testo)}</text></g>`;
  });

  // --- Risultato al centro --------------------------------------------------------
  const { favorevoli: f, contrari: c, astenuti: a } = v.totali;
  const caratteri = `${f} – ${c} – ${a}`.length;
  const larghezzaUtile = 2 * (RAGGIO_INTERNO * R - rp) * 0.92;
  const fontRisultato = Math.min(72, larghezzaUtile / (caratteri * 0.58));

  const titoloId = 'emiciclo-titolo';
  return `<svg class="emiciclo-svg" viewBox="${viewBox}" role="img" aria-labelledby="${titoloId}" xmlns="http://www.w3.org/2000/svg">
<title id="${titoloId}">Emiciclo: ${f} favorevoli, ${c} contrari, ${a} astenuti su ${n} ${esc(v.parlamentariPlurale)}. Ogni pallino è un parlamentare, raggruppato per gruppo parlamentare.</title>
<defs>
<filter id="bagliore" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${fmt(rp * 0.35)}"/></filter>
<filter id="bagliore-piccolo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${fmt(rp * 0.22)}"/></filter>
</defs>
<g class="bagliori" aria-hidden="true">
<g class="bagliore bagliore-favorevole">${bagliori.favorevole.join('')}</g>
<g class="bagliore bagliore-contrario">${bagliori.contrario.join('')}</g>
<g class="bagliore bagliore-astenuto">${bagliori.astenuto.join('')}</g>
</g>
<g class="pallini">
${spicchi.join('\n')}
</g>
<g class="sigle" aria-hidden="true">
${sigle.join('\n')}
${banco.length ? `<g class="etichetta" data-etichetta="governo" style="--dx:0px;--dy:${fmt(rp * 1.2)}px"><text class="didascalia-banco" x="0" y="${fmt(yDidascaliaBanco)}" text-anchor="middle" dominant-baseline="central">Banco del Governo</text></g>` : ''}
</g>
<text class="risultato" x="0" y="${fmt(-rp - 6)}" text-anchor="middle" font-size="${fmt(fontRisultato)}" aria-hidden="true"><tspan class="t-favorevole">${f}</tspan><tspan class="t-trattino"> – </tspan><tspan class="t-contrario">${c}</tspan><tspan class="t-trattino"> – </tspan><tspan class="t-astenuto">${a}</tspan></text>
<text class="risultato-didascalia" x="0" y="${fmt(-rp - 12 - fontRisultato)}" text-anchor="middle" aria-hidden="true">favorevoli – contrari – astenuti</text>
</svg>`;
}
