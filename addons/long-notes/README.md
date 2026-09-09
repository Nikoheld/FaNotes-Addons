# Lange Notizen / Long Notes

Findet **sehr lange Markdown-Notizen** nach Zeichenlänge (≥ `minChars`) – Kandidaten zum Teilen. Panel mit Schwelle, Sortier-Metrik (Zeichen/Wörter), Ordnerfilter und Ranking.

Finds **very long Markdown notes** by character length (≥ `minChars`) – split candidates. Panel with threshold, sort metric (chars/words), folder filter, and ranking.

> **Abgrenzung / vs empty-notes · word-counter · note-splitter · hot-notes**
> - `empty-notes` = **kurze / leere** Notizen (Aufräumen).
> - `word-counter` = **aktive Zählung** der offenen Notiz.
> - `note-splitter` = **teilt** die offene Notiz an Überschriften.
> - `hot-notes` = Ranking nach **Öffnungen / Verweilzeit**.
> - `long-notes` = **Längen-Ranking** als Teil-Kandidaten – teilt selbst nichts.
>
> **Distinction:** `empty-notes` = short/empty; `word-counter` = live count; `note-splitter` = splits; `hot-notes` = opens/dwell; `long-notes` = length ranking only.

> **v1:** Kein Schreiben, kein Vault, kein Netzwerk, kein Editor. Nur `.md` / `.markdown`. Scan-Gate.
> **v1:** No write, no vault, no network, no editor. `.md` / `.markdown` only. Scan gate.

---

## Deutsch

### Was es tut

- **Lange Notizen öffnen:** Panel `long` mit Key-Value (**Schwelle** | **Treffer** | **gescannt** | **Top**), Eingabe `minChars`, Select **Metrik**, Ordner, ein Primary-Button **Aktualisieren**, Liste.
- **Lang-Scan aktualisieren:** Listet Notizen, liest bis zu `maxNotes` Körper, filtert ≥ `minChars`, rankt nach Metrik.
- **Längste Notiz öffnen:** Öffnet Rang 1 der aktuellen Metrik; Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`. Detail: `` `${chars} Z. / ${words} W. · path` ``.
- **Hinweis:** Gemuted Text verweist auf Addon **Notiz teilen / Note Splitter** zum tatsächlichen Teilen.

### Messungen (Soft)

```js
// chars Soft: full note body after notes.read
const chars = text.length

// words Soft
const words = text.trim().split(/\s+/).filter(Boolean).length
```

- Gate: immer `chars >= minChars` (auch wenn Metrik `words`).
- Sortierung: Metrik-Wert **DESC**, dann Pfad; Slice `topN`.

### Scan-Ablauf

1. `notes.list` → nur `.md` / `.markdown`, Ordner-Präfix (Soft).
2. Sortierung `modifiedAt` **DESC** (`localeCompare`; fehlendes Datum zuletzt), Slice `maxNotes` (Standard 400, Clamp 50–1000).
3. Pro Notiz `notes.read`; messen; behalten wenn `chars >= minChars`.
4. Sortierung nach Metrik (`chars` | `words`) **DESC**, Slice `topN` (Standard 50, Clamp 5–200).

### Scan-Gate

`notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings laden). Scan bei:

1. Panel öffnen (Befehl **Lange Notizen öffnen**)
2. Button **Aktualisieren**
3. Befehl **Lang-Scan aktualisieren**
4. Befehl **Längste Notiz öffnen**

Busy/Queue: parallele Scans werden gequeued (wie `empty-notes` / `hot-notes`).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Lange Notizen öffnen*
   - *Lang-Scan aktualisieren*
   - *Längste Notiz öffnen*
2. Im Panel: Schwelle / Metrik / Ordner setzen → **Aktualisieren** (Primary), Zeile anklicken.
3. Zum Teilen der gefundenen Notiz: Addon **Notiz teilen / Note Splitter**.

### Speicher

`settings`:

```json
{
  "maxNotes": 400,
  "minChars": 5000,
  "folder": "",
  "topN": 50,
  "metric": "chars"
}
```

