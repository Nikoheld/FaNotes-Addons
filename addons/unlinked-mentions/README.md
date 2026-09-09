# Unverlinkte Erwähnungen / Unlinked Mentions

Findet **Klartext-Erwähnungen anderer Notiztitel** ohne `[[Wikilink]]` und kann sie nach Bestätigung verlinken.

Finds **plain-text mentions of other note titles** without `[[wikilinks]]` and can link them after confirm.

> **Abgrenzung / Distinction:** `wikilink-map` = **bestehende [[Links]]** (Backlinks/Outgoing). `orphan-notes` = Notizen **ohne** Links. `related-by-tags` = gemeinsame **#Tags**. `unlinked-mentions` = **Klartext-Titel** ohne `[[ ]]`.
>
> **Distinction:** `wikilink-map` = **existing [[links]]**. `orphan-notes` = notes **without** links. `related-by-tags` = shared **#tags**. `unlinked-mentions` = **plain-text titles** without `[[ ]]`.

> **Scan-Gate:** `notes.list` / `notes.read` **nicht** in `onActivate` (nur Settings). `notes:write` **nur** nach Bestätigung „Verlinken“.
> **Scan gate:** no `notes.list` / `notes.read` in `onActivate` (settings only). `notes:write` **only** after confirm Link.

---

## Deutsch

### Was es tut

- **Unverlinkte Erwähnungen öffnen:** Panel `mentions` mit Scope-Select (`active` | `vault`), Caps, Status-Checkbox, Primary-Button **Aktualisieren**, Trefferliste (Anzahl + Sample), Button **Zu [[Titel]] verlinken**.
- **Unverlinkte-Erwähnungen-Scan aktualisieren:** Index + Scan neu ausführen.
- **Erste Erwähnung verlinken:** Gewählten oder ersten Treffer nach Bestätigung zu `[[Titel]]` machen (stale-safe Re-Read/Write).
- **Klick** auf einen Listen-Eintrag → Notiz öffnen + Treffer wählen.
- **Statusleiste:** `🔗 N` nur wenn `showStatus` und mindestens einmal in dieser Session gescannt.

### Index & Scan

1. `notes.list()` → nur `.md` / `.markdown` → Map `normTitle → {path, title}` (trim, lowercase, Whitespace kollabieren).
2. **Mehrdeutige Titel** (mehrere Notizen gleicher Norm): Treffer können erscheinen, **Auto-Link wird übersprungen**.
3. Scope:
   - `active`: Text der aktiven Markdown-Notiz
   - `vault`: bis `maxNotes` Notizen, Sortierung `modifiedAt` **DESC** (`localeCompare` auf ISO; fehlendes Datum zuletzt), dann Pfad
