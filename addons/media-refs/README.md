# Medien-Verweise / Media Refs

Listet **Bild- und PDF-Verweise** in der Notiz oder im Vault-Ausschnitt (keine Binärvorschau).

Lists **image and PDF references** in the note or a vault sample (no binary preview).

> **Abgrenzung / Distinction:** `url-collector` = **https-Links** im Notiztext. `media-refs` = **Markdown-Medien** `![alt](path|url)` und **bare** `.pdf` / `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` Pfade.
>
> **Distinction:** `url-collector` = **https links** in note text. `media-refs` = **Markdown media** `![alt](path|url)` and **bare** `.pdf` / `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` paths.

> **Keine Binärvorschau:** Es werden nur Text-Verweise (Pfad/URL) gesammelt und kopiert – keine Bild-/PDF-Vorschau.
> **No binary preview:** Only text references (path/URL) are collected and copied – no image/PDF preview.

> **Relative Vault-Pfade vs https:** Ziele bleiben unverändert (z. B. `attachments/foto.png` oder `https://…/a.pdf`).
> **Relative vault paths vs https:** Targets stay unchanged (e.g. `attachments/foto.png` or `https://…/a.pdf`).

> **Scan-Gate:** `notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings).
> **Scan gate:** no `notes.list` / `notes.read` in `onActivate` (settings only).

---

## Deutsch

### Was es tut

- **Medien-Verweise öffnen:** Panel `media` mit Scope-Select (`active` | `vault`), Caps, Primary-Button **Aktualisieren**, Liste (Titel = Ziel gekürzt, Detail = alt || kind || Quell-Titel, Badge = `img` | `pdf`), Button **Alle kopieren**.
- **Medien-Verweise aktualisieren:** Active oder Vault erneut scannen.
- **Alle Medien-Verweise kopieren:** Gesammelte Ziele zeilenweise (`\n`) in die Zwischenablage.
- **Klick** auf einen Listen-Eintrag → `clipboard.writeText(target)` + Toast (direkt, ohne Extra-Button).

### Erkennung

1. Markdown-Bilder: `/!\[([^\]]*)\]\(([^)]+)\)/g`
2. Bare-Medien: `/(?<![(\w])([^\s)]+\.(?:pdf|png|jpe?g|webp|gif))/gi`

- Dedup nach exaktem **target**-String (erste Schreibweise behalten); `sources[]` sammeln.
- Fenced `` ``` `` / `~~~` Soft übersprungen (heading-outline / note-splitter).
- Badge: `.pdf` → `pdf`, Bild-Endungen → `img`; Markdown-Embed ohne bekannte Endung Soft → `img`.
- Lookbehind verhindert Doppelzählung von Zielen aus `](…)`.

### Scope

- `active`: `notes.active` + `notes.read` der aktiven Markdown-Notiz
- `vault`: `notes.list` → `.md` / `.markdown`, Sortierung `modifiedAt` **DESC** (`localeCompare`), Slice `maxNotes`, extrahieren

### Scan-Gate

Kein Vault-/Listen-/Lesen in `onActivate`. Scan bei:

1. Panel öffnen
2. Button **Aktualisieren**
3. Befehl **Medien-Verweise aktualisieren**
4. Befehl **Alle Medien-Verweise kopieren** (stiller Rescan, falls noch nicht gescannt)

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Medien-Verweise öffnen*
   - *Medien-Verweise aktualisieren*
   - *Alle Medien-Verweise kopieren*
2. Im Panel: Scope und Caps setzen → **Aktualisieren** (einziger Primary) → Eintrag tippen zum Kopieren · oder **Alle kopieren**.

### Speicher

`settings`:

```json
{
  "scope": "active",
  "maxNotes": 200,
  "maxItems": 150
}
```

- `scope`: `"active"` | `"vault"`
- `maxNotes`: 50–1000 Soft (Vault-Cap nach Sortierung; Default 200)
- `maxItems`: 20–500 Soft (Listen-Cap; Default 150)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts |
| `notes:read` | Aktive Notiz, Liste, Inhalte lesen |
| `storage` | Einstellungen |
| `clipboard` | Ziel(e) in die Zwischenablage |

**Kein** `network`, **kein** `vault:write`, **kein** `notes:write`.

### Grenzen (ehrlich)

- Keine Binärvorschau und kein Öffnen von Dateien im Vault.
- Relative Pfade werden nicht aufgelöst/normalisiert; https wird nicht auf Erreichbarkeit geprüft.
- Vault-Cap: ältere Notizen jenseits von `maxNotes` werden nicht gescannt.
- Listen-Cap `maxItems`: weitere Verweise nach Erstfund-Reihenfolge entfallen.
- Fenced-Code Soft ausgeblendet; Inline-Code `` `...` `` wird in v1 **nicht** gesondert ausgeblendet.
- `![…](…)` ohne Bild-/PDF-Endung zählt Soft als `img` (Markdown-Bildsyntax).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Media Refs:** Panel `media` with scope select (`active` | `vault`), caps, primary **Refresh**, list (title = truncated target, detail = alt || kind || source title, badge = `img` | `pdf`), button **Copy all**.
- **Refresh Media Refs scan:** Re-scan active note or vault.
- **Copy all media refs:** Collected targets joined by `\n` to the clipboard.
- **Click** a list row → `clipboard.writeText(target)` + toast (direct, no extra button).

### Detection

1. Markdown images: `/!\[([^\]]*)\]\(([^)]+)\)/g`
2. Bare media: `/(?<![(\w])([^\s)]+\.(?:pdf|png|jpe?g|webp|gif))/gi`

- Dedup by exact **target** string (keep first-seen casing); collect `sources[]`.
- Fenced `` ``` `` / `~~~` Soft skipped (heading-outline / note-splitter).
- Badge: `.pdf` → `pdf`, image extensions → `img`; Markdown embed without known extension Soft → `img`.
- Lookbehind avoids double-counting targets from `](…)`.

### Scope

- `active`: `notes.active` + `notes.read` of the active Markdown note
- `vault`: `notes.list` → `.md` / `.markdown`, sort `modifiedAt` **DESC** (`localeCompare`), slice `maxNotes`, extract

### Scan gate

No vault list/read in `onActivate`. Scan on:

1. Opening the panel
2. **Refresh** button
3. Command **Refresh Media Refs scan**
4. Command **Copy all media refs** (silent rescan if not yet scanned)

### How to use

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Media Refs*
   - *Refresh Media Refs scan*
   - *Copy all media refs*
2. In the panel: set scope and caps → **Refresh** (only primary) → tap a row to copy · or **Copy all**.

### Storage

`settings`:

```json
{
  "scope": "active",
  "maxNotes": 200,
  "maxItems": 150
}
```

- `scope`: `"active"` | `"vault"`
- `maxNotes`: 50–1000 Soft (vault cap after sort; default 200)
- `maxItems`: 20–500 Soft (list cap; default 150)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts |
| `notes:read` | Active note, list, read bodies |
| `storage` | Settings |
| `clipboard` | Write target(s) to the clipboard |

**No** `network`, **no** `vault:write`, **no** `notes:write`.

### Limits (honest)

- No binary preview and no opening of vault files.
- Relative paths are not resolved/normalized; https is not reachability-checked.
- Vault cap: notes older than `maxNotes` are not scanned.
- List cap `maxItems`: further refs after first-seen order are dropped.
- Fenced code Soft skipped; inline `` `...` `` is **not** specially excluded in v1.
- `![…](…)` without an image/PDF extension Soft counts as `img` (Markdown image syntax).
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
