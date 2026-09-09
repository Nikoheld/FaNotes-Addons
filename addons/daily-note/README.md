# Tagesnotiz / Daily Note

Öffnet oder erstellt deine Tagesnotiz als `YYYY-MM-DD.md` in einem konfigurierbaren Ordner (Standard: `Daily`). Enthält Befehle für heute und gestern, ein Einstellungs-Panel und optional einen Statusleisten-Eintrag.

Opens or creates your daily note as `YYYY-MM-DD.md` in a configurable folder (default: `Daily`). Includes commands for today and yesterday, a settings panel, and an optional status-bar item.

---

## Deutsch

### Was es tut

- **Heute öffnen:** Legt bei Bedarf die Notiz `Daily/YYYY-MM-DD.md` (Ordner anpassbar) an und öffnet sie.
- **Gestern öffnen:** Dasselbe für den Vortag.
- **Einstellungen:** Panel mit Pfadvorschau (heute/gestern), Ordnerfeld und Option für die Statusleiste.
- **Statusleiste:** Zeigt das heutige Datum (`📅 YYYY-MM-DD`); Klick öffnet die heutige Tagesnotiz.
- **Vorlage:** Neue Notizen starten mit einer leichten Markdown-Überschrift (`# YYYY-MM-DD` plus lokalisiertes Datum).
- **Einstellungen speichern:** Ordner und Statusleisten-Option bleiben über `fanotes.storage` erhalten.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Tagesnotiz von heute öffnen*
   - *Tagesnotiz von gestern öffnen*
   - *Tagesnotiz-Einstellungen öffnen*
2. Im Panel: Pfade prüfen, **Heute öffnen** / **Gestern öffnen**, Ordner anpassen und speichern.
3. Optional: Klick auf den Statusleisten-Eintrag für heute.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Prüfen, ob die Tagesnotiz schon existiert; Ordnerbaum lesen |
| `notes:write` | Neue Tagesnotiz mit Vorlage anlegen |
| `storage` | Ordner und Statusleisten-Option speichern |
| `vault:write` | Fehlenden Zielordner (z. B. `Daily`) anlegen |

### Grenzen

- Pfade sind relativ zum Vault; `..` und absolute Pfade sind nicht erlaubt.
- Ohne `vault:write` schlägt das Anlegen fehl, wenn der Ordner fehlt – es erscheint eine klare Fehlermeldung.
- Die Statusleiste ist abschaltbar; maximal 3 Status-Einträge pro Add-on (FaNotes-Limit).
- Kein Netzwerk, kein Editor-Zugriff, keine fremden Notizen außer den Tagesdateien im gewählten Ordner.
- Datum folgt der lokalen Kalenderzeit der FaNotes-Instanz.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open today:** Creates `Daily/YYYY-MM-DD.md` if needed (folder configurable) and opens it.
- **Open yesterday:** Same for the previous day.
- **Settings:** Panel with path preview (today/yesterday), folder field, and status-bar toggle.
- **Status bar:** Shows today’s date (`📅 YYYY-MM-DD`); click opens today’s daily note.
- **Template:** New notes start with a light markdown heading (`# YYYY-MM-DD` plus a localized date line).
- **Persistence:** Folder and status-bar preference are stored via `fanotes.storage`.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open today’s daily note*
   - *Open yesterday’s daily note*
   - *Open Daily Note settings*
2. In the panel: check paths, **Open today** / **Open yesterday**, change the folder and save.
3. Optionally click the status-bar item for today.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | Check whether the daily note already exists; read the folder tree |
| `notes:write` | Create a new daily note with the template |
| `storage` | Persist folder and status-bar preference |
| `vault:write` | Create the missing target folder (e.g. `Daily`) |

### Limits

- Paths are vault-relative; `..` and absolute paths are rejected.
- Without `vault:write`, creation fails with a clear toast if the folder is missing.
- The status bar item can be disabled; FaNotes allows at most 3 status items per add-on.
- No network, no editor access, and no writes outside the daily files in the chosen folder.
- Dates use the local calendar time of the FaNotes instance.

### Version

1.0.0 – initial release.
