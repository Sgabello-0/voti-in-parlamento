// Modelli HTML delle pagine del sito. Ogni funzione riceve dati già "preparati"
// dalla build (scripts/build.mjs) e restituisce una stringa HTML completa.

import { esc, dataLeggibile, giornoLeggibile } from './html.mjs';
import { disegnaEmiciclo } from './emiciclo.mjs';
import { disegnaCiambella } from './ciambella.mjs';
import { TIPI } from './tipi.mjs';
import { percorsoTipo, percorsoGiorno, percorsoLegislatura, schedaUfficiale } from './percorsi.mjs';
import { romano, anniLegislatura } from './legislature.mjs';
import { marchioSvg } from './logo.mjs';

const TIPO = Object.fromEntries(TIPI.map((t) => [t.chiave, t]));
/** Nome al singolare del tipo, per l'intestazione della votazione ("Emendamento"). */
const TIPO_SINGOLARE = {
  finale: 'Voto finale', fiducia: 'Questione di fiducia', risoluzione: 'Risoluzione o mozione', pregiudiziale: 'Questione pregiudiziale',
  articolo: 'Articolo', emendamento: 'Emendamento', ordine_del_giorno: 'Ordine del giorno', altro: 'Altra votazione',
};

export const ETICHETTE_VOTO = {
  favorevole: 'Favorevole',
  contrario: 'Contrario',
  astenuto: 'Astenuto',
  assente: 'Assente',
  missione: 'In missione',
  non_votante: 'Non votante',
};

const LICENZE = {
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/deed.it',
  'CC BY 3.0 IT': 'https://creativecommons.org/licenses/by/3.0/it/',
};

const linkLicenza = (nome) => (LICENZE[nome] ? `<a href="${LICENZE[nome]}" rel="license">${esc(nome)}</a>` : esc(nome));

/** Parte comune <head>. */
function testa({ ctx, titolo, descrizione, url, tipo = 'website', extra = '' }) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titolo)}</title>
<meta name="description" content="${esc(descrizione)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="${tipo}">
<meta property="og:locale" content="it_IT">
<meta property="og:site_name" content="${esc(ctx.NOME_SITO)}">
<meta property="og:title" content="${esc(titolo)}">
<meta property="og:description" content="${esc(descrizione)}">
<meta property="og:url" content="${esc(url)}">
<meta name="theme-color" content="#0B1D3A">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${ctx.css}">
<script>
  // Prima che la pagina venga disegnata: segnala che JavaScript è attivo e
  // applica subito la vista richiesta nell'indirizzo (?vista=partito).
  document.documentElement.classList.add('js');
  if (new URLSearchParams(location.search).get('vista') === 'partito') document.documentElement.classList.add('vista-partito');
</script>
${extra}</head>`;
}

/** Testata del sito: logo e menu. */
function testata(ctx) {
  return `<a class="salta" href="#contenuto">Vai al contenuto</a>
<header class="testata">
<div class="contenitore testata-riga">
<a class="marchio" href="/">${marchioSvg()}<span class="marchio-nome"><span class="marchio-voti">Voti</span> in Parlamento</span></a>
<nav class="menu" aria-label="Sezioni">
<a href="/#voti-del-giorno">Voti del giorno</a>
<a href="/#legislature">Legislature</a>
<a href="/#cerca">Cerca</a>
</nav>
</div>
</header>`;
}

/** Piede con fonti e licenze. `specifiche` = righe in più (fonti della singola votazione). */
function piede(specifiche = '') {
  return `<footer class="piede">
