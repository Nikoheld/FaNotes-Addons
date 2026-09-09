# Leere Notizen / Empty Notes

Findet **leere oder sehr kurze Markdown-Notizen** (nach `trim` der Inhalte, Schwelle `maxChars`) zum Aufräumen. Panel mit Schwelle, Ordnerfilter und Liste (kürzeste zuerst).

Finds **empty or very short Markdown notes** (after content `trim`, threshold `maxChars`) for cleanup. Panel with threshold, folder filter, and list (shortest first).

> **Abgrenzung / vs others:** `orphan-notes` = **Wikilinks**; `stale-notes` = **`modifiedAt`-Alter**; `duplicate-titles` = **gleiche Titel**. `empty-notes` misst nur die **Inhaltslänge** nach Trim.
> **Distinction / vs others:** `orphan-notes` = **wikilinks**; `stale-notes` = **`modifiedAt` age**; `duplicate-titles` = **same titles**. `empty-notes` only measures **content length** after trim.

> **v1:** Kein Schreiben, kein Papierkorb/Löschen. Nur `.md` / `.markdown`. `skipCodeOnly` wird ignoriert (Roh-Trim-Länge zählt).
> **v1:** No write, no trash. `.md` / `.markdown` only. `skipCodeOnly` is ignored (raw trim length counts).

---

## Deutsch

### Was es tut

- **Leere Notizen öffnen:** Panel `empty` mit Key-Value (**Schwelle** | **Treffer** | **gescannt**), Eingaben `maxChars` + Ordner, Button **Aktualisieren** (einziger Primary), Liste (max. 80).
- **Leer-Scan aktualisieren:** Listet Notizen, liest bis zu `maxNotes` Körper, filtert nach Länge.
- **Erste leere Notiz öffnen:** Öffnet den kürzesten Treffer; Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`. Detail: `` `${chars} Z. · path` ``.

### Was „leer/kurz“ bedeutet

```js
const t = text.replace(/\uFEFF/g, '').trim()
if (t.length === 0) return true          // immer leer (Whitespace-only)
return t.length <= settings.maxChars     // 0 = nur wirklich leer
```

- `maxChars = 20` (Standard): Länge nach Trim ≤ 20 zählt.
- `maxChars = 0`: nur wirklich leere Notizen (nach Trim).
- `ignoreWhitespaceOnly: true` (gespeichert, dokumentiert): Trim `=== ''` zählt immer — so implementiert in `isEmpty`.
- `skipCodeOnly`: v1 **ignoriert**; Code-only-Notizen zählen nach Roh-Trim-Länge.

Sortierung der Treffer: Zeichen aufsteigend, dann `modifiedAt` aufsteigend (`localeCompare`), Tiebreak Pfad. Vor dem Lesen: `modifiedAt` absteigend, fehlende zuletzt, Slice `maxNotes`.

### Scan-Gate

`notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings laden). Scan bei:

1. Panel öffnen (Befehl **Leere Notizen öffnen**)
2. Button **Aktualisieren**
3. Befehl **Leer-Scan aktualisieren**
4. Befehl **Erste leere Notiz öffnen**

Busy/Queue: parallele Scans werden gequeued (wie `stale-notes`).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Leere Notizen öffnen*
   - *Leer-Scan aktualisieren*
   - *Erste leere Notiz öffnen*
2. Im Panel: Schwelle und optional Ordner setzen → **Aktualisieren** (Primary), Zeile anklicken.

### Speicher

`settings`:

```json
{
  "maxNotes": 400,
  "maxChars": 20,
  "ignoreWhitespaceOnly": true,
  "folder": "",
  "skipCodeOnly": false
}
```

- `maxNotes`: 50–2000 (wie viele Markdown-Notizen vor dem Lesen, neueste zuerst)
- `maxChars`: 0–500 (0 = nur leer nach Trim)
- `ignoreWhitespaceOnly`: immer wirksam in `isEmpty` (Feld bleibt für Kompatibilität)
- `folder`: vault-relativer Präfix, leer = alle; kein `..`
- `skipCodeOnly`: v1 ungenutzt

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, `notes.open` |
| `notes:read` | Notizen listen und lesen |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`, **kein** Vault-/Trash-Zugriff. v1 schreibt/löscht nichts.

### Grenzen (ehrlich)

- Höchstens **`maxNotes`** Markdown-Notizen werden gelesen (Standard 400).
- Liste im Panel max. **80** Einträge; Gesamtzahl unter **Treffer**.
- Ganzkörper-Trim (kein Frontmatter-Strip); BOM (`U+FEFF`) wird entfernt.
- Nur `.md` / `.markdown` (keine PDFs).
- Kein Papierkorb / Löschen in v1 — nur Finden und Öffnen.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Empty Notes:** Panel `empty` with key-value (**Threshold** | **Hits** | **scanned**), `maxChars` + folder inputs, **Refresh** button (only primary), list (max 80).
- **Refresh empty scan:** Lists notes, reads up to `maxNotes` bodies, filters by length.
- **Open first empty note:** Opens the shortest hit; toast if none.
- **Click** a list row → `notes.open`. Detail: `` `${chars} chars · path` ``.

### What “empty/short” means

```js
const t = text.replace(/\uFEFF/g, '').trim()
if (t.length === 0) return true          // always empty (whitespace-only)
return t.length <= settings.maxChars     // 0 = truly empty only
```

- `maxChars = 20` (default): trim length ≤ 20 counts.
- `maxChars = 0`: only truly empty notes (after trim).
- `ignoreWhitespaceOnly: true` (stored, documented): trim `=== ''` always counts — implemented in `isEmpty`.
- `skipCodeOnly`: **ignored** in v1; code-only notes count by raw trim length.

Hit sort: chars ascending, then `modifiedAt` ascending (`localeCompare`), path tiebreak. Before reads: `modifiedAt` descending, missing last, slice `maxNotes`.

### Scan gate

No `notes.list` / `notes.read` in `onActivate` (settings only). Scan on:

1. Panel open (**Open Empty Notes**)
2. **Refresh** button
3. **Refresh empty scan** command
4. **Open first empty note** command

Busy/queue: parallel scans are queued (like `stale-notes`).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Empty Notes*
   - *Refresh empty scan*
   - *Open first empty note*
2. In the panel: set threshold and optional folder → **Refresh** (primary), click a row.

### Storage

Same `settings` shape as above.

- `maxNotes`: 50–2000 (how many Markdown notes to consider before reading, newest first)
- `maxChars`: 0–500 (0 = empty after trim only)
- `ignoreWhitespaceOnly`: always effective in `isEmpty` (field kept for compatibility)
- `folder`: vault-relative prefix, empty = all; no `..`
- `skipCodeOnly`: unused in v1

Settings persist with rollback (toast + restore on failure).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, `notes.open` |
| `notes:read` | List and read notes |
| `storage` | Settings |

**No** `notes:write`, **no** `network`, **no** vault/trash access. v1 does not write or trash.

### Limits (honest)

- At most **`maxNotes`** Markdown notes are read (default 400).
- Panel list capped at **80** rows; total is under **Hits**.
- Whole-body trim (no frontmatter strip); BOM (`U+FEFF`) removed.
- `.md` / `.markdown` only (no PDFs).
- No trash / delete in v1 — find and open only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