- `maxNotes`: 50–1000 (Scan-Cap vor Reads, neueste zuerst)
- `minChars`: 100–1_000_000 (Zeichen-Schwelle, Soft-Gate immer)
- `folder`: vault-relativer Präfix, leer = alle; kein `..`
- `topN`: 5–200 (Listen-Cap)
- `metric`: `chars` | `words` (Sortierung; Gate bleibt Zeichen)

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, `notes.open` |
| `notes:read` | Notizen listen und lesen |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`, **kein** Vault, **kein** Editor.

### Grenzen (ehrlich)

- Höchstens **`maxNotes`** Markdown-Notizen werden gelesen (Standard 400, zuletzt geändert zuerst).
- Liste im Panel max. **`topN`** Einträge; Gesamtzahl unter **Treffer**.
- Zeichen = Roh-`text.length` (kein Frontmatter-Strip); Wörter = Soft-Whitespace-Split.
- Nur `.md` / `.markdown` (keine PDFs).
- Teilt Notizen nicht — nur Finden und Öffnen; Splitting = `note-splitter`.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Long Notes:** Panel `long` with key-value (**Threshold** | **Hits** | **scanned** | **Top**), `minChars` input, **Metric** select, folder, one primary **Refresh**, list.
- **Refresh long scan:** Lists notes, reads up to `maxNotes` bodies, filters ≥ `minChars`, ranks by metric.
- **Open longest note:** Opens rank 1 for the current metric; toast if none.
- **Click** a list row → `notes.open`. Detail: `` `${chars} chars / ${words} words · path` ``.
- **Hint:** Muted text points to the **Note Splitter** add-on for actual splitting.

### Measurements (Soft)

```js
// chars Soft: full note body after notes.read
const chars = text.length

// words Soft
const words = text.trim().split(/\s+/).filter(Boolean).length
```

- Gate: always `chars >= minChars` (even when metric is `words`).
- Sort: metric value **DESC**, then path; slice `topN`.

### Scan flow

1. `notes.list` → `.md` / `.markdown` only, folder prefix (Soft).
2. Sort `modifiedAt` **DESC** (`localeCompare`; missing dates last), slice `maxNotes` (default 400, clamp 50–1000).
3. Per note `notes.read`; measure; keep when `chars >= minChars`.
4. Sort by metric (`chars` | `words`) **DESC**, slice `topN` (default 50, clamp 5–200).

### Scan gate

No `notes.list` / `notes.read` in `onActivate` (settings only). Scan on:

1. Panel open (**Open Long Notes**)
2. **Refresh** button
3. **Refresh long scan** command
4. **Open longest note** command

Busy/queue: parallel scans are queued (like `empty-notes` / `hot-notes`).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Long Notes*
   - *Refresh long scan*
   - *Open longest note*
2. In the panel: set threshold / metric / folder → **Refresh** (primary), click a row.
3. To split a found note: use the **Note Splitter** add-on.

### Storage

Same `settings` shape as above.

- `maxNotes`: 50–1000 (scan cap before reads, newest first)
- `minChars`: 100–1_000_000 (character threshold; Soft gate always)
- `folder`: vault-relative prefix, empty = all; no `..`
- `topN`: 5–200 (list cap)
- `metric`: `chars` | `words` (sort only; gate stays characters)

Settings persist with rollback (toast + restore on failure).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, `notes.open` |
| `notes:read` | List and read notes |
| `storage` | Settings |

**No** `notes:write`, **no** `network`, **no** vault, **no** editor.

### Limits (honest)

- At most **`maxNotes`** Markdown notes are read (default 400, most recently modified first).
- Panel list capped at **`topN`**; total under **Hits**.
- Chars = raw `text.length` (no frontmatter strip); words = Soft whitespace split.
- `.md` / `.markdown` only (no PDFs).
- Does not split notes — find and open only; splitting = `note-splitter`.
- Command titles follow UI language at load; reload add-on after language switch.

### Version

1.0.0 – initial release.
