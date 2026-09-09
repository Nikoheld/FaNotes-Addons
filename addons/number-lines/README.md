# Zeilen nummerieren / Number Lines

Nummeriert **markierte Zeilen** mit laufendem Präfix (`1. 2. 3.` oder `1) 2) 3)`).

Numbers **selected lines** with a running prefix (`1. 2. 3.` or `1) 2) 3)`).

> **Abgrenzung:** `list-convert` = Bullet/Task/Numbered-Listenstil mit Strip; `line-tools` = Sortieren. **Hier** = einfache Zähler-Präfixe ohne Listen-Strip-Logik (optional leere Zeilen überspringen).
>
> **Distinction:** `list-convert` = bullet/task/numbered list style with strip; `line-tools` = sort. **This** = simple counter prefixes without list-strip logic (optional skip empty).

---

## Deutsch

### Was es tut

- **Zeilen nummerieren:** Liest die Selection-Zeilen; vergibt ab `start` laufende Präfixe im gewählten Format (`dot` → `N. `, `paren` → `N) `). Bei `skipEmpty` bleiben leere Zeilen leer und zählen nicht mit.
- **Panel** (`num`): Eingabe Startnummer, Format-Auswahl, Checkbox „Leere Zeilen überspringen“, Button **Nummerieren** (primär).
- **Activate:** nur Einstellungen laden — kein Vault, kein Netzwerk, kein Notes-Zugriff.

### Bedienung

1. Im Markdown-Editor Zeilen markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Zeilen nummerieren*
   - *Zeilen nummerieren öffnen* → Panel
3. Im Panel: Startnummer / Format / skipEmpty setzen → **Nummerieren**.

Ohne Auswahl (leer / nur Whitespace) → Info-Toast „Bitte Zeilen markieren“. Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "start": 1,
  "skipEmpty": true,
  "format": "dot"
}
```

- `start`: Startnummer, Ganzzahl 0–9999 (Default: `1`).
- `skipEmpty`: leere Zeilen (nach Trim) überspringen und nicht mitzählen (Default: `true`).
- `format`: `dot` → `N. ` | `paren` → `N) ` (Default: `dot`).

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
| **list-convert** | Bullet/Task/Numbered-Listenstil mit Prefix-Strip – hier nur einfache Zähler-Präfixe ohne Strip |
| **line-tools** | Sortieren / Deduplizieren / Umdrehen – hier Nummerieren mit Präfix |
| **join-split-lines** | Zeilen verbinden oder Auswahl am Trenner trennen – hier kein Join/Split |
| **number-lines** (dieses) | Laufende Zähler-Präfixe auf Selection-Zeilen |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection.
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Kein Listen-Prefix-Strip (bestehende `- `, `1. ` usw. bleiben stehen und werden mitgezählt als Inhalt).
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
| **list-convert** | Bullet/task/numbered list style with prefix strip — here only simple counter prefixes without strip |
| **line-tools** | Sort / dedupe / reverse — here numbering with a prefix |
| **join-split-lines** | Join lines or split selection on a separator — here no join/split |
| **number-lines** (this) | Running counter prefixes on selected lines |

### What it does

- **Number lines:** Reads selection lines; assigns running prefixes from `start` in the chosen format (`dot` → `N. `, `paren` → `N) `). When `skipEmpty` is on, empty lines stay empty and do not advance the counter.
- **Panel** (`num`): start-number input, format select, “Skip empty lines” checkbox, **Number** button (primary).
- **Activate:** load settings only — no vault, no network, no notes access.

### Usage

1. Select lines in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Number lines*
   - *Open Number Lines* → panel
3. In the panel: set start / format / skipEmpty → **Number**.

No selection (empty / whitespace only) → info toast "Please select lines". No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "start": 1,
  "skipEmpty": true,
  "format": "dot"
}
```

- `start`: start number, integer 0–9999 (default: `1`).
- `skipEmpty`: skip empty lines (after trim) and do not count them (default: `true`).
- `format`: `dot` → `N. ` | `paren` → `N) ` (default: `dot`).

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
- No list-prefix strip (existing `- `, `1. `, etc. stay and are treated as content).
- Toasts only `info` | `success` | `error`.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
