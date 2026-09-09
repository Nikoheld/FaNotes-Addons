# Wikilink-Karte / Wikilink Map

Zeigt für die **aktive Markdown-Notiz** Backlinks, aufgelöste ausgehende `[[Wikilinks]]` und fehlende Ziele. Baut einen lokalen Index (bis `maxNotes`) und kann fehlende Notizen nach Bestätigung anlegen.

Shows **backlinks**, resolved outgoing `[[wikilinks]]` and missing targets for the **active Markdown note**. Builds a local index (up to `maxNotes`) and can create missing notes after confirmation.

---

## Deutsch

### Was es tut

- **Wikilink-Karte öffnen:** Panel mit Zählern sowie Listen *Backlinks*, *Ausgehende Links* und *Fehlende Ziele*.
- **Index neu aufbauen:** Liest bis zu `maxNotes` (Standard 400) `.md`/`.markdown`-Notizen, extrahiert Wikilinks und speichert den Cache.
- **Fehlende Notiz anlegen:** Befehl oder Klick auf ein fehlendes Ziel → Bestätigung → `notes.create` + `notes.open` + erneuter Scan.
- **Klick** auf Backlink/ausgehenden Link öffnet die Zielnotiz.
- **Auto-Refresh:** Optional bei `note:saved` (1,5 s Entprellung), solange das Panel offen ist.

### Wikilink-Erkennung

```text
[[Ziel]]
[[Ziel#Überschrift]]
[[Ziel|Anzeigetext]]
```

Regex: `/\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/gu`

Ziele werden getrimmt und per **Titel** (case-insensitive) oder **Dateiname ohne Endung** aufgelöst.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Wikilink-Karte öffnen*
   - *Wikilink-Index neu aufbauen*
   - *Fehlende Wikilink-Notiz anlegen*
2. Im Panel: **Neu einlesen**, Listen prüfen, fehlende Ziele per Klick anlegen.
3. Optional: `maxNotes` im Panel setzen (gilt beim nächsten Scan) und Checkbox „Bei Speichern automatisch neu einlesen“.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Bestätigungen, `notes.open` |
| `notes:read` | Notizen listen/lesen, Existenz prüfen, Ereignisse |
| `notes:write` | **Nur** fehlende Zielnotizen nach Bestätigung anlegen |
| `storage` | Einstellungen (`maxNotes`, `autoRefresh`) und Index-Cache |

**Kein** `network`.

### Grenzen (ehrlich)

- Höchstens **`maxNotes`** Markdown-Notizen im Index (Standard 400) – große Vaults werden abgeschnitten.
- **Keine** Graph-/Netzwerk-Visualisierung – nur Listen zur aktiven Notiz.
- Keine PDF-/Stiftmodus-Inhalte; nur `.md` / `.markdown`.
- Pfadartige Ziele (`Ordner/Notiz`) werden nur über Titel/Basename gematcht; beim Anlegen wird der letzte Pfadabschnitt als Name genutzt.
- Listen sind auf 200 Einträge pro Kategorie im Panel begrenzt.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Speicher

- `settings`: `{ maxNotes, autoRefresh }`
- `cache`: `{ updatedAt, byNote, titles }`

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Wikilink Map:** Panel with counts and lists for *Backlinks*, *Outgoing links* and *Missing targets*.
- **Rebuild index:** Reads up to `maxNotes` (default 400) `.md`/`.markdown` notes, extracts wikilinks and stores the cache.
- **Create missing note:** Command or click on a missing target → confirm → `notes.create` + `notes.open` + rescan.
- **Click** a backlink/outgoing link to open that note.
- **Auto-refresh:** Optional on `note:saved` (1.5 s debounce) while the panel is open.

### Wikilink detection

```text
[[Target]]
[[Target#Heading]]
[[Target|Display text]]
```

Regex: `/\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/gu`

Targets are trimmed and resolved by **title** (case-insensitive) or **filename without extension**.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Wikilink Map*
   - *Rebuild wikilink index*
   - *Create missing wikilink note*
2. In the panel: **Rescan**, inspect lists, create missing targets with a click.
3. Optionally set `maxNotes` in the panel (applies on the next scan) and enable “Auto-rescan on save (while panel open)”.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, confirms, `notes.open` |
| `notes:read` | List/read notes, existence checks, events |
| `notes:write` | **Only** create missing target notes after confirm |
| `storage` | Settings (`maxNotes`, `autoRefresh`) and index cache |

**No** `network`.

### Limits (honest)

- At most **`maxNotes`** Markdown notes in the index (default 400) – large vaults are truncated.
- **No** graph/network visualization – lists for the active note only.
- No PDF/ink content; `.md` / `.markdown` only.
- Path-like targets (`Folder/Note`) match via title/basename only; create uses the last path segment as the note name.
- Panel lists are capped at 200 items per category.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Storage

- `settings`: `{ maxNotes, autoRefresh }`
- `cache`: `{ updatedAt, byNote, titles }`

### Version

1.0.0 – initial release.

---

## Lizenz / License

MIT
