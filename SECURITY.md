# Sicherheit

## Ein Add-on verhält sich verdächtig

Wenn ein veröffentlichtes Add-on Daten abgreift, Notizen zerstört oder anders schadet:

1. **Sofort deaktivieren** in FaNotes: Add-on-Store → Installiert → Schalter aus (oder Deinstallieren).
2. **Melden:** Öffne ein Issue in diesem Repository mit `security` im Titel und nenne Add-on-ID, Version und was passiert ist. Wenn Details vertraulich sind (z. B. betroffene Daten), schreibe nur „vertrauliche Meldung“ ins Issue – ein Maintainer meldet sich mit einem privaten Kanal.

Maintainer können ein Add-on ohne Pull Request aus dem Index entfernen. Der Auto-Update-Mechanismus verteilt danach keine Version mehr; bereits installierte Kopien müssen Nutzer selbst deaktivieren, dafür zeigt der Store einen Hinweis „nicht mehr im Verzeichnis“.

## Eine Lücke im Sicherheitsmodell

Das Modell ist in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) beschrieben. Wenn du einen Weg findest, mit dem ein Add-on

- ohne passende Berechtigung an Daten kommt,
- die Worker-Isolation verlässt (DOM, Dateisystem, Netz außerhalb von `fanotes.net`),
- FaNotes zum Absturz bringt oder dauerhaft blockiert,
- die Prüfsummen- oder Manifest-Prüfung umgeht,

dann melde das bitte **nicht öffentlich**, sondern per GitHub Security Advisory im [FaNotes-Repository](https://github.com/Nikoheld/FaNotes/security/advisories/new) (der Code der Laufzeit liegt dort). Beschreibe Schritte zur Reproduktion; ein Beispiel-Add-on als Anhang ist ideal.

Wir bestätigen den Eingang zügig, beheben in FaNotes und veröffentlichen eine Notiz im Changelog, sobald ein Update verfügbar ist. Nenne uns, ob du namentlich genannt werden möchtest.

## Was kein Sicherheitsproblem ist

- Ein Add-on nutzt eine Berechtigung, die in seinem Manifest steht und im Store angezeigt wurde (auch wenn du sie nicht erwartet hast) – das ist ein Review-Thema, öffne ein normales Issue.
- Ein Add-on ist langsam oder verbraucht CPU im eigenen Worker.
- Ein Add-on stürzt selbst ab (FaNotes zeigt „abgestürzt“ und läuft weiter).
