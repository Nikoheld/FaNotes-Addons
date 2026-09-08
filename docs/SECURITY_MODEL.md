# Sicherheitsmodell

Das Ziel ist einfach formuliert: **Ein fehlerhaftes oder böswilliges Add-on darf FaNotes weder zum Absturz bringen noch Notizen beschädigen noch Daten abgreifen, die es nicht bekommen soll.** Dieses Dokument beschreibt, wie das erreicht wird – für Add-on-Autoren, die wissen wollen, warum manches nicht geht, und für Nutzer, die entscheiden, was sie installieren.

## 1. Isolation: ein Worker pro Add-on

Jedes Add-on läuft in einem eigenen **Web Worker**. Ein Worker ist ein getrennter JavaScript-Thread ohne Zugriff auf:

- das DOM (kein `window`, `document`, keine Oberfläche),
- den Speicher oder die Variablen von FaNotes oder anderen Add-ons,
- `localStorage`, IndexedDB, Cookies von FaNotes,
- das Dateisystem und den Vault,
- Netzwerk (`fetch`, `XMLHttpRequest`, `WebSocket` sind im Add-on-Kontext nicht nutzbar; FaNotes' Content Security Policy erlaubt Workern nur `blob:`-Quellen ohne Fremdverbindungen),
- Node.js/Electron-APIs (der Renderer läuft ohne Node-Integration, und Add-ons laufen noch eine Stufe darunter).

Der Worker startet aus einem `blob:`-URL mit dem FaNotes-SDK; dein `main.js` wird darin per `import()` geladen. Statische `import`-Anweisungen auf andere Dateien funktionieren nicht, `importScripts` ist blockiert – das Add-on ist genau die eine Datei, die im Store geprüft wurde.

**Folge:** Eine Endlosschleife, ein `throw` an falscher Stelle, ein Speicherleck oder ein Stack Overflow passieren im Worker-Thread. FaNotes rendert weiter, speichert weiter, reagiert weiter.

## 2. Alles läuft über eine geprüfte Nachrichtenschnittstelle

Das `fanotes`-Objekt im Worker ist ein dünner Client. Jeder Aufruf wird als Nachricht `{ method, args }` an FaNotes geschickt; FaNotes antwortet mit Ergebnis oder Fehler. Auf der FaNotes-Seite gilt für jede Nachricht:

1. **Methode bekannt?** Nur Methoden aus einer festen Tabelle (`ADDON_METHOD_PERMISSIONS`) werden ausgeführt. Alles andere → `E_UNKNOWN_METHOD`.
2. **Berechtigung vorhanden?** Die Tabelle nennt pro Methode die nötige Berechtigung; sie wird gegen das **installierte Manifest** geprüft, nicht gegen etwas, das das Add-on mitschickt → `E_PERMISSION`.
3. **Argumente gültig?** Pfade werden normalisiert und gegen `..`, führende `/`, Leerstrings und Überlänge geprüft. Texte haben Maximalgrößen. Enums (`kind`, `where`, `tone`) werden auf erlaubte Werte gezwungen. Unbekannte Felder werden verworfen.
4. **Rate okay?** Max. 240 Aufrufe pro Sekunde und 200 gleichzeitig offene Aufrufe. Wer fünf Sekunden in Folge darüber liegt, wird gestoppt.
5. **Zeit okay?** Jeder Aufruf hat 30 s. Danach `E_TIMEOUT` – das Add-on hängt nicht mehr an FaNotes-Ressourcen.
6. **Antwort kopiert.** Rückgaben werden per Structured Clone kopiert. Das Add-on bekommt nie Referenzen auf FaNotes-Objekte.

Umgekehrt validiert das SDK im Worker jede Antwort von FaNotes, bevor es ein Promise auflöst.

## 3. Gesundheitsüberwachung

- **Ping/Pong:** Alle 5 s schickt FaNotes einen `ping`. Antwortet der Worker 8 s lang nicht (Endlosschleife, blockierender Code), wird er beendet.
- **Fehlerzähler:** Unbehandelte Ausnahmen, abgelehnte Promises, fehlgeschlagene Befehle und Handler-Fehler werden gezählt. **8 Fehler innerhalb von 60 s** → Add-on gestoppt und deaktiviert; der Nutzer sieht den Grund im Store.
- **Neustarts:** Nach einem Absturz startet FaNotes das Add-on bis zu **3-mal** neu (1,2 s Pause). Danach bleibt es deaktiviert, bis der Nutzer eingreift.
- **Aktivierungs-Timeout:** Meldet sich ein Add-on nicht innerhalb von 15 s nach dem Start, gilt es als abgestürzt.
- **Aufräumen:** Beim Stopp werden Befehle, Panels, Statusleisten-Einträge und Ereignis-Abonnements des Add-ons entfernt, offene Aufrufe abgelehnt und der Worker samt `blob:`-URLs freigegeben.

## 4. Oberfläche ohne DOM-Zugriff

Add-ons beschreiben Panels als JSON-Blöcke ([UI_BLOCKS.md](UI_BLOCKS.md)). FaNotes normalisiert den Baum (max. 400 Blöcke, Tiefe 4, Texte gekürzt, IDs geprüft) und rendert ihn mit eigenen React-Komponenten. Markdown-Blöcke laufen durch denselben Renderer wie Notizen – ohne rohes HTML. Links öffnen nur nach Rückfrage. Es gibt keinen Weg, CSS, HTML oder Skripte in die FaNotes-Oberfläche zu bringen.

Jeder Toast, jeder Dialog trägt den Namen des Add-ons, damit sich kein Add-on als FaNotes ausgeben kann. Das Panel-Dock ist in eine Fehlergrenze (`SafeBoundary`) eingebettet: sollte das Rendern eines Panels trotz Normalisierung scheitern, zeigt FaNotes eine Fehlermeldung im Dock statt weiß zu werden.

## 5. Daten, die Add-ons nie bekommen

- **Einstellungen:** `settings.read()` liefert eine feste Allow-Liste von Darstellungs-Schlüsseln. API-Schlüssel, Passwörter, Fernwartungs-Konfiguration, Vault-Pfade und Update-Kanäle stehen nicht darauf.
- **Vault-Pfade:** Add-ons arbeiten mit relativen Pfaden. Wo der Vault auf der Platte liegt, erfahren sie nicht.
- **`.famd`-Anhang:** `notes.read()` liefert nur den sichtbaren Markdown-Text. Tinte und Statistik gibt es getrennt (und nur lesend) über `ink.read`/`stats.read` mit eigenen Berechtigungen.
- **Zwischenablage:** nur schreiben.
- **Andere Add-ons:** Kein Zugriff auf deren Speicher, Panels oder Nachrichten.

## 6. Schreiben ist eingeschränkt und rückgängig

- `notes.write` funktioniert nur für `.md`-Notizen und behält den `.famd`-Anhang (Tinte, Statistik) bei. Offene Notizen werden über den Editor geändert, also mit `Ctrl Z` rückgängig.
- `vault.trash` verschiebt in den FaNotes-Papierkorb. Endgültiges Löschen gibt es nicht.
- Größenlimits (4 MB pro Notiz) verhindern, dass ein Add-on den Vault vollschreibt.
- Der Add-on-eigene Speicher liegt außerhalb des Vaults (Electron: Nutzerdaten-Ordner; Browser: `localStorage`) und ist auf 1 MB begrenzt.

## 7. Netzwerk

- Nur mit Berechtigung `network` **und** einer `networkHosts`-Liste im Manifest. FaNotes prüft den Host jeder Anfrage gegen diese Liste, bevor irgendetwas gesendet wird.
- Nur `https://`. Private und lokale Adressen (`localhost`, `127.*`, `10.*`, `192.168.*`, `172.16–31.*`, `169.254.*`, `*.local`, IPv6) sind immer blockiert – auch nach Weiterleitungen.
- Die Anfrage geht durch den FaNotes-Hauptprozess (Electron) mit eigenem User-Agent, **ohne Cookies oder Anmeldedaten** des Nutzers. Header wie `Cookie`, `Authorization`, `Host`, `Origin`, `Referer` aus dem Add-on werden verworfen (ein Token als eigener Header ist erlaubt).
- Antworten sind auf 5 MB und 20 s begrenzt.
- In der Browser-Version gibt es kein Add-on-Netzwerk: die Content Security Policy erlaubt nur den eigenen Server.

## 8. Installation und Updates

- Der Store lädt Add-ons nur von GitHub-Hosts (`raw.githubusercontent.com`, `api.github.com`, `github.com`, `objects.githubusercontent.com`). Andere Hosts akzeptiert der Hauptprozess nicht.
- `index.json` enthält pro Add-on die **SHA-256 von `main.js`**. Beim Installieren wird der Download gegen diese Prüfsumme verglichen; passt sie nicht, wird nichts gespeichert.
- Bei jedem Start vergleicht FaNotes die auf der Platte liegende `main.js` erneut mit der bei der Installation gespeicherten Prüfsumme. Wurde die Datei verändert, startet das Add-on nicht („wurde nach der Installation verändert“).
- Das Manifest wird beim Installieren neu geparst; die Berechtigungen kommen aus dem geprüften Manifest, nicht aus dem Index.
- `minAppVersion` wird vor dem Start geprüft; ältere FaNotes-Versionen starten das Add-on nicht.
- Icons werden auf `<svg>` ohne Skripte/Event-Handler geprüft.
- Auto-Update (Standard an, abschaltbar in den Einstellungen) installiert nur Versionen, die im Index **höher** sind – dieselbe Prüfkette wie eine manuelle Installation. Lokal geladene Add-ons werden nie automatisch aktualisiert.
- Deinstallieren entfernt Dateien und Speicher des Add-ons.

## 9. Prüfung im Repository

Vor dem Merge prüft die CI jedes Add-on ([PUBLISHING.md](PUBLISHING.md)): Manifest-Schema, Ordnername = ID, Größen, ES-Modul-Syntax, verbotene Muster (`eval`, `new Function`, `importScripts`, verschachtelte Worker, direkte Netzwerk-APIs), Binärdateien, Versionserhöhung bei Code-Änderung, keine Downgrades. Ein Maintainer sieht sich Beschreibung, Berechtigungen und Code an – mit besonderem Blick auf `notes:write`, `vault:write` und `network`.

Die Prüfung ersetzt nicht die Isolation: **auch ein Add-on, das die CI passiert, kann nur, was Abschnitte 1–8 erlauben.**

## 10. Was das Modell nicht verhindert

Ehrlichkeit gehört dazu:

- Ein Add-on mit `notes:read` **und** `network` kann Notizinhalte an seine `networkHosts` senden. Das ist der Sinn mancher Integrationen – aber der Nutzer muss es aus README und Berechtigungsliste erkennen können. Maintainer fragen hier gezielt nach.
- Ein Add-on mit `notes:write` kann eine Notiz mit Unsinn überschreiben. Der Editor-Verlauf (`Ctrl Z`) und die Papierkorb-Logik helfen, aber Vorsicht bei unbekannten Autoren ist berechtigt.
- Ein Add-on kann den Nutzer mit Toasts oder Dialogen nerven. Rate-Limit und Fehlerzähler begrenzen das; der Nutzer kann es in einem Klick deaktivieren.
- CPU-Last im Worker verlangsamt das Gerät, nicht FaNotes' UI-Thread – aber auf schwacher Hardware merkt man sie trotzdem. Die Ping-Überwachung fängt nur vollständiges Hängen ab.

Sicherheitsprobleme im Modell selbst bitte gemäß [SECURITY.md](../SECURITY.md) melden.
