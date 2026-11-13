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
#   3. Alle Rollen aus rollen/KATALOG.json (Profile, SOULs, Plugins, Skill-Ordner, Cronjobs)
#   4. Vorzimmer = Profil tikki
#   5. API-Schlüssel aus ~/Downloads/cv.cv.txt (oder --schluessel DATEI), Werte bleiben unsichtbar
#   6. Abos prüfen (Claude, Codex, Grok, Gemini, NotebookLM) – ändert nichts
#   7. EIN Host-Gateway als Dienst (aus dem Hauptprofil, für alle Rollen): fährt Räume, Takt,
#      Rundgang und Daueraufträge und überlebt Neustarts
#   8. Sprache: Hermes' Sprach-Extras (faster-whisper fürs Hören, Edge-TTS fürs Sprechen)
#   9. Selbsttest (tikki/werkzeuge/selbsttest.py)
#
# Optionen:
#   --schluessel DATEI  Schlüsseldatei (Standard: ~/Downloads/cv.cv.txt, falls vorhanden)
#   --ohne-kern         Schritt 1 auslassen: kein Code-Update, kein Neubau von Kern und App
#   --ohne-app          die Desktop-App nicht bauen (nur Kern und Rollen)
#   --ohne-dienste      das Gateway nicht als Dienst installieren
#   --ohne-sprache      Sprach-Extras nicht installieren (Tikki tippt und liest mit der Systemstimme)
#   --nur-pruefen       nichts installieren, nur den Selbsttest laufen lassen
#
# Erneut ausführen: jeder Schritt erkennt, was schon da ist. Schritt 1 holt den Stand von
# origin/tikki-app und setzt den Checkout darauf; liegt lokal etwas, das dabei verloren ginge
# (ungesicherte Dateien, Commits, die origin nicht kennt), bricht der Installer vorher ab.
# Danach startet dieses Skript sich selbst aus dem neuen Stand neu (--ohne-kern), damit die
# Schritte 2–9 mit dem frischen Code laufen und nicht mit dem alten.
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HIER/.." && pwd)"
ZWEIG="tikki-app"
SCHLUESSEL=""
KERN=1
APP=1
DIENSTE=1
SPRACHE=1
NUR_PRUEFEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --schluessel) shift; SCHLUESSEL="${1:?--schluessel braucht eine Datei}" ;;
    --ohne-kern) KERN=0 ;;
    --ohne-app) APP=0 ;;
    --ohne-dienste) DIENSTE=0 ;;
    --ohne-sprache) SPRACHE=0 ;;
    --nur-pruefen) NUR_PRUEFEN=1 ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# 1) Hermes-Kern über den offiziellen Installer. Er holt origin/tikki-app, legt lokale Änderungen
#    in einen Stash, den niemand zurückspielt, und setzt einen abweichenden Zweig hart auf origin
#    zurück. Beides wäre hier Arbeit, die still verschwindet – also vorher prüfen und abbrechen.
if [ "$KERN" = 1 ] && [ -z "${TIKKI_INSTALL_NEUSTART:-}" ]; then
  if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
    git -C "$REPO" status --short | head -10 >&2
    abbruch "Im Checkout liegen ungesicherte Änderungen. Erst sichern (git -C $REPO add -A && git -C $REPO commit) – oder ohne Code-Update weitermachen: tikki/installieren.sh --ohne-kern"
  fi
  if git -C "$REPO" fetch --quiet origin "$ZWEIG" 2>/dev/null; then
    if ! git -C "$REPO" merge-base --is-ancestor HEAD "origin/$ZWEIG"; then
      abbruch "Der Checkout hat Commits, die origin/$ZWEIG nicht kennt (z. B. ein Hermes-Merge, noch nicht gepusht). Erst veröffentlichen (git -C $REPO push origin $ZWEIG; bei Abweichung vorher git pull --no-rebase) – oder ohne Code-Update weitermachen: tikki/installieren.sh --ohne-kern"
    fi
  else
    hinweis "origin nicht erreichbar – ob lokale Commits fehlen würden, ist ungeprüft"
  fi
