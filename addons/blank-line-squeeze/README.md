# Leerzeilen-Druck / Blank Line Squeeze

Reduziert **mehrfache Leerzeilen** in der **Editor-Auswahl** auf höchstens eine (konfigurierbar Soft).

Collapses **multiple blank lines** in the **editor selection** to at most one (configurable Soft).

> **Abgrenzung:** `strip-markdown` = MD-Syntax entfernen; `join-split-lines` = Join/Split inkl. Trim. **Hier** = nur Blank-Line-Collapse.
>
> **Distinction:** `strip-markdown` = strip MD markup; `join-split-lines` = join/split incl. trim. **This** = blank-line collapse only.

---

## Deutsch

### Was es tut

- **Zusammenziehen Soft:** Liest `editor.getSelection()`; leer (keine Selection) → Info-Toast. Soft-Algorithmus: Zeilen wandern, Leerzeile = `trim===''`; Blank nur emittieren solange Streak ≤ `maxConsecutive`.
- **maxConsecutive Soft:** 0–3 (Default Soft: `1`). `0` = alle Leerzeilen entfernen Soft.
- **trimTrailing Soft:** optional trailing Spaces/Tabs pro Zeile entfernen Soft (Default Soft: aus).
- **scope Soft:** v1 nur `selection` (keine ganze Datei ohne Auswahl).
- **Panel** (`squeeze`): Eingabe `maxConsecutive`, Checkbox `trimTrailing`; Button **Zusammenziehen** (primär).
- **Activate:** nur Einstellungen laden — kein Vault, kein Netzwerk, kein Notes-Zugriff.

### Soft-Algorithmus

1. Selection in Zeilen splitten (`\n`).
2. Optional Soft: jede Zeile rtrim (`spaces`/`tabs` am Ende).
3. Leerzeile Soft: `line.trim() === ''`.
4. Streak von Leerzeilen mitzählen; Blank nur emittieren, solange `streak <= maxConsecutive`.
5. Nicht-Leerzeilen zurücksetzen den Streak und werden immer übernommen.
6. Ergebnis mit `\n` joinen → `editor.replaceSelection`.

### Bedienung

1. Text im Markdown-Editor markieren (auch nur Leerzeilen Soft).
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Leerzeilen zusammenziehen*
   - *Leerzeilen-Druck öffnen* → Panel
3. Im Panel: `maxConsecutive` / `trimTrailing` setzen → **Zusammenziehen**.

Ohne Auswahl → Info-Toast. Ohne Markdown-Editor → Fehler-Toast. Nichts zu ändern → Info-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "maxConsecutive": 1,
  "trimTrailing": false,
  "scope": "selection"
}
```

- `maxConsecutive`: max. aufeinanderfolgende Leerzeilen (0–3 Soft; Default Soft: `1`; `0` = alle Blanks weg Soft).
- `trimTrailing`: trailing Spaces/Tabs pro Zeile entfernen Soft (Default Soft: `false`).
- `scope`: v1 fest `selection` Soft.

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
| **strip-markdown** | MD-Syntax entfernen Soft – hier nur Leerzeilen-Collapse |
| **join-split-lines** | Join/Split inkl. Trim Soft – hier kein Join/Split, nur Blank-Streaks |
| **line-tools** | Sortieren / Deduplizieren Soft – hier kein Sort |
| **blank-line-squeeze** (dieses) | Mehrfache Leerzeilen auf höchstens N zusammenziehen |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection (scope v1 Soft).
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Soft: Leerzeile = `trim===''` (Zeilen nur aus Spaces/Tabs gelten Soft als blank).
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Zusammenziehen*.
- Kein Netzwerk, kein Vault – Einstellungen leben nur im Add-on-Speicher.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **strip-markdown** | Strip MD markup Soft — here blank-line collapse only |
| **join-split-lines** | Join/split incl. trim Soft — here no join/split, only blank streaks |
| **line-tools** | Sort / dedupe Soft — here no sort |
| **blank-line-squeeze** (this) | Collapse consecutive blank lines to at most N |

### What it does

- **Squeeze Soft:** Reads `editor.getSelection()`; empty (no selection) → info toast. Soft algorithm: walk lines; blank = `trim===''`; emit blank only while streak ≤ `maxConsecutive`.
- **maxConsecutive Soft:** 0–3 (Soft default: `1`). `0` = remove all blank lines Soft.
- **trimTrailing Soft:** optionally also rtrim spaces/tabs on each line Soft (Soft default: off).
- **scope Soft:** v1 `selection` only (never the whole file without a selection).
- **Panel** (`squeeze`): `maxConsecutive` input, `trimTrailing` checkbox; **Squeeze** button (primary).
- **Activate:** load settings only — no vault, no network, no notes access.

### Soft algorithm

1. Split selection on `\n`.
2. Optional Soft: rtrim each line (trailing spaces/tabs).
3. Blank Soft: `line.trim() === ''`.
4. Count blank streak; emit blank only while `streak <= maxConsecutive`.
5. Non-blank lines reset the streak and are always kept.
6. Join with `\n` → `editor.replaceSelection`.

### Usage

1. Select text in the Markdown editor (blank-only selection Soft is fine).
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Squeeze blank lines*
   - *Open Blank Line Squeeze* → panel
3. In the panel: set `maxConsecutive` / `trimTrailing` → **Squeeze**.

No selection → info toast. No Markdown editor → error toast. Nothing to change → info toast.

### Storage

Key `settings`:

```json
{
  "maxConsecutive": 1,
  "trimTrailing": false,
  "scope": "selection"
}
```

- `maxConsecutive`: max consecutive blank lines (0–3 Soft; Soft default: `1`; `0` = drop all blanks Soft).
- `trimTrailing`: also trim trailing spaces/tabs per line Soft (Soft default: `false`).
- `scope`: fixed `selection` in v1 Soft.

`onActivate` only loads settings — no vault scan.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Read and replace selection (`getSelection` / `replaceSelection`) |
| `storage` | Settings |

**No** `notes:read`/`notes:write`, **no** `vault:write`, **no** `network`, **no** `clipboard`.

### Limits

- Selection only; never rewrites the whole file without a selection (scope v1 Soft).
- Markdown editor only; pen mode/PDF → error toast.
- Soft: blank line = `trim===''` (space/tab-only lines count Soft as blank).
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Squeeze*.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
