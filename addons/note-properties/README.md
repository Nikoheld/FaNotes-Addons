# Notiz-Eigenschaften / Note Properties

Liest und schreibt **Key: Value-Eigenschaften am Anfang der Notiz** (kein YAML `---`). Panel `props`, Presets, Speichern über Editor oder Notizdatei.

Reads and writes **Key: Value properties at the start of a note** (no YAML `---`). Panel `props`, presets, save via editor or note file.

> **Abgrenzung / vs tag-browser:** `tag-browser` sammelt **#Hashtags** vault-weit (Wolke + Drill-down). `note-properties` bearbeitet **Key: Value-Metadaten am Dateianfang der aktiven Notiz** — kein Tag-Scan, kein Vault-Index.
>
> **Distinction / vs tag-browser:** `tag-browser` collects **#hashtags** vault-wide (cloud + drill-down). `note-properties` edits **Key: Value metadata at the start of the active note** — no tag scan, no vault index.

> **v1:** Kein YAML-Frontmatter, kein Vault-Scan, kein Netzwerk, kein `vault:write`. Nur aktive Markdown-Notiz.
> **v1:** No YAML frontmatter, no vault scan, no network, no `vault:write`. Active Markdown note only.

---

## Deutsch

### Was es tut

- **Notiz-Eigenschaften öffnen:** Panel `props` mit Eingaben je Schlüssel, Select für Auswahl, Buttons **Speichern** (einziger Primary) | **Neu** | **Presets** | **Entfernen**.
- **Eigenschaften neu laden:** Liest den Key: Value-Block erneut (bevorzugt `editor.getText`, sonst `notes.read`).
- **Preset-Schlüssel ergänzen:** Fehlende Keys aus `defaultKeys` (`Fach`, `Status`, `Dozent`, `Blatt`) mit leerem Wert ergänzen (erst **Speichern** schreibt).

### Block-Format

Am Dateianfang (nach optionalem BOM), aufeinanderfolgende Zeilen:

```
/^([A-Za-zÄÖÜäöüß0-9_\-/ ]{1,40}):\s*(.*)$/
```

- Ende beim **ersten Leerzeilen- oder Nicht-Treffer**
- Schlüssel werden getrimmt; **Doppelte Keys: letzter Wert gewinnt** beim Lesen; beim Schreiben **eindeutig**
- **Kein** YAML `---`

**Soft (Parse unsicher):** YAML-`---`-Zaun am Anfang und/oder doppelte Schlüssel → Warn-Callout; **Speichern** fragt per Confirm nach.

### Lesen / Schreiben

| Aktion | Reihenfolge |
| --- | --- |
| Lesen | `editor.getText()` wenn verfügbar, sonst `notes.active` + `notes.read` |
| Schreiben | `editor.setText` wenn Editor offen, sonst `notes.write` |
| Stale Soft | Vor `notes.write` ohne Editor: **erneut lesen**, Body aus frischem Parse |

Rekonstruktion: `propsBlock + '\n' + bodyAfterBlock` (bei leerem Block nur Body).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Notiz-Eigenschaften öffnen*
   - *Eigenschaften neu laden*
   - *Preset-Schlüssel ergänzen*
2. Werte editieren → **Speichern** (Primary). **Neu** fragt nach einem Schlüssel. **Presets** ergänzt fehlende. **Entfernen** löscht den ausgewählten Key (Confirm).

### Activate

Nur Presets aus `storage` laden. **Kein** Vault-Scan, **kein** Notizlesen beim Start.

### Speicher

`presets`:

```json
{
  "defaultKeys": ["Fach", "Status", "Dozent", "Blatt"]
}
```

UI-Labels per `t` (z. B. Fach → Subject); **gespeicherte Schlüsselnamen** bleiben wie in der Datei.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel, Toasts, Prompt, Confirm |
| `editor` | `getText` / `setText` der offenen Notiz |
| `notes:read` | Aktive Notiz lesen (Fallback) |
| `notes:write` | Schreiben wenn kein Editor |
| `storage` | Preset-Schlüssel |

**Kein** `network`, **kein** `vault:write`.

### Grenzen (ehrlich)

- Nur **aktive** Markdown-Notiz — kein Ordner-/Vault-Bulk.
- Kein YAML-Frontmatter (`---`); Soft-Warnung + Confirm beim Speichern, wenn `---` am Anfang steht.
- Doppelte Keys beim Lesen: letzter Wert Soft; Schreiben dedupliziert.
- Änderungen an Neu/Presets/Entfernen sind erst nach **Speichern** in der Datei.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Note Properties:** Panel `props` with one input per key, selection select, buttons **Save** (only primary) | **New** | **Presets** | **Remove**.
- **Reload properties:** Re-reads the Key: Value block (prefers `editor.getText`, else `notes.read`).
- **Apply preset keys:** Adds missing keys from `defaultKeys` (`Fach`, `Status`, `Dozent`, `Blatt`) with empty values (**Save** writes).

### Block format

At file start (after optional BOM), consecutive lines:

```
/^([A-Za-zÄÖÜäöüß0-9_\-/ ]{1,40}):\s*(.*)$/
```

- Ends at the **first blank line or non-match**
- Keys trimmed; **duplicate keys: last wins** on parse; **unique** on write
- **No** YAML `---`

**Soft (uncertain parse):** YAML `---` fence at start and/or duplicate keys → warning callout; **Save** asks for confirm.

### Read / write

| Action | Order |
| --- | --- |
| Read | `editor.getText()` when available, else `notes.active` + `notes.read` |
| Write | `editor.setText` when editor open, else `notes.write` |
| Stale Soft | Before `notes.write` without editor: **re-read**, take body from fresh parse |

Reconstruct: `propsBlock + '\n' + bodyAfterBlock` (body only when the block is empty).

### How to use

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Note Properties*
   - *Reload properties*
   - *Apply preset keys*
2. Edit values → **Save** (primary). **New** prompts for a key. **Presets** fills missing. **Remove** deletes the selected key (confirm).

### Activate

Load presets from `storage` only. **No** vault scan, **no** note read on start.

### Storage

`presets`:

```json
{
  "defaultKeys": ["Fach", "Status", "Dozent", "Blatt"]
}
```

UI labels via `t` (e.g. Fach → Subject); **stored key names** stay as in the file.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel, toasts, prompt, confirm |
| `editor` | `getText` / `setText` for the open note |
| `notes:read` | Read active note (fallback) |
| `notes:write` | Write when no editor |
| `storage` | Preset keys |

**No** `network`, **no** `vault:write`.

### Limits (honest)

- **Active** Markdown note only — no folder/vault bulk.
- No YAML frontmatter (`---`); Soft warning + confirm on save when `---` is at the start.
- Duplicate keys on read: last value Soft; write deduplicates.
- New / Presets / Remove changes hit the file only after **Save**.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
