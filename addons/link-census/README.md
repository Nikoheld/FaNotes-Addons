# Link-Zensus / Link Census

Zählt **Wikilinks**, **MD-Links**, **bare https-URLs** und **Bilder** in der **aktiven Notiz** – kurze Listen, Statusleiste. **Kein Vault-Scan.**

Counts **wikilinks**, **MD links**, **bare https URLs** and **images** in the **active note** – short lists, status bar. **No vault scan.**

> **Abgrenzung / Distinction:** `url-collector` / `media-refs` / `wikilink-map` = **Vault / Sammeln**. **Hier** = nur **aktive Notiz**: Zähler + kurze Listen.
>
> **Distinction:** `url-collector` / `media-refs` / `wikilink-map` = **vault / collect**. **Here** = **active note only**: counters + short lists.

> **Fence-skip Soft:** Fenced `` ``` `` / `~~~` werden Soft übersprungen (wie url-collector / media-refs).
> **Fence-skip Soft:** Fenced `` ``` `` / `~~~` Soft skipped (same as url-collector / media-refs).

> **Active only:** `notes.active` + `editor.getText()` bzw. Soft `notes.read(active)` – **kein** `notes.list`.
> **Active only:** `notes.active` + `editor.getText()` or Soft `notes.read(active)` – **no** `notes.list`.

---

## Deutsch

### Was es tut

- **Panel `census`:** Keyvalue Wikilinks | MD-Links | URLs | Bilder; Liste mit Badge (`wiki` | `md` | `url` | `img`), Ziele gekürzt, Cap `listMax`; Buttons **Aktualisieren** (primary) und **Summary kopieren** (secondary Soft).
- **Statusleiste** `🔗 W/U` (W = Wikilinks, U = bare URLs): nur wenn `showStatus`; Klick öffnet das Panel.
- **Befehle:** Panel öffnen, aktualisieren, Summary in die Zwischenablage.
- Text Soft: `editor.getText()` bevorzugt, sonst `notes.read` der aktiven Notiz.

### Erkennung (Soft, fence-skip)

1. Bilder: `!\[[^\]]*\]\([^)]+\)`
2. MD-Links: `\[[^\]]*\]\([^)]+\)` (Bilder zuvor Soft ausgeblendet)
3. Wikilinks: `\[\[[^\]]+\]\]`
4. Bare https: `https://…` Soft (Trailing `.,;:)` Soft getrimmt; bereits gematchte Spans Soft ausgeblendet)

### Bedienung

1. Öffne eine Markdown-Notiz.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Link-Zensus öffnen*
   - *Link-Zensus aktualisieren*
   - *Link-Zensus Summary kopieren*
3. Im Panel: Statusleiste / `listMax`, **Aktualisieren**, **Summary kopieren**. Listen-Eintrag tippen → Ziel kopieren Soft.

### Einstellungen (Speicher)

Schlüssel `settings`:

```json
{
  "showStatus": true,
  "listMax": 30
}
```

- `showStatus`: Statusleisten-Eintrag (Standard `true`)
- `listMax`: 5–100 Soft (Listen-Cap; Standard 30)
- Speichern mit Rollback bei Fehler

### Ereignisse / Activate

- Soft Refresh bei `note:opened` / `note:saved` (Debounce) – nur wenn Status an **oder** Panel offen; **active only**.
- Activate: bei `showStatus` und aktiver Notiz **ein** Refresh (active-only, kein Vault-Listen-Scan-Gate Soft).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Statusleiste, Toasts |
| `notes:read` | Aktive Notiz Soft lesen |
| `editor` | `editor.getText()` Soft |
| `storage` | Einstellungen |
| `clipboard` | Summary / Ziel kopieren Soft |

**Kein** `network`, **kein** `vault:write`, **kein** `notes:write`, **kein** `notes.list`.

### Grenzen

- **Nur aktive Notiz** – kein Vault-Listen-Scan.
- Fenced-Code Soft ausgeblendet; Inline-Code `` `...` `` wird in v1 **nicht** gesondert ausgeblendet.
- Bare-URLs nur `https://` Soft (kein `http`).
- Listen-Cap `listMax`: weitere Einträge nach Parse-Reihenfolge entfallen in der Anzeige (Counts bleiben vollständig Soft).
- Toasts nur `info` | `success` | `error`.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Panel `census`:** Key values Wikilinks | MD links | URLs | Images; list with badge (`wiki` | `md` | `url` | `img`), truncated targets, cap `listMax`; buttons **Refresh** (primary) and **Copy summary** (secondary Soft).
- **Status bar** `🔗 W/U` (W = wikilinks, U = bare URLs): only when `showStatus`; click opens the panel.
- **Commands:** open panel, refresh, copy summary to the clipboard.
- Text Soft: prefer `editor.getText()`, else Soft `notes.read` of the active note.

### Detection (Soft, fence-skip)

1. Images: `!\[[^\]]*\]\([^)]+\)`
2. MD links: `\[[^\]]*\]\([^)]+\)` (images Soft blanked first)
3. Wikilinks: `\[\[[^\]]+\]\]`
4. Bare https: `https://…` Soft (trailing `.,;:)` Soft trimmed; already-matched spans Soft blanked)

### How to use

1. Open a Markdown note.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Link Census*
   - *Refresh Link Census*
   - *Copy Link Census summary*
3. In the panel: status bar / `listMax`, **Refresh**, **Copy summary**. Tap a list row → Soft copy the target.

### Settings (storage)

Key `settings`:

```json
{
  "showStatus": true,
  "listMax": 30
}
```

- `showStatus`: status-bar item (default `true`)
- `listMax`: 5–100 Soft (list cap; default 30)
- Persist with rollback on failure

### Events / activate

- Soft refresh on `note:opened` / `note:saved` (debounced) – only when status is on **or** the panel is open; **active only**.
- Activate: with `showStatus` and an active note, **one** refresh (active-only, not a vault-list scan-gate Soft).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, status bar, toasts |
| `notes:read` | Soft-read the active note |
| `editor` | Soft `editor.getText()` |
| `storage` | Persist settings |
| `clipboard` | Soft copy summary / target |

**No** `network`, **no** `vault:write`, **no** `notes:write`, **no** `notes.list`.

### Limits

- **Active note only** – no vault list scan.
- Fenced code Soft skipped; inline `` `...` `` is **not** specially excluded in v1.
- Bare URLs are Soft `https://` only (no `http`).
- List cap `listMax`: further items after parse order are dropped from the display (counts stay Soft complete).
- Toasts only `info` | `success` | `error`.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.

---

## Lizenz / License

MIT
