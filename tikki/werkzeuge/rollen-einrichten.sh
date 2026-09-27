#!/usr/bin/env bash
# Tikki – richtet für jede Rolle aus rollen/KATALOG.json ein Hermes-Profil ein.
#
# Idempotent: vorhandene Profile werden nicht neu angelegt, SOUL.md und config.yaml
# werden auf den Stand des Repos gebracht. Mit --dry-run wird nur angezeigt, was
# passieren würde. Keine Geheimnisse werden geschrieben; Schlüssel kommen aus
# Umgebungsvariablen (siehe README.md).
#
# Verwendung:
#   tikki/werkzeuge/rollen-einrichten.sh [--dry-run] [--nur <slug>]
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIKKI="$(cd "$HIER/.." && pwd)"
REPO="$(cd "$TIKKI/.." && pwd)"
KATALOG="$TIKKI/rollen/KATALOG.json"
VORLAGE="$TIKKI/hermes/vorlage-rolle.yaml"
HERMES_HOME_BASIS="${HERMES_HOME_BASIS:-$HOME/.hermes}"
PROFILE_DIR="$HERMES_HOME_BASIS/profiles"

DRY_RUN=0
NUR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --nur) shift; NUR="${1:-}" ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

# Python: bevorzugt das Hermes-venv (dort liegt ruamel.yaml), sonst python3.
PY="python3"
for kandidat in "$REPO/.venv/bin/python" "$HERMES_HOME_BASIS/hermes-agent/venv/bin/python"; do
  if [ -x "$kandidat" ]; then PY="$kandidat"; break; fi
done
if ! "$PY" -c "import ruamel.yaml" 2>/dev/null; then
  echo "FEHLER: ruamel.yaml fehlt in $PY (Hermes-venv nicht gefunden?)." >&2
  exit 1
fi

# hermes-Befehl: im PATH oder im Repo-venv.
HERMES_BIN="$(command -v hermes || true)"
if [ -z "$HERMES_BIN" ] && [ -x "$REPO/.venv/bin/hermes" ]; then HERMES_BIN="$REPO/.venv/bin/hermes"; fi

[ -f "$KATALOG" ] || { echo "FEHLER: $KATALOG fehlt." >&2; exit 1; }
[ -f "$VORLAGE" ] || { echo "FEHLER: $VORLAGE fehlt." >&2; exit 1; }

sagen() { if [ "$DRY_RUN" = 1 ]; then echo "  [dry-run] $*"; else echo "  $*"; fi; }
tun()   { if [ "$DRY_RUN" = 1 ]; then echo "  [dry-run] $*"; else "$@"; fi; }

# Katalog als Zeilen: slug<TAB>name<TAB>port
ZEILEN="$("$PY" - "$KATALOG" <<'PYEOF'
import json, sys
for e in json.load(open(sys.argv[1], encoding="utf-8")):
    print(f"{e['slug']}\t{e['name']}\t{e['port']}")
PYEOF
)"

echo "Tikki – Rollen einrichten"
echo "Katalog:   $KATALOG"
echo "Profile:   $PROFILE_DIR"
echo "Hermes:    ${HERMES_BIN:-<nicht gefunden>}"
[ "$DRY_RUN" = 1 ] && echo "Modus:     dry-run (es wird nichts geändert)"
echo

ANGELEGT=0; AKTUALISIERT=0; UEBERSPRUNGEN=0; FEHLER=0
ZUSAMMENFASSUNG=""

while IFS=$'\t' read -r SLUG NAME PORT; do
  [ -n "$SLUG" ] || continue
  if [ -n "$NUR" ] && [ "$NUR" != "$SLUG" ]; then continue; fi
  echo "== $SLUG ($NAME, Port $PORT)"
  SOUL_QUELLE="$TIKKI/rollen/$SLUG/SOUL.md"
  ZIEL="$PROFILE_DIR/$SLUG"
  if [ ! -f "$SOUL_QUELLE" ]; then
    echo "  FEHLER: $SOUL_QUELLE fehlt – übersprungen." >&2
    FEHLER=$((FEHLER+1)); continue
  fi

  # 1) Profil anlegen, falls es fehlt (hermes profile create <slug> --no-alias --no-skills)
  STATUS="aktualisiert"
  if [ -d "$ZIEL" ]; then
    sagen "Profil vorhanden: $ZIEL"
  else
    STATUS="angelegt"
    if [ -n "$HERMES_BIN" ]; then
      tun "$HERMES_BIN" profile create "$SLUG" --no-alias --no-skills \
        --description "Tikki-Rolle: $NAME"
    else
      sagen "hermes nicht gefunden – lege Profilordner direkt an: $ZIEL"
      tun mkdir -p "$ZIEL"
    fi
    # Falls hermes den Ordner nicht angelegt hat (z. B. Fehler), nachlegen.
    if [ "$DRY_RUN" = 0 ] && [ ! -d "$ZIEL" ]; then
      echo "  FEHLER: Profilordner $ZIEL wurde nicht angelegt." >&2
      FEHLER=$((FEHLER+1)); continue
    fi
  fi

  # 2) SOUL.md kopieren (nur wenn abweichend)
  if [ "$DRY_RUN" = 1 ] || ! cmp -s "$SOUL_QUELLE" "$ZIEL/SOUL.md" 2>/dev/null; then
    tun cp "$SOUL_QUELLE" "$ZIEL/SOUL.md"
    sagen "SOUL.md -> $ZIEL/SOUL.md"
  else
    sagen "SOUL.md unverändert"
  fi

  # 3) config.yaml aus der Vorlage mit Port, Modellen und Werkzeugen der Rolle
  if [ "$DRY_RUN" = 1 ]; then
    "$PY" - "$KATALOG" "$VORLAGE" "$SLUG" "" <<'PYEOF'
