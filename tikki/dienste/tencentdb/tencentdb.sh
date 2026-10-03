#!/usr/bin/env bash
# Tikki – TencentDB Agent Memory als eigener Dienst: eine Instanz je Mensch, eine fürs System.
#
# Vier Schichten Gedächtnis (L0 Gespräch → L1 Fakten → L2 Szenen → L3 Persona) aus
# TencentCloud/TencentDB-Agent-Memory in einem festgenagelten Stand. Jede Instanz ist ein
# eigener Container mit eigenem Datenordner und eigenem Schlüssel, nur auf 127.0.0.1:
#   system          Port 8420   alles Wissen im System (eingespielte Dokumente, alle Räume)
#   <mensch>        Port 8421…  die Projekte und Gespräche genau eines Menschen
# Der Gateway selbst trennt keine Mandanten – deshalb ein Prozess je Mensch.
#
# Das Skript trägt jede Instanz in ~/.tikki/gedaechtnis.json ein; das Tikki-Plugin
# „gedaechtnis“ schreibt dann jede Runde hinein und schlägt dort nach.
#
# Verwendung:
#   tikki/dienste/tencentdb/tencentdb.sh start system
#   tikki/dienste/tencentdb/tencentdb.sh start <mensch>        (z. B. thorsten)
#   tikki/dienste/tencentdb/tencentdb.sh stop <instanz> | status | liste | update | logs <instanz>
#
# Umgebung (nie ins Repo):
#   XAI_API_KEY       Das Gedächtnis zieht Fakten und Szenen mit Grok heraus (OpenAI-kompatibel).
#   TIKKI_DIENSTE     Ablage der Dienste (Standard: ~/.tikki/dienste).
#   TIKKI_HOME        Tikkis Ordner mit gedaechtnis.json (Standard: ~/.tikki).
set -euo pipefail

TDAI_REPO="https://github.com/TencentCloud/TencentDB-Agent-Memory.git"
TDAI_SHA="29bb8dffa9b11617316d50f21d7a8af9f47240be"
BILD="tikki-tencentdb:${TDAI_SHA:0:12}"
DIENSTE="${TIKKI_DIENSTE:-$HOME/.tikki/dienste}"
TIKKI_ORDNER="${TIKKI_HOME:-$HOME/.tikki}"
ZIEL="$DIENSTE/tencentdb"
QUELLE="$ZIEL/quelle"

befehl="${1:-status}"
instanz="${2:-}"

brauche() { command -v "$1" >/dev/null 2>&1 || { echo "FEHLER: $1 fehlt." >&2; exit 1; }; }
gueltig() { [[ "$1" =~ ^[a-z0-9][a-z0-9_-]{0,31}$ ]] || { echo "FEHLER: Instanzname '$1' (klein, a-z0-9_-)." >&2; exit 2; }; }

# Eintrag in gedaechtnis.json: port lesen oder neu vergeben, url und Schlüsseldatei setzen.
eintragen() {
  python3 - "$TIKKI_ORDNER/gedaechtnis.json" "$1" "$ZIEL/$1.key" <<'PY'
import json, sys
from pathlib import Path
pfad, name, schluessel = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
pfad.parent.mkdir(parents=True, exist_ok=True)
cfg = json.loads(pfad.read_text(encoding="utf-8")) if pfad.exists() else {}
t = cfg.setdefault("tencent", {})
menschen = t.setdefault("nutzer", {})
belegt = {int(e["url"].rsplit(":", 1)[1]) for e in [t.get("system") or {}, *menschen.values()] if e.get("url")}
alt = (t.get("system") if name == "system" else menschen.get(name)) or {}
if alt.get("url"):
    port = int(alt["url"].rsplit(":", 1)[1])
elif name == "system":
    port = 8420
else:
    port = next(p for p in range(8421, 8999) if p not in belegt)
eintrag = {"url": f"http://127.0.0.1:{port}", "schluessel_datei": schluessel}
if name == "system":
    t["system"] = eintrag
else:
    menschen[name] = eintrag
    cfg.setdefault("nutzer", name)
pfad.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(port)
PY
}

