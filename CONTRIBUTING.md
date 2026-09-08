# Mitmachen

Danke, dass du ein Add-on beisteuern willst. Der kurze Weg steht im [README](README.md); hier die Regeln, damit der Pull Request schnell durchgeht.

## Ein neues Add-on

1. Fork, Branch `addon/<id>`.
2. `node scripts/new-addon.mjs <id> "<Name>" "<Autor>"` oder Ordner von Hand nach [docs/MANIFEST.md](docs/MANIFEST.md).
3. Entwickeln, lokal in FaNotes testen ([docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)).
4. `node scripts/validate.mjs <id>` muss ohne Fehler durchlaufen.
5. Pull Request gegen `main`. Vorlage ausfüllen. **Ein Add-on pro Pull Request.**

## Ein bestehendes Add-on ändern

- Eigene Add-ons: wie oben, `version` erhöhen.
- Fremde Add-ons: Bitte zuerst ein Issue oder einen Kommentar an den Autor (im Manifest). Kleine Korrekturen (Tippfehler im README, offensichtlicher Bug) sind ohne Rücksprache okay; nenne den Autor im PR.

## Was wir beim Review erwarten

- **README erklärt ehrlich**, was das Add-on tut und warum es jede Berechtigung braucht.
- **Sparsame Berechtigungen** ([docs/PERMISSIONS.md](docs/PERMISSIONS.md)).
- **Lesbarer Code.** Minifizierter oder gebündelter Code ist erlaubt, wenn die Quelle unter `src/` im gleichen Ordner liegt und der Build-Befehl im README steht.
- **Keine Telemetrie ohne Ansage.** Wer Daten sendet (`network`), nennt Ziel und Inhalt im README.
- **Keine Kopien fremder Add-ons** mit neuer ID, keine Werbung, nichts Illegales.
- Umgangston: freundlich, sachlich; wir sind wenige Freiwillige.

## Änderungen an Skripten, SDK oder Doku

Willkommen – per PR mit kurzer Begründung. Die Skripte müssen mit Node 20+ ohne Abhängigkeiten laufen. `scripts/lib/manifest.mjs` muss inhaltlich `src/lib/addons/manifest.ts` in FaNotes entsprechen; Änderungen an den Regeln brauchen einen begleitenden FaNotes-PR.

## Lizenz

Beiträge an Skripte, SDK und Dokumentation stehen unter der [MIT-Lizenz](LICENSE). Jedes Add-on kann seine eigene Lizenz im Manifest (`license`) und als `LICENSE`-Datei im Ordner angeben; ohne Angabe gilt MIT.