import json, sys
from ruamel.yaml import YAML
katalog, vorlage, slug, ziel = sys.argv[1:5]
rolle = next(e for e in json.load(open(katalog, encoding="utf-8")) if e["slug"] == slug)
p_prov, p_model = rolle["modell"]["primary"].split("/", 1)
f_prov, f_model = rolle["modell"]["fallback"].split("/", 1)
print(f"  [dry-run] config.yaml: model={p_prov}/{p_model} fallback={f_prov}/{f_model} "
      f"port={rolle['port']} approvals={rolle['freigabe']} toolsets={rolle['werkzeuge']}")
PYEOF
  else
    "$PY" - "$KATALOG" "$VORLAGE" "$SLUG" "$ZIEL/config.yaml" <<'PYEOF'
import json, sys, os
from ruamel.yaml import YAML
katalog, vorlage, slug, ziel = sys.argv[1:5]
rolle = next(e for e in json.load(open(katalog, encoding="utf-8")) if e["slug"] == slug)
yaml = YAML()
yaml.preserve_quotes = True
with open(vorlage, encoding="utf-8") as f:
    cfg = yaml.load(f)

p_prov, p_model = rolle["modell"]["primary"].split("/", 1)
f_prov, f_model = rolle["modell"]["fallback"].split("/", 1)
cfg["model"]["provider"] = p_prov
cfg["model"]["default"] = p_model
cfg["fallback_providers"] = [{"provider": f_prov, "model": f_model}]
cfg.setdefault("approvals", {})["mode"] = rolle.get("freigabe", "smart")
werkzeuge = list(rolle.get("werkzeuge", []))
cfg.setdefault("platform_toolsets", {})
cfg["platform_toolsets"]["api_server"] = list(werkzeuge)
cfg["platform_toolsets"]["cli"] = list(werkzeuge)
api = cfg.setdefault("platforms", {}).setdefault("api_server", {})
api["enabled"] = True
api.setdefault("extra", {})["port"] = int(rolle["port"])
api["extra"].setdefault("host", "127.0.0.1")
# Delegation nur für Rollen, die sie im Katalog haben
if "delegation" not in werkzeuge:
    cfg.pop("delegation", None)

# Bestehende Datei nur überschreiben, wenn sich etwas ändert
neu_io = __import__("io").StringIO()
yaml.dump(cfg, neu_io)
neu = neu_io.getvalue()
alt = open(ziel, encoding="utf-8").read() if os.path.exists(ziel) else None
if alt == neu:
    print("  config.yaml unverändert")
else:
    tmp = ziel + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(neu)
    os.replace(tmp, ziel)
    print(f"  config.yaml geschrieben: {ziel}")
PYEOF
  fi

  # 4) .env-Hinweis (wird nie vom Skript befüllt)
  if [ "$DRY_RUN" = 0 ] && [ ! -f "$ZIEL/.env" ]; then
    printf '# Tikki-Rolle %s – Schlüssel hier eintragen (Datei bleibt lokal, nie ins Repo)\n# API_SERVER_KEY=\n# XAI_API_KEY=\n# CURSOR_API_KEY=\n' "$SLUG" > "$ZIEL/.env"
    chmod 600 "$ZIEL/.env"
    sagen ".env-Vorlage angelegt (ohne Werte): $ZIEL/.env"
  fi

  case "$STATUS" in
    angelegt) ANGELEGT=$((ANGELEGT+1)) ;;
    *) AKTUALISIERT=$((AKTUALISIERT+1)) ;;
  esac
  ZUSAMMENFASSUNG+="$(printf '%-26s %-6s %s\n' "$SLUG" "$PORT" "$STATUS")"$'\n'
done <<< "$ZEILEN"

echo
echo "Zusammenfassung"
printf '%-26s %-6s %s\n' "Rolle" "Port" "Status"
printf '%s' "$ZUSAMMENFASSUNG"
echo
echo "angelegt: $ANGELEGT  aktualisiert: $AKTUALISIERT  Fehler: $FEHLER"
if [ "$FEHLER" -gt 0 ]; then exit 1; fi
if [ "$DRY_RUN" = 0 ]; then
  echo
  echo "Nächste Schritte:"
  echo "  1. XAI_API_KEY, CURSOR_API_KEY und je Profil API_SERVER_KEY setzen (Umgebung oder ~/.hermes/profiles/<slug>/.env)."
  echo "  2. Pro Rolle starten:  hermes -p <slug> gateway"
  echo "  3. Prüfen:             tikki/werkzeuge/rollen-status.sh"
fi
