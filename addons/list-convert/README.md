# Listen-Umwandler / List Convert

Wandelt **markierte Zeilen** in Aufzählung, Nummerierung oder Aufgabenliste um (Prefix-Umwandlung der Selection).

Converts **selected lines** into bullets, numbers or task lists (prefix conversion of the selection).

---

## Deutsch

### Was es tut

- **Listen-Umwandler öffnen:** Panel mit Modus-Auswahl, Einrückung behalten und Button *Umwandeln*.
- **Aufzählung:** Prefix `- ` je nicht-leerer Zeile.
- **Nummerierung:** Prefix `1. `, `2. `, … Soft neu ab 1 bei jedem Aufruf (leere Zeilen bleiben leer und zählen nicht).
- **Aufgabenliste:** Prefix `- [ ] ` je nicht-leerer Zeile.
- Bestehende Listen-Prefixes Soft (`- `, `* `, `+ `, optional `[ ]`/`[x]`, oder `N. `) werden vor dem neuen Prefix entfernt; Einrückung Soft behalten oder strippen.

### Bedienung

1. Im Markdown-Editor Zeilen markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Listen-Umwandler öffnen*
   - *Zeilen → Aufzählung* / *Zeilen → Nummerierung* / *Zeilen → Aufgabenliste*
3. Oder im Panel Modus wählen und *Umwandeln* drücken.

Ohne Auswahl (leer / nur Whitespace) → Info-Toast „Bitte Zeilen markieren“. Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "mode": "bullet",
  "keepIndent": true
}
```

- `mode`: `bullet` | `numbered` | `task` (Default Soft: `bullet`).
- `keepIndent`: bei `true` bleibt die Einrückungsgruppe Soft erhalten; bei `false` wird sie gestrippt (Default Soft: `true`).

`onActivate` lädt nur den Speicher – kein Vault-Scan.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Auswahl lesen und ersetzen (`getSelection` / `replaceSelection`) |
| `storage` | Einstellungen |

**Kein** `notes:read`/`notes:write`, **kein** `vault:write`, **kein** `network`, **kein** `clipboard`.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **line-tools** | Sortieren / Deduplizieren / Umdrehen – hier Prefix-Umwandlung der Selection-Zeilen |
| **checkbox-progress** | Anzeige des Checkbox-Fortschritts – hier Umwandlung in Aufgaben-/Listen-Prefixes |
| **callout-inserter** | Callout-Blöcke einfügen – hier keine Insert-Snippets |
| **table-inserter** | Tabellen einfügen – hier keine Tabellen |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection.
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Soft: Nummerierung startet bei jedem Aufruf neu bei 1.
- Kein Netzwerk, kein Vault – Einstellungen leben nur im Add-on-Speicher.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open List Convert:** Panel with mode select, keep-indent checkbox, and a *Convert* button.
- **Bullets:** Prefix `- ` on each non-empty line.
- **Numbered:** Prefix `1. `, `2. `, … Soft resets to 1 on every call (empty lines stay empty and do not count).
- **Task list:** Prefix `- [ ] ` on each non-empty line.
- Existing list prefixes Soft (`- `, `* `, `+ `, optional `[ ]`/`[x]`, or `N. `) are stripped before the new prefix; indentation Soft kept or stripped.

### Usage

1. Select lines in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open List Convert*
   - *Lines → bullets* / *Lines → numbered* / *Lines → task list*
3. Or choose a mode in the panel and press *Convert*.

No selection (empty / whitespace only) → info toast "Please select lines". No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "mode": "bullet",
  "keepIndent": true
}
```

- `mode`: `bullet` | `numbered` | `task` (Soft default: `bullet`).
- `keepIndent`: when `true`, Soft keeps the indent group; when `false`, strips it (Soft default: `true`).

`onActivate` only loads settings — no vault scan.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Read and replace selection (`getSelection` / `replaceSelection`) |
| `storage` | Settings |

**No** `notes:read`/`notes:write`, **no** `vault:write`, **no** `network`, **no** `clipboard`.

### Differentiation

| Add-on | Difference |
| --- | --- |
| **line-tools** | Sort / dedupe / reverse — here prefix conversion of selected lines |
| **checkbox-progress** | Displays checkbox progress — here conversion into task/list prefixes |
| **callout-inserter** | Inserts callout blocks — here no insert snippets |
| **table-inserter** | Inserts tables — here no tables |

### Limits

- Selection only; never rewrites the whole file without a selection.
- Markdown editor only; pen mode/PDF → error toast.
- Soft: numbering resets to 1 on every call.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
