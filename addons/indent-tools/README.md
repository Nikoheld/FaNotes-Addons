# Einrücken / Indent Tools

Rückt **markierte Zeilen** um Spaces (oder Tabs Soft) **ein oder aus** (Leading-Spaces ±N).

Indents or outdents **selected lines** by spaces (or tabs Soft) (leading spaces ±N).

> **Abgrenzung:** `line-tools` = Sortieren / Deduplizieren; `list-convert` = Listen-Prefix; `heading-shift` = #-Stufe. **Hier** = Leading-Spaces ±N.
>
> **Distinction:** `line-tools` = sort / dedupe; `list-convert` = list prefixes; `heading-shift` = heading level. **This** = leading spaces ±N.

---

## Deutsch

### Was es tut

- **Einrücken:** Jede Zeile der Selection erhält vorne die Indent-Einheit Soft: bei `useTabs` ein Tab (`\t`), sonst `width` Spaces (1–8; Default Soft: 2).
- **Ausrücken:** Am Zeilenanfang Soft einen Tab entfernen, sonst bis zu `width` Spaces.
- **Panel** (`indent`): Eingabe `width`, Checkbox `useTabs`; Buttons **Einrücken** (primär) und **Ausrücken** (sekundär).
- **Activate:** nur Einstellungen laden — kein Vault, kein Netzwerk, kein Notes-Zugriff.
- Ergebnis Soft: `replaceSelection` der zusammengefügten Zeilen.

### Bedienung

1. Im Markdown-Editor Zeilen markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Zeilen einrücken*
   - *Zeilen ausrücken*
   - *Einrücken öffnen* → Panel
3. Im Panel: Breite / Tabs setzen → **Einrücken** oder **Ausrücken**.

Ohne Auswahl (leer / nur Whitespace) → Fehler-Toast „Bitte Zeilen markieren“ (v1: keine ganze Datei).
Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "width": 2,
  "useTabs": false
}
```

- `width`: Soft 1..8 (Default Soft: `2`). Anzahl Spaces beim Einrücken; beim Ausrücken Soft max. zu entfernende Spaces. Bei `useTabs` Soft beim Einrücken ignoriert (genau 1 Tab).
- `useTabs`: Soft Default `false`. `true` → beim Einrücken/Ausrücken Tabs statt Spaces (Einrücken Soft: 1 Tab).

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
| **line-tools** | Sortieren / Deduplizieren / Umdrehen – hier Leading-Spaces ±N |
| **list-convert** | Listen-Prefix (Aufzählung, Nummerierung, Aufgaben) – hier kein Prefix-Umwandler |
| **heading-shift** | `#`-Stufe der ATX-Zeilen – hier Einrückung (Spaces/Tabs) |
| **indent-tools** (dieses) | Markierte Zeilen um Spaces/Tabs ein- oder ausrücken |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection (v1).
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Soft: `width` Soft 1–8; `useTabs` Soft → 1 Tab statt Spaces.
- Soft Ausrücken: ein führendes Tab oder bis zu `width` Spaces am Anfang.
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
| **line-tools** | Sort / dedupe / reverse — here leading spaces ±N |
| **list-convert** | List prefixes (bullets, numbers, tasks) — here no prefix conversion |
| **heading-shift** | ATX heading `#` level — here indentation (spaces/tabs) |
| **indent-tools** (this) | Indent or outdent selected lines by spaces/tabs |

### What it does

- **Indent:** Prefixes each selected line with Soft the indent unit: when `useTabs` is on, one tab (`\t`); otherwise `width` spaces (1–8; Soft default: 2).
- **Outdent:** Soft removes one leading tab, else up to `width` leading spaces.
- **Panel** (`indent`): `width` input, `useTabs` checkbox; **Indent** (primary) and **Outdent** (secondary) buttons.
- **Activate:** load settings only — no vault, no network, no notes access.
- Result Soft: `replaceSelection` of the joined lines.

### Usage

1. Select lines in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Indent lines*
   - *Outdent lines*
   - *Open Indent Tools* → panel
3. In the panel: set width / tabs → **Indent** or **Outdent**.

No selection (empty / whitespace only) → error toast "Please select lines" (v1: not whole-file).
No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "width": 2,
  "useTabs": false
}
```

- `width`: Soft 1..8 (Soft default: `2`). Space count when indenting; Soft max spaces removed when outdenting. Soft ignored for indent insert when `useTabs` (exactly 1 tab).
- `useTabs`: Soft default `false`. `true` → tabs instead of spaces (Soft indent: 1 tab).

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

- Selection only; never rewrites the whole file without a selection (v1).
- Markdown editor only; pen mode/PDF → error toast.
- Soft: `width` Soft 1–8; `useTabs` Soft → 1 tab instead of spaces.
- Soft outdent: one leading tab or up to `width` spaces at the start.
- Toasts only `info` | `success` | `error`.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
