# manifest.json

Das Manifest beschreibt dein Add-on für den Store und legt fest, was es darf. FaNotes und die CI prüfen es mit exakt derselben Logik (`scripts/lib/manifest.mjs` ist die Kopie von `src/lib/addons/manifest.ts` in FaNotes). Ungültige Manifeste erscheinen nicht im Store.

## Vollständiges Beispiel

```json
{
  "id": "wort-zaehler",
  "name": "Wortzähler",
  "version": "1.2.0",
  "description": "Zählt Wörter und Zeichen der markierten Stelle oder der ganzen Notiz.",
  "author": { "name": "Fabio", "url": "https://github.com/fabio" },
  "license": "MIT",
  "homepage": "https://github.com/fabio/wort-zaehler",
  "api": 1,
  "minAppVersion": "2026.9.21",
  "permissions": ["commands", "ui", "editor", "storage"],
  "networkHosts": [],
  "categories": ["writing", "statistics"],
  "keywords": ["wörter", "zeichen", "zählen", "statistik"],
  "icon": "icon.svg"
}
```

## Felder

| Feld | Pflicht | Typ | Regeln |
| --- | --- | --- | --- |
| `id` | ja | string | 2–64 Zeichen, nur `a-z`, `0-9`, `-`; beginnt und endet mit Buchstabe/Ziffer. **Muss dem Ordnernamen entsprechen.** Später nicht änderbar – daran hängen Installationen, Speicher und Updates. |
| `name` | ja | string | Anzeigename, max. 60 Zeichen. |
| `version` | ja | string | `1`, `1.2` oder `1.2.3`, optional `-beta.1`-Suffix. Numerischer Vergleich pro Stelle; `1.10.0` > `1.9.0`. Pre-Release (`-…`) liegt vor der gleichen Version ohne Suffix. |
| `description` | ja | string | Kurzbeschreibung für die Store-Kachel, max. 280 Zeichen. Sag, was das Add-on tut, nicht wie toll es ist. |
| `author` | ja | string oder `{ name, url? }` | `name` max. 80 Zeichen. `url` muss mit `https://` beginnen (sonst ignoriert). |
| `license` | nein | string | SPDX-Kürzel wie `MIT`, `Apache-2.0`, `GPL-3.0-only`. Empfohlen. |
| `homepage` | nein | string | `https://`-Link, wird im Store verlinkt. |
| `api` | nein | integer | API-Version, aktuell `1` (Standard). Andere Werte lehnt FaNotes ab. |
| `minAppVersion` | nein | string | Kalenderversion `JJJJ.M.N` der ältesten FaNotes-Version, mit der das Add-on läuft. Ältere FaNotes-Versionen zeigen „inkompatibel“ statt es zu starten. |
| `permissions` | nein | string[] | Liste aus [PERMISSIONS.md](PERMISSIONS.md). Unbekannte Einträge sind ein Fehler. Leer = das Add-on kann nur `app`, `log` und Ereignisse ohne Berechtigung nutzen. |
| `networkHosts` | bei `network` | string[] | Hosts, die `fanotes.net.fetch` erreichen darf: `api.example.com` oder `*.example.com` (nur eine Wildcard-Ebene, ganz links). Max. 16. Pflicht, wenn `network` in `permissions` steht; ohne `network` nur eine Warnung. |
| `categories` | nein | string[] | Bis zu 4 aus: `productivity`, `writing`, `handwriting`, `school`, `statistics`, `export`, `integration`, `appearance`, `fun`, `developer`. Unbekannte werden ignoriert (Warnung). |
| `keywords` | nein | string[] | Bis zu 12 Suchwörter à 32 Zeichen für die Store-Suche. |
| `icon` | nein | string | Muss `icon.svg` sein und die Datei muss im Ordner liegen. Ohne Icon zeigt der Store die Initialen. |
| `main` | nein | string | Falls angegeben, muss es `main.js` sein. Andere Einstiegsdateien werden nicht geladen. |

Unbekannte zusätzliche Felder sind erlaubt und werden ignoriert – FaNotes speichert nur die bekannten.

## Der Ordner

```
addons/<id>/
  manifest.json   Pflicht
  main.js         Pflicht, max. 1,5 MB, ES-Modul, eine Datei
  README.md       empfohlen, max. 200 kB, wird im Store gerendert
  icon.svg        optional, max. 64 kB, ohne <script>, Event-Handler, <foreignObject>
  LICENSE, CHANGELOG.md, package.json, tsconfig.json, jsconfig.json, .gitignore   erlaubt
  src/, test/, tests/, docs/, screenshots/   erlaubt (werden nicht ausgeliefert)
```

Ausgeliefert werden **nur** `manifest.json`, `main.js`, `README.md` und `icon.svg`. Alles andere darf im Ordner liegen (Quellcode vor dem Bündeln, Tests), landet aber nicht bei Nutzern. Binärdateien (`.exe`, `.dll`, `.wasm`, `.zip` …) sind nicht erlaubt.

## icon.svg

- Quadratisch, `viewBox="0 0 24 24"` oder ähnlich, ohne feste `width`/`height`.
- Nutze `currentColor`, damit es im hellen und dunklen Theme funktioniert.
- Kein `<script>`, keine `on*=`-Attribute, kein `javascript:`, kein `<foreignObject>`, `<iframe>`, `<embed>`, `<object>`. FaNotes prüft das vor dem Anzeigen und verwirft das Icon andernfalls.

## README.md

Wird als Markdown gerendert (ohne rohes HTML). Empfohlener Aufbau:

1. Ein Satz, was das Add-on tut.
2. Wie man es benutzt (Befehle, Panels, Statusleiste).
3. **Welche Berechtigungen es braucht und warum.** Nutzer lesen das vor dem Installieren.
4. Bekannte Grenzen.
5. Änderungen (oder ein Link auf `CHANGELOG.md`).

## Version erhöhen

Jede Änderung an `main.js` braucht eine höhere `version`, sonst verteilt der Store das Update nicht – Nutzer sehen erst ein Update, wenn die Versionsnummer im Index größer ist als ihre installierte. Die CI vergleicht die SHA-256 von `main.js` mit dem veröffentlichten Index und lehnt einen Pull Request ab, der Code ändert, aber die Version beibehält. Reine README-Änderungen brauchen keinen Bump.

Empfehlung: [SemVer](https://semver.org/lang/de/) – `1.0.1` Fehlerkorrektur, `1.1.0` neue Funktion, `2.0.0` wenn sich Speicherformat oder Verhalten grundlegend ändern.
