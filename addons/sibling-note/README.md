# Geschwister-Notiz / Sibling Note

Legt eine **neue Notiz im selben Ordner** wie die **aktive** an. Optional einen **Wikilink** in den offenen Editor einfügen.

Creates a **new note in the same folder** as the **active** one. Optionally insert a **wikilink** into the open editor.

> **Abgrenzung:** `daily-note` = Tagesnotiz (YYYY-MM-DD) in einem **konfigurierten** Ordner; `selection-to-note` = Create aus der **Editor-Auswahl**; `template-library` = Create aus **Vorlage**. **Hier** = gleicher Ordner wie die aktive Notiz + optional Wikilink einfügen.
>
> **Distinction:** `daily-note` = daily note (YYYY-MM-DD) in a **configured** folder; `selection-to-note` = create from the **editor selection**; `template-library` = create from a **template**. **This** = same folder as the active note + optional wikilink insert.

---

## Deutsch

### Was es tut

- **Geschwister-Notiz anlegen:** Liest `notes.active()`; fehlt die aktive Notiz → Toast. Ordner Soft = `dirname(active.path)` oder Vault-Wurzel (`''`). Name Soft über Prompt (oder Untitled). `notes.create({ folder, name, content })`, danach optional `notes.open`.
- **Geschwister-Notiz mit Wikilink:** Wie oben, erzwingt `insertLink` für diesen Lauf — `editor.insert('[[Titel]] ')` wenn ein Markdown-Editor offen ist, sonst Soft skip (kein Editor-Force).
- **Panel** (`sib`): Checkboxen `openAfter`, `insertLink`, `stubContent`; Soft-Select `defaultNameMode`; Button **Neue Geschwister-Notiz** (einzige Primäraktion).
- **Activate:** nur Einstellungen laden — kein Vault-Scan, kein `notes.active`.

### Name Soft

| `defaultNameMode` | Verhalten |
| --- | --- |
| `prompt` | `ui.prompt`; Abbrechen oder leerer Name (nach Sanitize) → Soft cancel, nichts anlegen |
| `untitled` | Kein Prompt; Dateiname Soft `Ohne Titel` / `Ohne Titel-N` (Sitzungszähler) |

Dateiname: unsichere Zeichen entfernt, max. 80 Zeichen.

### Inhalt Soft

- `stubContent` an: `# Titel\n\n`
- `stubContent` aus: leerer String

### Create Soft

Kein `vault:write`. Schlägt `notes.create` fehl (z. B. fehlender Ordner) → Toast, Ordner manuell anlegen.

`insertLink`: nur wenn ein Editor offen ist; sonst skip. Kein Editor-Force. Einfügen geschieht in die **aktive** Notiz **vor** einem optionalen `notes.open`.

### Bedienung

1. Eine Notiz aktiv haben.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Geschwister-Notiz anlegen*
   - *Geschwister-Notiz mit Wikilink*
   - *Geschwister-Notiz-Einstellungen öffnen* → Panel
3. Im Panel: Optionen setzen → **Neue Geschwister-Notiz**.

### Einstellungen (`storage`)

Schlüssel `settings`:

```json
{
  "openAfter": true,
  "insertLink": false,
  "defaultNameMode": "prompt",
  "stubContent": true
}
```

- `openAfter`: nach Create `notes.open` (Default `true`)
- `insertLink`: nach Create `[[Titel]] ` in den Editor (Default `false`; `create-link` erzwingt Einfügen)
- `defaultNameMode`: `prompt` | `untitled` (Default `prompt`)
- `stubContent`: `# Titel` als Inhalt (Default `true`)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Prompt, Toasts, `notes.open` |
| `notes:read` | `notes.active()` für Ordner Soft |
| `notes:write` | `notes.create` |
| `storage` | Einstellungen |

**Kein** `vault:write`, **kein** `network`, **kein** `clipboard`. `editor` nicht im Manifest — `insertLink` Soft-try, sonst skip.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **daily-note** | Tagesnotiz in einem **festen/konfigurierten** Ordner (YYYY-MM-DD) |
| **selection-to-note** | Create aus der **Editor-Auswahl**, optional Auswahl ersetzen |
| **template-library** | Create aus einer **Vorlage** |
| **sibling-note** (dieses) | Create im **gleichen Ordner** wie die aktive Notiz + optional Wikilink |

### Grenzen

- Braucht eine **aktive Notiz**; sonst Fehler-Toast.
- Kein Vault-Scan (`notes.list` / `tree` / `search`).
- Ohne `vault:write` werden Ordner nicht angelegt.
- `insertLink` nur bei offenem Markdown-Editor; sonst skip (kein Force).
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Neue Geschwister-Notiz*.
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **daily-note** | Daily note (YYYY-MM-DD) in a **configured** folder |
| **selection-to-note** | Create from the **editor selection** (optional replace-with-link) |
| **template-library** | Create from a **template** |
| **sibling-note** (this) | Create in the **same folder** as the active note + optional wikilink |

### What it does

- **Create sibling note:** Reads `notes.active()`; missing active note → toast. Folder Soft = `dirname(active.path)` or vault root (`''`). Name Soft via prompt (or Untitled). `notes.create({ folder, name, content })`, then optional `notes.open`.
- **Sibling note with wikilink:** Same, forces `insertLink` for this run — `editor.insert('[[title]] ')` when a Markdown editor is open, else Soft skip (no editor force).
- **Panel** (`sib`): checkboxes `openAfter`, `insertLink`, `stubContent`; Soft select `defaultNameMode`; **New sibling note** button (only primary).
- **Activate:** load settings only — no vault scan, no `notes.active`.

### Name Soft

| `defaultNameMode` | Behavior |
| --- | --- |
| `prompt` | `ui.prompt`; cancel or empty name (after sanitize) → Soft cancel, no create |
| `untitled` | No prompt; file name Soft `Untitled` / `Untitled-N` (session counter) |

File name: unsafe characters stripped, max 80 characters.

### Content Soft

- `stubContent` on: `# Title\n\n`
- `stubContent` off: empty string

### Create Soft

No `vault:write`. If `notes.create` fails (e.g. missing folder) → toast, create the folder by hand.

`insertLink`: only when an editor is open; else skip. No editor force. Insert happens into the **active** note **before** an optional `notes.open`.

### Usage

1. Have a note active.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Create sibling note*
   - *Sibling note with wikilink*
   - *Open Sibling Note settings* → panel
3. In the panel: set options → **New sibling note**.

### Storage

Key `settings`:

```json
{
  "openAfter": true,
  "insertLink": false,
  "defaultNameMode": "prompt",
  "stubContent": true
}
```

- `openAfter`: `notes.open` after create (default `true`)
- `insertLink`: insert `[[title]] ` into the editor after create (default `false`; `create-link` forces insert)
- `defaultNameMode`: `prompt` | `untitled` (default `prompt`)
- `stubContent`: `# Title` as content (default `true`)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, prompt, toasts, `notes.open` |
| `notes:read` | `notes.active()` for folder Soft |
| `notes:write` | `notes.create` |
| `storage` | Settings |

**No** `vault:write`, **no** `network`, **no** `clipboard`. `editor` is not in the manifest — `insertLink` Soft-try, else skip.

### Limits

- Needs an **active note**; otherwise error toast.
- No vault scan (`notes.list` / `tree` / `search`).
- Without `vault:write`, folders are not created.
- `insertLink` only with an open Markdown editor; else skip (no force).
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *New sibling note*.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
