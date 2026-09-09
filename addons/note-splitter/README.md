# Notiz teilen / Note Splitter

Teilt die **offene Notiz an ATX-Überschriften** in neue Notizen (Kopieren oder Ausschneiden mit optionalen Wikilink-Stubs).

Splits the **open note at ATX headings** into new notes (copy or cut with optional wikilink stubs).

> **Abgrenzung / vs heading-outline:** `heading-outline` zeigt nur die Gliederung und fügt eine **TOC-Liste** ein (ohne neue Notizen). `note-splitter` **legt neue Notizen** pro Überschrift an und kann das Original kürzen.
>
> **Distinction / vs heading-outline:** `heading-outline` only shows the outline and inserts a **TOC list** (no new notes). `note-splitter` **creates new notes** per heading and can trim the original.

> **Abgrenzung / vs template-library:** `template-library` fügt vordefinierte **Vorlagen** ein. `note-splitter` zerlegt bestehenden Inhalt an Überschriften — keine Template-Bibliothek.
>
> **Distinction / vs template-library:** `template-library` inserts predefined **templates**. `note-splitter` splits existing content at headings — not a template library.

> **v1:** Nur aktive Markdown-Notiz; kein Vault-Scan; kein `vault:write`; kein Netzwerk; kein Undo für `notes.create`.
> **v1:** Active Markdown note only; no vault scan; no `vault:write`; no network; no undo for `notes.create`.

---

## Deutsch

### Was es tut

- **Notiz teilen öffnen:** Panel `split` mit Anzahl Abschnitte, Ebene, Modus, Zielordner, Wikilink-Option und Vorschau-Liste.
- **Teil-Vorschau:** Parsed die offene Notiz an exakt `level` (H1–H3), zeigt Titel der Abschnitte.
- **Notiz teilen:** Nach Confirm legt für jeden Abschnitt eine neue Notiz an; optional Cut mit TOC-Stubs.

### Parsing

- ATX: `/^(#{1,6})\s+(.+)$/` — **nur** exakt `settings.level` (tiefere Überschriften bleiben im Abschnitt).
- Fenced Code (` ``` ` / `~~~`) wird ignoriert.
- **Preamble** = Inhalt vor der ersten Split-Überschrift.
- **Parts** = `{ title, body }` bis `maxParts` (Standard 30); darüber Toast **error** und Abbruch.

### Modi

| Modus | Original | Neue Notizen |
| --- | --- | --- |
| **Kopieren** (`copy`) | unverändert | `# Titel` + Body |
| **Ausschneiden** (`cut`) | Preamble + optional `[[Titel]]`-Liste | wie oben; Abschnitte aus dem Original entfernt |

- `insertWikilinks`: nur im Cut-Modus als Stubs im Original (einfach, vorhersehbar). Bei Copy bleibt das Original unverändert.
- Dateiname: unsichere Zeichen entfernt, max. 80 Zeichen, Fallback `Teil-N`.
- Zielordner leer = Ordner der Quellnotiz. Ohne `vault:write`: fehlender Ordner → Toast, Ordner manuell anlegen.

### Bedienung

1. Markdown-Notiz öffnen.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Notiz teilen öffnen*
   - *Teil-Vorschau*
   - *Notiz teilen*
3. Im Panel: Ebene / Modus / Ordner setzen → **Vorschau** → **Teilen** (Primary, mit Confirm und Anzahl).

### Activate

Nur Einstellungen aus `storage` laden. **Kein** Vault-Scan, **kein** Notizlesen beim Start.

### Einstellungen (Speicher)

Schlüssel `settings`:

```json
{
  "level": 2,
  "targetFolder": "",
  "mode": "copy",
  "insertWikilinks": true,
  "maxParts": 30
}
```

- `level`: 1–3 (Standard 2)
- `targetFolder`: leer = Quellordner
- `mode`: `copy` | `cut`
- `insertWikilinks`: Wikilink-Stubs nur bei Cut
- `maxParts`: Obergrenze Abschnitte

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Toasts, Confirm |
| `editor` | Text lesen / Original setzen |
| `notes:read` | Aktive Notiz (Fallback) |
| `notes:write` | Neue Notizen + Original bei Cut |
| `storage` | Einstellungen |

**Kein** `network`, **kein** `vault:write`.

### Grenzen (ehrlich)

- Nur **aktive** Markdown-Notiz — kein Ordner-/Vault-Bulk.
- Cut vs Copy: Cut entfernt Abschnitte und schreibt Stubs; Copy lässt das Original unberührt.
- **Kein Undo** über Vault-`create`: bereits angelegte Notizen bleiben bei Fehler/Abbruch.
- Teil-Create-Fehler (z. B. fehlender Ordner): Stopp; bereits erzeugte Notizen bleiben; Original unverändert.
- Nur ATX (`# Titel`), keine Setext-Unterstreichungen.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `editor.getText` / `setText`, `notes.create` / `read` / `write`, `storage`).

---

## English

### What it does

- **Open Note Splitter:** Panel `split` with part count, level, mode, target folder, wikilink option, and preview list.
- **Split preview:** Parses the open note at exactly `level` (H1–H3) and lists part titles.
- **Split note:** After confirm, creates one new note per section; optional cut with TOC stubs.

### Parsing

- ATX: `/^(#{1,6})\s+(.+)$/` — **only** exact `settings.level` (deeper headings stay inside the part).
- Fenced code (` ``` ` / `~~~`) is ignored.
- **Preamble** = content before the first split heading.
- **Parts** = `{ title, body }` up to `maxParts` (default 30); above that → toast **error** and abort.

### Modes

| Mode | Original | New notes |
| --- | --- | --- |
| **Copy** (`copy`) | unchanged | `# Title` + body |
| **Cut** (`cut`) | preamble + optional `[[Title]]` list | as above; sections removed from original |

- `insertWikilinks`: stubs in the original in cut mode only (simple, predictable). In copy mode the original stays unchanged.
- File name: unsafe characters stripped, max 80 chars, fallback `Teil-N`.
- Empty target folder = source note folder. Without `vault:write`: missing folder → toast asking you to create it manually.

### Usage

1. Open a Markdown note.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Note Splitter*
   - *Split preview*
   - *Split note*
3. In the panel: set level / mode / folder → **Preview** → **Split** (primary, with confirm and count).

### Activate

Load settings from `storage` only. **No** vault scan, **no** note read on start.

### Settings (storage)

Key `settings`:

```json
{
  "level": 2,
  "targetFolder": "",
  "mode": "copy",
  "insertWikilinks": true,
  "maxParts": 30
}
```

- `level`: 1–3 (default 2)
- `targetFolder`: empty = source folder
- `mode`: `copy` | `cut`
- `insertWikilinks`: wikilink stubs in cut mode only
- `maxParts`: part ceiling

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, toasts, confirm |
| `editor` | Read text / set original |
| `notes:read` | Active note (fallback) |
| `notes:write` | New notes + original on cut |
| `storage` | Settings |

**No** `network`, **no** `vault:write`.

### Limits (honest)

- **Active** Markdown note only — no folder/vault bulk.
- Cut vs Copy: Cut removes sections and writes stubs; Copy leaves the original untouched.
- **No undo** for vault `create`: notes already created stay if something fails mid-run.
- Partial create failure (e.g. missing folder): stop; already created notes remain; original unchanged.
- ATX only (`# Title`), no Setext underlines.
- Command titles follow UI language at start; reload the add-on after a language switch.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `editor.getText` / `setText`, `notes.create` / `read` / `write`, `storage`).
