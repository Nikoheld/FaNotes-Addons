# Meist geöffnet / Hot Notes

Rankt **Markdown-Notizen nach Öffnungen (`openCount`) oder Verweildauer (`dwellMs` / `focusMs`)** aus der FaNotes-Seitenstatistik (`.famd`).

Ranks **Markdown notes by opens (`openCount`) or dwell/focus time (`dwellMs` / `focusMs`)** from FaNotes page stats (`.famd`).

> **Abgrenzung / vs writing-streak · weekly-digest · note-statistics**
> - `writing-streak` aggregiert **Serie / Fokuszeit** über viele Notizen (Streak-Tage, Wochenziel).
> - `weekly-digest` baut eine **Wochenübersicht** (neu/geändert + Fokus-Stichprobe).
> - `note-statistics` (falls vorhanden) ist die **breitere Statistik-UI** pro Notiz.
> - `hot-notes` liefert nur ein **Ranking** der meist geöffneten / längsten Verweil-/Fokuszeiten — kein Streak, kein Digest, kein Schreiben.
>
> **Distinction:** `writing-streak` = streak/focus aggregate; `weekly-digest` = week overview; `note-statistics` = broader per-note stats UI; `hot-notes` = ranking only.

> **v1:** Kein Schreiben, kein Netzwerk, kein Vault. Nur `.md` / `.markdown`. Status standardmäßig aus. Scan-Gate.
> **v1:** No write, no network, no vault. `.md` / `.markdown` only. Status off by default. Scan gate.

---

## Deutsch

### Was es tut

- **Hot Notes öffnen:** Panel `hot` mit Key-Value (**Gescannt** | **Top**), Select **Metrik**, Eingaben Ordner + Top N, ein Primary-Button **Aktualisieren**, Liste mit Rang-Badge.
- **Hot-Scan aktualisieren:** Listet Notizen neu und rankt die Seitenstatistik.
- **Top Hot Note öffnen:** Öffnet Rang 1 der aktuellen Metrik; Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`.
- **Statusleiste:** `🔥 N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = Listenlänge); **Klick öffnet das Panel**.

### Scan-Ablauf

1. `notes.list` → nur `.md` / `.markdown`, Ordner-Präfix.
2. Sortierung `modifiedAt` **DESC** (`localeCompare`; fehlendes Datum zuletzt), Slice `maxNotes` (Standard 300, Clamp 50–1000).
3. Pro Notiz `fanotes.stats.read(path)` (Fehler → überspringen): Felder `openCount`, `dwellMs`, `focusMs` (fehlend = 0; Soft-Aliasse `opens` / `dwell` / nested `focus.ms`).
4. Sortierung nach Metrik-Wert **DESC**, dann Pfad; Slice `topN` (Standard 40, Clamp 5–200).
5. Zeilen: `{ path, title, value, openCount, dwellMs, focusMs }`.

Detail: bei `openCount` z. B. `12× geöffnet`; bei `dwellMs` / `focusMs` `Math.round(ms/60000) + ' min'`.

**Soft:** Notizen mit Wert 0 bleiben im Ranking und landen durch DESC am Ende (werden oft vom `topN`-Slice abgeschnitten, wenn genug >0 vorhanden sind).

### Scan-Gate

`notes.list` / `stats.read` **nicht** in `onActivate` (nur Settings laden + kalten Status entfernen). Scan bei:

1. Panel öffnen (Befehl **Hot Notes öffnen**)
2. Button **Aktualisieren**
3. Befehl **Hot-Scan aktualisieren**
4. Befehl **Top Hot Note öffnen**

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Hot Notes öffnen*
   - *Hot-Scan aktualisieren*
   - *Top Hot Note öffnen*
2. Im Panel: Metrik / Ordner / Top N setzen → **Aktualisieren**, Zeile anklicken.

### Speicher

`settings`:

```json
{
  "maxNotes": 300,
  "metric": "openCount",
  "topN": 40,
  "folder": "",
  "showStatus": false
}
```