<div class="contenitore">
<p class="piede-marchio">${marchioSvg({ larghezza: 32 })}<span>Voti in Parlamento</span></p>
<h2 class="visivamente-nascosto">Fonti e licenze</h2>
${specifiche}
<p>Fonti: open data ufficiali della <a href="https://dati.camera.it">Camera dei deputati (dati.camera.it)</a>, licenza ${linkLicenza('CC BY-SA 4.0')},
e del <a href="https://dati.senato.it">Senato della Repubblica (dati.senato.it)</a>, licenza ${linkLicenza('CC BY 3.0 IT')}.
Il gruppo di ogni parlamentare è quello a cui apparteneva alla data del voto.</p>
<p>I dati restano sotto le licenze delle fonti: quelli della Camera, rielaborati in questo sito, sono condivisi con la stessa licenza CC BY-SA 4.0.
Il codice del sito è distribuito con licenza MIT.</p>
</div>
</footer>`;
}

// ---------------------------------------------------------------------------
// Pagina di una votazione
// ---------------------------------------------------------------------------

/**
 * @param {object} v   votazione preparata dalla build (vedi preparaVotazione in scripts/build.mjs)
 * @param {object} ctx { URL_BASE, NOME_SITO, css, js }
 */
export function paginaVotazione(v, ctx) {
  const t = v.totali;
  const esitoTesto = v.esito ? v.esito[0].toUpperCase() + v.esito.slice(1) : '';
  const conta = (voto) => v.seggi.filter((s) => s.voto === voto).length;

  const titoloPagina = `${v.titolo} – ${v.ramoBreve}, ${dataLeggibile(v.data)} | ${ctx.NOME_SITO}`;
  const descrizionePagina =
    `${v.ramoNome}, ${dataLeggibile(v.data)}: ${v.titolo}. ` +
    `${esitoTesto ? esitoTesto + ' con ' : ''}${t.favorevoli} favorevoli, ${t.contrari} contrari e ${t.astenuti} astenuti. ` +
    `Come ha votato ogni ${v.parlamentareSingolare}, gruppo per gruppo.`;

  // Colori dei gruppi come variabile CSS --cg, usata da pallini, legenda e tabelle.
  const coloriGruppi = v.gruppi.filter((g) => g.colore).map((g) => `[data-g="${g.indice}"]{--cg:${g.colore}}`).join('');

  // Dati minimi per il tooltip (lo legge assets/emiciclo.js).
  const datiJs = JSON.stringify({
    gruppi: v.gruppi.map((g) => ({ sigla: g.sigla, nome: g.nome })),
    // [nome, gruppo, voto, incarichi di Governo (0 se non ne ha), pagina del parlamentare]
    seggi: v.seggi.map((s) => [s.nomeCompleto, s.indiceGruppo, s.voto, s.governo ? s.governo.incarichi.join(' · ') : 0, s.percorso]),
  }).replace(/</g, '\\u003c');

  // Legenda dei gruppi: nome completo, con la sigla (quella scritta sull'arco) più piccola.
  const legendaPartiti = v.gruppi
    .map((g) => {
      const sigla = g.etichetta !== g.nome ? `<span class="legenda-sigla">${esc(g.etichetta)}</span>` : '';
      return `<li><button type="button" data-g="${g.indice}" data-filtro="${g.indice}" aria-pressed="false"><span class="chip" aria-hidden="true"></span><span class="legenda-nome">${esc(g.nome)}${sigla}</span></button></li>`;
    })
    .join('\n');

  const righeRiepilogo = v.gruppi
    .map((g) => {
      const c = g.conteggi;
      return `<tr data-g="${g.indice}">
<th scope="row"><button type="button" class="gruppo-btn" data-filtro="${g.indice}" aria-pressed="false" title="${esc(g.nome)}"><span class="chip" aria-hidden="true"></span><span><span class="sigla-tabella">${esc(g.etichetta)}</span><span class="nome-gruppo">${esc(g.nome)}</span></span></button></th>
<td>${c.favorevole}</td><td>${c.contrario}</td><td>${c.astenuto}</td><td>${c.assente}</td><td>${c.missione}</td><td>${c.non_votante}</td><td>${g.totale}</td>
</tr>`;
    })
    .join('\n');

  // Elenco completo diviso per gruppo (stesso ordine dell'emiciclo): un <tbody> per gruppo,
  // con una riga di intestazione. data-g sul <tbody> fa funzionare anche qui il filtro per gruppo.
  const blocchiElenco = v.elencoPerGruppo
    .map(({ gruppo: g, membri }) => `<tbody data-g="${g.indice}">
<tr class="riga-gruppo"><th colspan="2" scope="rowgroup"><span class="chip" aria-hidden="true"></span><span>${esc(g.nome)}</span><span class="riga-gruppo-dettagli">${esc(g.etichetta)} · ${membri.length}</span></th></tr>
${membri.map((p) => `<tr><td><a href="${esc(p.percorso)}">${esc(p.nomeCompleto)}</a>${p.governo ? `<span class="incarico">${esc(p.governo.incarichi.join(' · '))}</span>` : ''}</td><td><span class="voto v-${p.voto}"><span class="punto p-${p.voto}" aria-hidden="true"></span>${ETICHETTE_VOTO[p.voto]}</span></td></tr>`).join('\n')}
</tbody>`)
    .join('\n');

  const tipo = TIPO[v.tipo] ?? TIPO.altro;
  const fonti = v.fonti
    .map((f) => `<a href="${esc(f.url)}">${esc(f.nome)}</a>, licenza ${linkLicenza(f.licenza)}`)
    .join('; ');
  const ufficiale = v.urlUfficiale ? ` Pagina ufficiale della seduta: <a href="${esc(v.urlUfficiale)}">${esc(v.urlUfficialeNome)}</a>.` : '';

  return `${testa({ ctx, titolo: titoloPagina, descrizione: descrizionePagina, url: v.url, tipo: 'article', extra: `<style>${coloriGruppi}</style>\n<script src="${ctx.js}" defer></script>\n` })}
