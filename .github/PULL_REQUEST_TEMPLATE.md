<!-- Danke für dein Add-on! Fülle die Liste kurz aus; die CI prüft den Rest automatisch. -->

## Add-on

- **Ordner:** `addons/<id>`
- **Was es tut:** …
- **Neu oder Update?** neu / Update von vX.Y.Z auf vX.Y.Z

## Checkliste

- [ ] `id` im Manifest entspricht dem Ordnernamen
- [ ] Nur die wirklich benötigten `permissions` (siehe [docs/PERMISSIONS.md](../docs/PERMISSIONS.md))
- [ ] `README.md` erklärt Funktion und Berechtigungen
- [ ] `node scripts/validate.mjs <id>` läuft ohne Fehler
- [ ] Lokal in FaNotes getestet (Add-on-Store → Entwickeln → Lokal laden)
- [ ] Bei Code-Änderungen wurde `version` erhöht
