# Habit-Checkliste / Habit Checklist

Führt Habits als Datums-Checkboxen in **einer** Notiz (`Habits.md` standardmäßig) und schaltet den heutigen Tag per Panel, Befehl oder Klick um.

Tracks habits as dated checkboxes in **one** note (`Habits.md` by default) and toggles today via panel, command, or click.

> **Abgrenzung / Distinction**
>
> - **checkbox-progress** — zeigt den Fortschritt der Markdown-Checkboxen der **aktuell offenen Notiz** (Editor, Balken, Status). Kein festes Habit-File, kein Datums-Format, **kein Umschalten**.
> - **task-collector** (falls vorhanden) — sammelt **Vault-Todos** / offene Aufgaben über Notizen hinweg. Nicht datumsgebunden an eine Habit-Notiz.
> - **habit-checklist** — eine konfigurierte Habit-Notiz mit Zeilen `- [ ] YYYY-MM-DD Name`; Fokus auf **heutige** Habits, Anlegen fehlender Zeilen und Toggle.

---

## Deutsch

### Was es tut

- Speichert Habits als Checklistenzeilen mit Datum in einer Notiz.
- **Heute umschalten:** fehlende Zeilen werden angelegt, dann `[ ]` ↔ `[x]`.
- **Panel** (`habits`): Liste heutiger Habits mit Badge ✓/○ — **Klick = Toggle** (Hauptinteraktion). Buttons: Alle heutigen anlegen | Notiz öffnen | **Aktualisieren** (einzige Primäraktion). Eingabe Habit-Pfad, Habit hinzufügen, Status-Checkbox.
- **Statusleiste** (`habits`): `Habits a/b` wenn „Status anzeigen“ — **erst nach** Panel/Toggle/Befehl (lazy, kein Lesen beim Aktivieren).
- **Kein** periodischer Vault-Scan, **kein** schweres `notes.read` in `onActivate`.

### Zeilenformat (streng)

```
^(\s*)[-*+]\s+\[( |x|X)\]\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s*$
```

- Gruppe 3 = Datum `YYYY-MM-DD`
- Gruppe 4 = Habit-Name (trim)
- `x` / `X` = erledigt, Leerzeichen = offen

Beispiel:

```markdown
# Habit-Checkliste / Habit Checklist

- [ ] 2026-09-09 Lesen
- [x] 2026-09-09 Sport
- [ ] 2026-09-09 Inbox zero
```

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Habit-Checkliste öffnen* → Panel
   - *Habit heute umschalten* → Prompt (leer = alle heutigen)
   - *Habit-Notiz öffnen*
2. Status `Habits a/b` tippen → Panel (nach erstem Lesen)
3. Im Panel: Zeile tippen zum Umschalten; **Aktualisieren** ist die einzige Primär-Schaltfläche

### Habits-Menge

Union aus:

1. `settings.habits` (Standard-Seed: `Lesen`, `Sport`, `Inbox zero` — nur wenn der Schlüssel fehlt)
2. Habit-Namen aus der Datei der **letzten 30 Tage** (inklusive heute)

### Speicher

Schlüssel `settings`:

```json
{
  "habitPath": "Habits.md",
  "habits": ["Lesen", "Sport", "Inbox zero"],
  "showStatus": true
}
```

Pfad-Persistenz mit Rollback; nach Create-/Fallback wird der reale Pfad gespeichert (wie Quick Inbox / Session Log).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Palette: open, toggle, open-note |
| `ui` | Panel, Status, Toasts, Prompt |
| `notes:read` | Existenz, Lesen der Habit-Notiz |
| `notes:write` | Anlegen, `write` (Toggle, stale-safe Re-Read) |
| `storage` | Einstellungen |

**Kein** `vault:write`, **kein** `network`, **kein** `editor`.

### Grenzen

- Ohne `vault:write` kann das Add-on fehlende Ordner nicht anlegen: Toast „bitte Ordner manuell anlegen“, Fallback auf den FaNotes-Standardordner; der reale Pfad wird in `settings.habitPath` gespeichert.
- Nur `.md`/`.markdown`-Pfade; `..` und andere Endungen werden abgelehnt.
- Schreiben ist stale-safe: vor `notes.write` wird erneut gelesen und die Mutation bei Bedarf auf dem frischen Text wiederholt.
- Status erscheint lazy (nach erstem erfolgreichen Lesen über Panel/Befehl/Toggle), nicht beim Aktivieren.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primär-Schaltfläche: **Aktualisieren** (Klick-Toggle ist die Hauptinteraktion ohne `primary`).

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.create` / `read` / `write` / `open` / `exists`, `ui.status`, `ui.panel`, `storage`).

---

## English

### What it does

- Stores habits as dated checklist lines in one note.
- **Toggle today:** missing lines are created, then `[ ]` ↔ `[x]`.
- **Panel** (`habits`): today’s habits with badge ✓/○ — **click = toggle** (main interaction). Buttons: Ensure all today | Open note | **Refresh** (only primary). Habit path input, Add habit, status checkbox.
- **Status bar** (`habits`): `Habits a/b` when “Show status” — **only after** panel/toggle/command (lazy; no read on activate).
- **No** periodic vault scan, **no** heavy `notes.read` in `onActivate`.

### Line format (strict)

Same regex as above. Example:

```markdown
- [ ] 2026-09-09 Lesen
- [x] 2026-09-09 Sport
```

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Habit Checklist* → panel
   - *Toggle habit today* → prompt (empty = all today)
   - *Open habit note*
2. Tap status `Habits a/b` → panel (after first read)
3. In the panel: tap a row to toggle; **Refresh** is the only primary button

### Habit set

Union of `settings.habits` (seed defaults only when the key is absent) and names seen in the file over the **last 30 days**.

### Storage

Key `settings`: `{ habitPath, habits, showStatus }` (defaults above). Path persistence with rollback; create/fallback updates `habitPath` like Quick Inbox / Session Log.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Palette: open, toggle, open-note |
| `ui` | Panel, status, toasts, prompt |
| `notes:read` | Exists + read habit note |
| `notes:write` | Create + stale-safe `write` toggles |
| `storage` | Settings |

**No** `vault:write`, **no** `network`, **no** `editor`.

### Limits

- Without `vault:write`, missing folders cannot be created: toast to create the folder manually, fallback to the FaNotes default folder; the real path is stored in `settings.habitPath`.
- Only `.md`/`.markdown` paths; `..` and other extensions are rejected.
- Writes re-read immediately before `notes.write` and re-apply the mutation if the note changed.
- Status is lazy (after first successful read via panel/command/toggle), not on activate.
- Toasts only `info` | `success` | `error`.
- Exactly one primary button: **Refresh** (click-to-toggle is the main interaction without `primary`).

### Distinction (again)

- **checkbox-progress** = active note checkbox display (no dated habit file, no toggle).
- **task-collector** = vault-wide todos (not a single dated habit note).
- **habit-checklist** = one habit note, dated lines, toggle today.

### Version

1.0.0 – initial release.