<body>
${testata(ctx)}
<main id="contenuto">
<article>
<div class="contenitore">
<header class="intestazione intestazione-votazione">
<div class="intestazione-testo">
<nav class="briciole" aria-label="Percorso"><a href="${percorsoLegislatura(v.legislatura)}">${romano(v.legislatura)} legislatura</a><span aria-hidden="true">›</span><span>${esc(v.ramoNome)}</span><span aria-hidden="true">›</span><a href="${percorsoTipo(v.legislatura, v.ramo, tipo.chiave)}" title="${esc(tipo.spiegazione)}">${esc(tipo.nome)}</a></nav>
<p class="sopratitolo"><a href="${percorsoGiorno(v.data)}"><time datetime="${v.data}">${giornoLeggibile(v.data)}</time></a> · Seduta ${v.seduta}, votazione n. ${v.numero_votazione} · <span class="etichetta-tipo t-${tipo.chiave}">${esc(TIPO_SINGOLARE[tipo.chiave])}</span></p>
<h1>${esc(v.titolo)}</h1>
${v.descrizione ? `<p class="descrizione">${esc(v.descrizione)}</p>` : ''}
${esitoTesto ? `<p class="esito esito-${esc(v.esito)}">${esc(esitoTesto)}</p>` : ''}
<dl class="totali">
<div class="tot-favorevoli"><dt>Favorevoli</dt><dd>${t.favorevoli}</dd></div>
<div class="tot-contrari"><dt>Contrari</dt><dd>${t.contrari}</dd></div>
<div class="tot-astenuti"><dt>Astenuti</dt><dd>${t.astenuti}</dd></div>
<div><dt>Presenti</dt><dd>${t.presenti}</dd></div>
<div><dt>Votanti</dt><dd>${t.votanti}</dd></div>
</dl>
</div>
<figure class="ciambella">
${disegnaCiambella(t)}
</figure>
</header>
</div>

<!-- L'emiciclo occupa tutta la larghezza dello schermo (non solo la colonna centrale). -->
<section class="sezione-emiciclo" aria-labelledby="h-emiciclo">
<h2 id="h-emiciclo">Come hanno votato i ${v.parlamentariPlurale}</h2>
<figure class="emiciclo">
<div class="emiciclo-comandi">
<div class="selettore" role="group" aria-label="Colora per">
<span class="selettore-etichetta" aria-hidden="true">Colora per:</span>
<button type="button" data-vista="voto" aria-pressed="true">Voto</button>
<button type="button" data-vista="partito" aria-pressed="false">Partito</button>
</div>
<button type="button" class="schermo-intero" hidden>Schermo intero</button>
<div class="trova solo-js">
<label for="trova-parlamentare" class="visivamente-nascosto">Trova un ${v.parlamentareSingolare}</label>
<input type="search" id="trova-parlamentare" placeholder="Trova un ${v.parlamentareSingolare}…" autocomplete="off">
<ul class="trova-risultati" hidden></ul>
</div>
</div>
<div class="emiciclo-disegno">
${disegnaEmiciclo(v)}
<div class="tooltip" role="status" hidden></div>
</div>
<div class="legenda-partiti">
<p class="legenda-titolo">Gruppi, da sinistra a destra</p>
<ul>
${legendaPartiti}
</ul>
<div class="legenda-bordi">
<p class="legenda-titolo">Anello = voto</p>
<ul>
<li><span class="bordo-chip b-favorevole" aria-hidden="true"></span>Favorevole</li>
<li><span class="bordo-chip b-contrario" aria-hidden="true"></span>Contrario</li>
<li><span class="bordo-chip b-astenuto" aria-hidden="true"></span>Astenuto</li>
<li><span class="bordo-chip b-nessuno" aria-hidden="true"></span>Non ha votato (nessun anello)</li>
</ul>
</div>
</div>
<figcaption class="visivamente-nascosto">Emiciclo: ogni pallino è un ${v.parlamentareSingolare}; ogni spicchio è un gruppo parlamentare. L'elenco completo è nella tabella più sotto.</figcaption>
</figure>

<div class="legenda-voti">
<h2 class="visivamente-nascosto">Legenda</h2>
<ul>
<li><span class="punto p-favorevole" aria-hidden="true"></span><span>Favorevoli <strong>${t.favorevoli}</strong></span></li>
<li><span class="punto p-contrario" aria-hidden="true"></span><span>Contrari <strong>${t.contrari}</strong></span></li>
<li><span class="punto p-astenuto" aria-hidden="true"></span><span>Astenuti <strong>${t.astenuti}</strong></span></li>
<li><span class="punto p-assente" aria-hidden="true"></span><span>Non hanno votato: assenti <strong>${conta('assente')}</strong>, in missione <strong>${conta('missione')}</strong>, non votanti <strong>${conta('non_votante')}</strong></span></li>
</ul>
<p class="nota">${esc(v.notaNonVotanti)} <span class="solo-js">Clicca su un gruppo (nella legenda, sulla sigla o nella tabella) per evidenziarlo; un secondo clic toglie il filtro.</span></p>
</div>
</section>

