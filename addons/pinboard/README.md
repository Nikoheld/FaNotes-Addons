# Pinnwand / Pinboard

Heftet die aktive Notiz oder eine Editor-Auswahl an eine persönliche Pinnwand (max. 50 Pins). Im Panel kannst du Pins öffnen, einfügen, in die Zwischenablage kopieren, sortieren, beschriften und entfernen.

Pins the active note or an editor selection to a personal pinboard (max 50 pins). From the panel you can open, insert, copy to clipboard, reorder, label and remove pins.

---

## Deutsch

### Was es tut

- **Pinnwand öffnen:** Panel `board` mit Liste, Primäraktion, Kopieren, Hoch/Runter, Label, Entfernen und Leeren.
- **Aktive Notiz anheften:** Speichert Pfad + Titel als `kind: note` (Duplikate nach Pfad werden erkannt).
- **Auswahl anheften:** Speichert markierten Editor-Text als `kind: snippet`.
- **Pinnwand leeren:** Löscht alle Pins nach Bestätigung.
- **Statusleiste:** Optional `Pins: N` (Klick öffnet das Panel).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Pinnwand öffnen*
   - *Aktive Notiz anheften*
   - *Auswahl anheften*
   - *Pinnwand leeren*
2. Im Panel:
   - **Aktive Notiz** / **Auswahl** anheften
   - Zeile anklicken → Auswahl
   - **Öffnen** (Notiz) bzw. **Einfügen** (Schnipsel) – eine Primäraktion
   - **Kopieren** → Notiz-Pfad oder Schnipsel-Text in die Zwischenablage
   - **Hoch** / **Runter** → Reihenfolge ändern
   - **Label** → Prompt (leer = Label entfernen)
   - **Entfernen** / **Alles leeren** → mit Bestätigung
3. Optional: Statusleisten-Eintrag `Pins: N`.

### Speicher

Schlüssel `data`:

```json
{
  "pins": [
    {
      "id": "p-…",
      "kind": "note",
      "path": "Fach/Thema.md",
      "title": "Thema",
      "label": "Prüfung",
      "createdAt": 0
    },
    {
      "id": "p-…",
      "kind": "snippet",
      "title": "erste Zeile…",
      "text": "…",
      "createdAt": 0
    }
  ],
  "settings": { "showStatus": true }
}
```

- Maximal **50** Pins; IDs `p-` + Zeitstempel + Zufall.
- Jede Mutation wird sofort persistiert.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Prompts, Bestätigungen, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Aktive Notiz lesen (`notes.active`) |
| `editor` | Auswahl lesen, Schnipsel einfügen/ersetzen |
| `storage` | Pins und Statusleisten-Option speichern |
| `clipboard` | Pfad bzw. Text in die Zwischenablage schreiben |

**Kein** `network`, **kein** `notes:write`, **kein** `vault:write`.

### Grenzen

- Nur Markdown-Editor für Einfügen; Stiftmodus/PDF → Toast „Kein Markdown-Editor“.
- Zwischenablage nur schreiben (FaNotes erlaubt kein Lesen).
- Statusleiste abschaltbar; max. 3 Status-Einträge pro Add-on (FaNotes-Limit).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `clipboard`, `editor`, `notes`).

---

## English

### What it does

- **Open pinboard:** Panel `board` with list, primary action, copy, up/down, label, remove and clear.
- **Pin active note:** Stores path + title as `kind: note` (duplicate paths are detected).
- **Pin selection:** Stores the selected editor text as `kind: snippet`.
- **Clear pinboard:** Deletes all pins after confirmation.
- **Status bar:** Optional `Pins: N` (click opens the panel).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open pinboard*
   - *Pin active note*
   - *Pin selection*
   - *Clear pinboard*
2. In the panel:
   - Pin **Active note** / **Selection**
   - Click a row → select
   - **Open** (note) or **Insert** (snippet) – one primary action
   - **Copy** → note path or snippet text to the clipboard
   - **Up** / **Down** → reorder
   - **Label** → prompt (empty = remove label)
   - **Remove** / **Clear all** → with confirmation
3. Optionally use the status-bar item `Pins: N`.

### Storage

Key `data`:

```json
{
  "pins": [
    {
      "id": "p-…",
      "kind": "note",
      "path": "Subject/Topic.md",
      "title": "Topic",
      "label": "exam",
      "createdAt": 0
    },
    {
      "id": "p-…",
      "kind": "snippet",
      "title": "first line…",
      "text": "…",
      "createdAt": 0
    }
  ],
  "settings": { "showStatus": true }
}
```

- Maximum **50** pins; IDs are `p-` + timestamp + random.
- Every mutation is persisted immediately.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, prompts, confirms, toasts, status bar, `notes.open` |
| `notes:read` | Read the active note (`notes.active`) |
| `editor` | Read selection, insert/replace snippet text |
| `storage` | Persist pins and status-bar preference |
| `clipboard` | Write path or text to the system clipboard |

**No** `network`, **no** `notes:write`, **no** `vault:write`.

### Limits

- Insert works only in the open Markdown editor; ink/PDF → “No Markdown editor” toast.
- Clipboard is write-only (FaNotes does not allow reading).
- Status bar can be disabled; FaNotes allows at most 3 status items per add-on.
- Command titles follow the UI language at start; reload the add-on after a language switch.
- Toasts only use `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `clipboard`, `editor`, `notes`).

---

## Lizenz / License

MIT
