# Markdown-Link / Markdown Link Wrap

Macht aus der **Editor-Auswahl** einen **Markdown-Link** `[Text](URL)`.

Turns the **editor selection** into a **Markdown link** `[text](url)`.

> **Abgrenzung:** `wikilink-wrap` = Selection als `[[…]]`; `url-collector` = **URLs sammeln** aus Notizen; `path-copier` = **Pfad**/Titel/Wikilink der aktiven Notiz → Clipboard. **Hier** = `[text](url)` Wrap der Selection.
>
> **Distinction:** `wikilink-wrap` = wrap selection as `[[…]]`; `url-collector` = **collect URLs** from notes; `path-copier` = active-note **path**/title/wikilink → clipboard. **This** = `[text](url)` wrap of the selection.

---

## Deutsch

### Was es tut

- **Umhüllen:** Liest `editor.getSelection()`; Trim als Link-Text; leer → Info-Toast; sonst URL auflösen → `[Text](URL)` → `editor.replaceSelection`.
- **URL-Quelle:** `prompt` (Standard) oder `clipboard`. Zwischenablage nur wenn nicht-leer und `http://` / `https://`; sonst Prompt (Platzhalter `https://`).
- **openPromptAlways:** wenn an und Clipboard-URL gültig → Prompt trotzdem (Clipboard als Vorbelegung); wenn aus → Clipboard-URL direkt nutzen.
- **wrap-clipboard:** erzwingt Zwischenablage-Pfad nur für diesen Aufruf (Einstellungen unverändert).
- **URL leer / Abbruch:** keine Änderung, Rückgabe.
- **Panel** (`mdl`): Select `urlSource`, Checkbox `openPromptAlways`; Button **Link erzeugen** (einzige Primäraktion).
- **Activate:** nur Einstellungen laden — kein Vault, kein Editor, kein Netzwerk.

### Bedienung

1. Text im Markdown-Editor markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Auswahl als Markdown-Link umhüllen*
   - *Auswahl als Markdown-Link (Zwischenablage)*
   - *Markdown-Link öffnen* → Panel
3. Im Panel: URL-Quelle / Prompt-Option setzen → **Link erzeugen**.

### Einstellungen (`storage`)

Schlüssel `settings`:

```json
{
  "urlSource": "prompt",
  "openPromptAlways": true
}
```

- `urlSource`: `prompt` | `clipboard` (Standard: `prompt`)
- `openPromptAlways`: bei gültiger Clipboard-URL trotzdem Prompt öffnen (Standard: an)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Prompt, Toasts |
| `editor` | Auswahl lesen / ersetzen |
| `storage` | Einstellungen |
| `clipboard` | Zwischenablage als URL-Quelle (wenn Host `readText` bereitstellt) |

**Kein** `notes:read`/`notes:write`, **kein** `vault:write`, **kein** `network`.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **wikilink-wrap** | Umhüllt als `[[…]]` / Alias (+ optional Notiz anlegen) |
| **url-collector** | Sammelt https-URLs aus Notizen zum Kopieren/Öffnen |
| **path-copier** | Kopiert Pfad/Titel/Wikilink der aktiven Notiz |
| **md-link-wrap** (dieses) | Selection → `[text](url)` |

### Grenzen

- Nur **aktiver Markdown-Editor** — keine Vault-Suche, kein Bulk-Wrap.
- Clipboard-Lesen hängt vom Host ab; ohne `readText` fällt der Clipboard-Pfad auf Prompt zurück.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Link erzeugen*.
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **wikilink-wrap** | Wrap selection as `[[…]]` / alias (+ optional create) |
| **url-collector** | **Collect** https URLs from notes to copy/open |
| **path-copier** | Copy active-note **path**/title/wikilink |
| **md-link-wrap** (this) | Wrap selection as `[text](url)` |

### What it does

- **Wrap:** Reads `editor.getSelection()`; trimmed text = link label; empty → info toast; else resolve URL → `[text](url)` → `editor.replaceSelection`.
- **URL source:** `prompt` (default) or `clipboard`. Clipboard only when non-empty and `http://` / `https://`; otherwise prompt (placeholder `https://`).
- **openPromptAlways:** when on and clipboard URL is valid → still open prompt (prefilled); when off → use clipboard URL directly.
- **wrap-clipboard:** forces clipboard path for this call only (settings unchanged).
- **Empty URL / cancel:** no change, return.
- **Panel** (`mdl`): `urlSource` select, `openPromptAlways` checkbox; **Create link** button (only primary).
- **Activate:** load settings only — no vault, no editor, no network.

### Usage

1. Select text in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Wrap selection as Markdown link*
   - *Wrap selection as Markdown link (clipboard)*
   - *Open Markdown Link Wrap* → panel
3. In the panel: set URL source / prompt option → **Create link**.

### Settings (`storage`)

Key `settings`:

```json
{
  "urlSource": "prompt",
  "openPromptAlways": true
}
```

- `urlSource`: `prompt` | `clipboard` (default: `prompt`)
- `openPromptAlways`: still open prompt when clipboard URL is valid (default: on)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, prompt, toasts |
| `editor` | Read / replace selection |
| `storage` | Settings |
| `clipboard` | Clipboard as URL source (when host provides `readText`) |

**No** `notes:read`/`notes:write`, **no** `vault:write`, **no** `network`.

### Limits

- **Active Markdown editor** only — no vault search, no bulk wrap.
- Clipboard read depends on the host; without `readText` the clipboard path falls back to prompt.
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Create link*.
- Command titles follow the UI language at load; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
