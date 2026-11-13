# Tikki – Bot-Truppe für Gruppenräume

Tikki ist der Familienassistent auf Basis von Hermes. Dieser Ordner enthält alles, was die
fertige Bot-Truppe für Gruppenräume braucht: den Rollenkatalog, die Seelen (System-Prompts)
der Rollen, eine Konfigurationsvorlage, die Tikki-Plugins und die Skripte zum Einrichten,
Aktualisieren und Prüfen. Am Hermes-Kern ändert Tikki zwei kleine Stellen (App-Identität aus
`productName`, Raumgröße); sie stehen in `HANDOVER.md`, Abschnitt 10.

## Was liegt hier

| Pfad | Inhalt |
|------|--------|
| `rollen/KATALOG.json` | Alle Rollen (der Katalog ist die eine Quelle; Raumleiter-Klone erben vom Raumleiter): Name, Kurzbeschreibung, Modelle, Werkzeuge, Port, Profilname |
| `rollen/<slug>/SOUL.md` | System-Prompt der jeweiligen Rolle (Deutsch, mit Hausregeln) |
| `hermes/vorlage-rolle.yaml` | Vorlage für `config.yaml` eines Rollenprofils (echte Hermes-Schlüssel) |
| `hermes/vorlage-honcho.json` | Vorlage für `honcho.json` je Profil: Workspace `tikki`, AI-Peer = Rolle, eine Honcho-Sitzung je Suite |
| `werkzeuge/rollen-einrichten.sh` | Legt pro Rolle ein Hermes-Profil an bzw. bringt es auf Stand (`--dry-run` möglich) |
| `werkzeuge/rollen_config.py` | Erzeugt die `config.yaml` einer Rolle aus Katalog und Vorlage; das Skript ruft es über `hermes --run-module` in der Hermes-Umgebung auf |
| `werkzeuge/rollen-status.sh` | Fragt `/health` auf dem Port jeder Rolle ab |
| `dienste/honcho/honcho.sh` | Honcho als eigener Dienst auf dem Rechner (Docker Compose, Pin v3.2.1): `start|stop|status|logs` |

## Die Truppe

- **Tikki** (Vorzimmer, persönliche Assistentin) – empfängt mit dem Briefing, erledigt Daueraufträge selbst (Post, Lernen, Nachrichtenlage), macht aus Projekten Räume.
- **Raumleiter** – sitzt ab Start in jedem Raum, plant, verteilt Arbeit an die Mitglieder, prüft, fasst zusammen, stoppt erst bei Ziel oder Entscheidung. Vier Klone mit anderem Modell (`raumleiter-xai`, `-anthropic`, `-codex`, `-lokal`) lassen Räume parallel laufen.
- **Deine KI** – die KI des Menschen, sitzt ab Start in jedem Raum.
- **Wachhalter** – kein Raummitglied: geht alle 15 Minuten durch alle Räume und weckt stille.
- **Arbeiter** (werden bei Bedarf geholt): Rechercheur, Prüfer, Schreiber, Frontend-Entwickler,
  Backend-Entwickler, Sicherheitsbeauftragter, Datenanalyst, Organisator, API-Fachmann, Übersetzer.
- **MR** (Model Resources) – weiß, welche Schlüssel, Abos, lokalen Modelle und Raumleiter-Klone frei
  sind; nennt dem Raumleiter bei Ausfall die Alternative (`hermes pa ressourcen`).

Jede Seele enthält dieselben Hausregeln: Deutsch, kurz, keine Technik-Werbung, Aufgaben zu Ende
bringen, bei echtem Bedarf eine `BRAUCHE:`-Zeile mit Vorschlag, Ergebnisse im Raum-Chat.

## Einrichten auf dem Mac

Der eine Befehl ist `tikki/installieren.sh` (Kern, App, Rollen, Schlüssel, Gateway, Selbsttest).
Die Schritte einzeln, wenn Hermes schon installiert ist (`hermes` im PATH):

