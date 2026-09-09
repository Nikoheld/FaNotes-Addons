# Tinten-Übersicht / Ink Summary

Zeigt die **Stift-/Tinten-Statistik der aktiven Notiz** (Striche, Handschrift/Kunst, Zeit, Länge, Farben) aus `.famd`-Seitenstatistik – optional Soft-Abgleich mit `ink.read`. **Kein Vault-Scan.**

Shows **pen/ink stats for the active note** (strokes, handwriting/art, time, length, colors) from `.famd` page stats – optional Soft cross-check via `ink.read`. **No vault scan.**

**Abgrenzung:** `note-statistics` = allgemeine Seitenstatistik; `writing-streak` = Vault-weite Schreib-/Stift-Serie; **hier** = Ink-Fokus auf die aktive Notiz (+ optional `ink.read` Stroke-Count).

---

## Deutsch

### Was es tut

- **Panel `ink`:** Kennzahlen Striche | Handschrift | Kunst | Zeit (min) | Länge (mm) | Farben (n); Farbenliste (max. 8, muted); eine Primary-Schaltfläche **Aktualisieren**.
- **Statusleiste** `✒️ Nm` (N = Stiftminuten): nur wenn `showStatus` und Striche > 0; Klick öffnet das Panel.
- **Befehle:** Panel öffnen, aktualisieren, Zusammenfassung als Toast (**keine** Zwischenablage).
- Daten nur von der **aktiven** Notiz: `notes.active()` → `stats.read(path)` (`stats.ink.*`); optional `ink.read` Soft.

### Datenfluss

1. `notes.active()` – fehlt `path` → leerer Zustand / Toast.
2. `stats.read(path)` → Soft: nested `stats.ink.*` (`penDownMs`, `ms`, `strokes`, `points`, `lengthMm`, `colors[]`, `handwritingStrokes`, `artStrokes`); fehlend → `0`.
3. Optional `ink.read(path)` → `strokes.length` Soft-Abgleich; bei `null` ignorieren.
4. Zeit: `Math.round(ms/60000) + ' min'` Soft aus `ink.ms` oder `penDownMs`.
5. `preferStats` (Standard an): Strichzahl aus Stats; aus → `ink.read`-Count wenn verfügbar. Soft: wenn Stats 0, Live-Ink > 0 → Live-Count.

### Bedienung

1. Öffne eine Notiz (Markdown/Stift mit `.famd`-Stats).
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Tinten-Übersicht öffnen*
   - *Tinte aktualisieren*
   - *Zusammenfassung anzeigen* (Toast, keine Zwischenablage)
3. Im Panel: Statusleiste / Statistik bevorzugen, **Aktualisieren**.

### Einstellungen (Speicher)

Schlüssel `settings`:

```json
{
  "showStatus": true,
  "preferStats": true
}
```

- `showStatus`: Statusleisten-Eintrag (Standard `true`)
- `preferStats`: Strichzahl aus `stats.ink` bevorzugen (Standard `true`)
- Speichern mit Rollback bei Fehler

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Statusleiste, Toasts |
| `notes:read` | Aktive Notiz (`notes.active`), Ereignisse |
| `stats:read` | Seitenstatistik `stats.ink.*` |
| `ink:read` | Optional Soft-Abgleich `ink.read` |
| `storage` | Einstellungen |

**Kein** `network`, **kein** `clipboard`, **kein** `vault:write` / Notiz schreiben.

### Grenzen

- **Nur aktive Notiz** – kein Vault-Listen-Scan.
- Abhängig von **`.famd`-Stats**; **PDF ohne Ink** bleibt leer (Nullen / leerer Zustand).
- Live-Refresh bei `note:opened` / `note:saved` nur wenn Status an **oder** Panel geöffnet (Debounce).
- Activate: bei `showStatus` und aktiver Notiz **ein** `stats.read` (active-only).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `API.md` (`stats.ink.*`, `ink.read`), `UI_BLOCKS.md`, `PERMISSIONS.md`.

---

## English

### What it does

- **Panel `ink`:** Key values Strokes | Handwriting | Art | Time (min) | Length (mm) | Colors (n); muted color list (max 8); one primary **Refresh** button.
- **Status bar** `✒️ Nm` (N = pen minutes): only when `showStatus` and strokes > 0; click opens the panel.
- **Commands:** open panel, refresh, show summary as toast (**no** clipboard).
- Data from the **active** note only: `notes.active()` → `stats.read(path)` (`stats.ink.*`); optional Soft `ink.read`.

### Data flow

1. `notes.active()` – missing `path` → empty state / toast.
2. `stats.read(path)` → Soft: nested `stats.ink.*` (`penDownMs`, `ms`, `strokes`, `points`, `lengthMm`, `colors[]`, `handwritingStrokes`, `artStrokes`); missing → `0`.
3. Optional `ink.read(path)` → `strokes.length` Soft cross-check; ignore when `null`.
4. Time: `Math.round(ms/60000) + ' min'` Soft from `ink.ms` or `penDownMs`.
5. `preferStats` (default on): stroke count from stats; off → `ink.read` count when available. Soft: if stats are 0 but live ink > 0 → live count.

### Usage

1. Open a note (Markdown/pen with `.famd` stats).
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Ink Summary*
   - *Refresh ink stats*
   - *Show summary* (toast, no clipboard)
3. In the panel: toggle status bar / prefer stats, **Refresh**.

### Settings (storage)

Key `settings`:

```json
{
  "showStatus": true,
  "preferStats": true
}
```

- `showStatus`: status-bar item (default `true`)
- `preferStats`: prefer stroke count from `stats.ink` (default `true`)
- Persist with rollback on failure

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, status bar, toasts |
| `notes:read` | Active note (`notes.active`), events |
| `stats:read` | Page stats `stats.ink.*` |
| `ink:read` | Optional Soft cross-check `ink.read` |
| `storage` | Persist settings |

**No** `network`, **no** `clipboard`, **no** `vault:write` / note writes.

### Limits

- **Active note only** – no vault list scan.
- Depends on **`.famd` stats**; **PDFs without ink** stay empty (zeros / empty state).
- Live refresh on `note:opened` / `note:saved` only when status is on **or** the panel is open (debounced).
- Activate: with `showStatus` and an active note, **one** `stats.read` (active-only).
- Command titles follow the UI language at start; reload the add-on after a language switch.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `API.md` (`stats.ink.*`, `ink.read`), `UI_BLOCKS.md`, `PERMISSIONS.md`.

---

## Lizenz / License

MIT
