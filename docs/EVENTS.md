# Ereignisse

Mit `fanotes.events.on(name, handler)` reagiert dein Add-on auf das, was in FaNotes passiert. Handler dürfen `async` sein, bekommen genau ein Payload-Objekt und haben bis zu 10 Sekunden. Fehler landen im Protokoll und zählen als Add-on-Fehler (8 pro Minute → Stopp), FaNotes selbst merkt nichts davon.

```js
const sub = fanotes.events.on('note:opened', async ({ path, title, kind }) => {
  fanotes.log('geöffnet:', title)
})
sub.dispose()   // wieder abbestellen

fanotes.events.once('note:saved', () => { /* nur einmal */ })
```

Ereignisse werden nur an Add-ons gesendet, die sie abonniert haben – ohne Abonnenten kostet ein Ereignis FaNotes nichts. Abonnements verschwinden automatisch, wenn das Add-on gestoppt wird.

## Referenz

### `note:opened`

Die aktive Notiz hat gewechselt (Klick in der Seitenleiste, Tab, Verlauf, Link, `notes.open`).

```ts
{ path: string; title: string; kind: 'markdown' | 'pdf' }
```

Keine Berechtigung nötig. Wird nicht gefeuert, wenn der Nutzer nur zwischen Schreib- und Stiftmodus wechselt – dafür gibt es `mode:changed`.

### `note:changed`

Der getippte Text der offenen Notiz hat sich geändert. Gesammelt: höchstens etwa alle 400 ms pro Notiz, mit dem letzten Stand.

```ts
{ path: string; length: number }   // length = Zeichen des Markdown-Texts
```

Berechtigung `notes:read`. Den Text selbst holst du mit `notes.read(path)` oder `editor.getText()`. Kommt **nicht** für Änderungen durch dein eigenes `notes.write`/`editor.*`? Doch – auch die lösen das Ereignis aus. Wenn du darauf wieder schreibst, baue eine Schleifen-Sperre ein (z. B. Inhalt vergleichen, bevor du schreibst).

### `note:saved`

Eine Notiz wurde auf die Platte geschrieben (Autosave, `Ctrl S`, Schließen).

```ts
{ path: string; title: string; length: number }
```

Berechtigung `notes:read`.

### `note:created`, `note:deleted`

```ts
{ path: string }
```

Keine Berechtigung. `note:deleted` bedeutet „in den Papierkorb verschoben“. Umbenennen und Verschieben erzeugen kein eigenes Ereignis, aber `vault:changed`.

### `ink:stroke`

Ein Stiftstrich ist fertig (Stift abgehoben). Für lebende Statistiken, Schreibtimer, Erinnerungen.

```ts
{
  path: string
  durationMs: number          // Stift-unten-Zeit dieses Strichs
  lengthMm: number            // Länge in Millimetern (bezogen auf die Blattgröße)
  points: number
  purpose: 'handwriting' | 'art'
  color?: string
  brush?: string
}
```

Berechtigung `ink:read`. Die Punkte selbst sind nicht dabei – dafür `ink.read(path)`.

### `mode:changed`

Wechsel zwischen Tastatur- und Stiftmodus.

```ts
{ mode: 'keyboard' | 'ink'; path: string | null }
```

Keine Berechtigung.

### `vault:changed`

Der Dateibaum hat sich geändert (Anlegen, Umbenennen, Verschieben, Papierkorb, externe Änderung).

```ts
{ notes: number }   // Anzahl Notizen im Vault
```

Keine Berechtigung. Hole dir danach `notes.list()` oder `notes.tree()` neu.

### `settings:changed`

Darstellungs-Einstellungen wurden geändert. Payload wie `settings.read()`.

Berechtigung `settings:read`. Nützlich, um ein Panel bei Theme- oder Sprachwechsel neu zu rendern.

## Muster

**Beim Start den aktuellen Zustand lesen.** Ereignisse melden nur Änderungen. Wer die aktive Notiz beim Start braucht, ruft zusätzlich `await fanotes.notes.active()`.

```js
fanotes.onActivate(async () => {
  await refresh(await fanotes.notes.active())
  fanotes.events.on('note:opened', refresh)
})
```

**Drosseln.** `note:changed` und `ink:stroke` können häufig kommen. Wenn dein Handler teuer ist (viele Notizen lesen, Panel neu bauen), sammle mit einem Timer:

```js
let timer = 0
fanotes.events.on('note:changed', () => {
  clearTimeout(timer)
  timer = setTimeout(() => { void rebuild() }, 800)
})
```

**Schleifen vermeiden.** Wer auf `note:changed` mit `notes.write` antwortet, löst das nächste `note:changed` aus. Vergleiche vorher Inhalt, oder schreibe nur auf explizite Nutzeraktion.

**Nicht auf Ereignisse für Eigenes warten.** Deine eigenen Panel-Interaktionen kommen über `panel.onAction`/`onInput`, nicht über `events`.
