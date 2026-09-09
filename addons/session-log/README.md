# Sitzungsprotokoll / Session Log

Startet und beendet Lern-/Arbeitssitzungen mit bilingualen Zeitstempeln und Dauer in einer Log-Notiz (`Sessions.md` standardmäßig; Pfad `.md`/`.markdown`), optionaler Statusleiste und Panel.

Starts and ends study/work sessions with bilingual timestamps and duration in a log note (`Sessions.md` by default; path `.md`/`.markdown`), optional status bar and panel.

---

## Deutsch

### Was es tut

- **Start:** öffnet eine Sitzung (`storage.session`), optional `## Sitzung / Session YYYY-MM-DD HH:mm` an die Log-Notiz.
- **Ende:** hängt `- Ende / End: … (Dauer / Duration: Xm)` an, schließt die Sitzung, zeigt Dauer in Minuten.
- **Statusleiste** (`session`): nur wenn „Status anzeigen“ **und** Sitzung offen → `⏺ Sitzung`. Klick öffnet das Panel. Kein Auto-Start beim Aktivieren.
- **Panel** (`session`): Key-Value (Status | Start | Log-Pfad), Einstellungen, eine Primäraktion (Start oder Ende), Button „Log öffnen“, gedämpfte Dauer bei offener Sitzung (Aktualisierung ca. alle 30 s).
- **Log-Pfad:** nur `.md` oder `.markdown` (relativ zum Vault).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Sitzung starten*
   - *Sitzung beenden*
   - *Sitzungs-Log öffnen*
   - *Sitzungsprotokoll öffnen* / *…-Einstellungen öffnen* → Panel
2. Status `⏺ Sitzung` tippen → Panel
3. Im Panel: **Start** oder **Ende** (genau eine Primäraktion), **Log öffnen**, Pfad/Checkboxen speichern sich beim Bestätigen

### Speicher

- Schlüssel `settings`:

```json
{
  "logPath": "Sessions.md",
  "autoStamp": true,
  "showStatus": true
}
```

- Schlüssel `session`:

```json
{
  "open": false,
  "startedAt": null
}
```

`startedAt` ist ISO-8601, solange `open` true ist. Persistenz mit Rollback bei fehlgeschlagenen Mutationen.

### Append-Format

```markdown
## Sitzung / Session 2026-09-09 10:15
- Ende / End: 2026-09-09 11:00 (Dauer / Duration: 45m)
```

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Statusleiste, Toasts |
| `notes:read` | Existenz prüfen, Log öffnen |
| `notes:write` | Log-Notiz anlegen/`append` |
| `storage` | Einstellungen und Sitzungszustand |

**Kein** `vault:write`, **kein** `network`, **kein** `editor`, **kein** `clipboard`.

### Grenzen

- Ohne `vault:write` kann das Add-on fehlende Ordner nicht anlegen: Toast „bitte Ordner manuell anlegen“, Fallback auf den FaNotes-Standardordner; der reale Pfad wird in `settings.logPath` gespeichert (wie Quick Inbox).
- Nur `.md`/`.markdown`-Pfade; `..` und andere Endungen werden abgelehnt.
- Dauer wird in ganzen Minuten gerundet (`Xm`); Sekunden erscheinen nicht.
- Sitzungszustand überlebt Reload nur über `storage`; kein Hintergrund-Timer außerhalb von FaNotes.
- Status erscheint **nur** bei offener Sitzung (nicht dauerhaft wie manch andere Add-ons).
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion: Start (geschlossen) bzw. Ende (offen).

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`notes.create` / `append` / `open` / `exists`, `ui.status`, `ui.panel`, `storage`).

---

## English

### What it does

- **Start:** opens a session (`storage.session`), optionally appends `## Sitzung / Session YYYY-MM-DD HH:mm` to the log note.
- **End:** appends `- Ende / End: … (Dauer / Duration: Xm)`, clears the session, shows duration in minutes.
- **Status bar** (`session`): only when “Show status” **and** a session is open → `⏺ Session`. Click opens the panel. No auto-start on activate.
- **Panel** (`session`): key-value (Status | Start | Log path), settings, one primary action (Start or End), “Open log” button, muted duration while open (~30 s refresh).
- **Log path:** `.md` or `.markdown` only (vault-relative).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Start session*
   - *End session*
   - *Open session log*
   - *Open session log panel* / *Open session log settings* → panel
2. Tap status `⏺ Session` → panel
3. In the panel: **Start** or **End** (exactly one primary), **Open log**, path/checkboxes persist on confirm

### Storage

- Key `settings`: `{ logPath, autoStamp, showStatus }` (defaults above).
- Key `session`: `{ open, startedAt }` with ISO `startedAt` while open.

Persistence uses rollback when mutations fail.

### Append format

Same bilingual markers as in the German section.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, status bar, toasts |
| `notes:read` | Existence checks, open log |
| `notes:write` | Create/`append` log note |
| `storage` | Settings and session state |

**No** `vault:write`, **no** `network`, **no** `editor`, **no** `clipboard`.

### Limits

- Without `vault:write`, missing folders cannot be created: toast asking the user to create the folder, then fallback to FaNotes’ default folder; the real path is persisted in `settings.logPath` (same idea as Quick Inbox).
- Only `.md`/`.markdown` paths; `..` and other extensions are rejected.
- Duration is rounded to whole minutes (`Xm`); seconds are not shown.
- Session state survives reload only via `storage`; no background timer outside FaNotes.
- Status shows **only** while a session is open.
- Command titles follow UI language at load time; reload the add-on after a language switch.
- Toasts are only `info` | `success` | `error`.
- Exactly one primary action: Start (closed) or End (open).

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md`.
