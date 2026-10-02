#!/usr/bin/env bash
# Tikki aktualisieren: Hermes' eigener Updater, festgenagelt auf den Tikki-Zweig.
#
# Ein nacktes `hermes update` (auch `/update` im Chat) darf den Checkout NIE auf `main`
# umschalten – das wäre nacktes Hermes ohne tikki/. `installieren.sh` und die Rollenvorlage
# setzen dafür `updates.auto_switch_parked_branch: false`; dieses Skript ist der eine
# Update-Befehl, den man sich merken muss. Danach die App neu bauen lassen (macht der Updater)
# und den Selbsttest laufen lassen.
set -euo pipefail
ZWEIG="${TIKKI_ZWEIG:-tikki-app}"
HERMES="$(command -v hermes 2>/dev/null || true)"
[ -n "$HERMES" ] || [ -x "$HOME/.local/bin/hermes" ] && HERMES="${HERMES:-$HOME/.local/bin/hermes}"
[ -n "$HERMES" ] || { echo "hermes-Befehl nicht gefunden (erst tikki/installieren.sh)." >&2; exit 1; }
exec "$HERMES" update --branch "$ZWEIG" "$@"
