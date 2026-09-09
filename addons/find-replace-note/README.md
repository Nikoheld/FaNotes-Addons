# Suchen & Ersetzen / Find Replace Note

Sucht und ersetzt **literalen** Text in der **offenen Notiz** (einmal oder alle). Kein Regex in v1.

Finds and replaces **literal** text in the **open note** (once or all). No regex in v1.

---

## Deutsch

### Was es tut

- **Suchen & Ersetzen öffnen:** Panel mit Such-/Ersatzfeldern, Groß-/Kleinschreibung, Trefferanzeige und Buttons *Zählen* / *Einmal* / *Alle*.
- **Einmal:** Ersetzt den ersten Treffer in der aktiven Notiz.
- **Alle:** Ersetzt alle Treffer; bei **mehr als 20** Treffern Soft Bestätigung (Toast + *Alle* erneut drücken in derselben Sitzung).
- **Zählen:** Zeigt die Anzahl der Treffer (Keyvalue *Treffer*).

**v1 kein Regex** (Sicherheit) — nur literales `split`/`join` bzw. Index-Schleife. Keine Sonderzeichen-Metasprache.

### Bedienung

1. Markdown-Notiz öffnen.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Suchen & Ersetzen öffnen*
   - *Einmal ersetzen* / *Alle ersetzen*
3. Im Panel Such- und Ersatztext eingeben; optional Groß-/Kleinschreibung aktivieren.
4. *Zählen*, *Einmal* oder *Alle* (primär).

Leerer Suchtext → Fehler-Toast. Keine offene Notiz → Fehler-Toast.

Schreiben Soft: bevorzugt `editor.setText`; falls nicht verfügbar Soft `notes.write` auf den aktiven Pfad.

### Speicher

Schlüssel `settings`:

```json
{
  "caseSensitive": false,
  "lastFind": "",
  "lastReplace": ""
}
```

`onActivate` lädt nur den Speicher (`lastFind` / `lastReplace` / `caseSensitive`) — kein Vault-Scan, nie `notes.list`.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Text lesen/schreiben (`getText` / `setText`) |
| `notes:read` | Fallback: aktive Notiz lesen, wenn kein Editor-Text |
| `notes:write` | Fallback: schreiben, wenn `editor.setText` nicht verfügbar |
| `storage` | Letzte Such-/Ersatzwerte und Case-Einstellung |

**Kein** `vault:write`, **kein** `network`, **kein** `clipboard`. Scan-Gate: n/a (nur aktive Notiz).

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **saved-searches** | Vault-weite gespeicherte Suche — hier literales Find/Replace nur in der aktiven Notiz |
| **unlinked-mentions** | Titel-Erwähnungen ohne Wikilink — hier allgemeines Text-Ersetzen in der offenen Notiz |
| **case-tools** / **line-tools** | Selection-Case bzw. Zeilen-Ops — hier ganzer Notiztext (Editor Soft) |

### Grenzen

- Nur die aktive Notiz; kein Vault-Scan.
- **Kein Regex** in v1 — nur literal.
- Case-insensitive Soft: Lowercase-Index-Schleife (kein `replaceAll` mit ignoreCase).
- Bei >20 Treffern muss *Alle* zweimal gedrückt werden (Session-Soft).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Find & Replace:** Panel with find/replace fields, case-sensitive checkbox, match count, and *Count* / *Once* / *All* buttons.
- **Once:** Replaces the first match in the active note.
- **All:** Replaces every match; when **more than 20** matches Soft confirmation (toast + press *All* again in the same session).
- **Count:** Shows the number of matches (keyvalue *Matches*).

**No regex in v1** (safety) — literal `split`/`join` or index-loop only. No metacharacters.

### Usage

1. Open a Markdown note.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Find & Replace*
   - *Replace once* / *Replace all*
3. Enter find/replace text in the panel; optionally enable case sensitivity.
4. Use *Count*, *Once*, or *All* (primary).

Empty find → error toast. No open note → error toast.

Write Soft: prefer `editor.setText`; if unavailable Soft `notes.write` on the active path.

### Storage

Key `settings`:

```json
{
  "caseSensitive": false,
  "lastFind": "",
  "lastReplace": ""
}
```

`onActivate` only loads settings (`lastFind` / `lastReplace` / `caseSensitive`) — no vault scan, never `notes.list`.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Read/write text (`getText` / `setText`) |
| `notes:read` | Fallback: read active note when editor text is unavailable |
| `notes:write` | Fallback: write when `editor.setText` is unavailable |
| `storage` | Last find/replace values and case setting |

**No** `vault:write`, **no** `network`, **no** `clipboard`. Scan-Gate: n/a (active note only).

### Differentiation

| Add-on | Difference |
| --- | --- |
| **saved-searches** | Vault-wide saved search — here literal find/replace in the active note only |
| **unlinked-mentions** | Title mentions without wikilink — here general text replace in the open note |
| **case-tools** / **line-tools** | Selection case / line ops — here whole note text (editor Soft) |

### Limits

- Active note only; no vault scan.
- **No regex** in v1 — literal only.
- Case-insensitive Soft: lowercase index loop (not `replaceAll` with ignoreCase).
- When >20 matches, *All* must be pressed twice (session Soft).
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
