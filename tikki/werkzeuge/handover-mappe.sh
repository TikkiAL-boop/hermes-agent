#!/usr/bin/env bash
# Legt die komplette Handover-Mappe als Ordner auf den Schreibtisch (oder in ZIEL):
#   LIES-MICH.txt, handover/ (UMZUG, HANDOVER, Prüfbericht, README, Einseiter-PDFs),
#   code/ (Git-Bundle mit voller Historie + Quell-Schnappschuss + Stand), umzug.sh.
#
#   tikki/werkzeuge/handover-mappe.sh [ZIEL-ORDNER]      Standard: ~/Desktop/Tikki-Handover
#
# Keine Schlüssel, kein persönlicher Zustand – dafür ist umzug.sh packen da.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZWEIG="tikki-app"
REMOTE_URL="https://github.com/TikkiAL-boop/hermes-agent.git"
ZIEL="${1:-$HOME/Desktop/Tikki-Handover}"
mkdir -p "$ZIEL/handover" "$ZIEL/code"

for d in UMZUG.md HANDOVER.md PRUEFBERICHT-2026-10-02.md README.md Tikki-auf-einer-Seite.pdf Tikki-stolz-auf-einer-Seite.pdf; do
  [ -f "$REPO/tikki/$d" ] && cp "$REPO/tikki/$d" "$ZIEL/handover/"
done
cp "$REPO/tikki/werkzeuge/umzug.sh" "$ZIEL/umzug.sh"; chmod +x "$ZIEL/umzug.sh"

sha="$(git -C "$REPO" rev-parse "$ZWEIG" 2>/dev/null || git -C "$REPO" rev-parse HEAD)"
bundle="nein"
if [ "$(git -C "$REPO" rev-parse --is-shallow-repository 2>/dev/null)" = "true" ] \
   || [ -n "$(git -C "$REPO" config --get remote.origin.partialclonefilter 2>/dev/null)" ]; then
  echo "  ⚠ Klon ist flach oder teilweise – kein Git-Bundle (online klonen oder git fetch --unshallow)"
elif git -C "$REPO" bundle create "$ZIEL/code/tikki-app.bundle" "$ZWEIG" >/dev/null 2>&1 \
     && git -C "$REPO" bundle verify "$ZIEL/code/tikki-app.bundle" >/dev/null 2>&1; then
  bundle="ja"
else
  rm -f "$ZIEL/code/tikki-app.bundle"
  echo "  ⚠ Bundle nicht möglich – nur Schnappschuss"
fi
git -C "$REPO" archive --format=tar.gz --prefix=hermes-agent/ -o "$ZIEL/code/quelle.tar.gz" "$sha"
{
  echo "zweig=$ZWEIG"; echo "commit=$sha"; echo "datum=$(date +%Y-%m-%d)"; echo "remote=$REMOTE_URL"; echo "bundle=$bundle"
  echo "online:  git clone -b $ZWEIG $REMOTE_URL ~/.hermes/hermes-agent"
  echo "offline: git clone -b $ZWEIG code/tikki-app.bundle ~/.hermes/hermes-agent && git -C ~/.hermes/hermes-agent remote set-url origin $REMOTE_URL"
} > "$ZIEL/code/stand.txt"

cat > "$ZIEL/LIES-MICH.txt" <<EOF
Tikki – Handover-Mappe (Stand $(date +%d.%m.%Y), Zweig $ZWEIG, Commit ${sha:0:12})

handover/UMZUG.md            ← hier anfangen: Bestandteile, drei Wege, Prüfliste
handover/HANDOVER.md         Übergabe in der Tiefe (Architektur, Betrieb, Stolpersteine)
handover/PRUEFBERICHT-…md    Gesamtprüfung vom 02.10. mit Reparaturliste und Modellplan
handover/README.md           Wegweiser durch tikki/
handover/*.pdf               die zwei Einseiter (nüchtern, stolz)
code/tikki-app.bundle        kompletter Code mit Historie, offline klonbar (bundle=$bundle)
code/quelle.tar.gz           Quell-Schnappschuss ohne Historie (Notnagel)
code/stand.txt               Commit, Remote, Klon-Befehle
umzug.sh                     packt Zustand + Schlüssel auf dem alten Rechner, packt auf dem neuen aus

Neuer Rechner, nur Code (online):
  git clone -b $ZWEIG $REMOTE_URL ~/.hermes/hermes-agent
  ~/.hermes/hermes-agent/tikki/installieren.sh && open -a Tikki

Neuer Rechner, nur Code (offline, aus dieser Mappe):
  git clone -b $ZWEIG code/tikki-app.bundle ~/.hermes/hermes-agent
  git -C ~/.hermes/hermes-agent remote set-url origin $REMOTE_URL
  ~/.hermes/hermes-agent/tikki/installieren.sh && open -a Tikki

Umzug mit allem (Räume, Gedächtnis, Schlüssel, Daueraufträge):
  alter Rechner:  ~/.hermes/hermes-agent/tikki/werkzeuge/umzug.sh packen
  neuer Rechner:  bash umzug.sh auspacken ~/Desktop/Tikki-Umzug-….tar.gz
                  ~/.hermes/hermes-agent/tikki/installieren.sh && open -a Tikki
EOF
echo "Handover-Mappe liegt in: $ZIEL"
du -sh "$ZIEL" | cut -f1 | sed 's/^/  Größe: /'
ls -1 "$ZIEL" "$ZIEL/handover" "$ZIEL/code" | sed 's/^/  /'
