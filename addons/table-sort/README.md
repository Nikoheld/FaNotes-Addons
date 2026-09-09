# Tabellen sortieren / Table Sort

Sortiert die Markdown-Tabelle unter dem Cursor nach einer Spalte.

Sorts the Markdown table under the cursor by a column.

---

## Deutsch

### Was es tut

- **Tabelle sortieren:** Pipe-Tabelle unter dem Cursor nach der gespeicherten Spalte (aufsteigend/absteigend, optional Kopfzeile).
- **Tabelle absteigend sortieren:** Einmal absteigend — ändert die gespeicherte Richtung nicht.
- **Tabellen sortieren öffnen:** Panel `tsort` mit Spalte, Aufsteigend, Kopfzeile und **Sortieren**.

### Erkennung

1. `editor.getText()` + `getSelection()` — Block, der die Cursorzeile enthält.
2. Zusammenhängende Zeilen, die nach Trim zu `^\|.*\|$` passen; mindestens 2 Zeilen.
3. Mit **Kopfzeile**: Zeile 0 = Header, Zeile 1 muss dem GFM-Trenner entsprechen (`|---|---|` / `:---:` …); sonst gelten alle Zeilen als Körper.
4. Ohne Kopfzeile: alle Zeilen = Körper.
5. Spalte wird auf `1…Spaltenzahl` begrenzt; fehlende Zellen = leer.
6. Sortierung: `localeCompare` mit `numeric: true` über die App-Sprache; stabile Reihenfolge bei Gleichstand.
7. Schreiben: nur diesen Tabellenabschnitt im Volltext ersetzen (`editor.setText`).

Keine Tabelle unter dem Cursor → Fehler-Toast.

### Bedienung

1. Cursor in eine Markdown-Pipe-Tabelle setzen.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Tabelle sortieren*
   - *Tabelle absteigend sortieren*
   - *Tabellen sortieren öffnen*
3. Im Panel: Spalte (1-basiert), Aufsteigend an/aus, Kopfzeile an/aus, **Sortieren** (primär).

### Speicher

Schlüssel `settings`:

```json
{
  "column": 1,
  "ascending": true,
  "header": true
}
```

Defaults: `column=1` (1-basiert), `ascending=true`, `header=true`. Laden validiert/klammert; Speichern ist rollback-sicher. `onActivate` lädt nur die Einstellungen — kein Vault.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Text lesen und Tabellenabschnitt schreiben (`getText` / `getSelection` / `setText`) |
| `storage` | Spalte, Richtung, Kopfzeile |

**Kein** `network`, **kein** `notes:read`/`notes:write`, **kein** `clipboard`, **kein** Vault.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **table-inserter** | Leere Markdown-Tabelle einfügen — hier bestehenden Tabellenkörper sortieren |
| **line-tools** | Freie Editorzeilen sortieren/deduplizieren/umdrehen — hier Pipe-Tabelle nach Spalte |

### Grenzen

- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Nur zusammenhängende `|…|`-Blöcke; keine HTML-Tabellen.
- Cursor muss auf einer Tabellenzeile liegen.
- Kein Statusleisten-Eintrag; kein Netzwerk; kein Clipboard.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Sort table:** Pipe-table under the cursor by the saved column (ascending/descending, optional header).
- **Sort table descending:** Descending once — does not change the saved direction.
- **Open Table Sort:** Panel `tsort` with column, ascending, header, and **Sort**.

### Detection

1. `editor.getText()` + `getSelection()` — block containing the cursor line.
2. Contiguous lines matching `^\|.*\|$` after trim; at least 2 rows.
3. With **header**: row 0 = header, row 1 must match the GFM separator (`|---|---|` / `:---:` …); otherwise all rows are body.
4. Without header: all rows = body.
5. Column is clamped to `1…column count`; missing cells = empty string.
6. Sort: `localeCompare` with `numeric: true` via the app language; stable enough on ties.
7. Write: replace only that table slice in the full text (`editor.setText`).

No table under the cursor → error toast.

### Usage

1. Place the cursor inside a Markdown pipe-table.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Sort table*
   - *Sort table descending*
   - *Open Table Sort*
3. In the panel: set column (1-based), toggle ascending, toggle header, tap **Sort** (primary).

### Storage

Key `settings`:

```json
{
  "column": 1,
  "ascending": true,
  "header": true
}
```

Defaults: `column=1` (1-based), `ascending=true`, `header=true`. Values are validated/clamped on load; writes are rollback-safe. `onActivate` only loads settings — no vault.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Read text and write the table slice (`getText` / `getSelection` / `setText`) |
| `storage` | Column, direction, header |

**No** `network`, **no** `notes:read`/`notes:write`, **no** `clipboard`, **no** vault.

### Boundaries

| Add-on | Difference |
| --- | --- |
| **table-inserter** | Inserts an empty Markdown table — here sorts an existing table body |
| **line-tools** | Sorts/dedupes/reverses free editor lines — here sorts a pipe-table by column |

### Limits

- Markdown editor only; pen mode/PDF → error toast.
- Contiguous `|…|` blocks only; no HTML tables.
- Cursor must sit on a table line.
- No status-bar entry; no network; no clipboard.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
