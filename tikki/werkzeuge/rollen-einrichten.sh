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
VORLAGE_HONCHO="$TIKKI/hermes/vorlage-honcho.json"
HERMES_HOME_BASIS="${HERMES_HOME_BASIS:-$HOME/.hermes}"
PROFILE_DIR="$HERMES_HOME_BASIS/profiles"
MODUL="tikki.werkzeuge.rollen_config"

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

[ -f "$KATALOG" ] || { echo "FEHLER: $KATALOG fehlt." >&2; exit 1; }
[ -f "$VORLAGE" ] || { echo "FEHLER: $VORLAGE fehlt." >&2; exit 1; }
[ -f "$VORLAGE_HONCHO" ] || { echo "FEHLER: $VORLAGE_HONCHO fehlt." >&2; exit 1; }

# hermes-Befehl: im PATH oder im Repo-venv.
HERMES_BIN="$(command -v hermes || true)"
if [ -z "$HERMES_BIN" ] && [ -x "$REPO/.venv/bin/hermes" ]; then HERMES_BIN="$REPO/.venv/bin/hermes"; fi

# Konfiguration erzeugt werkzeuge/rollen_config.py. Bevorzugt läuft es über den
# Hermes-Starter (`hermes --run-module`): der bringt das von Hermes verwaltete venv
# mit ruamel.yaml mit und kennt den aktuellen Konfigurationsstand, den er in jedes
# Profil stempelt. Sonst ein Python mit ruamel.yaml (Repo-venv, altes Installer-venv,
# python3); Hermes stempelt die Version dann beim ersten Start nach.
if [ -n "$HERMES_BIN" ] && [ "$("$HERMES_BIN" --run-module "$MODUL" --pruefen 2>/dev/null || true)" = "ok" ]; then
  KONFIG_LAUF="$HERMES_BIN (Hermes-Umgebung)"
  konfig() { "$HERMES_BIN" --run-module "$MODUL" "$@"; }
else
  PY="python3"
  for kandidat in "$REPO/.venv/bin/python" "$HERMES_HOME_BASIS/hermes-agent/venv/bin/python"; do
    if [ -x "$kandidat" ]; then PY="$kandidat"; break; fi
  done
  if ! "$PY" -c "import ruamel.yaml" 2>/dev/null; then
    echo "FEHLER: ruamel.yaml fehlt in $PY (Hermes-venv nicht gefunden?)." >&2
    exit 1
  fi
  KONFIG_LAUF="$PY"
  konfig() { "$PY" "$HIER/rollen_config.py" "$@"; }
fi

sagen() { if [ "$DRY_RUN" = 1 ]; then echo "  [dry-run] $*"; else echo "  $*"; fi; }

# Skript nach <profil>/scripts/ schreiben und den Hermes-Cronjob anlegen, falls er fehlt.
# skript_und_job <slug> <profilordner> <skriptname> <befehl> <jobname> <zeitplan> (--no-agent | <prompt>)
skript_und_job() {
  local slug="$1" ziel="$2" skript="$3" befehl="$4" job="$5" plan="$6" art="$7"
  if [ -z "$HERMES_BIN" ]; then sagen "hermes fehlt – Cronjob $job übersprungen"; return 0; fi
  local inhalt
  inhalt="$(printf '#!/usr/bin/env bash\n# Von tikki/werkzeuge/rollen-einrichten.sh erzeugt – nicht von Hand ändern.\n%s\n' "$befehl")"
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry-run] scripts/$skript + Cronjob $job ($plan)"; return 0
  fi
  mkdir -p "$ziel/scripts"
  if [ "$(cat "$ziel/scripts/$skript" 2>/dev/null)" != "$inhalt" ]; then
    printf '%s\n' "$inhalt" > "$ziel/scripts/$skript"
    chmod 700 "$ziel/scripts/$skript"
    sagen "scripts/$skript geschrieben"
  fi
  # Erst einsammeln, dann suchen: grep -q in der Pipe beendet sie früh, und pipefail
  # wertet das abgebrochene cron list als Fehler – der Job würde doppelt angelegt.
  local jobs
  jobs="$("$HERMES_BIN" -p "$slug" cron list --all 2>/dev/null || true)"
  if grep -q -- "Name: *$job\$" <<< "$jobs"; then
    sagen "Cronjob $job vorhanden"
  elif [ "$art" = "--no-agent" ]; then
    "$HERMES_BIN" -p "$slug" cron create "$plan" --name "$job" --script "$skript" --no-agent --deliver local >/dev/null \
      && sagen "Cronjob $job angelegt ($plan, ohne Modell)"
  else
    "$HERMES_BIN" -p "$slug" cron create "$plan" "$art" --name "$job" --script "$skript" --deliver local >/dev/null \
      && sagen "Cronjob $job angelegt ($plan)"
  fi
}
tun()   { if [ "$DRY_RUN" = 1 ]; then echo "  [dry-run] $*"; else "$@"; fi; }

