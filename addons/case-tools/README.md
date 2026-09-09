# Groß-/Kleinschreibung / Case Tools

Wandelt die **Auswahl** in Groß-, Klein- oder Titelschreibweise um (optional Umschalten).

Converts the **selection** to upper, lower or title case (optional toggle).

---

## Deutsch

### Was es tut

- **Groß-/Kleinschreibung öffnen:** Panel mit GROSS, klein, Titel, Umschalten und Locale-Einstellung.
- **GROSS:** `toLocaleUpperCase` auf der markierten Auswahl.
- **klein:** `toLocaleLowerCase` auf der markierten Auswahl.
- **Titel:** Soft-Split an Nicht-Buchstaben/Ziffern; erster Buchstabe jedes Worts groß, Rest klein.
- **Umschalten:** Wenn die Auswahl bereits komplett groß ist → klein, sonst → groß.

### Bedienung

1. Im Markdown-Editor Text markieren.
2. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Groß-/Kleinschreibung öffnen*
   - *Auswahl in GROSSBUCHSTABEN* / *Auswahl in kleinbuchstaben*
   - *Auswahl in Titelschreibweise* / *Groß-/Kleinschreibung umschalten*
3. Oder im Panel die entsprechenden Buttons nutzen.

Ohne Auswahl (leer) → Info-Toast „Braucht Auswahl“. Ohne Markdown-Editor → Fehler-Toast.

### Speicher

Schlüssel `settings`:

```json
{
  "titleLocale": "auto"
}
```

- `titleLocale`: `auto` (folgt `fanotes.app.language`: de→`de`, en→`en`, sonst Runtime-Default), oder fest `de` / `en`.

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
| **line-tools** | Zeilen sortieren/deduplizieren/umdrehen – hier Zeichen-Case der Selection |
| **wikilink-wrap** | Selection als `[[Wikilink]]` umhüllen – hier nur Groß-/Kleinschreibung |
| **timestamp-inserter** | Datums-/Zeitstempel einfügen – hier Umwandlung bestehender Auswahl |

### Grenzen

- Nur auf der aktuellen Editor-Auswahl; keine ganze Datei ohne Selection.
- Nur im offenen Markdown-Editor; Stiftmodus/PDF → Fehler-Toast.
- Kein Netzwerk, kein Vault – Einstellungen leben nur im Add-on-Speicher.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.

### Version

1.0.0 – erste Veröffentlichung.

---

## English

### What it does

- **Open Case Tools:** Panel with UPPER, lower, Title, Toggle, plus a locale setting.
- **UPPER:** `toLocaleUpperCase` on the selected text.
- **lower:** `toLocaleLowerCase` on the selected text.
- **Title:** Soft-split on non-letter/digit runs; capitalize the first letter of each word, lower the rest.
- **Toggle:** If the selection is already all upper → lower, otherwise → upper.

### Usage

1. Select text in the Markdown editor.
2. Command palette (`Ctrl K`) → under the add-on name:
   - *Open Case Tools*
   - *Selection to UPPER CASE* / *Selection to lower case*
   - *Selection to Title Case* / *Toggle letter case*
3. Or use the panel buttons.

No selection (empty) → info toast "Needs a selection". No Markdown editor → error toast.

### Storage

Key `settings`:

```json
{
  "titleLocale": "auto"
}
```

- `titleLocale`: `auto` (follows `fanotes.app.language`: de→`de`, en→`en`, otherwise runtime default), or fixed `de` / `en`.

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
| **line-tools** | Sort/dedupe/reverse lines — here character case of the selection |
| **wikilink-wrap** | Wrap selection as `[[wikilink]]` — here letter-case transform only |
| **timestamp-inserter** | Insert date/time stamps — here transform of existing selection |

### Limits

- Selection only; never rewrites the whole file without a selection.
- Markdown editor only; pen mode/PDF → error toast.
- No network, no vault — settings live in add-on storage only.
- Command titles follow UI language at start; reload the add-on after a language switch.

### Version

1.0.0 – initial release.
