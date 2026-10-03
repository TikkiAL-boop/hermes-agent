#!/usr/bin/env bash
# Tikki umziehen: alles, was Tikki ausmacht, in EIN Archiv packen und auf dem neuen Rechner auspacken.
#
#   Alter Rechner:   tikki/werkzeuge/umzug.sh packen [ZIEL.tar.gz] [--ohne-schluessel] [--ohne-code]
#   Neuer Rechner:   tikki/werkzeuge/umzug.sh auspacken ARCHIV.tar.gz [--ueberschreiben]
#                    danach: ~/.hermes/hermes-agent/tikki/installieren.sh
#
# Was ins Archiv kommt
#   code/      Git-Bundle des Zweigs tikki-app (volle Historie) + Quell-Schnappschuss (git archive)
#              + stand.txt (Commit, Remote). Online reicht `git clone -b tikki-app …`; das Bundle
#              ist der Weg ohne Netz.
#   zustand/   Persönlicher Zustand außerhalb des Repos: Hermes-Wurzel (config.yaml, .env, SOUL.md,
#              Räume in shared-state.db, Kanban, eigene Skills, Cron der Wurzel) und je Rollenprofil
#              config.yaml, .env, SOUL.md, profile.yaml, honcho.json, memories/, skills/, cron/,
#              sessions/, state.db, projects.db, plans/, workspace/ – ohne Logs, Caches, Sandkästen,
#              Plugin-Symlinks (richtet rollen-einrichten.sh neu ein). Dazu ~/.tikki (Briefing-Stempel,
#              Modellsuche, RAG-Gedächtnis) und die App-Daten (Tikki-Postfachkonto, Fensterlage).
#   handover/  HANDOVER.md, PRUEFBERICHT, README, UMZUG.md, die zwei Einseiter-PDFs.
#   MANIFEST   Herkunft (alter HOME-Pfad, Hermes-Wurzel, Rechner, Datum) und Prüfsummen.
#
# Schlüssel (.env-Dateien) sind im Archiv, außer mit --ohne-schluessel. Das Archiv bekommt Rechte
# 600; nur per USB/AirDrop/SSH übertragen, auf dem neuen Rechner nach dem Auspacken löschen.
# Lokale Modelle (zig GB) kommen nicht mit – die findet die App auf dem neuen Rechner selbst,
# sobald sie dort liegen (hermes pa modelle).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZWEIG="tikki-app"
REMOTE_URL="https://github.com/TikkiAL-boop/hermes-agent.git"
HERMES_WURZEL="${HERMES_HOME:-$HOME/.hermes}"
HERMES_WURZEL="${HERMES_WURZEL%/profiles/*}"   # ein Profil als HERMES_HOME → zur Wurzel
TIKKI_WURZEL="${TIKKI_HOME:-$HOME/.tikki}"

gut()  { printf '  \033[32m✓\033[0m %s\n' "$*"; }
info() { printf '  · %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
abbruch() { printf '\033[31mFEHLER:\033[0m %s\n' "$*" >&2; exit 1; }

app_daten() {
  case "$(uname -s)" in
    Darwin) echo "$HOME/Library/Application Support/Tikki" ;;
    *)      echo "${XDG_CONFIG_HOME:-$HOME/.config}/Tikki" ;;
  esac
}

# Profil-Inhalte, die persönlich sind (alles andere baut Hermes/rollen-einrichten neu).
PROFIL_TEILE=(config.yaml .env SOUL.md profile.yaml honcho.json memories skills cron sessions state.db state.db-wal state.db-shm projects.db plans workspace)
WURZEL_TEILE=(config.yaml .env SOUL.md active_profile shared-state.db shared-state.db-wal shared-state.db-shm kanban.db skills cron memories sessions state.db state.db-wal state.db-shm)

