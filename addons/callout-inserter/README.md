# Callout-Einfüger / Callout Inserter

Fügt Obsidian-kompatible Markdown-Callouts (`> [!info]`, `> [!warning]`, `> [!tip]` …) in den offenen Editor ein – mit Auswahl als Körper oder kurzem Platzhalter.

Inserts Obsidian-compatible markdown callouts (`> [!info]`, `> [!warning]`, `> [!tip]`, …) into the open editor — wrapping the selection as the body or using a short placeholder.

---

## Deutsch

### Was es tut

- **Callout-Einfüger öffnen:** Panel mit Typ-Liste (Klick = sofort einfügen) und Einstellungen.
- **Schnellbefehle:** Info-, Warnungs- und Tipp-Callout direkt einfügen.
- **Letzten Callout einfügen:** Den zuletzt genutzten Typ erneut einfügen.
- **Extras:** Zusätzlich `success` und `note` (gleiche Mechanik, im Panel wählbar).
- **Einstellungen:** Leerzeile davor / danach, abschließender Zeilenumbruch (Standard: alle an).

### Markdown-Format (v1)

```markdown
> [!info]
> Körper

> [!warning]
> Körper

> [!tip]
> Körper
```

Bei **Auswahl** im Editor wird der markierte Text zum Callout-Körper (jede Zeile mit `> ` bzw. leere Zeilen als `>`). Ohne Auswahl wird ein kurzer Platzhalter eingefügt (z. B. „Dein Hinweis…“), den du direkt überschreiben kannst.

Einfügen: `editor.replaceSelection`, wenn eine Auswahl existiert, sonst `editor.insert(text, 'cursor')`. Ohne Markdown-Editor → Fehler-Toast.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Callout-Einfüger öffnen*
   - *Info-Callout einfügen* / *Warnungs-Callout einfügen* / *Tipp-Callout einfügen*
   - *Letzten Callout einfügen*
2. Im Panel: Typ anklicken → Einfügen; optional Einstellungen umschalten; **Zuletzt einfügen**.

### Speicher

Schlüssel `data`:

```json
{
  "settings": {
    "blankBefore": true,
    "blankAfter": true,
    "trailingNewline": true,
    "lastType": "info"
  }
}
```

Beim Laden werden Werte validiert/geklammert; Speichern ist rollback-sicher (bei Fehler wird der vorherige Stand wiederhergestellt).

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Text an Cursor/Auswahl einfügen oder ersetzen |
| `storage` | Einstellungen und zuletzt genutzter Typ |

**Kein** `network`, **kein** `notes:read`/`notes:write`, **kein** `clipboard`, **kein** Vault-Scan. `onActivate` lädt nur den Speicher.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **template-library** | Freie Textvorlagen mit CRUD und Platzhaltern (`{{date}}` …) – hier nur feste Callout-Typen |
| **math-snippets** | LaTeX `$…$` / `$$…$$` – hier kein LaTeX, nur Callout-Blöcke |

### Grenzen

- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Toast „Kein Markdown-Editor“.
- Kein Netzwerk, kein Vault-Schreiben – Einstellungen leben nur im Add-on-Speicher.
- Keine eigenen Callout-Typen und keine Vorlagen-Bibliothek in v1.
- Kein Statusleisten-Eintrag; kein Timer.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Callout Inserter:** Panel with a type list (click = insert immediately) and settings.
- **Quick commands:** Insert info, warning, or tip callouts directly.
- **Insert last callout:** Re-inserts the last-used type.
- **Extras:** Also `success` and `note` (same mechanics, available in the panel).
- **Settings:** Blank line before / after, trailing newline (all default on).

### Markdown format (v1)

```markdown
> [!info]
> body

> [!warning]
> body

> [!tip]
> body
```

With a **selection**, that text becomes the callout body (each line prefixed with `> `, empty lines as `>`). Without a selection, a short placeholder is inserted (e.g. “Your note…”) for you to edit.

Insert uses `editor.replaceSelection` when a selection exists, otherwise `editor.insert(text, 'cursor')`. No Markdown editor → error toast.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Callout Inserter*
   - *Insert info callout* / *Insert warning callout* / *Insert tip callout*
   - *Insert last callout*
2. In the panel: click a type → insert; optionally toggle settings; use **Insert last**.

### Storage

Key `data`:

```json
{
  "settings": {
    "blankBefore": true,
    "blankAfter": true,
    "trailingNewline": true,
    "lastType": "info"
  }
}
```

Values are validated/clamped on load; writes are rollback-safe (previous state restored on failure).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Insert or replace text at cursor/selection |
| `storage` | Settings and last-used type |

**No** `network`, **no** `notes:read`/`notes:write`, **no** `clipboard`, **no** vault scan. `onActivate` only loads storage.

### Boundaries

| Add-on | Difference |
| --- | --- |
| **template-library** | Freeform text templates with CRUD and placeholders (`{{date}}` …) — here only fixed callout types |
| **math-snippets** | LaTeX `$…$` / `$$…$$` — here no LaTeX, only callout blocks |

### Limits

- Only in an open Markdown editor; pen mode/PDF → “No Markdown editor” toast.
- No network, no vault writes — settings live only in add-on storage.
- No custom callout types and no template library in v1.
- No status-bar entry; no timers.
- Command titles follow the UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
