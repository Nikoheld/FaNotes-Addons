# Markdown entfernen / Strip Markdown

Entfernt **gängige Markdown-Markierung** aus der **Editor-Auswahl** (optional nur kopieren).

Strips **common Markdown markup** from the **editor selection** (optionally copy only).

> **Abgrenzung:** `find-replace-note` = freies Suchen/Ersetzen; `case-tools` / `line-tools` = andere Transforms. **Hier** = gezieltes MD-Stripping (best-effort Soft, kein vollständiger Parser).
>
> **Distinction:** `find-replace-note` = free find/replace; `case-tools` / `line-tools` = other transforms. **This** = targeted MD stripping (best-effort Soft, not a full parser).

---

## Deutsch

### Was es tut

- **Bereinigen Soft:** Liest `editor.getSelection()`; leer → Info-Toast. Soft-Strip in fester Reihenfolge (siehe unten).
- **writeBack Soft:** bei aktiv → `editor.replaceSelection(result)`.
- **copyAlso Soft:** bei aktiv → `clipboard.writeText(result)`.
- **strip-copy:** erzwingt nur Kopieren (`writeBack=false`, `copyAlso=true`).
- **Panel** (`strip`): Checkboxen `writeBack` / `copyAlso`; Button **Bereinigen** (einzige Primäraktion).
- **Activate:** nur Einstellungen laden — kein Vault, kein Netzwerk, kein Notes-Zugriff.

### Soft-Strip-Reihenfolge (best-effort)

1. Fences `` ```…``` `` → innerer Text Soft (mehrzeilig Soft)
2. Bilder `![alt](url)` → `alt` oder sonst `url`
3. Links `[text](url)` → `text`
4. Wikilinks `[[t|a]]` → `a`; `[[t]]` → `t`
5. Fett/Kursiv/Code/Durchgestrichen Soft (`**` `__` `*` `_` `` ` `` `~~`)
6. Überschriften-Hashes am Zeilenanfang Soft
7. Listen-/Task-Präfixe Soft
8. Blockquote `>` Soft

Kein vollständiger Markdown-Parser — Randfälle bleiben Soft möglich.

### Bedienung

1. Text im Markdown-Editor markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Markdown aus Auswahl entfernen*
   - *Markdown entfernen und kopieren*
   - *Markdown entfernen öffnen* → Panel
3. Im Panel: Checkboxen setzen → **Bereinigen**.

Wenn weder Zurückschreiben noch Kopieren aktiv → Info-Toast. Ohne Editor / bei Replace-Fehler → Fehler-Toast.

### Einstellungen (`storage`)

Schlüssel `settings`:

```json
{
  "writeBack": true,
  "copyAlso": true
}
```

- `writeBack`: Auswahl durch bereinigten Text ersetzen (Standard: an)
- `copyAlso`: Ergebnis zusätzlich in die Zwischenablage (Standard: an)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Toasts |
| `editor` | Auswahl lesen / ersetzen |
| `storage` | Einstellungen |
| `clipboard` | `clipboard.writeText` |

**Kein** `notes:read`/`notes:write`, **kein** `vault:write`, **kein** `network`.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **find-replace-note** | Freies Suchen/Ersetzen in der Notiz |
| **case-tools** | Groß-/Kleinschreibung der Selection |
| **line-tools** | Zeilen sortieren / dedupen / … |
| **strip-markdown** (dieses) | Gezieltes Soft-Strip von Markdown-Markierung |

### Grenzen

- Nur **aktiver Markdown-Editor** — keine Vault-Suche, kein Bulk.
- Best-effort Soft — kein vollständiger Parser; verschachtelte/exotische Markdown-Formen können Soft unvollständig bleiben.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Bereinigen*.
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **find-replace-note** | Free find/replace in the note |
| **case-tools** | Letter case of the selection |
| **line-tools** | Sort / dedupe / … lines |
| **strip-markdown** (this) | Targeted Soft strip of Markdown markup |

### What it does

- **Strip Soft:** Reads `editor.getSelection()`; empty → info toast. Soft-strips in fixed order (see below).
- **writeBack Soft:** when on → `editor.replaceSelection(result)`.
- **copyAlso Soft:** when on → `clipboard.writeText(result)`.
- **strip-copy:** forces copy only (`writeBack=false`, `copyAlso=true`).
- **Panel** (`strip`): `writeBack` / `copyAlso` checkboxes; **Strip** button (only primary).
- **Activate:** load settings only — no vault, no network, no notes access.

### Soft strip order (best-effort)

1. Fences `` ```…``` `` → inner text Soft (multiline Soft)
2. Images `![alt](url)` → `alt` or else `url`
3. Links `[text](url)` → `text`
4. Wikilinks `[[t|a]]` → `a`; `[[t]]` → `t`
5. Bold/italic/code/strike Soft (`**` `__` `*` `_` `` ` `` `~~`)
6. Heading hashes at line start Soft
7. List / task prefixes Soft
8. Blockquote `>` Soft

Not a full Markdown parser — edge cases may remain Soft.

### Usage

1. Select text in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Strip Markdown from selection*
   - *Strip Markdown and copy*
   - *Open Strip Markdown* → panel
3. In the panel: set checkboxes → **Strip**.

If neither write-back nor copy is enabled → info toast. No editor / replace failure → error toast.

### Settings (`storage`)

Key `settings`:

```json
{
  "writeBack": true,
  "copyAlso": true
}
```

- `writeBack`: replace selection with stripped text (default: on)
- `copyAlso`: also copy result to the clipboard (default: on)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, toasts |
| `editor` | Read / replace selection |
| `storage` | Settings |
| `clipboard` | `clipboard.writeText` |

**No** `notes:read`/`notes:write`, **no** `vault:write`, **no** `network`.

### Limits

- **Active Markdown editor** only — no vault search, no bulk.
- Best-effort Soft — not a full parser; nested/exotic Markdown may remain Soft incomplete.
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Strip*.
- Command titles follow the UI language at load; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
