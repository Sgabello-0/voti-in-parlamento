// Interattività della pagina di una votazione.
// La pagina è completa anche senza questo file (titolo, totali, emiciclo ed elenco
// sono già nell'HTML): qui aggiungiamo solo
//   1. il selettore "Colora per: Voto | Partito" (salvato nell'URL come ?vista=partito)
//   2. il tooltip al passaggio del mouse o al tocco, con lo spicchio del gruppo ingrandito
//   3. il filtro per gruppo (clic su legenda, sigla o tabella)
//   4. il pulsante "Schermo intero"
//   5. il grafico a ciambella che reagisce al mouse
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
  // 2. Tooltip e spicchio ingrandito
  // ---------------------------------------------------------------------------
  // Le posizioni dei pallini (in coordinate SVG) servono per trovare il più vicino
  // al puntatore: sul telefono i pallini sono piccoli e toccarli esattamente è difficile.
  const posizioni = pallini.map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
  const raggio = pallini.length ? Number(pallini[0].getAttribute('r')) : 0;

  let attivo = -1;              // indice del pallino puntato (-1 = nessuno)
  let spicchioAttivo = null;    // <g class="spicchio"> del suo gruppo

  // L'animazione d'ingresso (solo CSS) dura circa 1,1 secondi. Finita quella la tolgo del
  // tutto: spostare un pallino nel DOM (per disegnarlo sopra ai vicini) la farebbe ripartire
  // e il pallino tornerebbe grigio per un attimo.
  let ingressoFinito = false;
  setTimeout(() => {
    svg.classList.add('pronto');
    ingressoFinito = true;
  }, 1300);

  // Di base l'emiciclo è un semicerchio continuo. Quando il puntatore è su un pallino, il suo
  // spicchio si stacca dagli altri: si sposta verso l'esterno e si ingrandisce (vedi CSS).
  // Con lui si spostano anche i suoi bagliori (che stanno in un livello a parte) e la sua sigla.
  // data-s = spicchio a cui appartiene il bagliore (indice del gruppo, oppure "governo")
  const baglioriPerGruppo = {};
  svg.querySelectorAll('.bagliore circle').forEach((c) => {
    (baglioriPerGruppo[c.dataset.s] ||= []).push(c);
  });
  // spicchio di ogni pallino (i membri del Governo stanno nello spicchio "governo")
  const spicchioDi = pallini.map((c) => c.parentNode.dataset.spicchio);
  const spostamenti = {}; // indice del gruppo -> { dx, dy } in coordinate SVG
  svg.querySelectorAll('.spicchio').forEach((s) => {
    const stile = getComputedStyle(s);
    spostamenti[s.dataset.spicchio] = { dx: parseFloat(stile.getPropertyValue('--dx')) || 0, dy: parseFloat(stile.getPropertyValue('--dy')) || 0 };
  });
  function staccaSpicchio(spicchio, si) {
    svg.classList.toggle('con-staccato', si); // gli altri gruppi si rimpiccioliscono (vedi CSS)
    if (!spicchio) return;
    const g = spicchio.dataset.spicchio;
    spicchio.classList.toggle('in-evidenza', si);
    (baglioriPerGruppo[g] || []).forEach((c) => c.classList.toggle('in-evidenza', si));
    const etichetta = svg.querySelector(`.etichetta[data-etichetta="${g}"]`);
    if (etichetta) etichetta.classList.toggle('in-evidenza', si);
  }

  /** Indice del pallino più vicino al punto dell'evento, oppure -1 se troppo lontano. */
  function piuVicino(evento) {
    const matrice = svg.getScreenCTM();
    if (!matrice) return -1;
    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matrice.inverse());
    // i pallini dello spicchio staccato sono spostati: ne tengo conto
    const gStaccato = spicchioAttivo ? spicchioAttivo.dataset.spicchio : null;
    let migliore = -1;
    let distanzaMinima = (raggio * 2.6) ** 2;
    posizioni.forEach((q, i) => {
      const s = gStaccato !== null && spicchioDi[i] === gStaccato ? spostamenti[gStaccato] : null;
      const d = (q.x + (s ? s.dx : 0) - p.x) ** 2 + (q.y + (s ? s.dy : 0) - p.y) ** 2;
      if (d < distanzaMinima) {
        distanzaMinima = d;
        migliore = i;
      }
    });
    return migliore;
  }

  function nascondiTooltip() {
    if (attivo >= 0) pallini[attivo].classList.remove('puntato');
    staccaSpicchio(spicchioAttivo, false);
    attivo = -1;
    spicchioAttivo = null;
    tooltip.hidden = true;
  }

  function mostraTooltip(i) {
    if (i < 0) return nascondiTooltip();
    if (i === attivo) return;
    if (attivo >= 0) pallini[attivo].classList.remove('puntato');
    attivo = i;

    // Lo spicchio del gruppo si stacca dagli altri e si ingrandisce (vedi CSS).
    const c = pallini[i];
    const spicchio = c.parentNode;
    if (spicchio !== spicchioAttivo) {
      staccaSpicchio(spicchioAttivo, false);
      if (ingressoFinito) {
        // In primo piano: in SVG conta l'ordine, quindi lo sposto in fondo al livello dei pallini.
        spicchio.parentNode.appendChild(spicchio);
        getComputedStyle(spicchio).transform; // fa registrare al browser la posizione di partenza, così l'animazione parte
      }
      staccaSpicchio(spicchio, true);
      spicchioAttivo = spicchio;
    }
    if (ingressoFinito) spicchio.appendChild(c); // il pallino puntato va disegnato sopra ai vicini
    c.classList.add('puntato');

    const [nome, indiceGruppo, voto, incarichi] = dati.seggi[i];
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
    if (incarichi) riga('span', 'tt-incarico', incarichi); // membro del Governo
    // Gruppo: rettangolo del suo colore + nome completo (come nella legenda)
    const rigaGruppo = document.createElement('span');
    rigaGruppo.className = 'tt-gruppo';
    const rettangolo = document.createElement('span');
    rettangolo.className = 'chip';
    rettangolo.style.setProperty('--cg', getComputedStyle(pallini[i]).getPropertyValue('--cg'));
    const nomeGruppo = document.createElement('span');
    nomeGruppo.textContent = gruppo.nome || gruppo.sigla;
    rigaGruppo.append(rettangolo, nomeGruppo);
    tooltip.appendChild(rigaGruppo);
    const rigaVoto = document.createElement('span');
    rigaVoto.className = `voto v-${voto}`;
    const punto = document.createElement('span');
    punto.className = `punto p-${voto}`;
    rigaVoto.append(punto, ETICHETTE_VOTO[voto] || voto);
    const contenitoreVoto = document.createElement('div');
    contenitoreVoto.appendChild(rigaVoto);
    tooltip.appendChild(contenitoreVoto);
    riga('span', 'tt-azione', ultimoPuntatore === 'mouse' ? 'Clic per aprire la scheda' : ultimoPuntatore === 'tastiera' ? 'Clic sul pallino per aprire la scheda' : 'Tocca di nuovo per aprire la scheda');

    // Posizione del tooltip: sopra il pallino, senza uscire dal riquadro.
    // Calcolo il centro del pallino a spicchio già spostato (--dx, --dy), perché
    // l'animazione dello spostamento è appena iniziata.
    const stileSpicchio = getComputedStyle(spicchio);
    const dx = parseFloat(stileSpicchio.getPropertyValue('--dx')) || 0;
    const dy = parseFloat(stileSpicchio.getPropertyValue('--dy')) || 0;
    const matrice = svg.getScreenCTM();
    const centro = new DOMPoint(posizioni[i].x + dx, posizioni[i].y + dy).matrixTransform(matrice);
    const mezzaAltezza = raggio * 1.6 * matrice.a; // il pallino puntato è ingrandito

    tooltip.hidden = false;
    const box = contenitore.getBoundingClientRect();
    const larghezza = tooltip.offsetWidth;
    const altezza = tooltip.offsetHeight;
    let x = centro.x - box.left - larghezza / 2;
    x = Math.max(4, Math.min(x, box.width - larghezza - 4));
    let y = centro.y - box.top - mezzaAltezza - altezza - 8;
    if (y < 4) y = centro.y - box.top + mezzaAltezza + 8; // non c'è spazio sopra: lo metto sotto
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  let ultimoPuntatore = 'mouse';
  svg.addEventListener('pointerdown', (e) => { ultimoPuntatore = e.pointerType; });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      ultimoPuntatore = 'mouse';
      mostraTooltip(piuVicino(e));
    }
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') nascondiTooltip();
  });
  // Clic su un pallino: apre la pagina del parlamentare.
  // Con il dito: il primo tocco mostra il tooltip, il secondo sullo stesso pallino apre la pagina.
  svg.addEventListener('click', (e) => {
    if (e.target.closest('[data-filtro]')) return; // clic su una sigla: lo gestisce il filtro
    // Col mouse apro il parlamentare mostrato nel tooltip (lo spicchio staccato si è spostato,
    // quindi sotto il puntatore potrebbe esserci un altro pallino).
    const i = ultimoPuntatore === 'mouse' && attivo >= 0 ? attivo : piuVicino(e);
    if (i < 0) return nascondiTooltip();
    const pagina = dati.seggi[i][4];
    if (pagina && (ultimoPuntatore === 'mouse' || i === attivo)) location.href = pagina;
    else mostraTooltip(i);
  });
  document.addEventListener('click', (e) => {
    if (!svg.contains(e.target) && !e.target.closest('.trova')) nascondiTooltip();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') nascondiTooltip();
  });
  window.addEventListener('resize', nascondiTooltip);

  // ---------------------------------------------------------------------------
  // 3. Filtro per gruppo
  // ---------------------------------------------------------------------------
  // Ogni elemento con data-g="N" appartiene al gruppo N (pallini, sigle, voci della
  // legenda, righe del riepilogo, blocchi dell'elenco). Gli elementi con data-filtro="N"
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

  // ---------------------------------------------------------------------------
  // 4. Schermo intero (solo se il browser lo permette: su iPhone, per esempio, no)
  // ---------------------------------------------------------------------------
  const pulsanteSchermo = figura.querySelector('.schermo-intero');
  if (pulsanteSchermo && document.fullscreenEnabled && figura.requestFullscreen) {
    pulsanteSchermo.hidden = false;
    pulsanteSchermo.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else figura.requestFullscreen();
    });
    document.addEventListener('fullscreenchange', () => {
      pulsanteSchermo.textContent = document.fullscreenElement ? 'Esci dallo schermo intero' : 'Schermo intero';
      nascondiTooltip();
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Grafico a ciambella: passando su uno spicchio (o toccandolo) si ingrossa
  //    e al centro compaiono il suo numero e la percentuale.
  // ---------------------------------------------------------------------------
  const ciambella = document.querySelector('.ciambella-svg');
  if (ciambella) {
    const archi = ciambella.querySelectorAll('.arco');
    const sopra = ciambella.querySelector('.ciambella-sopra');
    const numero = ciambella.querySelector('.ciambella-numero');
    const sotto = ciambella.querySelector('.ciambella-etichetta');
    let arcoAttivo = null;

    const mostraArco = (arco) => {
      arcoAttivo = arco;
      ciambella.classList.toggle('attiva', !!arco);
      archi.forEach((a) => a.classList.toggle('attivo', a === arco));
      numero.setAttribute('class', 'ciambella-numero' + (arco ? ' ' + arco.classList[1] : ''));
      if (arco) {
        sopra.textContent = arco.dataset.etichetta;
        numero.textContent = arco.dataset.valore;
        sotto.textContent = arco.dataset.percentuale + '%';
      } else {
        sopra.textContent = '';
        numero.textContent = numero.dataset.iniziale;
        sotto.textContent = sotto.dataset.iniziale;
      }
    };

    archi.forEach((arco) => {
      arco.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') mostraArco(arco); });
      arco.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mostraArco(null); });
      // tocco: un tocco mostra lo spicchio, un secondo tocco sullo stesso torna ai presenti
      arco.addEventListener('click', () => mostraArco(arcoAttivo === arco ? null : arco));
    });
    document.addEventListener('click', (e) => {
      if (arcoAttivo && !ciambella.contains(e.target)) mostraArco(null);
    });
  }

  // ---------------------------------------------------------------------------
  // 6. "Trova un deputato": scrivi un nome, scegli dall'elenco e il suo pallino si evidenzia
  // ---------------------------------------------------------------------------
  const trova = document.getElementById('trova-parlamentare');
  const listaTrova = figura.querySelector('.trova-risultati');
  if (trova && listaTrova) {
    const normalizza = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase();
    const nomi = dati.seggi.map((s, i) => ({ i, testo: normalizza(s[0]) }));

    const seleziona = (i) => {
      listaTrova.hidden = true;
      trova.value = dati.seggi[i][0];
      contenitore.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      nascondiTooltip();
      ultimoPuntatore = 'tastiera';
      mostraTooltip(i);
    };

    const aggiorna = () => {
      const parole = normalizza(trova.value).split(/\s+/).filter(Boolean);
      listaTrova.replaceChildren();
      if (!parole.length) {
        listaTrova.hidden = true;
        return;
      }
      const trovati = nomi.filter((n) => parole.every((p) => n.testo.includes(p))).slice(0, 8);
      if (!trovati.length) {
        const li = document.createElement('li');
        li.className = 'trova-nessuno';
        li.textContent = 'Nessun risultato';
        listaTrova.appendChild(li);
      }
      for (const { i } of trovati) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = dati.seggi[i][0];
        const sigla = document.createElement('span');
        sigla.textContent = dati.gruppi[dati.seggi[i][1]].sigla;
        b.appendChild(sigla);
        b.addEventListener('click', () => seleziona(i));
        li.appendChild(b);
        listaTrova.appendChild(li);
      }
      listaTrova.hidden = false;
    };

    trova.addEventListener('input', aggiorna);
    trova.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        listaTrova.querySelector('button')?.click();
      } else if (e.key === 'Escape') {
        listaTrova.hidden = true;
      }
    });
  }

  // Stato iniziale coerente con l'indirizzo (?vista=partito è già applicato dallo script nell'<head>).
  impostaVista(radice.classList.contains('vista-partito') ? 'partito' : 'voto', false);
})();
