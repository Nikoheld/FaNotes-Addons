# Überschrift-Stufe / Heading Shift

Erhöht oder verringert die **Überschrift-Stufe markierter ATX-Zeilen** (`#+` Shift in der Selection).

Increases or decreases the **heading level of selected ATX lines** (`#+` shift in the selection).

---

## Deutsch

### Was es tut

- **Überschrift-Stufe öffnen:** Panel mit Erklärung zu Promote/Demote und Buttons *Hochstufen* / *Herabstufen*.
- **Hochstufen (Promote):** Weniger `#` – z. B. `## Titel` → `# Titel` (H2→H1).
- **Herabstufen (Demote):** Mehr `#` – z. B. `## Titel` → `### Titel` (H2→H3).
- Pro Zeile Soft: Match `/^(#{1,6})(\s+)(.*)$/` → Hash-Anzahl ±1, geklemmt auf `clampMin`..`clampMax`.
- Soft `onlyHeadingLines` fest `true` (v1, nicht im Panel): Zeilen ohne ATX-Überschrift bleiben unverändert.
- Ergebnis Soft: `replaceSelection` der zusammengefügten Zeilen.

### Bedienung

1. Im Markdown-Editor Zeilen markieren (ATX-Überschriften `#{1–6}` plus optional andere Zeilen).
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Überschrift-Stufe öffnen*
   - *Überschrift hochstufen* / *Überschrift herabstufen*
3. Oder im Panel *Hochstufen* (primär) bzw. *Herabstufen* (sekundär).

Ohne Auswahl (leer / nur Whitespace) → Info-Toast „Bitte Zeilen markieren“.
Auswahl ohne Heading-Zeile → Info-Toast „Keine Überschrift-Zeile in der Auswahl“.
Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "clampMin": 1,
  "clampMax": 6,
  "onlyHeadingLines": true
}
```

- `clampMin` / `clampMax`: Soft 1..6 (Defaults Soft: `1` / `6`). Stufe nach Shift Soft in diesem Bereich geklemmt. Im Panel v1 nicht exponiert.
- `onlyHeadingLines`: Soft fest `true` (v1 hidden/fixed). Nicht-Überschrift-Zeilen Soft unverändert; Einstellung nicht im Panel.

`onActivate` lädt nur den Speicher – kein Vault-Scan.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Auswahl lesen und ersetzen (`getSelection` / `replaceSelection`) |
| `storage` | Einstellungen |

**Kein** `notes:read`/`notes:write`, **kein** `vault:write`, **kein** `network`, **kein** `clipboard`.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **heading-outline** | Gliederung/TOC aus Überschriften – hier nur `#+` Shift in der Selection |
| **note-splitter** | Notiz an Überschriften splitten – hier keine Datei-Splits |
| **line-tools** | Sortieren / Deduplizieren / Umdrehen – hier Hash-Anzahl der ATX-Zeilen |
| **list-convert** | Listen-Prefix der Selection – hier Überschrift-Stufe |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection.
- Nur ATX (`#`…`###### `); Setext-Überschriften Soft unverändert.
- Soft `onlyHeadingLines` fest `true`: Nicht-Heading-Zeilen Soft unverändert.
- Soft Clamps `clampMin`..`clampMax` (Default 1..6); H1 Soft nicht unter `clampMin`, H6 Soft nicht über `clampMax`.
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Kein Netzwerk, kein Vault – Einstellungen leben nur im Add-on-Speicher.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Heading Shift:** Panel with a Promote/Demote explanation and *Promote* / *Demote* buttons.
- **Promote:** Fewer `#` — e.g. `## Title` → `# Title` (H2→H1).
- **Demote:** More `#` — e.g. `## Title` → `### Title` (H2→H3).
- Per line Soft: match `/^(#{1,6})(\s+)(.*)$/` → change hash count ±1, clamped to `clampMin`..`clampMax`.
- Soft `onlyHeadingLines` fixed `true` (v1, not in the panel): non-heading lines stay unchanged.
- Result Soft: `replaceSelection` of the joined lines.

### Usage

1. Select lines in the Markdown editor (ATX headings `#{1–6}` plus optional other lines).
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Heading Shift*
   - *Promote heading* / *Demote heading*
3. Or use *Promote* (primary) / *Demote* (secondary) in the panel.

No selection (empty / whitespace only) → info toast "Please select lines".
Selection with no heading line → info toast "No heading line in the selection".
No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "clampMin": 1,
  "clampMax": 6,
  "onlyHeadingLines": true
}
```

- `clampMin` / `clampMax`: Soft 1..6 (Soft defaults: `1` / `6`). After a shift, the level is Soft clamped to this range. Not exposed in the panel in v1.
- `onlyHeadingLines`: Soft fixed `true` (v1 hidden/fixed). Non-heading lines Soft unchanged; the setting is not in the panel.

`onActivate` only loads settings — no vault scan.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Read and replace selection (`getSelection` / `replaceSelection`) |
| `storage` | Settings |

**No** `notes:read`/`notes:write`, **no** `vault:write`, **no** `network`, **no** `clipboard`.

### Differentiation

| Add-on | Difference |
| --- | --- |
| **heading-outline** | Outline/TOC from headings — here only `#+` shift in the selection |
| **note-splitter** | Split a note at headings — here no file splits |
| **line-tools** | Sort / dedupe / reverse — here hash count of ATX lines |
| **list-convert** | List prefix of the selection — here heading level |

### Limits

- Selection only; never rewrites the whole file without a selection.
- ATX only (`#`…`###### `); Setext headings Soft unchanged.
- Soft `onlyHeadingLines` fixed `true`: non-heading lines Soft unchanged.
- Soft clamps `clampMin`..`clampMax` (default 1..6); H1 Soft not below `clampMin`, H6 Soft not above `clampMax`.
- Markdown editor only; pen mode/PDF → error toast.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
