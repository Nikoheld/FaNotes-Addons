# Notiz-Statistik

Macht die stillen Seitenstatistiken sichtbar, die FaNotes für jede Notiz in der `.famd`-Datei führt.

## Funktionen

- Panel mit Text-, Handschrift- und Zeit-Kennzahlen der aktiven Notiz – aktualisiert sich beim Notizwechsel, Speichern und nach Stiftstrichen.
- Eintrag in der Statusleiste (`123 W · 14 min`); Klick öffnet das Panel.
- „Als Markdown kopieren“ legt eine Tabelle in die Zwischenablage.

## Berechtigungen

| Berechtigung | Wofür |
| --- | --- |
| `notes:read` | Aktive Notiz kennen |
| `stats:read` | Seitenstatistik aus der `.famd` lesen |
| `ink:read` | Anzahl der Striche auf der aktuellen Seite zählen |
| `ui` | Panel, Statusleiste, Toasts |
| `commands` | Befehl in der Palette |
| `clipboard` | Markdown-Tabelle kopieren |