bauen() {
  brauche git; brauche docker
  mkdir -p "$ZIEL"
  if [ ! -d "$QUELLE/.git" ]; then
    echo "Hole TencentDB Agent Memory nach $QUELLE …"
    git clone --quiet "$TDAI_REPO" "$QUELLE"
  fi
  git -C "$QUELLE" fetch --quiet origin
  git -C "$QUELLE" checkout --quiet "$TDAI_SHA"
  if ! docker image inspect "$BILD" >/dev/null 2>&1; then
    echo "Baue $BILD …"
    docker build -q -t "$BILD" "$QUELLE/MemoryCore" >/dev/null
  fi
}

konfig() {
  # Einzelplatz-Vorlage, nur Sprache der Volltextsuche auf lateinische Schrift umgestellt.
  sed 's/language: "zh"/language: "en"/' "$QUELLE/MemoryCore/tdai-gateway.standalone.yaml" > "$ZIEL/$1.yaml"
}

starten() {
  local name="$1" port
  gueltig "$name"
  bauen
  konfig "$name"
  [ -s "$ZIEL/$name.key" ] || { umask 077; openssl rand -hex 24 > "$ZIEL/$name.key"; }
  chmod 600 "$ZIEL/$name.key"
  mkdir -p "$ZIEL/daten/$name"
  port="$(eintragen "$name")"
  [ -n "${XAI_API_KEY:-}" ] || echo "Hinweis: XAI_API_KEY fehlt – Fakten und Szenen werden erst mit Schlüssel herausgezogen." >&2
  docker rm -f "tikki-tencent-$name" >/dev/null 2>&1 || true
  docker run -d --name "tikki-tencent-$name" --restart unless-stopped \
    -p "127.0.0.1:$port:8420" \
    -v "$ZIEL/$name.yaml:/data/config/tdai-gateway.yaml:ro" \
    -v "$ZIEL/daten/$name:/data/tdai-memory" \
    -e TDAI_GATEWAY_API_KEY="$(cat "$ZIEL/$name.key")" \
    -e TDAI_LLM_API_KEY="${XAI_API_KEY:-}" \
    -e TDAI_LLM_BASE_URL="https://api.x.ai/v1" \
    -e TDAI_LLM_MODEL="grok-4.7" \
    "$BILD" >/dev/null
  for _ in $(seq 1 60); do
    curl -sf --max-time 2 "http://127.0.0.1:$port/health" >/dev/null 2>&1 && break
    sleep 2
  done
  pruefen "$name" "$port"
}

pruefen() {
  if curl -sf --max-time 3 "http://127.0.0.1:$2/health" >/dev/null 2>&1; then
    echo "TencentDB $1 läuft: http://127.0.0.1:$2"
  else
    echo "TencentDB $1 ist aus (http://127.0.0.1:$2 antwortet nicht)."
    return 1
  fi
}

liste() {
  python3 - "$TIKKI_ORDNER/gedaechtnis.json" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
cfg = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
t = cfg.get("tencent") or {}
if (t.get("system") or {}).get("url"):
    print("system", t["system"]["url"].rsplit(":", 1)[1])
for name, e in sorted((t.get("nutzer") or {}).items()):
    print(name, e["url"].rsplit(":", 1)[1])
PY
}

case "$befehl" in
  start) [ -n "$instanz" ] || { echo "Welche Instanz? system oder ein Mensch." >&2; exit 2; }; starten "$instanz" ;;
  stop) brauche docker; gueltig "$instanz"; docker rm -f "tikki-tencent-$instanz" >/dev/null && echo "TencentDB $instanz gestoppt." ;;
  status|liste)
    fehler=0
    while read -r name port; do [ -n "$name" ] && { pruefen "$name" "$port" || fehler=1; }; done < <(liste)
    exit $fehler ;;
  logs) brauche docker; gueltig "$instanz"; docker logs -f --tail=100 "tikki-tencent-$instanz" ;;
  update) bauen; echo "TencentDB steht auf $TDAI_SHA. Instanzen neu starten: $0 start <instanz>" ;;
  -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) echo "Unbekannter Befehl: $befehl (start|stop|status|liste|logs|update)" >&2; exit 2 ;;
esac
