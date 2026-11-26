# Voti in Parlamento

Sito statico che mostra **come ha votato ogni parlamentare** nelle votazioni nominali di
Camera e Senato, con il **gruppo parlamentare di ciascuno alla data del voto**.
I dati vengono dagli open data ufficiali dei due rami del Parlamento.

Cosa c'è nel sito:

- **XIX legislatura** (dal 2022): tutte le votazioni dal 1° settembre 2026; prima, solo i voti
  importanti (voti finali e questioni di fiducia);
- **XVIII legislatura** (2018–2022): solo i voti importanti;
- ogni giorno il sito si aggiorna da solo con le votazioni nuove (vedi
  [Aggiornamento automatico](#aggiornamento-automatico)).

- Nessun framework, nessuna dipendenza npm: serve solo Node.js 18 o successivo.
- Le pagine sono HTML già pronto (titolo, totali, emiciclo, elenco completo), quindi
  leggibili dai motori di ricerca anche senza JavaScript. Il JavaScript serve solo per
  l'interattività.

## Struttura del progetto

```
data/
  votazioni/<slug>.json   una votazione per file (generati da scripts/scarica-votazione.mjs)
  gruppi.json             ordine, colore ed etichetta dei gruppi: lo compili tu
  raw/                    cache delle risposte delle fonti (esclusa da git)
lib/                      codice Node
  sparql.mjs              richieste agli endpoint SPARQL, con cache e pause tra le richieste
  camera.mjs              lettura di una votazione della Camera (dati.camera.it)
  senato.mjs              lettura di una votazione del Senato (dati.senato.it)
  comune.mjs              controlli e salvataggio delle votazioni, aggiornamento di gruppi.json
  scarica.mjs             punto d'ingresso comune (usato dallo script e dai test)
  elenco.mjs              elenco delle votazioni di un periodo (per lo scaricamento in blocco)
  emiciclo.mjs            geometria dell'emiciclo e disegno dell'SVG
  ciambella.mjs           grafico a ciambella (favorevoli, contrari, astenuti, presenti al centro)
  pagine.mjs              modelli HTML delle pagine
  html.mjs                piccole funzioni per l'HTML (escape, date, maiuscole)
  tipi.mjs                tipi di votazione (finale, emendamento, ordine del giorno…) e loro spiegazioni
  governo.mjs             membri del Governo alla data del voto (open data della Camera)
  percorsi.mjs            indirizzi delle pagine (votazioni, parlamentari, liste, giorni)
  legislature.mjs         legislature del sito: numeri romani, date, da quando ci sono tutte le votazioni
  logo.mjs                logo e icona del sito (SVG)
assets/                   file copiati nel sito così come sono
  stile.css               tutto lo stile (colori in :root)
  emiciclo.js             interattività: vista Voto/Partito, tooltip, filtro, ciambella, schermo intero
  ricerca.js              barra di ricerca della pagina iniziale
scripts/
  scarica-votazione.mjs   scarica una votazione → data/votazioni/<slug>.json
  scarica-periodo.mjs     scarica tutte le votazioni (o solo quelle importanti) di un periodo
  aggiorna.mjs            aggiornamento a mano: scarica le nuove, rigenera e pubblica
  build.mjs               genera il sito in public/
  anteprima.mjs           server locale per vedere il sito
  test-fase1.mjs          test sulle due votazioni di riferimento
public/                   sito generato (non è in git: lo rifà la build)
firebase.json, .firebaserc  configurazione di Firebase Hosting
.github/workflows/aggiorna.yml  aggiornamento automatico quotidiano (GitHub Actions)
```

## Fonti e licenze

| Ramo | Fonte | Cosa usiamo | Licenza |
|---|---|---|---|
| Camera | Open data della Camera: <https://dati.camera.it>, endpoint SPARQL <https://dati.camera.it/sparql> (ontologia OCD) | votazioni, voto di ogni deputato con la sigla del gruppo al momento del voto, mandati, adesioni ai gruppi e alle componenti del Misto con le date | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), come indicato nella scheda del dataset ["Votazioni della XIX Legislatura"](https://dati.camera.it/dataset/5212) |
| Senato | Open data del Senato: <https://dati.senato.it>, endpoint SPARQL <https://dati.senato.it/sparql> (ontologia OSR) | votazioni, ruolo di ogni senatore (favorevole, contrario, astenuto, congedo/missione, presidente, presente non votante), mandati, adesioni ai gruppi con le date, nomi dei gruppi | [CC BY 3.0 IT](https://creativecommons.org/licenses/by/3.0/it/): l'unico obbligo è citare la fonte ([pagina della licenza](https://dati.senato.it/sito/19?testo_generico=24)) |

**I dati restano sotto la licenza delle fonti.** La licenza MIT del progetto vale solo per
il codice. In particolare la CC BY-SA della Camera chiede che i dati ripubblicati (anche
rielaborati, come i file in `data/votazioni/` e le pagine del sito) restino sotto la stessa
licenza CC BY-SA 4.0. Il sito lo indica nel piè di pagina di ogni pagina.

Fonti controllate ma **non usate**:

- **Tabulati PDF della Camera** (linkati da `https://www.camera.it/leg19/410?idSeduta=0747&tipo=votazioni`):
  funzionano, e per la votazione 747/53 coincidono esattamente con gli open data. Non servono,
  perché gli open data hanno gli stessi voti con un identificativo per ogni deputato (niente
  problemi di omonimi) e la sigla del gruppo.
- **Pagine delle votazioni su senato.it**: non si possono leggere da uno script, perché
  www.senato.it risponde ai client automatici con una verifica anti-bot.
- **Openpolis** (parlamento19.openpolis.it): non ho trovato una licenza o condizioni d'uso
  per quei dati. Il sito www.openpolis.it usa CC BY-NC 4.0 (non commerciale).

**Ritardo degli open data.** Camera: i voti compaiono di solito il giorno dopo la seduta,
nel pomeriggio (la seduta del 17/11/2026 è stata caricata il 18/11 alle 16 circa, ora italiana).
Senato: la seduta del 18/11/2026 era già completa la mattina del 19/11.

## Scaricare una votazione

```sh
node scripts/scarica-votazione.mjs <camera|senato> <seduta> <votazione> [opzioni]
```

Esempi:

```sh
node scripts/scarica-votazione.mjs camera 747 53
node scripts/scarica-votazione.mjs senato 395 2 --titolo "Contrasto all'antisemitismo – voto finale"
```

Opzioni:

| Opzione | Cosa fa |
|---|---|
| `--legislatura N` | legislatura (predefinita: 19) |
| `--slug testo` | nome del file e dell'indirizzo della pagina (predefinito: `camera-19-747-53`) |
| `--titolo "..."` | titolo da mostrare al posto di quello ufficiale, spesso poco leggibile (es. "PDL 2830 E ABB - VOTO FINALE") |
| `--descrizione "..."` | descrizione da mostrare al posto di quella ricavata dalle fonti (titolo dell'atto o dei ddl) |
| `--aggiorna` | ignora la cache in `data/raw/` e riscarica dalle fonti |

Il numero di seduta e di votazione si trovano sui siti ufficiali (per la Camera:
`https://www.camera.it/leg19/410?idSeduta=0747&tipo=votazioni`).

**Titoli automatici.** Il titolo leggibile viene ricavato dai testi ufficiali, senza inventare nulla:

- Camera: se la descrizione ufficiale è un codice (es. "DDL 3043-A - VOTO FINALE"), il titolo è
  l'oggetto dell'atto (il testo tra virgolette nel suo titolo) seguito da cosa si vota
  ("… – voto finale"); se è già un titolo vero e proprio, resta quello;
- Senato: titolo breve ufficiale del disegno di legge principale + cosa si vota
  (es. "Contrasto all'antisemitismo – voto finale"); descrizione: titolo completo e ddl abbinati.

`--titolo` e `--descrizione` servono solo se vuoi un testo diverso. **Non vengono ricordati**:
se riscarichi una votazione, ripassa le opzioni.

### Scaricare tutte le votazioni di un periodo

```sh
node scripts/scarica-periodo.mjs --dal 2026-09-01 --elenco         # solo l'elenco, senza scaricare
node scripts/scarica-periodo.mjs --dal 2026-09-01 --solo-finali    # solo le votazioni finali
node scripts/scarica-periodo.mjs --dal 2026-09-01                  # tutte
# una legislatura passata, solo i voti importanti (voti finali e questioni di fiducia):
node scripts/scarica-periodo.mjs --legislatura 18 --dal 2018-03-23 --al 2022-10-12 --importanti
```

Opzioni: `--al AAAA-MM-GG` (predefinita: oggi), `--ramo camera|senato`, `--legislatura N`,
`--importanti` (solo voti finali e fiducie, filtrati già nella query), `--aggiorna` (riscarica
anche le votazioni presenti), `--fresco` (scarica quelle mancanti senza usare la cache: serve a
riprovare quelle a cui prima mancava qualche dato nelle fonti).
Se un elenco ha un numero "tondo" di righe (10.000, 20.000…) lo script si ferma: vuol dire che
il server l'ha tagliato, e bisogna restringere il periodo.
Le votazioni già scaricate vengono saltate; quelle a voto segreto, annullate o di sola verifica
del numero legale vengono saltate con il motivo. Alla fine lo script elenca scaricate, saltate
ed errori: un errore su una votazione non ferma le altre. L'elenco viene sempre riletto dalla
fonte; i dati delle singole votazioni usano la cache.

Cosa fa lo script:

- fa poche richieste e lente (almeno 2 secondi tra l'una e l'altra alla Camera, 5 al Senato),
  con uno User-Agent che identifica il progetto, e salva le risposte in `data/raw/`;
- mandati, adesioni ai gruppi, componenti del Misto e nomi dei gruppi si scaricano **una volta
  per legislatura** (poi si filtrano alla data di ogni voto): così le richieste sono molte meno.
  Per la legislatura in corso quella risposta vale solo per il giorno in cui è stata scaricata,
  perché i gruppi cambiano;
- include **tutti** i parlamentari in carica alla data, anche chi non ha votato
  (voto: `favorevole`, `contrario`, `astenuto`, `assente`, `missione`, `non_votante`);
- prende il gruppo **alla data del voto**. Alla Camera usa la sigla registrata nel voto stesso
  e la confronta con le adesioni ai gruppi con le date; al Senato usa le adesioni con le date;
- **si ferma con un errore** se i conteggi non coincidono con i totali ufficiali, se un
  parlamentare non ha un gruppo o se i dati sono incoerenti. Non corregge mai nulla a mano;
- aggiunge a `data/gruppi.json` gli eventuali gruppi nuovi, con ordine e colore vuoti.

Il test `npm test` verifica le due votazioni di riferimento (Camera 747/53 e Senato 395/2).
Usa la cache ma scrive i risultati in una cartella temporanea, quindi non tocca `data/`.

Note sui dati:

- **Misto della Camera**: la Camera registra la componente del Misto (es. `M-FNVF` =
  Misto-Futuro Nazionale Vannacci - Free). Ogni componente è un gruppo a sé nell'emiciclo.
  `M-ALT` sono i deputati del Misto che negli open data non hanno nessuna componente.
  Il Senato non pubblica le componenti: lì c'è solo `Misto`.
- **Non votanti**: alla Camera sono il Presidente della Camera (che per prassi non vota) e
  chi presiede la seduta; al Senato chi presiede e i presenti che non hanno votato.
- **Nomi**: la Camera li scrive tutti in maiuscolo. Il sito li mostra come "Nome Cognome",
  mentre i file JSON li lasciano come nella fonte. Gli accenti scritti con l'apostrofo
  (es. `CARE'`) restano così, perché la fonte non dice quale accento sia.

## Compilare `data/gruppi.json`

Il file ha una lista di gruppi per ogni ramo (le sigle sono diverse tra Camera e Senato):

```json
{
  "camera": [
    { "sigla": "FDI", "nome": "FRATELLI D'ITALIA", "ordine": null, "colore": null }
  ],
  "senato": [ ... ]
}
```

| Campo | Cosa mettere |
|---|---|
| `ordine` | un numero: posizione del gruppo da **sinistra a destra** nell'emiciclo (1 = il più a sinistra). Non serve che siano consecutivi. |
| `colore` | colore del gruppo in formato `#RRGGBB`, usato nella vista "Partito" |
| `etichetta` | *(facoltativo)* sigla breve da mostrare al posto di quella ufficiale, utile per quelle lunghe come `Cd'I-UDC-NM (NcI, CI, IaC)-MAIE-CP`. Le sigle oltre 14 caratteri vengono accorciate con "…" nell'emiciclo. |
| `nome` | nome per esteso (preso dalle fonti; puoi correggerlo) |

Lo script di download aggiunge i gruppi nuovi ma **non modifica mai** i valori già scritti.
Se una sigla cambia nel tempo (un gruppo che cambia nome), comparirà come voce nuova:
compila anche quella. La build avvisa se a qualche gruppo manca ordine o colore. Il sito
viene generato comunque: i gruppi senza ordine finiscono a destra, quelli senza colore sono grigi.

## Build e anteprima in locale

```sh
npm run build        # genera public/ da data/
npm run anteprima    # apre un server su http://localhost:8080
```

(Equivalenti: `node scripts/build.mjs` e `node scripts/anteprima.mjs`.)
L'indirizzo pubblico del sito è in **una sola costante**, `URL_BASE` in `scripts/build.mjs`
(ora `https://voti-in-parlamento.web.app`), usata per i link canonici e per la sitemap.

La build crea:

- `public/index.html`: in cima i **voti del giorno** (l'ultima giornata con votazioni, prima le
  più importanti), poi le **legislature**, e in ognuna le votazioni divise per ramo (Camera, poi
  Senato) e per **tipo** in ordine di importanza (voti finali, fiducia, risoluzioni, pregiudiziali,
  articoli, emendamenti, ordini del giorno, altre), con una breve spiegazione e le più recenti;
  una **barra di ricerca** trova votazioni e parlamentari (si può aprire anche con `?q=parole`);
- `public/votazioni/<legislatura>/<ramo>/<tipo>/`: tutte le votazioni di un tipo, dalla più recente
  (i vecchi indirizzi senza legislatura rimandano alla XIX: vedi `redirects` in `firebase.json`);
- `public/giorno/<AAAA-MM-GG>/`: tutte le votazioni di un giorno, con il giorno prima e dopo;
- `public/deputati/<nome-cognome-id>/` e `public/senatori/…`: la **pagina di ogni parlamentare**
  (una sola anche se è stato eletto in più legislature), con gruppo, eventuale incarico di Governo,
  link alla scheda ufficiale negli open data e tutti i suoi voti divisi per legislatura e per tipo. Le foto non ci sono: gli indirizzi delle foto negli open data non
  funzionano (Camera: errore 404; Senato: protezione anti-bot), al loro posto ci sono le iniziali;
- `public/indice.json`: l'indice usato dalla barra di ricerca (lo scarica solo chi cerca);
- `public/votazioni/<slug>/index.html`, una pagina per votazione;
- `public/404.html`, `public/sitemap.xml`, `public/robots.txt`, `public/favicon.svg` (il logo);
- `public/assets/` con CSS e JS. Il nome contiene un'impronta del contenuto, così i browser
  possono tenerli in cache a lungo.

`public/` non è in git: si rigenera sempre con `npm run build` (e Firebase la rigenera da solo
prima di ogni deploy). Se in un commit precedente era stata aggiunta, toglila dal repository
con `git rm -r --cached public` e fai un commit.

## Pubblicare su Firebase Hosting

Il sito è pubblicato su **https://voti-in-parlamento.web.app**, nel progetto Firebase dedicato
`voti-in-parlamento` (`.firebaserc`), sito Hosting `voti-in-parlamento` (`firebase.json`, che
pubblica la cartella `public/`). Prima di ogni deploy Firebase esegue da solo `npm run build`.

```sh
npx firebase-tools login                    # una volta sola
npx firebase-tools deploy --only hosting
```

(Con `npm install -g firebase-tools` si può scrivere `firebase` al posto di `npx firebase-tools`.)

Per un'anteprima temporanea online, senza toccare il sito pubblico:

```sh
firebase hosting:channel:deploy anteprima
```

**Limiti del piano gratuito di Firebase Hosting** (dalla [pagina ufficiale](https://firebase.google.com/docs/hosting/usage-quotas-pricing)):
10 GB di spazio e circa 10 GB al mese di traffico (360 MB al giorno secondo la pagina dei prezzi),
per progetto. Lo spazio conta **anche le versioni vecchie** del sito: conviene tenerne poche
(console di Firebase → Hosting → tabella "Release history" → menu ⋮ → "Release storage
settings", per esempio 3).

## Aggiornamento automatico

Ogni giorno GitHub Actions (`.github/workflows/aggiorna.yml`) scarica le votazioni nuove della
legislatura in corso (ultimi 3 giorni; la domenica gli ultimi 30, per riprovare quelle a cui
mancava qualche dato) e, **solo se ce ne sono di nuove**, le salva nel repository, rigenera il
sito e lo pubblica sul progetto Firebase `voti-in-parlamento`. Si può lanciare anche a mano
dalla scheda "Actions" del repository ("Run workflow").

Serve, una volta sola, un account di servizio di Firebase salvato come segreto del repository
(`FIREBASE_SERVICE_ACCOUNT_VOTI_IN_PARLAMENTO`). Il modo più semplice per crearlo:

```sh
npx firebase-tools init hosting:github --project voti-in-parlamento
```

(alle domande sul workflow di build e sul deploy automatico dopo una pull request rispondi "No":
il workflow c'è già.) Per aggiornare a mano dal proprio computer: `node scripts/aggiorna.mjs`.

## Come è fatto l'emiciclo

1. Si sceglie da solo il numero di file. In ogni fila i posti sono proporzionali alla
   lunghezza dell'arco, quindi la distanza tra i pallini è uniforme, e si prende il numero
   di file che dà i pallini più grandi senza sovrapposizioni.
2. Tutti i posti vengono ordinati per angolo, da sinistra a destra, e assegnati ai
   parlamentari ordinati per gruppo (`ordine`) e, dentro il gruppo, per voto: favorevoli,
   astenuti, contrari, poi chi non ha votato. Così ogni gruppo occupa uno spicchio dalla
   fila interna a quella esterna.
3. Tra gli spicchi c'è un piccolo spazio; le sigle stanno fuori dall'arco. Su telefono si
   vedono solo quelle dei gruppi più grandi, le altre sono nella legenda.

L'emiciclo sta su un riquadro arrotondato largo quanto lo schermo, un po' più scuro dello
sfondo (`--pannello`, #06122A), che aumenta il contrasto dei pallini. Il disegno è il più
grande possibile ma sta sempre nell'altezza della finestra. Dentro il riquadro ci sono, in
alto a sinistra, il selettore Voto/Partito e il pulsante **Schermo intero** (mostrato solo
se il browser lo supporta), e in alto a destra la legenda dei gruppi con un rettangolo del
colore di ciascuno.

- Vista **Voto**: il colore del pallino è il voto.
- Vista **Partito**: tutti i pallini di un gruppo hanno il colore del gruppo, anche chi non
  ha votato. Chi ha votato ha in più un anello sottile e un piccolo bagliore del colore del
  voto (verde favorevole, rosso contrario, bianco astenuto); chi non ha votato no. I bagliori
  sono tre livelli (sì, no, astenuti) con una sola sfocatura ciascuno, per non pesare sul
  browser. La scelta resta nell'indirizzo (`?vista=partito`).
- Di base gli spicchi sono attaccati: l'emiciclo è un semicerchio continuo. Passando con il
  mouse (o toccando) un pallino compare il tooltip e **lo spicchio del suo gruppo si stacca**
  dagli altri: si sposta verso l'esterno, passa in primo piano e i suoi pallini si
  ingrandiscono, mentre quelli degli altri gruppi diventano più piccoli e trasparenti.
- La disposizione si adatta alla finestra: oltre 1100 px la legenda sta a destra (e scorre se
  è più alta dell'emiciclo), sotto i 1100 px va sotto l'emiciclo; il disegno è sempre alto al
  massimo quanto la finestra.
- Clic su un pallino: apre la pagina del parlamentare (con il dito: primo tocco tooltip, secondo
  tocco la pagina). Nel riquadro c'è anche **"Trova un deputato/senatore"**: scrivi un nome e il suo
  pallino si evidenzia.
- **Banco del Governo**: i parlamentari che alla data del voto fanno parte del Governo (dagli open
  data della Camera, `ocd:membroGoverno`) siedono in una fila sotto il centro dell'emiciclo, con il
  Presidente del Consiglio al centro e poi, in sezioni separate, vicepresidenti, ministri, viceministri
  e sottosegretari. Al Senato l'abbinamento con i senatori si fa per data di nascita e cognome, o per
  nome e cognome quando la data manca; se non è sicuro non viene fatto (es. Musumeci: "Sebastiano"
  per la Camera, "Nello" per il Senato).
- Chi ha impostato "riduci movimento" nel sistema non vede animazioni.

Sopra l'emiciclo, a destra del titolo, c'è un grafico a ciambella con favorevoli, contrari e
astenuti e il numero dei presenti al centro (`lib/ciambella.mjs`). Passando con il mouse su
uno spicchio (o toccandolo) lo spicchio si ingrossa e al centro compaiono il suo numero e la
percentuale sul totale degli spicchi. Al Senato i presenti
comprendono anche chi presiede, che non vota: per questo il numero al centro può superare di
uno la somma degli spicchi.

L'elenco "Come ha votato ogni deputato/senatore" è diviso per gruppo, nello stesso ordine
dell'emiciclo, e in ordine alfabetico dentro ogni gruppo.

Colori del **testo**: il rosso per le scritte su fondo scuro (`--rosso-testo`, #F87171) è un
po' più chiaro di quello dei pallini (#EF4444), che come testo piccolo non raggiunge il
contrasto WCAG AA sulle card.

## Licenza

Codice: [MIT](LICENSE). Dati: licenze delle fonti (vedi sopra).