4. Pro Notiz: fenced `` ``` `` / `~~~` und Regionen in `[[...]]` überspringen.
5. Für jeden Titel mit Länge ≥ `minTitleLen`: Ganzwort-Match, case-insensitive (Regex escaped); **längere Titel zuerst**.
6. Treffer: `{ path, title, count, sample }` — eigene Titel in der eigenen Notiz werden nicht gematcht.

### Verlinken

1. Treffer wählen (Liste tippen) → Button **Zu [[Titel]] verlinken** oder Befehl **Erste Erwähnung verlinken**.
2. Bestätigungsdialog.
3. Stale-safe: lesen → ersetzen → erneut lesen → ggf. erneut anwenden → `notes.write`. Ersetzt die ersten N Klartext-Vorkommen in **dieser** Notiz durch `[[Titel]]`.

### Scan-Gate

Kein Vault-/Listen-/Lesen in `onActivate`. Scan bei:

1. Panel öffnen
2. Button **Aktualisieren**
3. Befehl **Unverlinkte-Erwähnungen-Scan aktualisieren**
4. Nach erfolgreichem Link (stiller Rescan)

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Unverlinkte Erwähnungen öffnen*
   - *Unverlinkte-Erwähnungen-Scan aktualisieren*
   - *Erste Erwähnung verlinken*
2. Im Panel: Scope und Caps setzen → **Aktualisieren** (einziger Primary) → Treffer tippen → verlinken.

### Speicher

`settings`:

```json
{
  "scope": "active",
  "maxNotes": 300,
  "minTitleLen": 3,
  "showStatus": false
}
```

- `scope`: `"active"` | `"vault"`
- `maxNotes`: 50–1000 (Vault-Cap nach Sortierung)
- `minTitleLen`: 2–50 (kürzere Titel werden ignoriert)
- `showStatus`: Status `🔗 N` (Standard aus)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts, Confirm, Status, `notes.open` |
| `notes:read` | Listen, aktive Notiz, Inhalte lesen |
| `notes:write` | Klartext → `[[Titel]]` **nur nach Confirm** |
| `storage` | Einstellungen |

**Kein** `vault:write`, **kein** `network`.

### Grenzen (ehrlich)

- **False Positives** bei kurzen/häufigen Titeln (z. B. „IT“, „Plan“) — `minTitleLen` erhöhen.
- Nur Ganzwort-Matches; Teilstrings in längeren Wörtern zählen nicht.
- Mehrdeutige Titel: Anzeige möglich, kein Auto-Link.
- Vault-Cap: ältere Notizen jenseits von `maxNotes` werden nicht gescannt.
- Fenced-Code und bestehende `[[Wikilinks]]` werden übersprungen; Inline-Code `` `...` `` wird in v1 **nicht** gesondert ausgeblendet.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Unlinked Mentions:** Panel `mentions` with scope select (`active` | `vault`), caps, status checkbox, primary **Refresh**, hit list (count + sample), button **Link to [[Title]]**.
- **Refresh unlinked-mentions scan:** Rebuild index and scan.
- **Link one mention:** Confirm, then turn the selected or first hit into `[[Title]]` (stale-safe re-read/write).
- **Click** a list row → open the note and select the hit.
- **Status bar:** `🔗 N` only when `showStatus` and at least one scan this session.

### Index & scan

1. `notes.list()` → `.md` / `.markdown` only → map `normTitle → {path, title}` (trim, lowercase, collapse whitespace).
2. **Ambiguous titles** (several notes share a norm): hits may still show; **auto-link is skipped**.
3. Scope:
   - `active`: text of the active Markdown note
   - `vault`: up to `maxNotes` notes, sort `modifiedAt` **DESC** (`localeCompare` on ISO; missing dates last), then path
4. Per note: skip fenced `` ``` `` / `~~~` and regions inside `[[...]]`.
5. For each title with length ≥ `minTitleLen`: whole-word, case-insensitive match (escaped regex); **longer titles first**.
6. Hit: `{ path, title, count, sample }` — a note's own title is not matched inside itself.

### Linking

1. Select a hit (tap the list) → **Link to [[Title]]** or command **Link one mention**.
2. Confirm dialog.
3. Stale-safe: read → replace → re-read → re-apply if needed → `notes.write`. Replaces the first N plain occurrences in **that** note with `[[Title]]`.

### Scan gate

No vault/list/read in `onActivate`. Scan on:

1. Panel open
2. **Refresh** button
3. **Refresh unlinked-mentions scan** command
4. After a successful link (silent rescan)

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Unlinked Mentions*
   - *Refresh unlinked-mentions scan*
   - *Link one mention*
2. In the panel: set scope and caps → **Refresh** (only primary) → tap a hit → link.

### Storage

Same `settings` shape as above.

- `scope`: `"active"` | `"vault"`
- `maxNotes`: 50–1000
- `minTitleLen`: 2–50
- `showStatus`: status `🔗 N` (default off)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts, confirm, status, `notes.open` |
| `notes:read` | List, active note, read bodies |
| `notes:write` | Plain text → `[[Title]]` **only after confirm** |
| `storage` | Settings |

**No** `vault:write`, **no** `network`.

### Limits (honest)

- **False positives** with short/common titles (e.g. “IT”, “Plan”) — raise `minTitleLen`.
- Whole-word matches only; substrings inside longer words do not count.
- Ambiguous titles: may show; no auto-link.
- Vault cap: notes beyond `maxNotes` are not scanned.
- Fenced code and existing `[[wikilinks]]` are skipped; inline code `` `...` `` is **not** specially excluded in v1.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
