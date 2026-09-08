# Veröffentlichen, Versionen, Updates

## Der Weg in den Store

```
Fork → Ordner addons/<id>/ → Pull Request → CI grün → Review → Merge → Auto-Index → im Store
```

1. **Fork** dieses Repository auf GitHub und klone deinen Fork.
2. **Ordner anlegen:** `node scripts/new-addon.mjs <id> "<Name>" "<Autor>"` oder von Hand nach [MANIFEST.md](MANIFEST.md).
3. **Entwickeln und lokal testen** in FaNotes (Add-on-Store → Entwickeln → Lokal laden). Siehe [GETTING_STARTED.md](GETTING_STARTED.md).
4. **Prüfen:** `node scripts/validate.mjs <id>` – dieselbe Prüfung wie in der CI.
5. **Committen und pushen**, dann einen **Pull Request gegen `main`** öffnen. Die Vorlage fragt nach Ordner, Kurzbeschreibung, Berechtigungen.
6. **CI** (`Validate add-ons`) läuft automatisch. Rot = im Log steht, was fehlt.
7. **Review:** Ein Maintainer liest README, Manifest und Code. Erwarte Rückfragen bei `notes:write`, `vault:write`, `network` und bei Code, der schwer zu lesen ist (minifiziert ohne Quelle im Ordner).
8. **Merge.** Der Workflow `Auto-index` baut `index.json` neu und committet es. Ab dann lädt jeder FaNotes-Client beim Öffnen des Stores die neue Liste.

Kein FaNotes-Release, kein Warten auf eine App-Version. Bis der Index-Workflow durch ist (Minuten), listet FaNotes `addons/` zur Not direkt über die GitHub-API.

## Was die CI prüft

`scripts/validate.mjs` – lokal identisch ausführbar:

| Prüfung | Ergebnis bei Verstoß |
| --- | --- |
| `manifest.json` vorhanden, gültiges JSON, Schema ([MANIFEST.md](MANIFEST.md)) | Fehler |
| `id` = Ordnername | Fehler |
| `main.js` vorhanden, nicht leer, ≤ 1,5 MB | Fehler |
| `main.js` ist syntaktisch ein ES-Modul (`node --check --input-type=module`) | Fehler |
| Kein `importScripts(`, kein statisches `import …`, kein `new Worker(`, kein `eval(`/`new Function(`, kein `XMLHttpRequest`/`WebSocket`/`EventSource` | Fehler |
| `README.md` ≤ 200 kB, `icon.svg` ≤ 64 kB, SVG ohne Skripte | Fehler |
| Keine Binärdateien im Ordner | Fehler |
| Version nicht niedriger als die veröffentlichte | Fehler |
| `main.js` geändert, aber Version gleich | Fehler |
| Doppelte IDs | Fehler |
| `README.md` fehlt, `icon.svg` ohne Manifest-Eintrag, unbekannte Dateien/Ordner, unbekannte Kategorien | Hinweis (blockiert nicht) |

Zusätzlich warnt der Workflow bei Änderungen außerhalb von `addons/` (Skripte, Workflows) – die werden von Maintainern gesondert geprüft. `index.json` von Hand zu ändern ist zwecklos; der Auto-Index überschreibt es.

## Updates veröffentlichen

1. Code ändern.
2. **`version` erhöhen** – Pflicht bei jeder Änderung an `main.js`. Ohne Bump sehen Nutzer kein Update, und die CI lehnt den PR ab.
3. Änderungen im README oder `CHANGELOG.md` notieren.
4. Pull Request wie oben. In der Vorlage „Update von vX auf vY“ angeben.

Nach dem Merge:

- Nutzer mit **Auto-Update** (Standard) bekommen die neue Version beim nächsten FaNotes-Start still installiert; laufende Instanzen werden sauber deaktiviert (`onDeactivate`) und neu gestartet. Der Speicher (`fanotes.storage`) bleibt erhalten.
- Nutzer ohne Auto-Update sehen im Store unter **Installiert** einen Update-Hinweis und einen Knopf „Alle aktualisieren“.

**Speicherformat ändern?** Lies alte Daten tolerant und migriere sie beim ersten Start der neuen Version. Ein Versionsfeld im gespeicherten Objekt hilft:

```js
const data = (await fanotes.storage.get('state')) ?? { v: 0 }
if (data.v < 2) { /* migrieren */ data.v = 2; await fanotes.storage.set('state', data) }
```

## Kompatibilität mit FaNotes-Versionen

- `api` bleibt `1`, solange die Schnittstelle rückwärtskompatibel erweitert wird. Neue Methoden und Ereignisse kommen ohne Versionswechsel dazu; bestehende ändern ihr Verhalten nicht.
- Braucht dein Add-on eine Methode, die es erst ab einer bestimmten FaNotes-Version gibt, setze `minAppVersion` (Kalenderversion, z. B. `2026.10.3`). Ältere Clients zeigen das Add-on als inkompatibel, statt es mit Fehlern zu starten.
- Prüfe zur Laufzeit defensiv: `typeof fanotes.notes.foo === 'function'`.

## Ein Add-on zurückziehen

Lösche den Ordner per Pull Request. Nach dem Merge verschwindet das Add-on aus dem Store. Bereits installierte Kopien laufen weiter, bekommen aber keine Updates. Für einen dringenden Rückzug (Sicherheitsproblem) öffne ein Issue mit „security“ im Titel; Maintainer können auch ohne PR entfernen.

## Eigene Add-on-Quelle

FaNotes kann auf ein anderes Repository zeigen (Einstellungen → Add-ons → Quelle): `owner/repo`, `owner/repo#branch` oder eine `https://`-URL zu einem `index.json`. Das ist für Teams, Schulen oder Tests gedacht – dieselbe Struktur, derselbe Index-Workflow. FaNotes lädt dabei weiterhin nur von GitHub-Hosts.

## Wie `index.json` aussieht

Wird von `scripts/build-index.mjs` erzeugt:

```json
{
  "schema": 1,
  "repository": "Nikoheld/FaNotes-Addons",
  "branch": "main",
  "generatedAt": "2026-09-08T17:00:00.000Z",
  "count": 4,
  "addons": [
    {
      "id": "hello-world",
      "name": "Hallo Welt",
      "version": "1.0.0",
      "description": "…",
      "author": { "name": "FaNotes" },
      "license": "MIT",
      "api": 1,
      "permissions": ["commands", "ui", "notes:read"],
      "networkHosts": [],
      "categories": ["developer"],
      "keywords": ["beispiel"],
      "path": "addons/hello-world",
      "files": {
        "main.js": { "size": 2318, "sha256": "…" },
        "README.md": { "size": 900, "sha256": "…" }
      },
      "updatedAt": "2026-09-08T16:40:12+02:00"
    }
  ]
}
```

Add-ons mit Fehlern werden beim Bauen übersprungen und im Workflow-Log gemeldet – ein defekter Ordner blendet nie die anderen aus. `generatedAt` ändert sich nur, wenn sich inhaltlich etwas geändert hat, damit der Bot keine leeren Commits erzeugt.