# Katalog als Zeilen: slug<TAB>name<TAB>port
ZEILEN="$(konfig zeilen "$KATALOG")"

echo "Tikki – Rollen einrichten"
echo "Katalog:   $KATALOG"
echo "Profile:   $PROFILE_DIR"
echo "Hermes:    ${HERMES_BIN:-<nicht gefunden>}"
echo "Konfig:    $KONFIG_LAUF"
[ "$DRY_RUN" = 1 ] && echo "Modus:     dry-run (es wird nichts geändert)"
echo

ANGELEGT=0; AKTUALISIERT=0; FEHLER=0
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
    konfig vorschau "$KATALOG" "$VORLAGE" "$SLUG"
  else
    konfig schreiben "$KATALOG" "$VORLAGE" "$SLUG" "$ZIEL/config.yaml"
  fi

  # 3b) honcho.json: Workspace tikki, AI-Peer = Rolle, eine Honcho-Sitzung je Suite
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry-run] honcho.json: workspace=tikki aiPeer=$SLUG sessionStrategy=per-session"
  else
    konfig honcho "$VORLAGE_HONCHO" "$SLUG" "$ZIEL/honcho.json"
  fi

  # 3c) Tikki-Plugin „gedaechtnis“ verlinken (config.yaml schaltet es unter plugins.enabled ein)
  if [ "$DRY_RUN" = 1 ]; then
    echo "  [dry-run] plugins/gedaechtnis -> $TIKKI/plugins/gedaechtnis"
  else
    mkdir -p "$ZIEL/plugins"
    if [ "$(readlink "$ZIEL/plugins/gedaechtnis" 2>/dev/null)" != "$TIKKI/plugins/gedaechtnis" ]; then
      rm -rf "$ZIEL/plugins/gedaechtnis"
      ln -s "$TIKKI/plugins/gedaechtnis" "$ZIEL/plugins/gedaechtnis"
      sagen "Plugin gedaechtnis verlinkt"
    fi
  fi

  # 3d) Dauerbetrieb: Takt der Suiten (raumleiter) und Rundgang des Wachhalters.
  #     Hermes-Cron führt nur Skripte aus ~/.hermes/profiles/<slug>/scripts/ aus.
  case "$SLUG" in
    raumleiter)
      skript_und_job "$SLUG" "$ZIEL" tikki-takt.sh \
        "exec \"$HERMES_BIN\" --run-module tikki.werkzeuge.suite_takt takt --hermes \"$HERMES_BIN\"" \
        tikki-takt "every 5m" --no-agent ;;
    wachhalter)
      skript_und_job "$SLUG" "$ZIEL" tikki-raumbericht.sh \
        "exec \"$HERMES_BIN\" --run-module tikki.werkzeuge.suite_takt bericht" \
        tikki-rundgang "every 15m" \
        "Rundgang: Oben steht der Raumbericht aller Suiten. Handle genau nach deinem SOUL und schließe mit dem RUNDGANG-Block." ;;
  esac

  # 4) .env-Hinweis (wird nie vom Skript befüllt)
  if [ "$DRY_RUN" = 0 ] && [ ! -f "$ZIEL/.env" ]; then
    printf '# Tikki-Rolle %s – Schlüssel hier eintragen (Datei bleibt lokal, nie ins Repo)\n# API_SERVER_KEY=\n# XAI_API_KEY=\n# CURSOR_API_KEY=\n# HONCHO_API_KEY=\n# LOKAL_API_KEY=lokal\n# CLAUDE_CODE_OAUTH_TOKEN=   (Claude-Abo: claude setup-token)\n' "$SLUG" > "$ZIEL/.env"
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
  echo "  1. XAI_API_KEY, CURSOR_API_KEY, HONCHO_API_KEY und je Profil API_SERVER_KEY setzen (Umgebung oder ~/.hermes/profiles/<slug>/.env)."
  echo "     Honcho-SDK einmal bereitstellen: hermes pm install --extra honcho"
  echo "  2. Pro Rolle starten:  hermes -p <slug> gateway   (als Dienst: hermes -p <slug> gateway install)"
  echo "     raumleiter und wachhalter tragen die Cronjobs tikki-takt und tikki-rundgang – ihr Gateway muss immer laufen."
  echo "  3. Prüfen:             tikki/werkzeuge/rollen-status.sh"
fi
