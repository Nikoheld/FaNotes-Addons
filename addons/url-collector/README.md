# Link-Sammler / URL Collector

Sammelt **https-Links** aus Notizen zum Kopieren oder Öffnen (kein `http`).

Collects **https links** from notes to copy or open (no `http`).

> **Abgrenzung / Distinction:** `quote-collector` = **Editor-Zitate** mit Quelle → Export `Quotes.md`. `wikilink-map` = **bestehende [[Wikilinks]]** (Backlinks/Outgoing). `url-collector` = **https-URLs** im Notiztext zum Kopieren/`openExternal`.
>
> **Distinction:** `quote-collector` = **editor quotes** with source → export `Quotes.md`. `wikilink-map` = **existing [[wikilinks]]**. `url-collector` = **https URLs** in note text for copy / `openExternal`.

> **Nur https:** Es werden ausschließlich `https://`-Links erkannt. Plain `http://` wird **nicht** gesammelt. Kein `net.fetch`, keine Online-Erreichbarkeitsprüfung.
> **https only:** Only `https://` links are detected. Plain `http://` is **not** collected. No `net.fetch`, no online reachability check.

> **Scan-Gate:** `notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings).
> **Scan gate:** no `notes.list` / `notes.read` in `onActivate` (settings only).

---

## Deutsch

### Was es tut

- **Link-Sammler öffnen:** Panel `urls` mit Scope-Select (`active` | `vault`), Caps, Status-Checkbox, Primary-Button **Aktualisieren**, URL-Liste (gekürzt, erste Quelle, Badge = Anzahl Quellen), Buttons **Kopieren** / **Öffnen** / **Alle kopieren**.
- **Link-Sammler-Scan aktualisieren:** Active oder Vault erneut scannen.
- **Alle URLs kopieren:** Gesammelte Links zeilenweise (`\n`) in die Zwischenablage.
- **Klick** auf einen Listen-Eintrag → Auswahl (Soft: kein Drei-Wege-Confirm im SDK). Dedizierte Buttons **Kopieren** (direkt Clipboard) und **Öffnen** (`ui.openExternal`, Host-Confirm).
- **Statusleiste:** `🔗 N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt.

### Erkennung

Regex: `/https:\/\/[^\s<>\]\)]+/gi` — danach trailing `.,;:)` entfernen.

