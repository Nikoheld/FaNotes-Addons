# API-Referenz: das `fanotes`-Objekt

Jedes Add-on läuft in einem eigenen Web Worker. Dort gibt es kein `window`, `document`, `fetch`, `localStorage` oder `import` – alles, was ein Add-on mit FaNotes tut, läuft über das globale Objekt **`fanotes`**. Es wird vor deinem Code bereitgestellt; du musst nichts importieren.

Typen für die Autovervollständigung: [`sdk/fanotes-addon.d.ts`](../sdk/fanotes-addon.d.ts) – am Anfang von `main.js` einfügen:

```js
/// <reference path="../../sdk/fanotes-addon.d.ts" />
```

Inhalt:

- [Grundregeln](#grundregeln)
- [Lebenszyklus: `onActivate`, `onDeactivate`, `activate`-Export](#lebenszyklus)
- [`fanotes.app`, `hasPermission`, `log`](#app)
- [`fanotes.notes`](#notes) – Notizen lesen, schreiben, anlegen, suchen, öffnen
- [`fanotes.vault`](#vault) – Ordner, Umbenennen, Verschieben, Papierkorb
- [`fanotes.editor`](#editor) – der geöffnete Markdown-Editor
- [`fanotes.ink`](#ink) – Handschrift lesen
- [`fanotes.stats`](#stats) – Seitenstatistiken
- [`fanotes.settings`](#settings) – Darstellungs-Einstellungen
- [`fanotes.clipboard`](#clipboard)
- [`fanotes.net`](#net) – https-Anfragen
- [`fanotes.ui`](#ui) – Toasts, Dialoge, Panels, Statusleiste, Links
- [`fanotes.commands`](#commands) – Befehlspalette
- [`fanotes.events`](#events) – auf FaNotes reagieren
- [`fanotes.storage`](#storage) – eigener Speicher
- [Fehler und Fehlercodes](#fehler)
- [Limits](#limits)

---

## Grundregeln

1. **Alles ist asynchron.** Jede Methode außer `app`, `hasPermission`, `log`, `commands.register`, `events.on`, `events.once`, `ui.panel` und den Panel-Handler-Registrierungen gibt ein `Promise` zurück. Nutze `await`.
2. **Berechtigungen kommen aus dem Manifest.** Ruft dein Add-on eine Methode ohne die passende Berechtigung auf, wird das Promise mit `FaNotesError` (`code: 'E_PERMISSION'`) abgelehnt. Die Zuordnung steht bei jeder Methode und in [PERMISSIONS.md](PERMISSIONS.md).
3. **Nur einfache Daten.** Argumente und Rückgabewerte werden zwischen Worker und FaNotes kopiert (Structured Clone). Funktionen, DOM-Knoten oder Klasseninstanzen kommen nicht an – Strings, Zahlen, Booleans, Arrays und einfache Objekte schon.
4. **Fehler sind erlaubt.** Wirft dein Befehl oder Handler, zeigt FaNotes dem Nutzer einen Toast mit deiner Meldung und schreibt sie ins Protokoll. FaNotes selbst läuft weiter. Erst acht Fehler innerhalb einer Minute stoppen das Add-on (siehe [SECURITY_MODEL.md](SECURITY_MODEL.md)).
5. **Ein Aufruf darf höchstens 30 Sekunden dauern**, sonst wird er mit `E_TIMEOUT` abgelehnt. Große Arbeiten in Häppchen aufteilen und dazwischen `await` einbauen – dann bleibt der Worker ansprechbar.

---

## Lebenszyklus

`main.js` wird beim Start des Add-ons einmal als ES-Modul ausgewertet. Danach ruft FaNotes deine Aktivierungshaken auf. Beides ist erlaubt und kombinierbar:

```js
// Variante A: Haken registrieren
fanotes.onActivate(async (api) => {
  // api === fanotes
})

// Variante B: Funktion exportieren (auch `export default function` funktioniert)
export async function activate(api) {}
export async function deactivate(api) {}
```

Top-Level-Code läuft ebenfalls – `fanotes.commands.register(...)` direkt in der Datei ist üblich und völlig in Ordnung. Die Aktivierung gilt als abgeschlossen, wenn alle Haken durch sind; dauert das länger als **15 Sekunden**, wird das Add-on als abgestürzt gemeldet.

`onDeactivate` / `deactivate` laufen beim Deaktivieren, Deinstallieren, Aktualisieren und beim Schließen von FaNotes. Danach wird der Worker beendet; Timer und offene Promises werden nicht mehr abgearbeitet. Du musst nichts aufräumen – Befehle, Panels, Statusleisten-Einträge und Ereignis-Abonnements werden von FaNotes entfernt. Speichere aber alles, was du behalten willst, vorher mit `fanotes.storage`.

---

## App

### `fanotes.app` (Eigenschaft, synchron)

```ts
{
  appVersion: string     // z. B. "2026.9.21"
  platform: string       // "linux" | "win32" | "darwin" | "web"
  language: string       // "de" | "en"
  apiVersion: number     // 1
  web: boolean           // true in der Browser-Version
  addon: { id, name, version, permissions }
}
```

### `fanotes.hasPermission(permission)` → `boolean`

Prüft, ob dein Manifest die Berechtigung enthält. Nützlich für optionale Funktionen:

```js
if (fanotes.hasPermission('clipboard')) blocks.push({ type: 'button', id: 'copy', label: 'Kopieren' })
```

### `fanotes.log(...args)`

Schreibt ins Add-on-Protokoll (Add-on-Store → Installiert → Add-on → Protokoll). `console.log/info/warn/error` landen ebenfalls dort. Das Protokoll behält die letzten 200 Einträge.

---

## Notes

Pfade sind immer **relativ zum Vault** mit `/` als Trenner, z. B. `Schule/Mathe/Ableitungen.md`. `..` und führende `/` werden abgelehnt.

| Methode | Berechtigung | Beschreibung |
| --- | --- | --- |
| `notes.list()` → `NoteSummary[]` | `notes:read` | Alle Notizen (`.md`, `.markdown`, `.pdf`) flach: `{ path, title, folder, modifiedAt, size }`. |
| `notes.tree()` → `TreeEntry[]` | `notes:read` | Der Ordnerbaum wie in der Seitenleiste: `{ name, path, kind: 'file'\|'folder', extension?, modifiedAt, size, children? }`. |
| `notes.read(path)` → `string` | `notes:read` | Markdown-Text **ohne** den `.famd`-Anhang. Ist die Notiz gerade geöffnet, bekommst du den ungespeicherten Stand. |
| `notes.exists(path)` → `boolean` | `notes:read` | Ob eine Notiz mit diesem Pfad im Baum steht. |
| `notes.search(query)` → `SearchHit[]` | `notes:read` | Volltextsuche wie `Ctrl ⇧ F`: `{ path, title, excerpt, matches, kind: 'note'\|'drawing' }`, höchstens 200 Treffer. |
| `notes.active()` → `ActiveNote \| null` | `notes:read` | Die Notiz vor dem Nutzer: `{ path, title, kind: 'markdown'\|'ink'\|'pdf'\|'none' }`. `ink` = Stiftmodus. |
| `notes.write(path, content)` → `true` | `notes:write` | Ersetzt den Text einer `.md`-Notiz. Offene Notizen aktualisieren sich live und speichern automatisch; geschlossene werden direkt geschrieben. Der `.famd`-Anhang (Tinte, Statistik) bleibt erhalten. Max. 4 MB. |
| `notes.append(path, content)` → `true` | `notes:write` | Hängt Text an; fügt bei Bedarf einen Zeilenumbruch davor ein. |
| `notes.create({ folder?, name?, content? })` → `string` | `notes:write` | Legt eine Notiz an (Name ohne `.md`, Standardordner aus den Einstellungen) und gibt ihren Pfad zurück. Ohne `name` heißt sie „Neue Notiz“ mit fortlaufender Nummer. |
| `notes.open(path)` → `true` | `ui` | Öffnet die Notiz im Editor (wie ein Klick in der Seitenleiste). |

```js
const notes = await fanotes.notes.list()
const recent = notes
  .filter((n) => n.path.endsWith('.md'))
  .sort((a, b) => (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? ''))
  .slice(0, 10)
for (const note of recent) {
  const text = await fanotes.notes.read(note.path)   // ein await pro Notiz hält den Worker ansprechbar
  // …
}
```

**Hinweis zu `notes.write`:** Der Nutzer könnte gleichzeitig tippen. Lies unmittelbar vor dem Schreiben noch einmal und ändere möglichst nur das, was du ändern musst. Für Einfügungen an der Schreibposition ist `editor.insert` die schonendere Wahl.

---

## Vault

Alle Methoden brauchen `vault:write`. Pfade wie oben. Rückgaben sind die neuen Pfade.

| Methode | Beschreibung |
| --- | --- |
| `vault.createFolder(parent?, name?)` → `string` | Ordner anlegen (`parent` leer = Vault-Wurzel). |
| `vault.rename(path, newName)` → `string` | Datei oder Ordner umbenennen (`newName` ohne Pfad; bei Notizen ohne `.md`). |
| `vault.move(path, folder?)` → `string` | In einen anderen Ordner verschieben (`folder` leer = Wurzel). |
| `vault.trash(path)` → `true` | In den FaNotes-Papierkorb verschieben. Der Nutzer kann das wiederherstellen; endgültig löschen kann ein Add-on nicht. |

---

## Editor

Zugriff auf den **gerade geöffneten** Markdown-Editor. Alle Methoden brauchen `editor`. Ist kein Editor sichtbar (Stiftmodus, PDF, keine Notiz), geben Lesefunktionen `null` und Schreibfunktionen `false` zurück – sie werfen nicht.

| Methode | Beschreibung |
| --- | --- |
| `editor.getText()` → `string \| null` | Kompletter Text der offenen Notiz (ohne `.famd`). |
| `editor.getSelection()` → `{ from, to, text, line } \| null` | Auswahl mit Zeichenpositionen; `line` ist die 1-basierte Zeile des Anfangs. Ohne Auswahl ist `text` leer und `from === to` (Cursor). |
| `editor.insert(text, where?)` → `boolean` | Fügt Text ein. `where`: `'cursor'` (Standard, ersetzt eine bestehende Auswahl), `'start'`, `'end'`, `'line-end'` (Ende der Cursorzeile). |
| `editor.replaceSelection(text)` → `boolean` | Ersetzt die Auswahl (oder fügt am Cursor ein). |
| `editor.setText(text)` → `boolean` | Ersetzt den gesamten Text. Der Cursor bleibt, soweit möglich, an seiner Position. |
| `editor.format(action)` → `boolean` | Löst eine Formatierung wie aus der Werkzeugleiste aus: `heading1..3`, `bold`, `italic`, `strikethrough`, `code`, `codeBlock`, `quote`, `bulletList`, `numberedList`, `taskList`, `link`, `table`, `horizontalRule`, `math`. |

Jede Änderung geht als normale Editor-Transaktion durch: sie ist mit `Ctrl Z` rückgängig, wird gespeichert wie Tippen und zählt in der Seitenstatistik nicht als Tastendruck des Nutzers.

```js
fanotes.commands.register({
  id: 'timestamp',
  title: 'Zeitstempel einfügen',
  run: async () => {
    const ok = await fanotes.editor.insert(new Date().toLocaleString('de-DE') + ' ')
    if (!ok) await fanotes.ui.toast('Kein Editor geöffnet.', 'error')
  },
})
```

---

## Ink

### `fanotes.ink.read(path)` → `InkDocument | null` — Berechtigung `ink:read`

Liest die Handschrift einer Notiz aus dem `.famd`-Anhang. Rückgabe ist das rohe Tintendokument von FaNotes oder `null`, wenn die Notiz keine Tinte hat. Die Struktur (vereinfacht):

```ts
{
  sourceWidth: number; sourceHeight: number       // Seitenmaß in CSS-Pixeln beim Zeichnen
  sourceOriginX?: number; sourceOriginY?: number  // Versatz, wenn die Seite oben/links gewachsen ist
  strokes: Array<{
    points: Array<{ x: number; y: number; pressure?: number }>  // x/y normalisiert 0–1 auf die Seite
    color: string                                  // CSS-Farbe
    baseWidth: number                              // Strichbreite in CSS-Pixeln
    pressureEnabled?: boolean
    purpose?: 'handwriting' | 'art'
    brush?: string; colorEffect?: string; opacity?: number
  }>
}
```

Das Format kann mit FaNotes-Versionen wachsen; behandle unbekannte Felder tolerant und fehlende als Standard. Schreiben von Tinte ist absichtlich nicht möglich.

---

## Stats

### `fanotes.stats.read(path)` → `PageStats` — Berechtigung `stats:read`

Die stillen Seitenstatistiken, die FaNotes in der `.famd`-Datei führt. Für die offene Notiz bekommst du den Live-Stand. Auszug der Felder:

```ts
{
  version: number
  createdAt, modifiedAt, firstOpenedAt, lastOpenedAt: string
  lastClosedAt, lastSavedAt: string | null
  openCount: number; saveCount: number
  dwellMs: number                 // Zeit als sichtbare, aktive Notiz
  focusMs: number                 // Anteil davon mit Fensterfokus
  longestSessionMs, lastSessionMs: number
  activeDays: string[]            // "YYYY-MM-DD", neueste zuletzt
  opensByHour: number[24]; dwellByHour: number[24]; dwellByWeekday: number[7]   // 0 = Sonntag
  typing: { ms, bursts, longestBurstMs, keystrokes, charsTyped, charsDeleted, wordsTyped, linesTyped,
            pastes, charsPasted, autocorrects, suggestionsApplied, undos, redos, lastTypedAt }
  ink:    { penDownMs, ms, bursts, longestBurstMs, strokes, points, lengthMm, longestStrokeMm,
            handwritingStrokes, artStrokes, strokesErased, colors: string[], brushes: Record<string, number>,
            lastStrokeAt, current: { strokes, points, lengthMm, penDownMs, savedAt } }
  document: { words, characters, charactersWithoutSpaces, lines, paragraphs, headings, links, images,
              tasks, tasksDone, codeBlocks, mathBlocks, tables, blockquotes, listItems, readingMinutes,
              peakWords, wordsAdded, wordsRemoved }
}
```

Die maßgebliche Feldliste steht in FaNotes unter `src/lib/pageStats.ts`. Fehlende Felder als `0`/leer behandeln – ältere `.famd`-Dateien haben weniger Felder.

---

## Settings

### `fanotes.settings.read()` → `Record<string, unknown>` — Berechtigung `settings:read`

Nur Darstellungs-Einstellungen: `uiLanguage`, `theme`, `accent`, `uiFont`, `editorFont`, `editorFontSize`, `lineHeight`, `readableLineLength`, `showLineNumbers`, `spellcheck`, `autocorrect`, `vimMode`, `autosaveDelay`, `compactMode`, `reduceMotion`, `paperStyle`, `viewZoomMax`, `inkSmoothing` u. a. **Niemals** API-Schlüssel, Passwörter, Fernwartungs-Daten oder Vault-Pfade. Änderungen kommen als Ereignis `settings:changed`.

Add-ons können Einstellungen nicht ändern.

---

## Clipboard

### `fanotes.clipboard.writeText(text)` → `true` — Berechtigung `clipboard`

Schreibt Text (bis 2 MB) in die System-Zwischenablage. Lesen ist nicht möglich.

---

## Net

### `fanotes.net.fetch(url, init?)` → `FetchResponse` — Berechtigung `network`

```js
const response = await fanotes.net.fetch('https://api.example.com/v1/items', {
  method: 'POST',                                  // GET (Standard), POST, PUT, PATCH, DELETE, HEAD
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hello: 'world' }),        // nur Text
})
if (!response.ok) throw new Error(`HTTP ${response.status}`)
const data = await response.json()                 // oder response.text()
```

Regeln:

- Nur `https://`. Der Host muss zu einem Eintrag in `networkHosts` des Manifests passen (`api.example.com` oder `*.example.com`).
- Private und lokale Adressen (`localhost`, `10.*`, `192.168.*`, `127.*`, `*.local` …) werden immer blockiert.
- Die Header `Cookie`, `Authorization`, `Host`, `Origin`, `Referer` werden nicht weitergegeben; FaNotes sendet nie Nutzer-Cookies mit. Brauchst du ein Token, gib es als eigenen Header mit und lass den Nutzer es über `ui.prompt` eingeben – speichere es mit `storage`.
- Antwort max. 5 MB, Zeitlimit 20 s, max. 3 Weiterleitungen (nur auf https).
- **In der Browser-Version steht `net` nicht zur Verfügung** (`fanotes.app.web === true`). Prüfe das und zeige eine freundliche Meldung.

`FetchResponse`: `{ ok, status, statusText, headers, url, text(), json() }`.

---

## UI

Alle Methoden brauchen `ui`. Jede sichtbare Ausgabe wird mit dem Namen deines Add-ons gekennzeichnet, damit Nutzer wissen, woher sie kommt.

### `ui.toast(message, kind?)` → `true`

Kurze Meldung unten im Fenster. `kind`: `'info'` (Standard), `'success'`, `'error'`. Max. 400 Zeichen.

### `ui.confirm(message, { title?, confirmLabel? })` → `boolean`

Ja/Nein-Dialog. `true`, wenn der Nutzer bestätigt hat.

### `ui.prompt(message, { title?, placeholder?, value?, multiline? })` → `string | null`

Texteingabe. `null` bei Abbruch. Mit `multiline: true` ein mehrzeiliges Feld.

### `ui.openExternal(url)` → `boolean`

Öffnet einen `https://`-Link im Browser des Nutzers – **nachdem** der Nutzer in einem Dialog zugestimmt hat. Rückgabe `false`, wenn er abgelehnt hat.

### `ui.panel(spec)` → `Panel`

Öffnet ein Panel im Add-on-Dock rechts. Panels bestehen aus JSON-Blöcken, die FaNotes rendert – kein HTML, kein CSS, kein DOM. Alle Blocktypen: [UI_BLOCKS.md](UI_BLOCKS.md).

```js
const panel = fanotes.ui.panel({
  id: 'main',                 // stabil pro Add-on; max. 6 Panels
  title: 'Mein Panel',
  icon: '📝',                 // ein Emoji/Glyph für den Reiter
  blocks: [
    { type: 'heading', text: 'Hallo' },
    { type: 'input', id: 'name', label: 'Name', placeholder: 'Wie heißt du?' },
    { type: 'row', children: [
      { type: 'button', id: 'greet', label: 'Grüßen', primary: true },
      { type: 'button', id: 'reset', label: 'Zurücksetzen' },
    ] },
  ],
  focus: true,                // Panel in den Vordergrund holen (Standard)
})

panel.onAction(async ({ id, itemId, values }) => {
  if (id === 'greet') await fanotes.ui.toast(`Hallo ${values.name || 'du'}!`)
  if (id === 'reset') await panel.update([...])
})

panel.onInput(({ id, value, values }) => {
  // feuert bei jedem bestätigten Eingabefeld (Enter/Blur), Select-Wechsel, Checkbox-Klick
})
```

`Panel`-Methoden: `update(blocks)`, `setTitle(title)`, `show()` (erneut öffnen, falls der Nutzer es geschlossen hat), `close()`, `onAction(fn)`, `onInput(fn)`, `values()` (zuletzt bekannte Eingabewerte). Ruft `ui.panel` mit einer bereits offenen `id` auf, wird das Panel ersetzt statt verdoppelt.

Schließt der Nutzer ein Panel, bekommst du kein Ereignis; `panel.update` wirft dann `E_NO_PANEL` – fange das ab oder rufe `panel.show()`.

### `ui.status.set({ id?, text, title?, onClick? })` → `true`

Eintrag in der Statusleiste unten. `text` max. 60 Zeichen; **leerer Text entfernt den Eintrag**. `title` ist der Tooltip. `onClick` macht den Eintrag klickbar. Max. 3 Einträge pro Add-on.

### `ui.status.remove(id)` → `true`

---

## Commands

### `commands.register({ id, title, detail?, keywords?, shortcut?, run })` → `Disposable` — Berechtigung `commands`

Fügt einen Eintrag in die Befehlspalette (`Ctrl P`) ein, gruppiert unter „Add-on: *Name*“. Max. 40 Befehle pro Add-on.

- `id`: eindeutig innerhalb deines Add-ons; Buchstaben, Ziffern, `.`, `:`, `-`, `_`.
- `title`, `detail`: Anzeige in der Palette. `keywords`: zusätzliche Suchwörter.
- `shortcut`: reine Anzeige (z. B. `Ctrl ⇧ P`). FaNotes bindet keine Tasten für Add-ons.
- `run(...args)`: darf `async` sein. Fehler landen als Toast + Protokoll.

Rückgabe: `{ dispose() }` zum Entfernen. Die Registrierung selbst ist synchron; ob FaNotes sie angenommen hat, siehst du im Protokoll (z. B. bei Überschreitung des Limits).

### `commands.execute(id, ...args)` → `boolean`

Führt einen eigenen Befehl aus **oder** einen FaNotes-Befehl. Nützliche FaNotes-IDs: `new-note`, `new-folder`, `daily` (Tagesnotiz), `save`, `search`, `quick-open`, `drawing` (Stiftmodus umschalten), `split`, `split-orientation`, `split-swap`, `sidebar`, `inspector`, `overview`, `history`, `nav-back`, `nav-forward`, `export-pdf`, `settings`, `addon-store`. Die vollständige Liste liefert `commands.list()`; sie kann sich mit FaNotes-Versionen ändern, also prüfe die Rückgabe (`false`/`E_NO_COMMAND`) statt dich blind darauf zu verlassen. Argumente kommen nur bei eigenen Befehlen an.

### `commands.list()` → `Array<{ id, label, group }>`

Alle Befehle der Palette, inklusive der von anderen Add-ons.

---

## Events

### `events.on(name, handler)` → `Disposable`, `events.once(name, handler)` → `Disposable`

Abonnieren ist ohne Berechtigung möglich; einzelne Ereignisse tragen jedoch Inhalt, der eine Berechtigung verlangt (Tabelle). Handler dürfen `async` sein; Fehler landen im Protokoll. Ein Handler hat 10 Sekunden.

| Ereignis | Payload | Berechtigung |
| --- | --- | --- |
| `note:opened` | `{ path, title, kind: 'markdown' \| 'pdf' }` | – |
| `note:changed` | `{ path, length }` – getippter Text hat sich geändert (gesammelt, ~400 ms) | `notes:read` |
| `note:saved` | `{ path, title, length }` | `notes:read` |
| `note:created` | `{ path }` | – |
| `note:deleted` | `{ path }` – in den Papierkorb verschoben | – |
| `ink:stroke` | `{ path, durationMs, lengthMm, points, purpose, color?, brush? }` – ein Stiftstrich ist fertig | `ink:read` |
| `mode:changed` | `{ mode: 'keyboard' \| 'ink', path }` | – |
| `vault:changed` | `{ notes }` – Dateien oder Ordner haben sich geändert | – |
| `settings:changed` | die Darstellungs-Einstellungen wie `settings.read()` | `settings:read` |

Details und Muster: [EVENTS.md](EVENTS.md).

---

## Storage

Privater JSON-Speicher pro Add-on, außerhalb des Vaults (Electron: im Nutzerdaten-Ordner, Browser: `localStorage`). Alle Methoden brauchen `storage`. Limit **1 MB** und **500 Schlüssel** pro Add-on.

| Methode | Beschreibung |
| --- | --- |
| `storage.get(key)` → `unknown \| null` | Wert lesen. |
| `storage.set(key, value)` → `true` | JSON-fähigen Wert speichern (Structured Clone; `undefined` wird zu `null`). |
| `storage.remove(key)` → `true` | |
| `storage.keys()` → `string[]` | |
| `storage.clear()` → `true` | |

Der Speicher bleibt bei Updates erhalten und wird beim Deinstallieren gelöscht. Andere Add-ons haben keinen Zugriff.

```js
const settings = (await fanotes.storage.get('settings')) ?? { minutes: 25 }
settings.minutes = 30
await fanotes.storage.set('settings', settings)
```

---

## Fehler

Abgelehnte Aufrufe werfen `fanotes.FaNotesError` mit `code` und `message`:

```js
try {
  await fanotes.notes.write('Lesen/Schreibgeschützt.pdf', '…')
} catch (error) {
  if (error instanceof fanotes.FaNotesError && error.code === 'E_PERMISSION') { /* … */ }
}
```

| Code | Bedeutung |
| --- | --- |
| `E_PERMISSION` | Berechtigung fehlt im Manifest (oder das Ereignis verlangt eine). |
| `E_ARGS` | Ungültiges Argument (Pfad mit `..`, leerer String, falscher Typ, unbekanntes Ereignis). |
| `E_UNKNOWN_METHOD` | Methode gibt es nicht (alte SDK-Typen? Tippfehler?). |
| `E_TIMEOUT` | FaNotes hat innerhalb von 30 s nicht geantwortet (z. B. Dialog nie geschlossen – Dialoge sind davon ausgenommen und warten). |
| `E_RATE` | Mehr als 240 Aufrufe pro Sekunde oder mehr als 200 gleichzeitig offene Aufrufe. |
| `E_LIMIT` | Kontingent erschöpft: Befehle, Panels, Statusleisten-Einträge, Speicher-Schlüssel. |
| `E_TOO_LARGE` | Text/Notiz/Antwort/Speicher überschreitet das Größenlimit. |
| `E_NETWORK` | Kein https, Host nicht in `networkHosts`, private Adresse, Netzfehler. |
| `E_NO_PANEL` | `panel.update` auf ein geschlossenes Panel. |
| `E_NO_COMMAND` | `commands.execute` mit unbekannter ID. |
| `E_HOST` | FaNotes-interner Fehler; Meldung enthält Details. |

Meldungen sind deutsch, weil sie dem Nutzer im Toast gezeigt werden können.

---

## Limits

| Was | Limit |
| --- | --- |
| Dauer eines API-Aufrufs | 30 s |
| Aktivierung (`main.js` + `onActivate`) | 15 s |
| Reaktion auf `ping` (Endlosschleifen-Schutz) | 8 s, alle 5 s geprüft |
| Aufrufe pro Sekunde | 240 (5 s in Folge darüber → Add-on gestoppt) |
| Gleichzeitig offene Aufrufe | 200 |
| Fehler pro Minute | 8 → Add-on gestoppt und deaktiviert |
| Automatische Neustarts nach Absturz | 3 |
| Befehle / Panels / Statusleisten-Einträge | 40 / 6 / 3 |
| Blöcke pro Panel, Verschachtelung | 400, Tiefe 4 |
| Notiztext | 4 MB |
| Speicher | 1 MB, 500 Schlüssel |
| Netz-Antwort | 5 MB, 20 s |
| `main.js` / `README.md` / `icon.svg` | 1,5 MB / 200 kB / 64 kB |
| Protokoll | 200 Einträge |
