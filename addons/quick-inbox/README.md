# Schnellerfassung / Quick Inbox

Erfasst kurze Aufgaben per Prompt als Markdown-Checklistenzeilen in eine konfigurierbare Inbox-Notiz (`Inbox.md` standardmäßig), mit Datum/Uhrzeit, optionalem Tag und Text-Präfix.

Captures short tasks via prompt as Markdown checklist lines into a configurable inbox note (`Inbox.md` by default), with date/time, optional tag and text prefix.

---

## Deutsch

### Was es tut

- **In Inbox erfassen:** Fragt einen Text ab und hängt eine Zeile an: `- [ ] YYYY-MM-DD HH:mm [#tag] [Präfix]Text`.
- **In Inbox mit Tag erfassen:** Fragt zuerst den Tag (ohne `#`), dann den Text.
- **Inbox öffnen:** Öffnet die konfigurierte Inbox-Notiz (legt sie bei Bedarf an).
- **Einstellungen:** Panel für Pfad, Präfix, Standard-Tag und Statusleisten-Option.
- **Statusleiste:** Optionaler Eintrag `Inbox`; Klick öffnet die Inbox.
- **Anlegen:** Fehlt die Datei, wird sie mit einer bilingualen Überschrift `# Inbox` erstellt.

### Zeilenformat

```text
- [ ] 2026-09-08 20:55 #schule Mathe Blatt 3
```

- Zeitstempel: lokale Kalenderzeit `YYYY-MM-DD HH:mm`.
- Optionaler Tag: ein Wort ohne Leerzeichen, mit führendem `#`.
- **Präfix** aus den Einstellungen steht **nach dem Tag und vor dem Freitext** (z. B. `TODO: `).
- Der Standard-Tag gilt für „In Inbox erfassen“, sofern gesetzt; bei „mit Tag erfassen“ dient er als Vorbelegung im Prompt.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *In Inbox erfassen*
   - *In Inbox mit Tag erfassen*
   - *Inbox öffnen*
   - *Schnellerfassung-Einstellungen öffnen*
2. Im Panel: Pfad/Präfix/Tag prüfen, **Einstellungen speichern**, optional **Inbox öffnen**.
3. Optional: Klick auf den Statusleisten-Eintrag `Inbox`.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Prompts, Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Prüfen, ob die Inbox existiert |
| `notes:write` | Inbox anlegen und Checklistenzeilen anhängen |
| `storage` | Pfad, Präfix, Standard-Tag und Statusleisten-Option speichern |

**Kein** `network`, **kein** `vault:write`: fehlende übergeordnete Ordner werden nicht angelegt; stattdessen fällt `notes.create` auf den FaNotes-Standardordner zurück. Der tatsächlich genutzte Pfad wird in den Einstellungen gespeichert (kein erneutes Anlegen beim nächsten Capture).

### Grenzen

- Nur `.md`-Dateien (keine PDFs, kein `.markdown`).
- Pfade sind relativ zum Vault; `..` und absolute Pfade sind nicht erlaubt.
- Leerer oder abgebrochener Prompt → keine Änderung.
- Die Statusleiste ist abschaltbar; maximal 3 Status-Einträge pro Add-on (FaNotes-Limit).
- Befehlstitel werden beim Start in der aktuellen UI-Sprache registriert; nach einem Sprachwechsel ggf. neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Capture to inbox:** Prompts for text and appends a line: `- [ ] YYYY-MM-DD HH:mm [#tag] [prefix]Text`.
- **Capture to inbox with tag:** Prompts for a tag (without `#`) first, then the text.
- **Open inbox:** Opens the configured inbox note (creates it if needed).
- **Settings:** Panel for path, prefix, default tag and status-bar toggle.
- **Status bar:** Optional `Inbox` item; click opens the inbox.
- **Creation:** If the file is missing, it is created with a bilingual `# Inbox` heading.

### Line format

```text
- [ ] 2026-09-08 20:55 #schule Mathe Blatt 3
```

- Timestamp: local calendar time `YYYY-MM-DD HH:mm`.
- Optional tag: one word without spaces, with a leading `#`.
- **Prefix** from settings is placed **after the tag and before the free text** (e.g. `TODO: `).
- The default tag applies to “Capture to inbox” when set; for “with tag” it pre-fills the tag prompt.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Capture to inbox*
   - *Capture to inbox with tag*
   - *Open inbox*
   - *Open Quick Inbox settings*
2. In the panel: check path/prefix/tag, **Save settings**, optionally **Open inbox**.
3. Optionally click the status-bar item `Inbox`.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Prompts, panel, toasts, status bar, `notes.open` |
| `notes:read` | Check whether the inbox already exists |
| `notes:write` | Create the inbox and append checklist lines |
| `storage` | Persist path, prefix, default tag and status-bar preference |

**No** `network`, **no** `vault:write`: missing parent folders are not created; `notes.create` falls back to FaNotes’ default note folder instead. The real path is written back into settings so the next capture does not create duplicates.

### Limits

- Only `.md` files (no PDFs, no `.markdown`).
- Paths are vault-relative; `..` and absolute paths are rejected.
- Empty or cancelled prompt → no change.
- The status bar item can be disabled; FaNotes allows at most 3 status items per add-on.
- Command titles are registered in the UI language at start; after a language switch, reload the add-on.

### Version

1.0.0 – initial release.

---

## Lizenz / License

MIT
