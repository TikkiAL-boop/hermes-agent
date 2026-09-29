# Tikki – Bot-Truppe für Gruppenräume

Tikki ist der Familienassistent auf Basis von Hermes. Dieser Ordner enthält alles, was die
fertige Bot-Truppe für Gruppenräume braucht: den Rollenkatalog, die Seelen (System-Prompts)
der Rollen, eine Konfigurationsvorlage und zwei Skripte zum Einrichten und Prüfen.
Der Hermes-Quellcode außerhalb von `tikki/` bleibt unverändert.

## Was liegt hier

| Pfad | Inhalt |
|------|--------|
| `rollen/KATALOG.json` | Die 12 Rollen: Name, Kurzbeschreibung, Modelle, Werkzeuge, Port, Profilname |
| `rollen/<slug>/SOUL.md` | System-Prompt der jeweiligen Rolle (Deutsch, mit Hausregeln) |
| `hermes/vorlage-rolle.yaml` | Vorlage für `config.yaml` eines Rollenprofils (echte Hermes-Schlüssel) |
| `hermes/vorlage-honcho.json` | Vorlage für `honcho.json` je Profil: Workspace `tikki`, AI-Peer = Rolle, eine Honcho-Sitzung je Suite |
| `werkzeuge/rollen-einrichten.sh` | Legt pro Rolle ein Hermes-Profil an bzw. bringt es auf Stand (`--dry-run` möglich) |
| `werkzeuge/rollen_config.py` | Erzeugt die `config.yaml` einer Rolle aus Katalog und Vorlage; das Skript ruft es über `hermes --run-module` in der Hermes-Umgebung auf |
| `werkzeuge/rollen-status.sh` | Fragt `/health` auf dem Port jeder Rolle ab |
| `dienste/honcho/honcho.sh` | Honcho als eigener Dienst auf dem Rechner (Docker Compose, Pin v3.2.1): `start|stop|status|logs` |

## Die Truppe

- **Tikki** (Vorzimmer) – begrüßt, plaudert, beantwortet Mail-Fragen, macht aus Aufträgen Räume. Arbeitet nie selbst.
- **Raumleiter** – sitzt ab Start in jedem Raum, plant, delegiert an bis zu 30 Bots, prüft, fasst zusammen, stoppt erst bei Ziel oder Entscheidung.
- **Arbeiter** (werden bei Bedarf geholt): Rechercheur, Prüfer, Schreiber, Frontend-Entwickler,
  Backend-Entwickler, Sicherheitsbeauftragter, Datenanalyst, Organisator, API-Fachmann, Übersetzer.

Jede Seele enthält dieselben Hausregeln: Deutsch, kurz, keine Technik-Werbung, Aufgaben zu Ende
bringen, bei echtem Bedarf eine `BRAUCHE:`-Zeile mit Vorschlag, Ergebnisse im Raum-Chat.

## Einrichten auf dem Mac

Voraussetzung: Hermes ist installiert (`hermes` im PATH oder dieses Repo mit `.venv`). Die
Konfiguration wird in der Hermes-Umgebung erzeugt und trägt den aktuellen Konfigurationsstand
(`_config_version`), damit Hermes die Datei beim ersten Start nicht selbst umschreibt.

```bash
# 1. Schlüssel in die Umgebung (z. B. ~/.zshrc oder ein Passwortmanager, nie ins Repo)
export XAI_API_KEY="…"
export CURSOR_API_KEY="…"

# 2. Ansehen, was passieren würde
tikki/werkzeuge/rollen-einrichten.sh --dry-run

# 3. Profile anlegen bzw. aktualisieren
tikki/werkzeuge/rollen-einrichten.sh

# 4. Pro Profil den Bearer-Schlüssel für den HTTP-Dienst setzen (Hermes verlangt ihn)
#    -> ~/.hermes/profiles/<slug>/.env : API_SERVER_KEY=<eigener zufälliger Wert>

# 5. Rollen starten (je ein Prozess, je ein Port)
hermes -p tikki gateway
hermes -p raumleiter gateway
# … weitere Rollen bei Bedarf

# 6. Prüfen
tikki/werkzeuge/rollen-status.sh
```

Das Einrichten ist wiederholbar: vorhandene Profile werden nicht neu angelegt, `SOUL.md` und
`config.yaml` werden nur geschrieben, wenn sie sich unterscheiden. `--nur <slug>` beschränkt
den Lauf auf eine Rolle.

## Dauerbetrieb, Gedächtnis, Abos, Skills

