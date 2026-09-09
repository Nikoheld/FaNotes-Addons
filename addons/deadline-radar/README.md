# Frist-Radar / Deadline Radar

Scannt Markdown-Notizen nach **Kalenderdaten** (DE `TT.MM.JJJJ` und ISO `YYYY-MM-DD`), ordnet Treffer in **Überfällig / Heute / Diese Woche / Später** und zeigt optional die nächste Frist in der Statusleiste.

Scans Markdown notes for **calendar dates** (DE `DD.MM.YYYY` and ISO `YYYY-MM-DD`), buckets hits into **Overdue / Today / This week / Later**, and optionally shows the next deadline in the status bar.

---

## Deutsch

### Was es tut

- **Frist-Radar öffnen:** Panel mit Listen *Überfällig*, *Heute*, *Diese Woche*, *Später*; Klick öffnet die Notiz.
- **Fristen neu einlesen:** Liest bis zu `maxNotes` (Standard 400) `.md`/`.markdown`-Notizen (ohne `ignoreFolders`).
- **Nächste Frist anzeigen:** Toast mit der frühesten Frist im aktuellen Radar – oder Hinweis, dass keine da ist.
- **Statusleiste:** Kurzes Label der nächsten Frist (hoch/mittel); aus oder leer → Eintrag wird entfernt.
- **Einstellungen** im Panel: Vorausschau (`lookaheadDays`), `maxNotes`, ignorierte Ordner, Statusleisten-Schalter.

### Parser v1

| Muster | Beispiel |
| --- | --- |
| DE | `15.03.2026`, `1.9.2026` |
| ISO | `2026-03-15` |

- Hinweiswörter in ±40 Zeichen um das Datum: `fällig`, `abgabe`, `frist`, `deadline`, `due`, `until`, `bis` → **hohe** Sicherheit, sonst **mittel**.
- Daten innerhalb von ` ``` `-Codefences werden per Zeilen-Toggle ignoriert.
- Ungültige Kalenderdaten (z. B. `31.02.2026`) werden verworfen.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Frist-Radar öffnen*
   - *Fristen neu einlesen*
   - *Nächste Frist anzeigen*
2. Im Panel: **Neu einlesen**, Listen prüfen, Vorausschau anpassen (Enter speichert und scannt neu).
3. Optional: Statusleisten-Eintrag anklicken → Panel.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen/lesen, Speicher-Ereignisse |
| `storage` | Einstellungen (`lookaheadDays`, `ignoreFolders`, `maxNotes`, `showStatus`) |

**Kein** `notes:write`, **kein** `network`.

### Grenzen (ehrlich)

- **Kein** relativer Wochentags-Parser in v1 („nächsten Montag“, „Freitag“) – nur absolute DE-/ISO-Daten.
- Höchstens **`maxNotes`** Markdown-Notizen pro Scan (Standard 400); bei großen Vaults werden die **zuletzt geänderten** zuerst genommen (`modifiedAt` absteigend).
- Bei eingeschalteter Statusleiste wird nach Notiz-/Vault-Änderungen entprellt neu gescannt; bei ausgeschalteter Statusleiste und geschlossenem Panel entfällt der Hintergrund-Scan.
- Überfällige Treffer werden **nicht** zeitlich gekappt – sehr alte Daten erscheinen weiter unter *Überfällig*.
- „Diese Woche“ = bis einschließlich **Sonntag** der aktuellen Woche (Montag–Sonntag).
- Nur `.md` / `.markdown`; keine PDF-/Stiftinhalte.
- Listen im Panel max. 200 Einträge pro Abschnitt; Excerpt max. 80 Zeichen.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Speicher

- `settings`: `{ lookaheadDays, ignoreFolders, maxNotes, showStatus }`

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Deadline Radar:** Panel with *Overdue*, *Today*, *This week*, *Later*; click opens the note.
- **Rescan deadlines:** Reads up to `maxNotes` (default 400) `.md`/`.markdown` notes (respecting `ignoreFolders`).
- **Show next deadline:** Toast with the earliest hit in the current radar – or a “none” message.
- **Status bar:** Short label for the next deadline (high/medium); off or empty → item removed.
- **Settings** in the panel: lookahead (`lookaheadDays`), `maxNotes`, ignored folders, status-bar toggle.

### Parser v1

| Pattern | Example |
| --- | --- |
| DE | `15.03.2026`, `1.9.2026` |
| ISO | `2026-03-15` |

- Hint words within ±40 characters of the date: `fällig`, `abgabe`, `frist`, `deadline`, `due`, `until`, `bis` → **high** confidence, otherwise **medium**.
- Dates inside ` ``` ` code fences are ignored via a line-state toggle.
- Invalid calendar dates (e.g. `31.02.2026`) are dropped.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Deadline Radar*
   - *Rescan deadlines*
   - *Show next deadline*
2. In the panel: **Rescan**, inspect lists, adjust lookahead (Enter saves and rescans).
3. Optionally click the status-bar item → panel.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List/read notes, save events |
| `storage` | Settings (`lookaheadDays`, `ignoreFolders`, `maxNotes`, `showStatus`) |

**No** `notes:write`, **no** `network`.

### Limits (honest)

- **No** relative weekday parser in v1 (“next Monday”, “Friday”) – absolute DE/ISO dates only.
- At most **`maxNotes`** Markdown notes per scan (default 400); large vaults keep the **most recently modified** notes first (`modifiedAt` descending).
- With the status bar enabled, changes are rescanned on a debounce; with status bar off and panel closed, background rescans are skipped.
- Overdue hits are **not** time-capped – very old dates still appear under *Overdue*.
- “This week” = through **Sunday** of the current week (Monday–Sunday).
- `.md` / `.markdown` only; no PDF/ink content.
- Panel lists capped at 200 items per section; excerpts max 80 characters.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Storage

- `settings`: `{ lookaheadDays, ignoreFolders, maxNotes, showStatus }`

### Version

1.0.0 – initial release.

---

## Lizenz / License

MIT
