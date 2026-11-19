// Punto d'ingresso comune: scarica una votazione (Camera o Senato), la controlla e la salva.

import path from 'node:path';
import { sparql } from './sparql.mjs';
import { ErroreDati, controllaESalva } from './comune.mjs';
import { votazioneCamera } from './camera.mjs';
import { votazioneSenato } from './senato.mjs';

/**
 * @param {object} o
 * @param {'camera'|'senato'} o.ramo
 * @param {number} o.seduta
 * @param {number} o.numero         numero della votazione nella seduta
 * @param {number} [o.legislatura]  default 19
 * @param {string} [o.slug]         default "<ramo>-<legislatura>-<seduta>-<numero>"
 * @param {string} [o.titolo]       sostituisce il titolo ufficiale (es. "Ddl antisemitismo, voto finale")
 * @param {string} [o.descrizione]  sostituisce la descrizione ricavata dalle fonti
 * @param {boolean} [o.aggiorna]    ignora la cache in data/raw e riscarica
 * @param {string} o.radice         cartella del progetto (la cache è in <radice>/data/raw)
 * @param {string} [o.radiceUscita] dove scrivere data/votazioni e data/gruppi.json (default: o.radice);
 *                                  i test la usano per non toccare i dati del progetto
 */
export async function scaricaVotazione(o) {
  const ramo = String(o.ramo ?? '').toLowerCase();
  if (ramo !== 'camera' && ramo !== 'senato') throw new ErroreDati(`Ramo non valido: "${o.ramo}" (usa camera o senato).`);
  const legislatura = intero(o.legislatura ?? 19, 'legislatura');
  const seduta = intero(o.seduta, 'seduta');
  const numero = intero(o.numero, 'numero votazione');
  const slug = o.slug ?? `${ramo}-${legislatura}-${seduta}-${numero}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new ErroreDati(`Slug non valido: "${slug}" (solo lettere minuscole, cifre e trattini).`);

  const cartellaCache = path.join(o.radice, 'data', 'raw');
  const interroga = (endpoint, query) => sparql(endpoint, query, { cartellaCache, aggiorna: !!o.aggiorna });
  const avvisi = [];
  const parametri = { legislatura, seduta, numero };

  const v = ramo === 'camera'
    ? await votazioneCamera(parametri, interroga, avvisi)
    : await votazioneSenato(parametri, interroga, avvisi);

  v.slug = slug;
  if (o.titolo) v.titolo = o.titolo;
  if (o.descrizione) v.descrizione = o.descrizione;

  const { file, nuoviGruppi } = await controllaESalva(v, { radice: o.radiceUscita ?? o.radice });
  return { file, votazione: v, avvisi, nuoviGruppi };
}

function intero(x, nome) {
  const n = Number(x);
  if (!Number.isInteger(n) || n <= 0) throw new ErroreDati(`Valore non valido per ${nome}: "${x}"`);
  return n;
}
