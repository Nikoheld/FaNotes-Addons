# Aufgaben-Sammler

Sammelt alle Aufgaben im Format `- [ ] Text` aus allen Markdown-Notizen deines Vaults in einem Panel.

## Funktionen

- **Aufgaben-Sammler öffnen** (Befehlspalette) – Panel mit allen offenen Aufgaben, sortiert nach Notiz.
- Klick auf eine Aufgabe: Notiz öffnen oder Aufgabe direkt abhaken (setzt `[x]` in der Datei).
- **Erledigte zeigen** merkt sich deine Wahl (Add-on-Speicher).
- Liest automatisch neu ein, wenn eine Notiz gespeichert wird.

## Berechtigungen

| Berechtigung | Wofür |
| --- | --- |
| `notes:read` | Alle Notizen lesen, um Aufgaben zu finden |
| `notes:write` | Eine Aufgabe in der Notiz abhaken |
| `ui` | Panel, Toasts und Bestätigungsdialog |
| `commands` | Befehle in der Palette |
| `storage` | Einstellung „Erledigte zeigen“ speichern |

## Grenzen

Es werden maximal 400 Notizen pro Durchlauf gelesen. Notizen, die sich seit dem letzten Einlesen verändert haben, werden vor dem Schreiben erneut geprüft, damit nie die falsche Zeile geändert wird.
