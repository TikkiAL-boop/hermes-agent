#!/usr/bin/env bash
# Tikki – komplette Installation mit einem Befehl, danach Selbsttest.
#
# Auf dem Mac (Terminal):
#   git clone -b tikki-app https://github.com/TikkiAL-boop/hermes-agent.git ~/.hermes/hermes-agent
#   ~/.hermes/hermes-agent/tikki/installieren.sh
#
# Was passiert, der Reihe nach:
#   1. Hermes-Kern über den offiziellen Hermes-Installer (scripts/install.sh) auf diesem
#      Checkout: Python, Abhängigkeiten (hash-geprüft), `hermes`-Befehl, Tikki-App gebaut
#   2. Auf dem Mac: Tikki.app nach /Applications
#   3. 13 Rollen (Profile, SOULs, Plugin gedaechtnis, Skill-Ordner, Cronjobs)
#   4. Vorzimmer = Profil tikki
#   5. API-Schlüssel aus ~/Downloads/cv.cv.txt (oder --schluessel DATEI), Werte bleiben unsichtbar
#   6. Abos prüfen (Claude, Codex, Grok, Gemini, NotebookLM) – ändert nichts
#   7. Raumleiter und Wachhalter als Dienst, damit Takt und Rundgang Neustarts überleben
#   8. Selbsttest (tikki/werkzeuge/selbsttest.py)
#
# Optionen:
#   --schluessel DATEI  Schlüsseldatei (Standard: ~/Downloads/cv.cv.txt, falls vorhanden)
#   --ohne-kern         Schritt 1 auslassen (Hermes samt `hermes`-Befehl ist schon installiert)
#   --ohne-app          die Desktop-App nicht bauen (nur Kern und Rollen)
#   --ohne-dienste      Raumleiter/Wachhalter nicht als Dienst installieren
#   --nur-pruefen       nichts installieren, nur den Selbsttest laufen lassen
#
# Erneut ausführen ist gefahrlos: jeder Schritt erkennt, was schon da ist.
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HIER/.." && pwd)"
ZWEIG="tikki-app"
SCHLUESSEL=""
KERN=1
APP=1
DIENSTE=1
NUR_PRUEFEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --schluessel) shift; SCHLUESSEL="${1:?--schluessel braucht eine Datei}" ;;
    --ohne-kern) KERN=0 ;;
    --ohne-app) APP=0 ;;
    --ohne-dienste) DIENSTE=0 ;;
    --nur-pruefen) NUR_PRUEFEN=1 ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

GELB=""; GRUEN=""; ROT=""; AUS=""
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  GELB=$'\033[1;33m'; GRUEN=$'\033[0;32m'; ROT=$'\033[0;31m'; AUS=$'\033[0m'
fi
schritt() { printf '\n%s▶ %s%s\n' "$GELB" "$1" "$AUS"; }
gut() { printf '  %s✓%s %s\n' "$GRUEN" "$AUS" "$1"; }
hinweis() { printf '  %s⚠%s %s\n' "$GELB" "$AUS" "$1"; }
abbruch() { printf '\n%s✗ %s%s\n' "$ROT" "$1" "$AUS" >&2; exit 1; }

hermes_bin() {
  command -v hermes 2>/dev/null || { [ -x "$HOME/.local/bin/hermes" ] && echo "$HOME/.local/bin/hermes"; } || true
}

selbsttest() {
  local bin args=()
  bin="$(hermes_bin)"
  [ -n "$bin" ] || abbruch "hermes-Befehl fehlt – Schritt 1 nicht gelaufen?"
  [ "$APP" = 1 ] || args+=(--ohne-app)
  schritt "Selbsttest"
  "$bin" --run-module tikki.werkzeuge.selbsttest --hermes "$bin" ${args[@]+"${args[@]}"}
}

printf '%s' "$GELB"
cat <<'BANNER'
  ┌──────────────────────────────────────────┐
  │   tikki  ·  Installation                 │
  └──────────────────────────────────────────┘
BANNER
printf '%s' "$AUS"

if [ "$NUR_PRUEFEN" = 1 ]; then selbsttest; exit $?; fi

git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || abbruch "$REPO ist kein Git-Checkout."
AKTUELL="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
[ "$AKTUELL" = "$ZWEIG" ] || abbruch "Checkout steht auf $AKTUELL – bitte 'git -C $REPO checkout $ZWEIG'."
STANDARD="${HERMES_HOME:-$HOME/.hermes}/hermes-agent"
if [ "$(cd "$STANDARD" 2>/dev/null && pwd -P)" != "$(cd "$REPO" && pwd -P)" ]; then
  hinweis "Checkout liegt nicht unter $STANDARD – Updates der App in /Applications übernimmt"
  hinweis "Hermes nur für diesen Standardort. Empfohlen: dorthin klonen."
