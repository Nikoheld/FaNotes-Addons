# Zuletzt erstellt / Recently Created

Listet **Notizen nach Erstelldatum (`createdAt`) bzw. erstem Öffnen (`firstOpenedAt`)** aus der FaNotes-Seitenstatistik (`.famd`).

Lists **notes by creation date (`createdAt`) or first open (`firstOpenedAt`)** from FaNotes page stats (`.famd`).

> **Abgrenzung / vs hot-notes · stale-notes · weekly-digest**
> - `hot-notes` rankt nach **Öffnungen / Verweil** (`openCount` / `dwellMs` / `focusMs`).
> - `stale-notes` findet **altes `modifiedAt`** (Schwellen-Alter).
> - `weekly-digest` baut eine **Wochenübersicht** (neu/geändert in der Woche).
> - `recently-created` liefert nur ein **Ranking nach `createdAt` / `firstOpenedAt`** — kein Hot-Score, kein Alter-Filter, kein Wochen-Digest.
>
> **Distinction:** `hot-notes` = openCount/dwell; `stale-notes` = old modifiedAt; `weekly-digest` = week modified; `recently-created` = createdAt/firstOpenedAt ranking only.

> **v1:** Kein Schreiben, kein Netzwerk, kein Vault. Nur `.md` / `.markdown`. Status standardmäßig aus. Scan-Gate.
> **v1:** No write, no network, no vault. `.md` / `.markdown` only. Status off by default. Scan gate.

---

## Deutsch

### Was es tut

- **Zuletzt erstellt öffnen:** Panel `created` mit Key-Value (**Gescannt** | **Top**), Select **Datumsfeld**, Eingaben Ordner + Top N, ein Primary-Button **Aktualisieren**, Liste mit Rang-Badge.
- **Erstellt-Scan aktualisieren:** Listet Notizen neu und rankt nach Erstell-/Erstöffnungsdatum.
- **Neueste Notiz öffnen:** Öffnet Rang 1 des aktuellen Feldes (Cache Soft oder Scan); Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`.
- **Statusleiste:** `✨ N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = Listenlänge); **Klick öffnet das Panel**.

### Scan-Ablauf

1. `notes.list` → nur `.md` / `.markdown`, Ordner-Präfix Soft (`folder` leer = alle).
2. Sortierung `modifiedAt` **DESC** (`localeCompare`; fehlendes Datum zuletzt), Slice `maxNotes` (**Sample-Cap**, Standard 300, Clamp 50–2000 Soft).
3. Pro Notiz `fanotes.stats.read(path)` (Fehler → überspringen Soft): bevorzugtes Feld nehmen; Soft-Fallback, wenn fehlend:
   - Feld `createdAt`: `createdAt` → `firstOpenedAt` → `modifiedAt` → Zeile Soft überspringen
   - Feld `firstOpenedAt`: `firstOpenedAt` → `modifiedAt` → Zeile Soft überspringen
4. Sortierung nach Datum **DESC**, dann Pfad; Slice `topN` (Standard 40, Clamp 5–200 Soft).
5. Zeilen: `{ path, title, date, source }`. Detail Soft: Locale-Datum · Pfad.

**Ältere `.famd` ohne `createdAt` Soft:** Fallback auf `firstOpenedAt` bzw. `modifiedAt`; fehlen alle drei, wird die Zeile fürs Ranking Soft übersprungen.

### Scan-Gate

`notes.list` / `stats.read` **nicht** in `onActivate` (nur Settings laden + kalten Status entfernen). Scan bei:

1. Panel öffnen (Befehl **Zuletzt erstellt öffnen**)
2. Button **Aktualisieren**
3. Befehl **Erstellt-Scan aktualisieren**
4. Befehl **Neueste Notiz öffnen** (wenn kein Cache Soft)

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Zuletzt erstellt öffnen*
   - *Erstellt-Scan aktualisieren*
   - *Neueste Notiz öffnen*
2. Im Panel: Datumsfeld / Ordner / Top N setzen → **Aktualisieren**, Zeile anklicken.

### Speicher

`settings`:

```json
{
  "maxNotes": 300,
  "topN": 40,
  "folder": "",
  "field": "createdAt",
  "showStatus": false
}
```