```bash
# 1. Ansehen, was passieren würde
tikki/werkzeuge/rollen-einrichten.sh --dry-run

# 2. Profile anlegen bzw. aktualisieren (auch die Skill-Bibliothek im Profil openclaw)
tikki/werkzeuge/rollen-einrichten.sh

# 3. Schlüssel aus einer Textdatei (NAME=wert je Zeile) in die .env der Profile – Werte werden nie
#    angezeigt. Ein `export` in ~/.zshrc reicht nicht: der Gateway-Dienst erbt die Shell-Umgebung nicht.
tikki/werkzeuge/schluessel-einlesen.sh ~/Downloads/cv.cv.txt

# 4. EIN Gateway für alle Rollen, aus dem Hauptprofil. Es fährt die Räume, die Cronjobs aller
#    Profile (Takt, Rundgang, Ressourcen) und Tikkis Daueraufträge. Ein Gateway je Rolle gibt es
#    nicht; Hermes lehnt `hermes -p <rolle> gateway install` ab.
hermes -p default gateway install

# 5. Prüfen
tikki/installieren.sh --nur-pruefen
```

Das Einrichten ist wiederholbar: vorhandene Profile werden nicht neu angelegt, `SOUL.md` folgt
dem Repo, und die `config.yaml` wird gemischt – was Katalog und Vorlage festlegen, kommt an; was
im Profil geändert wurde (Hermes-Einstellungen, `hermes tools`, `hermes model`), bleibt. Die
Modelle folgen dem Katalog, solange niemand im Profil ein anderes gewählt hat;
`--modelle-zuruecksetzen` erzwingt den Katalog. `--nur <slug>` beschränkt den Lauf auf eine Rolle.
Die Konfiguration wird in der Hermes-Umgebung erzeugt (`hermes --run-module`), die Profilwurzel
nennt Hermes selbst (auch mit eigenem `HERMES_HOME`).

## Dauerbetrieb, Gedächtnis, Abos, Skills

| Skript | Wofür |
|---|---|
| `installieren.sh` | Alles mit einem Befehl: Kern, App, Rollen, Schlüssel, Dienste, Sprach-Extras (`--ohne-sprache` lässt sie aus), danach Selbsttest |
| `werkzeuge/selbsttest.py` | Prüft jede Schicht (Rollen samt Stand gegen Katalog, Plugin, Cronjobs, Schlüsselnamen, Anbieter, Sprache, App, Backend-Start); Aufruf: `installieren.sh --nur-pruefen` |
| `hermes/vorlage-rolle.yaml` → `voice`/`stt`/`tts` | Sprache: Tikki hört über faster-whisper (`hermes pm install --extra voice`) und spricht mit Edge-TTS (`--extra edge-tts`), in der App über Hermes' eigene Sprachpfade (HANDOVER 4.2c) |
| `werkzeuge/raeume.py` | Räume auf Hermes' gehosteten Gruppenräumen: anlegen, senden, Verlauf, Tür, verschmelzen, auflösen |
| `werkzeuge/suite_takt.py` | Taktgeber ohne Modell (Cronjob `tikki-takt`): `TAKT-RUNDE` an fällige Räume, Türen weiterreichen, Übungsergebnisse an den Hauptraum, Raumbericht für den Wachhalter |
| `werkzeuge/schluessel-einlesen.sh` | Schlüssel aus einer Textdatei in das Hauptprofil und die Rollenprofile übernehmen, ohne sie anzuzeigen; Postfach-Passwort, WhatsApp- und Bot-Token nur ins Profil `tikki` (`--profil`) |
| `werkzeuge/abos-einrichten.sh` | Prüft Abo-Kommandozeilen, Skills und Anmeldungen (ändert nichts); `--anmelden` meldet Claude-, Codex-, Grok-Abo je Rolle an |
| `werkzeuge/openclaw-einrichten.sh` | ClawHub-Katalog (OpenClaw) lokal, Skills auf Abruf in die Bibliothek `openclaw` |
| `werkzeuge/handover-mappe.sh` | Legt die komplette Handover-Mappe (Dokumente, Code-Bundle, umzug.sh) als Ordner auf den Schreibtisch |
| `UMZUG.md` + `werkzeuge/umzug.sh` | Komplettes Handover auf einen anderen Rechner: `umzug.sh packen` (Code-Bundle, Zustand, Schlüssel, Mappe) → `umzug.sh auspacken` |
| `werkzeuge/tikki-update.sh` | Tikki aktualisieren: `hermes update --branch tikki-app`, danach Rollen nachziehen und Selbsttest; nie ein nacktes `hermes update` |
| `werkzeuge/hermes-aktualisieren.sh` | Neue Hermes-Version per Merge übernehmen, alle Tikki-Prüfungen, dann Rollen nachziehen |
| `dienste/honcho/honcho.sh` | Honcho als eigener Dienst (Docker) |
| `dienste/tencentdb/tencentdb.sh` | TencentDB Agent Memory je Mensch und fürs System (Docker) |
| `plugins/gedaechtnis/` | Merkt nach jeder Runde Gespräche mit dem Menschen (TencentDB, RAG) und Wortmeldungen im Raum (Systemwissen, RAG); Daueraufträge nicht. Werkzeug `nachschlagen` |
| `plugins/pa/` | Persönliche Assistenz aus dem Backend, ein Toolset je Werkzeug: `post` (Postfach; nur mit eingerichtetem Postfach), `briefing` (`briefing_sammeln`), `modelle` (`lokale_modelle`), `ressourcen` (`ressourcen_stand`); `hermes pa status\|briefing\|post\|postfach\|freigabe\|modelle\|ressourcen` |
| `plugins/pa/ressourcen.py` | MR-Bot (Rolle `mr`, Port 8675): Werkzeug `ressourcen_stand` – Anbieter (Schlüsselnamen, erreichbar, Modelle), Abo-Kommandozeilen, lokale Server, Raumleiter-Klone, „Frei jetzt“ (geprüft im Profil des Klons); Stand in `~/.tikki/ressourcen.json`, stündlich per Cronjob `tikki-ressourcen`, im Wachhalter-Rundgang mitgelesen |
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

