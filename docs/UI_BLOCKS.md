# UI-Blöcke: Panels ohne HTML

Add-ons bauen ihre Oberfläche aus **Blöcken** – kleinen JSON-Objekten, die FaNotes mit seinen eigenen Komponenten rendert. Das hält Panels im Look von FaNotes (Theme, Schrift, Barrierefreiheit) und macht es unmöglich, Skripte oder Styles einzuschleusen. Blöcke werden von FaNotes vor dem Rendern normalisiert: unbekannte Typen fallen weg, Texte werden gekürzt, IDs geprüft. Nichts davon wirft einen Fehler.

Panels erscheinen im **Add-on-Dock** rechts neben dem Editor. Mehrere Panels (auch verschiedener Add-ons) liegen als Reiter nebeneinander; der Nutzer kann das Dock über den Puzzle-Knopf in der Statusleiste ein- und ausblenden.

## Ein Panel öffnen

```js
const panel = fanotes.ui.panel({
  id: 'main',
  title: 'Aufgaben',
  icon: '☑',
  blocks: [ /* … */ ],
})
```

`panel.update(blocks)` ersetzt den Inhalt; Eingabewerte, die der Nutzer schon getippt hat, bleiben erhalten, solange die `id` des Eingabefelds gleich bleibt. Interaktionen kommen über `panel.onAction` und `panel.onInput` zurück (siehe unten).

## Blocktypen

### heading

```json
{ "type": "heading", "text": "Übersicht", "level": 2 }
```

`level` 1–3 (Standard 2). Max. 200 Zeichen.

### text

```json
{ "type": "text", "text": "Ein Absatz Fließtext.", "muted": true }
```

Reiner Text mit Zeilenumbrüchen. `muted` für Nebentext.

### markdown

```json
{ "type": "markdown", "text": "**Fett**, *kursiv*, `Code`, [Link](https://…), Listen, Tabellen." }
```

Wird mit dem FaNotes-Markdown-Renderer dargestellt – ohne rohes HTML. Links öffnen erst nach Rückfrage beim Nutzer. Max. 20 000 Zeichen.

### callout

```json
{ "type": "callout", "tone": "warning", "text": "Diese Aktion ändert 12 Notizen." }
```

`tone`: `info` (Standard), `success`, `warning`, `error`.

### button

```json
{ "type": "button", "id": "run", "label": "Ausführen", "primary": true }
{ "type": "button", "id": "delete", "label": "Löschen", "danger": true, "disabled": false }
```

Klick → `onAction({ id: 'run', values })`. Genau ein `primary`-Button pro Panel ist gute Praxis.

### input

```json
{ "type": "input", "id": "query", "label": "Suchbegriff", "value": "", "placeholder": "z. B. Ableitung" }
{ "type": "input", "id": "notes", "label": "Notizen", "multiline": true, "rows": 6 }
```

Einzeilig oder mehrzeilig (`rows` 2–20). Wert-Übernahme bei **Enter** oder **Verlassen des Felds** → `onInput({ id, value, values })`. Enter in einem einzeiligen Feld feuert zusätzlich `onAction({ id: 'submit:query' })` – praktisch für Suchfelder ohne extra Button.

### select

```json
{ "type": "select", "id": "sort", "label": "Sortierung", "value": "modified",
  "options": [ { "value": "modified", "label": "Zuletzt geändert" }, { "value": "title", "label": "Titel" }, "path" ] }
```

Optionen als Strings oder `{ value, label }` (max. 200). Änderung → `onInput`.

### checkbox

```json
{ "type": "checkbox", "id": "onlyOpen", "label": "Nur offene Aufgaben", "checked": true }
```

Klick → `onInput({ id, value: true|false })`.

### list

```json
{ "type": "list", "id": "results", "empty": "Keine Treffer.",
  "items": [
    { "id": "Mathe/Ableitungen.md", "title": "Ableitungen", "detail": "3 offene Aufgaben", "badge": "3" },
    { "id": "Physik/Optik.md", "title": "Optik", "detail": "1 offene Aufgabe", "badge": "1" }
  ] }
```

Klick auf eine Zeile → `onAction({ id: 'results', itemId: 'Mathe/Ableitungen.md', values })`. `badge` max. 24 Zeichen, `detail` max. 600. Max. 500 Einträge – für mehr baue Seiten oder eine Suche.

### keyvalue

```json
{ "type": "keyvalue", "items": [ { "key": "Wörter", "value": 1284 }, { "key": "Zeit", "value": "2 h 13 min" } ] }
```

Zweispaltige Faktenliste. Zahlen werden zu Text.

### progress

```json
{ "type": "progress", "value": 0.62, "label": "62 %" }
```

`value` 0–1.

### divider

```json
{ "type": "divider" }
```

### row

```json
{ "type": "row", "children": [
  { "type": "button", "id": "start", "label": "Start", "primary": true },
  { "type": "button", "id": "reset", "label": "Zurücksetzen" }
] }
```

Kinder nebeneinander (umbrechend). Verschachtelung bis Tiefe 4.

## Interaktion

```js
panel.onAction(async ({ id, itemId, values }) => {
  // id      = Button-ID, Listen-ID oder 'submit:<inputId>'
  // itemId  = angeklickte Zeile (nur bei Listen)
  // values  = aktuelle Werte aller input/select/checkbox-Blöcke, nach ID
})

panel.onInput(({ id, value, values }) => {
  // feuert pro bestätigter Eingabe; nutze es für Live-Filter oder zum Speichern von Einstellungen
})
```

Handler dürfen `async` sein; Fehler zeigen einen Toast und landen im Protokoll. `panel.values()` liefert jederzeit die zuletzt bekannten Werte.

## Muster

**Render-Funktion + Zustand.** Halte den Zustand im Worker und rendere daraus – wie in React, nur mit JSON:

```js
const state = { filter: '', items: [] }
const render = () => [
  { type: 'input', id: 'filter', label: 'Filter', value: state.filter },
  { type: 'list', id: 'items', items: state.items.filter((i) => i.title.includes(state.filter)), empty: 'Nichts gefunden.' },
]
const panel = fanotes.ui.panel({ id: 'main', title: 'Liste', blocks: render() })
panel.onInput(async ({ id, value }) => { if (id === 'filter') { state.filter = String(value); await panel.update(render()) } })
```

**Bestätigen vor gefährlichen Aktionen.** `danger`-Buttons sollten `await fanotes.ui.confirm(...)` aufrufen, bevor sie etwas ändern.

**Leere Zustände erklären.** `empty` bei Listen und ein `callout` mit Anleitung, wenn noch keine Daten da sind.

**Nicht zu oft updaten.** Ein `update` pro Nutzeraktion oder pro Ereignis ist gut; ein `update` pro Millisekunde zählt gegen das Aufruf-Limit (240/s) und flackert.

## Limits

| | |
| --- | --- |
| Blöcke pro Panel | 400 (inkl. verschachtelter) |
| Verschachtelungstiefe `row` | 4 |
| Kurztexte (Labels, Titel, Keys) | 200 Zeichen |
| Langtexte (text, markdown, callout, input-Wert) | 20 000 Zeichen |
| Listeneinträge / Select-Optionen | 500 / 200 |
| Panels pro Add-on | 6 |
| Panel-Titel / Icon | 80 Zeichen / 8 Zeichen |
