# Wortzähler / Word Counter

Zählt Wörter, Zeichen (mit und ohne Leerzeichen), Zeilen und eine grobe Lesezeit für die aktuelle **Auswahl** oder – ohne Markierung – die **ganze offene Notiz**.

Counts words, characters (with and without spaces), lines and a rough reading time for the current **selection**, or – if nothing is selected – the **whole open note**.

---

## Deutsch

### Funktionen

- **Befehl** in der Palette (`Ctrl K`): „Wortzähler öffnen“ – öffnet bzw. aktualisiert das Panel im Add-on-Dock.
- **Panel** mit Kennzahlen (Wörter, Zeichen, Zeichen ohne Leerzeichen, Zeilen, Lesezeit) und Button „Aktualisieren“.
- **Statusleiste** mit kompaktem Wortzähler (`Notiz: 42 W` bzw. `Ausw.: 12 W`), solange ein Markdown-Editor offen ist. Klick öffnet das Panel.
- **Leerer Zustand**, wenn kein Markdown-Editor sichtbar ist (Stiftmodus, PDF, keine Notiz).
- Aktualisiert sich bei Notizwechsel, Tippen (`note:changed`, ~400 ms gebündelt) und Moduswechsel – ohne Polling.

### Nutzung

1. Öffne eine Markdown-Notiz im Schreibmodus.
2. Optional Text markieren – dann zählt die Auswahl, sonst die ganze Notiz.
3. Befehl „Wortzähler öffnen“ oder Klick auf den Statusleisten-Eintrag.
4. Nach einer reinen Auswahländerung (ohne Tippen) „Aktualisieren“ drücken – die API meldet Auswahlwechsel nicht als eigenes Ereignis.

Die Lesezeit schätzt mit **200 Wörtern pro Minute**.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Eintrag in der Befehlspalette |
| `ui` | Panel, Statusleiste, Toasts |
| `editor` | Text und Auswahl der offenen Notiz lesen (keine Schreibzugriffe) |
| `notes:read` | Ereignis `note:changed` / `note:saved` für Live-Aktualisierung ohne Polling |

Es werden **keine** Notizen geschrieben, kein Netz und kein eigener Speicher genutzt.

### Grenzen

- Nur der offene Markdown-Editor – nicht Stiftmodus, PDF oder geschlossene Notizen.
- Markdown-Syntax wird als Klartext mitgezählt (Überschriftenzeichen, Links usw.).
- Auswahlwechsel ohne Tippen aktualisiert den Stand nicht automatisch.
- Befehlstitel werden beim Start in der aktuellen UI-Sprache registriert; nach einem Sprachwechsel ggf. FaNotes neu starten bzw. das Add-on neu laden.

### Sprache

Die Oberfläche folgt `fanotes.app.language` (`de` / `en`).

---

## English

### Features

- **Command** in the palette (`Ctrl K`): “Open Word Counter” – opens or refreshes the panel in the add-on dock.
- **Panel** with metrics (words, characters, characters without spaces, lines, reading time) and a “Refresh” button.
- **Status bar** with a compact word count (`Note: 42 w` or `Sel.: 12 w`) while a Markdown editor is open. Click opens the panel.
- **Empty state** when no Markdown editor is visible (pen mode, PDF, or no note).
- Refreshes on note switch, typing (`note:changed`, batched ~400 ms) and mode changes – without polling.

### Usage

1. Open a Markdown note in writing mode.
2. Optionally select text – then the selection is counted; otherwise the whole note.
3. Run “Open Word Counter” or click the status-bar item.
4. After changing the selection without typing, press “Refresh” – the API does not emit a dedicated selection-change event.

Reading time is estimated at **200 words per minute**.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entry |
| `ui` | Panel, status bar, toasts |
| `editor` | Read text and selection of the open note (no write access) |
| `notes:read` | `note:changed` / `note:saved` events for live refresh without polling |

This add-on **never** writes notes, uses the network, or private storage.

### Limits

- Only the open Markdown editor – not pen mode, PDF, or closed notes.
- Markdown syntax is counted as plain text (heading markers, links, etc.).
- Selection changes without typing do not refresh automatically.
- Command titles are registered in the UI language at start; after a language switch, reload the add-on or restart FaNotes.

### Language

The UI follows `fanotes.app.language` (`de` / `en`).

---

## Lizenz / License

MIT