| Skript | Wofür |
|---|---|
| `installieren.sh` | Alles mit einem Befehl: Kern, App, Rollen, Schlüssel, Dienste, danach Selbsttest |
| `werkzeuge/selbsttest.py` | Prüft jede Schicht (Rollen, Plugin, Cronjobs, Schlüsselnamen, App, Backend-Start) |
| `werkzeuge/suite_takt.py` | Räume mit `TAKT:` fahren Runden im Backend (Cronjob `tikki-takt`), Raumbericht für den Wachhalter, Übungsergebnisse an den Hauptraum |
| `werkzeuge/schluessel-einlesen.sh` | Schlüssel aus einer Textdatei in alle Profile übernehmen, ohne sie anzuzeigen |
| `werkzeuge/abos-einrichten.sh` | Claude-, Codex-, Grok-Abo als Modelle anmelden; Kommandozeilen der Abos prüfen |
| `werkzeuge/openclaw-einrichten.sh` | ClawHub-Katalog (OpenClaw) lokal, Skills auf Abruf in die Bibliothek `openclaw` |
| `werkzeuge/hermes-aktualisieren.sh` | Neue Hermes-Version per Merge übernehmen, danach alle Tikki-Prüfungen |
| `dienste/honcho/honcho.sh` | Honcho als eigener Dienst (Docker) |
| `dienste/tencentdb/tencentdb.sh` | TencentDB Agent Memory je Mensch und fürs System (Docker) |
| `plugins/gedaechtnis/` | Spiegelt jede Runde in TencentDB und die RAG-Sammlung; Werkzeug `nachschlagen` |
| `skills/` | Tikki-Skills: `gemini-cli`, `notebooklm`, `openclaw-skills` |

Reihenfolge und Einzelheiten: `HANDOVER.md`, Abschnitte 3 und 4.8–4.12.

## Modelle und Ersatz

Die Zuordnung steht im Katalog unter `modell.primary` / `modell.fallback` in der Form
`anbieter/modell`. Das Skript schreibt daraus `model.provider` + `model.default` und die
`fallback_providers`-Kette in die Profilkonfiguration:

- Tikki und alle Arbeiter: schnelles Hauptmodell, starkes Ersatzmodell.
- Raumleiter: starkes Hauptmodell (Planung, Delegation), schnelles Ersatzmodell.

Hermes wechselt bei Fehlern (Ratenlimit, Überlastung, Verbindung) automatisch auf den Ersatz.
Modellnamen sind Konfiguration, nicht Prompt: In keiner Seele steht ein Modellname.

Der Anbieter `cursor` ist in `hermes/vorlage-rolle.yaml` als eigener OpenAI-kompatibler Endpunkt
eingetragen. **Die `base_url` dort ist vor dem ersten Einsatz zu prüfen.**

## Wo die Schlüssel hingehören

Nur in Umgebungsvariablen oder in `~/.hermes/profiles/<slug>/.env` (liegt außerhalb des Repos):

| Variable | Zweck |
|----------|-------|
| `XAI_API_KEY` | Anbieter `xai` |
| `CURSOR_API_KEY` | Anbieter `cursor` |
| `API_SERVER_KEY` | Bearer-Schlüssel des HTTP-Dienstes, pro Profil |
| `HONCHO_API_KEY` | Nur für Honcho in der Cloud; der lokale Tikki-Dienst braucht keinen |

Nie in Dateien in diesem Repo, nie im Chat, nie in Seelen. Der Sicherheitsbeauftragte und der
API-Fachmann geben gefundene Schlüssel grundsätzlich nicht wieder.

## Post und Browser

**Post** ist ein eigener Mail-Client in der App (`apps/desktop/electron/tikki-mail.ts`,
Oberfläche unter `apps/desktop/src/app/areas/post-area.tsx`). Anmeldung mit
`name@tikki.team` und dem Postfach-Passwort; die Adresse bestimmt die Server:

| Weg  | Server              | Port | Verschlüsselung |
|------|---------------------|------|-----------------|
| IMAP | `mail.tikki.email`  | 993  | TLS             |
| SMTP | `mail.tikki.email`  | 587  | STARTTLS        |

Das Passwort bleibt auf dem Rechner (Secret-Store der App), die Oberfläche
sieht es nie. Für Tests gegen einen anderen Server: `TIKKI_MAIL_IMAP_HOST`,
`TIKKI_MAIL_IMAP_PORT`, `TIKKI_MAIL_SMTP_HOST`, `TIKKI_MAIL_SMTP_PORT`.

**Browser**: Cookie-Banner werden automatisch weggeklickt
(`apps/desktop/electron/preview-guest-cookie-consent.ts`). Bekannte
Consent-Manager (OneTrust, Cookiebot, Didomi, Quantcast, …) über ihre festen
Knöpfe, alles andere über die Beschriftung („Alle akzeptieren“, „Zustimmen“,
„Accept all“ …), aber nur innerhalb eines Dialogs, der nach Cookie/Consent
aussieht. Höchstens vier Klicks pro Seite.

## Ports

8650 (Tikki) bis 8661 (Übersetzer), je Rolle einer, nur auf `127.0.0.1`. Die Belegung steht
im Katalog; `rollen-status.sh` liest sie von dort.
