# Kaputte Einbettungen / Broken Embeds

Findet **Bild-/PDF-Einbettungen**, deren Zieldatei im Vault **fehlt**.

Finds **image/PDF embeds** whose target file is **missing** in the vault.

> **Abgrenzung / Distinction:** `media-refs` = **alle** Bild-/PDF-Verweise listen (ohne Existenzcheck). `url-collector` = **https**-Links. `orphan-notes` = **Wikilinks**. `broken-embeds` = **lokale** Media-Targets gegen `notes.list` / `notes.exists`.
>
> **Distinction:** `media-refs` = **list all** image/PDF refs (no existence check). `url-collector` = **https** links. `orphan-notes` = **wikilinks**. `broken-embeds` = **local** media targets vs `notes.list` / `notes.exists`.

> **Nur Vault-relative Media:** `https://…` Ziele werden **ignoriert** (nicht „kaputt im Vault“).
> **Vault-relative media only:** `https://…` targets are **ignored** (not “broken in the vault”).

> **Scan-Gate:** `notes.list` / `notes.read` / `notes.exists` **nicht** in `onActivate` (nur Settings + kalten Status entfernen).
> **Scan gate:** no `notes.list` / `notes.read` / `notes.exists` in `onActivate` (settings + cold status remove only).

---

## Deutsch

### Was es tut

