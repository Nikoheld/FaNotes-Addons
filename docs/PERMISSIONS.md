# Berechtigungen

Ein Add-on kann nur, was in `permissions` seines Manifests steht. Alles andere lehnt FaNotes mit `E_PERMISSION` ab – nicht als Höflichkeit, sondern weil die Prüfung im FaNotes-Prozess passiert, außerhalb der Reichweite des Add-on-Codes. Der Store zeigt jede Berechtigung mit Risikostufe an, bevor der Nutzer installiert.

**Fordere so wenig wie möglich an.** Ein Add-on mit `notes:write` wird kritischer angeschaut als eines mit `ui` und `commands`. Wenn du eine Berechtigung nur für eine Nebenfunktion brauchst, überlege, ob du sie weglassen kannst.

## Übersicht

| Berechtigung | Risiko | Erlaubt | Methoden / Ereignisse |
| --- | --- | --- | --- |
| `ui` | niedrig | Hinweise, Dialoge, Panels, Statusleiste, Links öffnen (mit Rückfrage), Notiz öffnen | `ui.*`, `notes.open` |
| `commands` | niedrig | Einträge in der Befehlspalette, FaNotes-Befehle ausführen | `commands.*` |
| `storage` | niedrig | Eigener Speicher (1 MB, 500 Schlüssel), getrennt vom Vault | `storage.*` |
| `clipboard` | niedrig | Text in die Zwischenablage **schreiben** (nicht lesen) | `clipboard.writeText` |
| `ink:read` | niedrig | Handschrift einer Notiz lesen; Strich-Ereignisse | `ink.read`, Ereignis `ink:stroke` |
| `stats:read` | niedrig | Seitenstatistiken aus der `.famd`-Datei lesen | `stats.read` |
| `settings:read` | niedrig | Darstellungs-Einstellungen lesen (Theme, Schrift, Sprache …), nie Schlüssel oder Passwörter | `settings.read`, Ereignis `settings:changed` |
| `editor` | mittel | Auswahl und Text des offenen Editors lesen, Text einfügen/ersetzen, formatieren | `editor.*` |
| `notes:read` | mittel | Jede Notiz im Vault lesen, Dateibaum, Suche, aktive Notiz | `notes.list/tree/read/exists/search/active`, Ereignisse `note:changed`, `note:saved` |
| `notes:write` | hoch | Text bestehender `.md`-Notizen ersetzen oder ergänzen, neue Notizen anlegen | `notes.write/append/create` |
| `vault:write` | hoch | Ordner anlegen, umbenennen, verschieben, in den Papierkorb legen | `vault.*` |
| `network` | hoch | https-Anfragen an die Hosts in `networkHosts` | `net.fetch` |

Ereignisse ohne Angabe (`note:opened`, `note:created`, `note:deleted`, `mode:changed`, `vault:changed`) sind ohne Berechtigung abonnierbar – sie enthalten nur Pfade und Titel.

## Was Add-ons nie können

Unabhängig von Berechtigungen:

- Notizen **endgültig löschen** (nur Papierkorb).
- Tinte schreiben oder ändern.
- Einstellungen ändern.
- Auf Dateien außerhalb des Vaults zugreifen, Vault-Pfade erfahren, Prozesse starten.
- API-Schlüssel, Passwörter, Fernwartungsdaten der Einstellungen lesen.
- Zwischenablage lesen.
- Cookies oder Anmeldedaten von FaNotes mitsenden; nicht-https-, private oder lokale Adressen aufrufen.
- Das DOM anfassen, eigenes HTML/CSS/Skripte in die Oberfläche bringen.
- Andere Add-ons steuern oder deren Speicher lesen (nur deren Befehle über `commands.execute` auslösen).
- Tastenkürzel belegen (`shortcut` ist nur Anzeige).

## Typische Kombinationen

| Add-on-Typ | Berechtigungen |
| --- | --- |
| Textwerkzeug (Formatieren, Einfügen, Zählen) | `commands`, `ui`, `editor` |
| Übersicht / Dashboard über viele Notizen | `commands`, `ui`, `notes:read`, ggf. `storage` |
| Sammler, der eine Notiz zurückschreibt | `commands`, `ui`, `notes:read`, `notes:write` |
| Statistik-Anzeige | `ui`, `stats:read`, `ink:read`, ggf. `clipboard` |
| Timer / Gewohnheiten | `commands`, `ui`, `storage`, ggf. `editor` |
| Integration mit einem Web-Dienst | `commands`, `ui`, `network` + `networkHosts`, `storage` (für Token), ggf. `notes:read`/`notes:write` |

## Optional bleiben

`fanotes.hasPermission('…')` sagt dir zur Laufzeit, was du darfst – so kann ein Add-on mit weniger Berechtigungen trotzdem funktionieren, nur mit weniger Funktionen. Berechtigungen kann der Nutzer nicht einzeln abwählen; er sieht sie im Store und entscheidet über Installieren oder nicht.

## Wann Maintainer nachfragen

Beim Review schauen wir besonders auf:

- `notes:write` / `vault:write`: Welche Notizen werden geändert? Ist das für den Nutzer vorhersehbar (nur eine benannte Ziel-Notiz, nur die aktive Notiz, nur nach Bestätigung)?
- `network`: Wohin gehen Daten, und stehen Inhalte von Notizen darin? Das README muss das nennen.
- `notes:read` in Kombination mit `network`: Der klassische Weg, Daten abfließen zu lassen. Erwarte Fragen und beschreibe genau, was gesendet wird.
