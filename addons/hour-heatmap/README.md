# Stunden-Heatmap / Hour Heatmap

Aggregiert **Fokus-/Öffnungszeiten nach Tagesstunde** (`opensByHour` / `dwellByHour`) aus der FaNotes-Seitenstatistik (`.famd`) zu einem **24h-Profil**.

Aggregates **focus/open times by hour of day** (`opensByHour` / `dwellByHour`) from FaNotes page stats (`.famd`) into a **24h profile**.

> **Abgrenzung / vs writing-streak · hot-notes · weekly-digest**
> - `writing-streak` = **Serie** (Streak-Tage, Wochenziel).
> - `hot-notes` = **Ranking** einzelner Notizen nach Öffnungen/Verweilzeit.
> - `weekly-digest` = **Wochenübersicht**.
> - `hour-heatmap` = **24h-Profil** (Chronotyp / Tagesstunden) — kein Streak, kein Ranking, kein Digest.
>
> **Distinction:** `writing-streak` = streak; `hot-notes` = note ranking; `weekly-digest` = week overview; `hour-heatmap` = 24h hour-of-day profile.

> **v1:** Kein Schreiben, kein Vault, kein Netzwerk, kein Editor, kein Clipboard. Nur `.md` / `.markdown`. Scan-Gate.
> **v1:** No write, no vault, no network, no editor, no clipboard. `.md` / `.markdown` only. Scan gate.

---

## Deutsch

### Was es tut

- **Stunden-Heatmap öffnen:** Panel `heat` mit Key-Value (**Peak-Stunde** | **Sample-Notizen**), Select **Metrik**, Eingabe Ordner, ein Primary-Button **Aktualisieren**, Soft-Balken `00 | ███ …` (Zeichen ░▒▓█) skaliert auf das Maximum.
- **Heatmap-Scan aktualisieren:** Listet Notizen neu und summiert die Stunden-Buckets.

### Scan-Ablauf

1. `notes.list` → nur `.md` / `.markdown`, Ordner-Präfix Soft.
2. Sortierung `modifiedAt` **DESC** (`localeCompare`; fehlendes Datum zuletzt), Slice **Sample-Cap** `maxNotes` (Standard 300, Clamp Soft 50–1000).
3. Pro Notiz `fanotes.stats.read(path)` (Fehler → überspringen Soft, wie hot-notes / writing-streak):
   - `opensByHour`: Array `stats.opensByHour`
   - `dwellByHour` / `focusProxy`: Array `stats.dwellByHour`
   - **Soft:** fehlende Felder / kein Array / kurze Arrays → **0** für die betroffenen Stunden.
4. Addieren in `buckets[24]`; Balken für Stunden **0–23** rendern.

**Soft focusProxy:** In der API gibt es **kein** separates `focusByHour`. Deshalb ist `focusProxy` ≡ `dwellByHour` Soft (gleiche Quelle; fehlt das Feld → Nullen).

### Scan-Gate

`notes.list` / `stats.read` **nicht** in `onActivate` (nur Settings laden). Scan bei:

1. Panel öffnen (Befehl **Stunden-Heatmap öffnen**)
2. Button **Aktualisieren**
3. Befehl **Heatmap-Scan aktualisieren**

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Stunden-Heatmap öffnen*
   - *Heatmap-Scan aktualisieren*
2. Im Panel: Metrik / Ordner setzen → **Aktualisieren**.

### Speicher

`settings`:

```json
{
  "maxNotes": 300,
  "metric": "dwellByHour",
  "folder": ""
}
```

- `maxNotes`: Sample-Cap 50–1000 (vor Stats-Reads)
- `metric`: `dwellByHour` | `opensByHour` | `focusProxy`
- `folder`: vault-relativer Präfix, leer = alle Notizen; kein `..`

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts |
| `notes:read` | Notizen listen (`notes.list`) |
| `stats:read` | Seitenstatistik lesen (`stats.read` → `opensByHour` / `dwellByHour`) |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `vault`, **kein** `network`, **kein** `editor`, **kein** `clipboard`.

### Grenzen (ehrlich)

- Stats sind **Lifetime pro Notiz** — kein kalibriertes Session-Tracking.
- Sample-Cap `maxNotes` (zuletzt geänderte zuerst) — sehr alte Notizen können fehlen.
- Nur `.md` / `.markdown` (keine PDFs).
- `focusProxy` ist Soft-Alias von `dwellByHour` (kein `focusByHour` in der API).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Hour Heatmap:** Panel `heat` with key-value (**Peak hour** | **Sample notes**), **Metric** select, folder input, one primary **Refresh**, Soft bars `00 | ███ …` (chars ░▒▓█) scaled to the maximum.
- **Refresh heatmap scan:** Re-lists notes and re-sums hour buckets.

### Scan flow

1. `notes.list` → `.md` / `.markdown` only, folder prefix Soft.
2. Sort `modifiedAt` **DESC** (`localeCompare`; missing dates last), slice **sample cap** `maxNotes` (default 300, Soft clamp 50–1000).
3. Per note `fanotes.stats.read(path)` (failure → skip Soft, same as hot-notes / writing-streak):
   - `opensByHour`: array `stats.opensByHour`
   - `dwellByHour` / `focusProxy`: array `stats.dwellByHour`
   - **Soft:** missing fields / non-array / short arrays → **0** for those hours.
4. Add into `buckets[24]`; render bars for hours **0–23**.

**Soft focusProxy:** The API has **no** separate `focusByHour`. Therefore `focusProxy` ≡ `dwellByHour` Soft (same source; missing field → zeros).

### Scan gate

`notes.list` / `stats.read` are **not** called in `onActivate` (settings load only). Scan on:

1. Opening the panel (command **Open Hour Heatmap**)
2. Button **Refresh**
3. Command **Refresh heatmap scan**

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Hour Heatmap*
   - *Refresh heatmap scan*
2. In the panel: set metric / folder → **Refresh**.

### Storage

`settings`:

```json
{
  "maxNotes": 300,
  "metric": "dwellByHour",
  "folder": ""
}
```

- `maxNotes`: sample cap 50–1000 (before stats reads)
- `metric`: `dwellByHour` | `opensByHour` | `focusProxy`
- `folder`: vault-relative prefix, empty = all notes; no `..`

Settings are saved with rollback (on failure: toast + previous value).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts |
| `notes:read` | List notes (`notes.list`) |
| `stats:read` | Read page stats (`stats.read` → `opensByHour` / `dwellByHour`) |
| `storage` | Settings |

**No** `notes:write`, **no** `vault`, **no** `network`, **no** `editor`, **no** `clipboard`.

### Limits (honest)

- Stats are **lifetime per note** — not calibrated session tracking.
- Sample cap `maxNotes` (most recently modified first) — very old notes may be missing.
- `.md` / `.markdown` only (no PDFs).
- `focusProxy` is a Soft alias of `dwellByHour` (no `focusByHour` in the API).
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