<div class="contenitore">
<section class="card" aria-labelledby="h-riepilogo">
<h2 id="h-riepilogo">Riepilogo per gruppo</h2>
<div class="tabella-scorrevole">
<table class="riepilogo">
<thead><tr><th scope="col">Gruppo</th><th scope="col">Favorevoli</th><th scope="col">Contrari</th><th scope="col">Astenuti</th><th scope="col">Assenti</th><th scope="col">In missione</th><th scope="col">Non votanti</th><th scope="col">Totale</th></tr></thead>
<tbody>
${righeRiepilogo}
</tbody>
<tfoot><tr><th scope="row">Totale</th><td>${conta('favorevole')}</td><td>${conta('contrario')}</td><td>${conta('astenuto')}</td><td>${conta('assente')}</td><td>${conta('missione')}</td><td>${conta('non_votante')}</td><td>${v.seggi.length}</td></tr></tfoot>
</table>
</div>
</section>

<section class="card" aria-labelledby="h-elenco">
<h2 id="h-elenco">Come ha votato ogni ${v.parlamentareSingolare}</h2>
<p class="descrizione">Tutti i ${v.seggi.length} ${v.parlamentariPlurale} in carica il ${dataLeggibile(v.data)}, divisi per gruppo (con il gruppo a quella data, nello stesso ordine dell'emiciclo) e in ordine alfabetico dentro ogni gruppo.</p>
<div class="tabella-scorrevole">
<table class="elenco">
<thead><tr><th scope="col">${esc(v.parlamentareTitolo)}</th><th scope="col">Voto</th></tr></thead>
${blocchiElenco}
</table>
</div>
</section>
</div>
</article>
</main>
${piede(`<p>Fonte di questa votazione: ${fonti}.${ufficiale}</p>`)}
<script type="application/json" id="dati-emiciclo">${datiJs}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pezzi comuni: scheda di una votazione, barra dei risultati, riga di tabella
// ---------------------------------------------------------------------------

const esitoMaiuscolo = (esito) => (esito ? esito[0].toUpperCase() + esito.slice(1) : '');
const RAMO_BREVE = { camera: 'Camera', senato: 'Senato' };

/** Barra orizzontale con le proporzioni di sì, no e astenuti (il testo con i numeri è accanto). */
function barraRisultato(t) {
  const tot = t.favorevoli + t.contrari + t.astenuti;
  if (!tot) return '';
  const parte = (classe, n) => (n ? `<span class="${classe}" style="flex-grow:${n}"></span>` : '');
  return `<span class="barra" aria-hidden="true">${parte('b-favorevoli', t.favorevoli)}${parte('b-contrari', t.contrari)}${parte('b-astenuti', t.astenuti)}</span>`;
}

/**
 * Scheda (riquadro) di una votazione.
 * @param {object} r        riassunto della votazione (vedi build)
 * @param {object} o        { titolo: 'h3'|'h4'|'h5', conRamo: mostra Camera/Senato, conData: mostra la data }
 */
function schedaVotazione(r, { titolo = 'h4', conRamo = false, conData = true } = {}) {
  const t = r.totali;
  const tipo = TIPO[r.tipo] ?? TIPO.altro;
  const dettagli = [
    conRamo ? `<span class="etichetta-ramo r-${r.ramo}">${RAMO_BREVE[r.ramo]}</span>` : '',
    `<span class="etichetta-tipo t-${tipo.chiave}">${esc(TIPO_SINGOLARE[tipo.chiave])}</span>`,
    conData ? `<time datetime="${r.data}">${dataLeggibile(r.data)}</time>` : '',
  ].filter(Boolean).join('');
  return `<li class="scheda">
<p class="scheda-testa">${dettagli}</p>
<${titolo} class="scheda-titolo"><a href="${r.url}">${esc(r.titolo)}</a></${titolo}>
<div class="scheda-piede">
${barraRisultato(t)}
<p class="scheda-risultato">${r.esito ? `<span class="esito esito-${esc(r.esito)}">${esc(esitoMaiuscolo(r.esito))}</span>` : ''}
<span class="numero n-favorevoli">${t.favorevoli} sì</span>
<span class="numero n-contrari">${t.contrari} no</span>
<span class="numero n-astenuti">${t.astenuti} ast.</span></p>
</div>
</li>`;
}

/** Riga di una tabella di votazioni (liste per tipo, pagine dei giorni). */
function rigaVotazione(r, { conData = true, conTipo = false } = {}) {
  const t = r.totali;
  return `<tr>${conData ? `<td><time datetime="${r.data}">${dataLeggibile(r.data)}</time></td>` : ''}<td><a href="${r.url}">${esc(r.titolo)}</a>${conTipo ? `<span class="riga-tipo">${esc(TIPO_SINGOLARE[r.tipo] ?? '')}</span>` : ''}</td><td>${r.esito ? `<span class="esito-testo esito-${esc(r.esito)}">${esc(esitoMaiuscolo(r.esito))}</span>` : ''}</td><td class="n-favorevoli">${t.favorevoli}</td><td class="n-contrari">${t.contrari}</td><td class="n-astenuti">${t.astenuti}</td></tr>`;
}

const IMPORTANZA = Object.fromEntries(TIPI.map((t, i) => [t.chiave, i]));
/** Prima i tipi più importanti (voti finali, fiducie…), poi le più recenti. */
const perImportanza = (a, b) => (IMPORTANZA[a.tipo] ?? 99) - (IMPORTANZA[b.tipo] ?? 99) || b.seduta - a.seduta || b.numero_votazione - a.numero_votazione;

// ---------------------------------------------------------------------------
// Pagina iniziale: voti del giorno, poi le legislature (ramo, tipo, più recenti)
// ---------------------------------------------------------------------------

const SCHEDE_PER_TIPO = 3; // nella home, le più recenti di ogni tipo; le altre nella lista del tipo
const SCHEDE_DEL_GIORNO = 6;

/** Testo che dice quali votazioni ci sono nel sito per una legislatura. */
function copertura(l) {
  if (l.completaDal) {
    return `Tutte le votazioni dal ${dataLeggibile(l.completaDal)}${l.importantiPrima ? '; prima, solo i voti finali e le questioni di fiducia' : ''}.`;
  }
  return 'Solo i voti più importanti: i voti finali sulle leggi e le questioni di fiducia.';
}

/**
 * @param {object[]} riassunti  tutte le votazioni, dalla più recente
 * @param {object} ctx
 * @param {object} o  { legislature: [{ numero, completaDal, importantiPrima }] (dalla più recente), giorno: data dei voti del giorno }
 */
export function paginaIndice(riassunti, ctx, { legislature, giorno }) {
  // --- Voti del giorno: l'ultimo giorno con votazioni, prima le più importanti ---
  const delGiorno = riassunti.filter((r) => r.data === giorno).sort(perImportanza);
  const perRamo = ['camera', 'senato'].map((ramo) => [ramo, delGiorno.filter((r) => r.ramo === ramo).length]).filter(([, n]) => n);
  const vediTutte = `<a class="tutte" href="${percorsoGiorno(giorno)}">${delGiorno.length > SCHEDE_DEL_GIORNO ? `Tutte le ${delGiorno.length} votazioni del giorno →` : 'Pagina del giorno →'}</a>`;
  const sezioneGiorno = `<section class="giorno-home" id="voti-del-giorno" aria-labelledby="h-giorno">
<div class="giorno-testa">
<div>
<p class="occhiello">Ultima giornata con votazioni</p>
<h2 id="h-giorno">Voti del giorno <span class="giorno-data"><time datetime="${giorno}">${giornoLeggibile(giorno)}</time></span></h2>
<p class="giorno-conteggi">${perRamo.map(([ramo, n]) => `<span class="etichetta-ramo r-${ramo}">${RAMO_BREVE[ramo]}</span> ${n} ${n === 1 ? 'votazione' : 'votazioni'}`).join('<span class="sep" aria-hidden="true">·</span>')}</p>
</div>
${vediTutte}
</div>
<ul class="schede schede-giorno">
${delGiorno.slice(0, SCHEDE_DEL_GIORNO).map((r) => schedaVotazione(r, { titolo: 'h3', conRamo: true, conData: false })).join('\n')}
</ul>
</section>`;

  // --- Legislature: per ramo (Camera, poi Senato), poi per tipo, poi dalla più recente ---
  const navLegislature = `<nav class="legislature-nav" aria-label="Legislature">
${legislature.map((l) => `<a href="#legislatura-${l.numero}"><span class="romano">${romano(l.numero)}</span><span class="anni">${anniLegislatura(l.numero)}</span></a>`).join('\n')}
</nav>`;
  const sezioniLegislature = legislature.map((l) => {
    const dellaLeg = riassunti.filter((r) => r.legislatura === l.numero);
    const rami = [['camera', 'Camera dei deputati'], ['senato', 'Senato della Repubblica']].map(([ramo, nomeRamo]) => {
      const delRamo = dellaLeg.filter((r) => r.ramo === ramo);
      if (!delRamo.length) return '';
      const id = `${l.numero}-${ramo}`;
      const blocchi = TIPI.map((t) => {
        const righe = delRamo.filter((r) => r.tipo === t.chiave);
        if (!righe.length) return '';
        return `<section class="tipo" aria-labelledby="h-${id}-${t.chiave}">
<div class="tipo-testa">
<h4 id="h-${id}-${t.chiave}">${esc(t.nome)} <span class="conteggio">${righe.length}</span></h4>
<a class="tutte" href="${percorsoTipo(l.numero, ramo, t.chiave)}">${righe.length > SCHEDE_PER_TIPO ? `Tutte le ${righe.length} →` : 'Elenco →'}</a>
</div>
<p class="tipo-spiegazione">${esc(t.spiegazione)}</p>
<ul class="schede">
${righe.slice(0, SCHEDE_PER_TIPO).map((r) => schedaVotazione(r, { titolo: 'h5' })).join('\n')}
</ul>
</section>`;
      }).join('\n');
      return `<section class="ramo r-${ramo}" aria-labelledby="h-${id}">
<h3 id="h-${id}">${nomeRamo} <span class="conteggio">${delRamo.length} ${delRamo.length === 1 ? 'votazione' : 'votazioni'}</span></h3>
${blocchi}
</section>`;
    }).join('\n');
    return `<section class="legislatura" id="legislatura-${l.numero}" aria-labelledby="h-leg-${l.numero}">
<header class="legislatura-testa">
<p class="legislatura-romano" aria-hidden="true">${romano(l.numero)}</p>
<div>
<h2 id="h-leg-${l.numero}">${romano(l.numero)} legislatura <span class="anni">${anniLegislatura(l.numero)}</span></h2>
<p class="legislatura-nota">${esc(copertura(l))}</p>
</div>
</header>
${rami}
</section>`;
  }).join('\n');

  const descrizione = 'Come hanno votato deputati e senatori, uno per uno, con il gruppo parlamentare di ciascuno alla data del voto. Dati ufficiali di Camera e Senato.';
  return `${testa({ ctx, titolo: `${ctx.NOME_SITO} – come votano deputati e senatori`, descrizione, url: ctx.URL_BASE + '/', extra: `<script src="${ctx.jsRicerca}" defer></script>\n` })}
<body class="home">
${testata(ctx)}
<main id="contenuto">
<div class="eroe">
<div class="contenitore">
<h1>Come votano deputati e senatori</h1>
<p class="eroe-testo">Ogni voto di ogni parlamentare, con il gruppo a cui apparteneva quel giorno. Dati ufficiali di Camera e Senato.</p>
<search class="ricerca solo-js" id="cerca" role="search" data-indice="/indice.json">
<label for="campo-ricerca" class="visivamente-nascosto">Cerca una votazione o un parlamentare</label>
<input type="search" id="campo-ricerca" placeholder="Cerca leggi, temi o parlamentari…" autocomplete="off">
<p class="ricerca-esito" role="status" aria-live="polite"></p>
<div class="ricerca-risultati" hidden></div>
</search>
</div>
</div>
<div class="contenitore sezioni-home">
${sezioneGiorno}
<div id="legislature" class="legislature">
${navLegislature}
${sezioniLegislature}
</div>
</div>
</main>
${piede()}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Lista di tutte le votazioni di un tipo, in un ramo e in una legislatura
// ---------------------------------------------------------------------------

export function paginaElencoTipo({ legislatura, ramo, ramoNome, tipo, righe, percorso }, ctx) {
  const leg = `${romano(legislatura)} legislatura`;
  const titolo = `${tipo.nome} – ${ramoNome}, ${leg}`;
  const descrizione = `${tipo.nome} votati dal ${ramo === 'camera' ? 'la Camera' : 'il Senato'} nella ${leg}: ${righe.length} votazioni, dalla più recente. ${tipo.spiegazione}`;
  return `${testa({ ctx, titolo: `${titolo} | ${ctx.NOME_SITO}`, descrizione, url: ctx.URL_BASE + percorso })}
<body>
${testata(ctx)}
<main id="contenuto" class="contenitore">
<header class="intestazione">
<nav class="briciole" aria-label="Percorso"><a href="${percorsoLegislatura(legislatura)}">${leg}</a><span aria-hidden="true">›</span><span>${esc(ramoNome)}</span></nav>
<h1>${esc(tipo.nome)} <span class="conteggio">${righe.length}</span></h1>
<p class="descrizione">${esc(tipo.spiegazione)}</p>
</header>
<section class="card" aria-label="${esc(titolo)}">
<div class="tabella-scorrevole">
<table class="lista-votazioni">
<thead><tr><th scope="col">Data</th><th scope="col">Votazione</th><th scope="col">Esito</th><th scope="col">Sì</th><th scope="col">No</th><th scope="col">Astenuti</th></tr></thead>
<tbody>
${righe.map((r) => rigaVotazione(r)).join('\n')}
</tbody>
</table>
</div>
</section>
</main>
${piede()}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pagina di un giorno: tutte le votazioni di quel giorno, per ramo e per tipo
// ---------------------------------------------------------------------------

export function paginaGiorno({ data, righe, precedente, successivo }, ctx) {
  const giorno = giornoLeggibile(data);
  const descrizione = `Le votazioni di Camera e Senato del ${dataLeggibile(data)}: ${righe.length} votazioni, con il voto di ogni parlamentare.`;
  const rami = [['camera', 'Camera dei deputati'], ['senato', 'Senato della Repubblica']].map(([ramo, nomeRamo]) => {
    const delRamo = righe.filter((r) => r.ramo === ramo).sort(perImportanza);
    if (!delRamo.length) return '';
    return `<section class="card" aria-labelledby="h-${ramo}">
<h2 id="h-${ramo}">${nomeRamo} <span class="conteggio">${delRamo.length} ${delRamo.length === 1 ? 'votazione' : 'votazioni'}</span></h2>
<div class="tabella-scorrevole">
<table class="lista-votazioni lista-giorno">
<thead><tr><th scope="col">Votazione</th><th scope="col">Esito</th><th scope="col">Sì</th><th scope="col">No</th><th scope="col">Astenuti</th></tr></thead>
<tbody>
${delRamo.map((r) => rigaVotazione(r, { conData: false, conTipo: true })).join('\n')}
</tbody>
</table>
</div>
</section>`;
  }).join('\n');
  const navigazione = `<nav class="giorni-nav" aria-label="Altri giorni">
${precedente ? `<a href="${percorsoGiorno(precedente)}" rel="prev">← ${dataLeggibile(precedente)}</a>` : '<span></span>'}
${successivo ? `<a href="${percorsoGiorno(successivo)}" rel="next">${dataLeggibile(successivo)} →</a>` : '<span></span>'}
</nav>`;
  return `${testa({ ctx, titolo: `Votazioni del ${dataLeggibile(data)} | ${ctx.NOME_SITO}`, descrizione, url: ctx.URL_BASE + percorsoGiorno(data) })}
<body>
${testata(ctx)}
<main id="contenuto" class="contenitore">
<header class="intestazione">
<nav class="briciole" aria-label="Percorso"><a href="${percorsoLegislatura(righe[0].legislatura)}">${romano(righe[0].legislatura)} legislatura</a></nav>
<h1>Votazioni di ${esc(giorno)}</h1>
<p class="descrizione">${righe.length} ${righe.length === 1 ? 'votazione' : 'votazioni'} presenti nel sito, prima le più importanti.</p>
</header>
${navigazione}
${rami}
${navigazione}
</main>
${piede()}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pagina di un parlamentare: chi è, gruppo, incarico, link ufficiale e tutti i suoi voti
// ---------------------------------------------------------------------------

/** Testo scuro su colori chiari, chiaro su colori scuri (per le iniziali nel riquadro colorato). */
function testoSu(colore) {
  const m = String(colore ?? '').match(/^#([0-9a-f]{6})$/i);
  if (!m) return '#E8EEF7';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? '#0B1D3A' : '#FFFFFF';
}

export function paginaParlamentare(p, ctx) {
  const camera = p.ramo === 'camera';
  const nomeRamo = camera ? 'Camera dei deputati' : 'Senato della Repubblica';
  const iniziali = p.nomeCompleto.split(/\s+/).filter(Boolean);
  const sigla = ((iniziali[0]?.[0] ?? '') + (iniziali[iniziali.length - 1]?.[0] ?? '')).toUpperCase();

  // Quante volte ha votato in ciascun modo
  const conta = Object.fromEntries(Object.keys(ETICHETTE_VOTO).map((k) => [k, 0]));
  for (const r of p.voti) conta[r.voto]++;
  const partecipazioni = conta.favorevole + conta.contrario + conta.astenuto;
  const percentuale = p.voti.length ? Math.round((100 * partecipazioni) / p.voti.length) : 0;

  // Voti divisi per legislatura (dalla più recente) e, dentro, per tipo (in ordine di importanza).
  // I voti finali sono aperti, gli altri tipi si aprono con un clic.
  const legislature = [...new Set(p.voti.map((r) => r.legislatura))].sort((a, b) => b - a);
  const sezioni = legislature.map((leg) => {
    const dellaLeg = p.voti.filter((r) => r.legislatura === leg);
    const tipi = TIPI.map((t) => {
      const righe = dellaLeg.filter((r) => r.tipo === t.chiave);
      if (!righe.length) return '';
      const corpo = righe
        .map((r) => `<tr><td><time datetime="${r.data}">${dataLeggibile(r.data)}</time></td><td><a href="${r.url}">${esc(r.titolo)}</a></td><td><span class="voto v-${r.voto}"><span class="punto p-${r.voto}" aria-hidden="true"></span>${ETICHETTE_VOTO[r.voto]}</span></td><td>${esc(r.gruppoVoto)}</td></tr>`)
        .join('\n');
      return `<details class="voti-tipo"${t.chiave === 'finale' ? ' open' : ''}>
<summary><h3>${esc(t.nome)} <span class="conteggio">${righe.length}</span></h3></summary>
<div class="tabella-scorrevole">
<table class="lista-votazioni">
<thead><tr><th scope="col">Data</th><th scope="col">Votazione</th><th scope="col">Voto</th><th scope="col">Gruppo</th></tr></thead>
<tbody>
${corpo}
</tbody>
</table>
</div>
</details>`;
    }).join('\n');
    return `<section class="card voti-parlamentare" aria-labelledby="h-voti-${leg}">
<h2 id="h-voti-${leg}">${romano(leg)} legislatura <span class="anni">${anniLegislatura(leg)}</span> <span class="conteggio">${dellaLeg.length} ${dellaLeg.length === 1 ? 'votazione' : 'votazioni'}</span></h2>
${tipi}
</section>`;
  }).join('\n');
  const elencoLegislature = legislature.map(romano);
  const inLegislature = elencoLegislature.length > 1
    ? `${elencoLegislature.slice(0, -1).join(', ')} e ${elencoLegislature[elencoLegislature.length - 1]} legislatura`
    : `${elencoLegislature[0]} legislatura`;

  const g = p.gruppo ?? {};
  const titolo = `${p.nomeCompleto} – come ha votato | ${ctx.NOME_SITO}`;
  const descrizione = `Tutti i voti di ${p.nomeCompleto} (${nomeRamo}${g.nome ? `, ${g.nome}` : ''}) nelle votazioni presenti nel sito: ${p.voti.length} votazioni, ${conta.favorevole} favorevoli, ${conta.contrario} contrari, ${conta.astenuto} astenuti.`;
  return `${testa({ ctx, titolo, descrizione, url: ctx.URL_BASE + p.percorso, tipo: 'profile', extra: g.colore ? `<style>.avatar{--cg:${g.colore};color:${testoSu(g.colore)}}</style>\n` : '' })}
<body>
${testata(ctx)}
<main id="contenuto" class="contenitore">
<header class="intestazione intestazione-parlamentare">
<div class="avatar" aria-hidden="true">${esc(sigla)}</div>
<div>
<p class="sopratitolo">${esc(nomeRamo)} · ${inLegislature}</p>
<h1>${esc(p.nomeCompleto)}</h1>
${g.nome ? `<p class="gruppo-attuale"><span class="chip" aria-hidden="true" style="--cg:${esc(g.colore ?? '')}"></span>${esc(g.nome)} <span class="legenda-sigla">${esc(g.sigla ?? '')}</span><span class="nota-data">gruppo al ${dataLeggibile(g.data)}</span></p>` : ''}
${g.incarico ? `<p class="incarico-governo">${esc(g.incarico)}</p>` : ''}
<p><a class="link-ufficiale" href="${esc(schedaUfficiale(p.id_fonte))}">Scheda ufficiale negli open data ${camera ? 'della Camera (dati.camera.it)' : 'del Senato (dati.senato.it)'} ↗</a></p>
</div>
</header>
<dl class="totali">
<div><dt>Votazioni</dt><dd>${p.voti.length}</dd></div>
<div class="tot-favorevoli"><dt>Favorevole</dt><dd>${conta.favorevole}</dd></div>
<div class="tot-contrari"><dt>Contrario</dt><dd>${conta.contrario}</dd></div>
<div class="tot-astenuti"><dt>Astenuto</dt><dd>${conta.astenuto}</dd></div>
<div><dt>Assente</dt><dd>${conta.assente}</dd></div>
<div><dt>In missione</dt><dd>${conta.missione}</dd></div>
<div><dt>Ha votato</dt><dd>${percentuale}%</dd></div>
</dl>
<p class="descrizione nota-voti">Le votazioni presenti nel sito in cui era in carica, dalla più recente, divise per legislatura e per tipo. Il gruppo è quello alla data di ciascun voto.</p>
${sezioni}
</main>
${piede(`<p>Fonte: ${camera ? '<a href="https://dati.camera.it">open data della Camera dei deputati</a>, licenza ' + linkLicenza('CC BY-SA 4.0') : '<a href="https://dati.senato.it">open data del Senato della Repubblica</a>, licenza ' + linkLicenza('CC BY 3.0 IT')}.</p>`)}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pagina 404 (Firebase Hosting la usa da sola se si chiama 404.html)
// ---------------------------------------------------------------------------

export function pagina404(ctx) {
  return `${testa({ ctx, titolo: `Pagina non trovata | ${ctx.NOME_SITO}`, descrizione: 'La pagina richiesta non esiste.', url: ctx.URL_BASE + '/404.html', extra: '<meta name="robots" content="noindex">\n' })}
<body>
${testata(ctx)}
<main id="contenuto" class="contenitore">
<header class="intestazione">
<h1>Pagina non trovata</h1>
<p class="descrizione">La pagina che cerchi non esiste o è stata spostata. <a href="/">Torna all'elenco delle votazioni</a>.</p>
</header>
</main>
${piede()}
</body>
</html>
`;
}
