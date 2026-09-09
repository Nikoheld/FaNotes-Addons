# Lesezeit / Reading Time

Schätzt die **Lesezeit der aktiven Notiz oder Auswahl** in Minuten (Wörter ÷ WPM). **Kein Vault-Scan.**

Estimates **reading time of the active note or selection** in minutes (words ÷ WPM). **No vault scan.**

**Abgrenzung:** `word-counter` = Zähl-UI (Wörter/Zeichen/Zeilen); `note-statistics` = `.famd`-Seitenstatistik; **hier** = WPM-Schätzung (Wörter/WPM → Minuten).

---

## Deutsch

### Was es tut

- **Panel `rt`:** Kennzahlen Wörter | Minuten | WPM; Eingabe WPM (50–600); Auswahl Bereich (Notiz/Auswahl); Statusleiste-Checkbox; Primary-Schaltfläche **Aktualisieren**.
- **Statusleiste** `⏱ Xm` (X = geschätzte Minuten): nur wenn `showStatus`; Klick öffnet das Panel.
- **Befehle:** Panel öffnen, aktualisieren, Zusammenfassung als Toast (**keine** Zwischenablage).
- Text: bei Bereich „Auswahl“ und nicht-leerer Markierung → Auswahl; sonst Notiztext (`editor.getText` || `notes.read`).

### Berechnung

1. Wörter: `trim` → `split(/\s+/)` → `filter(Boolean)`.
2. Minuten: bei Wörtern > 0 → `max(1, round(Wörter/WPM))`, sonst `0`.
3. Standard-WPM: **200** (Clamp 50–600).

### Bedienung

1. Öffne eine Markdown-Notiz (optional Text markieren).
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Lesezeit öffnen*
   - *Lesezeit aktualisieren*
   - *Zusammenfassung anzeigen* (Toast, keine Zwischenablage)
3. Im Panel: WPM / Bereich / Statusleiste, **Aktualisieren**.

### Einstellungen (Speicher)

Schlüssel `settings`:

```json
{
  "wpm": 200,
  "scope": "note",
  "showStatus": true
}
```

- `wpm`: Wörter pro Minute (50–600, Standard `200`)
- `scope`: `"note"` | `"selection"` (Standard `"note"`)
- `showStatus`: Statusleisten-Eintrag (Standard `true`)
- Speichern mit Rollback bei Fehler

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Statusleiste, Toasts |
| `editor` | Text und Auswahl der offenen Notiz lesen |
| `notes:read` | Aktive Notiz / Fallback `notes.read`, Ereignisse |
| `storage` | Einstellungen |

**Kein** `clipboard`, **kein** `network`, **kein** Notiz schreiben.

### Grenzen

- **Nur aktive Notiz / Auswahl** – kein Vault-Listen-Scan.
- Live-Refresh bei `note:opened` / `note:saved` nur wenn Status an **oder** Panel geöffnet (Debounce).
- Activate: bei `showStatus` und aktiver Notiz **ein** Refresh (active-only).
- Auswahlwechsel ohne Tippen/Speichern aktualisiert nicht automatisch – **Aktualisieren** nutzen.
- Markdown-Syntax wird als Klartext mitgezählt.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `API.md`, `UI_BLOCKS.md`, `PERMISSIONS.md`.

---

## English

### What it does

- **Panel `rt`:** Key values Words | Minutes | WPM; WPM input (50–600); scope select (note/selection); status-bar checkbox; primary **Refresh** button.
- **Status bar** `⏱ Xm` (X = estimated minutes): only when `showStatus`; click opens the panel.
- **Commands:** open panel, refresh, show summary as toast (**no** clipboard).
- Text: with scope “Selection” and a non-empty selection → selection; otherwise note text (`editor.getText` || `notes.read`).

### Calculation

1. Words: `trim` → `split(/\s+/)` → `filter(Boolean)`.
2. Minutes: if words > 0 → `max(1, round(words/WPM))`, else `0`.
3. Default WPM: **200** (clamped 50–600).

### Usage

1. Open a Markdown note (optionally select text).
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Reading Time*
   - *Refresh Reading Time*
   - *Show summary* (toast, no clipboard)
3. In the panel: set WPM / scope / status bar, **Refresh**.

### Settings (storage)

Key `settings`:

```json
{
  "wpm": 200,
  "scope": "note",
  "showStatus": true
}
```

- `wpm`: words per minute (50–600, default `200`)
- `scope`: `"note"` | `"selection"` (default `"note"`)
- `showStatus`: status-bar item (default `true`)
- Persist with rollback on failure

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, status bar, toasts |
| `editor` | Read text and selection of the open note |
| `notes:read` | Active note / fallback `notes.read`, events |
| `storage` | Persist settings |

**No** `clipboard`, **no** `network`, **no** note writes.

### Limits

- **Active note / selection only** – no vault list scan.
- Live refresh on `note:opened` / `note:saved` only when status is on **or** the panel is open (debounced).
- Activate: with `showStatus` and an active note, **one** refresh (active-only).
- Changing the selection without typing/saving does not refresh automatically – use **Refresh**.
- Markdown syntax is counted as plain text.
- Command titles follow the UI language at start; reload the add-on after a language switch.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `API.md`, `UI_BLOCKS.md`, `PERMISSIONS.md`.

---

## Lizenz / License

MIT
