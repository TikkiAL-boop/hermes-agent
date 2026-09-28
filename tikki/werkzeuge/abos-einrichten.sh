#!/usr/bin/env bash
# Tikki – Abos statt Schlüssel: Claude, Codex (ChatGPT), Gemini, Grok Build, NotebookLM.
#
# Die Familie hat Abos, die ohne Zusatzkosten nutzbar sind. Zwei Wege führen dahin:
#   1. Als Modell einer Rolle (Hermes meldet sich per OAuth an):
#        anthropic      Claude-Abo (Claude Code: `claude setup-token` oder die Anmeldung
#                       aus ~/.claude/.credentials.json, die Hermes mitliest)
#        openai-codex   ChatGPT-/Codex-Abo (Browser-Anmeldung)
#        xai-oauth      SuperGrok-Abo (Browser-Anmeldung)
#   2. Als Werkzeug im Raum: Bots geben Aufgaben an die Kommandozeilen der Abos ab
#      (Skills claude-code, codex, grok, gemini-cli, notebooklm).
# Perplexity hat keine Kommandozeile ohne Zusatzkosten und bleibt außen vor.
#
# Verwendung:
#   tikki/werkzeuge/abos-einrichten.sh            prüfen, was fehlt (ändert nichts)
#   tikki/werkzeuge/abos-einrichten.sh --anmelden  fehlende Anmeldungen der Rollen-Modelle
#                                                  nacheinander im Browser durchführen
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KATALOG="$HIER/../rollen/KATALOG.json"
HERMES_BIN="$(command -v hermes || true)"
ANMELDEN=0
[ "${1:-}" = "--anmelden" ] && ANMELDEN=1
[ -n "$HERMES_BIN" ] || { echo "FEHLER: hermes nicht gefunden." >&2; exit 1; }

echo "Tikki – Abos"
echo
echo "== Kommandozeilen der Abos (für Bots im Raum)"
pruefe_cli() {
  local name="$1" befehl="$2" einrichten="$3"
  if command -v "$befehl" >/dev/null 2>&1; then
    printf '  ✓ %-12s %s\n' "$name" "$("$befehl" --version 2>/dev/null | head -1)"
  else
    printf '  ✗ %-12s fehlt – %s\n' "$name" "$einrichten"
  fi
}
pruefe_cli "Claude Code" claude "npm install -g @anthropic-ai/claude-code, dann: claude (einmal anmelden)"
pruefe_cli "Codex"       codex  "npm install -g @openai/codex, dann: codex login"
pruefe_cli "Gemini"      gemini "npm install -g @google/gemini-cli, dann: gemini (Login with Google)"
pruefe_cli "Grok Build"  grok   "siehe https://docs.x.ai/build/overview, dann: grok login"
echo "  · NotebookLM   ohne Kommandozeile: Bots nutzen den Browser mit dem angemeldeten Google-Konto"

echo
echo "== Skills für die Abos (gemeinsame Bibliothek im Profil openclaw)"
PROFILE="$("$HERMES_BIN" profile list 2>/dev/null || true)"
if ! grep -qw "openclaw" <<< "$PROFILE"; then
  "$HERMES_BIN" profile create openclaw --no-alias --no-skills \
    --description "Tikki: OpenClaw-Skill-Bibliothek für alle Rollen" >/dev/null
  echo "  Profil openclaw angelegt"
fi
SKILLS="$("$HERMES_BIN" -p openclaw skills list 2>/dev/null || true)"
if grep -q "grok" <<< "$SKILLS"; then
  echo "  ✓ grok (Grok Build)"
else
  "$HERMES_BIN" -p openclaw skills install official/autonomous-ai-agents/grok --yes >/dev/null && echo "  ✓ grok installiert"
fi
echo "  ✓ claude-code, codex (aus dem Repo), gemini-cli, notebooklm, openclaw-skills (tikki/skills)"

echo
echo "== Anmeldungen der Rollen-Modelle"
python3 - "$KATALOG" <<'PY' | while IFS=$'\t' read -r slug anbieter; do
import json, sys
abos = {"anthropic", "openai-codex", "xai-oauth"}
for rolle in json.load(open(sys.argv[1], encoding="utf-8")):
    kette = [rolle["modell"]["primary"], rolle["modell"]["fallback"], *rolle["modell"].get("weitere", [])]
    for eintrag in kette:
        anbieter = eintrag.split("/", 1)[0]
        if anbieter in abos:
            print(f"{rolle['slug']}\t{anbieter}")
PY
  status="$("$HERMES_BIN" -p "$slug" auth status "$anbieter" 2>/dev/null | tail -1 || true)"
  if grep -qi "logged in\|active\|valid" <<< "$status" && ! grep -qi "logged out" <<< "$status"; then
    printf '  ✓ %-12s %s\n' "$slug" "$anbieter"
  elif [ "$ANMELDEN" = 1 ]; then
    echo "  → $slug: Anmeldung $anbieter (Browser öffnet sich) …"
    "$HERMES_BIN" -p "$slug" auth add "$anbieter" --type oauth < /dev/tty || echo "    Anmeldung $slug/$anbieter nicht abgeschlossen"
  else
    printf '  ✗ %-12s %s abgemeldet – mit --anmelden einrichten\n' "$slug" "$anbieter"
  fi
done
