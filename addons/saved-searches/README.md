# Gespeicherte Suchen / Saved Searches

Speichert Vault-Suchanfragen und führt die FaNotes-Volltextsuche erneut aus (max. Treffer einstellbar). Save vault search queries and re-run FaNotes full-text search (configurable max hits).

---

## Deutsch

### Was es tut

- **Gespeicherte Suchen öffnen:** Panel `searches` mit Liste der gespeicherten Suchen, Trefferliste und Max.-Treffer-Einstellung.
- **Letzte Suche ausführen:** Startet die Suche mit `settings.lastId` erneut.
- **Suche speichern…:** Prompt für Titel + Suchanfrage → speichern und sofort ausführen.
- **Treffer:** Titel + Excerpt; Klick öffnet die Notiz (`notes.open`).
- **Kein Search beim Aktivieren** – nur Speicher laden.

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Gespeicherte Suchen öffnen*
   - *Letzte Suche ausführen*
   - *Suche speichern…*
2. Im Panel:
   - Zeile in der Suchliste → Suche ausführen
   - **Neu** → Titel + Query, speichern und ausführen
   - **Umbenennen** / **Löschen** (mit Bestätigung) / **Ausführen** (primär)
   - **Max. Treffer** (Select, 1–200, Standard 50) – Persistenz mit Rollback bei Fehler
   - Trefferliste → Notiz öffnen

### Speicher

Schlüssel `data`:

```json
{
  "searches": [
    {
      "id": "s-…-abcd",
      "title": "Mathe Klausur",
      "query": "Ableitung",
      "createdAt": "2026-09-09T08:00:00.000Z"
    }
  ],
  "settings": { "lastId": "s-…-abcd", "maxHits": 50 }
}
```

- Max. **30** gespeicherte Suchen.
- IDs: `s-` + `Date.now()` + `-` + 4 Zufallszeichen.
- `maxHits` wird auf 1–200 begrenzt (Standard 50).
- Jede Mutation wird sofort persistiert; bei Speicherfehler Rollback der Änderung.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Prompts, Bestätigungen, Toasts, `notes.open` |
| `notes:read` | `notes.search` (Volltext wie Strg⇧F) |
| `storage` | Suchen und Einstellungen speichern |

**Kein** `notes:write`, **kein** `network`, **kein** `vault:write`.

### Grenzen

- Suche = FaNotes-Volltext (`notes.search`); die API kann Treffer auf ca. **200** begrenzen. `maxHits` schneidet die Ergebnisliste zusätzlich.
- Beim Aktivieren wird **nicht** gesucht.
- Nur Toasts `info` | `success` | `error`.
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Kein Statusleisten-Eintrag.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `notes.search` / `notes.open`).

---

## English

### What it does

- **Open saved searches:** Panel `searches` with saved-query list, hits list, and max-hits setting.
- **Run last search:** Re-runs the search stored in `settings.lastId`.
- **Save search…:** Prompt for title + query → save and run immediately.
- **Hits:** Title + excerpt; click opens the note (`notes.open`).
- **No search on activate** – storage load only.

### How to use

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open saved searches*
   - *Run last search*
   - *Save search…*
2. In the panel:
   - Click a saved row → run that search
   - **New** → title + query, save and run
   - **Rename** / **Delete** (with confirm) / **Run** (primary)
   - **Max hits** (select, 1–200, default 50) – persisted with rollback on failure
   - Hits list → open note

### Storage

Key `data`:

```json
{
  "searches": [
    {
      "id": "s-…-abcd",
      "title": "Math exam",
      "query": "derivative",
      "createdAt": "2026-09-09T08:00:00.000Z"
    }
  ],
  "settings": { "lastId": "s-…-abcd", "maxHits": 50 }
}
```

- Max **30** saved searches.
- IDs: `s-` + `Date.now()` + `-` + 4 random chars.
- `maxHits` clamped to 1–200 (default 50).
- Every mutation is persisted immediately; on storage failure the change is rolled back.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, prompts, confirms, toasts, `notes.open` |
| `notes:read` | `notes.search` (full-text like Ctrl⇧F) |
| `storage` | Persist searches and settings |

**No** `notes:write`, **no** `network`, **no** `vault:write`.

### Limits

- Search = FaNotes full-text (`notes.search`); the API may cap hits around **~200**. `maxHits` additionally slices the result list.
- **No** search on activate.
- Toasts only `info` | `success` | `error`.
- Command titles follow UI language at start; reload the add-on after a language switch.
- No status-bar entry.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `notes.search` / `notes.open`).
