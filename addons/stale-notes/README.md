# Veraltete Notizen / Stale Notes

Findet **Markdown-Notizen, deren `modifiedAt` älter als N Tage ist** (oder fehlt). Panel mit Schwelle, Ordnerfilter und Liste (älteste zuerst).

Finds **Markdown notes whose `modifiedAt` is older than N days** (or missing). Panel with threshold, folder filter, and list (oldest first).

> **Abgrenzung / vs orphan-notes:** `orphan-notes` sucht nach **Wikilinks** (aus-/eingehend). `stale-notes` bewertet nur das **Alter** über `modifiedAt` — keine Link-Analyse, kein `notes.read` der Inhalte.
> **Distinction / vs orphan-notes:** `orphan-notes` looks for **wikilinks** (out-/incoming). `stale-notes` only looks at **age** via `modifiedAt` — no link analysis, no body `notes.read`.

> **v1:** Kein Schreiben, kein Löschen/Papierkorb. Nur `.md` / `.markdown`. Status standardmäßig aus.
> **v1:** No write, no trash. `.md` / `.markdown` only. Status off by default.

---

## Deutsch

### Was es tut

- **Veraltete Notizen öffnen:** Panel `stale` mit Key-Value (**Schwelle** | **Anzahl**), Eingaben Tage + Ordner, Buttons **Übernehmen** | **Aktualisieren** (einziger Primary), Liste (max. `maxList`, Standard 80).
- **Veraltet-Scan aktualisieren:** Listet Notizen neu und filtert nach Alter.
- **Älteste veraltete Notiz öffnen:** Öffnet den ersten Eintrag (fehlendes Datum zuerst, dann ältestes `modifiedAt`); Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`.
- **Statusleiste:** `⏳ N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = Anzahl veralteter Notizen); **Klick öffnet das Panel**.

### Was „veraltet“ bedeutet

Eine Notiz gilt als veraltet, wenn:

1. `modifiedAt` **fehlt** / nicht parsebar ist, **oder**
2. `modifiedAt` **älter** ist als `now − days` (Standard `days = 30`).

Sortierung: fehlende Daten zuerst, danach `modifiedAt` aufsteigend (`localeCompare`, älteste zuerst), Tiebreak Pfad. Die Liste wird auf `maxList` (1–200) gekürzt; die Gesamtzahl steht unter **Anzahl**.

### Scan-Gate

`notes.list` **nicht** in `onActivate` (nur Settings laden + kalten Status entfernen). Scan bei:

1. Panel öffnen (Befehl **Veraltete Notizen öffnen**)
2. Button **Aktualisieren** / **Übernehmen** (nach Speichern)
3. Befehl **Veraltet-Scan aktualisieren**
4. Befehl **Älteste veraltete Notiz öffnen**

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Veraltete Notizen öffnen*
   - *Veraltet-Scan aktualisieren*
   - *Älteste veraltete Notiz öffnen*
2. Im Panel: Tage und optional Ordner setzen → **Übernehmen** oder **Aktualisieren** (Primary), Zeile anklicken.

### Speicher

`settings`:

```json
{
  "days": 30,
  "folder": "",
  "maxList": 80,
  "showStatus": false
}
```

- `days`: 1–3650 (Tage ohne Änderung)
- `folder`: vault-relativer Präfix, leer = alle Notizen; kein `..`
- `maxList`: 1–200 (Listen-Cap)
- `showStatus`: Status `⏳ N` (Standard `false`)

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen (`notes.list`) |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`. v1 schreibt/löscht nichts.

### Grenzen (ehrlich)

- Nur Metadaten aus `notes.list` — **kein** Lesen der Notiz-Inhalte.
- Nur `.md` / `.markdown` (keine PDFs).
- Liste im Panel max. **`maxList`** (Standard 80); Gesamtzahl im Key-Value.
- Relatives Alter im Detail z. B. `vor 45d` (ganze Tage, lokal zur Gerätezeit).
- Status erscheint erst nach Nutzer-Scan in der Session (kein Kaltstart-Status).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- „Veraltet“ ≠ ungenutzt: nur `modifiedAt`, nicht Öffnungs-/Lesehistorie.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Stale Notes:** Panel `stale` with key-value (**Threshold** | **Count**), days + folder inputs, **Apply** | **Refresh** buttons (only primary), list (max `maxList`, default 80).
- **Refresh stale scan:** Re-lists notes and filters by age.
- **Open oldest stale note:** Opens the first list entry (missing date first, then oldest `modifiedAt`); toast if none.
- **Click** a list row → `notes.open`.
- **Status bar:** `⏳ N` only when `showStatus` and scanned at least once this session (`N` = stale count); **click opens the panel**.

### What “stale” means

A note is stale when:

1. `modifiedAt` is **missing** / unparseable, **or**
2. `modifiedAt` is **older** than `now − days` (default `days = 30`).

Sort: missing dates first, then `modifiedAt` ascending (`localeCompare`, oldest first), path tiebreak. The list is sliced to `maxList` (1–200); the total is under **Count**.

### Scan gate

No `notes.list` in `onActivate` (settings only + remove cold status). Scan on:

1. Panel open (**Open Stale Notes**)
2. **Refresh** / **Apply** (after save)
3. **Refresh stale scan** command
4. **Open oldest stale note** command

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Stale Notes*
   - *Refresh stale scan*
   - *Open oldest stale note*
2. In the panel: set days and optional folder → **Apply** or **Refresh** (primary), click a row.

### Storage

Same `settings` shape as above.

- `days`: 1–3650
- `folder`: vault-relative prefix, empty = all notes; no `..`
- `maxList`: 1–200
- `showStatus`: status `⏳ N` (default `false`)

Settings persist with rollback (toast + restore on failure).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List notes (`notes.list`) |
| `storage` | Settings |

**No** `notes:write`, **no** `network`. v1 does not write or trash.

### Limits (honest)

- Metadata from `notes.list` only — **no** note body reads.
- `.md` / `.markdown` only (no PDFs).
- Panel list capped at **`maxList`** (default 80); total is in the key-value.
- Relative age in detail e.g. `45d ago` (whole days, device-local time).
- Status appears only after a user-triggered scan in the session.
- Command titles follow UI language at start; reload the add-on after a language switch.
- “Stale” ≠ unused: only `modifiedAt`, not open/read history.

### Version

1.0.0 – initial release.
