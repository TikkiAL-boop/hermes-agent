# Tikki auf einen anderen Rechner bringen – komplettes Handover

Stand 3. Oktober 2026. Dieses Blatt reicht, um Tikki mit allem, was dazugehört, auf einem
neuen Mac (oder einem zweiten Rechner) in Betrieb zu nehmen: Code, persönlicher Zustand,
Schlüssel, App, Dienste, Prüfung. Die Tiefe steht in `HANDOVER.md`; die Prüfung vom 02.10. in
`PRUEFBERICHT-2026-10-02.md`.

## 1. Woraus Tikki besteht

| Teil | Wo es liegt | Wie es auf den neuen Rechner kommt |
|---|---|---|
| **Code** (Hermes-Fork + Tikki-Schicht) | GitHub `TikkiAL-boop/hermes-agent`, Zweig **`tikki-app`**; auf dem Rechner `~/.hermes/hermes-agent` | `git clone -b tikki-app …` (online) oder das Git-Bundle im Umzugsarchiv (offline) |
| **Hermes-Kern + App** (Python-Umgebung, `Tikki.app`) | `~/.hermes/installs/…`, `/Applications/Tikki.app` | wird vom Installer gebaut, nie kopiert |
| **Rollen** (14 Profile mit SOUL, Modell, Werkzeugen, Cronjobs) | `~/.hermes/profiles/<slug>/` | Konfiguration kommt aus dem Repo (`rollen-einrichten.sh`), der persönliche Teil aus dem Umzugsarchiv |
| **Zustand** (Räume, Gedächtnis, Sitzungen, Daueraufträge, Briefing-Stempel, Modellsuche) | `~/.hermes/shared-state.db`, `~/.hermes/profiles/*/{memories,sessions,state.db,cron}`, `~/.tikki/` | Umzugsarchiv |
| **Schlüssel** (API, Mail, Honcho) | nur `~/.hermes/.env` und `~/.hermes/profiles/*/.env` (Rechte 600) | Umzugsarchiv **oder** neu aus `cvcv.txt` mit `schluessel-einlesen.sh` |
| **App-Daten** (Postfachkonto der App, Fensterlage) | `~/Library/Application Support/Tikki` | Umzugsarchiv |
| **Lokale Modelle** (35B, 122B …) | LM Studio / Ollama / HF-Cache / `~/Models` | separat kopieren (zig GB); die App findet sie beim Start selbst |
| **Gedächtnis-Dienste** (Honcho, TencentDB, Hindsight) | Honcho = Cloud-Konto (Schlüssel reicht); TencentDB/Hindsight = eigene Dienste (`tikki/dienste/`) | Honcho: nur Schlüssel; TencentDB-Daten liegen im Docker-Volume des alten Rechners, bei Bedarf `docker volume`-Export |

Nicht im Repo, nicht im Archiv: Python-Umgebung, `node_modules`, gebaute App, Logs, Caches –
alles baut der Installer in 10–20 Minuten neu.

## 1a. Die Mappe als Ordner auf dem Schreibtisch

```bash
~/.hermes/hermes-agent/tikki/werkzeuge/handover-mappe.sh     # → ~/Desktop/Tikki-Handover
```

Darin: `LIES-MICH.txt`, `handover/` (dieses Blatt, HANDOVER, Prüfbericht, README, PDFs), `code/`
(Git-Bundle mit voller Historie, Quell-Schnappschuss, Stand) und `umzug.sh`. Ohne Schlüssel und ohne
persönlichen Zustand; den packt `umzug.sh packen` (Abschnitt 3).

## 2. Weg A – neuer Rechner frisch (online, 3 Befehle)

Reicht, wenn kein persönlicher Zustand mitkommen soll (neuer Mensch, Testrechner):

```bash
git clone -b tikki-app https://github.com/TikkiAL-boop/hermes-agent.git ~/.hermes/hermes-agent
~/.hermes/hermes-agent/tikki/installieren.sh      # Kern, App, 14 Rollen, Gateway, Selbsttest
open -a Tikki
```

Schlüssel: `cvcv.txt` (Format `NAME=wert` je Zeile) auf den Schreibtisch, dann
`~/.hermes/hermes-agent/tikki/werkzeuge/schluessel-einlesen.sh ~/Desktop/cvcv.txt` – Werte werden
nie angezeigt, landen nur in `.env`.

## 3. Weg B – Umzug mit allem (Code + Zustand + Schlüssel)

**Alter Rechner** (Tikki läuft dort):

```bash
~/.hermes/hermes-agent/tikki/werkzeuge/umzug.sh packen
# → ~/Desktop/Tikki-Umzug-<datum>.tar.gz  (Rechte 600; enthält Schlüssel)
# ohne Schlüssel: … packen --ohne-schluessel
```

Das Archiv enthält `code/` (Git-Bundle mit voller Historie + Quell-Schnappschuss + Stand),
`zustand/` (Hermes-Wurzel, Profile, `~/.tikki`, App-Daten – ohne Logs und Caches),
`handover/` (diese Mappe) und `MANIFEST` (Herkunft, Prüfsummen). Übertragen per AirDrop, USB
oder `scp`; nie per Mail oder Cloud-Ordner.

**Neuer Rechner:**

```bash
tar -xOzf ~/Desktop/Tikki-Umzug-*.tar.gz Tikki-Umzug/umzug.sh > /tmp/umzug.sh
bash /tmp/umzug.sh auspacken ~/Desktop/Tikki-Umzug-*.tar.gz
~/.hermes/hermes-agent/tikki/installieren.sh
open -a Tikki
rm ~/Desktop/Tikki-Umzug-*.tar.gz /tmp/umzug.sh
```

