# Pfad kopieren / Path Copier

Kopiert **Pfad**, **Titel** oder **Wikilink** der **aktiven Notiz** in die Zwischenablage.

Copies **path**, **title** or **wikilink** of the **active note** to the clipboard.

> **Abgrenzung:** `pinboard` = Notiz/Auswahl **merken** (Pins); `wikilink-wrap` = Editor-**Selection** als `[[…]]` umhüllen. **Hier** = Metadaten der aktiven Notiz → `clipboard.writeText`. Kein Vault-Scan.
>
> **Distinction:** `pinboard` = **pin/remember** notes/selections; `wikilink-wrap` = wrap editor **selection** as `[[…]]`. **This** = active-note metadata → `clipboard.writeText`. No vault scan.

---

## Deutsch

### Was es tut

- **Notiz-Pfad kopieren:** Vault-relativen Pfad der aktiven Notiz in die Zwischenablage.
- **Notiz-Titel kopieren:** Titel Soft (`note.title` oder Dateiname ohne Endung).
- **Notiz-Wikilink kopieren:** `[[Titel]]` (Titel, **nicht** Pfad).
- **Pfad kopieren öffnen:** Panel `copy` mit Vorschau, Standardmodus und Buttons.
- **Statusleiste (optional):** kurzes Modus-Kürzel; Klick kopiert den Standardmodus.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Notiz-Pfad kopieren*
   - *Notiz-Titel kopieren*
   - *Notiz-Wikilink kopieren*
   - *Pfad kopieren öffnen*
2. Im Panel:
   - Key-Value: Pfad | Titel (gekürzt ~48 Zeichen)
   - Select **Standardmodus** (persistiert)
   - **Kopieren** (primär) nutzt den Standardmodus
   - Reihe: **Pfad** | **Titel** | **Wikilink** (sekundär)
   - Checkbox Statusleiste

Ohne aktive Notiz → Fehler-Toast. Erfolg → Success-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "defaultMode": "path",
  "showStatus": false
}
```

- `defaultMode`: `path` | `title` | `wikilink` (Default `path`)
- `showStatus`: Statusleisten-Kürzel (Default `false`)

`onActivate` lädt nur die Einstellungen und setzt ggf. die Statusleiste (nur Modus-Kürzel) — **kein** Vault-Scan. `notes.active` nur beim Kopieren und beim Panel-Öffnen/Refresh.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Statusleiste und Toasts |
| `notes:read` | `notes.active()` für Pfad/Titel |
| `clipboard` | `clipboard.writeText` |
| `storage` | Einstellungen |

**Kein** `notes:write`, **kein** `editor`, **kein** `network`, **kein** `vault:write`.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **pinboard** | Merkt Pins (Notiz/Auswahl) in einer Liste — hier nur einmaliges Kopieren von Metadaten |
| **wikilink-wrap** | Umhüllt die Editor-Selection als `[[…]]` — hier Metadaten der aktiven Notiz, kein Editor |
| **note-properties** | Zeigt/bearbeitet Notiz-Eigenschaften — hier nur Clipboard-Export |

### Grenzen

- Braucht eine aktive Notiz (`notes.active`); sonst Fehler-Toast.
- Wikilink Soft = `[[Titel]]`. Bei **Titelkollisionen** (gleiche Titel, unterschiedliche Pfade) kann der Link mehrdeutig sein — kein Pfad-Wikilink, kein Auto-Disambiguieren.
- Panel-Anzeige kürzt Pfad/Titel Soft auf ~48 Zeichen; die Zwischenablage enthält den vollen Wert.
- Kein schwerer Vault-Scan (`notes.list` / `tree` / `search`).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Copy note path:** Vault-relative path of the active note to the clipboard.
- **Copy note title:** Title Soft (`note.title` or basename without extension).
- **Copy note wikilink:** `[[title]]` (title, **not** path).
- **Open Path Copier:** Panel `copy` with preview, default mode and buttons.
- **Status bar (optional):** short mode abbrev; click copies the default mode.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Copy note path*
   - *Copy note title*
   - *Copy note wikilink*
   - *Open Path Copier*
2. In the panel:
   - Key-value: Path | Title (truncated Soft ~48 chars)
   - Select **Default mode** (persisted)
   - **Copy** (primary) uses the default mode
   - Row: **Path** | **Title** | **Wikilink** (secondary)
   - Status bar checkbox

No active note → error toast. Success → success toast.

### Storage

Key `settings`:

```json
{
  "defaultMode": "path",
  "showStatus": false
}
```

- `defaultMode`: `path` | `title` | `wikilink` (default `path`)
- `showStatus`: status-bar abbrev (default `false`)

`onActivate` only loads settings and may set the status bar (mode abbrev only) — **no** vault scan. `notes.active` only when copying and when opening/refreshing the panel.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, status bar and toasts |
| `notes:read` | `notes.active()` for path/title |
| `clipboard` | `clipboard.writeText` |
| `storage` | Settings |

**No** `notes:write`, **no** `editor`, **no** `network`, **no** `vault:write`.

### Differentiation

| Add-on | Difference |
| --- | --- |
| **pinboard** | Remembers pins (note/selection) in a list — here one-shot metadata copy only |
| **wikilink-wrap** | Wraps the editor selection as `[[…]]` — here active-note metadata, no editor |
| **note-properties** | Shows/edits note properties — here clipboard export only |

### Limits

- Needs an active note (`notes.active`); otherwise error toast.
- Wikilink Soft = `[[title]]`. With **title collisions** (same title, different paths) the link can be ambiguous — no path-based wikilink, no auto-disambiguation.
- Panel display truncates path/title Soft to ~48 characters; the clipboard gets the full value.
- No heavy vault scan (`notes.list` / `tree` / `search`).
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
