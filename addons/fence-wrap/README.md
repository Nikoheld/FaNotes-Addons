# Codeblock-Umbruch / Fence Wrap

Umhüllt die **Editor-Auswahl** mit einem **Markdown-Codeblock** (` ``` `) und optionaler Sprache.

Wraps the **editor selection** in a **Markdown code fence** (` ``` `) with an optional language tag.

> **Abgrenzung:** `math-snippets` = Formeln (`$…$` / `$$…$$`); `callout-inserter` = Callouts (`> [!info]`); `template-library` = freie Vorlagen. **Hier** = ` ``` ` Fence um die Selection.
>
> **Distinction:** `math-snippets` = formulas; `callout-inserter` = callouts; `template-library` = freeform templates. **This** = wrap the selection in a ` ``` ` fence.

---

## Deutsch

### Was es tut

- **Umhüllen:** Liest `editor.getSelection()`; leer → Info-Toast; startet (nach Trim) bereits mit ` ``` ` → Info-Toast und **kein Double-Wrap**; sonst ` ```lang\nbody\n``` ` (Sprache leer → ` ```\nbody\n``` `), dann `editor.replaceSelection`.
- **wrap-lang:** Fragt die Sprache per Prompt ab (Soft sanitize), speichert sie in den Einstellungen und umhüllt.
- **trimEdges Soft:** Entfernt führende/trailing **Zeilenumbrüche** der Auswahl vor dem Wrap (nicht allen Whitespace).
- **Sprache Soft:** Panel-Eingabe; leer = Fence ohne Sprache; Sanitize `/^[a-zA-Z0-9_+#.-]{0,32}$/` – sonst Filter Soft auf erlaubte Zeichen (max. 32) oder leer.
- **Panel** (`fence`): Sprache-Eingabe, Checkbox `trimEdges`; Button **Umhüllen** (einzige Primäraktion).
- **Activate:** nur Einstellungen laden — kein Vault, kein Netzwerk, kein Notes-Zugriff.

### Bedienung

1. Text im Markdown-Editor markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Auswahl als Codeblock umhüllen*
   - *Auswahl als Codeblock mit Sprache*
   - *Codeblock-Umbruch öffnen* → Panel
3. Im Panel: Sprache / trimEdges setzen → **Umhüllen**.

### Einstellungen (`storage`)

Schlüssel `settings`:

```json
{
  "language": "",
  "defaultLanguage": "",
  "trimEdges": true
}
```

- `language`: Panel-/zuletzt genutzte Sprache (sanitize Soft)
- `defaultLanguage`: Fallback, wenn `language` leer ist
- `trimEdges`: führende/trailing Newlines vor dem Wrap entfernen (Standard: an)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Prompt, Toasts |
| `editor` | Auswahl lesen / ersetzen |
| `storage` | Einstellungen |

**Kein** `notes:read`/`notes:write`, **kein** `vault:write`, **kein** `network`, **kein** `clipboard`.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **math-snippets** | LaTeX-Formeln `$…$` / `$$…$$` |
| **callout-inserter** | Obsidian-Callouts `> [!info]` … |
| **template-library** | Freie Textvorlagen mit CRUD |
| **fence-wrap** (dieses) | Markdown-` ``` `-Fence um die Selection |

### Grenzen

- Nur **aktiver Markdown-Editor** — keine Vault-Suche, kein Bulk-Wrap.
- Bereits mit ` ``` ` beginnende Auswahl → Info-Toast, keine Änderung.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Umhüllen*.
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **math-snippets** | LaTeX formulas `$…$` / `$$…$$` |
| **callout-inserter** | Obsidian callouts `> [!info]` … |
| **template-library** | Freeform text templates with CRUD |
| **fence-wrap** (this) | Wrap selection in a Markdown ` ``` ` fence |

### What it does

- **Wrap:** Reads `editor.getSelection()`; empty → info toast; already starts (after trim) with ` ``` ` → info toast and **no double-wrap**; else ` ```lang\nbody\n``` ` (empty language → ` ```\nbody\n``` `), then `editor.replaceSelection`.
- **wrap-lang:** Prompts for a language (Soft sanitize), stores it in settings, and wraps.
- **trimEdges Soft:** Strips leading/trailing **newlines** from the selection before wrap (not all whitespace).
- **Language Soft:** Panel input; empty = plain fence; sanitize `/^[a-zA-Z0-9_+#.-]{0,32}$/` — otherwise filter Soft to allowed characters (max 32) or empty.
- **Panel** (`fence`): language input, `trimEdges` checkbox; **Wrap** button (only primary).
- **Activate:** load settings only — no vault, no network, no notes access.

### Usage

1. Select text in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Wrap selection as code fence*
   - *Wrap selection as code fence with language*
   - *Open Fence Wrap* → panel
3. In the panel: set language / trimEdges → **Wrap**.

### Settings (`storage`)

Key `settings`:

```json
{
  "language": "",
  "defaultLanguage": "",
  "trimEdges": true
}
```

- `language`: panel / last-used language (Soft sanitize)
- `defaultLanguage`: fallback when `language` is empty
- `trimEdges`: strip leading/trailing newlines before wrap (default: on)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, prompt, toasts |
| `editor` | Read / replace selection |
| `storage` | Settings |

**No** `notes:read`/`notes:write`, **no** `vault:write`, **no** `network`, **no** `clipboard`.

### Limits

- **Active Markdown editor** only — no vault search, no bulk wrap.
- Selection already starting with ` ``` ` → info toast, no change.
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Wrap*.
- Command titles follow the UI language at load; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
