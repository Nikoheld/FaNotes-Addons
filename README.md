# FaNotes-Addons

Das offene Add-on-Verzeichnis für [FaNotes](https://github.com/Nikoheld/FaNotes). Jeder kann ein Add-on beisteuern: **Ordner anlegen, Pull Request öffnen, fertig.** Nach dem Merge baut dieses Repository seinen Index automatisch neu, und der Add-on-Store in FaNotes zeigt das Add-on bei allen Nutzern an – ohne dass FaNotes aktualisiert werden muss.

```
addons/
  hello-world/        ← ein Ordner pro Add-on, Name = Add-on-ID
    manifest.json     ← Name, Version, Beschreibung, Berechtigungen
    main.js           ← der Code (eine Datei, läuft im Worker)
    README.md         ← wird im Store angezeigt
    icon.svg          ← optional
index.json            ← wird von der CI erzeugt, nicht von Hand bearbeiten
```

## In 5 Minuten zum ersten Add-on

```bash
git clone https://github.com/Nikoheld/FaNotes-Addons
cd FaNotes-Addons
node scripts/new-addon.mjs mein-addon "Mein Add-on" "Dein Name"
```

Öffne `addons/mein-addon/main.js`:

```js
/// <reference path="../../sdk/fanotes-addon.d.ts" />

fanotes.commands.register({
  id: 'hello',
  title: 'Hallo sagen',
  run: async () => {
    const note = await fanotes.notes.active()
    await fanotes.ui.toast(note ? `Hallo aus „${note.title}“!` : 'Hallo!', 'success')
  },
})
```

Testen: FaNotes → Befehlspalette (`Ctrl K`) → **Add-on-Store** → Reiter **Entwickeln** → **Lokal laden** → `manifest.json` und `main.js` auswählen. Das Add-on startet sofort; Änderungen lädst du einfach erneut.

Veröffentlichen: `node scripts/validate.mjs mein-addon`, committen, Pull Request öffnen. Die CI prüft alles Formale; nach dem Merge ist das Add-on im Store.

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) | Schritt für Schritt vom leeren Ordner zum veröffentlichten Add-on |
| [docs/API.md](docs/API.md) | Vollständige Referenz des `fanotes`-Objekts: Notizen, Editor, UI, Befehle, Ereignisse, Speicher, Netz |
| [docs/MANIFEST.md](docs/MANIFEST.md) | Alle Felder von `manifest.json` |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | Welche Berechtigung was erlaubt und wie du sparsam bleibst |
| [docs/UI_BLOCKS.md](docs/UI_BLOCKS.md) | Panels aus JSON-Blöcken bauen: Buttons, Eingaben, Listen, Markdown |
| [docs/EVENTS.md](docs/EVENTS.md) | Auf Notizwechsel, Speichern, Stiftstriche und mehr reagieren |
| [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | Warum ein Add-on FaNotes nicht zum Absturz bringen kann |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | Pull-Request-Ablauf, Versionierung, Updates, Auto-Index |
| [docs/FAQ.md](docs/FAQ.md) | Häufige Fragen und Fehlermeldungen |
| [sdk/fanotes-addon.d.ts](sdk/fanotes-addon.d.ts) | TypeScript-Typen für Autovervollständigung |

## Beispiel-Add-ons

| Add-on | Zeigt |
| --- | --- |
| [hello-world](addons/hello-world) | Befehl, Toast, Panel mit Buttons – die Kopiervorlage |
| [task-collector](addons/task-collector) | Viele Notizen lesen, eine zurückschreiben, Ereignisse, Speicher, Liste mit Klick |
| [note-statistics](addons/note-statistics) | Seitenstatistik und Handschrift lesen, Statusleiste, Zwischenablage |
| [focus-timer](addons/focus-timer) | Timer im Worker, Statusleiste mit Klick, Eingaben/Selects, Prompt, Editor-Einfügen |

## Wie der Store funktioniert

1. FaNotes lädt beim Öffnen des Stores `index.json` von diesem Repository (`raw.githubusercontent.com`). Fehlt die Datei noch, listet FaNotes `addons/` über die GitHub-API auf – auch dann erscheint jedes gemergte Add-on.
2. Beim Installieren lädt FaNotes `manifest.json`, `main.js`, `README.md` und `icon.svg` des Ordners, prüft Größe, ID und die SHA-256-Prüfsumme aus dem Index, und speichert die Dateien außerhalb des Vaults.
3. Jedes Add-on läuft in einem eigenen **Web Worker** ohne DOM, Dateisystem oder Netzwerk. Es spricht nur über eine geprüfte Nachrichtenschnittstelle mit FaNotes, und nur innerhalb der Berechtigungen aus seinem Manifest. Abstürze, Endlosschleifen oder Anfrage-Fluten beenden nur das Add-on – niemals FaNotes. Details: [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).
4. Erhöht ein Pull Request die `version`, sehen Nutzer im Store ein Update; standardmäßig aktualisiert FaNotes installierte Add-ons beim Start automatisch.

## Regeln in Kürze

- Ein Ordner pro Add-on unter `addons/`, Ordnername = `id` (Kleinbuchstaben, Ziffern, Bindestriche).
- `main.js` ist eine einzelne ES-Modul-Datei (kein `import` anderer Dateien, kein `eval`). Bündle bei Bedarf mit esbuild/rollup **in** `main.js`.
- Fordere nur Berechtigungen an, die du nutzt. `network` braucht `networkHosts`.
- Jede Code-Änderung erhöht `version` – sonst verteilt der Store das Update nicht (die CI erinnert dich).
- Bleibe freundlich und beschreibe im README ehrlich, was das Add-on tut.

Fragen oder Ideen? Öffne ein Issue. Beitragsregeln: [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitsprobleme bitte gemäß [SECURITY.md](SECURITY.md) melden.

Lizenz des Repositorys und der Beispiele: [MIT](LICENSE). Jedes Add-on kann seine eigene Lizenz im Manifest angeben.

---

## English summary

This is the open add-on directory for [FaNotes](https://github.com/Nikoheld/FaNotes). To publish an add-on, add a folder under `addons/<id>/` containing `manifest.json`, `main.js` and `README.md`, then open a pull request. CI validates the manifest, size limits and ES-module syntax; after the merge a workflow rebuilds `index.json`, and the Add-on Store inside FaNotes lists your add-on for every user without a FaNotes update.

Add-ons run in their own Web Worker and talk to FaNotes only through the `fanotes` API (notes, editor, UI panels built from JSON blocks, commands, events, storage, https via an allow-list). Everything an add-on may do is declared as permissions in its manifest and shown to the user before installing; a crashing or misbehaving add-on is stopped by FaNotes, never the other way round.

Start with `node scripts/new-addon.mjs my-addon "My add-on" "Your name"`, load it in FaNotes via *Add-on Store → Develop → Load locally*, and read [docs/API.md](docs/API.md) for the full API. The documentation is written in German (the language most FaNotes users write in); the type declarations in [sdk/fanotes-addon.d.ts](sdk/fanotes-addon.d.ts) are commented in English.
