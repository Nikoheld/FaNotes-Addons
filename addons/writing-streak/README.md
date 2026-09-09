# Schreib-Serie / Writing Streak

Aggregiert die **stillen Seitenstatistiken** von FaNotes zu einer **Schreib-/Stift-Serie**, einem **Wochenziel** (Minuten) und optionaler Statusleisten-Anzeige – ohne extra Tracking.

Aggregates FaNotes **silent page stats** into a **typing/pen streak**, a **weekly goal** (minutes), and an optional status-bar item – no extra tracking.

---

## Deutsch

### Was es tut

- **Schreib-Serie öffnen:** Panel mit aktueller Serie, längster Serie, Minuten diese Woche, Wochenziel und Text-Fortschrittsbalken.
- **Serie neu berechnen:** Liest `stats.read` für bis zu `maxNotes` (Standard 400) `.md`/`.markdown`-Notizen (zuletzt geändert zuerst).
- **Wochenziel setzen:** Dialog (`ui.prompt`) oder Eingabe + „Ziel speichern“ im Panel.
- **Statusleiste:** `🔥 Nd` mit Tooltip (Serie + Wochenfortschritt); aus oder noch kein Scan → Eintrag entfernt.
- **Einstellungen** im Panel: Wochenziel, `countInk` (Stiftzeit `ink.ms` mitzählen), Statusleisten-Schalter.

### Aggregation

1. `notes.list()` → nur `.md`/`.markdown` → Sortierung `modifiedAt` absteigend (`localeCompare`) → `slice(0, maxNotes)`.
2. Pro Notiz `stats.read` (Fehler → Notiz überspringen); bei `countInk` zusätzlich `stats.ink.ms` (Fallback `penDownMs`).
3. Union aller `activeDays` (`YYYY-MM-DD`).
4. **Aktuelle Serie:** aufeinanderfolgende Tage bis heute; fehlt heute noch Aktivität, zählt gestern als fortsetzbar.
5. **Längste Serie:** längste zusammenhängende Folge in der Union.
6. **Diese Woche:** anteilige Summe von `focusMs` (+ `ink.ms` wenn `countInk`) für aktive Tage Mo–So der laufenden Woche (FaNotes speichert Fokuszeit lifetime pro Notiz – siehe Grenzen).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Schreib-Serie öffnen*
   - *Serie neu berechnen*
   - *Wochenziel setzen*
2. Im Panel: **Neu einlesen**, Ziel anpassen, Schalter setzen.
3. Optional: Statusleisten-Eintrag anklicken → Panel.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, Prompt |
| `notes:read` | Notizen listen, Speicher-/Vault-Ereignisse |
| `stats:read` | Seitenstatistiken (`activeDays`, `focusMs`, optional `stats.ink.*` für Stiftzeit) |
| `storage` | Einstellungen (`weeklyGoalMinutes`, `countInk`, `showStatus`, `maxNotes`) |

**Kein** `notes:write`, **kein** `network`, **kein** `editor`, **kein** `ink:read` (Stiftzeit kommt über `stats.ink`).

### Grenzen (ehrlich)

- **Keine** Kalender-Heatmap in v1.
- Höchstens **`maxNotes`** Markdown-Notizen pro Scan (Standard 400); große Vaults: zuletzt geänderte zuerst.
- Wochenminuten sind eine **Schätzung**: FaNotes liefert keine Fokus-ms pro Tag – der Anteil ergibt sich aus `(Tage aktiv diese Woche / activeDays gesamt) × focusMs` (+ Ink).
- PDF-/reine Stiftnotizen ohne Typing erscheinen nur über `activeDays` / Ink-Felder in den Stats; ohne Stats-Eintrag zählen sie nicht.
- Bei ausgeschalteter Statusleiste und geschlossenem Panel entfällt der Hintergrund-Scan (wie Deadline-Radar Scan-Gate).
- Activate startet keinen blockierenden Vollscan; nur bei `showStatus` ein nicht-awaiteter Warm-Scan.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Speicher

- `settings`: `{ weeklyGoalMinutes, countInk, showStatus, maxNotes }`

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Writing Streak:** Panel with current streak, longest streak, minutes this week, weekly goal, and a text progress bar.
- **Rescan streak:** Runs `stats.read` for up to `maxNotes` (default 400) `.md`/`.markdown` notes (most recently modified first).
- **Set weekly goal:** Dialog (`ui.prompt`) or input + “Save goal” in the panel.
- **Status bar:** `🔥 Nd` with tooltip (streak + weekly progress); off or not yet scanned → item removed.
- **Settings** in the panel: weekly goal, `countInk` (include pen time `ink.ms`), status-bar toggle.

### Aggregation

1. `notes.list()` → `.md`/`.markdown` only → sort `modifiedAt` descending (`localeCompare`) → `slice(0, maxNotes)`.
2. Per note `stats.read` (failures skipped); with `countInk` also `stats.ink.ms` (fallback `penDownMs`).
3. Union of all `activeDays` (`YYYY-MM-DD`).
4. **Current streak:** consecutive days ending today; if today is still empty, yesterday can continue the streak.
5. **Longest streak:** longest consecutive run in the union.
6. **This week:** proportional sum of `focusMs` (+ `ink.ms` when `countInk`) for active days Mon–Sun of the current week (FaNotes stores lifetime focus per note – see limits).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Writing Streak*
   - *Rescan streak*
   - *Set weekly goal*
2. In the panel: **Rescan**, adjust goal, toggle switches.
3. Optionally click the status-bar item → panel.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, prompt |
| `notes:read` | List notes, save/vault events |
| `stats:read` | Page stats (`activeDays`, `focusMs`, optional `stats.ink.*` for pen time) |
| `storage` | Settings (`weeklyGoalMinutes`, `countInk`, `showStatus`, `maxNotes`) |

**No** `notes:write`, **no** `network`, **no** `editor`, **no** `ink:read` (pen time comes from `stats.ink`).

### Limits (honest)

- **No** calendar heatmap in v1.
- At most **`maxNotes`** Markdown notes per scan (default 400); large vaults keep the most recently modified first.
- Weekly minutes are an **estimate**: FaNotes does not expose focus-ms per day – share is `(active days this week / total activeDays) × focusMs` (+ ink).
- PDF / ink-only notes without typing only appear via `activeDays` / ink fields in stats; without a stats entry they do not count.
- With the status bar off and the panel closed, background rescans are skipped (same scan-gate idea as Deadline Radar).
- Activate does not await a full vault scan; only a non-blocking warm scan when `showStatus` is on.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Storage

- `settings`: `{ weeklyGoalMinutes, countInk, showStatus, maxNotes }`

### Version

1.0.0 – initial release.

---

## Lizenz / License

MIT