fi
schritt "1/9  Kern, Abhängigkeiten und App bauen (dauert beim ersten Mal 10–20 Minuten)"
if [ "$KERN" = 1 ]; then
  INSTALL_ARGS=(--dir "$REPO" --branch "$ZWEIG" --non-interactive)
  [ "$APP" = 1 ] && INSTALL_ARGS+=(--include-desktop)
  bash "$REPO/scripts/install.sh" "${INSTALL_ARGS[@]}" \
    || abbruch "Kern-Installation fehlgeschlagen – die Zeilen mit ✗ oben sagen, welches Paket (bei einem toten Download: später erneut, Hermes nimmt dann den Spiegel)."
else
  hinweis "übersprungen (--ohne-kern)"
fi
export PATH="$HOME/.local/bin:$PATH"
HERMES="$(hermes_bin)"
[ -n "$HERMES" ] || abbruch "hermes-Befehl nicht gefunden."
gut "Kern bereit: $HERMES"
if [ "$KERN" = 1 ] && [ -z "${TIKKI_INSTALL_NEUSTART:-}" ]; then
  # Der Checkout ist jetzt auf dem neuesten Stand – ab hier zählt der neue Installer.
  NEU=(--ohne-kern)
  [ "$APP" = 1 ] || NEU+=(--ohne-app)
  [ "$DIENSTE" = 1 ] || NEU+=(--ohne-dienste)
  [ "$SPRACHE" = 1 ] || NEU+=(--ohne-sprache)
  [ -z "$SCHLUESSEL" ] || NEU+=(--schluessel "$SCHLUESSEL")
  gut "Code auf Stand $(git -C "$REPO" rev-parse --short=12 HEAD) – Installer startet aus dem neuen Stand neu"
  TIKKI_INSTALL_NEUSTART=1 exec bash "$REPO/tikki/installieren.sh" "${NEU[@]}"
fi

# 2) Auf dem Mac die gebaute App nach /Applications. Spätere `hermes update` erneuern diese
#    Kopie selbst (der Kern findet sie über productName = Tikki).
schritt "2/9  Tikki-App"
if [ "$APP" = 0 ]; then
  hinweis "übersprungen (--ohne-app)"
elif [ "$(uname -s)" = Darwin ]; then
  GEBAUT="$(ls -dt "$REPO"/apps/desktop/release/mac*/Tikki.app 2>/dev/null | head -1 || true)"
  [ -n "$GEBAUT" ] || abbruch "keine gebaute Tikki.app unter apps/desktop/release."
  # Eine laufende App wird nicht ersetzt – also beenden wir sie (sauber, per AppleScript) und warten.
  # Sonst bleibt still die alte App in /Applications stehen, und der Mensch wundert sich.
  if pgrep -f "/Applications/Tikki.app/Contents/MacOS/Tikki" >/dev/null 2>&1; then
    hinweis "Tikki läuft – wird für den Austausch beendet"
    osascript -e 'tell application "Tikki" to quit' >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do
      pgrep -f "/Applications/Tikki.app/Contents/MacOS/Tikki" >/dev/null 2>&1 || break
      sleep 1
    done
  fi
  if pgrep -f "/Applications/Tikki.app/Contents/MacOS/Tikki" >/dev/null 2>&1; then
    abbruch "Tikki lässt sich nicht beenden – bitte die App schließen und tikki/installieren.sh --ohne-kern erneut starten."
  fi
  rm -rf /Applications/Tikki.app.neu
  ditto "$GEBAUT" /Applications/Tikki.app.neu
  rm -rf /Applications/Tikki.app
  mv /Applications/Tikki.app.neu /Applications/Tikki.app
  gut "/Applications/Tikki.app ersetzt (Stand $(git -C "$REPO" rev-parse --short=12 HEAD))"
else
  gut "gebaut unter apps/desktop/release (Start: hermes desktop)"
fi

# 3) Rollen
schritt "3/9  Rollen, SOULs, Gedächtnis-Plugin, Skills, Cronjobs"
"$HIER/werkzeuge/rollen-einrichten.sh"

# 4) Vorzimmer
schritt "4/9  Vorzimmer = Profil tikki"
"$HERMES" profile use tikki >/dev/null && gut "aktives Profil: tikki"

