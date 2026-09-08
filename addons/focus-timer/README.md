# Fokus-Timer

Ein Pomodoro-Timer, der in der Statusleiste von FaNotes lebt.

## Funktionen

- **Fokus-Timer starten** (Befehlspalette oder Klick auf `⏱ Fokus` in der Statusleiste): 25 Minuten Fokus, danach automatisch 5 Minuten Pause.
- Nach jeder Runde fragt das Add-on, woran du gearbeitet hast, und schreibt eine Zeile ans Ende der offenen Notiz (abschaltbar).
- Fokus- und Pausenlänge sowie die Zahl der heutigen Runden werden im Add-on-Speicher gemerkt.

## Berechtigungen

| Berechtigung | Wofür |
| --- | --- |
| `ui` | Statusleiste, Panel, Toasts, Nachfrage-Dialog |
| `commands` | Befehle in der Palette |
| `editor` | Protokollzeile ans Ende der offenen Notiz setzen |
| `notes:read` / `notes:write` | Fallback, wenn kein Editor offen ist (z. B. Stiftmodus) |
| `storage` | Einstellungen und Rundenzähler |
