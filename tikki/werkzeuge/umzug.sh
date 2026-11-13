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
#              install_id – die Kennung, unter der die Räume diesem Rechner gehören –, Räume in
#              shared-state.db, Zustand des Taktgebers in tikki/, Kanban, eigene Skills, Cron der
#              Wurzel) und je Rollenprofil config.yaml samt Stempel tikki-rolle.json, .env, SOUL.md,
#              profile.yaml, honcho.json, memories/, skills/, cron/, sessions/, state.db,
#              projects.db, plans/, workspace/ – ohne Logs, Caches, Sandkästen, Plugin-Symlinks
#              (richtet rollen-einrichten.sh neu ein). Dazu ~/.tikki (Briefing-Stempel, Modellsuche,
#              RAG-Gedächtnis, TencentDB-Daten; ohne die Quellklone der Dienste) und die App-Daten
#              (Tikki-Postfachkonto, Fensterlage).
#   handover/  HANDOVER.md, PRUEFBERICHT, README, UMZUG.md, die zwei Einseiter-PDFs.
#   MANIFEST   Herkunft (alter HOME-Pfad, Hermes-Wurzel, Rechner, Datum) und Prüfsummen.
#
# Der alte Rechner wird mit dem Umzug stillgelegt: zwei Rechner mit derselben install_id würden
# dieselben Räume fahren. SQLite-Dateien kommen über die Backup-Schnittstelle ins Archiv (ein
# stimmiger Stand, auch wenn Gateway und Takt gerade schreiben).
#
# Schlüssel sind im Archiv, außer mit --ohne-schluessel: dann fehlen alle .env- und *.key-Dateien
# und die Geheimnisdateien der App (Postfach-Passwort, Gateway-Token). Das Archiv bekommt Rechte
# 600; nur per USB/AirDrop/SSH übertragen, auf dem neuen Rechner nach dem Auspacken löschen.
# Abo-Anmeldungen (auth.json) und lokale Modelle (zig GB) kommen nicht mit – auf dem neuen Rechner
# neu anmelden (abos-einrichten.sh --anmelden); Modelle findet die App dort selbst (hermes pa modelle).
set -euo pipefail
umask 077   # Arbeitsordner und Archiv tragen Schlüssel: von Anfang an nur für den Besitzer

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

# Profil-Inhalte, die persönlich sind (alles andere baut Hermes/rollen-einrichten neu). SQLite-
# Dateien stehen ohne -wal/-shm hier: db_sichern liefert einen stimmigen Stand in einer Datei.
PROFIL_TEILE=(config.yaml tikki-rolle.json .env SOUL.md profile.yaml honcho.json memories skills cron sessions state.db projects.db plans workspace)
WURZEL_TEILE=(config.yaml .env SOUL.md active_profile install_id shared-state.db tikki kanban.db skills cron memories sessions state.db)
# Geheimnisdateien in den App-Daten (apps/desktop/electron/main.ts): Postfach-Passwort, Gateway-Token.
APP_GEHEIM=(tikki-mail.json connection.json connections.json native-oauth-tokens.json)

