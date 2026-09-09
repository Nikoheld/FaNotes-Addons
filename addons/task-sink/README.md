# Erledigte nach unten / Task Sink

Verschiebt **erledigte Aufgaben-Checkboxen** in der **aktiven Notiz** nach unten.

Moves **completed task checkboxes** to the **bottom of the active note**.

> **Abgrenzung:** `checkbox-progress` = Anzeige; `list-convert` = Prefix; `task-collector` = Vault; `habit-checklist` = Datums-Habits. **Hier** = Reorder erledigter Tasks in der aktiven Notiz.
>
> **Distinction:** `checkbox-progress` = display; `list-convert` = prefix; `task-collector` = vault; `habit-checklist` = dated habits. **This** = reorder completed tasks in the active note.

---

## Deutsch

### Was es tut

- **Erledigte nach unten Soft:** Liest die aktive Notiz (Editor Soft bevorzugt, sonst Notes Soft). Soft-Partition:
  1. Nicht-Task-Zeilen behalten relative Reihenfolge im **Kopf-Block** (`head`).
  2. Offene Tasks (`[ ]`) behalten ihre Reihenfolge.
  3. Erledigte Tasks (`[x]` / `[X]`) behalten ihre Reihenfolge und wandern ans **Ende**.
- **groupBlank Soft:** Eine Leerzeile vor dem Erledigt-Block, wenn Kopf/Open nicht leer Soft (Default Soft: an).
- **openEditorOnly Soft:** Wenn `true`, nur `editor.getText` / `editor.setText` — sonst Toast Soft (Default Soft: `false`, erlaubt Notes-Pfad Soft).
- **Panel** (`sink`): Checkbox `groupBlank`; Button **Erledigte nach unten** (primär); muted: nur Task-Zeilen; andere Zeilen bleiben oben-Block.
- **Activate:** nur Einstellungen laden — kein Vault-Scan, nie `notes.list`.

### Soft Task-Zeile

```
/^(\s*)[-*+]\s+\[(x|X| )\]\s+(.*)$/
```

Schreiben Soft: `editor.setText`, falls Editor-Text verfügbar Soft; sonst `notes.write(active)`.

### Bedienung

1. Markdown-Notiz öffnen.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Erledigte nach unten*
   - *Task Sink öffnen* → Panel
3. Im Panel optional Leerzeile vor Erledigt-Block setzen → **Erledigte nach unten**.

Keine offene Notiz → Fehler-Toast. Keine erledigten Tasks → Info-Toast. Bereits unten → Info-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "groupBlank": true,
  "openEditorOnly": false
}
```

- `groupBlank`: Leerzeile vor Erledigt-Block Soft (Default Soft: `true`).
- `openEditorOnly`: nur Editor-Pfad Soft; Notes-Fallback aus Soft (Default Soft: `false`).

`onActivate` lädt nur den Speicher – kein Vault-Scan.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel und Toasts |
| `editor` | Text lesen/schreiben (`getText` / `setText`) |
| `notes:read` | Fallback: aktive Notiz lesen, wenn kein Editor-Text Soft |
| `notes:write` | Fallback: schreiben, wenn `editor.setText` nicht verfügbar Soft |
| `storage` | Einstellungen |

**Kein** `vault:write`, **kein** `network`, **kein** `clipboard`. Nur aktive Notiz — kein Vault-Scan.

### Abgrenzung

| Add-on | Unterschied |
| --- | --- |
| **checkbox-progress** | Fortschritts-*Anzeige* Soft — hier Reorder |
| **list-convert** | Listen-*Prefix*-Umwandlung Soft — hier keine Prefix-Änderung |
| **task-collector** | Vault-weit Soft — hier nur aktive Notiz |
| **habit-checklist** | Datums-Habits Soft — hier allgemeine Task-Checkboxen reorder |
| **task-sink** (dieses) | Erledigte Tasks ans Ende der aktiven Notiz verschieben |

### Grenzen

- Nur die aktive Notiz; kein Vault-Scan.
- Soft: drei Blöcke Soft (`head` / open / done) — Abschnitts-Überschriften wandern mit dem Kopf-Block Soft.
- Soft Task-Regex Soft (siehe oben); andere Listenformate Soft bleiben „other“.
- Toasts nur `info` | `success` | `error`.
- Genau eine Primäraktion im Panel: *Erledigte nach unten*.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### Scope vs related add-ons

| Add-on | Role |
| --- | --- |
| **checkbox-progress** | Progress *display* Soft — here reorder |
| **list-convert** | List *prefix* conversion Soft — here no prefix change |
| **task-collector** | Vault-wide Soft — here active note only |
| **habit-checklist** | Dated habits Soft — here general task checkbox reorder |
| **task-sink** (this) | Move completed tasks to the end of the active note |

### What it does

- **Sink Soft:** Reads the active note (prefer editor Soft, else notes Soft). Soft partition:
  1. Non-task lines keep relative order in the **head** block.
  2. Open tasks (`[ ]`) keep their order.
  3. Done tasks (`[x]` / `[X]`) keep their order and move to the **end**.
- **groupBlank Soft:** One blank line before the done block when head/open is non-empty Soft (Soft default: on).
- **openEditorOnly Soft:** When `true`, require `editor.getText` / `editor.setText` — else toast Soft (Soft default: `false`, allows notes path Soft).
- **Panel** (`sink`): `groupBlank` checkbox; **Sink completed** button (primary); muted: task lines only; other lines stay in the top block.
- **Activate:** load settings only — no vault scan, never `notes.list`.

### Soft task line

```
/^(\s*)[-*+]\s+\[(x|X| )\]\s+(.*)$/
```

Write Soft: `editor.setText` when editor text is available Soft; else `notes.write(active)`.

### Usage

1. Open a Markdown note.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Sink completed tasks*
   - *Open Task Sink* → panel
3. In the panel optionally set blank-before-done → **Sink completed**.

No open note → error toast. No completed tasks → info toast. Already at bottom → info toast.

### Storage

Key `settings`:

```json
{
  "groupBlank": true,
  "openEditorOnly": false
}
```

- `groupBlank`: blank line before done block Soft (Soft default: `true`).
- `openEditorOnly`: editor path only Soft; notes fallback off Soft (Soft default: `false`).

`onActivate` only loads settings — no vault scan.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel and toasts |
| `editor` | Read/write text (`getText` / `setText`) |
| `notes:read` | Fallback: read active note when no editor text Soft |
| `notes:write` | Fallback: write when `editor.setText` unavailable Soft |
| `storage` | Settings |

**No** `vault:write`, **no** `network`, **no** `clipboard`. Active note only — no vault scan.

### Limits

- Active note only; no vault scan.
- Soft: three blocks Soft (`head` / open / done) — section headings stay with the head block Soft.
- Soft task regex Soft (see above); other list forms Soft stay "other".
- Toasts only `info` | `success` | `error`.
- Exactly one primary panel action: *Sink completed*.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
