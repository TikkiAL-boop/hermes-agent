#!/usr/bin/env bash
# Tikki aktualisieren: Hermes' eigener Updater, festgenagelt auf den Tikki-Zweig.
#
# Ein nacktes `hermes update` (auch `/update` im Chat) darf den Checkout NIE auf `main`
# umschalten – das wäre nacktes Hermes ohne tikki/. `installieren.sh` und die Rollenvorlage
# setzen dafür `updates.auto_switch_parked_branch: false`; dieses Skript ist der eine
# Update-Befehl, den man sich merken muss. Der Updater holt den Zweig und baut die App neu;
# danach richtet das Skript die Rollen aus dem NEUEN Stand nach (SOULs, Vorlage, neue Rollen,
# Cron-Skripte – sonst läuft ein Dauerauftrag mit altem Aufruf ins Leere) und endet mit dem
# Selbsttest. `/update` im Chat und der Update-Knopf der App holen nur den Code: danach
# tikki/werkzeuge/rollen-einrichten.sh (der Selbsttest meldet es unter „Rollen“).
set -euo pipefail

# Alles in einer Funktion: Der Updater ersetzt diese Datei, während sie läuft; bash hat die
# Funktion dann schon ganz gelesen.
aktualisieren() {
  local zweig="tikki-app" hermes hier
  hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  hermes="$(command -v hermes 2>/dev/null || true)"
  if [ -z "$hermes" ] && [ -x "$HOME/.local/bin/hermes" ]; then hermes="$HOME/.local/bin/hermes"; fi
  [ -n "$hermes" ] || { echo "hermes-Befehl nicht gefunden (erst tikki/installieren.sh)." >&2; return 1; }
  "$hermes" update --branch "$zweig" "$@"
  echo
  echo "== Rollen auf den neuen Stand"
  "$hier/rollen-einrichten.sh" | tail -4
  echo
  "$hermes" --run-module tikki.werkzeuge.selbsttest --hermes "$hermes"
}
aktualisieren "$@"
exit $?
