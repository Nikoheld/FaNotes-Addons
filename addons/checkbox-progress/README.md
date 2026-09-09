# Aufgaben-Fortschritt / Checkbox Progress

Zählt **Markdown-Checkboxen** (`- [ ]` / `- [x]`) **nur in der offenen Notiz** (Editor), zeigt Fortschritt, Balken und optional eine Statuszeile. **Kein Vault-Scan**, **kein Umschalten** der Checkboxen im Panel.

Counts **Markdown checkboxes** (`- [ ]` / `- [x]`) in the **open note only** (editor), shows progress, a text bar, and an optional status item. **No vault scan**, **no click-to-check** in the panel.

---

## Deutsch

### Was es tut

- **Panel `progress`:** Kennzahlen Offen / Erledigt / Gesamt / Prozent, Textbalken (`████░░░░░░ 40%`), Liste der ersten 30 offenen Aufgaben (Präfix entfernt).
- **Statusleiste** (`☑ 3/10` bzw. `☑ —`): Klick öffnet das Panel; abschaltbar.
- **Befehle:** Panel öffnen, aktualisieren, Zusammenfassung als Toast (ohne Zwischenablage).
- Parst nur Zeilen der Form `^\s*[-*+]\s+\[( |x|X)\](?:\s+…)?$` – Leerzeichen = offen, `x`/`X` = erledigt.

### Bedienung

1. Öffne eine Markdown-Notiz im Schreibmodus.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Aufgaben-Fortschritt öffnen*
   - *Fortschritt aktualisieren*
   - *Zusammenfassung anzeigen* (Toast, keine Zwischenablage)
3. Im Panel: Statusleiste an/aus, Balkenbreite 5–40, **Aktualisieren**.

### Einstellungen (Speicher)

Schlüssel `settings`:

```json
{
  "showStatus": true,
  "barWidth": 10
}
```

- `showStatus`: Statusleisten-Eintrag (Standard `true`)
- `barWidth`: 5–40 (Standard 10); ungültige Werte werden geklemmt
- Speichern mit Rollback bei Fehler

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Statusleiste, Toasts |
| `editor` | Text der offenen Notiz lesen (`getText`) |
| `storage` | Einstellungen speichern |

**Kein** `notes:read`, **kein** `clipboard`, **kein** `network`, **kein** Vault-Schreiben.

### Grenzen

- **Nur der offene Markdown-Editor** – kein Vault-Scan, keine anderen Notizen.
- **Kein Klick-zum-Abhaken** im Panel: die Aufgabenliste ist reine Anzeige.
- Stiftmodus / kein Editor → leerer Zustand; Status `☑ —`.
- Live-Aktualisierung beim Tippen (`note:changed`) braucht laut SDK `notes:read`; dieses Add-on fordert sie **nicht** an. Bei offenem Panel oder aktiver Statuszeile aktualisiert es bei Notizwechsel (`note:opened`), Moduswechsel und manuell.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `editor.getText`, `storage`, Statusleiste).

---

## English

### What it does

- **Panel `progress`:** Open / Done / Total / Percent, text bar (`████░░░░░░ 40%`), list of the first 30 open task texts (checkbox prefix stripped).
- **Status bar** (`☑ 3/10` or `☑ —`): click opens the panel; can be disabled.
- **Commands:** open panel, refresh, show summary as toast (no clipboard).
- Parses only lines matching `^\s*[-*+]\s+\[( |x|X)\](?:\s+…)?$` – space = open, `x`/`X` = done.

### Usage

1. Open a Markdown note in writing mode.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Checkbox Progress*
   - *Refresh progress*
   - *Show summary* (toast, no clipboard)
3. In the panel: toggle status bar, set bar width 5–40, **Refresh**.

### Settings (storage)

Key `settings`:

```json
{
  "showStatus": true,
  "barWidth": 10
}
```

- `showStatus`: status-bar item (default `true`)
- `barWidth`: 5–40 (default 10); invalid values are clamped
- Persist with rollback on failure

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, status bar, toasts |
| `editor` | Read open-note text (`getText`) |
| `storage` | Persist settings |

**No** `notes:read`, **no** `clipboard`, **no** `network`, **no** vault writes.

### Limits

- **Open Markdown editor only** – no vault scan, no other notes.
- **No click-to-check** in the panel: the task list is display-only.
- Pen mode / no editor → empty state; status `☑ —`.
- Live typing refresh (`note:changed`) requires `notes:read` per the SDK; this add-on does **not** request it. With the panel open or status enabled it refreshes on note switch (`note:opened`), mode change, and manually.
- Command titles follow the UI language at start; reload the add-on after a language switch.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `editor.getText`, `storage`, status bar).

---

## Lizenz / License

MIT
