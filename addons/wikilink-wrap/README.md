# Wikilink-Umbruch / Wikilink Wrap

Umhüllt die **Editor-Auswahl** als **`[[Wikilink]]`** und kann optional eine **fehlende Notiz** anlegen.

Wraps the **editor selection** as a **`[[wikilink]]`** and can optionally **create a missing note**.

> **Abgrenzung:** `unlinked-mentions` = unlinked Mentions **finden**; `selection-to-note` = Auswahl → **neue Notiz extrahieren**; `wikilink-map` = Link-**Graph**. **Hier** = Micro-Wrap der Selection (`[[…]]` / Alias) + optionales Soft-Create. **Kein Auto-Rename.**
>
> **Distinction:** `unlinked-mentions` = **find** unlinked mentions; `selection-to-note` = **extract** selection into a new note; `wikilink-map` = link **graph**. **This** = micro-wrap of the selection (`[[…]]` / alias) + optional Soft create. **No auto-rename.**

---

## Deutsch

### Was es tut

- **Umhüllen:** Liest `editor.getSelection()`; leer/Whitespace → Toast; bereits `[[…]]` → Info-Toast und Abbruch; sonst `[[Ziel]]` oder (Alias) Prompt → `[[Titel|Auswahl]]`, dann `editor.replaceSelection`.
- **wrap-alias:** Erzwingt Alias-Modus nur für diesen Aufruf (Einstellungen unverändert).
- **wrap-create:** Erzwingt `createIfMissing` nur für diesen Aufruf.
- **createIfMissing Soft:** Pfad = `Ordner/sanitize(Ziel).md` bzw. `sanitize(Ziel).md`; wenn `notes.exists` falsch → `ui.confirm` → `notes.create({ folder, name, content: '# Ziel\n' })`. Create-Fehler → Toast „Ordner manuell“ (kein `vault:write`). Existiert die Notiz bereits → kein Create, **kein Auto-Rename**.
- **Panel** (`wrap`): Checkbox `createIfMissing`, Ordner-Eingabe, Alias-Select; Button **Umhüllen** (einzige Primäraktion).
- **Activate:** nur Einstellungen laden — kein Vault-Scan, kein Editor-Zugriff.

### Sanitize Soft

Wie `note-splitter` / `selection-to-note`: Steuerzeichen und `\/:*?"<>|` entfernen, Whitespace normalisieren, führende/trailing Punkte strippen, max. 80 Zeichen, leer → `Link`. Nur für den Create-Dateinamen — **kein** Umbenennen bestehender Notizen.

### Bedienung

1. Text im Markdown-Editor markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Auswahl als Wikilink umhüllen*
   - *Auswahl als Wikilink mit Alias*
   - *Wikilink umhüllen und Notiz anlegen*
   - *Wikilink-Umbruch öffnen* / *…-Einstellungen öffnen* → Panel
3. Im Panel: Optionen setzen → **Umhüllen**.

### Einstellungen (`storage`)

Schlüssel `settings`:

```json
{
  "createIfMissing": false,
  "folder": "",
  "aliasMode": "none"
}
```

- `createIfMissing`: nach Wrap fehlende Notiz per Confirm anlegen
- `folder`: leer = Vault-Wurzel; kein `..`
- `aliasMode`: `none` | `selection-as-alias`

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Prompt, Confirm, Toasts |
| `editor` | Auswahl lesen / ersetzen |
| `notes:read` | `notes.exists` |
| `notes:write` | `notes.create` (optional) |
| `storage` | Einstellungen |

**Kein** `vault:write`, **kein** `network`, **kein** `clipboard`.

### Grenzen

- Nur **aktiver Markdown-Editor** — keine Vault-Suche, kein Bulk-Wrap.
- Ohne `vault:write` werden Ordner nicht angelegt.
- **Kein Auto-Rename** bestehender Notizen.
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
| **unlinked-mentions** | **Find** unlinked mentions in the vault |
| **selection-to-note** | **Extract** selection → new vault note (+ optional wikilink) |
| **wikilink-map** | Wikilink **graph** / map |
| **wikilink-wrap** (this) | **Micro-wrap** selection as `[[…]]` / alias + optional Soft create |

### What it does

- **Wrap:** Reads `editor.getSelection()`; empty/whitespace → toast; already `[[…]]` → info toast and abort; else `[[target]]` or (alias) prompt → `[[title|selection]]`, then `editor.replaceSelection`.
- **wrap-alias:** Forces alias mode for this call only (settings unchanged).
- **wrap-create:** Forces `createIfMissing` for this call only.
- **createIfMissing Soft:** Path = `folder/sanitize(target).md` or `sanitize(target).md`; if `notes.exists` is false → `ui.confirm` → `notes.create({ folder, name, content: '# target\n' })`. Create failure → toast to create the folder manually (no `vault:write`). If the note already exists → no create, **no auto-rename**.
- **Panel** (`wrap`): `createIfMissing` checkbox, folder input, alias select; **Wrap** button (only primary).
- **Activate:** load settings only — no vault scan, no editor access.

### Sanitize Soft

Same Soft as `note-splitter` / `selection-to-note`: strip control chars and `\/:*?"<>|`, normalize whitespace, strip leading/trailing dots, max 80 chars, empty → `Link`. Used only for the create file name — **does not** rename existing notes.

### Usage

1. Select text in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Wrap selection as wikilink*
   - *Wrap selection as wikilink with alias*
   - *Wrap wikilink and create note*
   - *Open Wikilink Wrap* / *Open Wikilink Wrap settings* → panel
3. In the panel: set options → **Wrap**.

### Settings (`storage`)

Key `settings`:

```json
{
  "createIfMissing": false,
  "folder": "",
  "aliasMode": "none"
}
```

- `createIfMissing`: after wrap, confirm-create missing note
- `folder`: empty = vault root; no `..`
- `aliasMode`: `none` | `selection-as-alias`

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, prompt, confirm, toasts |
| `editor` | Read / replace selection |
| `notes:read` | `notes.exists` |
| `notes:write` | `notes.create` (optional) |
| `storage` | Settings |

**No** `vault:write`, **no** `network`, **no** `clipboard`.

### Limits

- **Active Markdown editor** only — no vault search, no bulk wrap.
- Without `vault:write`, folders are not created.
- **No auto-rename** of existing notes.
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Wrap*.
- Command titles follow the UI language at load; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
