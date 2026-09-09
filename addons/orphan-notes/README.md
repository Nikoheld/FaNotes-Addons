# Verwaiste Notizen / Orphan Notes

Findet **Markdown-Notizen ohne ausgehende Wikilinks** `[[…]]` (optional auch ohne eingehende = echte Waisen). Panel mit Liste, Cache und Status `📭 N`.

Finds **Markdown notes with no outgoing wikilinks** `[[…]]` (optionally also no incoming = true orphans). Panel with list, cache, and status `📭 N`.

> **v1:** Standard-Modus `outgoing`. Fenced-Code (` ``` ` / `~~~`) wird bei der Wikilink-Suche ignoriert. Keine PDFs.
> **v1:** Default mode `outgoing`. Fenced code (` ``` ` / `~~~`) is ignored when scanning wikilinks. No PDFs.

---

## Deutsch

### Was es tut

- **Verwaiste Notizen öffnen:** Panel `orphans` mit Key-Value (gescannt | verwaist), Liste (max. 50), Select **Modus**, Select **Max. Notizen** (100/200/400/800), Button **Aktualisieren**.
- **Verwaist-Scan neu aufbauen:** Liest bis zu `maxNotes` (Standard 400) `.md`/`.markdown`-Notizen (nach `modifiedAt` absteigend), extrahiert Wikilinks, speichert Cache, berechnet Orphans.
- **Erste verwaiste Notiz öffnen:** Öffnet den ersten Eintrag der Orphan-Liste (Titel A–Z); Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open`.
- **Statusleiste:** `📭 N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = Orphan-Anzahl); **Klick öffnet das Panel**.

### Modi

| Modus | Bedeutung |
| --- | --- |
| `outgoing` (Standard) | Keine `[[wikilink]]` im Fließtext |
| `incoming` | Niemand verlinkt auf diese Notiz (über aufgelöste Ziele) |
| `both` | Keine ausgehenden **und** keine eingehenden Links (echte Waisen) |

### Wikilink-Erkennung

Regex (wie Wikilink-Karte): `/\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/gu`

- Ziel ohne `#heading` / `|alias`
- Zeilen in fenced ` ``` `- / `~~~`-Blöcken (Line-Toggle) werden **übersprungen**
- Eingehende Graph-Auflösung: Titel/Basename **kleingeschrieben** als Schlüssel

### Scan-Gate

`notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings laden + kalten Status entfernen). Scan bei:

1. Panel öffnen (Cache-TTL / fehlender Index)
2. Button **Aktualisieren** / Befehl **Verwaist-Scan neu aufbauen**
3. `note:saved` / `note:created` / `note:deleted` / `vault:changed` (1,5 s Entprellung), **nur wenn Panel offen**
4. Befehl **Erste verwaiste Notiz öffnen**

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Verwaiste Notizen öffnen*
   - *Verwaist-Scan neu aufbauen*
   - *Erste verwaiste Notiz öffnen*
2. Im Panel: Modus und Max. Notizen wählen, Liste anklicken, **Aktualisieren** (einziger Primary).

### Speicher

`settings`:

```json
{
  "maxNotes": 400,
  "mode": "outgoing",
  "cacheTtlMs": 120000,
  "showStatus": false,
  "excludeFolders": []
}
```

`cache` (optional):

```json
{
  "updatedAt": 0,
  "outgoingByPath": { "Pfad/Notiz.md": ["Ziel"] },
  "titles": { "notiz": "Pfad/Notiz.md" }
}
```

`excludeFolders`: optionale Liste vault-relativer Ordnerpräfixe (Komma im Panel), z. B. `["Archiv", "Templates"]`.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen/lesen, Ereignisse |
| `storage` | Einstellungen und Wikilink-Cache |

**Kein** `notes:write`, **kein** `network`.

### Grenzen (ehrlich)

- Höchstens **`maxNotes`** Markdown-Notizen im Index (Standard 400; Auswahl 100/200/400/800).
- Liste im Panel max. **50** Einträge (Gesamtzahl steht im Key-Value).
- Fenced Code: ` ``` ` und `~~~` — Wikilinks darin zählen nicht.
- Keine PDF-/Stiftmodus-Inhalte.
- Eingehende Links nur gegen den gescannten Index (nicht gegen ausgeschlossene Ordner / über `maxNotes` hinaus).
- Status erscheint erst nach Nutzer-Scan in der Session (kein Kaltstart-Status); Klick auf `📭 N` öffnet das Panel.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Orphan Notes:** Panel `orphans` with key-value (scanned | orphans), list (max 50), **Mode** select, **Max notes** select (100/200/400/800), **Refresh** button.
- **Rebuild orphan scan:** Reads up to `maxNotes` (default 400) `.md`/`.markdown` notes (sorted by `modifiedAt` desc), extracts wikilinks, stores cache, computes orphans.
- **Open first orphan:** Opens the first orphan in the list (title A–Z); toast if none.
- **Click** a list row → `notes.open`.
- **Status bar:** `📭 N` only when `showStatus` and scanned at least once this session (`N` = orphan count); **click opens the panel**.

### Modes

| Mode | Meaning |
| --- | --- |
| `outgoing` (default) | No `[[wikilink]]` in prose |
| `incoming` | Nothing links to this note (via resolved targets) |
| `both` | No outgoing **and** no incoming links (true orphans) |

### Wikilink detection

Regex (same as Wikilink Map): `/\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/gu`

- Target without `#heading` / `|alias`
- Lines inside fenced ` ``` ` / `~~~` blocks (line toggle) are **skipped**
- Incoming graph resolution: title/basename keys are **lowercased**

### Scan gate

No `notes.list` / `notes.read` in `onActivate` (settings only + remove cold status). Scan on:

1. Panel open (cache TTL / missing index)
2. **Refresh** button / **Rebuild orphan scan** command
3. `note:saved` / `note:created` / `note:deleted` / `vault:changed` (1.5 s debounce) **while panel open**
4. **Open first orphan** command

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Orphan Notes*
   - *Rebuild orphan scan*
   - *Open first orphan*
2. In the panel: set mode and max notes, click rows, **Refresh** (only primary).

### Storage

Same `settings` / `cache` shapes as above.

`excludeFolders`: optional vault-relative folder prefixes (comma-separated in the panel), e.g. `["Archive", "Templates"]`.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List/read notes, events |
| `storage` | Settings and wikilink cache |

**No** `notes:write`, **no** `network`.

### Limits (honest)

- At most **`maxNotes`** Markdown notes in the index (default 400; choices 100/200/400/800).
- Panel list capped at **50** rows (total count is in the key-value).
- Fenced code: ` ``` ` and `~~~` — wikilinks inside do not count.
- No PDF / pen-mode content.
- Incoming links are only against the scanned index (not excluded folders / beyond `maxNotes`).
- Status appears only after a user-triggered scan in the session; clicking `📭 N` opens the panel.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
