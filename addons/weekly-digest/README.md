# Wochenrückblick / Weekly Digest

Erstellt eine **Wochennotiz** (`Digests/YYYY-Www.md`) mit geänderten Markdown-Notizen der laufenden ISO-Woche und optionalen Fokusminuten aus einer Stats-Stichprobe. Überschreiben nur nach Bestätigung.

Creates a **weekly note** (`Digests/YYYY-Www.md`) with Markdown notes edited in the current ISO week and optional focus minutes from a stats sample. Overwrite only after confirmation.

---

## Deutsch

### Was es tut

- **Wochenrückblick öffnen:** Panel `digest` mit `weekKey`, Notizen in der Woche, Fokusminuten, Vorschau-Liste (max. 20 Titel).
- **Wochenrückblick schreiben:** Baut die Vorschau, legt `folder/weekKey.md` an oder fragt bei Existenz per `ui.confirm` (kein stilles Überschreiben).
- **Wochenrückblick-Notiz öffnen:** `notes.open` wenn die Datei existiert, sonst Info-Toast.
- **ISO-Woche:** lokal Montag–Sonntag, Schlüssel `YYYY-Www` (Wochenjahr nach Donnerstag).
- **Scan-Gate:** Vault-/Stats-Scan nur bei Panel-Öffnen, „Vorschau aktualisieren“ oder Schreiben – **nicht** in `onActivate`.

### Markdown-Inhalt

```markdown
# Wochenrückblick YYYY-Www / Weekly Digest

## Aktivität / Activity
- Geänderte Notizen: N
- Fokusminuten (Stichprobe, Cap …): M

## Geänderte Notizen / Edited notes
- Titel — pfad.md
```

Bei `useWikilinks: true` (Speicher, Standard aus): `- [[Titel]]` statt Titel + Pfad.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Wochenrückblick öffnen*
   - *Wochenrückblick schreiben*
   - *Wochenrückblick-Notiz öffnen*
2. Im Panel: **Digest schreiben** (einziger Primary), **Vorschau aktualisieren**, **Öffnen**; Checkbox Fokusminuten speichert sofort.

### Speicher

Schlüssel `settings`:

```json
{
  "folder": "Digests",
  "includeStats": true,
  "maxNotes": 50,
  "maxStatsNotes": 200,
  "useWikilinks": false,
  "lastWeekKey": null
}
```

`lastWeekKey` wird nach erfolgreichem Schreiben gesetzt; bei Speicherfehler Rollback der Einstellungen.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Bestätigung, `notes.open` |
| `notes:read` | Notizen listen, Existenz prüfen, Ordnerbaum |
| `notes:write` | Digest anlegen / überschreiben |
| `stats:read` | Optional `focusMs` für Fokusminuten-Stichprobe |
| `storage` | Einstellungen inkl. `lastWeekKey` |
| `vault:write` | Fehlenden Ordner (z. B. `Digests`) anlegen |

### Grenzen (ehrlich)

- Fokusminuten sind eine **Stichprobe**: bis zu `maxStatsNotes` zuletzt geänderte `.md`/`.markdown`-Notizen, Summe von `stats.focusMs` (Lifetime-pro-Notiz in FaNotes) – **keine** kalibrierte Wochen-Attribution.
- Geänderte Notizen: `modifiedAt` in lokalem Mo 00:00–So Ende, Sortierung `modifiedAt` absteigend (`localeCompare`), dann Cap `maxNotes`.
- Existierendes Digest: immer **Bestätigung** vor Überschreiben (create-or-confirm).
- **Kein** Auto-Scan und **kein** Auto-Schreiben in `onActivate`.
- Toasts nur `info` | `success` | `error`.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.list` / `create` / `write` / `open`, `vault.createFolder`, `stats.read`, `ui.confirm`, `storage`).

---

## English

### What it does

- **Open Weekly Digest:** Panel `digest` with `weekKey`, notes in range, focus minutes, preview list (max 20 titles).
- **Write weekly digest:** Builds preview, creates `folder/weekKey.md`, or asks via `ui.confirm` if it already exists (no silent overwrite).
- **Open weekly digest note:** `notes.open` when the file exists, otherwise an info toast.
- **ISO week:** local Monday–Sunday, key `YYYY-Www` (week-year from Thursday).
- **Scan gate:** Vault/stats scan only on panel open, “Refresh preview”, or write – **not** in `onActivate`.

### Markdown body

```markdown
# Wochenrückblick YYYY-Www / Weekly Digest

## Aktivität / Activity
- Notes changed: N
- Focus minutes (sample, Cap …): M

## Geänderte Notizen / Edited notes
- Title — path.md
```

With `useWikilinks: true` (storage, default off): `- [[Title]]` instead of title + path.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Weekly Digest*
   - *Write weekly digest*
   - *Open weekly digest note*
2. In the panel: **Write digest** (only primary), **Refresh preview**, **Open**; focus-minutes checkbox persists immediately.

### Storage

Key `settings`:

```json
{
  "folder": "Digests",
  "includeStats": true,
  "maxNotes": 50,
  "maxStatsNotes": 200,
  "useWikilinks": false,
  "lastWeekKey": null
}
```

`lastWeekKey` is set after a successful write; settings roll back if storage save fails.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, confirm, `notes.open` |
| `notes:read` | List notes, existence checks, folder tree |
| `notes:write` | Create / overwrite the digest |
| `stats:read` | Optional `focusMs` for the focus-minutes sample |
| `storage` | Settings including `lastWeekKey` |
| `vault:write` | Create missing folder (e.g. `Digests`) |

### Limits (honest)

- Focus minutes are a **sample**: up to `maxStatsNotes` most recently modified `.md`/`.markdown` notes, sum of `stats.focusMs` (lifetime per note in FaNotes) – **not** calibrated week-only attribution.
- Edited notes: `modifiedAt` within local Mon 00:00–Sun end, sort `modifiedAt` descending (`localeCompare`), then Cap `maxNotes`.
- Existing digest: always **confirm** before overwrite (create-or-confirm).
- **No** auto-scan and **no** auto-write in `onActivate`.
- Toasts only `info` | `success` | `error`.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.list` / `create` / `write` / `open`, `vault.createFolder`, `stats.read`, `ui.confirm`, `storage`).
