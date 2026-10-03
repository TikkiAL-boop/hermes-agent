#!/usr/bin/env bash
# Tikki – fragt /health auf dem Port jeder Rolle aus rollen/KATALOG.json ab.
# Verwendung: tikki/werkzeuge/rollen-status.sh [--host 127.0.0.1] [--timeout 3]
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KATALOG="$HIER/../rollen/KATALOG.json"
HOST="127.0.0.1"
TIMEOUT=3
while [ $# -gt 0 ]; do
  case "$1" in
    --host) shift; HOST="${1:-127.0.0.1}" ;;
    --timeout) shift; TIMEOUT="${1:-3}" ;;
    -h|--help) sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done
[ -f "$KATALOG" ] || { echo "FEHLER: $KATALOG fehlt." >&2; exit 1; }
command -v curl >/dev/null || { echo "FEHLER: curl fehlt." >&2; exit 1; }

ZEILEN="$(python3 - "$KATALOG" <<'PYEOF'
import json, sys
for e in json.load(open(sys.argv[1], encoding="utf-8")):
    print(f"{e['slug']}\t{e['icon']}\t{e['port']}")
PYEOF
)"

OK=0; AUS=0
printf '%-3s %-26s %-6s %s\n' "" "Rolle" "Port" "Status"
while IFS=$'\t' read -r SLUG ICON PORT; do
  [ -n "$SLUG" ] || continue
  URL="http://$HOST:$PORT/health"
  if ANTWORT="$(curl -sS --max-time "$TIMEOUT" "$URL" 2>/dev/null)"; then
    if printf '%s' "$ANTWORT" | grep -q '"status"'; then
      STATUS="läuft"; OK=$((OK+1))
    else
      STATUS="antwortet, aber unerwartet: ${ANTWORT:0:60}"; AUS=$((AUS+1))
    fi
  else
    STATUS="aus"; AUS=$((AUS+1))
  fi
  printf '%-3s %-26s %-6s %s\n' "$ICON" "$SLUG" "$PORT" "$STATUS"
done <<< "$ZEILEN"
echo
echo "läuft: $OK  aus: $AUS"
[ "$AUS" -eq 0 ]
