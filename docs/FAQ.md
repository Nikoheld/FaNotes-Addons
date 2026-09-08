# Häufige Fragen

## Allgemein

**Muss ich TypeScript können?**
Nein. `main.js` ist normales JavaScript (ES2020+, ES-Modul). Die Typdatei `sdk/fanotes-addon.d.ts` gibt dir nur Autovervollständigung, wenn du sie per `/// <reference path=… />` einbindest. Wer TypeScript schreiben will, kompiliert nach `main.js` und committet beides (Quelle unter `src/`).

**Kann ich npm-Pakete verwenden?**
Ja, gebündelt. `main.js` muss eine einzige Datei sein; `import` anderer Dateien funktioniert im Worker nicht. Beispiel mit esbuild:

```bash
npx esbuild src/index.js --bundle --format=esm --platform=browser --outfile=main.js
```

Bedenke das Größenlimit (1,5 MB) und dass Pakete, die `window`, `document`, `fetch` oder Node-APIs brauchen, im Worker nicht laufen.

**Deutsch oder Englisch?**
FaNotes ist zweisprachig. `fanotes.app.language` liefert `de` oder `en`; du kannst deine Texte danach wählen. Die Beispiele sind deutsch, weil die meisten Nutzer deutsch schreiben. Ein englisches README zusätzlich ist willkommen.

**Kostet ein Add-on etwas / gibt es eine Freigabe-Gebühr?**
Nein. Jeder kann per Pull Request beitragen. Maintainer prüfen ehrenamtlich; sei geduldig.

**Kann ich mein Add-on außerhalb dieses Repositories verteilen?**
Ja. Nutzer können in FaNotes eine andere Quelle eintragen (`owner/repo`), oder du gibst `manifest.json` + `main.js` weiter und sie laden es über „Lokal laden“. Auto-Updates gibt es dann nur über eine eigene Quelle mit Index-Workflow.

## Entwicklung

**Wie sehe ich `console.log`?**
Add-on-Store → Installiert → dein Add-on → **Protokoll**. `console.*` und `fanotes.log` landen dort (letzte 200 Einträge). Zusätzlich erscheinen sie in den DevTools von FaNotes (`Ctrl ⇧ I`) unter dem Worker `fanotes-addon:<id>`.

**Mein Add-on steht auf „abgestürzt“ – was jetzt?**
Das Protokoll nennt den Grund: Syntaxfehler beim Laden, Fehler in `onActivate`, Timeout (15 s) oder acht Fehler in einer Minute. Beheben, „Lokal laden“ erneut, fertig. Nach drei automatischen Neustarts wartet FaNotes auf dich – Knopf **Neu starten** im Store.

**„main.js wurde nach der Installation verändert und wird nicht gestartet“**
Aus dem Store installierte Add-ons sind per SHA-256 gegen ihre installierte Datei gesichert. Wenn du an einer installierten Kopie herumeditierst, startet sie nicht mehr. Für die Entwicklung nutze **Lokal laden** – lokale Add-ons haben keine Prüfsumme.

**Statische `import`-Anweisung wird abgelehnt**
Der Worker lädt `main.js` als Blob; relative Importe haben dort kein Ziel. Bündeln (siehe oben). `import()` dynamisch funktioniert ebenso wenig für eigene Dateien.

**`fetch is not defined` / `window is not defined`**
Richtig – es gibt beides nicht. Netzwerk geht über `fanotes.net.fetch` (Berechtigung `network`, Hosts im Manifest). Oberfläche über `fanotes.ui.*`. Zeit über `setTimeout`/`setInterval` (die gibt es im Worker).

**Wie speichere ich Einstellungen meines Add-ons?**
`fanotes.storage` (Berechtigung `storage`): 1 MB JSON, bleibt bei Updates erhalten, wird beim Deinstallieren gelöscht. Eine Einstellungsseite baust du als Panel mit `input`/`select`/`checkbox` und speicherst in `onInput`.

**Kann ich ein Tastenkürzel belegen?**
Nein. `shortcut` in `commands.register` ist nur Anzeige. Nutzer erreichen Befehle über `Ctrl P`. Das ist Absicht: Add-ons sollen keine FaNotes-Kürzel überschreiben können.

