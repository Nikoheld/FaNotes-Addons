# Tag-Browser / Tag Browser

Zeigt **alle #Hashtags** im Vault mit **Häufigkeit** und **Notizen pro Tag** (Drill-down). Panel, optionaler Cache (TTL 120 s), optionaler Status `🏷 Ntags`.

Shows **all #hashtags** in the vault with **counts** and **notes per tag** (drill-down). Panel, optional cache (TTL 120 s), optional status `🏷 Ntags`.

> **Abgrenzung / vs related-by-tags:** `related-by-tags` findet Notizen mit **gemeinsamen Tags zur aktiven Notiz** (Überlappung). `tag-browser` baut eine **Vault-weite Tag-Wolke** (alle Tags mit Count) und listet Notizen **pro Tag** — keine Überlappungs-Suche zur aktiven Notiz.
> **Distinction / vs related-by-tags:** `related-by-tags` finds notes that **share tags with the active note** (overlap). `tag-browser` builds a **vault-wide tag cloud** (all tags with counts) and lists notes **per tag** — no overlap search against the active note.

> **v1:** Keine YAML-Frontmatter-Tags — nur Hashtags in der Prosa. Fenced-Code (` ``` ` / `~~~`) wird ignoriert. Kein Schreiben/Netzwerk.
> **v1:** No YAML frontmatter tags — hashtags in prose only. Fenced code (` ``` ` / `~~~`) is ignored. No write/network.

---

## Deutsch

### Was es tut

- **Tag-Browser öffnen:** Panel `tags` mit Key-Value (**Tags** | **Notizen im Index**), Tag-Liste (`#tag` + Badge = Count), Eingabe Min-Häufigkeit, Select Sortierung, Button **Aktualisieren** (einziger Primary).
- **Klick auf Tag** → Drill-down: Notizenliste (Titel + Pfad); Klick → `notes.open`; Button **← Tags** zurück.
- **Tag-Index neu aufbauen:** Liest bis zu `maxNotes` (Standard 400) `.md`/`.markdown`-Notizen (nach `modifiedAt` absteigend), extrahiert Tags, speichert Cache.
- **Statusleiste:** `🏷 Ntags` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = gefilterte Tag-Anzahl); **Klick öffnet das Panel**.

### Tag-Erkennung (wie related-by-tags)

Regex: `/(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_\-/]{1,32})/gu`

- Treffer werden **kleingeschrieben**
- Mindestlänge nach `#`: 1
- Auch nach Satzzeichen, z. B. `(#tag)`
- Zeilen in fenced ` ``` `- / `~~~`-Blöcken (Line-Toggle) werden **übersprungen**
- **Kein** YAML-Frontmatter in v1

### Algorithmus

1. `notes.list` → `.md`/`.markdown` → Sort `modifiedAt` desc → Slice `maxNotes`
2. `notes.read` je Notiz → Tags parsen → Map `tag → Set(paths)` (+ Titel)
3. Filtern `count ≥ minCount`; Sortierung Count desc oder Name asc
4. Cache nutzen, wenn jünger als 120 s (TTL)

### Scan-Gate

`notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings + Cache laden + kalten Status entfernen). Scan bei:

1. Panel öffnen (Cache-TTL / fehlender Index)
2. Button **Aktualisieren** / Befehl **Tag-Index neu aufbauen**
3. `note:saved` / `note:created` / `note:deleted` / `vault:changed` (1,5 s Entprellung), **nur wenn Panel offen**

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Tag-Browser öffnen*
   - *Tag-Index neu aufbauen*
2. Im Panel: Tags prüfen, Min-Häufigkeit / Sort setzen, Tag anklicken, **Aktualisieren** (einziger Primary).

### Speicher

`settings`:

```json
{
  "maxNotes": 400,
  "minCount": 1,
  "sort": "count",
  "showStatus": false
}
```

- `maxNotes`: 50–2000
- `minCount`: 1–100
- `sort`: `"count"` | `"name"`
- `showStatus`: Status `🏷 Ntags` (Standard `false`)

`cache` (optional, TTL 120 s):

```json
{
  "updatedAt": 0,
  "tagToPaths": { "mathe": ["Pfad/A.md", "Pfad/B.md"] },
  "titles": { "Pfad/A.md": "Titel A" }
}
```

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen/lesen, Ereignisse |
| `storage` | Einstellungen und Tag-Cache |

**Kein** `notes:write`, **kein** `vault`, **kein** `network`.

### Grenzen (ehrlich)

- Hashtags nach Satzzeichen wie `(#tag)` werden erkannt; YAML-Frontmatter-Tags nicht.
- Fenced Code: ` ``` ` und `~~~`.
- Höchstens **`maxNotes`** Markdown-Notizen im Index (Standard 400).
- Nur Prosa-Hashtags; YAML-Frontmatter-Tags werden in v1 **nicht** gelesen.
- Keine PDF-/Stiftmodus-Inhalte.
- Status erscheint erst nach Nutzer-Scan in der Session (kein Kaltstart-Status).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Tag Browser:** Panel `tags` with key-value (**Tags** | **Notes in index**), tag list (`#tag` + badge = count), min-count input, sort select, **Refresh** button (only primary).
- **Click a tag** → drill-down: notes list (title + path); click → `notes.open`; **← Tags** button back.
- **Rebuild tag index:** Reads up to `maxNotes` (default 400) `.md`/`.markdown` notes (sorted by `modifiedAt` desc), extracts tags, stores cache.
- **Status bar:** `🏷 Ntags` only when `showStatus` and scanned at least once this session (`N` = filtered tag count); **click opens the panel**.

### Tag detection (same as related-by-tags)

Regex: `/(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_\-/]{1,32})/gu`

- Matches are **lowercased**
- Min length after `#`: 1
- Also after punctuation, e.g. `(#tag)`
- Lines inside fenced ` ``` ` / `~~~` blocks (line toggle) are **skipped**
- **No** YAML frontmatter in v1

### Algorithm

1. `notes.list` → `.md`/`.markdown` → sort `modifiedAt` desc → slice `maxNotes`
2. `notes.read` each → parse tags → map `tag → Set(paths)` (+ titles)
3. Filter `count ≥ minCount`; sort count desc or name asc
4. Reuse cache if younger than 120 s (TTL)

### Scan gate

No `notes.list` / `notes.read` in `onActivate` (settings + cache load + remove cold status only). Scan on:

1. Panel open (cache TTL / missing index)
2. **Refresh** button / **Rebuild tag index** command
3. `note:saved` / `note:created` / `note:deleted` / `vault:changed` (1.5 s debounce) **while panel open**

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Tag Browser*
   - *Rebuild tag index*
2. In the panel: inspect tags, set min count / sort, click a tag, **Refresh** (only primary).

### Storage

Same `settings` / `cache` shapes as above.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List/read notes, events |
| `storage` | Settings and tag cache |

**No** `notes:write`, **no** `vault`, **no** `network`.

### Limits (honest)

- Hashtags after punctuation like `(#tag)` are detected; YAML frontmatter tags are not.
- Fenced code: ` ``` ` and `~~~`.
- At most **`maxNotes`** Markdown notes in the index (default 400).
- Prose hashtags only; YAML frontmatter tags are **not** read in v1.
- No PDF / pen-mode content.
- Status appears only after a user-triggered scan in the session; clicking `🏷 Ntags` opens the panel.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
