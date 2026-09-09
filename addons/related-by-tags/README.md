# Verwandte per Tag / Related by Tags

Findet **verwandte Markdown-Notizen** über gemeinsame **#Hashtags im Fließtext** (Überlappung). Panel mit Trefferliste, optionaler Tag-Index-Cache und Status `🏷 N`.

Finds **related Markdown notes** via shared **#hashtags in prose** (overlap). Panel with hit list, optional tag-index cache, and status `🏷 N`.

> **v1:** Keine YAML-Frontmatter-Tags — nur Hashtags in der Prosa. Fenced-Code (` ``` ` / `~~~`) wird ignoriert.
> **v1:** No YAML frontmatter tags — hashtags in prose only. Fenced code (` ``` ` / `~~~`) is ignored.

---

## Deutsch

### Was es tut

- **Verwandte per Tag öffnen:** Panel `related` mit Key-Value (aktive Tags | Treffer), Liste verwandter Notizen, Select Min-Überlappung 1–5, Button **Aktualisieren**.
- **Tag-Index neu aufbauen:** Liest bis zu `maxNotes` (Standard 400) `.md`/`.markdown`-Notizen (nach `modifiedAt` absteigend), extrahiert Tags, speichert Cache.
- **Beste verwandte Notiz öffnen:** Öffnet den Treffer mit höchster Überlappung (dann neueste); Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`.
- **Statusleiste:** `🏷 N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = Trefferzahl der aktiven Notiz); **Klick öffnet das Panel**.

### Tag-Erkennung

Regex: `/(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_\-/]{1,32})/gu`

- Treffer werden **kleingeschrieben**
- Mindestlänge nach `#`: 1
- Auch nach Satzzeichen, z. B. `(#tag)`
- Zeilen in fenced ` ``` `- / `~~~`-Blöcken (Line-Toggle) werden **übersprungen**
- **Kein** YAML-Frontmatter in v1

### Algorithmus

1. Aktive Markdown-Notiz lesen → `tagsA`
2. Leere `tagsA` → Hinweis im Panel
3. Index sicherstellen: `notes.list` → `.md`/`.markdown` → Sort `modifiedAt` desc → Slice `maxNotes` → `notes.read` → Tag-Map (Cache nutzen, wenn jünger als `cacheTtlMs`)
4. `overlap = |tagsA ∩ tagsB|`; behalten wenn `≥ minOverlap`; Selbst ausschließen wenn `excludeSelf`
5. Sortierung: Überlappung desc, dann `modifiedAt` desc; Liste max. **50**

### Scan-Gate

`notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings laden + kalten Status entfernen). Scan bei:

1. Panel öffnen (Cache-TTL / fehlender Index)
2. Button **Aktualisieren** / Befehl **Tag-Index neu aufbauen**
3. `note:saved` / `note:created` / `note:deleted` / `vault:changed` (1,5 s Entprellung), **nur wenn Panel offen**
4. Befehl **Beste verwandte Notiz öffnen**

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Verwandte per Tag öffnen*
   - *Tag-Index neu aufbauen*
   - *Beste verwandte Notiz öffnen*
2. Im Panel: Tags prüfen, Min-Überlappung wählen, Liste anklicken, **Aktualisieren** (einziger Primary).

### Speicher

`settings`:

```json
{
  "maxNotes": 400,
  "minOverlap": 1,
  "excludeSelf": true,
  "cacheTtlMs": 120000,
  "showStatus": false
}
```

`cache` (optional):

```json
{
  "updatedAt": 0,
  "tagsByPath": { "Pfad/Notiz.md": ["mathe", "klausur"] }
}
```

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen/lesen, aktive Notiz, Ereignisse |
| `storage` | Einstellungen und Tag-Cache |

**Kein** `notes:write`, **kein** `network`.

### Grenzen (ehrlich)

- Hashtags nach Satzzeichen wie `(#tag)` werden erkannt; YAML-Frontmatter-Tags nicht.
- Fenced Code: ` ``` ` und `~~~`.
- Höchstens **`maxNotes`** Markdown-Notizen im Index (Standard 400).
- Liste im Panel max. **50** Treffer.
- Nur Prosa-Hashtags; YAML-Frontmatter-Tags werden in v1 **nicht** gelesen.
- Keine PDF-/Stiftmodus-Inhalte.
- Status erscheint erst nach Nutzer-Scan in der Session (kein Kaltstart-Status); Klick auf `🏷 N` öffnet das Panel.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Related by Tags:** Panel `related` with key-value (active tags | hits), related-note list, min-overlap select 1–5, **Refresh** button.
- **Rebuild tag index:** Reads up to `maxNotes` (default 400) `.md`/`.markdown` notes (sorted by `modifiedAt` desc), extracts tags, stores cache.
- **Open top related note:** Opens the highest-overlap hit (then newest); toast if none.
- **Click** a list row → `notes.open`.
- **Status bar:** `🏷 N` only when `showStatus` and scanned at least once this session (`N` = related hit count for the active note); **click opens the panel**.

### Tag detection

Regex: `/(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_\-/]{1,32})/gu`

- Matches are **lowercased**
- Min length after `#`: 1
- Also after punctuation, e.g. `(#tag)`
- Lines inside fenced ` ``` ` / `~~~` blocks (line toggle) are **skipped**
- **No** YAML frontmatter in v1

### Algorithm

1. Read active Markdown note → `tagsA`
2. Empty `tagsA` → panel hint
3. Ensure index: `notes.list` → `.md`/`.markdown` → sort `modifiedAt` desc → slice `maxNotes` → `notes.read` → tag map (reuse cache if younger than `cacheTtlMs`)
4. `overlap = |tagsA ∩ tagsB|`; keep if `≥ minOverlap`; exclude self if `excludeSelf`
5. Sort: overlap desc, then `modifiedAt` desc; list capped at **50**

### Scan gate

No `notes.list` / `notes.read` in `onActivate` (settings only + remove cold status). Scan on:

1. Panel open (cache TTL / missing index)
2. **Refresh** button / **Rebuild tag index** command
3. `note:saved` / `note:created` / `note:deleted` / `vault:changed` (1.5 s debounce) **while panel open**
4. **Open top related note** command

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Related by Tags*
   - *Rebuild tag index*
   - *Open top related note*
2. In the panel: inspect tags, set min overlap, click rows, **Refresh** (only primary).

### Storage

Same `settings` / `cache` shapes as above.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List/read notes, active note, events |
| `storage` | Settings and tag cache |

**No** `notes:write`, **no** `network`.

### Limits (honest)

- Hashtags after punctuation like `(#tag)` are detected; YAML frontmatter tags are not.
- Fenced code: ` ``` ` and `~~~`.
- At most **`maxNotes`** Markdown notes in the index (default 400).
- Panel list capped at **50** hits.
- Prose hashtags only; YAML frontmatter tags are **not** read in v1.
- No PDF / pen-mode content.
- Status appears only after a user-triggered scan in the session; clicking `🏷 N` opens the panel.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
