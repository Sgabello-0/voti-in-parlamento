// Legislature presenti nel sito: numero romano e date di inizio e fine.
// Le date sono quelle della prima e dell'ultima seduta delle Camere di ogni legislatura.
// tutteDal: da quando il sito scarica TUTTE le votazioni (prima, e nelle altre legislature,
// solo i voti finali e le questioni di fiducia). È una scelta del progetto, non un dato delle fonti.

export const LEGISLATURE = {
  19: { romano: 'XIX', inizio: '2022-10-13', fine: null, tutteDal: '2026-09-01' },
  18: { romano: 'XVIII', inizio: '2018-03-23', fine: '2022-10-12' },
  17: { romano: 'XVII', inizio: '2013-03-15', fine: '2018-03-22' },
};

/** 19 -> "XIX" (anche per legislature non elencate qui sopra). */
export function romano(n) {
  if (LEGISLATURE[n]) return LEGISLATURE[n].romano;
  const valori = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let resto = Number(n);
  let s = '';
  for (const [v, r] of valori) while (resto >= v) { s += r; resto -= v; }
  return s;
}

/** "2022–oggi", "2018–2022" */
export function anniLegislatura(n) {
  const l = LEGISLATURE[n];
  if (!l) return '';
  return `${l.inizio.slice(0, 4)}–${l.fine ? l.fine.slice(0, 4) : 'oggi'}`;
}