- `maxNotes`: 50–2000 Soft (Sample-Cap vor Stats-Reads)
- `topN`: 5–200 Soft (Listen-Cap)
- `folder`: vault-relativer Präfix, leer = alle Notizen; kein `..`
- `field`: `createdAt` | `firstOpenedAt`
- `showStatus`: Status `✨ N` Soft (Standard `false`)

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste |
| `notes:read` | Notizen listen (`notes.list`) und öffnen (`notes.open`) |
| `stats:read` | Seitenstatistik lesen (`stats.read` → `createdAt` / `firstOpenedAt` / `modifiedAt`) |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`, **kein** `vault`.

`stats:read` ist nötig, weil `createdAt` / `firstOpenedAt` nur in der `.famd`-Seitenstatistik liegen — nicht zuverlässig in `notes.list`-Metadaten.

### Grenzen (ehrlich)

- **Sample-Cap** `maxNotes` (zuletzt geänderte zuerst) — sehr alte, aber „neu erstellte“ Metadaten können fehlen, wenn der Cap greift.
- Ältere `.famd` ohne `createdAt` Soft → Fallback; manche Notizen fallen ganz aus dem Ranking.
- Nur `.md` / `.markdown` (keine PDFs).
- Status erscheint erst nach Nutzer-Scan in der Session.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Recently Created:** Panel `created` with key-value (**Scanned** | **Top**), **Date field** select, folder + Top N inputs, one primary **Refresh**, list with rank badge.
- **Refresh created scan:** Re-lists notes and re-ranks by creation / first-open date.
- **Open newest note:** Opens rank 1 for the current field (cache Soft or scan); toast if none.
- **Click** a list row → `notes.open`.
- **Status bar:** `✨ N` only when `showStatus` and scanned at least once this session (`N` = list length); **click opens the panel**.

### Scan flow

1. `notes.list` → `.md` / `.markdown` only, folder prefix Soft (`folder` empty = all).
2. Sort `modifiedAt` **DESC** (`localeCompare`; missing dates last), slice `maxNotes` (**sample cap**, default 300, clamp 50–2000 Soft).
3. Per note `fanotes.stats.read(path)` (failures skipped Soft): take preferred field; Soft fallback when missing:
   - field `createdAt`: `createdAt` → `firstOpenedAt` → `modifiedAt` → skip row Soft
   - field `firstOpenedAt`: `firstOpenedAt` → `modifiedAt` → skip row Soft
4. Sort by date **DESC**, then path; slice `topN` (default 40, clamp 5–200 Soft).
5. Rows: `{ path, title, date, source }`. Detail Soft: locale date · path.

**Older `.famd` without `createdAt` Soft:** falls back to `firstOpenedAt` or `modifiedAt`; if all three are missing, the row is skipped Soft for ranking.

### Scan gate

No `notes.list` / `stats.read` in `onActivate` (settings only + remove cold status). Scan on:

1. Panel open (**Open Recently Created**)
2. **Refresh** button
3. **Refresh created scan** command
4. **Open newest note** command (when no cache Soft)

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Recently Created*
   - *Refresh created scan*
   - *Open newest note*
2. In the panel: set date field / folder / Top N → **Refresh**, click a row.

### Storage

Same `settings` shape as above.

- `maxNotes`: 50–2000 Soft
- `topN`: 5–200 Soft
- `folder`: vault-relative prefix, empty = all notes; no `..`
- `field`: `createdAt` | `firstOpenedAt`
- `showStatus`: status `✨ N` Soft (default `false`)

Settings persist with rollback (toast + restore on failure).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar |
| `notes:read` | List notes (`notes.list`) and open (`notes.open`) |
| `stats:read` | Read page stats (`stats.read` → `createdAt` / `firstOpenedAt` / `modifiedAt`) |
| `storage` | Settings |

**No** `notes:write`, **no** `network`, **no** `vault`.

`stats:read` is required because `createdAt` / `firstOpenedAt` live only in `.famd` page stats — not reliably in `notes.list` metadata.

### Limits (honest)

- **Sample cap** `maxNotes` (most recently modified first) — very old notes with “new” creation metadata may be missing when the cap applies.
- Older `.famd` without `createdAt` Soft → fallback; some notes drop out of the ranking entirely.
- `.md` / `.markdown` only (no PDFs).
- Status appears only after a user-triggered scan in the session.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