- `maxNotes`: 50–1000 (Scan-Cap vor Stats-Reads)
- `metric`: `openCount` | `dwellMs` | `focusMs`
- `topN`: 5–200 (Listen-Cap)
- `folder`: vault-relativer Präfix, leer = alle Notizen; kein `..`
- `showStatus`: Status `🔥 N` (Standard `false`)

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste |
| `notes:read` | Notizen listen (`notes.list`) und öffnen (`notes.open`) |
| `stats:read` | Seitenstatistik lesen (`stats.read` → `openCount` / `dwellMs` / `focusMs`) |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`, **kein** `vault`.

`stats:read` ist nötig, weil Öffnungszahl und Verweil-/Fokuszeiten nur in der `.famd`-Seitenstatistik liegen — nicht in `notes.list`-Metadaten.

### Grenzen (ehrlich)

- Stats sind **Lifetime pro Notiz** (FaNotes-Seite), keine kalibrierte Session-/Wochen-Attribution.
- Scan-Cap `maxNotes` (zuletzt geänderte zuerst) — sehr alte, aber oft geöffnete Notizen können fehlen.
- Nur `.md` / `.markdown` (keine PDFs).
- Status erscheint erst nach Nutzer-Scan in der Session.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Hot Notes:** Panel `hot` with key-value (**Scanned** | **Top**), **Metric** select, folder + Top N inputs, one primary **Refresh**, list with rank badge.
- **Refresh hot scan:** Re-lists notes and re-ranks page stats.
- **Open top hot note:** Opens rank 1 for the current metric; toast if none.
- **Click** a list row → `notes.open`.
- **Status bar:** `🔥 N` only when `showStatus` and scanned at least once this session (`N` = list length); **click opens the panel**.

### Scan flow

1. `notes.list` → `.md` / `.markdown` only, folder prefix.
2. Sort `modifiedAt` **DESC** (`localeCompare`; missing dates last), slice `maxNotes` (default 300, clamp 50–1000).
3. Per note `fanotes.stats.read(path)` (failures skipped): fields `openCount`, `dwellMs`, `focusMs` (missing = 0; soft aliases `opens` / `dwell` / nested `focus.ms`).
4. Sort by metric value **DESC**, then path; slice `topN` (default 40, clamp 5–200).
5. Rows: `{ path, title, value, openCount, dwellMs, focusMs }`.

Detail: `openCount` e.g. `12 opens`; `dwellMs` / `focusMs` as `Math.round(ms/60000) + ' min'`.

**Soft:** Zero-value notes stay in the ranking and land last under DESC (often cut by the `topN` slice when enough >0 exist).

### Scan gate

No `notes.list` / `stats.read` in `onActivate` (settings only + remove cold status). Scan on:

1. Panel open (**Open Hot Notes**)
2. **Refresh** button
3. **Refresh hot scan** command
4. **Open top hot note** command

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Hot Notes*
   - *Refresh hot scan*
   - *Open top hot note*
2. In the panel: set metric / folder / Top N → **Refresh**, click a row.

### Storage

Same `settings` shape as above.

- `maxNotes`: 50–1000
- `metric`: `openCount` | `dwellMs` | `focusMs`
- `topN`: 5–200
- `folder`: vault-relative prefix, empty = all notes; no `..`
- `showStatus`: status `🔥 N` (default `false`)

Settings persist with rollback (toast + restore on failure).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar |
| `notes:read` | List notes (`notes.list`) and open (`notes.open`) |
| `stats:read` | Read page stats (`stats.read` → `openCount` / `dwellMs` / `focusMs`) |
| `storage` | Settings |

**No** `notes:write`, **no** `network`, **no** `vault`.

`stats:read` is required because open counts and dwell/focus times live only in `.famd` page stats — not in `notes.list` metadata.

### Limits (honest)

- Stats are **lifetime per note** (FaNotes page), not calibrated session/week attribution.
- Scan cap `maxNotes` (most recently modified first) — very old but often-opened notes may be missing.
- `.md` / `.markdown` only (no PDFs).
- Status appears only after a user-triggered scan in the session.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
