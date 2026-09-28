#!/usr/bin/env bash
# Tikki – OpenClaw-Skills für alle Rollen bereitstellen.
#
# 1. Profil „openclaw“ als gemeinsame Skill-Bibliothek (alle Rollen mit dem Werkzeug
#    „skills“ lesen sie über skills.external_dirs).
# 2. Den ganzen ClawHub-Katalog lokal ablegen, damit Bots jeden Skill finden
#    (Skill „openclaw-skills“: suchen und bei Bedarf installieren).
# 3. Optional die ersten N Skills gleich installieren – jeder durch Hermes' Sicherheitsprüfung.
# 4. Eine vorhandene OpenClaw-Installation (~/.openclaw) zeigt der Umzug als Vorschau an.
#
# Verwendung:
#   tikki/werkzeuge/openclaw-einrichten.sh [--vorab <N>]
set -euo pipefail

VORAB=0
[ "${1:-}" = "--vorab" ] && VORAB="${2:?--vorab braucht eine Zahl}"
HERMES_BIN="$(command -v hermes || true)"
[ -n "$HERMES_BIN" ] || { echo "FEHLER: hermes nicht gefunden." >&2; exit 1; }
export TIKKI_HERMES="$HERMES_BIN"
modul() { "$HERMES_BIN" --run-module tikki.werkzeuge.openclaw_skills "$@"; }

PROFILE="$("$HERMES_BIN" profile list 2>/dev/null || true)"
if ! grep -qw "openclaw" <<< "$PROFILE"; then
  "$HERMES_BIN" profile create openclaw --no-alias --no-skills \
    --description "Tikki: OpenClaw-Skill-Bibliothek für alle Rollen" >/dev/null
  echo "Profil openclaw angelegt."
fi

echo "Lade den ClawHub-Katalog (einige Minuten beim ersten Mal) …"
modul katalog

if [ "$VORAB" -gt 0 ]; then
  echo "Installiere die ersten $VORAB Skills …"
  modul beliebteste "$VORAB"
fi

if [ -d "$HOME/.openclaw" ]; then
  echo
  echo "Vorhandenes OpenClaw gefunden. Vorschau des Umzugs (ändert nichts):"
  "$HERMES_BIN" -p openclaw claw migrate --dry-run --skill-conflict rename || true
  echo "Übernehmen: hermes -p openclaw claw migrate --skill-conflict rename"
fi
