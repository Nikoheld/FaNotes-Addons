# Auswahl → Notiz / Selection to Note

Erstellt aus der **Editor-Auswahl** eine **neue Notiz** und ersetzt die Auswahl optional durch einen **Wikilink**.

Creates a **new note** from the **editor selection** and optionally replaces the selection with a **wikilink**.

> **Abgrenzung:** `note-splitter` = ganze Notiz an Überschriften teilen; `quote-collector` = Zitate sammeln (Speicher/Export); `scratchpad` = Entwurf **außerhalb** des Vaults. **Hier** = Extrakt der Auswahl → neue Vault-Notiz (+ optionaler Wikilink).
>
> **Distinction:** `note-splitter` = split the whole note at headings; `quote-collector` = collect quotes (storage/export); `scratchpad` = draft **outside** the vault. **This** = extract selection → new vault note (+ optional wikilink).

---

## Deutsch

### Was es tut

- **Auswahl → Notiz:** Liest `editor.getSelection()`; leere Auswahl → Toast; sonst Titel bestimmen, `notes.create`, optional `editor.replaceSelection('[[…]]')`.
- **Auswahl → Notiz und öffnen:** Wie oben, öffnet die neue Notiz danach (`forceOpen`).
- **Panel** (`extract`): Ordner, Wikilink-Checkbox, Titelquelle, „danach öffnen“; Button **Extrahieren** (einzige Primäraktion).
- **Activate:** nur Einstellungen laden — kein Vault-Scan, kein Editor-Zugriff.

### Titelquellen (`titleFrom`)

| Wert | Verhalten |
| --- | --- |
| `prompt` | `ui.prompt` mit Default = erste Zeile (sanitized) |
| `first-line` | Erste nicht-leere Zeile, sanitized |
| `heading` | Führende `#` entfernen, dann sanitized |

Dateiname: unsichere Zeichen entfernt, max. `maxTitle` (Standard 80), Fallback `Extract-N`. Wikilink Soft: bei problematischen Wiki-Zeichen → sanitized Basename.

### Create Soft

Kein `vault:write`. Schlägt `notes.create` fehl (z. B. fehlender Ordner) → Toast, Ordner manuell anlegen. Auswahl bleibt unverändert.

### Bedienung

1. Text im Markdown-Editor markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Auswahl → Notiz*
   - *Auswahl → Notiz und öffnen*
   - *Auswahl → Notiz öffnen* / *…-Einstellungen öffnen* → Panel
3. Im Panel: Optionen setzen → **Extrahieren**.

### Einstellungen (`storage`)

Schlüssel `settings`:

```json
{
  "folder": "",
  "replaceWithLink": true,
  "titleFrom": "prompt",
  "maxTitle": 80,
  "openAfter": false
}
```

- `folder`: leer = Vault-Wurzel; kein `..`
- `replaceWithLink`: Auswahl durch `[[Titel]]` ersetzen
- `titleFrom`: `prompt` | `first-line` | `heading`
- `maxTitle`: max. Dateiname-Länge
- `openAfter`: nach Create `notes.open` (Soft; `extract-open` erzwingt Öffnen)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Prompt, Toasts, `notes.open` |
| `editor` | Auswahl lesen / durch Wikilink ersetzen |
| `notes:read` | (API-Konsistenz; kein Scan) |
| `notes:write` | `notes.create` |
| `storage` | Einstellungen |

**Kein** `vault:write`, **kein** `network`, **kein** `clipboard`.

### Grenzen

- Nur **aktiver Markdown-Editor** — keine Vault-Suche, kein Bulk.
- Ohne `vault:write` werden Ordner nicht angelegt.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Extrahieren*.
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **note-splitter** | Split the **whole note** at headings into new notes |
| **quote-collector** | Collect quotes in add-on storage / export |
| **scratchpad** | Draft text **outside** the vault |
| **selection-to-note** (this) | **Extract selection** → new vault note (+ optional wikilink) |

### What it does

- **Selection to Note:** Reads `editor.getSelection()`; empty → toast; else resolve title, `notes.create`, optional `editor.replaceSelection('[[…]]')`.
- **Selection to Note and open:** Same, then opens the new note (`forceOpen`).
- **Panel** (`extract`): folder, replace-with-link checkbox, title source, open-after Soft; **Extract** button (only primary).
- **Activate:** load settings only — no vault scan, no editor access.

### Title sources (`titleFrom`)

| Value | Behavior |
| --- | --- |
| `prompt` | `ui.prompt` with default = first line (sanitized) |
| `first-line` | First non-empty line, sanitized |
| `heading` | Strip leading `#`, then sanitized |

File name: unsafe characters stripped, max `maxTitle` (default 80), fallback `Extract-N`. Wikilink Soft: bad wiki characters → sanitized basename.

### Create Soft

No `vault:write`. If `notes.create` fails (e.g. missing folder) → toast asking you to create the folder manually. Selection stays unchanged.

### Usage

1. Select text in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Selection to Note*
   - *Selection to Note and open*
   - *Open Selection to Note* / *Open Selection to Note settings* → panel
3. In the panel: set options → **Extract**.

### Settings (`storage`)

Key `settings`:

```json
{
  "folder": "",
  "replaceWithLink": true,
  "titleFrom": "prompt",
  "maxTitle": 80,
  "openAfter": false
}
```

- `folder`: empty = vault root; no `..`
- `replaceWithLink`: replace selection with `[[title]]`
- `titleFrom`: `prompt` | `first-line` | `heading`
- `maxTitle`: max file name length
- `openAfter`: `notes.open` after create (Soft; `extract-open` forces open)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, prompt, toasts, `notes.open` |
| `editor` | Read selection / replace with wikilink |
| `notes:read` | (API consistency; no scan) |
| `notes:write` | `notes.create` |
| `storage` | Settings |

**No** `vault:write`, **no** `network`, **no** `clipboard`.

### Limits

- **Active Markdown editor** only — no vault search, no bulk.
- Without `vault:write`, folders are not created.
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Extract*.
- Command titles follow the UI language at load; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
