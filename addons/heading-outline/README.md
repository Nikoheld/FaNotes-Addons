# Gliederung / Heading Outline

Zeigt die **ATX-Überschriften** (`#`–`######`) der offenen Markdown-Notiz als Gliederung, fügt ein Inhaltsverzeichnis als reine Aufzählung/Nummerierung ein und kopiert Überschriften in die Zwischenablage.

Shows **ATX headings** (`#`–`######`) of the open Markdown note as an outline, inserts a table of contents as a plain bullet/numbered list, and copies headings to the clipboard.

---

## Deutsch

### Was es tut

- **Gliederung öffnen:** Panel `outline` mit Anzahl, Max-Ebene, TOC-Stil, Zeilennummer-Option und Liste.
- **TOC einfügen:** Am Cursor als `- Text` oder `1. Text` (eingerückt nach Ebene) – **ohne** Markdown-Links und **ohne** Anker. Es gibt keinen Sprung/Scroll zur Überschrift im Editor.
- **Gliederung kopieren:** Dieselbe Liste in die Zwischenablage (aktueller TOC-Stil).
- **Klick auf eine Zeile** im Panel kopiert nur den Überschriftentext.
- Fenced Code (` ``` ` / `~~~`) wird beim Parsen ignoriert; Ebenen oberhalb von `maxLevel` entfallen.

### Bedienung

1. Öffne eine Markdown-Notiz im Schreibmodus.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Gliederung öffnen*
   - *Inhaltsverzeichnis einfügen*
   - *Gliederung kopieren*
3. Im Panel:
   - **Max. Überschriftenebene** (1–6)
   - **TOC-Stil** (Aufzählung / Nummeriert)
   - **Zeilennummer anzeigen**
   - **TOC einfügen** / **Aktualisieren**
   - Zeile anklicken → Text kopieren

### Einstellungen (Speicher)

Schlüssel `settings`:

```json
{
  "maxLevel": 3,
  "tocStyle": "bullet",
  "showLine": true
}
```

- `maxLevel`: 1–6 (Standard 3)
- `tocStyle`: `bullet` | `numbered`
- `showLine`: Zeilennummer als Badge in der Liste
- Jede Änderung wird sofort persistiert.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts |
| `editor` | Text lesen, TOC am Cursor einfügen |
| `storage` | Einstellungen speichern |
| `clipboard` | Überschrift / Gliederung in die Zwischenablage schreiben |

**Kein** `network`, **kein** `notes:write`, **kein** `vault:write`.

### Grenzen

- Nummerierte TOC-Zeilen nutzen einen **global fortlaufenden** Zähler (`1.`, `2.`, …) mit Einrückung nach Ebene — kein Neustart pro Ebene.
- Nur der offene Markdown-Editor – nicht Stiftmodus, PDF oder geschlossene Notizen.
- Nur ATX (`# Titel`), keine Setext-Unterstreichungen.
- TOC und Zwischenablage sind **Klartext-Listen** ohne Links/Anker – kein Scroll zur Stelle.
- Live-Aktualisierung beim Tippen (`note:changed`) braucht laut SDK `notes:read`; dieses Add-on fordert sie **nicht** an. Solange das Panel offen ist, aktualisiert es bei Notizwechsel (`note:opened`), Moduswechsel und manuell / nach TOC-Einfügen.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `editor.getText` / `editor.insert`, `storage`, `clipboard`).

---

## English

### What it does

- **Open Heading Outline:** Panel `outline` with count, max level, TOC style, line-number option and list.
- **Insert TOC:** At the cursor as `- Text` or `1. Text` (indented by level) – **no** markdown links and **no** anchors. There is no jump/scroll to the heading in the editor.
- **Copy outline:** Same list to the clipboard (current TOC style).
- **Click a row** in the panel copies only the heading text.
- Fenced code (` ``` ` / `~~~`) is ignored while parsing; levels above `maxLevel` are skipped.

### Usage

1. Open a Markdown note in writing mode.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Heading Outline*
   - *Insert table of contents*
   - *Copy outline*
3. In the panel:
   - **Max heading level** (1–6)
   - **TOC style** (bullet / numbered)
   - **Show line number**
   - **Insert TOC** / **Refresh**
   - Click a row → copy text

### Settings (storage)

Key `settings`:

```json
{
  "maxLevel": 3,
  "tocStyle": "bullet",
  "showLine": true
}
```

- `maxLevel`: 1–6 (default 3)
- `tocStyle`: `bullet` | `numbered`
- `showLine`: line number as list badge
- Every change is persisted immediately.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts |
| `editor` | Read text, insert TOC at cursor |
| `storage` | Persist settings |
| `clipboard` | Write heading / outline to the clipboard |

**No** `network`, **no** `notes:write`, **no** `vault:write`.

### Limits

- Numbered TOC lines use a **single running** counter (`1.`, `2.`, …) with indent by level — not restarted per heading level.
- Only the open Markdown editor – not pen mode, PDF, or closed notes.
- ATX only (`# Title`), no Setext underlines.
- TOC and clipboard are **plain lists** without links/anchors – no scroll to location.
- Live refresh on typing (`note:changed`) requires `notes:read` per the SDK; this add-on does **not** request it. While the panel is open, it refreshes on note switch (`note:opened`), mode change, and manually / after TOC insert.
- Command titles follow the UI language at start; after a language switch, reload the add-on.
- Toasts are only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `editor.getText` / `editor.insert`, `storage`, `clipboard`).

---

## Lizenz / License

MIT
