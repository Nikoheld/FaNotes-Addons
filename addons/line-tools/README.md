# Zeilen-Werkzeuge / Line Tools

Sortiert, dedupliziert oder kehrt die **ausgewählten** Editorzeilen um – wirkt nur auf die Selection, nie auf die ganze Datei ohne Markierung.

Sorts, dedupes or reverses the **selected** editor lines — selection-only; never rewrites the whole file without a selection.

---

## Deutsch

### Was es tut

- **Zeilen-Werkzeuge öffnen:** Panel mit A→Z, Z→A, Duplikate weg, Umdrehen und Einstellung für case-sensitives Deduplizieren.
- **A→Z / Z→A:** `localeCompare` auf den markierten Zeilen (Sprache aus App-Sprache bzw. Einstellung `sortLocale`).
- **Duplikate weg:** Behält das erste Vorkommen; optional Groß-/Kleinschreibung beachten.
- **Umdrehen:** Kehrt die Reihenfolge der markierten Zeilen um.

### Bedienung

1. Im Markdown-Editor Zeilen markieren (auch eine einzelne nicht-leere Zeile ist ok).
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Zeilen-Werkzeuge öffnen*
   - *Zeilen A→Z sortieren* / *Zeilen Z→A sortieren*
   - *Zeilen-Duplikate entfernen* / *Zeilen umdrehen*
3. Oder im Panel die entsprechenden Buttons nutzen.

Ohne Auswahl (leer / nur Whitespace) → Info-Toast „Bitte Zeilen markieren“. Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "sortLocale": "auto",
  "caseSensitiveDedupe": false
}
```

- `sortLocale`: `auto` (folgt `fanotes.app.language`: de→`de`, en→`en`, sonst Runtime-Default), oder fest `de` / `en`.
- `caseSensitiveDedupe`: bei `false` werden Zeilen für den Vergleich kleingeschrieben.

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
| **heading-outline** | Struktur/Outline aus Überschriften – hier reine Zeilen-Operationen |
| **template-library** | Freie Textvorlagen mit CRUD – hier kein Einfügen von Snippets |
| **callout-inserter** | Callout-Blöcke einfügen – hier Sortieren/Deduplizieren/Umdrehen der Selection |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection.
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Kein Netzwerk, kein Vault – Einstellungen leben nur im Add-on-Speicher.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Line Tools:** Panel with A→Z, Z→A, Remove duplicates, Reverse, plus a case-sensitive dedupe setting.
- **A→Z / Z→A:** `localeCompare` on the selected lines (locale from app language or `sortLocale`).
- **Remove duplicates:** Keeps the first occurrence; optionally case-sensitive.
- **Reverse:** Reverses the order of the selected lines.

### Usage

1. Select lines in the Markdown editor (a single non-empty line is fine).
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Line Tools*
   - *Sort lines A→Z* / *Sort lines Z→A*
   - *Remove duplicate lines* / *Reverse lines*
3. Or use the panel buttons.

No selection (empty / whitespace only) → info toast “Please select lines”. No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "sortLocale": "auto",
  "caseSensitiveDedupe": false
}
```

- `sortLocale`: `auto` (follows `fanotes.app.language`: de→`de`, en→`en`, otherwise runtime default), or fixed `de` / `en`.
- `caseSensitiveDedupe`: when `false`, lines are lowercased for comparison.

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
| **heading-outline** | Structure/outline from headings — here pure line operations |
| **template-library** | Freeform text templates with CRUD — here no snippet insertion |
| **callout-inserter** | Inserts callout blocks — here sort/dedupe/reverse of the selection |

### Limits

- Selection only; never rewrites the whole file without a selection.
- Markdown editor only; pen mode/PDF → error toast.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