# 5) Schlüssel – nie Werte ausgeben
schritt "5/9  API-Schlüssel"
if [ -z "$SCHLUESSEL" ] && [ -f "$HOME/Downloads/cv.cv.txt" ]; then SCHLUESSEL="$HOME/Downloads/cv.cv.txt"; fi
if [ -n "$SCHLUESSEL" ]; then
  # Eine Datei ohne erkennbare Schlüssel hält den Installer nicht auf; der Selbsttest nennt, was fehlt.
  "$HIER/werkzeuge/schluessel-einlesen.sh" "$SCHLUESSEL" \
    || hinweis "aus $SCHLUESSEL wurde nichts übernommen – Format: NAME=wert je Zeile; später: tikki/werkzeuge/schluessel-einlesen.sh DATEI"
else
  hinweis "keine Schlüsseldatei gefunden (~/Downloads/cv.cv.txt) – später: tikki/werkzeuge/schluessel-einlesen.sh DATEI"
fi

# 6) Abos – nur prüfen
schritt "6/9  Abos prüfen"
"$HIER/werkzeuge/abos-einrichten.sh" || hinweis "Abo-Prüfung meldet Lücken – Anmeldung: tikki/werkzeuge/abos-einrichten.sh --anmelden"

# 7) Dienst: EIN Host-Gateway aus dem Hauptprofil bedient alle Rollen (Hermes erlaubt pro Rechner
#    nur eines; es fährt die Räume, die Cronjobs aller Profile und das Vorzimmer-Postfach).
schritt "7/9  Tikki-Gateway als Dienst (fährt Räume und Daueraufträge rund um die Uhr)"
if [ "$DIENSTE" = 0 ]; then
  hinweis "übersprungen (--ohne-dienste)"
elif AUSGABE="$("$HERMES" -p default gateway install 2>&1)"; then
  gut "Gateway läuft als Dienst (startet nach Neustart von selbst)"
else
  hinweis "Gateway-Dienst nicht installierbar – Ausgabe:"
  printf '%s\n' "$AUSGABE" | sed 's/^/    /' | tail -12
fi
# Hauptprofil: Updates bleiben auf dem Tikki-Zweig (ein nacktes `hermes update` würde sonst
# auf main umschalten), und das Gateway wartet lange genug, wenn viele Räume denselben
# Raumleiter brauchen (Hermes-Standard 120 s → stiller Fehlschlag im zweiten Raum).
"$HERMES" -p default config set updates.auto_switch_parked_branch false >/dev/null 2>&1 \
  && gut "Updates festgenagelt auf tikki-app (tikki/werkzeuge/tikki-update.sh)" \
  || hinweis "updates.auto_switch_parked_branch konnte nicht gesetzt werden"
"$HERMES" -p default config set bot_mode.turn_wait_seconds 1830 >/dev/null 2>&1 \
  || hinweis "bot_mode.turn_wait_seconds konnte nicht gesetzt werden"

# 8) Sprache: Hermes' eigene Extras – `voice` (faster-whisper + Audio für stt.provider local) und
#    `edge-tts` (tts.provider edge, Vorgabe in hermes/vorlage-rolle.yaml). Scheitert es (kein Netz,
#    Plattform ohne Wheel), bleibt alles andere nutzbar: die App tippt, liest mit der Systemstimme.
schritt "8/9  Sprache (hören mit faster-whisper, sprechen mit Edge-TTS)"
if [ "$SPRACHE" = 0 ]; then
  hinweis "übersprungen (--ohne-sprache)"
elif AUSGABE="$("$HERMES" pm install --extra voice --extra edge-tts 2>&1)"; then
  gut "Sprach-Extras installiert (voice, edge-tts); offline: hermes pm install --extra piper"
else
  hinweis "Sprach-Extras nicht installiert – später: hermes pm install --extra voice --extra edge-tts"
  printf '%s\n' "$AUSGABE" | sed 's/^/    /' | tail -8
fi

# 9) Selbsttest
selbsttest
echo
if [ "$(uname -s)" = Darwin ] && [ "$APP" = 1 ]; then
  echo "Fertig. Tikki starten: open -a Tikki"
else
  echo "Fertig. Tikki starten: hermes desktop"
fi
