# Zitat-Umbruch / Blockquote Wrap

Stellt **markierte Zeilen** als **Markdown-Blockzitat** mit `>` vor.

Prefixes **selected lines** as a **Markdown blockquote** with `>`.

> **Abgrenzung:** `quote-collector` = Sammeln/Export; `callout-inserter` = Callouts (`> [!info]`); `fence-wrap` = Code-Fence. **Hier** = klassisches `>`-Zitat der Selection.
>
> **Distinction:** `quote-collector` = collect/export; `callout-inserter` = callouts; `fence-wrap` = code fence. **This** = classic `>` quote of the selection.

---

## Deutsch

### Was es tut

- **Hinzufügen (add):** Jede nicht-leere Zeile erhält Soft `> ` **nach** der Einrückung. Bereits mit `>` beginnende Zeilen bekommen Soft ein weiteres `>` (Markdown-Verschachtelung / nested quotes ok). Leerzeilen → `>` wenn `keepBlank`, sonst unverändert.
- **Entfernen (remove):** Soft Strip `/^(\s*)>\s?/` — ein Marker-Level je Zeile, Einrückung bleibt.
- **Umschalten (toggle):** Soft Mehrheitsregel: unter den **nicht-leeren** Zeilen — Mehrheit bereits zitiert → entfernen, sonst hinzufügen (bei Gleichstand → hinzufügen).
- **Panel** (`bq`): Modus-Auswahl, Checkbox `keepBlank`, Button **Anwenden** (einzige Primäraktion).
- **Activate:** nur Einstellungen laden — kein Vault, kein Netzwerk, kein Notes-Zugriff.

### Bedienung

1. Im Markdown-Editor Zeilen markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Auswahl als Blockzitat*
   - *Blockzitat entfernen*
   - *Blockzitat umschalten*
   - *Zitat-Umbruch öffnen* → Panel
3. Im Panel: Modus / `keepBlank` setzen → **Anwenden**.

Ohne Auswahl (leer / nur Whitespace) → Info-Toast „Bitte Zeilen markieren“. Ohne Markdown-Editor → Fehler-Toast.

### Einstellungen (`storage`)

Schlüssel `settings`:

```json
{
  "mode": "add",
  "keepBlank": true
}
```

- `mode`: `add` | `toggle` | `remove` (Default Soft: `add`)
- `keepBlank`: Leerzeilen als `>` belassen beim Hinzufügen (Default Soft: `true`)

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Auswahl lesen / ersetzen |
| `storage` | Einstellungen |

**Kein** `notes:read`/`notes:write`, **kein** `vault:write`, **kein** `network`, **kein** `clipboard`.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **quote-collector** | Zitate sammeln und nach Quotes.md exportieren — hier nur Prefix der Selection |
| **callout-inserter** | Obsidian-Callouts `> [!info]` … — hier klassisches `>`-Zitat |
| **fence-wrap** | Markdown-` ``` `-Fence um die Selection — hier Zeilen-Prefix `>` |
| **blockquote-wrap** (dieses) | Klassisches Markdown-Blockzitat (`>`) der markierten Zeilen |

### Soft-Verhalten

- **Nested quotes:** Im Add-Modus wird Soft immer ein weiteres `> ` gesetzt — verschachtelte Zitate sind beabsichtigt.
- **Toggle majority:** Nur nicht-leere Zeilen zählen; `quoted > n/2` → remove, sonst add.
- **Leerzeilen:** Bei add und `keepBlank=true` → Zeile wird zu `>`; bei `false` bleibt die Leerzeile leer.

### Grenzen

- Nur **aktiver Markdown-Editor** — keine Vault-Suche, kein Bulk über Dateien.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Anwenden*.
- Befehlstitel folgen der UI-Sprache beim Laden; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **quote-collector** | Collect quotes and export to Quotes.md — this only prefixes the selection |
| **callout-inserter** | Obsidian callouts `> [!info]` … — this is a classic `>` quote |
| **fence-wrap** | Markdown ` ``` ` fence around the selection — this is a per-line `>` prefix |
| **blockquote-wrap** (this) | Classic Markdown blockquote (`>`) on selected lines |

### What it does

- **Add:** Every non-empty line Soft gets `> ` **after** its indent. Lines that already start with `>` Soft get another `>` (Markdown nesting / nested quotes ok). Blank lines → `>` when `keepBlank`, otherwise unchanged.
- **Remove:** Soft strip `/^(\s*)>\s?/` — one marker level per line; indent kept.
- **Toggle:** Soft majority rule: among **non-empty** lines — if a majority is already quoted → remove, else add (tie → add).
- **Panel** (`bq`): mode select, `keepBlank` checkbox, **Apply** button (only primary).
- **Activate:** load settings only — no vault, no network, no notes access.

### Usage

1. Select lines in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Wrap selection as blockquote*
   - *Unwrap blockquote*
   - *Toggle blockquote*
   - *Open Blockquote Wrap* → panel
3. In the panel: set mode / `keepBlank` → **Apply**.

Empty selection (empty / whitespace only) → info toast "Please select lines". No Markdown editor → error toast.

### Settings (`storage`)

Key `settings`:

```json
{
  "mode": "add",
  "keepBlank": true
}
```

- `mode`: `add` | `toggle` | `remove` (Soft default: `add`)
- `keepBlank`: keep blank lines as `>` when adding (Soft default: `true`)

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette |
| `ui` | Panel and toasts |
| `editor` | Read / replace selection |
| `storage` | Settings |

**No** `notes:read`/`notes:write`, **no** `vault:write`, **no** `network`, **no** `clipboard`.

### Soft behavior

- **Nested quotes:** In add mode Soft always prefixes another `> ` — nested blockquotes are intentional.
- **Toggle majority:** Only non-empty lines count; `quoted > n/2` → remove, else add.
- **Blank lines:** On add with `keepBlank=true` → line becomes `>`; with `false` the blank stays blank.

### Limits

- **Active Markdown editor** only — no vault search, no bulk across files.
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Apply*.
- Command titles follow the UI language at load; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
