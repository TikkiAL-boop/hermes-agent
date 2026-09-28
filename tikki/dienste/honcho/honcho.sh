#!/usr/bin/env bash
# Tikki – Honcho als eigener Dienst auf dem Rechner (kein Cloud-Konto).
#
# Holt Honcho (plastic-labs/honcho) in einem festgenagelten Stand, schreibt die
# .env aus Tikkis Umgebung und startet API, Deriver, Postgres (pgvector) und Redis
# per Docker Compose. Alle Ports nur auf 127.0.0.1. Die Hermes-Profile zeigen mit
# baseUrl http://127.0.0.1:8000 darauf (tikki/hermes/vorlage-honcho.json); ein
# lokaler baseUrl braucht keinen HONCHO_API_KEY.
#
# Verwendung:
#   tikki/dienste/honcho/honcho.sh start|stop|status|logs|update
#
# Umgebung (nie ins Repo):
#   XAI_API_KEY                 Deriver und Dialektik laufen über xAI (OpenAI-kompatibel).
#   TIKKI_EMBEDDING_BASE_URL    OpenAI-kompatibler Embedding-Endpunkt (z. B. lokal).
#   TIKKI_EMBEDDING_API_KEY     Schlüssel dafür (leer bei lokalem Dienst).
#   TIKKI_EMBEDDING_MODEL       Modellname des Embedding-Endpunkts.
#   Ohne Embedding-Endpunkt: EMBED_MESSAGES=false (Honcho läuft, Volltext statt Vektorsuche).
#   TIKKI_DIENSTE               Ablage der Dienste (Standard: ~/.tikki/dienste).
set -euo pipefail

HONCHO_REPO="https://github.com/plastic-labs/honcho.git"
HONCHO_SHA="79cb31645f4efdef626d1bd9316a648adb5da89b"   # v3.2.1
HONCHO_URL="http://127.0.0.1:8000"
DIENSTE="${TIKKI_DIENSTE:-$HOME/.tikki/dienste}"
ZIEL="$DIENSTE/honcho"

befehl="${1:-status}"

brauche() { command -v "$1" >/dev/null 2>&1 || { echo "FEHLER: $1 fehlt." >&2; exit 1; }; }

holen() {
  brauche git
  mkdir -p "$DIENSTE"
  if [ ! -d "$ZIEL/.git" ]; then
    echo "Hole Honcho nach $ZIEL …"
    git clone --quiet "$HONCHO_REPO" "$ZIEL"
  fi
  git -C "$ZIEL" fetch --quiet origin
  git -C "$ZIEL" checkout --quiet "$HONCHO_SHA"
  [ -f "$ZIEL/docker-compose.yml" ] || cp "$ZIEL/docker-compose.yml.example" "$ZIEL/docker-compose.yml"
  [ -f "$ZIEL/.env" ] || cp "$ZIEL/.env.template" "$ZIEL/.env"
}

# Schlüssel in .env setzen oder ersetzen (eine Zeile je Schlüssel).
setze() {
  local key="$1" wert="$2" datei="$ZIEL/.env"
  if grep -q "^${key}=" "$datei"; then
    sed -i.bak "s|^${key}=.*|${key}=${wert}|" "$datei" && rm -f "$datei.bak"
  else
    printf '%s=%s\n' "$key" "$wert" >> "$datei"
  fi
}

umgebung() {
  setze AUTH_USE_AUTH false
  setze SENTRY_ENABLED false
  if [ -n "${XAI_API_KEY:-}" ]; then
    # Honcho spricht das OpenAI-Protokoll; xAI ist dazu kompatibel.
    setze LLM_OPENAI_API_KEY "$XAI_API_KEY"
    setze MODEL_CONFIG__OVERRIDES__BASE_URL "https://api.x.ai/v1"
    setze DERIVER_MODEL_CONFIG__TRANSPORT openai
    setze DERIVER_MODEL_CONFIG__MODEL "grok-4.7"
    for stufe in minimal low medium high max; do
      setze "DIALECTIC_LEVELS__${stufe}__MODEL_CONFIG__MODEL" "grok-4.7"
    done
  else
    echo "Hinweis: XAI_API_KEY nicht gesetzt – Deriver und Dialektik bleiben unkonfiguriert." >&2
  fi
  if [ -n "${TIKKI_EMBEDDING_BASE_URL:-}" ]; then
    setze EMBED_MESSAGES true
    setze EMBEDDING_MODEL_CONFIG__TRANSPORT openai
    setze EMBEDDING_MODEL_CONFIG__OVERRIDES__BASE_URL "$TIKKI_EMBEDDING_BASE_URL"
    [ -n "${TIKKI_EMBEDDING_MODEL:-}" ] && setze EMBEDDING_MODEL_CONFIG__MODEL "$TIKKI_EMBEDDING_MODEL"
  else
    # xAI bietet keine Embeddings; ohne eigenen Endpunkt läuft Honcho ohne Vektorsuche.
    setze EMBED_MESSAGES false
  fi
  chmod 600 "$ZIEL/.env"
}

status() {
  if antwort="$(curl -sS --max-time 3 "$HONCHO_URL/health" 2>/dev/null)"; then
    echo "Honcho läuft: $HONCHO_URL ($antwort)"
    return 0
  fi
  echo "Honcho ist aus ($HONCHO_URL antwortet nicht)."
  return 1
}

case "$befehl" in
  start)
    brauche docker
    holen
    umgebung
    (cd "$ZIEL" && docker compose up -d --build)
    for _ in $(seq 1 60); do
      if curl -sf --max-time 2 "$HONCHO_URL/health" >/dev/null 2>&1; then break; fi
      sleep 2
    done
    status
    ;;
  stop)
    brauche docker
    [ -d "$ZIEL" ] && (cd "$ZIEL" && docker compose down)
    ;;
  status) status ;;
  logs)
    brauche docker
    (cd "$ZIEL" && docker compose logs -f --tail=100)
    ;;
  update)
    holen
    echo "Honcho steht auf $HONCHO_SHA. Zum Übernehmen: $0 start"
    ;;
  -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) echo "Unbekannter Befehl: $befehl (start|stop|status|logs|update)" >&2; exit 2 ;;
esac