Nur in die `.env` der Profile (Hauptprofil und `profiles/<slug>/.env` unter der Hermes-Wurzel,
außerhalb des Repos, Rechte 600) – `schluessel-einlesen.sh` schreibt sie dorthin. Ein Gateway
bedient alle Profile; jedes liest seine Geheimnisse aus seiner eigenen `.env`.

| Variable | Zweck |
|----------|-------|
| `XAI_API_KEY` | Anbieter `xai` |
| `CURSOR_API_KEY` | Anbieter `cursor` |
| `API_SERVER_KEY` | Bearer-Schlüssel des HTTP-Dienstes, pro Profil |
| `HONCHO_API_KEY` | Nur für Honcho in der Cloud; der lokale Tikki-Dienst braucht keinen |
| `TIKKI_MAIL_PASSWORD` | Passwort des Postfachs, das Tikki im Backend liest (nur Profil `tikki`) |
| `WA_BRIDGE_TOKEN` | Token der WhatsApp-Bridge fürs Briefing (nur Profil `tikki`) |

Alles, was kein Geheimnis ist, steht in der `config.yaml` des Profils – etwa die Adresse des
Postfachs und die Empfänger, an die Tikki ohne Menschen senden darf:

```bash
hermes -p tikki pa postfach tikki@tikki.team          # plugins.entries.pa.settings.mail_address
hermes -p tikki pa freigabe --dazu @tikki.team         # … .mail_freigabe (Adresse oder @domain)
hermes -p tikki pa status
```

Führt ein Mensch das Gespräch, sendet Tikki ohne Rückfrage. In Daueraufträgen und Räumen geht Post
nur an freigegebene Empfänger; alles andere legt das Werkzeug als Entwurf ab, markiert die Mail
mit Stern und liefert die `BRAUCHE:`-Zeile dazu. Jede gesendete Mail liegt als Kopie in „Gesendet“.
Mailtext erreicht das Modell nur in Hermes' Rahmen für Fremdinhalte (`untrusted_tool_result`).

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

Ab 8650 (Tikki), je Rolle einer, nur auf `127.0.0.1` (Klone 8671–8674, MR 8675). Die Belegung
steht im Katalog; `rollen-status.sh` liest sie von dort.
