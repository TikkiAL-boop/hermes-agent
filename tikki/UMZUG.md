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
| **Rollen** (alle Profile aus `rollen/KATALOG.json` mit SOUL, Modell, Werkzeugen, Cronjobs) | `~/.hermes/profiles/<slug>/` | Konfiguration kommt aus dem Repo (`rollen-einrichten.sh`), der persönliche Teil aus dem Umzugsarchiv |
| **Zustand** (Räume samt der Kennung `install_id`, unter der sie diesem Rechner gehören, Zustand des Taktgebers, Gedächtnis, Sitzungen, Daueraufträge, Briefing-Stempel, Modellsuche) | `~/.hermes/{install_id,shared-state.db,tikki/takt.json}`, `~/.hermes/profiles/*/{memories,sessions,state.db,cron}`, `~/.tikki/` | Umzugsarchiv |
| **Schlüssel** (API, Mail, Dienste) | `~/.hermes/.env`, `~/.hermes/profiles/*/.env` (Rechte 600), `~/.tikki/dienste/tencentdb/*.key`/`*.env`; in den App-Daten das Postfach-Passwort und die Gateway-Token | Umzugsarchiv **oder** neu aus `cvcv.txt` mit `schluessel-einlesen.sh` und Anmeldung in der App |
| **Abo-Anmeldungen** (Claude, Codex, SuperGrok) | `auth.json` je Profil | ziehen **nicht** um: auf dem neuen Rechner `abos-einrichten.sh --anmelden` |
| **App-Daten** (Postfachkonto der App, Fensterlage) | `~/Library/Application Support/Tikki` | Umzugsarchiv |
| **Lokale Modelle** (35B, 122B …) | LM Studio / Ollama / HF-Cache / `~/Models` | separat kopieren (zig GB); die App findet sie beim Start selbst |
| **Gedächtnis-Dienste** (Honcho, TencentDB, Hindsight) | eigene Dienste auf dem Rechner (`tikki/dienste/`, Docker). Honcho: Daten in Docker-Volumes. TencentDB: Daten unter `~/.tikki/dienste/tencentdb/daten` | TencentDB-Daten und -Schlüssel sind im Umzugsarchiv (Container vorher stoppen); Honchos Volumes ziehen nicht um (bei Bedarf `docker volume`-Export). Auf dem neuen Rechner beide Dienste neu starten (Abschnitt 3) |

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
~/.hermes/hermes-agent/tikki/installieren.sh      # Kern, App, alle Rollen, Gateway, Selbsttest
open -a Tikki
```

Schlüssel: `cvcv.txt` (Format `NAME=wert` je Zeile) auf den Schreibtisch, dann
`~/.hermes/hermes-agent/tikki/werkzeuge/schluessel-einlesen.sh ~/Desktop/cvcv.txt` – Werte werden
nie angezeigt, landen nur in `.env`.

## 3. Weg B – Umzug mit allem (Code + Zustand + Schlüssel)

**Alter Rechner.** Tikki darf dabei laufen: Datenbanken kommen über SQLites Backup-Schnittstelle
ins Archiv (ein stimmiger Stand, auch was noch im WAL steht). Sicherer ist trotzdem, App und
TencentDB-Container vorher zu beenden (`tencentdb.sh stop <instanz>`) – deren Daten werden roh kopiert.

```bash
~/.hermes/hermes-agent/tikki/werkzeuge/umzug.sh packen
# → ~/Desktop/Tikki-Umzug-<datum>.tar.gz  (Rechte 600; enthält Schlüssel)
# ohne Schlüssel: … packen --ohne-schluessel
```

Das Archiv enthält `code/` (Git-Bundle mit voller Historie + Quell-Schnappschuss + Stand),
`zustand/` (Hermes-Wurzel mit `install_id` und Takt-Zustand, Profile, `~/.tikki` ohne die
Quellklone der Dienste, App-Daten – ohne Logs und Caches), `handover/` (diese Mappe) und
`MANIFEST` (Herkunft, Prüfsummen). Mit `--ohne-schluessel` fehlen alle `.env`- und `*.key`-Dateien
und die Geheimnisdateien der App (Postfach-Passwort, Gateway-Token). Übertragen per AirDrop, USB
oder `scp`; nie per Mail oder Cloud-Ordner.

**Der alte Rechner wird mit dem Umzug stillgelegt** (`hermes gateway stop`, Dienst entfernen): Die
Räume gehören dem Rechner mit ihrer `install_id`, und die zieht mit um. Zwei Rechner mit derselben
Kennung würden dieselben Räume fahren.

**Neuer Rechner:**

```bash
tar -xOzf ~/Desktop/Tikki-Umzug-*.tar.gz Tikki-Umzug/umzug.sh > /tmp/umzug.sh
bash /tmp/umzug.sh auspacken ~/Desktop/Tikki-Umzug-*.tar.gz
~/.hermes/hermes-agent/tikki/installieren.sh
~/.hermes/hermes-agent/tikki/werkzeuge/abos-einrichten.sh --anmelden   # Abos neu anmelden
~/.hermes/hermes-agent/tikki/dienste/honcho/honcho.sh start            # Gedächtnis-Dienste (Docker)
~/.hermes/hermes-agent/tikki/dienste/tencentdb/tencentdb.sh start system
~/.hermes/hermes-agent/tikki/dienste/tencentdb/tencentdb.sh start thorsten
open -a Tikki
rm ~/Desktop/Tikki-Umzug-*.tar.gz /tmp/umzug.sh
```

`auspacken` prüft zuerst, ob auf dem Rechner schon etwas liegt, das ersetzt würde (auch ohne
Rollenprofile: `config.yaml`, `.env`, `state.db`, `~/.tikki`, App-Daten), und bricht dann ab, ohne
etwas zu ändern; `--ueberschreiben` ersetzt die genannten Dateien (vorher Gateway und App
beenden). Dann klont es den Code aus dem Bundle nach `~/.hermes/hermes-agent` (origin zeigt danach
auf GitHub), legt Zustand und Schlüssel an ihre Plätze, schreibt alte absolute Pfade um (anderer
Benutzername) und setzt `.env` auf 600. `installieren.sh` baut Kern und App, richtet die Rollen
neu ein (**was in den Profilen eingestellt wurde, bleibt**), installiert das eine Host-Gateway
und endet mit dem Selbsttest.

## 4. Weg C – nur die App (zweiter Rechner als Fenster)

GitHub-Workflow „Tikki App (macOS Download)“ (Actions im Fork einschalten) baut ein DMG unter
Releases. Die App installiert beim ersten Start den Kern aus `tikki-app`; danach
`~/.hermes/hermes-agent/tikki/installieren.sh --ohne-kern --ohne-app`. Oder die App verbindet sich
mit dem Backend des Hauptrechners (Einstellungen → Verbindung → URL + Token): dann bleiben
Räume, Gedächtnis und Modelle auf dem Hauptrechner.

## 5. Nach dem Umzug prüfen (5 Minuten)

1. `~/.hermes/hermes-agent/tikki/installieren.sh --nur-pruefen` (der Selbsttest; installiert
   nichts) – Ziel: nur ✓, höchstens ⚠ bei Anbietern ohne Schlüssel. Zeilen: Zweig, Rollen (auch:
   Profile auf dem Stand von Katalog und Vorlage), Vorzimmer, Gedächtnis, Takt (echter
   Laufstatus), Schlüssel, Anbieter (`GET /models` je Anbieter), Sprache, Raum, Gateway, App, Backend.
2. Cursor-Endpunkt einmal testen, bevor der erste Raum aufgeht:
   `curl -H "Authorization: Bearer $CURSOR_API_KEY" https://api.cursor.com/v1/models` – antwortet er
   nicht mit einer Modellliste, im Katalog die Modelle auf `xai/` umstellen (HANDOVER §7) und
   `rollen-einrichten.sh` laufen lassen: die Modelle folgen dem Katalog in jedem Profil, in dem
   niemand selbst ein anderes gewählt hat.