fi

# 1) Hermes-Kern über den offiziellen Installer. Er holt origin/tikki-app, legt lokale
#    Änderungen als Stash ab (nichts geht verloren) und baut die App mit dem Namen Tikki.
schritt "1/8  Kern, Abhängigkeiten und App bauen (dauert beim ersten Mal 10–20 Minuten)"
if [ "$KERN" = 1 ]; then
  INSTALL_ARGS=(--dir "$REPO" --branch "$ZWEIG" --non-interactive)
  [ "$APP" = 1 ] && INSTALL_ARGS+=(--include-desktop)
  bash "$REPO/scripts/install.sh" "${INSTALL_ARGS[@]}" || abbruch "Kern-Installation fehlgeschlagen (Log: ~/.hermes/logs/install.log)."
else
  hinweis "übersprungen (--ohne-kern)"
fi
export PATH="$HOME/.local/bin:$PATH"
HERMES="$(hermes_bin)"
[ -n "$HERMES" ] || abbruch "hermes-Befehl nicht gefunden."
gut "Kern bereit: $HERMES"

# 2) Auf dem Mac die gebaute App nach /Applications. Spätere `hermes update` erneuern diese
#    Kopie selbst (der Kern findet sie über productName = Tikki).
schritt "2/8  Tikki-App"
if [ "$APP" = 0 ]; then
  hinweis "übersprungen (--ohne-app)"
elif [ "$(uname -s)" = Darwin ]; then
  GEBAUT="$(ls -dt "$REPO"/apps/desktop/release/mac*/Tikki.app 2>/dev/null | head -1 || true)"
  [ -n "$GEBAUT" ] || abbruch "keine gebaute Tikki.app unter apps/desktop/release."
  if pgrep -f "/Applications/Tikki.app/Contents/MacOS/Tikki" >/dev/null 2>&1; then
    hinweis "Tikki läuft gerade – bitte beenden, dann dieses Skript erneut starten."
  else
    rm -rf /Applications/Tikki.app.neu
    ditto "$GEBAUT" /Applications/Tikki.app.neu
    rm -rf /Applications/Tikki.app
    mv /Applications/Tikki.app.neu /Applications/Tikki.app
    gut "/Applications/Tikki.app"
  fi
else
  gut "gebaut unter apps/desktop/release (Start: hermes desktop)"
fi

# 3) Rollen
schritt "3/8  Rollen, SOULs, Gedächtnis-Plugin, Skills, Cronjobs"
"$HIER/werkzeuge/rollen-einrichten.sh"

# 4) Vorzimmer
schritt "4/8  Vorzimmer = Profil tikki"
"$HERMES" profile use tikki >/dev/null && gut "aktives Profil: tikki"

# 5) Schlüssel – nie Werte ausgeben
schritt "5/8  API-Schlüssel"
if [ -z "$SCHLUESSEL" ] && [ -f "$HOME/Downloads/cv.cv.txt" ]; then SCHLUESSEL="$HOME/Downloads/cv.cv.txt"; fi
if [ -n "$SCHLUESSEL" ]; then
  "$HIER/werkzeuge/schluessel-einlesen.sh" "$SCHLUESSEL"
else
  hinweis "keine Schlüsseldatei gefunden (~/Downloads/cv.cv.txt) – später: tikki/werkzeuge/schluessel-einlesen.sh DATEI"
fi

# 6) Abos – nur prüfen
schritt "6/8  Abos prüfen"
"$HIER/werkzeuge/abos-einrichten.sh" || hinweis "Abo-Prüfung meldet Lücken – Anmeldung: tikki/werkzeuge/abos-einrichten.sh --anmelden"

# 7) Dienst: EIN Host-Gateway aus dem Hauptprofil bedient alle Rollen (Hermes erlaubt pro Rechner
#    nur eines; es fährt die Räume, die Cronjobs aller Profile und das Vorzimmer-Postfach).
schritt "7/8  Tikki-Gateway als Dienst (fährt Räume und Daueraufträge rund um die Uhr)"
if [ "$DIENSTE" = 0 ]; then
  hinweis "übersprungen (--ohne-dienste)"
elif AUSGABE="$("$HERMES" -p default gateway install 2>&1)"; then
  gut "Gateway läuft als Dienst (startet nach Neustart von selbst)"
else
  hinweis "Gateway-Dienst nicht installierbar – Ausgabe:"
  printf '%s\n' "$AUSGABE" | sed 's/^/    /' | tail -12
fi

# 8) Selbsttest
selbsttest
echo
if [ "$(uname -s)" = Darwin ] && [ "$APP" = 1 ]; then
  echo "Fertig. Tikki starten: open -a Tikki"
else
  echo "Fertig. Tikki starten: hermes desktop"
fi