- **Kaputte Einbettungen öffnen:** Panel `broken` mit Scope-Select (`active` | `vault`), Ordner-Eingabe, Primary-Button **Aktualisieren**, Key-Value (**Broken** | **Gescannt**), Liste (Titel = aufgelöstes Ziel, Detail = Quell-Titel/Pfad).
- **Kaputte-Einbettungen-Scan aktualisieren:** Active oder Vault erneut scannen.
- **Erste kaputte Einbettung öffnen:** Öffnet die Quellnotiz des ersten Treffers; Toast, wenn keiner.
- **Klick** auf einen Listen-Eintrag → `notes.open(source)`.
- **Statusleiste:** `⚠ N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt (`N` = Anzahl kaputter Einbettungen); **Klick öffnet das Panel**. Nie beim Activate.

### Erkennung

1. Markdown-Bilder: `![alt](target)` (wie `media-refs`)
2. Bare-Medien: Pfade mit Endung `.pdf` / `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`

- `https://` und andere Schemas werden übersprungen.
- Auflösung: `decodeURIComponent`, Query/Hash abschneiden, relativ zum Notizordner joinen, `..` ablehnen, normalisieren.
- Existenz: Set aller `notes.list`-Pfade; wenn nicht im Set → `notes.exists(resolved)`; fehlt, wenn weder im Set noch existiert.
- Fenced `` ``` `` / `~~~` Blöcke werden beim Extrahieren übersprungen.

### Scope

- `active`: nur die aktive Markdown-Notiz lesen
- `vault`: `notes.list` → `.md` / `.markdown`, optional Ordnerfilter, Sortierung `modifiedAt` **DESC**, Slice `maxNotes`, jede Notiz lesen

### Scan-Gate

Kein Vault-/Listen-/Lesen in `onActivate`. Scan bei:

1. Panel öffnen
2. Button **Aktualisieren**
3. Befehl **Kaputte-Einbettungen-Scan aktualisieren**
4. Befehl **Erste kaputte Einbettung öffnen**

Busy/Queue: parallele Scans werden gequeued (wie `media-refs` / `conflict-finder` / `empty-notes`).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Kaputte Einbettungen öffnen*
   - *Kaputte-Einbettungen-Scan aktualisieren*
   - *Erste kaputte Einbettung öffnen*
2. Im Panel: Scope und optional Ordner setzen → **Aktualisieren** (Primary) → Zeile tippen öffnet die Quellnotiz.

### Speicher

`settings`:

```json
{
  "scope": "active",
  "maxNotes": 250,
  "folder": "",
  "showStatus": false
}
```

- `scope`: `"active"` | `"vault"` (Default `active`)
- `maxNotes`: 1–2000 (Vault-Cap nach Sortierung; Default 250)
- `folder`: vault-relativer Präfix, leer = alle; kein `..`
- `showStatus`: Status `⚠ N` (Standard `false`)

Einstellungen werden mit Rollback gespeichert (bei Fehler Toast + alter Wert).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Notizen listen/lesen/existenzprüfen (`list` / `read` / `exists`) |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `network`, **kein** `vault:write`. v1 schreibt nichts.

### Grenzen (ehrlich)

- Nur Vault-relative Ziele; Remote-URLs zählen nie als „kaputt“.
- Bilder außerhalb von `notes.list` werden über `notes.exists` geprüft — hängt vom Host ab.
- Relative Pfade mit `..` werden abgelehnt (Sicherheit).
- Cap `maxNotes` (Standard 250) im Vault-Scope; neueste zuerst.
- Status erscheint erst nach Nutzer-Scan in der Session (kein Kaltstart-Status).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Erkennung ≠ Reparatur: fehlende Dateien müssen manuell wiederhergestellt oder Links bereinigt werden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Broken Embeds:** Panel `broken` with scope select (`active` | `vault`), folder input, primary **Refresh** button, key-value (**Broken** | **Scanned**), list (title = resolved target, detail = source title/path).
- **Refresh broken embeds scan:** Re-scan active note or vault.
- **Open first broken embed:** Opens the source note of the first hit; toast if none.
- **Click** a list row → `notes.open(source)`.
- **Status bar:** `⚠ N` only when `showStatus` and at least one scan this session (`N` = broken embed count); **click opens the panel**. Never on Activate.

### Detection

1. Markdown images: `![alt](target)` (same as `media-refs`)
2. Bare media: paths ending in `.pdf` / `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`

- `https://` and other schemes are skipped.
- Resolve: `decodeURIComponent`, strip query/hash, join with note folder, reject `..`, normalize.
- Existence: set of all `notes.list` paths; if not in set → `notes.exists(resolved)`; missing when neither in set nor exists.
- Fenced `` ``` `` / `~~~` blocks are skipped during extraction.

### Scope

- `active`: read the active Markdown note only
- `vault`: `notes.list` → `.md` / `.markdown`, optional folder filter, sort `modifiedAt` **DESC**, slice `maxNotes`, read each

### Scan gate

No vault list/read in `onActivate`. Scan on:

1. Opening the panel
2. **Refresh** button
3. **Refresh broken embeds scan** command
4. **Open first broken embed** command

Busy/queue: parallel scans are queued (same as `media-refs` / `conflict-finder` / `empty-notes`).

### How to use

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Broken Embeds*
   - *Refresh broken embeds scan*
   - *Open first broken embed*
2. In the panel: set scope and optional folder → **Refresh** (primary) → tap a row to open the source note.

### Storage

`settings`:

```json
{
  "scope": "active",
  "maxNotes": 250,
  "folder": "",
  "showStatus": false
}
```

- `scope`: `"active"` | `"vault"` (default `active`)
- `maxNotes`: 1–2000 (vault cap after sort; default 250)
- `folder`: vault-relative prefix, empty = all; no `..`
- `showStatus`: status `⚠ N` (default `false`)

Settings persist with rollback (on failure: toast + previous value).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, status bar, `notes.open` |
| `notes:read` | List/read/exists (`list` / `read` / `exists`) |
| `storage` | Settings |

**No** `notes:write`, **no** `network`, **no** `vault:write`. v1 writes nothing.

### Limits (honest)

- Vault-relative targets only; remote URLs never count as “broken”.
- Images outside `notes.list` are checked via `notes.exists` — depends on the host.
- Relative paths with `..` are rejected (safety).
- Cap `maxNotes` (default 250) in vault scope; newest first.
- Status appears only after a user scan in the session (no cold-start status).
- Command titles follow UI language at start; reload the add-on after a language switch.
- Detection ≠ repair: restore missing files or clean links manually.

### Version

1.0.0 – initial release.