3. `hermes -p default gateway status` – das eine Host-Gateway läuft (fährt Räume, Takt, Wachhalter,
   Daueraufträge). Nie ein zweites Gateway je Profil.
4. App öffnen → Übersicht: Karte „Modelle im Haus“ zeigt, was lokal liegt; „Tikkis Daueraufträge“
   zeigt die übernommenen Cronjobs; Suites → Verlauf zeigt die alten Räume.
5. Räume aus dem alten Rechner weiterbenutzen: sie liegen in `shared-state.db` und gehören der
   mit umgezogenen `install_id`; das Gateway fährt sie weiter, sobald es steht. Der Taktgeber
   kennt aus `tikki/takt.json`, welche Türen und Übungsergebnisse schon zugestellt sind, und stellt
   nichts Altes noch einmal ein.

## 6. Aktualisieren, nicht neu installieren

**Der eine Weg, der immer stimmt:** `~/.hermes/hermes-agent/tikki/installieren.sh`. Er holt den
Zweig, baut Kern und App, **beendet eine laufende Tikki-App und ersetzt sie in /Applications**,
richtet die Rollen nach und endet mit dem Selbsttest. Zwei Fallen, die es vorher gab (07.10.
behoben): lief Tikki während der Installation, blieb still die alte App stehen (jetzt wird sie
beendet, sonst bricht der Installer hörbar ab), und die Schritte nach dem Code-Holen liefen noch
mit dem alten Skript (jetzt startet der Installer sich aus dem neuen Stand neu). Der Selbsttest
meldet eine App, die älter ist als der Code, als Fehler. Der Installer setzt den Checkout auf
`origin/tikki-app`: Liegen dort ungesicherte Dateien oder Commits, die origin nicht kennt, bricht
er vorher ab (erst committen bzw. pushen, oder `--ohne-kern` für einen Lauf ohne Code-Update).

