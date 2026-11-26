// Logo del sito: un piccolo emiciclo di pallini (come quelli delle pagine delle votazioni)
// sfumato dal verde al bianco al rosso: i colori dei voti, che sono anche quelli del tricolore.

const VERDE = '#22C55E';
const BIANCO = '#F5F5F5';
const ROSSO = '#EF4444';

/**
 * Pallini dell'emiciclo, centrato in (cx, cy), da sinistra (verde) a destra (rosso).
 * Di base tre file di pallini piccoli; per l'icona del browser (16-32 pixel) due file di pallini grandi.
 */
const FILE_LOGO = [{ r: 8, n: 6 }, { r: 13.5, n: 10 }, { r: 19, n: 14 }];
const FILE_ICONA = [{ r: 9, n: 4 }, { r: 17.5, n: 7 }];
function pallini(cx, cy, file = FILE_LOGO, raggio = 1.9) {
  const out = [];
  for (const { r, n } of file) {
    for (let i = 0; i < n; i++) {
      const angolo = Math.PI * (1 - i / (n - 1)); // da 180° (sinistra) a 0° (destra)
      const gradi = (angolo * 180) / Math.PI;
      const colore = gradi > 120 ? VERDE : gradi >= 60 ? BIANCO : ROSSO;
      const x = (cx + r * Math.cos(angolo)).toFixed(2);
      const y = (cy - r * Math.sin(angolo)).toFixed(2);
      out.push(`<circle cx="${x}" cy="${y}" r="${raggio}" fill="${colore}"/>`);
    }
  }
  return out.join('');
}

/** Il segno grafico da solo (decorativo: il nome del sito è scritto accanto in HTML). */
export function marchioSvg({ classe = 'logo-segno', larghezza = 48 } = {}) {
  const altezza = Math.round((larghezza * 30) / 48);
  return `<svg class="${classe}" viewBox="0 0 48 30" width="${larghezza}" height="${altezza}" aria-hidden="true" focusable="false">${pallini(24, 27)}</svg>`;
}

/** Icona del sito (favicon): il segno su un quadrato blu scuro arrotondato. */
export function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#0B1D3A"/>${pallini(24, 36, FILE_ICONA, 3.6)}</svg>
`;
}
