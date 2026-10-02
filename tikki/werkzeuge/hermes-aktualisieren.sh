#!/usr/bin/env bash
# Tikki – eine neue Hermes-Version übernehmen, ohne Tikki zu verlieren.
#
# Tikki ändert den Hermes-Kern (Python) nicht. Alles Eigene liegt in tikki/, in
# apps/desktop/src/app/areas/, apps/desktop/src/assets/tikki/ und tests/tikki/; dazu eine
# kurze Liste kleiner Eingriffe in die Desktop-App (HANDOVER.md, Abschnitt „Update“).
# Deshalb ist ein Update ein normaler Merge von Hermes' main in tikki-app – nie ein Rebase,
# nie ein Force-Push – und danach die Tikki-Prüfungen.
#
# Verwendung:
#   tikki/werkzeuge/hermes-aktualisieren.sh [--von <git-url oder remote>] [--nur-pruefen]
#     --von          woher Hermes kommt (Standard: https://github.com/NousResearch/hermes-agent.git)
#     --nur-pruefen  nichts mergen, nur die Tikki-Prüfungen laufen lassen
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HIER/../.." && pwd)"
QUELLE="https://github.com/NousResearch/hermes-agent.git"
NUR_PRUEFEN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --von) shift; QUELLE="${1:?--von braucht eine Adresse}" ;;
    --nur-pruefen) NUR_PRUEFEN=1 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done
cd "$REPO"

pruefen() {
  echo "== Tikki-Prüfungen"
  local py="${HERMES_PYTHON:-$REPO/.venv/bin/python}"
  if [ -x "$py" ]; then
    HERMES_PYTHON="$py" scripts/run_tests.sh tests/tikki/ | grep -E "Summary|✗"
  else
    echo "  (kein Test-Python unter $py – Python-Tests übersprungen; siehe AGENTS.md, Testing)"
  fi
  (cd apps/desktop && npx tsc --noEmit -p . && npx eslint src/ electron/ --quiet && npx vitest run src/app/areas src/store/session-states-eviction.test.ts | tail -4)
  tikki/werkzeuge/rollen-einrichten.sh --dry-run | tail -3
}

if [ "$NUR_PRUEFEN" = 1 ]; then pruefen; exit 0; fi

zweig="$(git rev-parse --abbrev-ref HEAD)"
[ "$zweig" = "tikki-app" ] || { echo "FEHLER: auf Zweig $zweig, erwartet tikki-app." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "FEHLER: ungesicherte Änderungen – erst committen." >&2; exit 1; }

if git remote get-url "$QUELLE" >/dev/null 2>&1; then
  remote="$QUELLE"
else
  git remote get-url hermes-upstream >/dev/null 2>&1 || git remote add hermes-upstream "$QUELLE"
  git remote set-url hermes-upstream "$QUELLE"
  remote="hermes-upstream"
fi
echo "== Hole Hermes ($remote/main)"
git fetch --quiet "$remote" main
neu="$(git rev-list --count HEAD.."$remote/main")"
if [ "$neu" = 0 ]; then echo "Hermes ist schon auf dem neuesten Stand."; pruefen; exit 0; fi
echo "  $neu neue Hermes-Commits"

if ! git merge --no-edit -m "Tikki: Hermes-Update übernommen ($remote/main)" "$remote/main"; then
  echo
  echo "Konflikte – so auflösen:"
  echo "  • Dateien unter tikki/, apps/desktop/src/app/areas/, assets/tikki/, tests/tikki/ gehören Tikki:"
  echo "      git checkout --ours <datei>"
  echo "  • Alle anderen gehören Hermes; nur die Eingriffe aus HANDOVER.md („Update“) von Hand"
  echo "    wieder einsetzen. Lockfiles nie von Hand: npm install bzw. hermes pm lock."
  echo "  • Danach: git add … && git commit, dann dieses Skript mit --nur-pruefen."
  git diff --name-only --diff-filter=U | sed 's/^/    Konflikt: /'
  exit 1
fi
basis_schreiben() {
  # Der Update-Wächter der App vergleicht gegen diesen Stand.
  local sha datum
  sha="$(git rev-parse "$remote/main")"; datum="$(git log -1 --format=%cI "$sha")"
  python3 - "$sha" "$datum" <<'PY'
import json, sys
from pathlib import Path
p = Path("tikki/hermes-basis.json")
d = json.loads(p.read_text(encoding="utf-8"))
d["commit"], d["datum"] = sys.argv[1], sys.argv[2]
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
  git add tikki/hermes-basis.json
  git commit -q -m "Tikki: Hermes-Basis auf $sha gesetzt" || true
}
basis_schreiben
pruefen
echo
echo "Update übernommen. Zum Veröffentlichen: git push origin tikki-app"
