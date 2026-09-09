# Zeitstempel / Timestamp Inserter

Fügt konfigurierbare Datums-/Zeitstempel an der Cursorposition ein.

Inserts configurable date/time stamps at the cursor.

---

## Deutsch

### Was es tut

- **Letzten Zeitstempel einfügen:** `formats[lastId]` (sonst erstes Format) an der Cursorposition.
- **Datum einfügen:** `YYYY-MM-DD` (erstes passendes Listenformat oder literal).
- **Datum und Uhrzeit einfügen:** `YYYY-MM-DD HH:mm`.
- **Zeitstempel öffnen:** Panel `ts` mit Formatliste und Verwaltung.

### Tokens

Lokales `Date`, ohne Bibliotheken, mit Zero-Pad:

| Token | Bedeutung |
| --- | --- |
| `YYYY` | Jahr |
| `MM` | Monat 01–12 |
| `DD` | Tag 01–31 |
| `HH` | Stunde 00–23 |
| `mm` | Minute 00–59 |

Unbekannte Token bleiben unverändert. Standardformate: `YYYY-MM-DD`, `YYYY-MM-DD HH:mm`, `DD.MM.YYYY`, `HH:mm` (max. 8).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen die vier Befehle.
2. Im Panel: Zeile anklicken → sofort einfügen und als zuletzt markieren; **Neu** (Prompt), **Entfernen** (Auswahl), **Einfügen (zuletzt)** (primär).
3. Unterstützte Tokens stehen als Hinweis unter der Liste.

Einfügen bevorzugt `editor.insert(text, 'cursor')`. Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "formats": ["YYYY-MM-DD", "YYYY-MM-DD HH:mm", "DD.MM.YYYY", "HH:mm"],
  "lastId": 0
}
```

Laden validiert/klammert; Speichern ist rollback-sicher.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Prompt und Toasts |
| `editor` | Text an der Cursorposition einfügen |
| `storage` | Formate und `lastId` |

**Kein** `network`, **kein** `notes:read`/`notes:write`, **kein** `clipboard`, **kein** Vault. `onActivate` lädt nur die Einstellungen.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **append-to-daily** / **session-log** | Schreiben/Anhängen an Dateien bzw. Session-Log — hier nur Insert-Strings |
| **daily-note** | Öffnet/erstellt die Tagesdatei `YYYY-MM-DD.md` — hier kein Datei-Zugriff |
| **template-library** | Freie Vorlagen mit Platzhaltern — hier nur Datums-/Zeit-Formate |

### Grenzen

- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Toast.
- Max. 8 Formate; neue Muster nur mit Tokens `YYYY MM DD HH mm` und Trennern `- / : .` (Leerzeichen).
- Kein Statusleisten-Eintrag; kein Netzwerk; kein Clipboard.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Insert last timestamp:** `formats[lastId]` (else first format) at the cursor.
- **Insert date:** `YYYY-MM-DD` (first matching list format or literal).
- **Insert date and time:** `YYYY-MM-DD HH:mm`.
- **Open Timestamp Inserter:** Panel `ts` with format list and management.

### Tokens

Local `Date`, no libraries, zero-padded:

| Token | Meaning |
| --- | --- |
| `YYYY` | Year |
| `MM` | Month 01–12 |
| `DD` | Day 01–31 |
| `HH` | Hour 00–23 |
| `mm` | Minute 00–59 |

Unknown tokens are left as-is. Default formats: `YYYY-MM-DD`, `YYYY-MM-DD HH:mm`, `DD.MM.YYYY`, `HH:mm` (max 8).

### Usage

1. Command palette (`Ctrl K`) → the four commands under the add-on name.
2. In the panel: click a row → insert immediately and mark as last; **New** (prompt), **Remove** (selection), **Insert (last)** (primary).
3. Supported tokens are shown muted under the list.

Insert prefers `editor.insert(text, 'cursor')`. No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "formats": ["YYYY-MM-DD", "YYYY-MM-DD HH:mm", "DD.MM.YYYY", "HH:mm"],
  "lastId": 0
}
```

Values are validated/clamped on load; writes are rollback-safe.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, prompt, and toasts |
| `editor` | Insert text at the cursor |
| `storage` | Formats and `lastId` |

**No** `network`, **no** `notes:read`/`notes:write`, **no** `clipboard`, **no** vault. `onActivate` only loads settings.

### Boundaries

| Add-on | Difference |
| --- | --- |
| **append-to-daily** / **session-log** | Write/append to files or a session log — here insert strings only |
| **daily-note** | Opens/creates the daily file `YYYY-MM-DD.md` — no file access here |
| **template-library** | Freeform templates with placeholders — here date/time formats only |

### Limits

- Only in an open Markdown editor; pen mode/PDF → toast.
- Max 8 formats; new patterns only with tokens `YYYY MM DD HH mm` and separators `- / : .` (spaces).
- No status-bar entry; no network; no clipboard.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
