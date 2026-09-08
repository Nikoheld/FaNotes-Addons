# Erste Schritte

Diese Anleitung führt vom leeren Ordner bis zum veröffentlichten Add-on. Vorkenntnisse: etwas JavaScript. Du brauchst Node.js 20+ (nur für die Prüfskripte) und FaNotes.

## 1. Repository holen

```bash
git clone https://github.com/Nikoheld/FaNotes-Addons
cd FaNotes-Addons
```

(Für den Pull Request später forkst du das Repository auf GitHub und pushst in deinen Fork.)

## 2. Ordner anlegen

```bash
node scripts/new-addon.mjs wort-zaehler "Wortzähler" "Fabio"
```

Das erzeugt:

```
addons/wort-zaehler/
  manifest.json
  main.js
  README.md
```

Die **ID** (`wort-zaehler`) ist gleichzeitig der Ordnername. Erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche, 2–64 Zeichen. Sie ist später nicht mehr änderbar, weil FaNotes Installationen und Speicher daran festmacht.

## 3. Manifest ausfüllen

```json
{
  "id": "wort-zaehler",
  "name": "Wortzähler",
  "version": "1.0.0",
  "description": "Zählt Wörter und Zeichen der markierten Stelle oder der ganzen Notiz.",
  "author": { "name": "Fabio", "url": "https://github.com/fabio" },
  "license": "MIT",
  "api": 1,
  "permissions": ["commands", "ui", "editor"],
  "categories": ["writing"],
  "keywords": ["wörter", "zählen"]
}
```

Alle Felder: [MANIFEST.md](MANIFEST.md). Berechtigungen: [PERMISSIONS.md](PERMISSIONS.md) – nimm nur, was du wirklich brauchst; der Store zeigt jede Berechtigung mit Risikostufe an.

## 4. Code schreiben

`main.js` läuft in einem Web Worker. Es gibt kein `window`, kein `document`, kein `fetch` – dafür das globale Objekt `fanotes`:

```js
/// <reference path="../../sdk/fanotes-addon.d.ts" />

fanotes.commands.register({
  id: 'count',
  title: 'Wörter zählen',
  detail: 'Markierung oder ganze Notiz',
  run: async () => {
    const selection = await fanotes.editor.getSelection()
    const text = selection && selection.text ? selection.text : await fanotes.editor.getText()
    if (text === null) {
      await fanotes.ui.toast('Öffne zuerst eine Notiz im Schreibmodus.', 'error')
      return
    }
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0
    await fanotes.ui.toast(`${words} Wörter · ${text.length} Zeichen`)
  },
})
```

Die Zeile `/// <reference path=... />` gibt dir in VS Code & Co. Autovervollständigung für alles unter `fanotes`. Vollständige API: [API.md](API.md).

### Ein Panel dazu

Panels sind JSON-Blöcke, die FaNotes rendert – kein HTML, kein CSS:

```js
let panel = null

fanotes.commands.register({
  id: 'panel',
  title: 'Wortzähler-Panel',
  run: async () => {
    panel = fanotes.ui.panel({
      id: 'main',
      title: 'Wortzähler',
      icon: '🔢',
      blocks: await render(),
    })
    panel.onAction(async (action) => {
      if (action.id === 'refresh') await panel.update(await render())
    })
  },
})

async function render() {
  const text = (await fanotes.editor.getText()) ?? ''
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0
  return [
    { type: 'keyvalue', items: [{ key: 'Wörter', value: words }, { key: 'Zeichen', value: text.length }] },
    { type: 'button', id: 'refresh', label: 'Aktualisieren', primary: true },
  ]
}

fanotes.events.on('note:changed', async () => {
  if (panel) await panel.update(await render())
})
```

Alle Blocktypen: [UI_BLOCKS.md](UI_BLOCKS.md). Ereignisse: [EVENTS.md](EVENTS.md).

## 5. Lokal testen

1. FaNotes öffnen → `Ctrl P` → **Add-on-Store** (oder Einstellungen → Add-ons).
2. Reiter **Entwickeln** → **Lokal laden** → `manifest.json` und `main.js` (optional `README.md`) zusammen auswählen.
3. Das Add-on startet sofort. Unter **Installiert** siehst du Status, Fehler und das Protokoll (`console.log` und `fanotes.log` landen dort).
4. Nach jeder Änderung einfach wieder **Lokal laden** – die Dateien werden ersetzt und das Add-on neu gestartet.

Lokal geladene Add-ons sind mit „lokal“ markiert und werden nie automatisch aktualisiert.

## 6. Prüfen

```bash
node scripts/validate.mjs wort-zaehler
```

Das ist dieselbe Prüfung wie in der CI: Manifest, Ordnername = ID, Größen, ES-Modul-Syntax von `main.js`, verbotene Muster, Versionserhöhung bei Code-Änderungen.

## 7. Veröffentlichen

1. Fork erstellen, Branch anlegen, committen, pushen.
2. Pull Request gegen `main` öffnen. Die Vorlage fragt nach Ordner, Kurzbeschreibung und Berechtigungen.
3. Die CI läuft automatisch. Ein Maintainer schaut auf Beschreibung, Berechtigungen und Code.
4. Nach dem Merge baut der **Auto-index**-Workflow `index.json` neu. Ab dann erscheint dein Add-on im Store jedes FaNotes-Nutzers – kein FaNotes-Update nötig.

Details und Update-Regeln: [PUBLISHING.md](PUBLISHING.md).

## Tipps

- **Alles ist asynchron.** Jede `fanotes.*`-Funktion außer `app`, `hasPermission`, `log`, `commands.register`, `events.on` und `ui.panel` gibt ein Promise zurück.
- **Fehler werfen ist okay.** Ein Fehler in einem Befehl zeigt dem Nutzer einen Toast mit deiner Meldung und landet im Protokoll. FaNotes läuft weiter. Nur wer in einer Minute acht Fehler produziert, wird gestoppt.
- **Arbeite in Häppchen.** Ein einzelner Aufruf darf 30 Sekunden dauern; wenn dein Worker auf einen `ping` acht Sekunden lang nicht antwortet (Endlosschleife), wird er beendet. Nutze `await` in Schleifen über viele Notizen, dann bleibt der Worker ansprechbar.
- **Bündeln statt importieren.** `main.js` ist eine einzelne Datei. Wenn du mit mehreren Dateien oder npm-Paketen arbeitest, bündle sie mit esbuild (`esbuild src/index.js --bundle --format=esm --outfile=main.js`) und committe das Ergebnis.
- **Deutsch oder Englisch?** FaNotes ist zweisprachig; `fanotes.app.language` liefert `de` oder `en`. Die Beispiele sind deutsch, weil die meisten Nutzer deutsch schreiben.
