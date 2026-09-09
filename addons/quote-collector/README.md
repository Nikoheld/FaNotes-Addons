# Zitatesammler / Quote Collector

Sammelt markierten Editor-Text als Zitate mit Quelle (Titel/Pfad) in den Add-on-Speicher, exportiert alle Zitate als datierte Abschnitte nach `Quotes.md` und kopiert das zuletzt erfasste Zitat in die Zwischenablage.

Collects selected editor text as quotes with source (title/path) in add-on storage, exports all quotes as dated sections to `Quotes.md`, and copies the most recently captured quote to the clipboard.

---

## Deutsch

### Was es tut

- **Panel öffnen:** Liste erfasster Zitate, Aktionen, Export-Pfad und Statusleisten-Option.
- **Auswahl erfassen:** Liest `editor.getSelection()`; leere Auswahl → Fehler-Toast. Speichert Text (max. 4000 Zeichen, Kürzung mit `…` + Info-Toast), aktive Notiz als Quelle, ID `qt-…`.
- **Exportieren:** Hängt **alle** aktuellen Zitate als neuen Abschnitt `## YYYY-MM-DD HH:mm` an die Export-Datei. Fehlt die Datei, wird sie mit `# Zitate / Quotes\n` angelegt; der tatsächliche Pfad wird wie bei Schnellerfassung persistiert.
- **Letztes Zitat kopieren:** Schreibt den Text des neuesten Zitats in die Zwischenablage (nur Schreiben).
- **Statusleiste:** Optional `Zitate: N` nur wenn `N > 0`.

### Exportformat

```markdown
## 2026-09-08 21:57
> Zitattext
— Titel (Pfad/Notiz.md)
```

Mehrere Zitate stehen unter derselben Datums-Überschrift (älteste zuerst).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Zitatesammler öffnen*
   - *Auswahl als Zitat erfassen*
   - *Zitate exportieren*
   - *Letztes Zitat kopieren*
2. Im Panel:
   - Zeile anklicken → Auswahl
   - **Kopieren** | **Einfügen Cursor** | **Entfernen**
   - **Auswahl erfassen** (Primär) | **Exportieren** | **Alles löschen** (mit Bestätigung)
   - Export-Pfad eingeben → **Pfad speichern**
   - Checkbox Statusleiste

### Speicher

Schlüssel `data`:

```json
{
  "quotes": [
    {
      "id": "qt-…",
      "text": "…",
      "path": "Fach/Notiz.md",
      "title": "Notiz",
      "createdAt": "2026-09-08T19:57:00.000Z",
      "tags": ""
    }
  ],
  "settings": {
    "exportPath": "Quotes.md",
    "maxQuotes": 200,
    "showStatus": true
  }
}
```

Mutationen werden mit Clone/Rollback bei Speicherfehler persistiert. Kein Vault-Scan beim Aktivieren.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Bestätigungen, Toasts, Statusleiste |
| `editor` | Auswahl lesen, Zitat am Cursor einfügen |
| `notes:read` | Aktive Notiz als Quelle, Existenz der Export-Datei |
| `notes:write` | **Nur** Export-Datei anlegen und Abschnitte anhängen |
| `storage` | Zitate und Einstellungen speichern |
| `clipboard` | Zitattext in die Zwischenablage schreiben |

**Kein** `network`, **kein** `vault:write`, **kein** OCR.

### Grenzen

- Jeder Export **hängt** einen neuen datierten Abschnitt an (kein Dedup) – Re-Export ohne Leeren dupliziert Abschnitte bewusst.
- `tags` wird gespeichert, hat in v1 aber **keine UI** zum Setzen (Badge fällt auf ✓ zurück).
- Export-Pfad erlaubt `.md` und `.markdown`.
- Kein OCR / keine Bild- oder PDF-Zitate – nur Editor-Textauswahl.
- Zwischenablage nur schreiben (FaNotes erlaubt kein Lesen).
- `notes:write` ausschließlich für die konfigurierte Export-Datei.
- Text länger als 4000 Zeichen wird mit `…` gekürzt (Info-Toast).
- Maximal `maxQuotes` (Standard 200); bei vollem Speicher Ablehnung mit Fehler-Toast.
- Nur Markdown-Editor für Einfügen; Stiftmodus/PDF → Fehler-Toast.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md`.

---

## English

### What it does

- **Open panel:** List of captured quotes, actions, export path and status-bar toggle.
- **Capture selection:** Reads `editor.getSelection()`; empty selection → error toast. Stores text (max 4000 characters, truncate with `…` + info toast), active note as source, ID `qt-…`.
- **Export:** Appends **all** current quotes as a new `## YYYY-MM-DD HH:mm` section to the export file. If missing, creates it with `# Zitate / Quotes\n`; persists the real path like Quick Inbox.
- **Copy last quote:** Writes the newest quote text to the clipboard (write-only).
- **Status bar:** Optional `Quotes: N` only when `N > 0`.

### Export format

```markdown
## 2026-09-08 21:57
> Quote text
— Title (Path/Note.md)
```

Multiple quotes share one dated heading (oldest first).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Quote Collector*
   - *Capture selection as quote*
   - *Export quotes*
   - *Copy last quote*
2. In the panel:
   - Click a row → select
   - **Copy** | **Insert at cursor** | **Remove**
   - **Capture selection** (primary) | **Export** | **Clear all** (with confirm)
   - Enter export path → **Save path**
   - Status-bar checkbox

### Storage

Key `data`: quotes array + settings (`exportPath`, `maxQuotes`, `showStatus`). Mutations persist with clone/rollback on save failure. No vault scan on activate.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, confirms, toasts, status bar |
| `editor` | Read selection, insert quote at cursor |
| `notes:read` | Active note as source, export file existence |
| `notes:write` | **Only** create/append the export file |
| `storage` | Persist quotes and settings |
| `clipboard` | Write quote text to the clipboard |

**No** `network`, **no** `vault:write`, **no** OCR.

### Limits

- Each export **appends** a new dated section (no dedup) – re-export without clearing duplicates sections on purpose.
- `tags` is stored but has **no UI** to set it in v1 (badge falls back to ✓).
- Export path allows `.md` and `.markdown`.
- No OCR / no image or PDF quotes – editor text selection only.
- Clipboard write-only (FaNotes does not allow reading).
- `notes:write` solely for the configured export file.
- Text longer than 4000 characters is truncated with `…` (info toast).
- Cap at `maxQuotes` (default 200); when full, capture is rejected with an error toast.
- Markdown editor only for insert; pen mode/PDF → error toast.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md`.
