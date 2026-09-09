# Konflikt-Marker / Conflict Finder

Findet **Git-Merge-Konfliktmarker** (`<<<<<<<` / `=======` / `>>>>>>>`) in Markdown-Notizen. Panel mit Ordnerfilter und Trefferliste (Zeilennummern).

Finds **Git merge conflict markers** (`<<<<<<<` / `=======` / `>>>>>>>`) in Markdown notes. Panel with folder filter and hit list (line numbers).

> **Abgrenzung / vs others:** `empty-notes` / `stale-notes` / `duplicate-titles` / `orphan-notes` = **andere Hygiene** (Länge, Alter, Titel, Links). `find-replace-note` = **manuelles Ersetzen**. `conflict-finder` = **nur Erkennung** der Marker.
> **Distinction / vs others:** `empty-notes` / `stale-notes` / `duplicate-titles` / `orphan-notes` = **other hygiene** (length, age, title, links). `find-replace-note` = **manual replace**. `conflict-finder` = **detection only**.

> **v1:** Kein Schreiben (`notes:write` fehlt). Nur `.md` / `.markdown`. Zeilen in fenced ` ``` ` / `~~~` Soft übersprungen (False Positives in Code-Beispielen möglich, wenn Fence fehlt).
> **v1:** No write (no `notes:write`). `.md` / `.markdown` only. Lines inside fenced ` ``` ` / `~~~` Soft skipped (false positives in code examples possible when fences are missing).

---

## Deutsch

### Was es tut

- **Konflikt-Marker öffnen:** Panel `cf` mit Key-Value (**Dateien** | **Marker-Zeilen**), Eingabe Ordner, Button **Aktualisieren** (Primary), Liste.
- **Konflikt-Scan aktualisieren:** Listet Notizen, liest bis zu `maxNotes` Körper, filtert nach Markern.
- **Erste Konfliktnotiz öffnen:** Öffnet den ersten Treffer (Pfad-Sortierung); Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`. Detail: `` `L${lines.join(',')} · path` ``.
- **Statusleiste:** `⚡ N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = Anzahl Dateien mit Markern); **Klick öffnet das Panel**. Nie beim Activate.

### Was als Marker gilt

Nach `trimStart` beginnt die Zeile mit einem dieser Präfixe Soft:

1. `<<<<<<<`
2. `=======`
3. `>>>>>>>`

Zeilen **innerhalb** von fenced Codeblöcken (` ``` ` oder `~~~`, Toggle) werden Soft **übersprungen**. Die Fence-Zeile selbst zählt nicht.

Sortierung der Treffer: nach `path` aufsteigend. Vor dem Lesen: `modifiedAt` absteigend, fehlende zuletzt, Slice `maxNotes`.

### Scan-Gate

`notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings laden + kalten Status entfernen). Scan bei:

1. Panel öffnen (Befehl **Konflikt-Marker öffnen**)
2. Button **Aktualisieren**
3. Befehl **Konflikt-Scan aktualisieren**
4. Befehl **Erste Konfliktnotiz öffnen**

Busy/Queue: parallele Scans werden gequeued (wie `empty-notes` / `stale-notes`).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Konflikt-Marker öffnen*
   - *Konflikt-Scan aktualisieren*
   - *Erste Konfliktnotiz öffnen*
2. Im Panel: optional Ordner setzen → **Aktualisieren** (Primary), Zeile anklicken.

### Speicher

`settings`:

```json
{
  "maxNotes": 400,
  "folder": "",
  "showStatus": false
}
```

- `maxNotes`: 1–2000 (wie viele Markdown-Notizen vor dem Lesen, neueste zuerst)
- `folder`: vault-relativer Präfix, leer = alle; kein `..`
- `showStatus`: Status `⚡ N` (Standard `false`)

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen und lesen (`notes.list` / `notes.read`) |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`. v1 schreibt nichts.

### Grenzen (ehrlich)

- False Positives möglich: z. B. `=======` als Markdown-HR oder Marker in **ungefencetem** Code.
- Soft Fence-Skip deckt nur ` ``` ` / `~~~` ab — Inline-Code und andere Formate nicht.
- Nur `.md` / `.markdown` (keine PDFs).
- Cap `maxNotes` (Standard 400); Index neueste zuerst.
- Status erscheint erst nach Nutzer-Scan in der Session (kein Kaltstart-Status).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Erkennung ≠ Auflösung: Konflikte müssen manuell bereinigt werden (z. B. mit `find-replace-note`).

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Conflict Finder:** Panel `cf` with key-value (**Files** | **Marker lines**), folder input, **Refresh** button (primary), list.
- **Refresh conflict scan:** Lists notes, reads up to `maxNotes` bodies, filters by markers.
- **Open first conflict note:** Opens the first hit (path sort); toast if none.
- **Click** a list row → `notes.open`. Detail: `` `L${lines.join(',')} · path` ``.
- **Status bar:** `⚡ N` only when `showStatus` and at least one scan this session (`N` = files with markers); **click opens the panel**. Never on Activate.

### What counts as a marker

After `trimStart`, the line starts with one of these Soft prefixes:

1. `<<<<<<<`
2. `=======`
3. `>>>>>>>`

Lines **inside** fenced code blocks (` ``` ` or `~~~`, toggle) are Soft **skipped**. The fence line itself does not count.

Hit sort: ascending by `path`. Before reading: `modifiedAt` descending, missing last, slice `maxNotes`.

### Scan gate

`notes.list` / `notes.read` **not** in `onActivate` (settings load + cold status remove only). Scan on:

1. Opening the panel (**Open Conflict Finder**)
2. **Refresh** button
3. **Refresh conflict scan** command
4. **Open first conflict note** command

Busy/queue: parallel scans are queued (same as `empty-notes` / `stale-notes`).

### How to use

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Conflict Finder*
   - *Refresh conflict scan*
   - *Open first conflict note*
2. In the panel: optional folder → **Refresh** (primary), click a row.

### Storage

`settings`:

```json
{
  "maxNotes": 400,
  "folder": "",
  "showStatus": false
}
```

- `maxNotes`: 1–2000 (how many Markdown notes before reading, newest first)
- `folder`: vault-relative prefix, empty = all; no `..`
- `showStatus`: status `⚡ N` (default `false`)

Settings persist with rollback (on failure: toast + previous value).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List and read notes (`notes.list` / `notes.read`) |
| `storage` | Settings |

**No** `notes:write`, **no** `network`. v1 writes nothing.

### Limits (honest)

- False positives possible: e.g. `=======` as a Markdown HR, or markers in **unfenced** code.
- Soft fence skip covers only ` ``` ` / `~~~` — not inline code or other formats.
- `.md` / `.markdown` only (no PDFs).
- Cap `maxNotes` (default 400); newest-first index.
- Status appears only after a user scan in the session (no cold-start status).
- Command titles follow UI language at start; reload the add-on after a language switch.
- Detection ≠ resolution: clean conflicts manually (e.g. with `find-replace-note`).

### Version

1.0.0 – initial release.
