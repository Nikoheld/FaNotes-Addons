# Ordner-Statistik / Folder Stats

Zählt **Notizen pro Ordner** aus der Notizliste (`notes.list`) – eine **leichte Vault-Übersicht**. Kein Körperlesen, kein Task-Count.

Counts **notes per folder** from the note list (`notes.list`) – a **light vault overview**. No body reads, no task count.

> **Abgrenzung / vs folder-dashboard:** `folder-dashboard` = **Detail + offene Tasks** eines **einzelnen** Ordners (inkl. `notes.read` für Tasks). `folder-stats` = nur **Aggregation** über `notes.list` (kein `notes.read`) → schnell, Scan-Gate trotzdem.
> **Distinction / vs folder-dashboard:** `folder-dashboard` = **detail + open tasks** of **one** folder (uses `notes.read` for tasks). `folder-stats` = **aggregation only** via `notes.list` (no `notes.read`) → fast; scan gate still applies.

> **v1:** Kein Schreiben, kein Vault, kein Netzwerk, kein Editor, kein `stats`. Nur `.md` / `.markdown`. Cap möglich.
> **v1:** No write, no vault, no network, no editor, no `stats`. `.md` / `.markdown` only. Cap possible.

---

## Deutsch

### Was es tut

- **Ordner-Statistik öffnen:** Panel `folders` mit Key-Value (**Notizen** | **Ordner**), Select **Tiefe**, ein Primary-Button **Aktualisieren**, Liste (Ordner + Badge = Count).
- **Ordner-Scan aktualisieren:** Lädt `notes.list`, filtert Markdown, zählt pro Ordner-Schlüssel.
- **Klick auf Ordner** → Soft Drill-down: Notizenliste aus dem letzten Scan-Cache (max. 30); Klick → `notes.open`; Button **← Zurück** löscht die Auswahl.
- **Optionaler Status** Soft: `📁 N` (N = eindeutige Ordnerzahl) wenn `showStatus` und Scan vorhanden.

### Tiefe (depth Soft)

| Wert | Bedeutung |
| --- | --- |
| `'1'` | Nur das **erste Pfadsegment** (Top-Level) bzw. `(Wurzel)` / `(root)` bei leerem Ordner |
| `'full'` | **Vollständiger** Ordnerpfad aus `note.folder \|\| dirname(path)` |

Soft: `depth` kann als Zahl `1` ankommen → Normalisierung auf `'1'` \| `'full'`.

Ordner-Schlüssel Soft:

```js
const folder = note.folder || dirname(path)   // '' = Vault-Wurzel
// depth '1'  → first segment oder t('(Wurzel)','(root)')
// depth 'full' → full path oder t('(Wurzel)','(root)')
```

### Scan-Ablauf (Scan-Gate)

1. `notes.list()` — Filter Soft `.md` \| `.markdown`; wenn Länge > `maxNotes`: Sortierung `modifiedAt` **DESC** (`localeCompare`; fehlendes Datum zuletzt), Slice `maxNotes` (**Cap dokumentiert**).
2. Pro Notiz: Ordner-Schlüssel nach `depth` ableiten.
3. Count-Map; Sortierung Count **DESC**, dann Name; Slice `topN`.
4. Soft Session-Cache: Map Ordner → Notizpfade für Drill-down.

**Kein** `notes.read`. Kein Task-Count.

### Scan-Gate

`notes.list` **nicht** in `onActivate` (nur Settings laden). Scan bei:

1. Panel öffnen (Befehl **Ordner-Statistik öffnen**)
2. Button **Aktualisieren**
3. Befehl **Ordner-Scan aktualisieren**

Busy/Queue: parallele Scans werden gequeued (wie `empty-notes` / `long-notes`).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Ordner-Statistik öffnen*
   - *Ordner-Scan aktualisieren*
2. Im Panel: Tiefe wählen → **Aktualisieren** (einziger Primary), Ordner anklicken → Notizen → Zurück.

