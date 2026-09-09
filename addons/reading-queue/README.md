# Lesewarteschlange / Reading Queue

Persönliche Lesewarteschlange für Notizen (Standard max. 80): aktive Notiz merken, ungelesen/gelesen, optionale Fälligkeit, nächste öffnen. Öffnen markiert **nicht** automatisch als gelesen.

Personal reading queue for notes (default max 80): save the active note, unread/read, optional due date, open next. Opening does **not** auto-mark as read.

---

## Deutsch

### Was es tut

- **Lesewarteschlange öffnen:** Panel `queue` mit Ungelesen/Gelesen, Aktive Notiz, Nächste, Pfade prüfen.
- **Aktive Notiz hinzufügen:** Speichert Pfad + Titel als `unread`. Gleicher Pfad bereits ungelesen → Info-Toast (kein Duplikat).
- **Nächste öffnen:** Sortiert Ungelesen nach Fälligkeit (aufsteigend, ohne Datum zuletzt), dann `addedAt` aufsteigend → `notes.open`.
- **Aktive Notiz als gelesen:** Markiert die aktive Notiz in der Warteschlange als `read` (nur wenn sie dort ist).
- **Statusleiste:** Optional `Ungelesen: N` (nur wenn Ungelesen > 0; Klick öffnet das Panel).
- **Kein Vault-Scan** beim Aktivieren – Status kommt nur aus dem Speicher. Fehlende Pfade setzt **Pfade prüfen** (`notes.exists`).

### Bedienung

1. Befehlspalette (`Ctrl K`) → unter dem Add-on-Namen:
   - *Lesewarteschlange öffnen*
   - *Aktive Notiz zur Lesewarteschlange*
   - *Nächste ungelesene öffnen*
   - *Aktive Notiz als gelesen*
2. Im Panel:
   - **Aktive Notiz** / **Nächste** / **Pfade prüfen**
   - Zeile anklicken → Notiz öffnen (ohne Auto-Erledigt)
   - **Erledigt** → Auswahl als gelesen
   - **Fällig** → Prompt `YYYY-MM-DD` (leer = entfernen)
   - **Hoch** / **Runter** → nur in Ungelesen, innerhalb derselben Fälligkeits-Gruppe
   - **Entfernen** → mit Bestätigung
3. Optional: Statusleisten-Eintrag `Ungelesen: N`.

### Speicher

Schlüssel `data`:

```json
{
  "items": [
    {
      "id": "q-…-abcd",
      "path": "Fach/Thema.md",
      "title": "Thema",
      "status": "unread",
      "addedAt": "2026-09-08T19:00:00.000Z",
      "due": null
    }
  ],
  "settings": { "showStatus": true, "maxItems": 80 }
}
```

- IDs: `q-` + `Date.now()` + `-` + 4 Zufallszeichen.
- `due`: `null` oder `YYYY-MM-DD`.
- `missing` optional: nur `true` wenn Pfad fehlt (sonst weggelassen); gesetzt durch **Pfade prüfen** oder beim Öffnen wenn `notes.exists` false.
- Jede Mutation wird sofort persistiert; bei Speicherfehler Rollback der Änderung.

### Berechtigungen

| Berechtigung | Warum |
| --- | --- |
| `commands` | Einträge in der Befehlspalette |
| `ui` | Panel, Prompts, Bestätigungen, Toasts, Statusleiste, `notes.open` |
| `notes:read` | Aktive Notiz lesen, `notes.exists` für fehlende Pfade |
| `storage` | Warteschlange und Einstellungen speichern |

**Kein** `notes:write`, **kein** `network`, **kein** `vault:write`.

### Grenzen

- Öffnen markiert **nicht** als gelesen – bewusst manuell (**Erledigt** / Befehl *Aktive Notiz als gelesen*).
- Hoch/Runter nur in Ungelesen und nur bei gleicher Fälligkeit (Sortierung bleibt „due, dann addedAt“).
- Fehlende Pfade: Badge „fehlt“ + Fehler-Toast; kein automatischer Full-Vault-Scan.
- Statusleiste abschaltbar; max. 3 Status-Einträge pro Add-on (FaNotes-Limit).
- Befehlstitel folgen der UI-Sprache beim Start; nach Sprachwechsel Add-on neu laden.
- Toasts nur `info` | `success` | `error`.

### Version

1.0.0 – erste Veröffentlichung.

### SDK

Siehe FaNotes-Add-on-SDK / Docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `notes.active` / `notes.open` / `notes.exists`).

---

## English

### What it does

- **Open reading queue:** Panel `queue` with Unread/Read, Active note, Next, Rescan paths.
- **Add active note:** Stores path + title as `unread`. Same path already unread → info toast (no duplicate).
- **Open next:** Sorts unread by due ascending (nulls last), then `addedAt` ascending → `notes.open`.
- **Mark active as read:** Marks the active note in the queue as `read` (only if it is queued).
- **Status bar:** Optional `Unread: N` (only when unread > 0; click opens the panel).
- **No vault scan** on activate – status comes from storage only. Missing paths are set by **Rescan paths** (`notes.exists`).

### Usage

1. Command palette (`Ctrl K`) → under the add-on name:
   - *Open reading queue*
   - *Add active note to reading queue*
   - *Open next unread*
   - *Mark active note as read*
2. In the panel:
   - **Active note** / **Next** / **Rescan paths**
   - Click a row → open note (no auto-done)
   - **Done** → mark selection as read
   - **Due** → prompt `YYYY-MM-DD` (empty = clear)
   - **Up** / **Down** → unread only, within the same due bucket
   - **Remove** → with confirmation
3. Optionally use the status-bar item `Unread: N`.

### Storage

Key `data`:

```json
{
  "items": [
    {
      "id": "q-…-abcd",
      "path": "Subject/Topic.md",
      "title": "Topic",
      "status": "unread",
      "addedAt": "2026-09-08T19:00:00.000Z",
      "due": null
    }
  ],
  "settings": { "showStatus": true, "maxItems": 80 }
}
```

- IDs: `q-` + `Date.now()` + `-` + 4 random chars.
- `due`: `null` or `YYYY-MM-DD`.
- `missing` optional: only `true` when the path is missing (otherwise omitted); set by **Rescan paths** or when opening if `notes.exists` is false.
- Every mutation is persisted immediately; on save failure the change is rolled back.

### Permissions

| Permission | Why |
| --- | --- |
| `commands` | Command palette entries |
| `ui` | Panel, prompts, confirms, toasts, status bar, `notes.open` |
| `notes:read` | Read active note, `notes.exists` for missing paths |
| `storage` | Persist queue and settings |

**No** `notes:write`, **no** `network`, **no** `vault:write`.

### Limits

- Opening does **not** mark as read – intentional manual step (**Done** / *Mark active note as read*).
- Up/Down only within Unread and only for the same due bucket (sort stays “due, then addedAt”).
- Missing paths: “missing” badge + error toast; no automatic full-vault scan.
- Status bar can be disabled; FaNotes allows at most 3 status items per add-on.
- Command titles follow the UI language at start; reload the add-on after a language switch.
- Toasts only use `info` | `success` | `error`.

### Version

1.0.0 – initial release.

### SDK

See FaNotes add-on SDK / docs: `manifest.json`, `UI_BLOCKS.md`, `PERMISSIONS.md`, `API.md` (`fanotes.ui.panel`, `storage`, `notes.active` / `notes.open` / `notes.exists`).

---

## Lizenz / License

MIT
