# Vokabelkarten / Vocab Cards

Baut **Vokabelkarten** aus Markdown-Tabellen oder Zeilen `Begriff — Übersetzung`, speichert ein Deck lokal und bietet **Review** mit **Leicht / Schwer** (SRS v1). Kein Vault-Schreiben, kein Netzwerk.

Builds **vocab cards** from Markdown tables or `Term — Translation` lines, stores a deck locally, and offers **review** with **Easy / Hard** (SRS v1). No vault writes, no network.

---

## Deutsch

### Was es tut

- **Vokabelkarten öffnen:** Panel (`id=cards`) mit Key-Value **Fällig / Neu / Gesamt**, Buttons *Review starten* und *Neu einlesen*.
- **Karten aus Notiz bauen:** Parst die **aktive** Markdown-Notiz (optional denselben Ordner, max. 200 Notizen).
- **Vokabeln wiederholen:** Warteschlange fälliger Karten: Vorderseite → *Aufdecken* → *Leicht* / *Schwer*.
- Fortschritt bleibt beim Neu-Einlesen erhalten, wenn Vorder- und Rückseitentext gleich bleiben.

### Parser v1

**A) Markdown-Tabelle** – erste zwei Spalten = Vorder- / Rückseite. Kopfzeile wird übersprungen, wenn sie `begriff`, `term`, `front`, `vokabel` oder `wort` enthält.

```markdown
| Begriff | Übersetzung |
| --- | --- |
| apple | Apfel |
| to learn | lernen |
```

**B) Zeilenpaar** – Regex `/^(.*?\S)\s*[—–\-:]\s+(.+\S)\s*$/u` (Em-/En-Dash, Bindestrich oder Doppelpunkt):

```markdown
apple — Apfel
to learn: lernen
Haus – house
```

- Inhalt in ` ``` `-Codefences wird ignoriert.
- Max. **500** Karten pro Deck; optionaler Ordner-Scan max. **200** Notizen (zuletzt geänderte zuerst).
- Nur `.md` / `.markdown`.

### SRS v1 (Leicht / Schwer)

| Bewertung | Wirkung |
| --- | --- |
| **Leicht** | Erstes Mal → fällig in **1 Tag**; danach Intervall **×2** (max. 365 Tage). `reps++`. |
| **Schwer** | Intervall = 0; erneut fällig in **10 Minuten**. |

Neue Karten starten mit `dueAt: 0` (sofort fällig) und `reps: 0`.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Vokabelkarten öffnen*
   - *Karten aus Notiz bauen*
   - *Vokabeln wiederholen*
2. Im Panel optional **Gleichen Ordner einbeziehen**, dann **Neu einlesen**.
3. Review: Vorderseite lesen → **Aufdecken** → **Leicht** oder **Schwer**.

### Speicher

Schlüssel `data`:

```json
{
  "deck": {
    "id": "…",
    "title": "…",
    "sourcePath": "Sprachen/Englisch.md",
    "updatedAt": 0,
    "cards": [
      {
        "id": "…",
        "front": "apple",
        "back": "Apfel",
        "dueAt": 0,
        "intervalDays": 0,
        "reps": 0,
        "sourcePath": "Sprachen/Englisch.md"
      }
    ]
  },
  "settings": {
    "includeFolder": false,
    "maxNotes": 200,
    "maxCards": 500
  }
}
```

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Toasts |
| `notes:read` | Aktive Notiz / Ordner lesen |
| `storage` | Deck und Einstellungen |

**Kein** `notes:write`, **kein** `network`.

### Grenzen

- Kein Scan beim Aktivieren – Einlesen nur per Befehl/Button (kein „Brick“ / ≤15 s).
- Kein SM-2 mit Qualitätsstufen 0–5; nur zwei Noten.
- Kein mehrdeckiges UI in v1 (ein aktives Deck).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Panel-Icon ist ein Emoji; Store-Icon ist `icon.svg` (`currentColor`).

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Vocab Cards:** Panel (`id=cards`) with key-value **Due / New / Total**, buttons *Start review* and *Rebuild*.
- **Build cards from note:** Parses the **active** Markdown note (optional same folder, max 200 notes).
- **Review vocab:** Queue of due cards: front → *Reveal* → *Easy* / *Hard*.
- Progress is kept on rebuild when front and back text still match.

### Parser v1

**A) Markdown table** – first two columns = front / back. Header row skipped if it contains `begriff`, `term`, `front`, `vokabel`, or `wort`.

```markdown
| Term | Translation |
| --- | --- |
| apple | Apfel |
| to learn | lernen |
```

**B) Line pairs** – regex `/^(.*?\S)\s*[—–\-:]\s+(.+\S)\s*$/u` (em/en dash, hyphen, or colon):

```markdown
apple — Apfel
to learn: lernen
Haus – house
```

- Text inside ` ``` ` fences is ignored.
- Max **500** cards per deck; optional folder scan max **200** notes (most recently modified first).
- `.md` / `.markdown` only.

### SRS v1 (Easy / Hard)

| Grade | Effect |
| --- | --- |
| **Easy** | First time → due in **1 day**; then interval **×2** (max 365 days). `reps++`. |
| **Hard** | Interval = 0; due again in **10 minutes**. |

New cards start with `dueAt: 0` (due immediately) and `reps: 0`.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Vocab Cards*
   - *Build cards from note*
   - *Review vocab*
2. In the panel optionally enable **Include same folder**, then **Rebuild**.
3. Review: read the front → **Reveal** → **Easy** or **Hard**.

### Storage

Key `data` — see German section for the JSON shape (`deck` + `settings`).

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, toasts |
| `notes:read` | Read active note / folder |
| `storage` | Deck and settings |

**No** `notes:write`, **no** `network`.

### Limits

- No vault scan on activate — build only via command/button (no brick / ≤15 s rule).
- No full SM-2 quality grades 0–5; two grades only.
- No multi-deck UI in v1 (one active deck).
- Command titles follow UI language at start; reload after a language switch.
- Panel icon is an emoji; store icon is `icon.svg` (`currentColor`).

### Version

1.0.0 – initial release.

---

