# Notizzettel / Scratchpad

Parkt Entwurftext außerhalb des Vaults (max. 100 000 Zeichen): speichern, in die Notiz einfügen, in die Zwischenablage kopieren oder Editor-Auswahl anhängen.

Parks draft text outside the vault (max 100,000 characters): save, insert into the note, copy to clipboard, or append the editor selection.

---

## Deutsch

### Was es tut

- **Notizzettel öffnen:** Panel `scratch` mit mehrzeiligem Textfeld, Speichern / Einfügen / Kopieren / Leeren / Auswahl anhängen und Zeitstempel.
- **Einfügen:** Gespeicherten Text per `editor.insert` am Cursor.
- **Kopieren:** Text in die Zwischenablage schreiben.
- **Leeren:** Nach Bestätigung `text = ''`.
- **Auswahl anhängen:** Markierten Editor-Text mit `\n\n` anhängen (leere Auswahl → Toast).

Der Text liegt nur im Add-on-Speicher – **nicht** als Vault-Datei, bis du ihn einfügst.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Notizzettel öffnen*
   - *Notizzettel einfügen*
   - *Notizzettel kopieren*
   - *Notizzettel leeren*
   - *Auswahl an Notizzettel anhängen*
2. Im Panel:
   - Tippen → Speichern mit **300 ms Debounce** (über Cap → Fehler-Toast, Speichern **abgelehnt**, kein stilles Kürzen)
   - **Speichern** (einzige Primäraktion) → explizit persistieren
   - **Einfügen** / **Kopieren** / **Leeren**
   - **Auswahl anhängen** (wie der Befehl *Auswahl an Notizzettel anhängen*)

### Speicher

Schlüssel `data`:

```json
{
  "text": "",
  "updatedAt": "2026-09-08T19:54:00.000Z"
}
```

- `updatedAt` ist ISO-8601 oder `null` (noch nie gespeichert).
- Maximal **100 000** Zeichen. Speichern bei Überschreitung wird abgelehnt (kein Truncate beim Tippen).
- Persistenz mit **Rollback** bei Fehlschlag.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Bestätigungen, Toasts |
| `editor` | Einfügen und Auswahl lesen |
| `storage` | Entwurf persistieren |
| `clipboard` | Text in die Zwischenablage schreiben |

**Kein** `network`, **kein** `notes:read` / `notes:write`, **kein** `vault:write`.

### Grenzen

- Nur Markdown-Editor für Einfügen/Auswahl; Stiftmodus/PDF → Toast „Kein Markdown-Editor“ bzw. leere Auswahl.
- Zwischenablage nur schreiben (FaNotes erlaubt kein Lesen).
- Panel-`input`-Werte können hostseitig auf ca. **20 000** Zeichen begrenzt sein (`UI_BLOCKS`); längere Entwürfe entstehen vor allem über „Auswahl anhängen“ bis zur Speichergrenze 100 000.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `clipboard`, `editor`).

---

## English

### What it does

- **Open scratchpad:** Panel `scratch` with multiline field, Save / Insert / Copy / Clear / Append selection and timestamp.
- **Insert:** Saved text via `editor.insert` at the cursor.
- **Copy:** Write text to the clipboard.
- **Clear:** After confirmation set `text = ''`.
- **Append selection:** Append selected editor text with `\n\n` (empty selection → toast).

Text lives only in add-on storage – **not** as a vault file until you insert it.

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open scratchpad*
   - *Insert scratchpad*
   - *Copy scratchpad*
   - *Clear scratchpad*
   - *Append selection to scratchpad*
2. In the panel:
   - Typing → save with **300 ms debounce** (over cap → error toast, save **rejected**, no silent truncation)
   - **Save** (the only primary action) → persist explicitly
   - **Insert** / **Copy** / **Clear**
   - **Append selection** (same as the *Append selection to scratchpad* command)

### Storage

Key `data`:

```json
{
  "text": "",
  "updatedAt": "2026-09-08T19:54:00.000Z"
}
```

- `updatedAt` is ISO-8601 or `null` (never saved).
- Maximum **100,000** characters. Saves over the cap are rejected (no truncate-on-type).
- Persist with **rollback** on failure.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, confirms, toasts |
| `editor` | Insert and read selection |
| `storage` | Persist the draft |
| `clipboard` | Write text to the clipboard |

**No** `network`, **no** `notes:read` / `notes:write`, **no** `vault:write`.

### Limits

- Markdown editor only for insert/selection; pen mode/PDF → “No Markdown editor” toast or empty selection.
- Clipboard write-only (FaNotes does not allow reading).
- Panel `input` values may be capped around **20,000** characters by the host (`UI_BLOCKS`); longer drafts mainly come from “Append selection” up to the 100,000 storage cap.
- Command titles follow UI language at load; reload the add-on after a language switch.
- Toasts only `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `clipboard`, `editor`).
