# Doppelte Titel / Duplicate Titles

Findet **Markdown-Notizen mit gleichem normalisiertem Titel oder Dateinamen** und zeigt Kollisions-Gruppen zum Öffnen.

Finds **Markdown notes that share a normalized title or filename** and lists collision groups for opening.

> **Abgrenzung / Distinction:** `orphan-notes` = **Wikilinks** (Links). `stale-notes` = **Alter** über `modifiedAt`. `duplicate-titles` = **Titel / Basename** — keine Link-Analyse, kein Altersfilter, **kein Auto-Rename** in v1.
>
> **Distinction:** `orphan-notes` = **wikilinks**. `stale-notes` = **age** via `modifiedAt`. `duplicate-titles` = **title / basename** — no link analysis, no age filter, **no auto-rename** in v1.

> **v1:** Kein Schreiben, kein Umbenennen, kein Löschen. Nur `.md` / `.markdown`.
> **v1:** No write, no rename, no trash. `.md` / `.markdown` only.

---

## Deutsch

### Was es tut

- **Doppelte Titel öffnen:** Panel `dupes` mit Key-Value (**Gruppen** | **Notizen in Gruppen**), Modus-Select, Ordner + Caps, Primary-Button **Aktualisieren**, pro Gruppe Überschrift `N× key` und Liste (Titel + Pfad).
- **Doppelte-Titel-Scan aktualisieren:** Listet Notizen neu und gruppiert nach Titel oder Basename.
- **Klick** auf einen Listen-Eintrag → `notes.open`.
- **Kein** Auto-Rename und **kein** Statusleisten-Eintrag in v1.

### Normalisierung (Norm-Keys)

| Modus | Schlüssel |
| --- | --- |
| `title` (Standard) | `note.title` (sonst Basename ohne Endung) → trim → lowercase → interne Whitespace zu einem Leerzeichen |
| `basename` | Dateiname ohne `.md` / `.markdown` → lowercase |

### Scan-Ablauf

1. `notes.list()` → nur `.md` / `.markdown`, optional Ordner-Präfix.
2. Sortierung nach `modifiedAt` **absteigend** (`localeCompare` auf ISO-Strings; fehlendes Datum zuletzt), dann Pfad.
3. Slice auf `maxNotes` (Standard 500, Clamp 50–2000).
4. Gruppierung nach Norm-Key; behalten wenn Größe ≥ `minGroup` (Standard 2, Clamp ≥2).
5. Gruppen sortieren: Größe **DESC**, dann Key `localeCompare`.
6. Innerhalb der Gruppe: Mitglieder nach `modifiedAt` DESC, dann Pfad.

### Scan-Gate

`notes.list` **nicht** in `onActivate` (nur Settings laden). Scan bei:

1. Panel öffnen (Befehl **Doppelte Titel öffnen**)
2. Button **Aktualisieren**
3. Befehl **Doppelte-Titel-Scan aktualisieren**

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Doppelte Titel öffnen*
   - *Doppelte-Titel-Scan aktualisieren*
2. Im Panel: Modus und optional Ordner/Caps setzen → **Aktualisieren** (einziger Primary), Zeile anklicken.

### Speicher

`settings`:

```json
{
  "mode": "title",
  "maxNotes": 500,
  "minGroup": 2,
  "folder": ""
}
```

- `mode`: `"title"` | `"basename"`
- `maxNotes`: 50–2000 (wie viele Notizen nach Sortierung in den Scan gehen)
- `minGroup`: ≥2 (Mindestgröße einer Kollisionsgruppe; Cap 100)
- `folder`: vault-relativer Präfix, leer = alle Notizen; kein `..`

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, `notes.open` |
| `notes:read` | Notizen listen (`notes.list`) |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`, **kein** Vault-Schreiben. v1 schreibt/benennt/löscht nichts.

### Grenzen (ehrlich)

- Nur Metadaten aus `notes.list` — **kein** Lesen der Notiz-Inhalte.
- Nur `.md` / `.markdown` (keine PDFs).
- Cap `maxNotes`: neueste zuerst; ältere Notizen jenseits des Caps werden nicht gruppiert.
- Kein Auto-Rename / Merge / Deduplizieren — nur Finden und Öffnen.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- „Gleicher Titel“ ≠ gleicher Inhalt: nur normalisierter Titel/Basename.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Duplicate Titles:** Panel `dupes` with key-value (**Groups** | **Notes in groups**), mode select, folder + caps, primary **Refresh**, per group heading `N× key` and list (title + path).
- **Refresh duplicate-titles scan:** Re-lists notes and groups by title or basename.
- **Click** a list row → `notes.open`.
- **No** auto-rename and **no** status-bar entry in v1.

### Normalization (norm keys)

| Mode | Key |
| --- | --- |
| `title` (default) | `note.title` (else basename without extension) → trim → lowercase → collapse internal whitespace |
| `basename` | filename without `.md` / `.markdown` → lowercase |

### Scan flow

1. `notes.list()` → `.md` / `.markdown` only, optional folder prefix.
2. Sort by `modifiedAt` **descending** (`localeCompare` on ISO strings; missing dates last), then path.
3. Slice to `maxNotes` (default 500, clamp 50–2000).
4. Group by norm key; keep groups with size ≥ `minGroup` (default 2, clamp ≥2).
5. Sort groups: size **DESC**, then key `localeCompare`.
6. Within a group: members by `modifiedAt` DESC, then path.

### Scan gate

No `notes.list` in `onActivate` (settings only). Scan on:

1. Panel open (**Open Duplicate Titles**)
2. **Refresh** button
3. **Refresh duplicate-titles scan** command

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Duplicate Titles*
   - *Refresh duplicate-titles scan*
2. In the panel: set mode and optional folder/caps → **Refresh** (only primary), click a row.

### Storage

Same `settings` shape as above.

- `mode`: `"title"` | `"basename"`
- `maxNotes`: 50–2000
- `minGroup`: ≥2 (cap 100)
- `folder`: vault-relative prefix, empty = all notes; no `..`

Settings persist with rollback (toast + restore on failure).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, `notes.open` |
| `notes:read` | List notes (`notes.list`) |
| `storage` | Settings |

**No** `notes:write`, **no** `network`, **no** vault writes. v1 does not write, rename, or trash.

### Limits (honest)

- Metadata from `notes.list` only — **no** note body reads.
- `.md` / `.markdown` only (no PDFs).
- Cap `maxNotes`: newest first; notes beyond the cap are not grouped.
- No auto-rename / merge / dedupe — find and open only.
- Command titles follow UI language at start; reload the add-on after a language switch.
- “Same title” ≠ same content: normalized title/basename only.

### Version

1.0.0 – initial release.
