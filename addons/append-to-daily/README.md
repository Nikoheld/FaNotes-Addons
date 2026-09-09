# An Tagesnotiz anhängen / Append to Daily

Hängt Auswahl oder Prompt-Text an die Tagesnotiz (`YYYY-MM-DD.md`) im konfigurierbaren Ordner (Standard: `Daily`). Optional mit lokaler Uhrzeit (`HH:mm`) und einer `##`-Überschrift.

Appends selection or prompted text to today’s daily note (`YYYY-MM-DD.md`) in a configurable folder (default: `Daily`). Optional local time prefix (`HH:mm`) and a `##` heading.

---

## Deutsch

### Abgrenzung

| Add-on | Rolle |
| --- | --- |
| **daily-note** | Tagesnotiz **öffnen/anlegen** (UI, heute/gestern, Statusleiste, `vault:write` für Ordner) |
| **quick-inbox** | Kurze Aufgaben als **Checklistenzeilen** in `Inbox.md` |
| **session-log** | **Sitzungs-Start/Ende** mit Dauer in einer Log-Notiz |
| **append-to-daily** (dieses) | **Beliebigen Text** (Auswahl oder Prompt) an die heutige Tagesnotiz **anhängen** |

### Was es tut

- **Auswahl anhängen:** liest `editor.getSelection()`; leer → Toast, sonst anhängen.
- **Prompt:** `ui.prompt` (mehrzeilig, falls die API es erlaubt) → anhängen.
- **Tagesnotiz öffnen:** `ensureDaily` dann `notes.open`.
- **Panel** (`daily-append`): heutiger Pfad | existiert?; Ordner, Uhrzeit-Präfix, Überschrift; Buttons *Auswahl anhängen* (primary) | *Prompt* | *Öffnen*.
- **Anlegen:** fehlt die Datei → `notes.create({ folder, name: Datum, content: '# Datum\n' })`. **Kein** `vault:write`: schlägt das Anlegen fehl → Toast, Ordner manuell anlegen. `settings.folder` bleibt unverändert; der Pfad wird immer berechnet.
- **Activate:** lädt nur Einstellungen – kein ensure/create/read der Tagesnotiz.

### Append-Format

```text
14:32 Mein Text
```

- Optional `HH:mm ` (lokale Zeit), wenn „Uhrzeit voranstellen“ aktiv ist.
- Mit gesetzter Überschrift: fehlt `## Überschrift` in der Notiz → einmal `\n\n## Überschrift\n` einfügen, dann Inhalt; sonst ans Dateiende anhängen (nach Newline).

### Einstellungen (`storage`)

```json
{
  "folder": "Daily",
  "filenameFormat": "YYYY-MM-DD",
  "heading": "",
  "prefixTimestamp": true,
  "showStatus": false
}
```

`filenameFormat` ist in v1 fest `YYYY-MM-DD`. Pfad: `folder + '/' + heuteLokalISO + '.md'`.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Auswahl an Tagesnotiz anhängen*
   - *Text an Tagesnotiz anhängen…*
   - *Tagesnotiz öffnen*
   - *An Tagesnotiz anhängen öffnen* / *…-Einstellungen öffnen* → Panel
2. Im Panel: Pfad prüfen, Einstellungen anpassen, **Auswahl anhängen** / **Prompt** / **Öffnen**.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Prompts, Toasts, `notes.open` |
| `editor` | `editor.getSelection` für Auswahl anhängen |
| `notes:read` | Existenz prüfen, Inhalt lesen (Überschrift) |
| `notes:write` | Tagesnotiz anlegen und anhängen |
| `storage` | Einstellungen speichern |

**Kein** `vault:write`, **kein** `network`, **kein** `clipboard`.

### Grenzen

- Ordner relativ zum Vault; `..` und absolute Pfade sind nicht erlaubt (wie daily-note Soft).
- Ohne `vault:write` werden fehlende Ordner nicht angelegt – klarer Toast.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Auswahl anhängen*.
- Datum/Uhrzeit folgen der lokalen Kalenderzeit der FaNotes-Instanz.
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **daily-note** | **Open/create** the daily note (UI, today/yesterday, status bar, `vault:write` for folders) |
| **quick-inbox** | Short tasks as **checklist lines** in `Inbox.md` |
| **session-log** | Session **start/end** stamps with duration in a log note |
| **append-to-daily** (this) | **Append arbitrary text** (selection or prompt) to today’s daily note |

### What it does

- **Append selection:** reads `editor.getSelection()`; empty → toast, otherwise append.
- **Prompt:** `ui.prompt` (multiline when the API allows) → append.
- **Open daily:** `ensureDaily` then `notes.open`.
- **Panel** (`daily-append`): today’s path | exists?; folder, time prefix, heading; buttons *Append selection* (primary) | *Prompt* | *Open*.
- **Creation:** if missing → `notes.create({ folder, name: date, content: '# date\n' })`. **No** `vault:write`: create failure → toast asking you to create the folder. `settings.folder` is kept; the path is always computed.
- **Activate:** loads settings only – no ensure/create/read of the daily note.

### Append format

```text
14:32 My text
```

- Optional `HH:mm ` (local time) when “Prefix local time” is on.
- With a heading set: if the note does not contain `## Heading`, insert `\n\n## Heading\n` once then the content; otherwise append at the end of the file (after a newline).

### Settings (`storage`)

```json
{
  "folder": "Daily",
  "filenameFormat": "YYYY-MM-DD",
  "heading": "",
  "prefixTimestamp": true,
  "showStatus": false
}
```

`filenameFormat` is fixed to `YYYY-MM-DD` in v1. Path: `folder + '/' + todayLocalISO + '.md'`.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Append selection to daily note*
   - *Append text to daily note…*
   - *Open daily note*
   - *Open Append to Daily* / *Open Append to Daily settings* → panel
2. In the panel: check the path, adjust settings, **Append selection** / **Prompt** / **Open**.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, prompts, toasts, `notes.open` |
| `editor` | `editor.getSelection` for append selection |
| `notes:read` | Existence check, read content (heading) |
| `notes:write` | Create and append to the daily note |
| `storage` | Persist settings |

**No** `vault:write`, **no** `network`, **no** `clipboard`.

### Limits

- Folders are vault-relative; `..` and absolute paths are rejected (same Soft as daily-note).
- Without `vault:write`, missing folders are not created – clear toast instead.
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Append selection*.
- Date/time use the local calendar clock of the FaNotes instance.
- Command titles follow the UI language at load; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
