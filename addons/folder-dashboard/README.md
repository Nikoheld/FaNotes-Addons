# Ordner-Dashboard / Folder Dashboard

Zeigt eine **Ordner-Übersicht**: Notizanzahl, zuletzt geänderte Notizen und optional eine **Näherung offener Aufgaben** (`- [ ]`). Optional Statusleiste `📁 N` (Markdown-Anzahl), wenn ein Ordner gesetzt ist.

Shows a **folder overview**: note count, recently modified notes, and optionally an **open-task approximation** (`- [ ]`). Optional status bar `📁 N` (Markdown count) when a folder is set.

---

## Deutsch

### Was es tut

- **Ordner-Dashboard öffnen:** Panel `folder` mit Key-Value (Ordner / Notizen / Offene Aufgaben), Ordner-Eingabe, Liste der zuletzt geänderten Notizen.
- **Ordner setzen:** Prompt für vault-relativen Präfix **ohne** Slash am Ende; leer = Vault-Wurzel (alle Notizen).
- **Aktiven Ordner verwenden:** `folder = dirname(aktive.path)`.
- **Aktualisieren / refresh-tasks:** Baut die Übersicht neu (Scan-Gate).
- **Statusleiste:** `📁 N` nur wenn `showStatus`, Ordner gesetzt und ein Snapshot existiert (`N` = `mdCount`).

### Datenaufbau (Scan-Gate)

`notes.list` / `notes.read` nur bei:

1. Panel öffnen  
2. Button **Aktualisieren**  
3. Befehl **Ordner-Dashboard aktualisieren** (`refresh-tasks`)  
4. Ordner übernehmen / aktiver Ordner / Checkbox Aufgaben (Nutzeraktion)

**Nicht** in `onActivate`.

Ablauf:

1. `notes.list` → Filter `path === folder || path.startsWith(folder + '/')` (oder alle, wenn `folder === ''`)
2. Sortierung `modifiedAt` absteigend (`localeCompare`)
3. Zähler: `total`, `mdCount` (`.md` / `.markdown`)
4. `recent` = Slice `maxList` (Standard 40)
5. Wenn `countTasks`: Slice `maxTaskScan` (Standard 80) der gefilterten Liste; `notes.read` je Markdown-Notiz; Zeilen mit `/^- \[ \]/` zählen; Lesefehler überspringen

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Ordner-Dashboard öffnen*
   - *Ordner setzen*
   - *Aktiven Ordner verwenden*
   - *Ordner-Dashboard aktualisieren*
2. Im Panel: Ordner eingeben → **Übernehmen** | **Aktiver Ordner**; Checkbox Aufgaben; Liste anklicken → `notes.open`; **Aktualisieren** (einziger Primary).

### Speicher

Schlüssel `settings`:

```json
{
  "folder": "",
  "maxList": 40,
  "countTasks": true,
  "maxTaskScan": 80,
  "showStatus": true
}
```

Bei Speicherfehler Rollback der In-Memory-Einstellungen (Ordner übernehmen / Aktiver Ordner / Checkboxen).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Prompt, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen/lesen, aktive Notiz |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `vault:write`, **kein** `network`.

### Grenzen (ehrlich)

- **Aufgabenzahl ist eine Näherung:** nur bis zu `maxTaskScan` zuletzt geänderte Notizen im Ordner; nur `.md` / `.markdown`.
- Nur Zeilen, die mit `- [ ]` **am Zeilenanfang** beginnen (Regex `^`); **eingerückte** Tasks zählen nicht.
- **PDFs haben keine Aufgaben** (werden beim Task-Scan übersprungen; Lesefehler ebenfalls).
- Status `📁 N` erscheint erst nach dem ersten erfolgreichen Aufbau und nur bei gesetztem Ordner.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.list` / `read` / `open` / `active`, `ui.prompt`, `ui.status`, `storage`).

---

## English

### What it does

- **Open Folder Dashboard:** Panel `folder` with key-value (Folder / Notes / Open tasks), folder input, list of recently modified notes.
- **Set folder:** Prompt for a vault-relative prefix **without** a trailing slash; empty = vault root (all notes).
- **Use active folder:** `folder = dirname(active.path)`.
- **Refresh / refresh-tasks:** Rebuilds the overview (scan gate).
- **Status bar:** `📁 N` only when `showStatus`, a folder is set, and a snapshot exists (`N` = `mdCount`).

### Data build (scan gate)

`notes.list` / `notes.read` only on:

1. Panel open  
2. **Refresh** button  
3. **Refresh Folder Dashboard** command (`refresh-tasks`)  
4. Apply folder / active folder / tasks checkbox (user action)

**Not** in `onActivate`.

Flow:

1. `notes.list` → filter `path === folder || path.startsWith(folder + '/')` (or all if `folder === ''`)
2. Sort `modifiedAt` descending (`localeCompare`)
3. Counts: `total`, `mdCount` (`.md` / `.markdown`)
4. `recent` = slice `maxList` (default 40)
5. If `countTasks`: slice `maxTaskScan` (default 80) of the filtered list; `notes.read` each Markdown note; count lines matching `/^- \[ \]/`; skip read errors

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Folder Dashboard*
   - *Set folder*
   - *Use active folder*
   - *Refresh Folder Dashboard*
2. In the panel: enter folder → **Apply** | **Active folder**; tasks checkbox; click a row → `notes.open`; **Refresh** (single primary).

### Storage

Key `settings`:

```json
{
  "folder": "",
  "maxList": 40,
  "countTasks": true,
  "maxTaskScan": 80,
  "showStatus": true
}
```

On storage failure, in-memory settings roll back (apply folder / active folder / checkboxes).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, prompt, status bar, `notes.open` |
| `notes:read` | List/read notes, active note |
| `storage` | Settings |

**No** `notes:write`, **no** `vault:write`, **no** `network`.

### Limits (honest)

- Only lines starting with `- [ ]` **at the line start** (regex `^`); **indented** tasks are not counted.
- **Task count is an approximation:** at most `maxTaskScan` most recently modified notes in the folder; `.md` / `.markdown` only.
- **PDFs have no tasks** (skipped in the task scan; read errors skipped too).
- Status `📁 N` appears only after the first successful build and only when a folder is set.
- Command titles follow the UI language at start; reload the add-on after a language switch.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.list` / `read` / `open` / `active`, `ui.prompt`, `ui.status`, `storage`).