# Eine SQLite-Datei über die Backup-Schnittstelle kopieren (liest auch, was noch im WAL steht).
db_sichern() {  # db_sichern QUELLE ZIEL
  python3 - "$1" "$2" <<'PY'
import pathlib, sqlite3, sys
quelle, ziel = sys.argv[1:]
src = sqlite3.connect(pathlib.Path(quelle).resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
dst = sqlite3.connect(ziel)
with dst:
    src.backup(dst)
dst.close()
src.close()
PY
}

# Jede SQLite-Datei einer Kopie durch ihr Backup aus dem Original ersetzen. cp kopiert .db, -wal
# und -shm nacheinander, während geschrieben wird: die Kopie kann zerrissen sein.
sqlite_nachziehen() {  # sqlite_nachziehen ORIGINAL KOPIE   (Datei oder Ordner)
  local original="$1" kopie="$2" f
  while IFS= read -r -d '' f; do
    if db_sichern "$original${f#"$kopie"}" "$f.neu" 2>/dev/null; then
      mv -f "$f.neu" "$f"
      rm -f "$f-wal" "$f-shm" "$f.neu-wal" "$f.neu-shm"
    else
      rm -f "$f.neu" "$f.neu-wal" "$f.neu-shm"
      warn "${f#"$kopie"}: kein SQLite-Backup möglich – roh kopiert (Dienst vorher stoppen ist sicherer)"
    fi
  done < <(find "$kopie" -type f \( -name '*.db' -o -name '*.sqlite' \) -print0)
}

uebernehmen() {  # uebernehmen QUELLE ZIEL   (Datei oder Ordner, mit stimmigen SQLite-Dateien)
  cp -a "$1" "$2"
  sqlite_nachziehen "$1" "$2"
}

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
  # Ein relatives Ziel gilt ab hier – gepackt wird später aus dem Arbeitsordner heraus.
  case "$ziel" in /*) ;; *) ziel="$PWD/$ziel" ;; esac
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
    elif [ -n "$(git -C "$REPO" config --get remote.origin.partialclonefilter 2>/dev/null)" ]; then
      # Teil-Klon (Cloud-Sitzung): pack-objects holt fehlende Objekte einzeln nach – dauert Stunden.
      warn "Teil-Klon (partialclonefilter) – kein Git-Bundle; vorher: git config --unset remote.origin.partialclonefilter && git fetch --refetch origin"
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
    uebernehmen "$HERMES_WURZEL/$t" "$z/$t"
  done
  local n=0
  for p in "$HERMES_WURZEL"/profiles/*/; do
    [ -d "$p" ] || continue
    local slug; slug="$(basename "$p")"; mkdir -p "$z/profiles/$slug"
    for t in "${PROFIL_TEILE[@]}"; do
      [ -e "$p$t" ] || continue
      uebernehmen "$p$t" "$z/profiles/$slug/$t"
    done
    n=$((n+1))
  done
  gut "Hermes-Wurzel und $n Profile (ohne Logs, Caches, Plugin-Symlinks)"
  if [ -d "$TIKKI_WURZEL" ]; then
    # Ohne die Quellklone der Dienste (honcho.sh/tencentdb.sh holen sie am festgenagelten Stand neu).
    mkdir -p "$paket/zustand/tikki"
    (cd "$TIKKI_WURZEL" && tar --exclude='./dienste/honcho' --exclude='./dienste/tencentdb/quelle' -cf - .) \
      | (cd "$paket/zustand/tikki" && tar -xf -)
    sqlite_nachziehen "$TIKKI_WURZEL" "$paket/zustand/tikki"
    gut "~/.tikki (Briefing, Modellsuche, RAG, TencentDB-Daten)"
    if [ -d "$TIKKI_WURZEL/dienste/tencentdb/daten" ]; then
      info "TencentDB-Daten sind dabei – für einen sicheren Stand die Container vorher stoppen (tencentdb.sh stop <instanz>)"
    fi
  fi
  local ad; ad="$(app_daten)"
  if [ -d "$ad" ]; then
    mkdir -p "$paket/zustand/app"
    (cd "$ad" && tar --exclude='Cache' --exclude='Code Cache' --exclude='GPUCache' --exclude='DawnCache' --exclude='DawnWebGPUCache' \
        --exclude='Service Worker' --exclude='blob_storage' --exclude='logs' -cf - .) | (cd "$paket/zustand/app" && tar -xf -)
    gut "App-Daten ($ad, ohne Caches)"
  fi
  if [ "$ohne_schluessel" = 1 ]; then
    # Alles, was ein Geheimnis trägt, wieder heraus – nicht nur die .env der Hermes-Wurzel.
    find "$paket/zustand" \( -name '*.env' -o -name '*.key' -o -name 'auth.json' \) -type f -exec rm -f {} +
    for t in "${APP_GEHEIM[@]}"; do rm -f "$paket/zustand/app/$t"; done
    warn "Schlüssel NICHT im Archiv (.env, *.key, Postfach-Passwort und Gateway-Token der App) – auf dem neuen Rechner schluessel-einlesen.sh, in der App neu anmelden"
  else
    info "Schlüssel sind im Archiv – Archiv nach dem Umzug löschen"
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

  # Erst prüfen, dann schreiben: Was auf diesem Rechner schon liegt und ersetzt würde, ist ein
  # Konflikt – auch ohne Rollenprofile (ein Mac mit normalem Hermes hat nur das Hauptprofil).
  local repo="$HERMES_WURZEL/hermes-agent" ad; ad="$(app_daten)"
  local konflikte=() f
  if [ -e "$repo" ] && [ ! -d "$repo/.git" ] && { [ -f "$paket/code/quelle.tar.gz" ] || [ -f "$paket/code/tikki-app.bundle" ]; }; then
    konflikte+=("$repo (kein Git-Checkout, würde ersetzt)")
  fi
  while IFS= read -r -d '' f; do
    if [ -e "$HERMES_WURZEL/${f#"$paket/zustand/hermes/"}" ]; then konflikte+=("$HERMES_WURZEL/${f#"$paket/zustand/hermes/"}"); fi
  done < <(find "$paket/zustand/hermes" -mindepth 1 -maxdepth 1 ! -name profiles -print0 2>/dev/null; \
           find "$paket/zustand/hermes/profiles" -mindepth 2 -maxdepth 2 -print0 2>/dev/null)
  while IFS= read -r -d '' f; do
    if [ -e "$TIKKI_WURZEL/${f#"$paket/zustand/tikki/"}" ]; then konflikte+=("$TIKKI_WURZEL/${f#"$paket/zustand/tikki/"}"); fi
  done < <(find "$paket/zustand/tikki" -mindepth 1 -maxdepth 1 -print0 2>/dev/null)
  if [ -d "$paket/zustand/app" ] && [ -n "$(ls -A "$ad" 2>/dev/null)" ]; then konflikte+=("$ad"); fi
  if [ "${#konflikte[@]}" -gt 0 ] && [ "$ueber" = 0 ]; then
    printf '  schon vorhanden: %s\n' "${konflikte[@]:0:12}" >&2
    [ "${#konflikte[@]}" -le 12 ] || printf '  … und %s weitere\n' "$(( ${#konflikte[@]} - 12 ))" >&2
    abbruch "Auf diesem Rechner liegt schon Zustand – nichts wurde geändert. Mit --ueberschreiben werden die genannten Dateien ersetzt (vorher Gateway und App beenden)."
  fi

  # Code
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

  # Zustand. Neben einer ersetzten SQLite-Datei darf kein -wal/-shm des alten Stands liegen
  # bleiben: SQLite spielte sonst fremde WAL-Seiten in die neue Datei ein.
  einspielen() {  # einspielen PAKETORDNER ZIEL
    local f
    mkdir -p "$2"
    while IFS= read -r -d '' f; do
      rm -f "$2${f#"$1"}-wal" "$2${f#"$1"}-shm"
    done < <(find "$1" -type f \( -name '*.db' -o -name '*.sqlite' \) -print0)
    (cd "$1" && tar -cf - .) | (cd "$2" && tar -xf -)
  }
  if [ -d "$paket/zustand/hermes" ]; then
    einspielen "$paket/zustand/hermes" "$HERMES_WURZEL"; gut "Hermes-Wurzel und Profile übernommen"
  fi
  if [ -d "$paket/zustand/tikki" ]; then
    einspielen "$paket/zustand/tikki" "$TIKKI_WURZEL"; gut "~/.tikki übernommen"
  fi
  if [ -d "$paket/zustand/app" ]; then
    einspielen "$paket/zustand/app" "$ad"; gut "App-Daten nach $ad"
  fi
  # Alte absolute Pfade (anderer Benutzername / andere Wurzel) in Textdateien umschreiben: in EINEM
  # Durchgang und nur ganze Pfade – ist das alte Home ein Anfang des neuen (/Users/t → /Users/thorsten),
  # ersetzte ein zweiter Durchgang sonst das schon Umgeschriebene noch einmal.
  if { [ -n "$alt_home" ] && [ "$alt_home" != "$HOME" ]; } || { [ -n "$alt_repo" ] && [ "$alt_repo" != "$repo" ]; }; then
    local n=0
    while IFS= read -r -d '' f; do
      if grep -q -F -e "$alt_home" -e "$alt_repo" "$f" 2>/dev/null; then
        python3 - "$f" "$alt_repo" "$repo" "$alt_hermes" "$HERMES_WURZEL" "$alt_home" "$HOME" <<'PY'
import pathlib, re, sys
f, arepo, nrepo, ah, nh, ahome, nhome = sys.argv[1:]
neu = {alt: ziel for alt, ziel in ((arepo, nrepo), (ah, nh), (ahome, nhome)) if alt and alt != ziel}
if neu:
    # Längster Pfad zuerst; davor und danach darf kein Zeichen stehen, das den Pfadnamen fortsetzt.
    muster = re.compile(r"(?<![\w.-])(?:%s)(?![\w.-])" % "|".join(re.escape(a) for a in sorted(neu, key=len, reverse=True)))
    p = pathlib.Path(f)
    alt_text = p.read_text(encoding="utf-8", errors="surrogateescape")
    neu_text = muster.sub(lambda m: neu[m.group(0)], alt_text)
    if neu_text != alt_text:
        p.write_text(neu_text, encoding="utf-8", errors="surrogateescape")
PY
        n=$((n+1))
      fi
    done < <(find "$HERMES_WURZEL" "$TIKKI_WURZEL" -maxdepth 4 -type f \( -name '*.yaml' -o -name '*.json' -o -name '*.sh' -o -name '*.md' -o -name '.env' \) -not -path '*/hermes-agent/*' -print0 2>/dev/null)
    gut "alte Pfade (Repo, Hermes-Wurzel, Home) in $n Dateien umgeschrieben"
  fi
  find "$HERMES_WURZEL" -name '.env' -exec chmod 600 {} \; 2>/dev/null || true
  echo
  echo "Weiter:"
  echo "  1. $repo/tikki/installieren.sh                 # Kern, App, Rollen (Einstellungen bleiben), Gateway, Selbsttest"
  echo "  2. $repo/tikki/werkzeuge/abos-einrichten.sh --anmelden   # Abo-Anmeldungen ziehen nicht um"
  echo "  3. $repo/tikki/installieren.sh --nur-pruefen   # Selbsttest bei Bedarf erneut"
  echo "  4. Archiv löschen (enthält Schlüssel): rm '$archiv'"
  echo "  Den alten Rechner stilllegen (hermes gateway stop): die Räume gehören jetzt diesem."
}

case "${1:-}" in
  packen) shift; packen "$@" ;;
  auspacken) shift; auspacken "$@" ;;
  *) sed -n '2,32p' "$0"; exit 1 ;;
esac