### Speicher

`settings`:

```json
{
  "maxNotes": 2000,
  "depth": "1",
  "topN": 40,
  "showStatus": false
}
```

- `maxNotes`: 100–5000 (Cap vor Aggregation, neueste zuerst wenn Cap greift)
- `depth`: `'1'` \| `'full'` (Zahl `1` Soft → `'1'`)
- `topN`: 5–200 (Listen-Cap)
- `showStatus`: Soft Status `📁 N` nach Scan (Standard `false`)

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Status Soft, `notes.open` |
| `notes:read` | Notizen listen (`notes.list`) und öffnen |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `vault`, **kein** `network`, **kein** `editor`, **kein** `stats`.

### Grenzen (ehrlich)

- Höchstens **`maxNotes`** Markdown-Notizen (Standard 2000) – Cap möglich bei großen Vaults.
- Liste im Panel max. **`topN`** Ordner; Drill-down max. **30** Notizen.
- Nur Metadaten aus `notes.list` – kein Inhaltslesen, **kein Task-Count**.
- Nur `.md` / `.markdown` (keine PDFs).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Folder Stats:** Panel `folders` with key-value (**Notes** | **Folders**), **Depth** select, one primary **Refresh** button, list (folder + badge = count).
- **Refresh folder scan:** Loads `notes.list`, filters Markdown, counts per folder key.
- **Click a folder** → Soft drill-down: note list from last scan cache (max 30); click → `notes.open`; **← Back** clears selection.
- **Optional status** Soft: `📁 N` (N = unique folder count) when `showStatus` and a scan exists.

### Depth (Soft)

| Value | Meaning |
| --- | --- |
| `'1'` | **First path segment** only (top-level), or `(Wurzel)` / `(root)` for empty folder |
| `'full'` | **Full** folder path from `note.folder \|\| dirname(path)` |

Soft: `depth` may arrive as number `1` → normalized to `'1'` \| `'full'`.

### Scan flow (scan gate)

1. `notes.list()` — Soft filter `.md` \| `.markdown`; if length > `maxNotes`: sort `modifiedAt` **DESC** (`localeCompare`; missing dates last), slice `maxNotes` (**documented Cap**).
2. For each note: derive folder key per `depth`.
3. Count map; sort count **DESC** then name; slice `topN`.
4. Soft session cache: Map folder → note paths for drill-down.

**No** `notes.read`. No task count.

### Scan gate

`notes.list` is **not** called in `onActivate` (settings load only). Scan on:

1. Opening the panel (**Open Folder Stats**)
2. **Refresh** button
3. **Refresh folder scan** command

Busy/queue: parallel scans are queued (like `empty-notes` / `long-notes`).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Folder Stats*
   - *Refresh folder scan*
2. In the panel: pick depth → **Refresh** (only primary), click a folder → notes → Back.

### Storage

`settings`:

```json
{
  "maxNotes": 2000,
  "depth": "1",
  "topN": 40,
  "showStatus": false
}
```

- `maxNotes`: 100–5000 (Cap before aggregation; newest first when Cap applies)
- `depth`: `'1'` \| `'full'` (number `1` Soft → `'1'`)
- `topN`: 5–200 (list Cap)
- `showStatus`: Soft status `📁 N` after scan (default `false`)

Settings are saved with rollback (on failure: toast + previous value).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, Soft status, `notes.open` |
| `notes:read` | List notes (`notes.list`) and open |
| `storage` | Settings |

**No** `notes:write`, **no** `vault`, **no** `network`, **no** `editor`, **no** `stats`.

### Limits (honest)

- At most **`maxNotes`** Markdown notes (default 2000) – Cap possible on large vaults.
- Panel list max **`topN`** folders; drill-down max **30** notes.
- Metadata from `notes.list` only – no body reads, **no task count**.
- `.md` / `.markdown` only (no PDFs).
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
