# Zeilen verbinden/trennen / Join Split Lines

Verbindet **markierte Zeilen** mit einem Trenner oder trennt die **Auswahl** an einem wörtlichen Trennmuster in Zeilen.

Joins **selected lines** with a separator, or splits the **selection** on a literal pattern into lines.

> **Abgrenzung:** `line-tools` = Sortieren / Deduplizieren / Umdrehen; `list-convert` = Listen-Prefix. **Hier** = Join mit Separator / Split zu Zeilen.
>
> **Distinction:** `line-tools` = sort / dedupe / reverse; `list-convert` = list prefixes. **This** = join with separator / split into lines.

---

## Deutsch

### Was es tut

- **Verbinden (Join):** Liest die Selection-Zeilen; bei `trimParts` werden Zeilen getrimmt und leere übersprungen; danach mit `separator` verbunden. Bereits eine Zeile nach Filter → Info-Toast, nichts geändert.
- **Trennen (Split):** Teilt die Auswahl am wörtlichen `splitPat` (kein Regex in v1) und fügt die Teile mit Zeilenumbrüchen zusammen; bei `trimParts` werden Teile getrimmt. Leeres Trennmuster → Fehler-Toast.
- **Panel** (`js`): Eingaben `separator` und `splitPat`, Checkbox `trimParts`; Buttons **Verbinden** (primär) und **Trennen** (sekundär).
- **Activate:** nur Einstellungen laden — kein Vault, kein Netzwerk, kein Notes-Zugriff.

### Bedienung

1. Im Markdown-Editor Text bzw. Zeilen markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Zeilen verbinden*
   - *Auswahl trennen*
   - *Zeilen verbinden/trennen öffnen* → Panel
3. Im Panel: Trenner / Trennmuster / trimParts setzen → **Verbinden** oder **Trennen**.

Ohne Auswahl (leer / nur Whitespace) → Info-Toast. Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "separator": ", ",
  "splitPat": ",",
  "trimParts": true
}
```

- `separator`: Zeichenkette zwischen verbundenen Zeilen (Default Soft: `', '`).
- `splitPat`: wörtliches Trennmuster für Split (Default Soft: `','`; leer → Fehler-Toast).
- `trimParts`: beim Join leere Zeilen überspringen (nach Trim); beim Split Teile trimmen (Default Soft: `true`).

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
| **line-tools** | Sortieren / Deduplizieren / Umdrehen – hier Join mit Separator / Split zu Zeilen |
| **list-convert** | Listen-Prefix (Aufzählung, Nummerierung, Aufgaben) – hier kein Prefix-Umwandler |
| **join-split-lines** (dieses) | Zeilen verbinden oder Auswahl am Trenner in Zeilen trennen |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection.
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Soft: `splitPat` ist wörtlich (kein Regex in v1).
- Toasts nur `info` | `success` | `error`.
- Kein Netzwerk, kein Vault – Einstellungen leben nur im Add-on-Speicher.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **line-tools** | Sort / dedupe / reverse — here join with separator / split into lines |
| **list-convert** | List prefixes (bullets, numbers, tasks) — here no prefix conversion |
| **join-split-lines** (this) | Join lines or split the selection on a separator into lines |

### What it does

- **Join:** Reads selection lines; when `trimParts` is on, trims lines and skips empties; then joins with `separator`. Already a single line after filter → info toast, no change.
- **Split:** Splits the selection on literal `splitPat` (no regex in v1) and joins parts with newlines; when `trimParts` is on, trims each part. Empty pattern → error toast.
- **Panel** (`js`): `separator` and `splitPat` inputs, `trimParts` checkbox; **Join** (primary) and **Split** (secondary) buttons.
- **Activate:** load settings only — no vault, no network, no notes access.

### Usage

1. Select text or lines in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Join lines*
   - *Split selection*
   - *Open Join Split Lines* → panel
3. In the panel: set separator / split pattern / trimParts → **Join** or **Split**.

No selection (empty / whitespace only) → info toast. No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "separator": ", ",
  "splitPat": ",",
  "trimParts": true
}
```

- `separator`: string between joined lines (Soft default: `', '`).
- `splitPat`: literal split pattern (Soft default: `','`; empty → error toast).
- `trimParts`: on join, skip empty lines after trim; on split, trim parts (Soft default: `true`).

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

- Selection only; never rewrites the whole file without a selection.
- Markdown editor only; pen mode/PDF → error toast.
- Soft: `splitPat` is literal (no regex in v1).
- Toasts only `info` | `success` | `error`.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
