# Formel-Schnipsel / Math Snippets

Fügt vordefinierte und eigene LaTeX-Formel-Schnipsel in den offenen Markdown-Editor ein – als Inline-`$…$` oder Display-`$$…$$` – ohne Netzwerk und ohne KaTeX-Vorschau.

Inserts built-in and custom LaTeX math snippets into the open Markdown editor as inline `$…$` or display `$$…$$` math — no network, no KaTeX preview.

---

## Deutsch

### Was es tut

- **Formel-Schnipsel öffnen:** Panel mit Kategoriefilter, Suche und Liste; Klick auf eine Zeile fügt den Schnipsel ein.
- **Letzten Schnipsel einfügen:** Den zuletzt genutzten Schnipsel erneut an Cursor bzw. Auswahl einfügen.
- **Bruch einfügen:** Schnellbefehl für `\frac{a}{b}` (respektiert „Display bevorzugen“).
- **Eingebaute Kategorien** (nicht löschbar; klonbar zum Bearbeiten): Algebra, Analysis, Linear, Sonstiges.
- **Eigene Schnipsel** per Prompt anlegen, bearbeiten und löschen.
- **Display bevorzugen:** Checkbox im Panel – wenn aktiv, wird beim Einfügen immer `$$…$$` verwendet, sonst das `wrap` des Schnipsels.

### Wrap-Regeln

| `wrap` / Einstellung | Ergebnis |
| --- | --- |
| `inline` | `$body$` |
| `display` | `$$\nbody\n$$` |
| Display bevorzugen = an | immer Display, unabhängig vom Schnipsel |

**Kein** automatisches `editor.format('math')` in v1. **Keine** KaTeX-/Formel-Vorschau im Panel.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Formel-Schnipsel öffnen*
   - *Letzten Schnipsel einfügen*
   - *Bruch einfügen*
2. Im Panel: Kategorie wählen, optional suchen, Zeile anklicken → Einfügen.
3. Eigene Schnipsel: **Neu**; Eingebaute: **Klonen**; nur Eigene: **Bearbeiten** / **Löschen**.
4. Bei Auswahl im Editor ersetzt das Einfügen die Markierung; sonst Einfügen an der Cursorposition (`replaceSelection` bzw. `insert`).

### Speicher

Schlüssel `data`:

```json
{
  "custom": [
    {
      "id": "…",
      "category": "algebra",
      "title_de": "…",
      "title_en": "…",
      "body": "\\frac{a}{b}",
      "wrap": "inline"
    }
  ],
  "settings": { "lastId": "…", "preferDisplay": false }
}
```

Eingebaute Schnipsel liegen im Code, nicht im Speicher.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Prompts, Bestätigungen, Toasts |
| `editor` | Text an Cursor/Auswahl einfügen oder ersetzen |
| `storage` | Eigene Schnipsel und Einstellungen speichern |

**Kein** `network`, **kein** `notes:read`/`notes:write`, **kein** `clipboard`.

### Grenzen

- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Toast „Kein Markdown-Editor“.
- Kein Netzwerk, kein Vault-Schreiben – eigene Schnipsel leben nur im Add-on-Speicher (Limit FaNotes: 1 MB / 500 Schlüssel).
- Keine gerenderte Formel-Vorschau; der Listen-Detailtext zeigt den Roh-LaTeX-Körper.
- Eingebaute Schnipsel sind fest; Änderungen nur über Klonen → eigener Schnipsel.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Kein Statusleisten-Eintrag.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Math Snippets:** Panel with category filter, search and list; clicking a row inserts the snippet.
- **Insert last snippet:** Re-inserts the last-used snippet at the cursor or selection.
- **Insert fraction:** Quick command for `\frac{a}{b}` (respects “Prefer display”).
- **Built-in categories** (not deletable; clone to edit): Algebra, Analysis, Linear, Misc.
- **Custom snippets** via prompts: create, edit, delete.
- **Prefer display:** Panel checkbox — when on, inserts always use `$$…$$`; otherwise the snippet’s `wrap` applies.

### Wrap rules

| `wrap` / setting | Result |
| --- | --- |
| `inline` | `$body$` |
| `display` | `$$\nbody\n$$` |
| Prefer display = on | always display, regardless of snippet |

**No** automatic `editor.format('math')` in v1. **No** KaTeX / formula preview in the panel.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Math Snippets*
   - *Insert last snippet*
   - *Insert fraction*
2. In the panel: pick a category, optionally search, click a row → insert.
3. Custom snippets: **New**; built-ins: **Clone**; custom only: **Edit** / **Delete**.
4. With a selection, insert replaces it; otherwise text is inserted at the cursor (`replaceSelection` / `insert`).

### Storage

Key `data`:

```json
{
  "custom": [
    {
      "id": "…",
      "category": "algebra",
      "title_de": "…",
      "title_en": "…",
      "body": "\\frac{a}{b}",
      "wrap": "inline"
    }
  ],
  "settings": { "lastId": "…", "preferDisplay": false }
}
```

Built-in snippets live in code, not in storage.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, prompts, confirms, toasts |
| `editor` | Insert/replace text at cursor/selection |
| `storage` | Persist custom snippets and settings |

**No** `network`, **no** `notes:read`/`notes:write`, **no** `clipboard`.

### Limits

- Only in an open Markdown editor; ink/PDF → toast “No Markdown editor”.
- No network, no vault writes – custom snippets live only in add-on storage (FaNotes limit: 1 MB / 500 keys).
- No rendered formula preview; list detail shows the raw LaTeX body.
- Built-ins are fixed; change them only via Clone → custom snippet.
- Command titles follow the UI language at start; reload the add-on after a language switch.
- No status-bar item.

### Version

1.0.0 – initial release.

---

## Lizenz / License

MIT