`auspacken` klont den Code aus dem Bundle nach `~/.hermes/hermes-agent` (origin zeigt danach auf
GitHub), legt Zustand und Schlüssel an ihre Plätze, schreibt alte absolute Pfade um (anderer
Benutzername) und setzt `.env` auf 600. `installieren.sh` baut Kern und App, richtet die Rollen
neu ein (**eingestellte Modelle bleiben**), installiert das eine Host-Gateway und endet mit dem
Selbsttest. Ist auf dem neuen Rechner schon Tikki da: `auspacken --ueberschreiben` ersetzt
gleichnamige Dateien, alles andere bleibt.

## 4. Weg C – nur die App (zweiter Rechner als Fenster)

GitHub-Workflow „Tikki App (macOS Download)“ (Actions im Fork einschalten) baut ein DMG unter
Releases. Die App installiert beim ersten Start den Kern aus `tikki-app`; danach
`~/.hermes/hermes-agent/tikki/installieren.sh --ohne-kern --ohne-app`. Oder die App verbindet sich
mit dem Backend des Hauptrechners (Einstellungen → Verbindung → URL + Token): dann bleiben
Räume, Gedächtnis und Modelle auf dem Hauptrechner.

## 5. Nach dem Umzug prüfen (5 Minuten)

1. `~/.hermes/hermes-agent/tikki/werkzeuge/selbsttest.py` – Ziel: nur ✓, höchstens ⚠ bei
   Anbietern ohne Schlüssel. Zeilen: Zweig, Rollen, Vorzimmer, Gedächtnis, Takt (echter
   Laufstatus), Schlüssel, Anbieter (`GET /models` je Anbieter), Gateway, App, Backend.
2. Cursor-Endpunkt einmal testen, bevor der erste Raum aufgeht:
   `curl -H "Authorization: Bearer $CURSOR_API_KEY" https://api.cursor.com/v1/models` – antwortet er
   nicht mit einer Modellliste, Katalog auf `xai/` umstellen (HANDOVER §7).
3. `hermes -p default gateway status` – das eine Host-Gateway läuft (fährt Räume, Takt, Wachhalter,
   Daueraufträge). Nie ein zweites Gateway je Profil.
4. App öffnen → Übersicht: Karte „Modelle im Haus“ zeigt, was lokal liegt; „Tikkis Daueraufträge“
   zeigt die übernommenen Cronjobs; Suites → Verlauf zeigt die alten Räume.
5. Räume aus dem alten Rechner weiterbenutzen: sie liegen in `shared-state.db` und laufen weiter,
   sobald das Gateway steht. Türen/Takt feuern beim nächsten Tick.

## 6. Aktualisieren, nicht neu installieren

**Der eine Weg, der immer stimmt:** `~/.hermes/hermes-agent/tikki/installieren.sh`. Er holt den
Zweig, baut Kern und App, **beendet eine laufende Tikki-App und ersetzt sie in /Applications**,
richtet die Rollen nach und endet mit dem Selbsttest. Zwei Fallen, die es vorher gab (07.10.
behoben): lief Tikki während der Installation, blieb still die alte App stehen (jetzt wird sie
beendet, sonst bricht der Installer hörbar ab), und die Schritte nach dem Code-Holen liefen noch
mit dem alten Skript (jetzt startet der Installer sich aus dem neuen Stand neu). Der Selbsttest
meldet eine App, die älter ist als der Code, als Fehler.

- **Immer** `~/.hermes/hermes-agent/tikki/werkzeuge/tikki-update.sh` (= `hermes update --branch
  tikki-app`). Ein nacktes `hermes update` ist gesperrt (`updates.auto_switch_parked_branch: false`).
- Neue Hermes-Version hereinholen: `tikki/werkzeuge/hermes-aktualisieren.sh` (Merge, Tests, Rollen
  neu einrichten, Prüfungen).
- Nach Katalog- oder SOUL-Änderungen: `tikki/werkzeuge/rollen-einrichten.sh` (idempotent).

## 7. Was man wissen muss (Kurzliste, Details in HANDOVER §10)

- Ein Host-Gateway je Rechner, aus dem Profil `default`; alle 14 Profile hängen daran.
- Zwei bewusste Änderungen am Hermes-Kern (App-Name aus `productName`; Räume bis 128 Mitglieder) –
  bei Upstream-Merges erhalten.
- Schlüssel nie in Repo, Chat, Logs oder SOULs; `.env` ist nur für Geheimnisse.
- Jedes Modell braucht ≥ 64k Kontext; lokale Server entsprechend starten (`hermes pa modelle` nennt
  den Startbefehl je Modell).
- Räume teilen heute den Raumleiter (ein Turn je Profil zur Zeit); „ein Modell je Raum“ kommt mit
  den Raumleiter-Klonen (PRUEFBERICHT, Abschnitt 4 „später“).

## 8. Offene Punkte (Reihenfolge wie besprochen)

MR-Bot (Model Resources) · Sprache (lokale Stimme auf der Flotte, xAI Ara) und 3D-Oberfläche ·
lokales 122B/35B-MoE einbinden (Plan: PRUEFBERICHT Abschnitt 3) · Raumleiter-Klone für Modell je
Raum · Login nur für eigene Domains mit PIN (nach der Testphase) · API-Regeln · Rechnerflotte.
