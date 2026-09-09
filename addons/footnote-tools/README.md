# Fußnoten-Werkzeuge / Footnote Tools

Fügt Fußnoten-Marker ein und listet Definitionen in der Notiz.

Inserts footnote markers and lists definitions in the note.

---

## Deutsch

### Was es tut

- **Fußnote einfügen:** Markdown-Marker `[^id]` an der Cursorposition; fehlende Definition `[^id]: ` am Notizende ergänzen (Leerzeichen zum Tippen).
- **Fußnoten auflisten:** Definitionen und Marker der **aktiven** Notiz im Panel zeigen (Waisen-Badge).
- **Fußnoten-Werkzeuge öffnen:** Panel `fn` mit ID-Modus, Präfix, Kopier-Option und Liste.

### Markdown-Format

```markdown
Satz mit Verweis[^fn1].

[^fn1]: Definitionstext
```

- **Marker:** `[^id]` (nicht gefolgt von `:`)
- **Definition:** Zeile `[^id]: …` am Ende der Notiz

### ID-Modus

| Modus | Verhalten |
| --- | --- |
| **Automatisch** | Nächste freie ID `${prefix}${n}` (n = 1…), geprüft gegen vorhandene Marker und Definitionen |
| **Nachfragen** | Dialog für die ID |

Standard-Präfix: `fn`. Optional: Marker nach dem Einfügen in die Zwischenablage kopieren.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen die drei Befehle.
2. Im Panel: ID-Modus wählen, Präfix setzen, **Fußnote einfügen** (primär).
3. **Aktualisieren** lädt Marker/Definitionen der aktiven Notiz neu.
4. Klick auf einen Listeneintrag kopiert `[^id]`.

Textquelle: `editor.getText()` oder sonst `notes.read(active)`. Definitionen anhängen über `editor.setText` (Markdown-Editor nötig).

### Speicher

Schlüssel `settings`:

```json
{
  "idMode": "auto",
  "prefix": "fn",
  "copyOnInsert": false
}
```

Laden validiert; Speichern ist rollback-sicher. `onActivate` lädt nur die Einstellungen — kein Vault-Scan.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Prompt |
| `editor` | Marker einfügen, Text lesen/schreiben |
| `notes:read` | Fallback: aktive Notiz lesen |
| `storage` | ID-Modus, Präfix, Kopier-Option |
| `clipboard` | Marker optional / per Listen-Klick kopieren |

**Kein** `network`, **kein** `notes:write`, **kein** Vault-Schreiben. Nur die aktive Notiz.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **quote-collector** | Zitate sammeln und exportieren — hier Markdown-Fußnoten `[^id]` |
| **math-snippets** | LaTeX-Formeln — hier keine Formeln |
| **callout-inserter** | Obsidian-Callouts `> [!info]` — hier Fußnoten-Marker und Definitionen |

### Grenzen

- Nur aktive Notiz; kein Vault-Scan.
- Definition anhängen braucht den offenen Markdown-Editor (`editor.setText`).
- Waisen: Marker ohne Definition oder Definition ohne Marker — Badge in der Liste.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Insert footnote:** Markdown marker `[^id]` at the cursor; append a missing definition `[^id]: ` at the end of the note (trailing space for typing).
- **List footnotes:** Show definitions and markers of the **active** note in the panel (orphan badge).
- **Open Footnote Tools:** Panel `fn` with id mode, prefix, copy option, and list.

### Markdown format

```markdown
Sentence with a reference[^fn1].

[^fn1]: Definition text
```

- **Marker:** `[^id]` (not followed by `:`)
- **Definition:** line `[^id]: …` at the end of the note

### Id mode

| Mode | Behaviour |
| --- | --- |
| **Auto** | Next free id `${prefix}${n}` (n = 1…), checked against existing markers and definitions |
| **Prompt** | Dialog for the id |

Default prefix: `fn`. Optional: copy the marker to the clipboard after insert.

### Usage

1. Command palette (`Ctrl K`) → the three commands under the add-on name.
2. In the panel: choose id mode, set prefix, tap **Insert footnote** (primary).
3. **Refresh** reloads markers/definitions of the active note.
4. Click a list row to copy `[^id]`.

Text source: `editor.getText()` or else `notes.read(active)`. Appending definitions uses `editor.setText` (Markdown editor required).

### Storage

Key `settings`:

```json
{
  "idMode": "auto",
  "prefix": "fn",
  "copyOnInsert": false
}
```

Values are validated on load; writes are rollback-safe. `onActivate` only loads settings — no vault scan.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, prompt |
| `editor` | Insert markers, read/write text |
| `notes:read` | Fallback: read the active note |
| `storage` | Id mode, prefix, copy option |
| `clipboard` | Optional / list-click copy of marker |

**No** `network`, **no** `notes:write`, **no** vault writes. Active note only.

### Boundaries

| Add-on | Difference |
| --- | --- |
| **quote-collector** | Collect and export quotes — here Markdown footnotes `[^id]` |
| **math-snippets** | LaTeX formulas — no formulas here |
| **callout-inserter** | Obsidian callouts `> [!info]` — here footnote markers and definitions |

### Limits

- Active note only; no vault scan.
- Appending a definition needs the open Markdown editor (`editor.setText`).
- Orphans: marker without definition or definition without marker — badge in the list.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
