// Barra di ricerca della pagina iniziale: cerca tra i parlamentari e tra tutte le votazioni.
// L'indice (/indice.json) viene scaricato solo quando si inizia a cercare.
// Senza JavaScript la barra non compare e restano le sezioni e le liste per tipo.

(function () {
  'use strict';

  const campo = document.getElementById('campo-ricerca');
  if (!campo) return;
  const box = campo.closest('[data-indice]');
  const esito = box.querySelector('.ricerca-esito');
  const risultati = box.querySelector('.ricerca-risultati');
  const sezioni = document.querySelector('.sezioni-home');

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const dataLeggibile = (iso) => { const [a, m, g] = iso.split('-').map(Number); return `${g} ${MESI[m - 1]} ${a}`; };
  const TIPI = { finale: 'Voto finale', fiducia: 'Fiducia', risoluzione: 'Risoluzione o mozione', pregiudiziale: 'Questione pregiudiziale', articolo: 'Articolo', emendamento: 'Emendamento', ordine_del_giorno: 'Ordine del giorno', altro: 'Altra votazione' };
  const RAMI = { camera: 'Camera', senato: 'Senato' };
  const MAX_PARLAMENTARI = 12;
  const MAX_VOTAZIONI = 50;

  // Minuscolo e senza accenti: "Carè" e "CARE" si trovano scrivendo "care".
  const normalizza = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase();

  let indice = null;
  let caricamento = null;
  function carica() {
    if (!caricamento) {
      caricamento = fetch(box.dataset.indice)
        .then((r) => r.json())
        .then((j) => {
          indice = {
            // votazioni: [url, titolo, data, ramo, tipo, esito]
            votazioni: j.votazioni.map((v) => ({ v, testo: normalizza(`${v[1]} ${v[2]} ${dataLeggibile(v[2])} ${RAMI[v[3]]} ${TIPI[v[4]] ?? ''}`) })),
            // parlamentari: [pagina, nome, ramo, gruppo]
            parlamentari: j.parlamentari.map((p) => ({ p, testo: normalizza(p[1]) })),
          };
        })
        .catch(() => { esito.textContent = 'Non riesco a caricare l\'indice di ricerca.'; });
    }
    return caricamento;
  }

  /** Crea un elemento con classe e testo (niente HTML preso dai dati). */
  function el(tag, classe, testo) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo != null) e.textContent = testo;
    return e;
  }

  function cerca() {
    const parole = normalizza(campo.value).split(/\s+/).filter(Boolean);
    if (!parole.length || !indice) {
      risultati.hidden = true;
      sezioni.hidden = false;
      esito.textContent = '';
      return;
    }
    const trova = (elenco) => elenco.filter((x) => parole.every((p) => x.testo.includes(p)));
    const parlamentari = trova(indice.parlamentari);
    const votazioni = trova(indice.votazioni);

    risultati.replaceChildren();
    if (parlamentari.length) {
      risultati.append(el('h2', '', `Parlamentari (${parlamentari.length})`));
      const ul = el('ul', 'risultati-parlamentari');
      for (const { p } of parlamentari.slice(0, MAX_PARLAMENTARI)) {
        const li = el('li');
        const a = el('a', '', p[1]);
        a.href = p[0];
        li.append(a, el('span', 'risultato-dettagli', `${RAMI[p[2]]}${p[3] ? ' · ' + p[3] : ''}`));
        ul.append(li);
      }
      risultati.append(ul);
    }
    if (votazioni.length) {
      risultati.append(el('h2', '', `Votazioni (${votazioni.length})`));
      const ul = el('ul', 'risultati-votazioni');
      for (const { v } of votazioni.slice(0, MAX_VOTAZIONI)) {
        const li = el('li');
        const a = el('a', '', v[1]);
        a.href = v[0];
        li.append(a, el('span', 'risultato-dettagli', `${dataLeggibile(v[2])} · ${RAMI[v[3]]} · ${TIPI[v[4]] ?? ''}${v[5] ? ' · ' + v[5] : ''}`));
        ul.append(li);
      }
      risultati.append(ul);
      if (votazioni.length > MAX_VOTAZIONI) risultati.append(el('p', 'nota', `Mostro le ${MAX_VOTAZIONI} più recenti: aggiungi parole per restringere la ricerca.`));
    }
    esito.textContent = parlamentari.length || votazioni.length
      ? `${parlamentari.length} ${parlamentari.length === 1 ? 'parlamentare' : 'parlamentari'} e ${votazioni.length} ${votazioni.length === 1 ? 'votazione' : 'votazioni'}`
      : 'Nessun risultato.';
    risultati.hidden = false;
    sezioni.hidden = true;
  }

  campo.addEventListener('focus', carica, { once: true });
  campo.addEventListener('input', () => carica().then(cerca));

  // Ricerca già scritta nell'indirizzo (?q=...), utile per condividere un link.
  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    campo.value = q;
    carica().then(cerca);
  }
})();
