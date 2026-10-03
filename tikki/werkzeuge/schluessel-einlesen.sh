#!/usr/bin/env bash
# Tikki – Schlüssel aus einer Textdatei in alle Profile übernehmen, ohne sie anzuzeigen.
#
#   tikki/werkzeuge/schluessel-einlesen.sh ~/Downloads/cv.cv.txt [--nur-anzeigen] [--danach-loeschen]
#
# Erkennt bekannte Anbieter an Namen (cursor, xai, anthropic, openai, gemini, honcho, WA-Bridge …)
# oder an der Schlüsselform und schreibt KEY=wert in ~/.hermes/.env und jede
# ~/.hermes/profiles/<rolle>/.env (Rechte 600). Ausgabe: nur Namen und Zahlen, nie Werte.
set -euo pipefail
HERMES_BIN="$(command -v hermes || true)"
[ -n "$HERMES_BIN" ] || { echo "FEHLER: hermes nicht gefunden." >&2; exit 1; }
[ $# -ge 1 ] || { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
exec "$HERMES_BIN" --run-module tikki.werkzeuge.schluessel "$@"