- **Immer** `~/.hermes/hermes-agent/tikki/werkzeuge/tikki-update.sh`: `hermes update --branch
  tikki-app`, danach Rollen nachziehen (`rollen-einrichten.sh`) und Selbsttest. Ein nacktes
  `hermes update` ist gesperrt (`updates.auto_switch_parked_branch: false`). `/update` im Chat und
  der Update-Knopf der App holen nur den Code; danach `rollen-einrichten.sh` laufen lassen (der
  Selbsttest meldet es unter „Rollen“).
- Neue Hermes-Version hereinholen: `tikki/werkzeuge/hermes-aktualisieren.sh` (Merge, Prüfungen,
  dann Rollen neu einrichten).
- Nach Katalog- oder SOUL-Änderungen: `tikki/werkzeuge/rollen-einrichten.sh` (idempotent). Die
  `config.yaml` wird gemischt: Katalog- und Vorlagenänderungen kommen an, Einstellungen aus dem
  Profil bleiben; ein im Profil gewähltes Modell bleibt, bis `--modelle-zuruecksetzen` es ersetzt.
  Eine in der App geänderte `SOUL.md` (Admin → Regeln) bleibt, bis `--seelen-zuruecksetzen` die
  Repo-Fassung zurückholt.

## 7. Was man wissen muss (Kurzliste, Details in HANDOVER §10)

- Ein Host-Gateway je Rechner, aus dem Profil `default`; alle Rollenprofile hängen daran.
- Zwei bewusste Änderungen am Hermes-Kern (App-Identität aus `productName`; Räume bis 128
  Mitglieder) – bei Upstream-Merges erhalten.
- Schlüssel nie in Repo, Chat, Logs oder SOULs; `.env` ist nur für Geheimnisse, Einstellungen
  (z. B. die Postfach-Adresse: `hermes -p tikki pa postfach …`) stehen in `config.yaml`.
- Jedes Modell braucht ≥ 64k Kontext; lokale Server entsprechend starten (`hermes pa modelle` nennt
  den Startbefehl je Modell).
- Ein Profil führt einen Turn zur Zeit; Räume mit demselben Raumleiter warten aufeinander. Die
  Raumleiter-Klone (`raumleiter-xai`, `-anthropic`, `-codex`, `-lokal`) geben einem Raum ein
  eigenes Modell und eine eigene Schlange; der MR-Bot (`@mr`) nennt, welcher gerade frei ist.

## 8. Offene Punkte (Reihenfolge wie besprochen)

Sprache (lokale Stimme auf der Flotte, xAI Ara) und 3D-Oberfläche · lokales 122B/35B-MoE einbinden
(Plan: PRUEFBERICHT Abschnitt 3) · Login nur für eigene Domains mit PIN (nach der Testphase) ·
API-Regeln · Rechnerflotte.
