# Zufallsnotiz / Random Note

Öffnet eine **gleichmäßig zufällige** Notiz aus dem Vault (optional Ordnerfilter, kürzlich geöffnete meiden). Kein Bias nach `modifiedAt`.

Opens a **uniformly random** note from the vault (optional folder filter, avoid recently opened). No `modifiedAt` bias.

---

## Deutsch

### Was es tut

- **Überraschung:** `notes.list` → Filter (Ordner / nur Markdown) → kürzlich geöffnete ausschließen → gleichmäßiger Index (`Math.random`) → `notes.open`.
- **Panel `random`:** Ordner, nur Markdown, Avoid-Recent (0–100), optional Status `🎲`, ein Primary **Überraschung**, Key-Value zuletzt geöffnet.
- **Zufall im Ordner der aktiven Notiz:** setzt `folder = dirname(aktive.path)`, dann Überraschung.
- **Statusleiste** (Standard aus): `🎲`, Klick = Überraschung.

### Auswahl (Scan-Gate)

`notes.list` nur bei Überraschung (Befehl, Panel-Button, Status-Klick) – **nicht** in `onActivate`.

Ablauf:

1. `notes.list` → optional nur `.md` / `.markdown`; Ordnerpräfix wie Ordner-Dashboard (`path === folder || path.startsWith(folder + '/')`, leer = alle)
2. Pfade aus dem Recent-Ring ausschließen; wenn der Pool leer ist → Recent **einmal** ignorieren + Toast `info`
3. Gleichmäßiger Index: `Math.floor(Math.random() * n)`
4. `notes.open`; Pfad in den Recent-Ring (max. `avoidRecent`); Persistenz mit Rollback

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Zufallsnotiz öffnen*
   - *Zufallsnotiz-Panel öffnen*
   - *Zufall im Ordner der aktiven Notiz*
2. Im Panel: Ordner → **Übernehmen** | **Aktiver Ordner**; Checkboxen; Avoid-Recent; **Überraschung** (einziger Primary).

### Speicher

Schlüssel `settings`:

```json
{
  "folder": "",
  "avoidRecent": 15,
  "onlyMd": true,
  "showStatus": false
}
```

Schlüssel `recent`: `string[]` (Ringpuffer, neueste zuletzt, Länge ≤ `avoidRecent`, Clamp 0–100).

Bei Speicherfehler Rollback der In-Memory-Werte.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen, aktive Notiz |
| `storage` | Einstellungen und Recent-Ring |

**Kein** `notes:write`, **kein** `vault:write`, **kein** `network`.

### Grenzen (ehrlich)

- **Gleichmäßig zufällig** über den gefilterten Pool – **kein** Bias nach Änderungsdatum, Größe oder Titel.
- Recent-Meiden gilt nur für Pfade, die dieses Add-on selbst geöffnet hat (nicht die globale FaNotes-History).
- Wenn nach dem Ausschluss niemand übrig bleibt, wird Recent einmal ignoriert (sonst wäre Überraschung unmöglich).
- `onlyMd` filtert nach Dateiendung `.md` / `.markdown`; PDFs und andere Typen nur wenn `onlyMd` aus ist.
- Leerer Ordner / leerer Vault → Toast `info`, nichts öffnen.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.list` / `open` / `active`, `ui.panel`, `ui.status`, `storage`).

---

## English

### What it does

- **Surprise:** `notes.list` → filter (folder / Markdown only) → exclude recently opened → uniform index (`Math.random`) → `notes.open`.
- **Panel `random`:** folder, Markdown-only, avoid-recent (0–100), optional status `🎲`, one primary **Surprise**, key-value last opened.
- **Random in active note folder:** sets `folder = dirname(active.path)`, then surprise.
- **Status bar** (default off): `🎲`, click = surprise.

### Pick flow (scan gate)

`notes.list` only on surprise (command, panel button, status click) – **not** in `onActivate`.

Flow:

1. `notes.list` → optional `.md` / `.markdown` only; folder prefix like Folder Dashboard (`path === folder || path.startsWith(folder + '/')`, empty = all)
2. Exclude paths in the recent ring; if the pool is empty → ignore recent **once** + `info` toast
3. Uniform index: `Math.floor(Math.random() * n)`
4. `notes.open`; push path to the recent ring (max `avoidRecent`); persist with rollback

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open random note*
   - *Open Random Note panel*
   - *Random in active note folder*
2. In the panel: folder → **Apply** | **Active folder**; checkboxes; avoid-recent; **Surprise** (only primary).

### Storage

Key `settings`:

```json
{
  "folder": "",
  "avoidRecent": 15,
  "onlyMd": true,
  "showStatus": false
}
```

Key `recent`: `string[]` (ring buffer, newest last, length ≤ `avoidRecent`, clamp 0–100).

On storage failure, in-memory values roll back.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List notes, active note |
| `storage` | Settings and recent ring |

**No** `notes:write`, **no** `vault:write`, **no** `network`.

### Limits (honest)

- **Uniform random** over the filtered pool – **no** bias by modification date, size, or title.
- Avoid-recent only tracks paths this add-on opened (not FaNotes’ global history).
- If exclusion empties the pool, recent is ignored once (otherwise surprise would be impossible).
- `onlyMd` filters by `.md` / `.markdown` extension; PDFs and other types only when `onlyMd` is off.
- Empty folder / empty vault → `info` toast, nothing opens.
- Command titles follow UI language at start; reload the add-on after a language switch.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.list` / `open` / `active`, `ui.panel`, `ui.status`, `storage`).
