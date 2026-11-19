// Interattività della pagina di una votazione.
// La pagina è completa anche senza questo file (titolo, totali, emiciclo ed elenco
// sono già nell'HTML): qui aggiungiamo solo
//   1. il selettore "Colora per: Voto | Partito" (salvato nell'URL come ?vista=partito)
//   2. il tooltip al passaggio del mouse o al tocco
//   3. il filtro per gruppo (clic su legenda, sigla o tabella)
// L'animazione d'ingresso è solo CSS (vedi assets/stile.css).

(function () {
  'use strict';

  const radice = document.documentElement;
  const figura = document.querySelector('.emiciclo');
  const datiEl = document.getElementById('dati-emiciclo');
  if (!figura || !datiEl) return;

  const svg = figura.querySelector('svg');
  const contenitore = figura.querySelector('.emiciclo-disegno');
  const tooltip = figura.querySelector('.tooltip');
  const pallini = Array.from(svg.querySelectorAll('.pallino'));
  const dati = JSON.parse(datiEl.textContent); // { gruppi: [{sigla, nome}], seggi: [[nome, indiceGruppo, voto]] }

  const ETICHETTE_VOTO = {
    favorevole: 'Favorevole',
    contrario: 'Contrario',
    astenuto: 'Astenuto',
    assente: 'Assente (non ha partecipato al voto)',
    missione: 'In missione',
    non_votante: 'Non votante',
  };

  // ---------------------------------------------------------------------------
  // 1. Vista: Voto | Partito
  // ---------------------------------------------------------------------------
  const pulsantiVista = document.querySelectorAll('[data-vista]');

  function impostaVista(vista, aggiornaIndirizzo) {
    radice.classList.toggle('vista-partito', vista === 'partito');
    pulsantiVista.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.vista === vista)));
    if (aggiornaIndirizzo) {
      const url = new URL(location.href);
      if (vista === 'partito') url.searchParams.set('vista', 'partito');
      else url.searchParams.delete('vista');
      history.replaceState(null, '', url);
    }
    nascondiTooltip(); // il colore del pallino evidenziato cambierebbe
  }

  pulsantiVista.forEach((b) => b.addEventListener('click', () => impostaVista(b.dataset.vista, true)));

  // ---------------------------------------------------------------------------
  // 2. Tooltip
  // ---------------------------------------------------------------------------
  // Le posizioni dei pallini (in coordinate SVG) servono per trovare il più vicino
  // al puntatore: sul telefono i pallini sono piccoli e toccarli esattamente è difficile.
  const posizioni = pallini.map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
  const raggio = pallini.length ? Number(pallini[0].getAttribute('r')) : 0;

  // Cerchio disegnato sopra a tutto per evidenziare il pallino attivo.
  const evidenza = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  evidenza.setAttribute('class', 'evidenza');
  evidenza.setAttribute('r', String(raggio * 1.7));
  evidenza.style.visibility = 'hidden';
  svg.appendChild(evidenza);

  let attivo = -1;

  /** Indice del pallino più vicino al punto dell'evento, oppure -1 se troppo lontano. */
  function piuVicino(evento) {
    const matrice = svg.getScreenCTM();
    if (!matrice) return -1;
    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matrice.inverse());
    let migliore = -1;
    let distanzaMinima = (raggio * 2.6) ** 2;
    posizioni.forEach((q, i) => {
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < distanzaMinima) {
        distanzaMinima = d;
        migliore = i;
      }
    });
    return migliore;
  }

  function nascondiTooltip() {
    attivo = -1;
    tooltip.hidden = true;
    evidenza.style.visibility = 'hidden';
  }

  function mostraTooltip(i) {
    if (i < 0) return nascondiTooltip();
    if (i === attivo) return;
    attivo = i;

    const [nome, indiceGruppo, voto] = dati.seggi[i];
    const gruppo = dati.gruppi[indiceGruppo];
    // Costruisco il contenuto con textContent (niente HTML dai dati).
    tooltip.replaceChildren();
    const riga = (tag, classe, testo) => {
      const el = document.createElement(tag);
      if (classe) el.className = classe;
      el.textContent = testo;
      tooltip.appendChild(el);
    };
    riga('strong', '', nome);
    riga('span', 'tt-gruppo', gruppo.nome && gruppo.nome !== gruppo.sigla ? `${gruppo.sigla} · ${gruppo.nome}` : gruppo.sigla);
    const rigaVoto = document.createElement('span');
    rigaVoto.className = `voto v-${voto}`;
    const punto = document.createElement('span');
    punto.className = `punto p-${voto}`;
    rigaVoto.append(punto, ETICHETTE_VOTO[voto] || voto);
    const contenitoreVoto = document.createElement('div');
    contenitoreVoto.appendChild(rigaVoto);
    tooltip.appendChild(contenitoreVoto);

    // Pallino evidenziato: stessa posizione e stesso colore del pallino reale.
    const c = pallini[i];
    const stile = getComputedStyle(c);
    evidenza.setAttribute('cx', c.getAttribute('cx'));
    evidenza.setAttribute('cy', c.getAttribute('cy'));
    evidenza.style.fill = stile.fill;
    evidenza.style.fillOpacity = stile.fillOpacity;
    evidenza.style.visibility = 'visible';

    // Posizione del tooltip: sopra il pallino, senza uscire dal riquadro.
    tooltip.hidden = false;
    const box = contenitore.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    const larghezza = tooltip.offsetWidth;
    const altezza = tooltip.offsetHeight;
    let x = r.left + r.width / 2 - box.left - larghezza / 2;
    x = Math.max(4, Math.min(x, box.width - larghezza - 4));
    let y = r.top - box.top - altezza - 10;
    if (y < 4) y = r.bottom - box.top + 10; // non c'è spazio sopra: lo metto sotto
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  let ultimoPuntatore = 'mouse';
  svg.addEventListener('pointerdown', (e) => { ultimoPuntatore = e.pointerType; });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') mostraTooltip(piuVicino(e));
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') nascondiTooltip();
  });
  // Tocco (e clic): mostra il pallino toccato; un secondo tocco sullo stesso lo nasconde.
  svg.addEventListener('click', (e) => {
    if (e.target.closest('[data-filtro]')) return; // clic su una sigla: lo gestisce il filtro
    const i = piuVicino(e);
    if (ultimoPuntatore !== 'mouse' && i === attivo) nascondiTooltip();
    else mostraTooltip(i);
  });
  document.addEventListener('click', (e) => {
    if (!svg.contains(e.target)) nascondiTooltip();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') nascondiTooltip();
  });
  window.addEventListener('resize', nascondiTooltip);

  // ---------------------------------------------------------------------------
  // 3. Filtro per gruppo
  // ---------------------------------------------------------------------------
  // Ogni elemento con data-g="N" appartiene al gruppo N (pallini, aloni, sigle,
  // voci della legenda, righe della tabella). Gli elementi con data-filtro="N"
  // sono i comandi che attivano il filtro.
  const filtrabili = document.querySelectorAll('[data-g]');
  const comandi = document.querySelectorAll('[data-filtro]');
  let filtro = null;

  function impostaFiltro(g) {
    filtro = filtro === g ? null : g; // secondo clic sullo stesso gruppo: tolgo il filtro
    document.body.classList.toggle('filtrata', filtro !== null);
    filtrabili.forEach((el) => el.classList.toggle('attivo', el.dataset.g === filtro));
    comandi.forEach((el) => {
      if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(el.dataset.filtro === filtro));
    });
  }

  document.addEventListener('click', (e) => {
    const comando = e.target.closest('[data-filtro]');
    if (comando) impostaFiltro(comando.dataset.filtro);
  });

  // Stato iniziale coerente con l'indirizzo (?vista=partito è già applicato dallo script nell'<head>).
  impostaVista(radice.classList.contains('vista-partito') ? 'partito' : 'voto', false);
})();