**Kann ich eigene Dateien im Vault ablegen (z. B. JSON)?**
Nein, nur `.md`-Notizen (`notes.create`/`notes.write`). Für Daten nutze `fanotes.storage`. Für nutzersichtbare Daten eine Notiz mit klarer Kennzeichnung (z. B. `Aufgaben (Sammler).md`).

**Wie erkenne ich meine eigene Änderung in `note:changed`?**
Gar nicht – das Ereignis unterscheidet nicht. Vergleiche vor dem Schreiben den Inhalt, oder schreibe nur auf Nutzeraktion.

**Wie teste ich mit vielen Notizen, ohne den Worker zu blockieren?**
`for … of` mit `await` pro Notiz. Der Worker beantwortet zwischen den `await`s die Pings. 30 s pro einzelnem Aufruf sind viel; hunderte Notizen lesen dauert normalerweise unter einer Sekunde.

## Fehlercodes

| Meldung / Code | Ursache | Lösung |
| --- | --- | --- |
| `E_PERMISSION` „… braucht die Berechtigung …“ | Berechtigung fehlt im Manifest | Berechtigung in `permissions` eintragen, „Lokal laden“ erneut |
| `E_ARGS` „Ungültiger Pfad“ | Pfad mit `..`, führendem `/`, Backslash oder leer | Pfad aus `notes.list()` verwenden |
| `E_ARGS` „Unbekanntes Ereignis“ | Tippfehler im Ereignisnamen | Liste in [EVENTS.md](EVENTS.md) |
| `E_NETWORK` „… steht nicht in networkHosts“ | Host fehlt im Manifest | Host oder `*.domain` in `networkHosts` |
| `E_NETWORK` „Nur https://“ | http-URL | https verwenden |
| `E_RATE` | > 240 Aufrufe/s oder > 200 offen | Batch bilden, drosseln, `Promise.all` in Gruppen |
| `E_LIMIT` „Höchstens 6 Panels“ | Zu viele Panels mit verschiedenen IDs | Panel-IDs wiederverwenden, `update` statt `panel` |
| `E_NO_PANEL` | `update` auf geschlossenes Panel | Fehler fangen, `panel.show()` |
| `E_TOO_LARGE` | Text > 4 MB, Speicher > 1 MB, Antwort > 5 MB | Kleiner machen |
| `E_TIMEOUT` | Aufruf > 30 s | Arbeit aufteilen |
| „Das Add-on hat sich nicht innerhalb von 15 s gemeldet“ | Aktivierung hängt (`await` auf etwas, das nie kommt) | `onActivate` schlank halten, Langsames danach starten |
| „Der Worker antwortet nicht mehr“ | Synchrone Endlosschleife oder sehr lange Berechnung | In Häppchen mit `await` aufteilen |
| „8 Fehler innerhalb einer Minute“ | Wiederholte Ausnahmen (oft in einem Ereignis-Handler) | Protokoll lesen, Handler absichern |

## Store und Veröffentlichung

**Wie lange dauert es, bis mein Add-on im Store ist?**
Nach dem Merge Minuten: Der Auto-Index-Workflow läuft sofort; FaNotes lädt den Index beim nächsten Öffnen des Stores (Cache 10 Minuten).

**Mein Add-on ist gemergt, aber nicht im Store.**
Prüfe den `Auto-index`-Lauf unter „Actions“: Steht dein Add-on unter „übersprungen“? Dann hat es ein Problem, das die Validierung noch nicht kannte (z. B. später geänderte Regeln). Behebe es per PR. Im Store: „Aktualisieren“ oben rechts leert den Cache.

**Kann ich den Namen oder die ID ändern?**
Name ja (neuer PR mit Versionsbump). ID nein – daran hängen Installationen und Speicher. Für eine neue ID veröffentliche ein neues Add-on und markiere das alte im README als abgelöst.

**Wer darf mergen?**
Maintainer des Repositorys. Ziel ist, jeden PR innerhalb weniger Tage anzusehen. Beschleunige es mit einem klaren README, sparsamen Berechtigungen und lesbarem Code.

**Wie melde ich ein problematisches Add-on?**
Issue mit „security“ im Titel oder vertraulich gemäß [SECURITY.md](../SECURITY.md).
