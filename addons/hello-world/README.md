# Hello World

Das kleinste vollständige FaNotes-Add-on – gedacht als Kopiervorlage.

## Was es kann

- **Hallo sagen** (Befehlspalette): zeigt einen Toast mit dem Namen der offenen Notiz.
- **Hello-World-Panel öffnen**: öffnet ein Panel im Add-on-Dock mit zwei Buttons.

## Berechtigungen

| Berechtigung | Wofür |
| --- | --- |
| `commands` | Befehle in der Palette registrieren |
| `ui` | Toasts und das Panel anzeigen |
| `notes:read` | Name der aktiven Notiz und Anzahl der Notizen lesen |

## So baust du daraus dein eigenes Add-on

1. Ordner kopieren: `addons/hello-world` → `addons/<deine-id>`
2. In `manifest.json` `id`, `name`, `description`, `author` anpassen (die `id` muss dem Ordnernamen entsprechen).
3. `main.js` bearbeiten – die API steht in [`docs/API.md`](../../docs/API.md).
4. Lokal testen: FaNotes → Add-on-Store → *Entwickeln* → *Lokal laden*.
5. Pull Request öffnen. Nach dem Merge erscheint das Add-on automatisch im Store.
