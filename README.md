# Voti in Parlamento

Sito statico che mostra **come ha votato ogni parlamentare** nelle votazioni nominali di
Camera e Senato, con il **gruppo parlamentare di ciascuno alla data del voto**.
I dati vengono dagli open data ufficiali dei due rami del Parlamento.

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
  emiciclo.mjs            geometria dell'emiciclo e disegno dell'SVG
  pagine.mjs              modelli HTML delle pagine
  html.mjs                piccole funzioni per l'HTML (escape, date, maiuscole)
assets/                   file copiati nel sito così come sono
  stile.css               tutto lo stile (colori in :root)
  emiciclo.js             interattività: vista Voto/Partito, tooltip, filtro per gruppo
scripts/
  scarica-votazione.mjs   scarica una votazione → data/votazioni/<slug>.json
  build.mjs               genera il sito in public/
  anteprima.mjs           server locale per vedere il sito
  test-fase1.mjs          test sulle due votazioni di riferimento
public/                   sito generato (non modificarlo a mano: lo rifà la build)
firebase.json, .firebaserc  configurazione di Firebase Hosting
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

Titolo e descrizione **non vengono ricordati**: se riscarichi una votazione, ripassa le opzioni.
Le due votazioni di esempio sono state scaricate così:

```sh
node scripts/scarica-votazione.mjs camera 747 53 --titolo "Contrasto all'antisemitismo – voto finale"
node scripts/scarica-votazione.mjs senato 395 2 --titolo "Contrasto all'antisemitismo – voto finale" \
  --descrizione "Disposizioni per il contrasto all'antisemitismo e per l'adozione della definizione operativa di antisemitismo (S.1004, esaminato insieme a S.1575, S.1627, S.1722, S.1757, S.1762 e S.1765)"
```

Cosa fa lo script:

- fa poche richieste e lente (almeno 2 secondi tra l'una e l'altra), con uno User-Agent
  che identifica il progetto, e salva le risposte in `data/raw/`;
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
(ora `https://whosnext.web.app`), usata per i link canonici e per la sitemap.

La build crea:

- `public/index.html` con l'elenco delle votazioni (dalla più recente);
- `public/votazioni/<slug>/index.html`, una pagina per votazione;
- `public/404.html`, `public/sitemap.xml`, `public/robots.txt`;
- `public/assets/` con CSS e JS. Il nome contiene un'impronta del contenuto, così i browser
  possono tenerli in cache a lungo.

`public/` è versionata in git per comodità: è sempre generata, quindi non modificarla a mano.

## Pubblicare su Firebase Hosting

Il progetto è già configurato (`firebase.json` pubblica la cartella `public/` sul sito
`whosnext`; `.firebaserc` usa il progetto Firebase `whosnext`: **se l'ID del tuo progetto
Firebase è diverso, cambialo lì**). Prima di ogni deploy Firebase esegue da solo `npm run build`.

```sh
npm install -g firebase-tools   # una volta sola
firebase login                  # una volta sola
firebase deploy --only hosting
```

Per un'anteprima temporanea online, senza toccare il sito pubblico:

```sh
firebase hosting:channel:deploy anteprima
```

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

Vista **Voto**: il colore del pallino è il voto. Vista **Partito**: il colore è quello del
gruppo e un alone luminoso indica il voto. Gli aloni sono tre livelli (sì, no, astenuti) con
una sola sfocatura ciascuno, per non pesare sul browser. La scelta resta nell'indirizzo
(`?vista=partito`). Chi ha impostato "riduci movimento" nel sistema non vede animazioni.

I colori del rosso usati per il **testo** (`--rosso-testo`, #F87171) sono un po' più chiari
di quello dei pallini (#EF4444): il rosso originale come testo piccolo non raggiunge il
contrasto WCAG AA sulle card.

## Licenza

Codice: [MIT](LICENSE). Dati: licenze delle fonti (vedi sopra).
