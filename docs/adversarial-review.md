# Revisione avversariale — 20 settembre 2026

Perimetro: codice corrente del fork, diff rispetto a HEAD, correzioni della prima
review, interazioni tra feature e demo. Gli agenti hanno riesaminato aree diverse
da quelle implementate nella passata precedente; la root ha verificato i punti
comuni e le integrazioni. Tutti i finding sotto sono stati corretti.

I 258 test della prima passata coprivano i casi riprodotti allora, ma non provavano
l'assenza di altri bug. La revisione avversariale ha aggiunto 40 casi: suite finale
**298/298**, incluse prove con Tweakpane reale. Le prove browser usano Chrome.

| ID | Priorità | Controesempio / conseguenza | Correzione e prova |
|---|---|---|---|
| A01 | P1 | Import con primo binding valido e secondo nodo invalido: `false`, ma il primo valore rimaneva cambiato. Anche restore e preset erano vulnerabili. | Rollback comune in `importPaneState`, inclusa la selezione dei tab; `adversarial-persistence` e `adversarial-presets`. |
| A02 | P1 | Backup con preset `state: []` oppure `{}` sostituiva una collezione valida. | Validazione ricorsiva degli snapshot prima della sostituzione; `adversarial-presets`. |
| A03 | P2 | `FileReader.onload` completava import/apply dopo `dispose()`. | Abort, callback invalidate e generazione delle letture; `adversarial-presets`. |
| A04 | P2 | Esportare/importare Default produceva altri preset protetti; un backup poteva poi scartarli. | Gli import diventano custom; i duplicati legacy sono conservati; `adversarial-presets`. |
| A05 | P1 | Versioni future accettate nei file; uno store futuro locale poteva essere sostituito dal nuovo Default. | Rifiuto delle versioni dichiarate non supportate, conservazione dello store e cleanup del tema in caso di errore di costruzione; legacy senza versione supportati; `adversarial-presets`. |
| A06 | P2 | Posizione persistita `null` causava crash; coordinate incomplete producevano `NaN`. | Validazione di storage, default e setter; `adversarial-draggable`. |
| A07 | P2 | Perdita della pointer capture senza pointerup lasciava il drag bloccato. | Cleanup su `lostpointercapture` per drag e tutti i resize; `adversarial-draggable`. |
| A08 | P2 | Pannello in iframe misurato con la finestra esterna: bordo a 780px in viewport da 320px. | Misure e listener sulla owner window; `adversarial-draggable`. |
| A09 | P1 | Un backup rifiutato durante una preview URL riattivava la persistenza e salvava valori non accettati. | Import backup rifiutato finché la preview non è risolta; un backup applicato invalida decodifiche precedenti; `adversarial-url`. |
| A10 | P2 | Link da pannello hidden/disabled rendeva inaccessibile anche la conferma del ricevente. | Proprietà della root mantenute locali; `adversarial-url`. |
| A11 | P2 | Due Copy link concorrenti: la prima chiamata poteva restituire il vecchio URL senza payload. | Le chiamate superate attendono la scrittura successiva; clear/dispose restano cancellabili; `adversarial-url`. |
| A12 | P2 | Clear URL durante decode rimuoveva il parametro ma lasciava apparire la preview. | Generazione di lettura e verifica del parametro dopo await; `adversarial-url`. |
| A13 | P2 | Reset state eseguito da un bottone Tweakpane veniva annullato dal click propagato alla root. | La persistenza confronta lo snapshot e riparte solo su una modifica effettiva; `adversarial-persistence`. |
| A14 | P2 | Folder aggiunta e chiusa nello stesso turno: listener installato troppo tardi e fold non salvato. | Il MutationObserver rileva anche il nuovo snapshot, con deduplica; `adversarial-persistence`. |
| A15 | P2 | Altezza `none`, NaN o testo invalido annullava il cap CSS. | Validazione compatibile con il `min()` usato dal cap, fallback per storage invalido e rifiuto runtime/backup; `adversarial-persistence`. |
| A16 | P2 | Popup di pannello embedded fermo nel viewport durante scroll esterno. | Listener scroll in capture sulla owner window; 3 regressioni e prova Chrome: top 188→148→123px segue il controllo. |
| A17 | P2 | Antenato light applicava un'ombra light al popup di un pannello esplicitamente dark. | Selettore vincolato al tema del pannello; `adversarial-popups`. |
| A18 | P2 | FPS o altri monitor facevano risultare un preset modificato senza edit dell'utente. | Confronto `isModified()` con readonly normalizzati; `adversarial-persistence` e riscontro nella demo. |

## Cosa è stato verificato sui fix precedenti

Le regressioni della prima passata restano nella suite: scoping del manager dopo
aggiunte dinamiche, collisioni di binding, tab annidati, Default aggiornato e
protetto, quote storage, resize senza movimento, ridimensionamento al viewport,
lifecycle, identità URL, annullamento delle scritture, stream corrotti, temi e
popup. Il nuovo audit ha attaccato soprattutto le transizioni tra questi casi,
gli input non validi e le operazioni ancora in corso durante cleanup o rollback.

## Demo e verifica di integrazione

La demo ricostruita rende esercitabili sette feature principali, backup completo,
callback e isolamento tra pannelli. Verificati in browser: valori dopo reload,
salvataggio/ripristino preset, temi via API, popup colore/Point2D, roundtrip del
backup da file, controlli dinamici dopo reload, receiver separato con Import,
Overwrite e Discard. Layout controllato a 1440×1000 e 390×844, senza overflow
orizzontale nel formato mobile.

Questa è una revisione funzionale avversariale; non equivale a una prova formale
né a una matrice completa di tutti i browser/plugin Tweakpane possibili.
