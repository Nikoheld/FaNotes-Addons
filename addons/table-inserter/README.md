# Tabellen-Einfüger / Table Inserter

Fügt eine leere Markdown-Tabelle mit wählbaren Zeilen/Spalten ein.

Inserts an empty Markdown table with chosen rows and columns.

---

## Deutsch

### Was es tut

- **Tabelle einfügen:** Aktuelle Einstellungen (Zeilen/Spalten/Kopfzeile) an der Cursorposition.
- **Standard-Tabelle einfügen:** Fest `3×3` mit Kopfzeile (ohne die gespeicherten Werte zu überschreiben).
- **Tabellen-Einfüger öffnen:** Panel `table` mit Eingaben, Checkbox, Vorschau und **Einfügen**.

### Markdown-Format (GFM)

Soft: `rows` = Körperzeilen; die Kopfzeile kommt **zusätzlich**, wenn aktiviert.

```markdown
| Spalte 1 | Spalte 2 | Spalte 3 |
|---|---|---|
|   |   |   |
|   |   |   |
|   |   |   |
```

Ohne Kopfzeile nur leere Körperzeilen (`|   |   | … |`). Separator Soft `|---|---|` (Standard-GFM).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen die drei Befehle.
2. Im Panel: Zeilen/Spalten eingeben, Kopfzeile an/aus, Vorschau (erste 6 Zeilen, gedämpft), **Einfügen** (primär).
3. Werte werden beim Bestätigen der Eingabe und beim Einfügen gespeichert (1…maxRows / 1…maxCols).

Einfügen bevorzugt `editor.insert(table, 'cursor')`. Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "rows": 3,
  "cols": 3,
  "header": true,
  "maxRows": 20,
  "maxCols": 10
}
```

Laden validiert/klammert; Speichern ist rollback-sicher. `onActivate` lädt nur die Einstellungen — kein Vault.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Text an der Cursorposition einfügen |
| `storage` | Zeilen, Spalten, Kopfzeile |

**Kein** `network`, **kein** `notes:read`/`notes:write`, **kein** `clipboard`, **kein** Vault.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **template-library** | Freie Vorlagen mit CRUD und Platzhaltern — hier nur generische Gitter-Tabelle |
| **math-snippets** | LaTeX-Formeln `$…$` / `$$…$$` — hier kein LaTeX |
| **callout-inserter** | Obsidian-Callouts `> [!info]` … — hier Markdown-Tabelle |

### Grenzen

- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Toast.
- Max. 20 Zeilen / 10 Spalten (Standard-Limits in den Einstellungen).
- Kein Statusleisten-Eintrag; kein Netzwerk; kein Clipboard.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Insert table:** Current settings (rows/columns/header) at the cursor.
- **Insert default table:** Fixed `3×3` with header (does not overwrite saved settings).
- **Open Table Inserter:** Panel `table` with inputs, checkbox, preview, and **Insert**.

### Markdown format (GFM)

Soft: `rows` = body rows; the header row is **extra** when enabled.

```markdown
| Column 1 | Column 2 | Column 3 |
|---|---|---|
|   |   |   |
|   |   |   |
|   |   |   |
```

Without a header, only empty body rows (`|   |   | … |`). Separator Soft `|---|---|` (standard GFM).

### Usage

1. Command palette (`Ctrl K`) → the three commands under the add-on name.
2. In the panel: set rows/columns, toggle header, check the muted preview (first 6 lines), tap **Insert** (primary).
3. Values are saved on confirmed input and on insert (clamped to 1…maxRows / 1…maxCols).

Insert prefers `editor.insert(table, 'cursor')`. No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "rows": 3,
  "cols": 3,
  "header": true,
  "maxRows": 20,
  "maxCols": 10
}
```

Values are validated/clamped on load; writes are rollback-safe. `onActivate` only loads settings — no vault.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Insert text at the cursor |
| `storage` | Rows, columns, header |

**No** `network`, **no** `notes:read`/`notes:write`, **no** `clipboard`, **no** vault.

### Boundaries

| Add-on | Difference |
| --- | --- |
| **template-library** | Freeform templates with CRUD and placeholders — here a generic grid table only |
| **math-snippets** | LaTeX formulas `$…$` / `$$…$$` — no LaTeX here |
| **callout-inserter** | Obsidian callouts `> [!info]` … — Markdown table here |

### Limits

- Only in an open Markdown editor; pen mode/PDF → toast.
- Max 20 rows / 10 columns (default limits in settings).
- No status-bar entry; no network; no clipboard.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
