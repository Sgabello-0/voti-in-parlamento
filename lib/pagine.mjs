// Modelli HTML delle pagine del sito. Ogni funzione riceve dati già "preparati"
// dalla build (scripts/build.mjs) e restituisce una stringa HTML completa.

import { esc, dataLeggibile } from './html.mjs';
import { disegnaEmiciclo } from './emiciclo.mjs';

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
<link rel="stylesheet" href="${ctx.css}">
<script>
  // Prima che la pagina venga disegnata: segnala che JavaScript è attivo e
  // applica subito la vista richiesta nell'indirizzo (?vista=partito).
  document.documentElement.classList.add('js');
  if (new URLSearchParams(location.search).get('vista') === 'partito') document.documentElement.classList.add('vista-partito');
</script>
${extra}</head>`;
}

/** Testata del sito. */
function testata(ctx) {
  return `<a class="salta" href="#contenuto">Vai al contenuto</a>
<header class="testata"><div class="contenitore"><a class="marchio" href="/">${esc(ctx.NOME_SITO)}</a></div></header>`;
}

/** Piede con fonti e licenze. `specifiche` = righe in più (fonti della singola votazione). */
function piede(specifiche = '') {
  return `<footer class="piede">
<div class="contenitore">
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
    seggi: v.seggi.map((s) => [s.nomeCompleto, s.indiceGruppo, s.voto]),
  }).replace(/</g, '\\u003c');

  const legendaPartiti = v.gruppi
    .map((g) => `<li><button type="button" data-g="${g.indice}" data-filtro="${g.indice}" aria-pressed="false" title="${esc(g.nome)}"><span class="chip" aria-hidden="true"></span>${esc(g.etichetta)}</button></li>`)
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

  const righeElenco = v.elenco
    .map((p) => `<tr><td>${esc(p.nomeCompleto)}</td><td><abbr title="${esc(p.nomeGruppo)}">${esc(p.etichettaGruppo)}</abbr></td><td><span class="voto v-${p.voto}"><span class="punto p-${p.voto}" aria-hidden="true"></span>${ETICHETTE_VOTO[p.voto]}</span></td></tr>`)
    .join('\n');

  const fonti = v.fonti
    .map((f) => `<a href="${esc(f.url)}">${esc(f.nome)}</a>, licenza ${linkLicenza(f.licenza)}`)
    .join('; ');
  const ufficiale = v.urlUfficiale ? ` Pagina ufficiale della seduta: <a href="${esc(v.urlUfficiale)}">${esc(v.urlUfficialeNome)}</a>.` : '';

  return `${testa({ ctx, titolo: titoloPagina, descrizione: descrizionePagina, url: v.url, tipo: 'article', extra: `<style>${coloriGruppi}</style>\n<script src="${ctx.js}" defer></script>\n` })}
<body>
${testata(ctx)}
<main id="contenuto" class="contenitore">
<article>
<header class="intestazione">
<p class="sopratitolo">${esc(v.ramoNome)} · <time datetime="${v.data}">${dataLeggibile(v.data)}</time> · Seduta ${v.seduta}, votazione n. ${v.numero_votazione}</p>
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
</header>

<section class="sezione-emiciclo" aria-labelledby="h-emiciclo">
<div class="barra-emiciclo">
<h2 id="h-emiciclo">Come hanno votato i ${v.parlamentariPlurale}</h2>
<div class="selettore" role="group" aria-label="Colora per">
<span class="selettore-etichetta" aria-hidden="true">Colora per:</span>
<button type="button" data-vista="voto" aria-pressed="true">Voto</button>
<button type="button" data-vista="partito" aria-pressed="false">Partito</button>
</div>
</div>
<figure class="emiciclo">
<div class="emiciclo-disegno">
${disegnaEmiciclo(v)}
<div class="tooltip" role="status" hidden></div>
</div>
<div class="legenda-partiti">
<p class="legenda-titolo">Gruppi, da sinistra a destra</p>
<ul>
${legendaPartiti}
</ul>
<div class="legenda-aloni">
<p class="legenda-titolo">Alone = voto</p>
<ul>
<li><span class="alone-chip a-favorevole" aria-hidden="true"></span>Favorevole</li>
<li><span class="alone-chip a-contrario" aria-hidden="true"></span>Contrario</li>
<li><span class="alone-chip a-astenuto" aria-hidden="true"></span>Astenuto</li>
<li><span class="alone-chip a-nessuno" aria-hidden="true"></span>Non ha votato</li>
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
<p class="descrizione">Tutti i ${v.seggi.length} ${v.parlamentariPlurale} in carica il ${dataLeggibile(v.data)}, in ordine alfabetico, con il gruppo a quella data.</p>
<div class="tabella-scorrevole">
<table class="elenco">
<thead><tr><th scope="col">${esc(v.parlamentareTitolo)}</th><th scope="col">Gruppo</th><th scope="col">Voto</th></tr></thead>
<tbody>
${righeElenco}
</tbody>
</table>
</div>
</section>
</article>
</main>
${piede(`<p>Fonte di questa votazione: ${fonti}.${ufficiale}</p>`)}
<script type="application/json" id="dati-emiciclo">${datiJs}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pagina iniziale con l'elenco delle votazioni
// ---------------------------------------------------------------------------

export function paginaIndice(votazioni, ctx) {
  const schede = votazioni
    .map((v) => {
      const t = v.totali;
      const esitoTesto = v.esito ? v.esito[0].toUpperCase() + v.esito.slice(1) : '';
      return `<li class="scheda">
<p class="sopratitolo">${esc(v.ramoNome)} · <time datetime="${v.data}">${dataLeggibile(v.data)}</time></p>
<h3><a href="/votazioni/${esc(v.slug)}/">${esc(v.titolo)}</a></h3>
${v.descrizione ? `<p class="descrizione scheda-descrizione">${esc(v.descrizione)}</p>` : ''}
<p class="scheda-risultato">${esitoTesto ? `<span class="esito esito-${esc(v.esito)}">${esc(esitoTesto)}</span>` : ''}
<span class="numero n-favorevoli">${t.favorevoli} favorevoli</span>
<span class="numero n-contrari">${t.contrari} contrari</span>
<span class="numero n-astenuti">${t.astenuti} astenuti</span></p>
</li>`;
    })
    .join('\n');

  const descrizione = 'Come hanno votato deputati e senatori, uno per uno, con il gruppo parlamentare di ciascuno alla data del voto. Dati ufficiali di Camera e Senato.';
  return `${testa({ ctx, titolo: `${ctx.NOME_SITO} – come votano deputati e senatori`, descrizione, url: ctx.URL_BASE + '/' })}
<body>
${testata(ctx)}
<main id="contenuto" class="contenitore">
<header class="intestazione">
<h1>${esc(ctx.NOME_SITO)}</h1>
<p class="descrizione">${esc(descrizione)}</p>
</header>
<section aria-labelledby="h-votazioni">
<h2 id="h-votazioni">Votazioni</h2>
<ul class="schede">
${schede}
</ul>
</section>
</main>
${piede()}
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