- Nur **https** (kein http).
- Dedup nach exaktem String nach Punkt-Trim (erste gefundene Schreibweise behalten; trailing `/` wird nicht zusätzlich normalisiert Soft).
- Fenced `` ``` `` / `~~~` Soft übersprungen.
- Pro URL: `sourcePaths[]` / `sourceTitles[]`; Anzeige: Detail = erster Quell-Titel, Badge = Anzahl Quellen.

### Scope

- `active`: `notes.active` + `notes.read` der aktiven Markdown-Notiz
- `vault`: `notes.list` → `.md` / `.markdown`, Sortierung `modifiedAt` **DESC**, Slice `maxNotes`, extrahieren

### Scan-Gate

Kein Vault-/Listen-/Lesen in `onActivate`. Scan bei:

1. Panel öffnen
2. Button **Aktualisieren**
3. Befehl **Link-Sammler-Scan aktualisieren**
4. Befehl **Alle URLs kopieren** (stiller Rescan, falls noch nicht gescannt)

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Link-Sammler öffnen*
   - *Link-Sammler-Scan aktualisieren*
   - *Alle URLs kopieren*
2. Im Panel: Scope und Caps setzen → **Aktualisieren** (einziger Primary) → URL tippen → **Kopieren** oder **Öffnen** · oder **Alle kopieren**.

### Speicher

`settings`:

```json
{
  "scope": "active",
  "maxNotes": 200,
  "maxUrls": 200,
  "showStatus": false
}
```

- `scope`: `"active"` | `"vault"`
- `maxNotes`: 50–1000 (Vault-Cap nach Sortierung)
- `maxUrls`: 20–500 (Listen-Cap)
- `showStatus`: Status `🔗 N` (Standard aus)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Confirm, Status, `openExternal` |
| `notes:read` | Aktive Notiz, Liste, Inhalte lesen |
| `storage` | Einstellungen |
| `clipboard` | URL(s) in die Zwischenablage |

**Kein** `network`, **kein** `vault:write`, **kein** `notes:write`.

### Grenzen (ehrlich)

- Nur `https://`; `http://` und relative Links werden ignoriert.
- Keine Online-Prüfung (Link kann tot sein).
- Vault-Cap: ältere Notizen jenseits von `maxNotes` werden nicht gescannt.
- Listen-Cap `maxUrls`: weitere URLs nach Erstfund-Reihenfolge entfallen.
- Fenced-Code Soft ausgeblendet; Inline-Code `` `...` `` wird in v1 **nicht** gesondert ausgeblendet.
- Klick → Drei-Wege „Kopieren | Öffnen | Abbrechen“: SDK bietet nur Ja/Nein-Confirm Soft → Auswahl + Buttons; `openExternal` hat Host-Confirm.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open URL Collector:** Panel `urls` with scope select (`active` | `vault`), caps, status checkbox, primary **Refresh**, URL list (truncated, first source title, badge = source count), buttons **Copy** / **Open** / **Copy all**.
- **Refresh URL Collector scan:** Re-scan active note or vault.
- **Copy all URLs:** Collected links joined by `\n` to the clipboard.
- **Click** a list row → select (Soft: SDK has no three-way confirm). Dedicated **Copy** (clipboard direct) and **Open** (`ui.openExternal`, host confirm).
- **Status bar:** `🔗 N` only when `showStatus` and at least one scan this session.

### Detection

Regex: `/https:\/\/[^\s<>\]\)]+/gi` — then strip trailing `.,;:)`.

- **https only** (no http).
- Dedup by exact string after punctuation trim (keep first-seen casing; trailing `/` is not additionally normalized Soft).
- Fenced `` ``` `` / `~~~` Soft skipped.
- Per URL: `sourcePaths[]` / `sourceTitles[]`; UI detail = first source title, badge = source count.

### Scope

- `active`: `notes.active` + `notes.read` of the active Markdown note
- `vault`: `notes.list` → `.md` / `.markdown`, sort `modifiedAt` **DESC**, slice `maxNotes`, extract

### Scan gate

No vault list/read in `onActivate`. Scan on:

1. Opening the panel
2. **Refresh** button
3. Command **Refresh URL Collector scan**
4. Command **Copy all URLs** (silent rescan if not yet scanned)

### How to use

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open URL Collector*
   - *Refresh URL Collector scan*
   - *Copy all URLs*
2. In the panel: set scope and caps → **Refresh** (only primary) → tap a URL → **Copy** or **Open** · or **Copy all**.

### Storage

`settings`:

```json
{
  "scope": "active",
  "maxNotes": 200,
  "maxUrls": 200,
  "showStatus": false
}
```

- `scope`: `"active"` | `"vault"`
- `maxNotes`: 50–1000 (vault cap after sort)
- `maxUrls`: 20–500 (list cap)
- `showStatus`: status `🔗 N` (default off)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, confirm, status, `openExternal` |
| `notes:read` | Active note, list, read bodies |
| `storage` | Settings |
| `clipboard` | Write URL(s) to the clipboard |

**No** `network`, **no** `vault:write`, **no** `notes:write`.

### Limits (honest)

- Only `https://`; `http://` and relative links are ignored.
- No online check (a link may be dead).
- Vault cap: notes older than `maxNotes` are not scanned.
- List cap `maxUrls`: further URLs after first-seen order are dropped.
- Fenced code Soft skipped; inline `` `...` `` is **not** specially excluded in v1.
- Click → three-way “Copy | Open | Cancel”: SDK only has yes/no confirm Soft → selection + buttons; `openExternal` has host confirm.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