packen() {
  local ziel="" ohne_schluessel=0 ohne_code=0
  for a in "$@"; do
    case "$a" in
      --ohne-schluessel) ohne_schluessel=1 ;;
      --ohne-code) ohne_code=1 ;;
      -*) abbruch "unbekannte Option $a" ;;
      *) ziel="$a" ;;
    esac
  done
  local datum; datum="$(date +%Y-%m-%d-%H%M)"
  if [ -z "$ziel" ]; then
    if [ -d "$HOME/Desktop" ]; then ziel="$HOME/Desktop/Tikki-Umzug-$datum.tar.gz"; else ziel="$PWD/Tikki-Umzug-$datum.tar.gz"; fi
  fi
  [ -d "$HERMES_WURZEL" ] || abbruch "Hermes-Wurzel $HERMES_WURZEL fehlt – hier läuft kein Tikki."
  local arbeit; arbeit="$(mktemp -d)"; trap "rm -rf '$arbeit'" EXIT
  local paket="$arbeit/Tikki-Umzug"; mkdir -p "$paket/code" "$paket/zustand" "$paket/handover"
  echo "Tikki packen → $ziel"

  # Code
  if [ "$ohne_code" = 0 ]; then
    local sha; sha="$(git -C "$REPO" rev-parse "$ZWEIG" 2>/dev/null || git -C "$REPO" rev-parse HEAD)"
    { echo "zweig=$ZWEIG"; echo "commit=$sha"; echo "remote=$REMOTE_URL"; echo "online: git clone -b $ZWEIG $REMOTE_URL ~/.hermes/hermes-agent"; } > "$paket/code/stand.txt"
    # Ein flacher Klon (z. B. aus einer Cloud-Sitzung) liefert ein Bundle, das sich nicht klonen lässt
    # („remote did not send all necessary objects“) – dann lieber keins.
    if [ "$(git -C "$REPO" rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
      warn "flacher Klon – kein Git-Bundle; auf dem neuen Rechner online klonen (git fetch --unshallow hier würde es ermöglichen)"
    elif git -C "$REPO" bundle create "$paket/code/tikki-app.bundle" "$ZWEIG" >/dev/null 2>&1 \
         && git -C "$REPO" bundle verify "$paket/code/tikki-app.bundle" >/dev/null 2>&1; then
      gut "Git-Bundle mit voller Historie (code/tikki-app.bundle)"
    else
      rm -f "$paket/code/tikki-app.bundle"
      warn "kein vollständiges Bundle möglich – nur Schnappschuss; auf dem neuen Rechner online klonen"
    fi
    git -C "$REPO" archive --format=tar.gz --prefix=hermes-agent/ -o "$paket/code/quelle.tar.gz" "$ZWEIG" 2>/dev/null \
      || git -C "$REPO" archive --format=tar.gz --prefix=hermes-agent/ -o "$paket/code/quelle.tar.gz" HEAD
    gut "Quell-Schnappschuss (code/quelle.tar.gz, Stand $sha)"
  fi

  # Zustand: Hermes-Wurzel + Profile
  local z="$paket/zustand/hermes"; mkdir -p "$z/profiles"
  for t in "${WURZEL_TEILE[@]}"; do
    [ -e "$HERMES_WURZEL/$t" ] || continue
    [ "$t" = .env ] && [ "$ohne_schluessel" = 1 ] && continue
    cp -a "$HERMES_WURZEL/$t" "$z/$t"
  done
  local n=0
  for p in "$HERMES_WURZEL"/profiles/*/; do
    [ -d "$p" ] || continue
    local slug; slug="$(basename "$p")"; mkdir -p "$z/profiles/$slug"
    for t in "${PROFIL_TEILE[@]}"; do
      [ -e "$p$t" ] || continue
      [ "$t" = .env ] && [ "$ohne_schluessel" = 1 ] && continue
      cp -a "$p$t" "$z/profiles/$slug/$t"
    done
    n=$((n+1))
  done
  gut "Hermes-Wurzel und $n Profile (ohne Logs, Caches, Plugin-Symlinks)"
  [ "$ohne_schluessel" = 1 ] && warn "Schlüssel (.env) NICHT im Archiv – auf dem neuen Rechner schluessel-einlesen.sh" || info "Schlüssel (.env) sind im Archiv – Archiv nach dem Umzug löschen"
  if [ -d "$TIKKI_WURZEL" ]; then cp -a "$TIKKI_WURZEL" "$paket/zustand/tikki"; gut "~/.tikki (Briefing, Modellsuche, RAG)"; fi
  local ad; ad="$(app_daten)"
  if [ -d "$ad" ]; then
    mkdir -p "$paket/zustand/app"
    (cd "$ad" && tar --exclude='Cache' --exclude='Code Cache' --exclude='GPUCache' --exclude='DawnCache' --exclude='DawnWebGPUCache' \
        --exclude='Service Worker' --exclude='blob_storage' --exclude='logs' -cf - .) | (cd "$paket/zustand/app" && tar -xf -)
    gut "App-Daten ($ad, ohne Caches)"
  fi

  # Handover-Mappe
  for d in HANDOVER.md PRUEFBERICHT-2026-10-02.md README.md UMZUG.md Tikki-auf-einer-Seite.pdf Tikki-stolz-auf-einer-Seite.pdf; do
    [ -f "$REPO/tikki/$d" ] && cp "$REPO/tikki/$d" "$paket/handover/"
  done
  cp "$REPO/tikki/werkzeuge/umzug.sh" "$paket/umzug.sh"
  gut "Handover-Mappe und dieses Skript"

  # Manifest
  {
    echo "tikki-umzug=1"; echo "datum=$datum"; echo "rechner=$(hostname)"; echo "system=$(uname -sm)"
    echo "alt_home=$HOME"; echo "alt_hermes=$HERMES_WURZEL"; echo "alt_tikki=$TIKKI_WURZEL"; echo "alt_repo=$REPO"
    echo "schluessel=$([ "$ohne_schluessel" = 1 ] && echo nein || echo ja)"
    echo "--- sha256"
    (cd "$paket" && find . -type f \( -name '*.bundle' -o -name '*.tar.gz' -o -name '*.db' \) -exec shasum -a 256 {} \; 2>/dev/null || true)
  } > "$paket/MANIFEST"
  (cd "$arbeit" && tar -czf "$ziel" Tikki-Umzug)
  chmod 600 "$ziel"
  echo
  gut "Fertig: $ziel ($(du -h "$ziel" | cut -f1))"
  echo "  Auf dem neuen Rechner:  bash <(tar -xOzf '$(basename "$ziel")' Tikki-Umzug/umzug.sh) auspacken '$(basename "$ziel")'"
}

auspacken() {
  local archiv="" ueber=0
  for a in "$@"; do
    case "$a" in
      --ueberschreiben) ueber=1 ;;
      -*) abbruch "unbekannte Option $a" ;;
      *) archiv="$a" ;;
    esac
  done
  [ -f "${archiv:-}" ] || abbruch "Archiv angeben: umzug.sh auspacken Tikki-Umzug-….tar.gz"
  local arbeit; arbeit="$(mktemp -d)"; trap "rm -rf '$arbeit'" EXIT
  tar -xzf "$archiv" -C "$arbeit"
  local paket="$arbeit/Tikki-Umzug"
  [ -f "$paket/MANIFEST" ] || abbruch "kein Tikki-Umzugsarchiv (MANIFEST fehlt)"
  local alt_home alt_hermes
  alt_home="$(sed -n 's/^alt_home=//p' "$paket/MANIFEST")"; alt_hermes="$(sed -n 's/^alt_hermes=//p' "$paket/MANIFEST")"
  local alt_repo; alt_repo="$(sed -n 's/^alt_repo=//p' "$paket/MANIFEST")"
  echo "Tikki auspacken von $(sed -n 's/^rechner=//p' "$paket/MANIFEST") ($(sed -n 's/^datum=//p' "$paket/MANIFEST")) → $HERMES_WURZEL"

  # Code
  local repo="$HERMES_WURZEL/hermes-agent"
  if [ -d "$repo/.git" ]; then
    info "Checkout $repo ist schon da – Code bleibt, Stand mit 'git pull' holen"
  elif [ -f "$paket/code/tikki-app.bundle" ] && { mkdir -p "$HERMES_WURZEL"; git clone -q -b "$ZWEIG" "$paket/code/tikki-app.bundle" "$repo" 2>/dev/null; }; then
    git -C "$repo" remote set-url origin "$REMOTE_URL"
    git -C "$repo" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
    gut "Code aus dem Bundle nach $repo (origin = GitHub)"
  elif [ -f "$paket/code/quelle.tar.gz" ]; then
    rm -rf "$repo"; mkdir -p "$HERMES_WURZEL"
    [ -f "$paket/code/tikki-app.bundle" ] && warn "Bundle unvollständig – versuche online"
    if git clone -q -b "$ZWEIG" "$REMOTE_URL" "$repo" 2>/dev/null; then
      gut "Code online geklont nach $repo"
    else
      tar -xzf "$paket/code/quelle.tar.gz" -C "$HERMES_WURZEL"
      warn "Kein Netz und kein Bundle: Quell-Schnappschuss ohne Git-Historie entpackt – vor dem Installer online 'git clone' nachholen"
    fi
  else
    warn "kein Code im Archiv (--ohne-code) – online: git clone -b $ZWEIG $REMOTE_URL $repo"
  fi

  # Zustand
  if [ -d "$HERMES_WURZEL/profiles" ] && [ -n "$(ls -A "$HERMES_WURZEL/profiles" 2>/dev/null)" ] && [ "$ueber" = 0 ]; then
    abbruch "$HERMES_WURZEL/profiles ist nicht leer – mit --ueberschreiben werden gleichnamige Dateien ersetzt"
  fi
  mkdir -p "$HERMES_WURZEL"
  if [ -d "$paket/zustand/hermes" ]; then
    (cd "$paket/zustand/hermes" && tar -cf - .) | (cd "$HERMES_WURZEL" && tar -xf -)
    gut "Hermes-Wurzel und Profile übernommen"
  fi
  if [ -d "$paket/zustand/tikki" ]; then
    mkdir -p "$TIKKI_WURZEL"; (cd "$paket/zustand/tikki" && tar -cf - .) | (cd "$TIKKI_WURZEL" && tar -xf -); gut "~/.tikki übernommen"
  fi
  if [ -d "$paket/zustand/app" ]; then
    local ad; ad="$(app_daten)"; mkdir -p "$ad"; (cd "$paket/zustand/app" && tar -cf - .) | (cd "$ad" && tar -xf -); gut "App-Daten nach $ad"
  fi
  # Alte absolute Pfade (anderer Benutzername / andere Wurzel) in Textdateien umschreiben.
  if { [ -n "$alt_home" ] && [ "$alt_home" != "$HOME" ]; } || { [ -n "$alt_repo" ] && [ "$alt_repo" != "$repo" ]; }; then
    local n=0
    while IFS= read -r -d '' f; do
      if grep -q -F -e "$alt_home" -e "$alt_repo" "$f" 2>/dev/null; then
        python3 - "$f" "$alt_repo" "$repo" "$alt_hermes" "$HERMES_WURZEL" "$alt_home" "$HOME" <<'PY'
import sys, pathlib
f, arepo, nrepo, ah, nh, ahome, nhome = sys.argv[1:]
p = pathlib.Path(f); t = p.read_text(encoding="utf-8", errors="surrogateescape")
for alt, neu in ((arepo, nrepo), (ah, nh), (ahome, nhome)):
    if alt and alt != neu:
        t = t.replace(alt, neu)
p.write_text(t, encoding="utf-8", errors="surrogateescape")
PY
        n=$((n+1))
      fi
    done < <(find "$HERMES_WURZEL" "$TIKKI_WURZEL" -maxdepth 4 -type f \( -name '*.yaml' -o -name '*.json' -o -name '*.sh' -o -name '*.md' -o -name '.env' \) -not -path '*/hermes-agent/*' -print0 2>/dev/null)
    gut "alte Pfade (Repo, Hermes-Wurzel, Home) in $n Dateien umgeschrieben"
  fi
  find "$HERMES_WURZEL" -name '.env' -exec chmod 600 {} \; 2>/dev/null || true
  echo
  echo "Weiter:"
  echo "  1. $repo/tikki/installieren.sh        # Kern, App, Rollen (Modelle bleiben), Gateway, Selbsttest"
  echo "  2. $repo/tikki/werkzeuge/selbsttest.py # bei Bedarf erneut"
  echo "  3. Archiv löschen (enthält Schlüssel): rm '$archiv'"
}

case "${1:-}" in
  packen) shift; packen "$@" ;;
  auspacken) shift; auspacken "$@" ;;
  *) sed -n '2,24p' "$0"; exit 1 ;;
esac
