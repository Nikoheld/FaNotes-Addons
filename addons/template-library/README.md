# Vorlagen-Bibliothek / Template Library

Verwaltet Textvorlagen (Titel, Körper, Keywords) im Add-on-Speicher und fügt sie mit Platzhaltern `{{date}}`, `{{time}}`, `{{title}}`, `{{selection}}` in den offenen Markdown-Editor ein.

Manages text templates (title, body, keywords) in add-on storage and inserts them into the open Markdown editor with `{{date}}`, `{{time}}`, `{{title}}`, `{{selection}}` placeholders.

---

## Deutsch

### Was es tut

- **Vorlagen-Bibliothek öffnen:** Panel mit Liste, Vorschau, Einfügen sowie Neu / Bearbeiten / Löschen.
- **Letzte Vorlage einfügen:** Die zuletzt genutzte Vorlage an Cursor bzw. Auswahl einfügen.
- **Vorlage wählen und einfügen:** Nummer oder Titel per Prompt, dann einfügen.
- **Starter-Set** beim ersten Start: *Protokoll*, *Hausaufgabe*, *Wochenplan* (Sprache der UI).
- **Platzhalter** werden erst beim Einfügen aufgelöst.

### Platzhalter

| Platzhalter | Bedeutung |
| --- | --- |
| `{{date}}` | Lokales Kalenderdatum `YYYY-MM-DD` |
| `{{time}}` | Lokale Uhrzeit `HH:mm` |
| `{{title}}` | Titel der aktiven Notiz (`notes.active`) |
| `{{selection}}` | Aktuell markierter Editor-Text (sonst leer) |

Groß-/Kleinschreibung der Platzhalter-Namen ist egal; optionale Leerzeichen in den Klammern sind erlaubt.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Vorlagen-Bibliothek öffnen*
   - *Letzte Vorlage einfügen*
   - *Vorlage wählen und einfügen*
2. Im Panel: Zeile anklicken (Auswahl), **Einfügen** (primär), oder **Neu** / **Bearbeiten** / **Löschen**.
3. Bei Auswahl im Editor ersetzt das Einfügen die Markierung; sonst Einfügen an der Cursorposition (`replaceSelection` bzw. `insert`).

### Speicher

Schlüssel `data`:

```json
{
  "templates": [{ "id": "…", "title": "…", "body": "…", "keywords": "…" }],
  "lastUsedId": "…",
  "seeded": true
}
```

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Prompts, Bestätigungen, Toasts |
| `editor` | Auswahl lesen, Text einfügen/ersetzen |
| `notes:read` | Aktiven Notiztitel für `{{title}}` |
| `storage` | Vorlagen und `lastUsedId` speichern |

**Kein** `network`, **kein** `notes:write`, **kein** `clipboard`.

### Grenzen

- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Toast „Kein Markdown-Editor“.
- Kein Netzwerk, kein Vault-Schreiben – Vorlagen leben nur im Add-on-Speicher (Limit FaNotes: 1 MB / 500 Schlüssel).
- Starter-Texte werden einmalig in der UI-Sprache beim ersten Start geschrieben; Sprachwechsel ändert bestehende Vorlagen nicht.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Kein Statusleisten-Eintrag.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Template Library:** Panel with list, preview, insert, plus New / Edit / Delete.
- **Insert last-used template:** Inserts the last-used template at the cursor or selection.
- **Pick template and insert:** Prompt for number or title, then insert.
- **Starter set** on first launch: *Meeting minutes*, *Homework*, *Weekly plan* (UI language).
- **Placeholders** are resolved only at insert time.

### Placeholders

| Placeholder | Meaning |
| --- | --- |
| `{{date}}` | Local calendar date `YYYY-MM-DD` |
| `{{time}}` | Local time `HH:mm` |
| `{{title}}` | Active note title (`notes.active`) |
| `{{selection}}` | Current editor selection (empty if none) |

Placeholder names are case-insensitive; optional spaces inside the braces are allowed.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Template Library*
   - *Insert last-used template*
   - *Pick template and insert*
2. In the panel: click a row (select), **Insert** (primary), or **New** / **Edit** / **Delete**.
3. With a selection, insert replaces it; otherwise text is inserted at the cursor (`replaceSelection` / `insert`).

### Storage

Key `data`:

```json
{
  "templates": [{ "id": "…", "title": "…", "body": "…", "keywords": "…" }],
  "lastUsedId": "…",
  "seeded": true
}
```

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, prompts, confirms, toasts |
| `editor` | Read selection, insert/replace text |
| `notes:read` | Active note title for `{{title}}` |
| `storage` | Persist templates and `lastUsedId` |

**No** `network`, **no** `notes:write`, **no** `clipboard`.

### Limits

- Only in an open Markdown editor; ink/PDF → toast “No Markdown editor”.
- No network, no vault writes – templates live only in add-on storage (FaNotes limit: 1 MB / 500 keys).
- Starter bodies are written once in the UI language at first launch; changing language does not rewrite existing templates.
- Command titles follow the UI language at start; reload the add-on after a language switch.
- No status-bar item.

### Version

1.0.0 – initial release.

---

## Lizenz / License

MIT
