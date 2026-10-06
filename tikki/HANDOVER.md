# Tikki – Handover (Stand 28.09.2026 abends, Zweig `tikki-app`)

Dieses Dokument ist für die nächste Entwicklerin oder das nächste Claude Code, das auf dem
Zielrechner (Mac Studio) weiterarbeitet. Es beschreibt **was Tikki ist**, **was bereits
gebaut ist**, **wie es zusammenhängt**, **was offen ist** und **wie es weitergehen soll**.
Alles darin ist gegen den Code geprüft; Vermutungen sind als solche markiert.

---

## 0. Kurzfassung

- **Tikki** = Fork von [Hermes Agent](https://github.com/NousResearch/hermes-agent)
  (MIT, Nous Research, Stand v2026.9.24) im Repo `TikkiAL-boop/hermes-agent`,
  Arbeitszweig **`tikki-app`**, `main` folgt Upstream unverändert.
- **Eine App** (Electron, `apps/desktop`) mit fünf Bereichen in einer linken Leiste:
  **Tikki** (der Hermes-Chat) · **Browser** (mit Cookie-Auto-Klick) · **Post** (eigener
  IMAP/SMTP-Client für `name@tikki.team`) · **Terminal** · **Admin**.
- **Bot-Truppe**: 13 Rollen (`tikki/rollen/`), je ein Hermes-Profil mit eigenem Port, Modell
  und Ausweichkette, per Skript einrichtbar; neu der **Wachhalter** (Rundgang durch alle Räume).
- **Hermes-Kern (Python): zwei bewusste, kleine Änderungen** (Abschnitt 10): der App-Name kommt
  aus `productName` (`hermes_cli/desktop_identity.py`), und gehostete Gruppenräume nehmen 128
  statt 6 Mitglieder (`gateway/hosted_room_discussion.py`). Alles andere liegt in `apps/desktop`
  und `tikki/`. Updates übernimmt `tikki/werkzeuge/hermes-aktualisieren.sh` (Merge, nie Rebase;
  Abschnitt 4.12).
- **Räume (Suites)** (4.7a, 4.8): ein Raum ist ein **gehosteter Gruppenraum von Hermes** – er läuft
  im Gateway weiter, wenn die App zu ist; Tikki, Raumleiter und „Deine KI“ sitzen in jedem Raum,
  dazu beliebig viele Rollen aus dem Katalog; alle lesen alles mit. Lobby, Raum mit sichtbaren
  Wänden, rundem Tisch (Raumlog), To-do-Wand, Daten- und Output-Screen, **Türen** zwischen Räumen
  und **Verschmelzen** zweier Räume. **Die Raumübersicht öffnet Räume selbst**, sobald Tikki mit
  `RAUM:`/`ZIEL:` antwortet.
- **Dauerbetrieb** (4.8): Räume mit `TAKT:` laufen im Backend rund um die Uhr weiter, auch ohne
  App; der Wachhalter weckt alle 15 Minuten stille Räume. **Übungsläufe** (Standard 4): jeder
  Auftrag läuft parallel mit anderen Modellen, das erste fertige Ergebnis gewinnt, danach lernt
  der Raumleiter aus dem Vergleich.
- **Gedächtnis** (4.9): Honcho als Anbieter, dazu das Tikki-Plugin `gedaechtnis` (TencentDB je
  Mensch + System, RAG je Mensch, Hindsight optional, Werkzeug `nachschlagen`).
- **Sprache** (4.2c): Mikrofon im Raum, Vorlesen in Raum und Übersicht mit Tikkis Stimme – alles über
  Hermes' eigene Sprachpfade (Composer-Dictation, `playSpeechText`), Systemstimme nur als Rückfall;
  Konfiguration in der Rollenvorlage, Extras `voice` + `edge-tts` über `installieren.sh`.
- **Abos und Skills** (4.10, 4.11): Claude, Codex, Grok, Gemini, NotebookLM ohne Zusatzkosten;
  der ganze ClawHub-Katalog (OpenClaw) durchsuchbar, Skills auf Abruf.
- **Noch nicht gebaut**: PA-Modi im Vorzimmer, Nutzer-Login (heute fest `thorsten`),
  Rechnerflotte/Verteilung der Bots auf 40 Rechner, Web auf tikki.team.
- **Gesamtprüfung 02.10.** (`tikki/PRUEFBERICHT-2026-10-02.md`): 8 Prüfer + Gegenprüfung, 25 bestätigte
  Befunde; die „sofort“-Liste ist umgesetzt (memory-Werkzeug und alle Hermes-Skills in jedem Profil,
  keine Werkzeugbrücke für Tikki/Raumleiter, Updates auf dem Zweig festgenagelt, Postfach mit
  TLS-Prüfung und Automaten-Schutz, Takt robust, Wachhalter schläft ohne Arbeit, Terminal-Pane,
  Briefing nur im Tikki-Profil, Cookie-Tor, ESLint sauber, Selbsttest mit Takt-Status und
  Anbieter-Check, Installer erhält Modelle). Offen bleibt die „später“-Liste des Berichts (Modell je
  Raum über Raumleiter-Klone, Lock je Raum, Ereignisbudget, Vorzimmer-Breite, lokaler Modellplan).
- Offener Draft-PR: <https://github.com/TikkiAL-boop/hermes-agent/pull/1> (konfliktfrei,
  keine CI, wartet nur auf Merge-Entscheidung von Thorsten).

---

## 1. Was Tikki sein soll (Anforderungen von Thorsten, wörtlich sinngemäß)

### 1.0 Tikki 2 – Räume als Betriebssystem (Spezifikation 01.10., Thorsten)

Leitbild: Windows machte den Computer bedienbar, der Browser das Internet – **Tikki macht
KI-Agenten bedienbar**. Man denkt nicht in Chats, sondern in Räumen.

- **Ein Projekt = ein Raum.** Jeder Raum hat 4 Wände; Gespräch, Dateien, Pläne, Ergebnisse,
  Browser liegen sichtbar im Raum. Räume lassen sich **verschmelzen** (Recherche + Website-Bau
  → ein Raum mit gemeinsamem Gedächtnis).
- **Nach dem Login nur zwei Türen**: Neues Projekt / In ein Projekt gehen. Login nur für
  Adressen unserer Domains (z. B. `r@tikki.email`) mit PIN per Mail. **Beim Testen ist der Login
  aus**, er kommt zum Schluss.
- **Raumübersicht statt Vorzimmer.** Dort empfängt Tikki (PA) mit dem **Briefing** (ein Wort,
  egal ob täglich oder stündlich): was sie erledigt hat, was neu ist. Tikki arbeitet eigenständig
  nach Daueraufträgen – Mails im Takt prüfen („alle 4 Minuten“) und **selbst beantworten** (sagt
  Thorsten „schick weg“, wird geschickt, kein Nachfragen), Information aus einer Mail für die
  nächste nutzen, Gelerntes als Skill speichern, täglich YouTube und KI-News auswerten. Honcho
  ist ihr Gedächtnis über den Menschen.
- **Im Raum von Anfang an**: der Mensch, **seine KI** (Stimme, Sprachchat, leitet gleichzeitig
  weiter), **Tikki**, **Grok 4.7 über das Cursor-Abo als Raumleiter**. Dann Bots nach Bedarf,
  **ohne Obergrenze** (Hermes-Kern: 128 je Raum, 256 aktive Räume; die 2–6 der Hermes-Oberfläche
  gelten nicht). 100 Räume = 100 Raumleiter-Instanzen, aktiv nur wenn dran.
- **Alle Bots im Raum lesen mit.** Jeder weiß, was der andere tut. Bridge: jeder Bot erreicht
  jeden, Räume erreichen Räume (Hermes Bot Mode: Gruppenräume, Bot-zu-Bot-Nachrichten,
  Räume über Rechner hinweg – darauf wird aufgebaut, nichts Zweites erfunden).
- **MR-Bot (Model Resources)**: weiß, welche API-Schlüssel mit welchen Limits, welche CLIs,
  welche lokalen Modelle und Tools frei sind; meldet es dem Raumleiter; holt neue Bots.
- **Modelle**: Stand 01.10. **API zuerst** (schneller am Start), lokal später im Vergleich.
  Lokal ist Pflicht MLX (Apple), MoE (Tempo), unzensiert („ich will nicht hören: das mache ich
  nicht“) – Kandidaten `mlx-community` Qwen3-235B-A22B-4bit (~130 GB), GLM-4.5-Air-4bit (~60 GB),
  gpt-oss-120b, dazu abliterierte Varianten; Hermes verlangt ≥ 64k Kontext. Zwei Sprachkanäle:
  lokal und **xAI Ara**. API-Regeln legt Thorsten später fest; bis dahin maximale Leistung.
- **3D photorealistisch, sehr modern**; die Grafiken kommen von Thorsten, die Struktur muss sie
  aufnehmen können.
- Skills: alles Empfohlene aus Hermes plus OpenClaw nach Bedarf, maximal was Sinn ergibt.

Reihenfolge (01.10.): (1) Raumübersicht mit Tikki, Briefing und Daueraufträgen, (2) Räume auf
Bot-Mode ohne Grenze, Mitlesen, Verschmelzen, Bridge, (3) MR-Bot, (4) Sprache (Ara, lokal),
(5) lokales Modell im Vergleich, (6) Login, (7) 3D.


Diese Anforderungen sind die Messlatte. Nichts davon ist verhandelbar, außer Thorsten sagt
es ausdrücklich.

1. **Hermes als Basis, komplett anders gebrandet.** Name, Logo, Farben, Texte: Tikki.
   Hermes-Funktionen bleiben unangetastet (Skills, Tools, Gedächtnis, Gateway, Updates).
2. **Eine App**, die auf dem Mac Studio läuft und später auf **tikki.team** als
   Web-Oberfläche. Inhalt: Hermes-Chat, Browser, E-Mail-Programm, CLI-Tool, Admin.
3. **Browser**: Cookies automatisch akzeptieren.
4. **Post**: Login mit eigenem Postfach `name@tikki.team`. Später **ausschließlich**
   tikki.team-Adressen. Tikki soll mitlesen können.
5. **Admin**: „gut ausgebauter Admin-Bereich“.
6. **Gruppenräume**: pro Raum ein **Raumleiter** (Projektleiter) plus **bis zu 30
   Hermes-Bots**, alles im Chat sichtbar (runder Tisch). Erstes Gespräch nur mit dem
   Raumleiter; er holt Bots nach Bedarf. Dokumente hochladen. Rollen/Modelle im Raum
   sichtbar. E-Mail-Benachrichtigung bei Ergebnissen. Raum-ID
   `Projektname-username@tikki.team`, Raum auch als Postfach erreichbar.
7. **PA Tikki im Vorzimmer**: lokale KI im Hermes-Mantel, mit User-RAG, Daueraufträgen,
   Zugriff auf den Privatrechner. Bereiche: **Small Talk / Brainstorming / Planning /
   Get Work Done**.
8. **Gedächtnis**: Honcho, getrennt nach **Nutzer / System / Projekt**. Dazu Hindsight.
9. **Familie** als Nutzer: thorsten (Admin), karin, falco, jaspa, marlo, pirmin, rolf,
   sanus, tabea, tanja, zoe. Zur Zeit ein Nutzer, später Login nur mit tikki.team-Mail.
10. **Rechnerflotte**: ca. 40 Rechner, 5,5 TB Unified RAM („Riesen-Bot-Armee“).
11. **Dashboard**: „super aufgeräumt, so dass alle es intuitiv bedienen können“.
12. **Modelle** (letzter Stand):
    - Raumleiter / Projektleiter: **Cursor-Schlüssel mit Claude Opus 5.5**, Fallback
      **Grok 4.7**.
    - PA Tikki („PM“): **Grok 4.7**, Fallback **Opus 5.5**.
    - Die 10 Bots: Grok 4.7, Fallback Opus 5.5.
13. Branding: „mach das Branding wie du willst, das können wir später noch machen.“
14. Das Handover aus der früheren Sitzung (HANDOVER-ENTWURF.md, 28 Fragen usw.) nur „zur
    Anregung“, nicht als Vorgabe.

---


**Nachträge vom 28.09. (Thorsten, im Gespräch):**

13. **Oberfläche wie Menschen denken**: ein Projekt ist ein Raum mit Wänden; man sieht, dass alles
    darin nur hierher gehört. Futuristisch, ein Hintergrundbild reicht. Kein Mensch sieht „Hermes“.
14. **Vorzimmer**: Small Talk muss schnell gehen, Latenz ist Trumpf.
15. **Räume rund um die Uhr**: der Raumleiter läuft durch, alle berichten ihm, bis zu **50 Bots** je
    Raum; bald **hunderte Suiten** mit Cronjobs und Dauer-Recherche („jedes YouTube-Short checken“);
    auch nach Stromausfall muss es weitergehen.
16. **Wachhalter** („Stream-Agent“): geht Raum für Raum durch, weckt, kontrolliert Ergebnisse; ein
    Frontier-Modell per Abo-CLI oder lokal. Vorbereiten auf **Claude, Gemini, NotebookLM, Codex,
    Grok Build** (alles Abos); Perplexity hat keine kostenlose CLI.
17. **Übungsläufe**: Admin-Zahl „Taskrepeat“, Standard **4**: derselbe Auftrag vier Mal mit anderen
    KI-APIs und Ansätzen, daraus lernen. Der Mensch bekommt das Ergebnis **nicht langsamer** (der
    erste fertige Ansatz zählt), die Extras nur, wenn Ressourcen frei sind. Namen
    `Projektname-username-<nr>@tikki.team`.
18. **OpenClaw mit allen Skills**, **unser Wissen sauber in TencentDB**, Hermes muss **updatefähig**
    bleiben. Geplant: ein lokaler Hauptresearcher (~180 GB), über 40 KI-Rechner ≥ 128 GB.

## 2. Repo, Zweige, Zugriff

| Was | Wert |
|---|---|
| Repo | `https://github.com/TikkiAL-boop/hermes-agent.git` |
| Arbeitszweig | `tikki-app` (alle Commits hier) |
| Upstream-Zweig | `main` = Stand `09472a30` von NousResearch/hermes-agent |
| PR | #1, Draft, `tikki-app` → `main` |
| Commits auf `tikki-app` | siehe Abschnitt 11 |

**Arbeitsweise, damit sich niemand überschreibt:** vor eigener Arbeit `git pull origin
tikki-app`, nach eigener Arbeit `git push origin tikki-app`. Keine Rebase-/Force-Pushes auf
`tikki-app`. Kein Push auf `main`.

Die Cloud-Sitzung (Claude Code Web, Sitzung `session_019fXn2BhMxwUGgTD9KKX7dS`) hat einen
stündlichen Check-in auf PR #1 laufen. Wenn auf dem Mac gearbeitet wird, ist die Cloud
nicht mehr die einzige Quelle; ab jetzt gilt: **wer zuerst pusht, hat den Stand**.

---

## 3. Auf dem Mac einrichten und starten

**Umzug auf einen anderen Rechner mit allem (Code, Zustand, Schlüssel): `tikki/UMZUG.md`** –
`tikki/werkzeuge/umzug.sh packen` auf dem alten, `umzug.sh auspacken` auf dem neuen Rechner, dann
`installieren.sh`.

**Ein Befehl (empfohlen)** – installiert Kern, App, Rollen, Schlüssel, Dienste und prüft danach
alles mit dem Selbsttest:

```bash
git clone -b tikki-app https://github.com/TikkiAL-boop/hermes-agent.git ~/.hermes/hermes-agent
~/.hermes/hermes-agent/tikki/installieren.sh          # --help zeigt die Optionen
open -a Tikki
```

`installieren.sh` ruft den offiziellen Hermes-Installer (`scripts/install.sh --dir … --branch
tikki-app --include-desktop`) auf, kopiert `Tikki.app` nach `/Applications`, richtet die 13
Rollen ein, stellt das Vorzimmer auf `tikki`, übernimmt Schlüssel aus `~/Downloads/cv.cv.txt`
(Werte bleiben unsichtbar), prüft die Abos, installiert Raumleiter und Wachhalter als Dienst
und endet mit `tikki/werkzeuge/selbsttest.py` (✓/⚠/✗ je Schicht, Exit 1 bei Fehlern).
Nur prüfen: `tikki/installieren.sh --nur-pruefen`; Hermes schon da: `--ohne-kern`. Der Klon gehört nach `~/.hermes/hermes-agent`,
weil Hermes nur für diesen Ort die App in `/Applications` bei `hermes update` erneuert.

**Aktualisieren: immer `tikki/werkzeuge/tikki-update.sh`** (= `hermes update --branch tikki-app`).
Ein nacktes `hermes update` oder `/update` im Chat würde den Checkout auf `main` umschalten,
sobald der Update-Kanal keinen Eintrag für den Zweig kennt – dann fehlt `tikki/`, die Cronjobs
brechen mit ImportError und das Gateway startet als nacktes Hermes neu (02.10. nachgestellt;
rückgängig mit `git checkout tikki-app`). Darum setzen Installer und Rollenvorlage
`updates.auto_switch_parked_branch: false` (Hermes bricht dann mit „CODE UPDATE SKIPPED“ ab
statt zu wechseln). Upstream-Hermes holt weiterhin `tikki/werkzeuge/hermes-aktualisieren.sh`
per Merge herein (4.12).

Von Hand (Entwicklung):

```bash
git clone https://github.com/TikkiAL-boop/hermes-agent.git tikki
cd tikki
git checkout tikki-app

# Desktop-App
cd apps/desktop
npm ci                 # Node 22 (engines: ^22.22 || ^24.11 || >=26)
npm run build          # baut Renderer + Electron-Main + Guest-Preload nach dist/
npx electron .         # startet die App
```

Entwicklungsmodus mit Hot-Reload: `npm run dev` (startet Vite auf 5174 und Electron).

**Prüfungen, die vor jedem Push laufen sollten** (in `apps/desktop`):

```bash
npx tsc -p . --noEmit                        # Renderer-Typen
npx tsc -p tsconfig.electron.json --noEmit   # Electron-Typen
npx vitest run --project ui src/app/areas src/i18n src/themes
npx vitest run --project electron electron/tikki-mail.test.ts electron/preview-guest-cookie-consent.test.ts
npx prettier --check 'src/app/areas/**/*.{ts,tsx}' 'electron/tikki-*.ts' 'electron/preview-guest-*.ts'
```

Komplette Suite: `npx vitest run` (ca. 16 Minuten, 12.3k Tests). Bekannte Fehlschläge, die
**auch auf unverändertem Hermes** rot sind (Umgebung, nicht Tikki): `scripts/mac-sign.test.mjs`
(braucht `HERMES_PYTHON`), `electron/backend-probes-runtime.test.ts`,
`electron/updater/checkout-source.test.ts` (brauchen die Python-Laufzeit),
`src/store/voice-prefs.test.ts` (2 Tests), `electron/source-backend.test.ts` (Modul `ws`
fehlt im Workspace). ESLint läuft (`npx eslint src/ electron/ --quiet` aus `apps/desktop`,
Teil von `hermes-aktualisieren.sh --nur-pruefen`): 0 Fehler sind Pflicht, Warnungen dürfen
bleiben.

**Tikki komplett einrichten (Reihenfolge, auf dem Mac):**

```bash
tikki/werkzeuge/rollen-einrichten.sh              # 13 Rollen, Plugin, Skill-Ordner, Cronjobs
hermes profile use tikki                          # Vorzimmer = Profil tikki
tikki/werkzeuge/abos-einrichten.sh --anmelden     # Claude-/Codex-/Grok-Abo je Rolle
tikki/dienste/honcho/honcho.sh start              # Honcho (Docker)
tikki/dienste/tencentdb/tencentdb.sh start system # TencentDB fürs Systemwissen
tikki/dienste/tencentdb/tencentdb.sh start thorsten
hermes -p tikki gedaechtnis einspielen tikki/     # unser Wissen ins Gedächtnis
hermes -p tikki gedaechtnis verlauf               # bisherige Gespräche nachholen
tikki/werkzeuge/openclaw-einrichten.sh --vorab 25 # ClawHub-Katalog + erste Skills
hermes -p default gateway install                 # EIN Host-Gateway für alle Rollen: Räume, Takt, Rundgang
```

**Hermes-Backend**: Die App erwartet ein `hermes serve` (FastAPI, `/api/*`, Bearer-Token
`HERMES_DASHBOARD_SESSION_TOKEN`). Beim ersten Start bietet die App an, Hermes lokal zu
installieren oder sich mit einem laufenden Backend zu verbinden („Connect to existing
Tikki“: URL + Session-Token). Die Bereiche Browser, Post, Terminal, Admin funktionieren
technisch auch ohne verbundenes Backend, aber die Setup-Sperre der App liegt über allem, bis
eine Verbindung steht.

**Python**: Hermes-Lockfile verlangt Python ≥ 3.14, Installation über `uv`
(`uv sync --frozen --no-dev`). In der Cloud musste Python 3.14 standalone geholt werden;
auf dem Mac sollte der normale Hermes-Installer reichen.

**Hermes-Installation aus dem Repo** (`bash setup-hermes.sh`, dann `hermes` in `~/.local/bin`):
PM lädt Python, uv, node, npm, ripgrep und ffmpeg hash-geprüft aus `pm/lock.json`. Stolperstein
(Stand 28.09.): der gepinnte ffmpeg-Autobuild von BtbN (`autobuild-2026-09-10-15-31`) ist
upstream gelöscht (404); ohne Zugriff auf den Nous-Spiegel `hermes-assets.nousresearch.com`
bricht `pm install` daran ab, obwohl alles andere steht. Auf dem Mac sollte der Spiegel
erreichbar sein. Notweg, wie in der Cloud benutzt: `python -m pm.cli install node npm python
ripgrep uv`, dann `python -c "from pm.install import sync_venv; sync_venv(['all'], explicit=True)"`,
dann `python -I -X utf8 hermes_cli/_launchers.py ~/.local/bin` (jeweils das von uv
installierte Python 3.14). Testumgebung: `python -m pm.build_env --source . --out .venv
--group dev --group test`; Tests dann mit `HERMES_PYTHON=$PWD/.venv/bin/python scripts/run_tests.sh …`.

---

## 4. Architektur der Tikki-Schicht

### 4.1 Grundsatz

Hermes Desktop bleibt der Kern. Tikki legt drei Dinge darüber:

1. **Branding-Schicht**: ein Produktidentitäts-Modul, ein Textfilter über alle
   Sprachdateien, ein Theme.
2. **Bereichs-Shell**: eine linke Leiste und Ebenen, zwischen denen umgeschaltet wird.
   Der Hermes-Layoutbaum ist unverändert die Ebene „Tikki“.
3. **Tikki-Ordner** (`tikki/`): Rollen, Prompts, Skripte, Doku. Kein App-Code.

### 4.2a Design „Gelbes Glas“ (29.09., `apps/desktop/src/app/areas/tikki.css`)

Thorstens Vorgabe (mit vier Entwürfen): Grundfarbe **Gelb**, Räume mit sichtbaren Wänden,
alles Bedienbare als **Glasfläche mit Leuchtrand**, Vorzimmer mit Karten neben dem Chat.

- **Theme**: `TIKKI_ACCENT = '#f2c200'` (`themes/presets.ts`); `retintTheme` hält die
  Lesbarkeit (Akzenttext wird automatisch dunkler gestimmt). Hell und dunkel.
- **Token und Klassen** in `tikki.css`: `--tikki-gelb`, `--tikki-glas`, `--tikki-glow` …
  (Dunkel unter `:root.dark`), Klassen `.tikki-boden` (offener Boden mit Raster und Licht),
  `.tikki-raum` (Projektraum), `.tikki-glas`/`.tikki-glas-dicht`, `.tikki-knopf` (gelbe
  Leuchttafel, `aria-current`/`data-aktiv` = aktiv), `.tikki-knopf-still` (Glas), `.tikki-feld`,
  `.tikki-fenster-kopf`, `.tikki-wortmarke`. Hintergründe: `assets/tikki/boden-{hell,dunkel}.svg`,
  `suite-raum-{hell,dunkel}.svg` (erzeugt per Python, im Verlauf dieser Sitzung; Ersatz durch
  gestaltete Bilder ist vorgesehen, Liste der nötigen Grafiken siehe Chat-Prompt vom 29.09.).
- **Leiste** (`rail.tsx`): 10,5 rem breit, je Bereich eine Tafel mit Name und Zweck.
- **Vorzimmer** (`tikki/vorzimmer-rahmen.tsx`): Kopf „tikki VORZIMMER“ + Einstellungen, der
  **unveränderte Hermes-Layoutbaum** im Glas (seine Oberflächen-Token werden nur innerhalb
  von `.tikki-hermes-glas` durchscheinend gesetzt), rechts Karten „Deine Gesprächs-KI“,
  „Zuletzt besucht“, „Braucht dich“ (Suiten mit `needsInput`), „Neue Suite“ (öffnet die Lobby
  mit fokussiertem Formular über `$neueSuiteOffen`).
- **Lobby** (`suites-area.tsx`) nach Entwurf 1: links Verlauf als Leuchttafeln (Übungsläufe
  darunter), Mitte Suchfeld + Fenster „Suite erstellen | Suite verbinden“ (verbinden = bestehende
  Suite per Name betreten), darunter die Raumleiter-Karte, rechts „Benötigt deine Aufmerksamkeit“
  (wartet auf Antwort / neue Nachrichten).
- **Raum**: Raumbild gelb, Zonen als Glas, Chat in dichtem Glas, Abzeichen als Leuchtknopf.
- **Admin, Post, Terminal, Browser**: Boden + Glasflächen, Admin-Navigation als Tafeln.
- Hermes-Code unverändert; kein Hermes-Bereich wurde umgebaut, nur eingerahmt und getönt.

### 4.2a'' Tiefe – „mehr 3D, mehr aufwendig“ (06.10., `tikki.css` ab „Tiefe“)

Eine Bühne mit Fluchtpunkt statt flacher Karten, rein in CSS (kein WebGL, läuft auf jedem Mac):
`.tikki-buehne` setzt `perspective`, die Seitenspalten sind `.tikki-wand-links/-rechts` (um 14°
nach innen gekippt, beim Hover gerade), das Gespräch im Raum liegt als `.tikki-tischplatte`
erhöht über einer gelben Tischplatten-Ellipse mit Glanz und Schlagschatten, `.tikki-raum::before`
legt Deckenlicht und Vignette, `::after` ein perspektivisches Bodenraster. Jedes `.tikki-glas` hat
einen schrägen Lichtstreifen, der beim Hover wandert; `.tikki-knopf` ist erhaben (Kante unten,
Lift beim Hover, gedrückt beim Klick); `.tikki-podest` kippt den Ring der Grundbesatzung;
`.tikki-leiste` gibt der linken Leiste eine Kante. `prefers-reduced-motion` schaltet Kippen und
Lichtlauf ab. Die 3D-Grafiken von Thorsten (photorealistisch) ersetzen später die SVG-Hintergründe
(`--tikki-raum`, `--tikki-boden`), die Bühne bleibt.

### 4.2a' Raumübersicht und persönliche Assistenz (01.10.)

**Breite (03.10.):** Der Übersichts-Rahmen ist ein Container (`@container/vorzimmer`): unter 88 rem
werden Raumwand und rechte Karten schmaler (12/14 rem), unter 72 rem klappen sie weg und der
Hermes-Chat bekommt die volle Breite (vorher blieben ihm bei 1220 px Fenster 468 px). Geprüft unter
Xvfb bei 1100 und 1400 px.

Das Vorzimmer ist die **Übersicht** geworden (`tikki/vorzimmer-rahmen.tsx`): links die Wand mit allen
Räumen (Suche, Räume, die den Menschen brauchen, zuerst; `SuiteTafel` aus der Lobby), in der Mitte
Tikkis Chat (unveränderter Hermes-Baum im Glas), rechts Briefing, **Tikkis Daueraufträge**
(`tikki/auftraege.ts`: `cron.manage list` im Profil `tikki`, alle 60 s), Braucht dich, Zuletzt
besucht, Gesprächs-KI, Neue Suite, Update-Karte. **Briefing beim Ankommen**: öffnet das Gateway und
das letzte Briefing ist > 4 h her, gibt die App nach 12 s von selbst `BRIEFING …` an Tikki
(`briefing.ts::startBriefingAutomatik`, Schalter in Admin → Betrieb, Schlüssel
`tikki.briefing.automatik`; der Screenshot-Lauf setzt ihn auf `0`). Gesendet wird nur, wenn das
aktive Gateway-Profil die PA ist (`activeGatewayProfileKey() === PA_PROFIL`); steht gerade ein
anderes Profil im Chat (Raumleiter, Bot), passiert nichts und der Stempel `tikki.briefing.zuletzt`
bleibt, das Briefing ist weiter fällig.

Tikki arbeitet jetzt selbst (`rollen/tikki/SOUL.md`, Katalog `werkzeuge`: gedaechtnis, pa, web,
browser, file, terminal, skills, cronjob, todo). Plugin **`tikki/plugins/pa/`**:

- `post` – Postfach über IMAP/SMTP aus dem Backend (`post.py`, Serverregeln wie
  `electron/tikki-mail.ts`; Zugang `TIKKI_MAIL_ADDRESS`/`TIKKI_MAIL_PASSWORD` in der `.env`):
  ungelesen, lesen, antworten (im Faden, markiert erledigt), senden, erledigt. „Schick weg“ heißt
  schicken, ohne Rückfrage (SOUL). Seit 02.10.: IMAP/SMTP prüfen Zertifikate
  (`ssl.create_default_context`), Automaten (Auto-Submitted, Precedence bulk/list, List-Id/
  -Unsubscribe, noreply/mailer-daemon – Tabelle wie Hermes' E-Mail-Adapter) stehen in `ungelesen`
  als `automatisch` und werden nie beantwortet, Antworten gehen an Reply-To mit
  `Auto-Submitted: auto-replied`, und `\Answered` wird VOR dem Senden gesetzt (lieber eine
  Antwort zu wenig als doppelt).
- `briefing_sammeln` – Ausgaben der Daueraufträge seit dem letzten Briefing
  (`<profil>/cron/output/<job>/*.md`, Stempel `~/.tikki/briefing.json`), ungelesene Post, Räume
  mit `BRAUCHE`, WhatsApp über die WA-Bridge (`WA_BRIDGE_TOKEN`).
- `hermes -p tikki pa status|briefing|post|modelle` zum Prüfen.
- Daueraufträge legt Tikki mit dem Hermes-Werkzeug `cronjob` in ihrem Profil an; sie laufen nur,
  solange `hermes -p tikki gateway` läuft (→ `gateway install`, siehe Stolpersteine). Die Karte in
  der Übersicht zeigt sie (Name, Plan, nächster Lauf, pausiert).
- `lokale_modelle` (02.10.) – welche Modelle auf dem Backend-Rechner liegen (LM Studio `~/.lmstudio/models`,
  Ollama-Manifeste, Hugging-Face-Cache inkl. MLX, `~/Models`, `~/Downloads` flach) und welcher
  Modellserver gerade antwortet (Ports 1234/11434/8080/8000/8081/5000 plus `providers.lokal.base_url`),
  je Modell Größe, Parameter (auch MoE „235B, 22B aktiv“), Quantisierung und Startbefehl mit 64k Kontext;
  Ergebnis in `~/.tikki/modelle.json`. CLI `hermes pa modelle [--json] [--ordner …]`. **Die App sucht beim
  Start**: `areas/tikki/modelle.ts` ruft `cli.exec ['-p','tikki','pa','modelle','--json']` auf dem aktiven
  Gateway auf (läuft also auf dem Backend-Rechner, auch remote; `cli.exec` ignoriert den gerouteten
  `profile`-Parameter, darum steckt das Profil in argv) und zeigt die Karte „Modelle im Haus“ in der Übersicht
  (Server zuerst, dann bis zu sechs Modelle, Vorschlag Räume/Sprache). Tests `tests/tikki/test_modelle.py`
  (GGUF-Shards, MLX im HF-Cache, Ollama-Manifest, echter HTTP-Server), `areas/tikki/modelle.test.ts`.

`rollen-einrichten.sh` verlinkt jetzt **alle** `tikki/plugins/*`; der Selbsttest prüft jedes.
Verträge: `tests/tikki/test_pa.py`, `tikki/briefing.test.ts`, `tikki/auftraege.test.ts`.

### 4.2b Vorzimmer-Funktionen (29.09., Thorstens Punkte 1–4)

- **Eine schnelle KI im Vorzimmer über Cursor**: Katalog `tikki` → `cursor/claude-haiku-4-5`,
  Ausweich `xai/grok-4.7`, danach `cursor/claude-opus-5.5`, lokal. **Prüfen**: die genaue
  Modell-ID im Cursor-Katalog; in Admin → Modelle jederzeit umstellbar. Schlüssel liegen bei
  Thorsten in einer Textdatei im Download-Ordner: `tikki/werkzeuge/schluessel-einlesen.sh
  ~/Downloads/<datei> --danach-loeschen` (`schluessel.py`: erkennt Anbieter an Namen oder
  Schlüsselform, schreibt `KEY=wert` in `~/.hermes/.env` und jede Rollen-`.env`, Rechte 600,
  zeigt nie Werte; Test `tests/tikki/test_schluessel.py`).
- **Browserzeile** im Vorzimmer-Kopf (`vorzimmer-rahmen.tsx` → `browser-area.tsx::oeffneImBrowser`,
  Regel in `browser-adresse.ts`): Adresse, Host oder Suchbegriff → die ganze App wird zum Browser;
  „Zum Vorzimmer“ links in der Tab-Leiste führt zurück. Tikki selbst kann Seiten öffnen: eine Zeile
  `ÖFFNE: <Adresse>` in ihrer Antwort (SOUL, Abschnitt Browser; `vorzimmer.ts::oeffneAusText`).
- **Tagesbriefing** (`tikki/briefing.ts`): Knopf sammelt ungelesene Post (Mail-Brücke
  `tikkiMail`, INBOX), neue WhatsApps (WA-Bridge `127.0.0.1:8765`, Token in Admin → Betrieb
  bzw. `WA_BRIDGE_TOKEN`; Skill `whatsapp-hermes` beschreibt die API), wartende und zuletzt
  besuchte Suiten, und gibt alles als `TAGESBRIEFING …` an Tikki (SOUL: vortragen wie eine
  Assistentin am Morgen). **Vorlesen**: Schalter neben dem Knopf; jede fertige Antwort im Vorzimmer
  wird gesprochen – seit 06.10. mit Tikkis Stimme über Hermes-TTS, Systemstimme (de-DE) nur als
  Rückfall (4.2c). Geprüft im Durchlauf: die Nachricht landet im Chat und öffnet eine Sitzung.
- **Update-Wächter** (`tikki/update-waechter.ts`, `tikki/hermes-basis.json`): vergleicht beim Start
  und alle sechs Stunden den Hermes-Stand, auf dem tikki-app aufsetzt, mit `NousResearch/hermes-agent`
  `main` (GitHub-API, ohne Schlüssel) und zeigt im Vorzimmer die Karte „Tikki-Update verfügbar“
  mit Anzahl und Befehl. `hermes-aktualisieren.sh` schreibt die Basis nach jedem Merge.
- **Lobby**: Räume, die auf den Menschen warten, leuchten atmend mit Glocke (`data-braucht`).
- **Raum**: „Türen“ im Kopf führen in andere Räume (mehrere Räume je Projekt, der Reihe nach
  begehbar); unten die **Grundbesatzung** (Raumleiter, Gedächtnis, Wachhalter, Prüfer, Suche); links
  „Am Tisch“ die Bots, die gerade arbeiten. Räume „verbinden“ inhaltlich: das Gedächtnis-Plugin
  spiegelt jeden Raum in die RAG-Sammlung, `nachschlagen` liest also raumübergreifend.

### 4.2c Sprache – Tikki spricht und hört zu (06.10.)

Kein eigenes Sprach-Backend: Tikki nutzt Hermes' Sprachtechnik, so wie der Hermes-Composer sie
nutzt. Gemeinsamer Kern `areas/tikki/stimme.ts`, verwendet von Übersicht und Raum.

**Hören (Raum).** Im Eingabefeld des Raums (`suite-room.tsx::Sprechen`) sitzt neben „Senden“ ein
Mikrofon-Knopf (`data-suite-mikro="idle|recording|transcribing"`, `aria-label`, kein `title`).
Er benutzt den Dictation-Hook des Hermes-Composers (`app/chat/composer/hooks/use-voice-recorder.ts`
→ `use-mic-recorder.ts`): ein Druck startet die Aufnahme mit dem Mikrofon des App-Rechners
(MediaRecorder, Mikrofon-Freigabe über `hermesDesktop.requestMicrophoneAccess`), der nächste Druck,
Stille oder die Kappe (120 s) beendet sie; `stimme.ts::transkribieren` schickt die Aufnahme wie der
Composer: zuerst **provider-direkt** (`lib/voice-client-direct.ts`, wenn `/api/audio/voice-config`
einen Cloud-STT mit Schlüssel meldet – openai/groq/xai/elevenlabs/deepinfra), sonst **Relay**
`POST /api/audio/transcribe` (`hermes_cli/web_routers/audio.py`) → `tools/voice_mode.transcribe_recording`
→ `tools/transcription_tools.transcribe_audio` mit `stt.provider` des Profils. Das Transkript landet im
Textfeld (angehängt, nie gesendet); Fehler stehen als Zeile `role="alert"` über dem Feld (zusätzlich
Hermes' Toast). **Nicht** `voice.record`/`voice.toggle` (`tui_gateway/methods_voice.py`): die nehmen am
Mikrofon des *Backend*-Rechners auf (TUI-Pfad, `hermes_cli.voice.start_continuous`) und verlangen
`/voice on` – falsch, sobald die App ein entferntes Backend bedient.

**Sprechen (Raum und Übersicht).** `stimme.ts::sprich(text)` ruft Hermes' `lib/voice-playback.ts::
playSpeechText(text, {source: 'read-aloud'})` – dieselbe Leiter wie „Antworten vorlesen“ im Composer:
provider-direkt (openai/elevenlabs/deepinfra mit Schlüssel) → WebSocket `/api/audio/speak-stream`
(PCM, Satz für Satz) → `POST /api/audio/speak` (Base64-Data-URL). Synthese mit dem `tts.provider` des
**aktiven Profils** (Tikki); abgespielt wird im App-Fenster. Spielt Hermes nichts (kein Anbieter, kein
Extra, kein Backend), spricht die Browser-`speechSynthesis` (de-DE) – reine Entscheidung
`stimmeWaehlen`. Eine Stimme zur Zeit (Kette), `vorlesenStopp()` stoppt beide und verwirft Wartendes
(sonst würde die Systemstimme den von Hermes abgebrochenen Satz zu Ende sprechen). Ebenfalls nicht
`voice.tts`: das spricht über den Lautsprecher des Backends.

- **Raum**: Schalter `data-suite-vorlesen` im Raumkopf (Schlüssel `tikki.raum.vorlesen`). Ist er an,
  wird jede **neue** Nachricht des Raumleiters vorgelesen – reine Funktion `neuVorzulesen(nachrichten,
  abSeq)`: nur `von === 'raumleiter'`, nicht `(pass)`, keine Systemnachrichten, nichts vor der Marke;
  beim ersten Laden des Verlaufs wird nur die Marke gesetzt (Verlauf wird nie nachgelesen), die Marke
  wandert auch bei ausgeschaltetem Schalter mit.
- **Übersicht**: `briefing.ts::startVorleser` spricht jede fertige Antwort über `sprich` (vorher nur
  `speechSynthesis`); Schalter `data-vorzimmer-vorlesen`, Schlüssel `tikki.briefing.vorlesen`. Ein eigenes
  Mikrofon braucht die Übersicht nicht: der eingebettete Hermes-Composer hat es (`composer/voice-fan.tsx`
  → `onDictate` → derselbe `useVoiceRecorder`; `use-prompt-actions/index.ts::transcribeVoiceAudio`), es
  funktioniert, sobald `stt.enabled` und ein STT-Anbieter im Profil `tikki` nutzbar ist; daneben der
  Sprachgesprächs-Knopf (`voice.voice_chat_mode: chained`, STT → Turn → TTS, Reinreden stoppt die Stimme).

**Konfiguration** (`tikki/hermes/vorlage-rolle.yaml`, nur Hermes-Schlüssel aus `config_defaults.py`):
`voice.voice_chat_mode: chained`, `barge_in`, `stop_phrases: [stopp, stop]`; `stt.provider: local`
(faster-whisper auf dem Backend, `language: de`, `local.model: small`, VAD); `tts.provider: edge`
(`de-DE-KatjaNeural`, kostenlos, braucht Internet). Im Kommentar der Weg zu Piper
(`de_DE-thorsten-high`, offline) und zu MLX-Kokoro als Kommando-Anbieter (`tts.providers.<name>`,
`type: command`). **Was der Mac braucht**: `hermes pm install --extra voice --extra edge-tts` –
beides sind Hermes-Extras, *nicht* in der Grundinstallation (`pyproject.toml`: `edge-tts = false`,
`faster-whisper = false`); `installieren.sh` Schritt 8/9 „Sprache“ versucht es (Fehler = Hinweis,
`--ohne-sprache` überspringt). Ohne die Extras: Mikrofon meldet den Hermes-Fehler, Vorlesen fällt auf
die Systemstimme zurück. Mikrofon-Freigabe für Tikki.app in macOS-Systemeinstellungen → Datenschutz.
`selbsttest.py` Punkt **Sprache**: löst `stt`/`tts` des Profils `tikki` mit Hermes' eigener Auflösung
(`transcription_tools._get_provider`, `tts_tool._select_builtin_engine`) im Profil-Home auf, ohne
nachzuinstallieren (`pm.ensure_import` läuft dabei leer).

**Latenzziel**: erste Silbe < 1,5 s nach Ende der Aufnahme (Prüfbericht Schritt 4). Mit Edge-TTS
hängt es am Netz (~0,5–1 s je Satz), mit `small`-Whisper auf dem Mac ~1 s je 5 s Aufnahme; Piper
lokal ~0,2 s je Satz. Gemessen ist nichts – im Container gibt es weder Mikrofon noch Lautsprecher.
Tests: `areas/tikki/stimme.test.ts` (Stimmwahl, Reihenfolge und Stopp, `neuVorzulesen`),
`suites/suite-room.test.tsx` (Mikro-Knopf, Schalter, nur neue Raumleiter-Worte), Python
`tests/tikki/test_selbsttest.py` (Punkt Sprache: fehlendes Whisper mit Installationsweg, Edge-Fehltext,
kein Nachinstallieren). Ungeprüft: echte Aufnahme, echte Stimme, Mikrofon-Freigabe im gepackten Mac-Build.

### 4.2 Branding

| Datei | Zweck |
|---|---|
| `apps/desktop/product-identity.cjs` | **Die eine Stelle** für Produktname, App-ID, Zustandsordner. Varianten: `''` → Tikki/tikki/Tikki, `light` → Tikki Light, `bundled` → Tikki Agent. `ORG_KEBAB='team.tikki'`, `ORG_PASCAL='TikkiTeam'`. App-ID = `team.tikki.tikki` usw. Die CLI heißt weiter `hermes`. |
| `apps/desktop/src/i18n/brand.ts` | Textfilter: ersetzt `Hermes Agent/Desktop/Light` und `Hermes` (Wortgrenzen) durch `Tikki` in **allen** Locales beim Laden des Katalogs (`catalog.ts`). Kleines `hermes` (CLI, Pfade, URLs) bleibt. Exportiert `BRAND_NAME`. |
| `TIKKI_BRANDING=off` | Schalter (Umgebungsvariable, nur im vitest-UI-Projekt gesetzt, siehe `vitest.config.ts`): Filter wird No-op, `BRAND_NAME` = „Hermes“. So bleiben die ~40 Upstream-Tests grün, die den Hermes-Wortlaut prüfen. Die ausgelieferte App setzt das nie. `brand.test.ts` schaltet es für sich selbst wieder ein. |
| Acht Komponenten mit fest verdrahtetem Namen | `chat/intro.tsx`, `assistant-ui/thread/status.tsx`, `message-reactions.tsx`, `onboarding-chat/options.tsx`, `onboarding-chat/cards/setup.tsx`, `capabilities/scope-selector.tsx`, `quick-entry-app.tsx`, `intro-reveal/intro-root.tsx`: nutzen `BRAND_NAME`. `index.html` Titel und `electron/main.ts` („Tikki update“) sind Literale. |
| `apps/desktop/src/themes/presets.ts` | `TIKKI_ACCENT = '#7cb42e'` (Grün aus dem Logo), `tikkiTheme = retintTheme(nousTheme, TIKKI_ACCENT)`, `DEFAULT_SKIN_NAME = 'tikki'`. |
| `apps/desktop/assets/` | `icon.png/.icns/.ico`, `icon-dark.*`, `icon-mac.*` aus dem Nutzer-Logo (grüne Android-Dame im Ring, Original 450 px, hochskaliert und abgerundet). Quelle und Render-Skript: `assets/tikki/tikki-logo-original.png`, `assets/tikki/render-icons.mjs` (sharp + png2icons). **Offen**: ein Logo ≥ 1024 px würde die Icons schärfer machen. |
| `apps/desktop/src/lib/icons.ts` | Aliase `Puzzle`, `Server` auf Tabler-Icons ergänzt (Upstream-Datei `cards/setup.tsx` importierte `lucide-react`, das nicht installiert ist; brach Build und Typecheck). |
| `README.md` (Repo-Wurzel) | Tikki-Kopf vor der Hermes-Doku. |

### 4.3 Bereichs-Shell (`apps/desktop/src/app/areas/`)

| Datei | Zweck |
|---|---|
| `store.ts` | `AREAS = ['tikki','browser','post','terminal','admin']`, Atom `$area`, persistiert unter localStorage `tikki.desktop.area`, `setArea()`. |
| `labels.ts` | Alle Tikki-eigenen Oberflächentexte, de und en (`areaLabels(locale)`). Deutsch ist Standard, alle anderen Sprachen bekommen Englisch. Enthält `areas`, `browser`, `post` (kompletter Mail-Client), `admin` (Sektionen, Intros, Rollen, Bots, Nutzer, Rechner), `rail`. |
| `rail.tsx` | Linke Leiste (`data-area-rail`, 4,5 rem breit), fünf große beschriftete Knöpfe. Admin ganz unten (`marginTop: auto`). Auf dem Mac `pt-10` wegen Ampel-Knöpfen. |
| `shell.tsx` | `AreaShell`: Rail links, rechts eine `AreaLayer` je Bereich (absolute, `inset-0`). Inaktive Ebenen bekommen `invisible` + `hiddenPaneProps` (`data-pane-hidden`, `PaneVisibleContext`), damit Hermes-Panes wissen, dass sie unsichtbar sind. **Tikki** (Chat = `children`, der Hermes-Layoutbaum) ist immer gemountet. **Browser** wird beim ersten Besuch gemountet und bleibt es (Zustand geht nicht verloren). **Terminal**, **Post**, **Suiten** und **Admin** werden nur gemountet, wenn aktiv. Terminal bewusst: der Bereich hält keinen eigenen Zustand (die Shells leben im `PersistentTerminal`-Overlay), und das Overlay kann nur **einen** Slot bedienen – bliebe der Bereich gemountet, bliebe das Terminal-Pane im Chat nach dem ersten Besuch leer. |
| `browser-area.tsx` | Tab-Leiste über den bestehenden Hermes-Vorschau-Tabs (`$previewTabs`, nur `kind: 'url'`). Aktiver Tab persistiert unter `tikki.desktop.browser.activeTab`. Tabs werden per `markBrowserTabPopped(id, true)` als „herausgelöst“ markiert, damit der Chat-Baum sie nicht doppelt zeigt. `newBrowserTab()`, `closeRightRailTab()`. Rendert `PreviewTilePane` (Hermes-Komponente mit `<webview partition="persist:hermes-preview">`). |
| `terminal-area.tsx` | `ensureTerminal()` + `TerminalPaneChrome`. Nutzt den persistenten xterm-Overlay von Hermes. |
| `post-area.tsx`, `post/store.ts` | Mail-Client, siehe 4.5. |
| `admin/` | siehe 4.6. |
| Andockpunkt | `src/app/contrib/controller.tsx`: `<AreaShell><LayoutTreeRoot titlebar /></AreaShell>`. |
| Terminal-Overlay | `src/app/right-sidebar/terminal/persistent.tsx`: `registeredSlots[]` + `publishSlot()` (neuester Slot gewinnt; verschwindet er, übernimmt der vorige wieder – Test `persistent.test.tsx`, „returns to the earlier slot“), `terminalTakeover = takeoverPref || area === 'terminal'`. |

### 4.4 Browser: Cookie-Auto-Klick

| Datei | Zweck |
|---|---|
| `electron/preview-guest-cookie-consent.ts` | Reine Regeln, ohne DOM, testbar. `KNOWN_CONSENT_SELECTORS` (OneTrust, Cookiebot, Didomi, Quantcast, Sourcepoint, Usercentrics, TrustArc, Google `#L2AGLb`, Amazon `#sp-cc-accept`, Facebook, Bing …). `ACCEPT_TEXT` (deutsch zuerst: „alle akzeptieren“, „zustimmen“, „einverstanden“, …; dann en/fr/es/it/nl). `CONSENT_CONTAINER` (Regex über Attribute der Vorfahren: cookie, consent, cmp, gdpr, datenschutz …); die schwachen Wörter **banner/privacy/tracking** zählen nur, wenn daneben `cookie|consent` steht (Attribute oder Knopftext) – `looksLikeConsentContainer(attrs, text)`. Ein `class="banner"` mit „OK“-Link (Dev-Server, Streamlit, lokale HTML) wird nicht angefasst. `REJECT_TEXT` (ablehnen, einstellungen, verwalten, reject, manage …) wird nie geklickt. `MAX_CLICKS_PER_PAGE = 4`. `acceptOnce(host)`: erst bekannte Selektoren, dann generischer Knopf **nur innerhalb eines Consent-Containers**. `installCookieConsentAutoAccept(host)`: sofort, nach 800 ms, nach 2,5 s, dann bei DOM-Mutationen (entprellt 300 ms), Stopp nach Budget oder 45 s. `consentAllowedFor(url)`: Host-Tor, siehe nächste Zeile. |
| `electron/preview-guest-preload-entry.ts` | Der gebündelte Guest-Preload (`dist/preview-guest-preload.js`), den `main.ts` per `will-attach-webview` **nur** an Webviews mit Partition `persist:hermes-preview` hängt. Enthält den Upstream-Teil (Weiterleitung von `_blank`-Links an den Host) und neu den Consent-Teil: `deepQuery()` durchsucht Dokument **und offene Shadow Roots**, `describe()` baut `ConsentElement` (Attribute, Vorfahren-Attribute bis 12 Ebenen, sichtbarer Text, `getClientRects().length > 0`). Start bei `DOMContentLoaded`, aber **nur wenn `consentAllowedFor(location.href)`**: dieselbe Webview zeigt auch Hermes' Agenten-Vorschau (Dev-Server, Streamlit, lokale HTML). Der Auto-Klick läuft darum nur auf `http(s)`-Seiten fremder Hosts – nie auf `file:`, `localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0` oder `*.local`. |
| Tests | `electron/preview-guest-cookie-consent.test.ts` (Regeln, Prioritäten, Budget, Entprellung, Host-Tor, `class="banner"` + OK-Link bleibt unberührt). |
| Sicherheit | Der Preload teilt nur das DOM mit der Seite, nie die JS-Welt (contextIsolation). Er klickt nur Knöpfe, die die Seite selbst gerendert hat. |

### 4.5 Post: Mail-Client

**Hauptprozess** `electron/tikki-mail.ts` (Pakete `imapflow`, `nodemailer`, `mailparser`,
Typen `@types/nodemailer`, `@types/mailparser`; alle in `apps/desktop/package.json`):

- `resolveMailServers(address, env)`: `tikki.team` → `mail.tikki.email`, IMAP 993 TLS,
  SMTP 587 STARTTLS. Andere Domains → `mail.<domain>`. Überschreibbar mit
  `TIKKI_MAIL_IMAP_HOST`, `TIKKI_MAIL_IMAP_PORT`, `TIKKI_MAIL_SMTP_HOST`,
  `TIKKI_MAIL_SMTP_PORT` (Port 465 = implizites TLS).
- `normalizeMailAddress()`: klein, getrimmt, muss `x@y.z` sein. **Noch keine harte
  Beschränkung auf tikki.team** (Thorsten: „später ausschließlich“).
- `TikkiMailService`: `status()`, `login()` (prüft per IMAP-Connect, dann speichern),
  `logout()`, `mailboxes()` (mit Ungelesen-Zähler, sortiert Inbox/Drafts/Sent/Junk/Trash),
  `list(mailbox, limit)` (neueste zuerst, Envelope + Flags + Bodystructure), `read()`
  (voller Quelltext durch `mailparser`, markiert `\Seen`), `setSeen()`, `remove()`
  (verschiebt in `\Trash`, sonst löscht), `send()` (nodemailer, legt Kopie in `\Sent` ab).
- **Eine IMAP-Verbindung pro Vorgang** (connect / tun / logout). Bewusst einfach; für
  Familienpost reicht das. Wenn später Push/IDLE gewünscht ist, ist das die Stelle.
- Konto-Speicher: `<userData>/tikki-mail.json`, Passwort durch den Hermes-Secret-Store
  (`encryptDesktopSecret`/`decryptDesktopSecret` aus `main.ts`; safeStorage, wenn der Nutzer
  das eingeschaltet hat, sonst Klartext-Datei mit Rechten 0600, wie Hermes' eigene Tokens).
- Fehlertexte deutsch (`describeImapError`): Anmeldung abgelehnt / Server nicht gefunden /
  antwortet nicht.

**IPC** (`electron/main.ts`, direkt nach `hermes:secret-storage:set`): Kanäle
`tikki:mail:status|login|logout|mailboxes|list|read|seen|remove|send`.
**Bridge** (`electron/preload.ts`): `window.hermesDesktop.tikkiMail.{status,login,logout,
mailboxes,list,read,setSeen,remove,send}`. **Typen**: `src/global.d.ts` (importiert die
Typen aus `../electron/tikki-mail`).

**Renderer** `src/app/areas/post/store.ts` (nanostores: `$mailStatus`, `$mailboxes`,
`$mailbox`, `$messages`, `$selectedUid`, `$message`, `$compose`, `$busy`, `$error`,
`$notice`; Aktionen `refreshMailStatus`, `mailLogin`, `mailLogout`, `loadMailboxes`,
`openMailbox`, `loadMessages`, `openMessage`, `markUnread`, `removeMessage`,
`startCompose`, `startReply` (zitiert mit `> `, `Re:`), `cancelCompose`, `sendCompose`;
`cleanIpcError()` entfernt Electrons „Error invoking remote method“-Präfix).

`src/app/areas/post-area.tsx`: `SignIn` (Adresse + Passwort, Placeholder
`name@tikki.team`), `Mailbox` (drei Spalten: Ordner mit Ungelesen-Zahl · Nachrichtenliste mit
Aktualisieren · Leser), `Reader` (Betreff, Von/An/Kopie/Datum, Anhänge als Chips mit Größe,
HTML durch **DOMPurify** mit `FORBID_TAGS` style/form/input/button/iframe/object/embed,
sonst Klartext), `Compose` (An/Kopie/Betreff/Text, ersetzt den Leser). Fehler/Hinweise als
Leiste unten in der Mitte (`role=alert`/`status`).

**Tests**: `electron/tikki-mail.test.ts` (Server-Auflösung, Adress-Normalisierung,
Konto-Speicher, Login-Vorprüfung), `src/app/areas/post-area.test.tsx` (Anmeldung → Ordner →
Liste, Lesen mit sanitisiertem HTML, Antworten mit Zitat, Fehleranzeige; Bridge gestubbt).

**Nicht getestet**: echter Verkehr gegen `mail.tikki.email`. Aus der Cloud ist Port 993
gesperrt. **Erster Schritt auf dem Mac: Bereich Post öffnen, anmelden, Posteingang sehen,
eine Testmail senden.** Wenn der Server anders heißt oder Ports abweichen, die vier
`TIKKI_MAIL_*`-Variablen setzen oder `resolveMailServers` anpassen.

### 4.6 Admin (`src/app/areas/admin/`)

| Sektion (`sections.ts`) | Datei | Inhalt |
|---|---|---|
| `schluessel` | `schluessel.tsx` | Bettet Hermes' `ProvidersSettings view="keys"` ein. Schlüssel liegen beim Backend. |
| `modelle` | `modelle.tsx` | Tabelle aus `KATALOG.json` (Rolle, Modell, Ausweich, Port) + Hermes `ModelSettings`. |
| `regeln` | `regeln.tsx` | Liste der Rollen aus dem Katalog; liest/schreibt die SOUL je Hermes-Profil über `/api/profiles/<name>/soul` (`getProfiles`, `getProfileSoul`, `updateProfileSoul` aus `@/api/profiles`). Zeigt Hinweis, wenn das Profil auf dem Backend fehlt. |
| `bots` | `bots.tsx` | Karten je Rolle, fragt alle 30 s `http://127.0.0.1:<port>/health` ab (erreichbar/aus/unbekannt). |
| `nutzer` | `nutzer.tsx` | Familienliste (thorsten Admin, karin, falco, jaspa, marlo, pirmin, rolf, sanus, tabea, tanja, zoe) als **statische Vorlage**. Kein Login, keine Rechte. |
| `rechner` | `rechner.tsx` | Geplante Flotte als **statische Vorlage**: Mac Studio 512 (Tikki, Vorzimmer, Räume), 3× Mac Studio 256 (Bots/Forscher), 10× x86-Server, 22× DGX Spark, 3× MacBook M5 Max, 4–6× AMD Unified-RAM, Hetzner `consai` (tikki.team, Web/Honcho/Räume), Hetzner `tikkimail` (Post). Keine Selbstregistrierung. |
| `gedaechtnis` | `gedaechtnis.tsx` | Hermes `ProviderConfigPanel provider="honcho"`. |
| `system` | `system.tsx` | Hermes `GatewaySettings embedded`. |

`katalog.ts` importiert `tikki/rollen/KATALOG.json` direkt (relativer Pfad aus
`apps/desktop/src/app/areas/admin/`), Typ `KatalogRolle`.

### 4.7a Räume in der App (`apps/desktop/src/app/areas/suites/`, Stand 01.10.)

Thorstens Bild (28.09., erweitert 01.10.): Man geht in ein Projekt hinein wie in einen Raum. Am
**runden Tisch** sitzt der Raumleiter, dazu von Anfang an Tikki (die PA) und „Deine KI“, man
bespricht das Vorhaben, der Raumleiter holt Bots aus dem Katalog dazu – **so viele, wie der Raum
braucht, alle lesen alles mit**. An der Wand die **To-do-Liste**, dazu ein **Daten-Screen** und
ein **Output-Screen**. Räume haben **Türen** zueinander und lassen sich **verschmelzen**. Die Liste
(Verlauf) startet wie ein frisches Hermes: null Räume.

**Ein Raum ist ein gehosteter Gruppenraum von Hermes** (Bot Mode, `gateway/hosted_rooms.py`),
kein Chat der App. Darum läuft er weiter, wenn die App zu ist (4.8), und darum gibt es keine
6er-Grenze mehr (Kernänderung Nr. 2, Abschnitt 10). Die App redet mit ihm nur über die
Gruppen-RPCs des Backends (`groups.list/create/state/send/log/approve/rename/disband`) und
pollt den Raumlog alle 2 s – es gibt keinen Push. Dieselben Räume sieht und bedient
`tikki/werkzeuge/raeume.py` von der Kommandozeile (4.8).

| Datei | Zweck |
|---|---|
| `store.ts` | Eine `Suite` = Zeile aus `groups.list` (`id`, `titel`, `mitglieder`, `geaendert`, `letzteSeq`, dazu aus dem Log abgeleitet `brauche`, `fertig`, `arbeitet`). `ladeSuites()` liest die Liste und je Raum den Log-Schwanz (`groups.log`). `neueSuite(name, ziel, {rollen, takt})`: `raumId()` = `tikki-<slug>-<base36 ms>`, Besatzung = Katalogrollen mit `im_raum_ab_start` (tikki, raumleiter, deine-ki) + gewählte Rollen (`raumMitglieder`), `groups.create`, dann die Eröffnung als erste Nachricht (`eroeffnungsText`: `@raumleiter RAUM:` / `ZIEL:` / `ANNAHMEN:` / `TAKT:`), danach Übungsläufe als eigene Räume (`uebung.ts`). `auftragGeben` = `groups.send` in den Faden `haupt`; der Mensch ist im Raum anonym, der Text trägt deshalb `"<Name>: "` vorn (`$mensch`), und nennt er kein Mitglied (`sprichtJemandenAn`, Handles des Raums und `@all`), stellt die App `@raumleiter ` davor. `tuerSenden(von, nach, text)` schreibt `[Tür aus „A“] @raumleiter …` in den anderen Raum. `verschmelzen(a, b)` baut einen neuen Raum mit der Vereinigung der Mitglieder (`vereinteMitglieder`, nach Profil), zitiert die letzten 12 Nachrichten beider (`zusammenfassung`), löst beide auf. `freigeben` beantwortet Werkzeug-Freigaben (`groups.approve`), `aufloesen`, `umbenennen`. Reine Helfer mit Tests: `raumSlug`, `nachrichtAus` (Log-Ereignis → Nachricht; `(pass)` bleibt still), `werArbeitet` (`room.activity`/`turn.*`), `brauchtAus`, `fertigAus`, `standAus`, `aufgabenAus`/`aufgabenWand` (`AUFGABEN:` mit `- [ ]`/`- [x]`), `suiteStand`, `raumdienstFehlt` (Fehlerbild, wenn kein Gateway die Räume fährt). |
| `suites-area.tsx` | Lobby: Verlauf links (Räume, die auf den Menschen warten, zuerst; Übungsläufe eingeklappt unter ihrem Hauptraum), Formular „Suite erstellen“ (Name, Ziel, Takt, Rollen-Chips – Tikki, Raumleiter und Deine KI sitzen immer dort), „Suite verbinden“ (nach Namen), Karte „Immer am Tisch“ (Raumleiter mit Haupt- und Ausweichmodell). Rechts die Aufmerksamkeits-Leiste (`$suitesBrauchen`). Steht ein Raum in `$aktiveSuite`, zeigt der Bereich den Raum. |
| `suite-room.tsx` | Der Raum: Kopf (Zur Lobby, Titel, Marken `STAND:`/`BRAUCHE:`, **Türen**-Popover mit allen anderen Räumen und Textfeld, **Verschmelzen**-Popover mit Partnerwahl, Raumleiter „arbeitet“), links **To-do-Wand** (`aufgabenWand`) und **Am Tisch** (alle Mitglieder mit Modell, wer gerade spricht), Mitte **das Raumlog** (`useRaumLog`: `groups.log` ab `letzteSeq`, Freigabe-Leiste aus `groups.state`, Eingabe `Sprechen` → `auftragGeben`, Enter sendet), rechts **Daten-Screen** und **Output-Screen** (`suite-daten.ts` aus den Nachrichten). Unten die Grundbesatzung als Podest. |
| `suite-daten.ts` | Reine Funktionen: `eingabenAusNachrichten`, `ausgabenAusNachrichten`, `taktAusNachrichten`. |
| `uebung.ts` | Übungsläufe: Ansätze (Modell + Arbeitsweise), Titel `<Projekt>-<mensch>-<nr>@tikki.team`, `freieUebungen` (Kapazität aus `$kapazitaet`), Eröffnungstext `ÜBUNG k/N` + `ANSATZ:`. Jeder Übungslauf ist ein eigener gehosteter Raum (Mitglieder wie der Hauptraum); das Modell je Raum setzt heute das Profil, nicht der Raum (offen, 4.8). |
| `../tikki/vorzimmer.ts` | Raumübersicht: erkennt Tikkis `RAUM:` + `ZIEL:` (dazu `ANNAHMEN`, `TAKT`), legt den Raum im Hintergrund an und zeigt „Raum betreten“. |
| Raumbild | `src/assets/tikki/suite-raum.svg`: Zentralperspektive, Rückwand mit Screen, Seitenwände mit Tafeln, Bodenraster, runder Tisch; die Zonen liegen als Glas davor. |
| Tests | `store.test.ts` (Kennung, Besatzung aus dem Katalog, Nachrichten aus Ereignissen, Stand/Brauche/Aufgaben, Verschmelzen-Mitglieder, Reihenfolge, Übungsläufe), `suite-room.test.tsx` (Log, Freigaben, Türen, Verschmelzen gegen ein Gateway-Double), `suites-area.test.tsx`, `suite-daten.test.ts`, `tikki/vorzimmer.test.ts`. |

Hermes-Änderungen dafür: im Python-Kern die Mitgliedergrenze (Abschnitt 10). Der frühere Export
`TileChat` (`app/chat/session-tile.tsx`) und `holdSessionTranscript` (`store/session-states.ts`)
stehen noch im Baum, die Räume brauchen sie seit dem Umbau nicht mehr (Rückbau beim nächsten
Hermes-Merge möglich).

Geprüft am 01.10. in der verpackten App unter Xvfb gegen `hermes serve` + `hermes -p default
gateway run` (Harness `shots-raum.mjs`): Lobby → „Suite erstellen“ mit Rechercheur → Raum mit
vier Stühlen (Tikki, Raumleiter, Deine KI, Rechercheur), Eröffnung im Log → Auftrag per Enter
erscheint als zweite Nachricht → Türen-Popover listet die anderen Räume → Verschmelzen-Popover
bietet Partner → Zur Lobby (Eintrag „Raumleiter arbeitet“) → Raum erneut öffnen zeigt beide
Nachrichten. Im Speicher `shared-state.db` steht derselbe Raum mit denselben vier Mitgliedern,
und das Gateway hat den Turn des Raumleiters geplant (`turn.*`-Ereignisse). Eine Antwort kam in
der Cloud nicht, weil nur das 135M-Modell zur Verfügung stand (5.0).

**Ein Modell je Raum – Raumleiter-Klone (03.10.).** Der Katalog führt neben `raumleiter` vier Klone
(`klon_von: "raumleiter"`): `raumleiter-xai`, `raumleiter-anthropic`, `raumleiter-codex`,
`raumleiter-lokal` (Ports 8671–8674). Ein Klon erbt SOUL, Werkzeuge, Freigabe und Einstellungen des
Originals und nennt nur Modellkette, Port und Namen (`rollen_config._vererben`, `raeume.katalog()`,
`admin/katalog.ts`); `rollen-einrichten.sh` legt ihn als eigenes Profil mit der Raumleiter-SOUL an.
Im Raum bleibt er `@raumleiter` (member_id/handle), nur `profile` ist das des Klons –
`raeume.anlegen(..., raumleiter="raumleiter-xai")` bzw. CLI `anlegen --raumleiter`, in der App
`raumMitglieder(rollen, KATALOG, klon)`. Übungsläufe nehmen je Ansatz einen Klon (`uebung.ts`:
`klon` statt provider/model), laufen damit wirklich mit anderen Modellen und – weil Hermes' Turn-Lock
je Profil greift – parallel zum Hauptraum. Backend ohne Klon-Profile: `groups.create` lehnt das
Profil ab, die App fällt auf den Raumleiter zurück. `ROLLEN` (ohne Klone) ist die Liste für
Auswahl-Chips, Bots und Regeln; Admin → Modelle zeigt die Klone mit. Neu angelegte Profile bekommen
immer die Katalogmodelle (`hermes profile create` kopiert sonst die config des aktiven Profils).

Offen an den Räumen: Vorschau von Dateien direkt im Output-Screen, Nutzerrechte je Raum,
Raum-Postfach, ein Klon je Raum frei wählbar in der App (heute: Hauptraum = Raumleiter,
Übungsläufe = Klone nach Ansatz).

### 4.8 Dauerbetrieb: Takt, Türen, Wachhalter, Übungsläufe (`tikki/werkzeuge/suite_takt.py`)

**Was wo läuft.** Die Räume fährt Hermes selbst: ein Tikki-Raum ist ein gehosteter Gruppenraum
(`gateway/hosted_rooms.py`, Speicher `<Hermes-Wurzel>/shared-state.db`, Regeln
`gateway/hosted_room_discussion.py`). Der **Gateway-Prozess** (`hermes gateway run`, oder jedes
`hermes serve`) plant nach jeder Nachricht des Menschen die Runden der Mitglieder und führt sie in
den Profilen aus – auch bei geschlossener App. Der 24/7-Treiber ist deshalb `hermes gateway install`
(ein Gateway genügt; es bedient alle Profile). Sitzungen der Mitglieder heißen `Group: <raum-id>` im
jeweiligen Profil – **nie** per `hermes chat --resume` anfassen, sie sind eingezäunt; alles geht über
`raeume.senden`. Grenzen des Kerns: je Mensch-Nachricht höchstens **3 Runden und 10 veröffentlichte
Antworten**, **ein laufender Turn je Profil** über alle Räume (`turn_lock` in
`tui_gateway/hosted_room_driver.py` – zwei Räume mit demselben Rechercheur warten aufeinander),
**4 Räume gleichzeitig je Gateway-Prozess** (`HostedRoomRuntime(max_concurrent_rooms=4)`), 128
Mitglieder je Raum, 256 aktive Räume. Eine Nachricht ohne `@` fragt **jedes** Mitglied der Reihe
nach – darum sprechen Takt, Türen, Wachhalter und Übungsergebnisse immer `@raumleiter` an.

**Konventionen** (fest, mit dem Desktop-Team geteilt): Raum-Kennungen beginnen mit `tikki-`, der
Hauptfaden heißt `haupt`, Nachrichten des Menschen stehen als `"<Name>: <text>"` im Log. Mitglieder
sprechen nur mit etwas Neuem, sonst genau `(pass)`. Der Raumleiter schreibt je Zeile `STAND: …`,
`BRAUCHE: …`, `FERTIG: …`, `AUFGABEN:` mit `- [ ] …`/`- [x] …`, `TÜR: <Raum> | <Text>`; `TAKT: …`
steht in der Eröffnung des Menschen (oder der Raumleiter bestätigt sie; die letzte Zeile gilt,
`TAKT: aus` beendet). Nur Zeilen des Raumleiters zählen – das `STAND: <Datum>` des Rechercheurs ist
keine Raumaussage. Die letzte Raumleiter-Nachricht gilt; `BRAUCHE:` bleibt offen, bis der
Raumleiter wieder `STAND:`/`FERTIG:` ohne `BRAUCHE:` schreibt oder der Mensch antwortet
(Systemnachrichten `TAKT-RUNDE`, `WACHHALTER:`, `ÜBUNGSERGEBNIS`, `LERNEN:`, `[Tür …]` zählen nicht;
App und Takt lesen das mit derselben `_SYSTEM`-Regex, Spiegeltests mit denselben drei Texten in
`store.test.ts` und `test_suite_takt.py`). Eine Nachricht des Menschen ohne `@` eines Mitglieds
stellt die App als `@raumleiter …` ein, sonst fragt der Kern jedes Mitglied der Reihe nach.

**Taktgeber ohne Modell.** Cronjob `tikki-takt` im Profil `raumleiter` (alle 5 Minuten,
`--no-agent`, Skript `scripts/tikki-takt.sh`) ruft `suite_takt takt`. Der liest alle Räume über
`raeume.liste()`/`verlauf()` (lange Räume: Anfang + die letzten 1500 Ereignisse), hält seinen
Zustand in `<Hermes-Wurzel>/tikki/takt.json` (fcntl-Sperre) und stellt drei Arten von Nachrichten
ein, alle über `raeume.senden`/`raeume.tuer`:

- **Takt-Runde:** Takt verstanden wie bisher (stündlich, alle N Minuten, täglich HH:MM, werktags,
  montags …, Cron, alles aus `parse_schedule`); fällig nach Hermes' `compute_next_run` ab der letzten
  Runde, ein neu gesehener Takt beginnt mit der nächsten Gelegenheit. Dann genau eine Nachricht
  `@raumleiter TAKT-RUNDE <n> · <Zeit>: …`. Dass der Raum danach wieder nur 3 Runden/10 Antworten
  bekommt, ist der Sinn: der Takt stößt ihn alle N Minuten neu an.
- **Türen:** neue `TÜR:`-Zeilen des Raumleiters seit der letzten gelesenen Zeile (`gesehen` je Raum)
  werden einmal weitergereicht: Ziel nach genauem Namen, dann eindeutigem Namensanfang (ohne Groß-
  und Kleinschreibung), dann Kennung; im Zielraum steht `[Tür aus „<Raum>“] @raumleiter <Text>`.
  Unzustellbare Türen bleiben im Zustand (`unzustellbar`) und erscheinen im Bericht.
- **Übungsläufe:** Räume `<Projekt>-<mensch>-<nr>@tikki.team` gehören zum Hauptraum `<Projekt>`
  (`uebungsgruppen`). Das **erste fertige** Übungsergebnis geht als `@raumleiter ÜBUNGSERGEBNIS <nr>:
  <FERTIG-Text + letzter STAND>` einmal in den Hauptraum, solange der nicht selbst fertig ist; sind
  alle durch (fertig oder einen Tag still) und der Hauptraum fertig, einmal `@raumleiter LERNEN: …`
  (Merker `_uebung` in takt.json). Anlegen der Übungsräume: App (Admin → Betrieb,
  `suites/uebung.ts`), unverändert.

**Bericht.** `suite_takt bericht [--json]` je Raum: Kennung, Titel, Mitglieder, still seit,
Takt, letzte Takt-Runde, `STAND:`, `BRAUCHE:`, fertig, offene/erledigte Aufgaben, wer gerade
arbeitet (`turn.started` ohne Ende), unzustellbare Türen, letzter Fehler beim Einstellen. Das
Briefing der PA (`plugins/pa/briefing.py`) nimmt daraus die Räume mit `BRAUCHE:`. Im Textmodus
endet der Bericht mit `{"wakeAgent": false}`, wenn `weckbedarf()` nichts findet (kein `BRAUCHE:`,
kein Raum ohne Takt mit offenen Aufgaben > 30 min still, kein Fehler) – Hermes' Cron lässt den
Wachhalter-Lauf dann ohne Modell enden (`cron/scheduler_prompt.py::_parse_wake_gate`). Ein Raum,
der eine Nachricht ablehnt (aufgelöst, Budget voll), kostet im Tick nur sich selbst: `takt` fängt
`HostedRoomError` je Raum, schreibt `takt.json` immer (`try/finally`) und endet mit Exit 1.

**Wachhalter** (Rolle `wachhalter`, Port 8662, kein Raummitglied): Cronjob `tikki-rundgang` alle
15 Minuten, Vorlauf-Skript `tikki-raumbericht.sh` (= `suite_takt bericht`). Er weckt stille Räume
mit `hermes --run-module tikki.werkzeuge.raeume senden <raum> "@raumleiter WACHHALTER: …"` (kommt
sofort zurück; das Gateway fährt die Runde), lässt `FERTIG:` ohne Prüferurteil prüfen, meldet Hänger
und offene Türen, beantwortet nie `BRAUCHE:`. SOUL: `tikki/rollen/wachhalter/SOUL.md`.

**SOULs im Raum.** Der Raumleiter ist Mitglied wie alle: seine Runde öffnet die Nachricht des
Menschen oder die `TAKT-RUNDE`; Kolleginnen und Kollegen spricht er mit `@slug` an und liest ihre
Antworten in den Folgerunden; `delegation` nur für zusätzliche Hände, die kein Mitglied sind. Jede
andere Rolle hat einen Abschnitt „Im Raum“ (alles mitlesen, nur angesprochen oder mit Neuem
sprechen, sonst `(pass)`, nie selbst `BRAUCHE:` – das sagt sie `@raumleiter`). Tests:
`tests/tikki/test_suite_takt.py` (gegen den echten Speicher), `test_raeume.py`.

**Wichtig – Werkzeuge der Bots:** Hermes gibt einem delegierten Kind nie mehr Werkzeuge als dem
Elternteil (`tools/delegate_tool_toolsets.py`). Der Raumleiter trägt deshalb die Vereinigung aller
Bot-Werkzeuge, und seine SOUL listet je Rolle die `toolsets`, die er mitgibt
(Format ``- `slug`: tool, tool``). Test: `test_room_lead_carries_every_bot_toolset_and_its_soul_names_them`.

### 4.9 Gedächtnis-Plugin und TencentDB (`tikki/plugins/gedaechtnis/`, `tikki/dienste/tencentdb/`)

- Plugin (in jedem Profil unter `plugins/gedaechtnis` verlinkt, `plugins.enabled`): nach jeder
  Runde (`post_llm_call`) im Hintergrund (`spawn_context_thread`, die Runde wartet nicht) an
  TencentDB (Instanz des Menschen und `system`, `POST /capture`), Hindsight (falls Adresse
  eingetragen) und die RAG-Sammlung des Menschen. RAG = SQLite FTS5 je Mensch unter
  `~/.tikki/rag/<mensch>.sqlite`, optional Vektoren über `rag.embedding` (OpenAI-kompatibel).
- Werkzeug `nachschlagen(frage, quelle=alle|rag|tencent|hindsight)` im Toolset `gedaechtnis`
  (Profile `tikki`, `raumleiter`, `wachhalter`). Honcho hat eigene Werkzeuge über den Anbieter.
- CLI: `hermes -p tikki gedaechtnis einspielen <pfade>` (Markdown/Text, ohne Doppel),
  `… gedaechtnis verlauf` (alle bisherigen Gespräche aller Profile), `… gedaechtnis status`.
- Einstellungen `~/.tikki/gedaechtnis.json` (nur Adressen, Pfade zu Schlüsseldateien, Namen von
  Umgebungsvariablen). `tencentdb.sh start system|<mensch>` baut das Docker-Bild (Pin `29bb8dff`),
  startet je Instanz einen Container (system 8420, Menschen ab 8421, eigener Schlüssel und
  Datenordner) und trägt sie dort ein.
- **Geprüft** gegen den echten TencentDB-Gateway (aus dem Quellstand mit Node gestartet, weil die
  Cloud kein Docker hat): Aufnahme, Suche über `/search/conversations`, Einspielen von `tikki/`.
  L1-Fakten brauchen den LLM-Schlüssel (`XAI_API_KEY`) und waren deshalb leer.
- Hindsight ist vorbereitet (Adresse + Bank in der Einstellung), aber nicht getestet.

### 4.10 Abos statt Schlüssel (`tikki/werkzeuge/abos-einrichten.sh`, `tikki/skills/`)

**SuperGrok-Abo als letztes Glied jeder Kette (03.10.):** jede Rolle trägt `xai-oauth/grok-4.7` am Ende
von `weitere`. Hermes' Provider `xai-oauth` nutzt die Browser-Anmeldung des SuperGrok-/Premium+-Abos
(`hermes auth add xai-oauth`, einmal je Rechner); ohne Anmeldung wird das Glied beim Ausweichen
übersprungen. So laufen die Räume mit API-Schlüssel, fallen bei Limit oder Ausfall aber auf das Abo
zurück („Tokens nur Strom“ gilt dann fürs Abo-Kontingent).

- Als Rollen-Modell: `anthropic` (Claude-Abo; Hermes liest auch `~/.claude/.credentials.json`),
  `openai-codex` (ChatGPT/Codex-Abo), `xai-oauth` (SuperGrok), `lokal` (eigener Modellserver,
  `providers.lokal` in der Vorlage, `http://127.0.0.1:8080/v1`). Anmeldung je Profil:
  `abos-einrichten.sh --anmelden`.
- Als Werkzeug der Bots: Skills `claude-code`, `codex` (aus `skills/autonomous-ai-agents/`), `grok`
  (offizieller optionaler Skill, in die Bibliothek installiert), `gemini-cli`, `notebooklm`
  (Browser mit angemeldetem Google-Konto, NotebookLM hat keine private CLI), `openclaw-skills`.
  Jede Rolle mit dem Werkzeug `skills` sieht über `skills.external_dirs` (von `rollen_config.py`
  gesetzt) `tikki/skills`, **alle eingebauten Hermes-Skills** (`<repo>/skills` als ein Eintrag –
  Coding-Agenten, `research`, `media/youtube-content` usw. folgen Git ohne Kopien) und die
  OpenClaw-Bibliothek. Ein erneuter `rollen-einrichten.sh`-Lauf lässt `model`/`fallback_providers`
  einer vorhandenen config.yaml stehen (`hermes model`, Admin → Modelle); Katalogmodelle erzwingt
  `--modelle-zuruecksetzen`. `known_plugin_toolsets` hält die Plugin-Toolsets `pa`/`gedaechtnis`
  aus Rollen heraus, die sie im Katalog nicht haben.
- Perplexity: keine kostenlose CLI, nicht angebunden.

### 4.11 OpenClaw-Skills (`tikki/werkzeuge/openclaw_skills.py`, `openclaw-einrichten.sh`)

ClawHub hat rund 50 000 Skills. Alle in jedes Profil zu installieren würde jeden Aufruf aufblähen
und fremde Anweisungen ungeprüft verteilen. Stattdessen: Profil `openclaw` als gemeinsame
Bibliothek; `openclaw-einrichten.sh` legt den ganzen Katalog lokal ab
(`~/.tikki/openclaw-katalog.json`), `--vorab N` installiert die ersten N gleich; Bots suchen mit
dem Skill `openclaw-skills` und installieren auf Abruf (`hermes -p openclaw skills install
clawhub/<slug> --yes`, mit Hermes' Sicherheitsprüfung). Eine vorhandene `~/.openclaw` zeigt
`hermes claw migrate --dry-run` als Vorschau. **Nicht live geprüft**: clawhub.ai ist aus der
Cloud gesperrt.

### 4.12 Update-Fähigkeit und Markenwache

- `tikki/werkzeuge/hermes-aktualisieren.sh [--von <url|remote>]`: prüft Zweig und sauberen Stand,
  holt Hermes' `main`, merged (nie Rebase), sagt bei Konflikten, was Tikki gehört
  (`--ours`) und was Hermes gehört, und lässt danach die Tikki-Prüfungen laufen
  (`--nur-pruefen`: Python-Tests `tests/tikki`, Desktop-Typecheck + Tests, Rollen-Trockenlauf).
- Eingriffe außerhalb der Tikki-Ordner (bei Konflikten von Hand wieder einsetzen):
  `electron/` (Produktidentität, Mail-Dienst, Cookie-Klick), `index.html`, `package.json`,
  `product-identity.cjs`, `app/chat/session-tile.tsx` (`TileChat` exportiert, `ownerRoute`),
  `store/session-states.ts` (`holdSessionTranscript`), `components/assistant-ui/thread/
  system-message.tsx` und `tool/delegate.tsx` (Bots unter Namen), `lib/chat-messages/*` und
  `lib/chat-runtime.ts` (`asyncResultSource`), `i18n/brand.ts` + `catalog.ts`, `lib/icons.ts`,
  `themes/presets.ts`, `components/chat/intro.tsx`, `drawer.css`, `vitest.config.ts`.
- **Markenwache** (`areas/markenwache.ts`): die i18n-Texte sind beim Laden umbenannt
  (`i18n/brand.ts`); für fest verdrahtete Texte und Backend-Meldungen („open in another Hermes
  window“) beobachtet ein MutationObserver die Seite und ersetzt „Hermes“ durch „Tikki“ in
  sichtbarem Text, `placeholder` und `aria-label`. Ausgenommen: Nachrichtentexte (`.aui-md`,
  Nutzer-Nachrichten), Code, Eingaben, Terminal, Browser-Webviews. So bleiben Hermes-Dateien
  unverändert und Updates konfliktarm.

### 4.13 MR-Bot – Model Resources (`tikki/plugins/pa/ressourcen.py`, Rolle `mr`)

Thorstens Wunsch (1.0): ein Bot, der immer die Übersicht über alle Modell-Ressourcen hat und dem
Raumleiter sagt, welche Kraft gerade frei ist. Gebaut nach der Footprint-Leiter als Erweiterung des
PA-Plugins, kein Kern.

- **Werkzeug `ressourcen_stand`** (Toolset `pa`) und CLI `hermes pa ressourcen [--json]` bzw.
  `hermes --run-module tikki.plugins.pa.ressourcen [--json]`. Sammelt (a) **Anbieter** aus
  `providers.*` aller Rollen-Configs plus Hermes' eingebaute, die der Katalog nennt (`anthropic`,
  `openai-codex`, `xai-oauth`, …): Schlüssel gesetzt – **nur Namen**, Werte bleiben im Modul –,
  `GET /models` (5 s, wie `selbsttest.pruefe_anbieter`, dort unverändert), erste 20 Modell-IDs, bei
  Abo-Anbietern `get_auth_status` (liest nur); (b) **Abo-Kommandozeilen** `claude`, `codex`,
  `gemini`, `grok` über `hermes_platform.resolver.locate_command` (kein `shutil.which`), `--version`
  mit Timeout, Anmeldedatei (`~/.claude/.credentials.json`, `~/.codex/auth.json`,
  `~/.gemini/oauth_creds.json`); (c) **lokal** über `modelle.sammeln()`; (d) **Raumleiter + Klone**
  mit Modellkette (`raeume.katalog()`); (e) **„Frei jetzt“**: welcher Klon nutzbar ist, nach seinem
  Hauptmodell geordnet lokal (Server läuft) → Abo-Klon (angemeldet) → API-Klon (Schlüssel gesetzt
  und erreichbar). Hermes' `hermes usage` braucht Netz je Anbieter und ist nicht aufgenommen.
  Ergebnis mit Zeitstempel in `~/.tikki/ressourcen.json` (`TIKKI_HOME`); Textausgabe: Tabelle
  „Anbieter | Schlüssel | erreichbar | Modelle“, Abos, Lokal, Raumleiter-Klone, `Frei jetzt: …`.
- **Rolle `mr`** (📡, Port 8675, `cursor/claude-haiku-4-5` → `xai/grok-4.7` → `xai-oauth/grok-4.7`,
  Werkzeuge `pa`, `terminal`, `file`, `skills`, `memory`, nicht ab Start im Raum). SOUL
  `tikki/rollen/mr/SOUL.md`: spricht nur auf `@mr` oder bei Ausfall, nennt die Alternative als
  Klon-Slug (`@raumleiter nimm raumleiter-xai`), nie Schlüsselwerte. Der Raumleiter trägt dafür
  `pa` in seinen Werkzeugen (Delegation gibt nur weiter, was er hat) und fragt laut SOUL bei Ausfall
  oder Limit `@mr`.
- **Dauerauftrag `tikki-ressourcen`** (Profil `mr`, stündlich, `--no-agent`, Skript
  `scripts/tikki-ressourcen.sh`), angelegt von `rollen-einrichten.sh` wie `tikki-takt`.
- **Wachhalter**: `suite_takt bericht` endet mit dem Block „Ressourcen“ aus `ressourcen.json`
  (`ressourcen.kurzbericht`: Frei jetzt, Ausfälle, Hinweis, wenn älter als 2 h) – nur gelesen, der
  Rundgang klopft nicht selbst an; `weckbedarf` unverändert.
- **App**: Admin → Modelle, Karte „Ressourcen (MR)“ (`areas/admin/ressourcen.ts`, Marke
  `TIKKI-RESSOURCEN `, `cli.exec ['-p','tikki','pa','ressourcen','--json']`): Anbieter mit ✓/⚠/–,
  Abos, Lokal, „Frei jetzt“. Tests: `tests/tikki/test_ressourcen.py` (Fake-HTTP 200/404, kein
  Schlüsselwert im Stand, Reihenfolge, Datei unter `TIKKI_HOME`, Rundgang liest nur),
  `admin/ressourcen.test.ts`.

### 4.7 Bot-Truppe (`tikki/`)

| Datei | Zweck |
|---|---|
| `rollen/KATALOG.json` | Liste von 13 Rollen. Felder: `slug`, `name`, `icon`, `kurz`, `kategorie`, `modell.{primary,fallback}` (Form `anbieter/modell`), `werkzeuge` (Hermes-Toolset-Namen), `freigabe` (`smart`), `port`, `hermes_profil`, `im_raum_ab_start`. |
| Rollen und Ports | `tikki` 8650 (Vorzimmer, grok-4.7 → opus-5.5, keine Werkzeuge) · `raumleiter` 8651 (opus-5.5 → grok-4.7, Werkzeuge: `delegation`, `todo`, `gedaechtnis` plus alle Bot-Werkzeuge zum Weitergeben, im Raum ab Start, bis 50 Bots) · `rechercheur` 8652 · `pruefer` 8653 · `schreiber` 8654 · `frontend-entwickler` 8655 · `backend-entwickler` 8656 · `sicherheitsbeauftragter` 8657 · `datenanalyst` 8658 · `organisator` 8659 · `api-fachmann` 8660 · `uebersetzer` 8661 (alle grok-4.7 → opus-5.5, `smart`, alle mit `skills`) · `wachhalter` 8662 (Claude-Abo → Codex-Abo → lokal) · `raumleiter-xai/-anthropic/-codex/-lokal` 8671–8674 (Klone, 4.7a) · `mr` 8675 (Model Resources, haiku-4-5 → grok-4.7 → SuperGrok, Werkzeuge `pa`, `terminal`, `file`, `skills`, `memory`, 4.13). Felder neu: `modell.weitere` (weitere Ausweichmodelle), `einstellungen` (tief in die config.yaml gemischt, z. B. Vorzimmer `agent.reasoning_effort: low`, `display.streaming`). |
| `rollen/<slug>/SOUL.md` | 53–90 Zeilen je Rolle: Was du tust / Was du nie tust / Protokoll. Gemeinsame `## Hausregeln` am Ende jeder Datei: Deutsch, kurz, keine Modellwerbung, Aufgaben zu Ende bringen, Mensch nur per Zeile `BRAUCHE: …` mit Vorschlag, Ergebnisse im Raum-Chat. Der Raumleiter hat zusätzlich Delegationsformat, Rundenschleife, To-do-Listen „Tikki“ und „Du“, Stoppregel. |
| `hermes/vorlage-rolle.yaml` | Vorlage für `~/.hermes/profiles/<slug>/config.yaml` mit **echten Hermes-Schlüsseln**: `model.{provider,default}`, `fallback_providers`, `providers.{cursor,xai}` (`base_url`, `key_env`, `api_mode: chat_completions`), `approvals.mode: smart`, `platform_toolsets.{api_server,cli}`, `platforms.api_server.{enabled,extra.host,extra.port}`, `delegation.{max_concurrent_children: 30, max_spawn_depth: 1}`, `display.compact`. |
| `werkzeuge/rollen-einrichten.sh` | Legt je Rolle ein Hermes-Profil an, idempotent (`--dry-run`, `--nur <slug>`). Schreibt SOUL.md und config.yaml, **nie Schlüssel**. Echter Lauf in der Cloud (`d18ef6cd`): 12 Profile angelegt, zweiter Lauf ein No-op, `hermes -p <slug> doctor` meldet „Config version up to date“. |
| `werkzeuge/rollen_config.py` | Erzeugt die `config.yaml` einer Rolle. Das Skript ruft es über `hermes --run-module tikki.werkzeuge.rollen_config` auf, also im von Hermes verwalteten venv (eine PM-Installation hat kein `.venv` und kein `~/.hermes/hermes-agent/venv`); Rückfall: ein Python mit ruamel.yaml. Stempelt `_config_version` aus `hermes_cli.config_defaults`, sonst stuft Hermes die Datei beim ersten Start als unversioniert ein, schreibt sie neu, und das Skript dreht sie beim nächsten Lauf zurück. Tests: `tests/tikki/test_rollen_config.py`. |
| `werkzeuge/rollen-status.sh` | Fragt `/health` je Port ab (`--host`, `--timeout`). |
| `README.md` | Deutsch: Was liegt hier, Truppe, Einrichten auf dem Mac, Modelle und Ersatz, Schlüssel, Post und Browser, Ports. |

**Geheimnisse**: kommen ausschließlich aus Umgebungsvariablen `XAI_API_KEY`,
`CURSOR_API_KEY`, `API_SERVER_KEY` (Bearer je Profil in `~/.hermes/profiles/<slug>/.env`).
**Achtung**: Thorsten hat einmal einen Cursor-Schlüssel (`crsr_…`) im Chat gepostet. Der
gilt als kompromittiert und sollte in Cursor neu erzeugt werden. Niemals Schlüssel ins Repo,
in Logs oder in Chats.

**Zu prüfen**: `providers.cursor.base_url = https://api.cursor.com/v1` ist eine Vorgabe;
gegen die aktuelle Cursor-Doku prüfen (die Cloud-Umgebung blockt `api.cursor.com`). Ob
Cursors API Opus 5.5 unter dem Namen `claude-opus-5.5` anbietet, ebenfalls prüfen; sonst
im Katalog anpassen.

---

## 5. Was verifiziert ist und was nicht

### 5.0 Testlauf mit lokalem Modell (29.09., in der Cloud)

Ohne API-Schlüssel wurde ein echter Modellserver aufgesetzt (`llama-cpp-python[server]` mit
SmolLM2-135M-Instruct, dem einzigen Modell, das der Container-Proxy hergab – Hugging Face und
Ollama sind dort gesperrt). Provider `lokal`, `LOKAL_API_KEY=lokal`, Profile `tikki` und
`raumleiter` auf `lokal/tikki-schnell`. Ergebnis:

- **Kette steht**: `hermes -p tikki chat -Q` → Antwort in 54 s; verpackte App unter Xvfb:
  Frage im Vorzimmer → Antwort im Chat nach 11 s; Plugin `gedaechtnis` spiegelt die Runde
  (Frage + Antwort + Sitzung) in die RAG-Sammlung (`~/.tikki/rag/thorsten.sqlite`, Tabelle
  `stuecke`). Der Inhalt der Antworten ist bei 135M Parametern Unsinn – geprüft ist die
  Leitung, nicht die Qualität.
- **Hermes verlangt ≥ 64k Kontext je Modell** (`agent/agent_init.py::_enforce_minimum_context`);
  mit 8k bricht der Start ab. Für den lokalen Hauptrechner heißt das: Server mit ≥ 64k
  starten (Kommentar in `hermes/vorlage-rolle.yaml`), sonst `model.context_length: 65536`.
- **Prompt-Masse Vorzimmer**: Systemprompt ~2,7k Token (Schätzung Zeichen/4; der
  SmolLM2-Tokenizer zählte 8,5k für den ganzen Prompt), Werkzeuge nur der `tool_search`-Dreier
  (~830 Token), weil `platform_toolsets.cli = [gedaechtnis]` alles andere hinter die Brücke
  legt. Der Desktop nutzt denselben Schlüssel `cli`. Ohne diese Einschränkung wären es 24
  Werkzeuge mit ~11k Token – der Katalogeintrag `werkzeuge: ["gedaechtnis"]` ist also die
  Latenz-Stellschraube des Vorzimmers.
- **Beim Start warnt Hermes** `platform 'cli' has no valid toolsets configured (unknown
  name(s): gedaechtnis)`. Das Plugin-Werkzeug `nachschlagen` ist trotzdem als „1 deferred“
  hinter `tool_search` da (Log `tools.tool_search`); die Warnung kommt aus der Prüfung vor dem
  Plugin-Laden. Noch nicht bewiesen: dass das Modell `nachschlagen` über die Brücke wirklich
  aufrufen kann – mit echtem Modell auf dem Mac einmal „Was weißt du über …“ fragen.
- **Der Desktop merkt sich das zuletzt gewählte Modell je Nutzerdaten** (Modellwähler der
  Hermes-Oberfläche), nicht das `model.default` des Profils: ein alter Zustand ließ das
  Vorzimmer auf `bedrock` laufen, bis die Nutzerdaten frisch waren. Auf dem Mac nach der
  Installation einmal im Vorzimmer prüfen, dass die Karte „Deine Gesprächs-KI“ das
  Vorzimmer-Modell zeigt; sonst im Modellwähler umstellen.
- Honcho (`memory.provider: honcho`) meldet ohne laufenden Dienst bei jeder Sitzung
  „Connection refused“ im Log – harmlos, verschwindet mit `tikki/dienste/honcho/honcho.sh start`.

**Verifiziert (Cloud, headless unter Xvfb mit Playwright `_electron.launch`)**:
- Build durchläuft; App startet; Rail mit den Bereichs-Knöpfen ist im DOM.
- `window.hermesDesktop.tikkiMail.status()` liefert `{address:null, signedIn:false}`; ein
  Login-Versuch meldet sauber den Netzfehler.
- Typecheck beider Seiten sauber; komplette vitest-Suite grün bis auf die in Abschnitt 3
  genannten, auf Upstream identischen Fehlschläge.

**Nicht verifiziert (nur auf dem Mac möglich)**:
- Wie die fünf Bereiche wirklich aussehen (Screenshots konnte die Cloud nicht liefern: die
  Setup-Sperre der App ließ sich headless nicht überwinden, obwohl das Backend-Token per curl
  gültig war).
- Post gegen den echten Server.
- Cookie-Auto-Klick auf echten Seiten (Regeln sind getestet, das DOM-Verhalten nicht).
- Die Bot-Truppe live (`rollen-einrichten.sh` ohne `--dry-run`, dann `hermes serve` je
  Profil; Modelle brauchen die Schlüssel).
- Electron-Builder-Pakete (`npm run dist:mac`): nie gelaufen. Die `files`-Whitelist ist
  `dist/**, assets/**, public/**, package.json`; die neuen Pakete sind in
  `dist/electron-main.mjs` gebündelt, sollten also mitkommen.

---

## 6. Sicherheits- und Designentscheidungen, die man kennen muss

1. **Passwort bleibt im Hauptprozess.** Die Oberfläche bekommt nie das Mailpasswort,
   nur `{address, signedIn}`.
2. **Mail-HTML** wird mit DOMPurify bereinigt und in ein `div` gerendert (kein iframe).
   Remote-Bilder werden geladen (Tracking-Pixel möglich). Wenn das stört: `img[src]`
   entfernen oder Bilder erst auf Klick laden.
3. **Cookie-Klick** ist absichtlich konservativ: generische Knöpfe nur in erkennbaren
   Consent-Dialogen, nie „Ablehnen/Einstellungen“, vier Klicks je Seite. Falsch-Positive
   sollten praktisch nicht vorkommen; eher werden exotische Banner nicht erkannt. Dann
   Selektor in `KNOWN_CONSENT_SELECTORS` ergänzen.
4. **Branding über Filter statt Umbenennen** der Sprachdateien, damit Upstream-Merges
   nicht zu Konfliktschlachten werden. Neue Hermes-Strings werden automatisch mitgebrandet.
5. **Kein Hermes-Python-Code geändert.** Wenn die Räume Backend-Logik brauchen, soll das
   als **Hermes-Plugin/Skill** oder als eigener Dienst neben Hermes entstehen, nicht als
   Patch im Kern.
6. **Deutsch zuerst.** Alle Tikki-eigenen Texte in `labels.ts` de + en; Prompts der Rollen
   deutsch.
7. **Kein Modell-Marketing** in Oberfläche oder Prompts (Hausregel).

---

## 7. Offene Punkte, die bei Thorsten liegen

1. App auf dem Mac starten, alle fünf Bereiche anschauen, Rückmeldung (besonders: Post-Login,
   Cookie-Klick, Optik der Rail).
2. `bash tikki/werkzeuge/rollen-einrichten.sh` ausführen; vorher `XAI_API_KEY`,
   `CURSOR_API_KEY` als Umgebungsvariablen. Cursor-Schlüssel neu erzeugen.
3. Cursor-`base_url` und Modellname für Opus 5.5 bestätigen. Vor `rollen-einrichten.sh` den
   Endpunkt testen: `curl -H "Authorization: Bearer $CURSOR_API_KEY" https://api.cursor.com/v1/models`
   (200 = gut; 404/401 → Katalog auf `xai` umstellen; der Selbsttest-Punkt „Anbieter“ prüft
   dasselbe für jeden Anbieter mit Schlüssel).
4. Bestätigen, dass `mail.tikki.email` mit 993/587 der richtige Server ist.
5. Optional: Logo in ≥ 1024 px liefern.
6. PR #1 mergen oder offen lassen (beides ist in Ordnung).

---

## 8. Nächste Bauschritte (Reihenfolge, wie mit Thorsten besprochen)

### 8.1 Räume (der Kern der Idee) – Schritt 1 gebaut, Rest offen

Ziel: Ein Raum ist ein Chat mit einem Raumleiter und bis zu 30 Bots; alles sichtbar.

**Gebaut (Schritt 1, Weg (a), nur Renderer):** Delegationen erscheinen im Chat unter dem Namen
und Icon der Rolle. Hermes' `delegate_task` kennt keine Rollen (das `role`-Argument ist
tot, ein Kind ist nur „Task 2 von 5“); die einzige Stelle, an der eine Rolle steht, ist die
`AN: <rolle>`-Zeile, die der Raumleiter laut Hausprotokoll in jede Aufgabe schreibt.
`apps/desktop/src/app/areas/tikki/rollen.ts` liest sie aus dem Aufgabentext und löst sie
gegen `KATALOG.json` auf (Slug, Name oder Profilname, Umlaute egal); der Titel der Zeile
ist dann der `AUFGABE:`-Absatz statt des Protokollblocks.

- Laufende/abgesetzte Delegation: die bestehende Hermes-Karte je Kind
  (`components/assistant-ui/tool/delegate.tsx`, `DelegateRowView`) zeigt Icon + Rollenname vor
  dem Auftrag (`data-tikki-bot="<slug>"`). Ohne `AN:`-Zeile bleibt alles wie in Hermes.
- Fertige Hintergrund-Delegation: die Sammelnotiz (`display_kind: async_delegation_complete`)
  wird nicht mehr als zugeklappte Zeile „2 background agents finished“ gezeigt, sondern als
  **Runder Tisch**: je Bot ein offener Block mit Icon, Name, Status (Fertig / Fehlgeschlagen /
  Unvollständig) und dem Bericht als Markdown (`areas/tikki/bot-ergebnisse.tsx`). Dazu trägt die
  Hydration den rohen Umschlag als `asyncResultSource` (`lib/chat-messages/hydration.ts`,
  `types.ts`, `lib/chat-runtime.ts`, `use-session-actions/utils.ts` COMPARED); `botErgebnisse()`
  in `rollen.ts` zerlegt `[ASYNC DELEGATION BATCH COMPLETE …]` an den `--- ✓ TASK i/n: … ---`-
  Köpfen, dazu `… COMPLETE` (eine Aufgabe) und `… TASK FAILED` (Frühwarnung). Was nicht
  parst, fällt auf die Hermes-Zeile zurück (`thread/system-message.tsx`).
- Tests: `areas/tikki/rollen.test.ts`, `areas/tikki/bot-ergebnisse.test.tsx`.
- Nicht enthalten: eigener Bereich „Räume“, Raum anlegen, Live-Ereignisse `subagent.*` mit
  Rolle (die Live-Zeile im Karten-Ticker bleibt Hermes' Aktivitätstext), Bots als eigene
  Profile/Ports (Delegation läuft heute im Prozess des Raumleiters mit dessen Werkzeugen).

Vorgeschlagene Architektur (Vorschlag, noch nicht abgestimmt im Detail):

- **Raum = Hermes-Session des Raumleiter-Profils** (Port 8651). Der Raumleiter nutzt
  Hermes' `delegation`-Toolset, um Bots zu beauftragen (`max_concurrent_children: 30`).
  Bots sind eigene Hermes-Profile (Ports 8652–8661), erreichbar über ihre API-Server.
- **Sichtbarkeit im Chat**: Delegationen und Bot-Antworten müssen als eigene Nachrichten
  im Raum-Chat erscheinen (Name + Icon der Rolle aus dem Katalog). Zwei Wege: (a) die
  Delegations-Tool-Aufrufe und -Ergebnisse im Renderer als „Bot-Nachrichten“ rendern
  (nur Frontend, kein Backend-Patch), (b) ein Raum-Dienst, der die Bot-API-Server aufruft
  und alles in eine gemeinsame Chronik schreibt. Empfehlung: mit (a) starten.
- **Raumverwaltung** (neuer Bereich „Räume“ oder Unterbereich von Tikki): Raum anlegen
  (Projektname, Ziel, Nutzer), Rollen sichtbar, Dokumente hochladen (Hermes-Dateianhänge),
  Raum-ID `Projektname-username@tikki.team`.
- **Post-Anbindung**: Ergebnis-Benachrichtigung per Mail (der Mail-Dienst existiert:
  `TikkiMailService.send`). Raum-Postfach kann später Alias auf dem Mailserver sein.
- **Modi**: Small Talk / Brainstorming / Planning / Get Work Done als Auswahl beim Start
  des Vorzimmer-Gesprächs; steuern SOUL-Zusatz oder Systemprompt-Präfix.

### 8.1a Gedächtnis: Honcho + TencentDB Agent Memory + Hindsight + RAG (Plan 28.09., Thorsten)

**Ziel:** Kein Wissen, kein Workflow geht verloren. Tikki kann in vier Speichern nachschlagen.

| Speicher | Wofür | Anbindung an Hermes | Stand |
|---|---|---|---|
| **Honcho** | System, jeder Mensch, jede Suite: dialektisches Nutzermodell, Sitzungszusammenfassungen | Eingebautes Hermes-Plugin `plugins/memory/honcho`, **der eine** `memory.provider` jedes Tikki-Profils. Workspace `tikki`, `peerName` = Mensch (heute `thorsten`, später per Login-Alias), `aiPeer` = Rolle, `sessionStrategy: per-session` → **eine Honcho-Sitzung je Suite** | **Verdrahtet und in der App**: Honcho läuft als **eigener Tikki-Dienst auf dem Rechner** (Thorsten: „muss in die App mit rein“, keine Cloud): `tikki/dienste/honcho/honcho.sh start|stop|status|logs` holt plastic-labs/honcho (Pin v3.2.1, `HONCHO_SHA`), schreibt die `.env` aus Tikkis Umgebung (Deriver/Dialektik über xAI, OpenAI-kompatibel; Embeddings über `TIKKI_EMBEDDING_BASE_URL` oder aus) und startet API, Deriver, Postgres/pgvector, Redis per Docker Compose, nur auf 127.0.0.1:8000. Profile: `vorlage-rolle.yaml` (`memory.provider: honcho`), `vorlage-honcho.json` (`baseUrl: http://127.0.0.1:8000`, lokal ohne Schlüssel), `rollen_config.py honcho`, Skript-Schritt 3b. Admin → Gedächtnis zeigt „läuft / nicht erreichbar“ per `/health` und nennt den Startbefehl (`areas/admin/gedaechtnis.tsx`). SDK: `hermes pm install --extra honcho`. Noch nicht: Start/Stop aus der App heraus (bräuchte eine Electron-IPC für den Dienst). |
| **TencentDB Agent Memory** (Tencent Cloud, Open Source, Mai 2026) | Vierschichtiges Langzeitgedächtnis (L0 Rohgespräch → L1 Fakten → L2 Szenen → L3 Persona) plus Skill / Wiki / CodeGraph; lokal (Node ≥ 22.16, SQLite, Port 8420). Thorsten: **eine Instanz je Mensch, eine für alles Systemwissen** | Liefert selbst ein Hermes-Memory-Provider-Plugin (`hermes-plugin/memory/memory_tencentdb`, `memory.provider: memory_tencentdb`, Tools `memory_tencentdb_memory_search` / `_conversation_search`, Umgebung `TDAI_LLM_*`, `MEMORY_TENCENTDB_GATEWAY_*`, `TDAI_DATA_DIR`). **Konflikt:** Hermes erlaubt nur einen Provider je Profil, und der ist Honcho. Weg: nicht als Provider, sondern als **Werkzeug-Quelle** über ein kleines Tikki-Plugin (unten). Keine Mandanten im Gateway dokumentiert → je Mensch ein eigener Gateway-Prozess mit eigenem `TDAI_DATA_DIR` und Port, plus einer für das Systemwissen | **Gebaut** (4.9): `tencentdb.sh`, Plugin `gedaechtnis`, gegen den echten Gateway geprüft. Repo: <https://github.com/TencentCloud/TencentDB-Agent-Memory> |
| **Hindsight** (Vectorize) | Wissensgraph, Entitäten, recall/reflect/retain | Katalog-Plugin (`plugin-catalog/hindsight.yaml`), ebenfalls ein Memory-Provider → gleicher Konflikt; als Quelle über seine HTTP-API im Tikki-Plugin, oder weglassen, wenn Honcho + Tencent reichen | Vorbereitet (Adresse in `gedaechtnis.json`), ungetestet; Entscheidung Thorsten, ob dauerhaft |
| **RAG je Mensch** | Eigene Dokumente, Projekte, Mails: klassisches Nachschlagen | Lokaler Vektorspeicher je Mensch (Kandidaten im Katalog: `lancedb`, `memory-zvec`, `corpus`), gefüttert aus `~/Tikki/<name>/` und den Suite-Ausgaben; als Werkzeug im Tikki-Plugin | **Gebaut** (4.9): SQLite FTS5 je Mensch ohne Server, optional Vektoren |

**Tikki-Plugin `gedaechtnis`** (gebaut, siehe 4.9; Rung 4 der Footprint-Leiter, kein Hermes-Kern): liegt in
`tikki/plugins/gedaechtnis/` und wird nach `~/.hermes/plugins/` verlinkt. Zwei Aufgaben:
1. **Spiegeln**: `on_session_end` / `post_llm_call` schreiben jeden Turn zusätzlich in TencentDB
   (`POST /capture`) und in den RAG des Menschen. Honcho schreibt ohnehin als Provider.
2. **Nachschlagen**: ein Werkzeug `nachschlagen(quelle, frage)` mit `quelle ∈ {rag, tencent, hindsight,
   honcho}`; Honcho über die Provider-Tools, Tencent über `/recall`, RAG lokal, Hindsight über API.
Das Werkzeug kommt nur in die Profile `tikki` und `raumleiter` (`platform_toolsets` im Katalog).

**Nicht dabei:** Paperclip (Thorsten). **Dabei:** Browser (Hermes-Toolset `browser`, in der App der
Bereich Browser), Post, Terminal.

**Modelle über API-Schlüssel** für Vorzimmer und Suiten: unverändert aus `KATALOG.json`
(Tikki: xAI Grok 4.7 → Cursor Opus 5.5; Raumleiter: Cursor Opus 5.5 → Grok 4.7).

### 8.2 PA-Vorzimmer

- Profil `tikki` (8650) ist das Vorzimmer. Braucht: User-RAG (Hermes-Gedächtnis + Honcho
  pro Nutzer), Daueraufträge (Hermes `cronjob`-Toolset im Katalog freischalten), Zugriff auf
  den Privatrechner (Hermes `terminal`/`file` mit `smart`-Freigabe, bewusst pro Nutzer
  entscheiden).

### 8.3 Nutzer-Login

- Login mit `name@tikki.team` + Passwort gegen den Mailserver (IMAP-Auth ist vorhanden:
  `TikkiMailService.login`). Daraus Nutzerkontext ableiten (Honcho-Nutzer, sichtbare Räume,
  Admin-Recht für thorsten). `nutzer.tsx` von Vorlage auf echte Daten umstellen.

### 8.4 Rechnerflotte

- Selbstregistrierung der Rechner (kleiner Agent, meldet Name/Art/RAM/Ports); `rechner.tsx`
  von Vorlage auf Registry umstellen; Bots per Rechner verteilen.

### 8.5 Web auf tikki.team

- Hermes hat eine Web-Oberfläche (`web/`). Die Bereiche-Shell ist Renderer-Code und
  prinzipiell übertragbar; Browser (Webview) und Terminal (node-pty) sind Electron-gebunden
  und brauchen im Web Ersatz oder Verzicht.

---

## 9. Konventionen im Code

- TypeScript strikt im Renderer, locker im Electron-Ordner (siehe `tsconfig.electron.json`).
- Prettier vor jedem Commit (`npx prettier --write …`); ESLint ohne Fehler
  (`npx eslint src/ electron/ --quiet`, bei Bedarf `npx eslint --fix <dateien>`).
- Tests: Renderer-Tests `src/**/*.test.tsx` (jsdom, `@testing-library/react`,
  `I18nProvider configClient={null} initialLocale="de"`); Electron-Tests
  `electron/**/*.test.ts` (node, `node:assert/strict`).
- Keine nativen `title=`-Attribute auf Knöpfen (Upstream-Regel `no-native-title.test.ts`);
  `aria-label` oder `<Tip>` aus `@/components/ui/tooltip`.
- Icons aus `@/lib/icons` (Tabler-Aliase), nicht `lucide-react`.
- Nanostores für Zustand; `persistString/storedString` aus `@/lib/storage` für
  localStorage (Schlüssel-Präfix `tikki.desktop.`).
- IPC-Kanäle für Tikki: Präfix `tikki:`; Hermes-eigene bleiben `hermes:`.
- Commit-Nachrichten deutsch, Präfix „Tikki:“.

---

## 10. Bekannte Stolpersteine

- **Raumgröße im Kern (bewusste Kernänderung Nr. 2, beim Hermes-Merge erhalten!)**: Hermes'
  gehostete Gruppenräume (`gateway/hosted_room_discussion.py`) ließen 2–6 Mitglieder zu – die
  einzige Raum-Maschine, die ohne App weiterläuft. `MAX_DISCUSSION_MEMBERS` steht jetzt auf 128
  (Speicherdecke `hosted_rooms.MAX_MEMBERS`), die Turn-Kennung erlaubt Positionen bis 127, der
  Hermes-Test `tests/gateway/test_hosted_room_discussion.py` liest die Konstante statt „2 and 6“.
  Alles andere (3 Runden, 10 Antworten je Mensch-Nachricht, 24 Zeilen Delta) ist unverändert.
  Vertrag: `tests/tikki/test_raeume.py` legt einen Raum mit allen Katalogrollen an.
- **Nur ein Gateway je Rechner.** `hermes -p raumleiter gateway install` wird von Hermes abgelehnt
  („Profile 'x' does not get a gateway of its own“): genau ein Host-Gateway aus dem Hauptprofil
  (`hermes -p default gateway install`) bedient alle Profile – ihre Cronjobs (Takt, Rundgang,
  Tikkis Daueraufträge) und die gehosteten Räume. Das war das ⚠ in Schritt 7 des Installers
  (01.10.); `installieren.sh` installiert jetzt das eine Gateway. Beim Testen: `hermes -p default
  gateway run` (der aktive Profilname `tikki` bekommt sonst keins).
- **App-Name im Kern (bewusste Kernänderung, beim Hermes-Merge erhalten!)**: Hermes suchte
  die gebaute App fest als `Hermes.app/Contents/MacOS/Hermes` bzw. `linux-unpacked/hermes`.
  Mit `productName: "Tikki"` baut electron-builder aber `Tikki.app`; `install.sh
  --include-desktop`, `hermes update` und `hermes desktop` brachen deshalb mit „Desktop build
  produced no launchable app“ ab (nachgestellt am 29.09.). Seitdem liefert
  `hermes_cli/desktop_identity.py::desktop_app_name()` den Namen aus `apps/desktop/package.json`
  (`productName`), genutzt in `main_desktop.py`, `doctor_platform.py`, `gui_uninstall.py`.
  Die Suche probiert erst den Produktnamen, dann „Hermes“, damit die Upstream-Tests (die
  `Hermes.app` als Fixture bauen) unverändert grün bleiben. Einzige angefasste Upstream-Testdatei:
  `tests/hermes_cli/test_gui_command.py` (der `is_file`-Mock lief für jeden zweiten Pfad in eine
  Endlosrekursion; jetzt bindet er das echte `is_file` und nimmt den Produktnamen).
  Verträge: `tests/hermes_cli/test_desktop_identity.py`, `electron/tikki-identitaet.test.ts`.
  Auch die Mac-Menüleiste („Über …“, „… beenden“), Fenstertitel und das Tray-Menü nehmen den
  Namen jetzt aus `productName` statt fest „Hermes“.

- `pkill -f "<muster>"` in derselben Shell-Zeile killt die eigene Shell; `pkill -x electron`.
- Electron headless: `--no-sandbox --disable-gpu --use-gl=swiftshader --in-process-gpu`
  unter `xvfb-run`; `--remote-debugging-port` geht nur mit Dev-Server → Playwright
  `_electron.launch`.
- `uv sync` mit altem uv scheitert am Lockfile-Format; uv ≥ 0.12 nötig.
- `set -o pipefail` + `cmd | grep -q …`: grep beendet die Pipe früh, `cmd` stirbt an SIGPIPE, die
  Bedingung gilt als falsch (so wurden Cronjobs doppelt angelegt). Erst in eine Variable, dann
  `grep -q … <<< "$var"`.
- Delegierte Bots erben höchstens die Werkzeuge des Raumleiters (4.8).
- `hermes chat -Q` ohne Modellzugang hängt minutenlang in Wiederholungen; Takt-Runden haben eine
  Obergrenze von zwei Stunden.
- Cloud-Container: kein Docker-Daemon, clawhub.ai gesperrt. TencentDB lässt sich aus dem
  Quellstand mit Node starten (`npm install --ignore-scripts --legacy-peer-deps`, dann
  `node --import tsx src/gateway/server.ts`, Umgebung `TDAI_*`).
- `JSX.Element` als Typ gibt Namespace-Fehler → `ReactElement`.
- Der Hermes-Setup-Gate („Let's get you setup with Tikki“) liegt über der ganzen App, bis
  ein Backend verbunden ist. Zum reinen Anschauen der Bereiche im Test: Gate-Element aus dem
  DOM entfernen (nur Layout-Check).

---

## 11. Commit-Historie auf `tikki-app` (älteste zuerst)

| Commit | Inhalt |
|---|---|
| `491fbcc8` | Produktname, App-ID, Zustandsordner an der zentralen Identitätsstelle |
| `ab0189c2` | Branding: Icon, Name in allen Oberflächentexten, Fenstertitel |
| `013534b0` | README: Tikki-Kopf vor der Hermes-Doku |
| `dd0e3155` | Eigenes Logo als App-Icon, Tikki-Grün als Standard-Theme |
| `bc0f1352` | Vier Bereiche in der Hauptnavigation (Tikki · Browser · Post · Terminal) |
| `f634d6e0` | Puzzle-Icon aus Tabler statt lucide-react (Build-Fix) |
| `d762c346` | Admin-Bereich und die Bot-Truppe (12 Rollen) |
| `972f363b` | Post-Client (IMAP/SMTP) und Cookie-Auto-Klick im Browser |
| `f4a3b983` | Upstream-Tests wieder grün (Branding-Schalter), keine nativen `title=` |
| `50169e82` | Dieses Handover |
| `d18ef6cd` | Rollenkonfiguration in der Hermes-Umgebung erzeugen, mit Versionsstempel (`rollen_config.py`) |
| `dd10491a` | Handover: `rollen_config.py`, Installationsnotizen |
| `cb635e8b` | Räume, Schritt 1: Bots sprechen im Chat unter ihrem Namen (`areas/tikki/`) |
| `09d647c0` | Wortmarke „TIKKI“ im leeren Chat |
| `aa2fcf6a` | Composer-Statusfach bleibt in versteckten Bereichen unsichtbar |
| `ad23fc29` | Bereich „Suites“: Lobby mit Verlauf, Neue Suite, Raumleiter |
| `0a236537` | Die Suite als Raum: runder Tisch, To-do-Wand, Daten- und Output-Screen |
| `e14a704f` | Honcho als Gedächtnis-Anbieter jeder Rolle (`vorlage-rolle.yaml`, `vorlage-honcho.json`), Gedächtnis-Plan 8.1a |
| `1af2ff35` | Honcho als eigener Dienst (`tikki/dienste/honcho/`), Status-Karte im Admin-Bereich |
| `eabca897` | Suite-Raum hält sein Transkript (`holdSessionTranscript`); vorher blieb der Chat im Raum leer |
| `52d8d32f` | Handover: Transkript-Halt, Commit-Tabelle |
| `4d2291d9` | Dauerräume mit Takt (`suite_takt.py`), Wachhalter, Übungsläufe im Backend, Plugin `gedaechtnis` |
| `de40222d` | TencentDB Agent Memory als Dienst je Mensch und fürs System |
| `ed8ee494` | Vorzimmer öffnet Suiten selbst, Übungsläufe in der App, Takt-Auswahl, Raumbild, Markenwache |
| `8ce52252` | Bots bekommen ihre Werkzeuge, Abos/Skills, OpenClaw-Katalog, Update-Skript, Handover |
| `9788cc0a` | Recherche-Skills für alle Rollen (YouTube-Transkripte, arXiv, Nachrichtenlage, Wiki) |
| `b1ee94ba` | Design „Gelbes Glas“: Theme gelb, Glas-Leiste, Lobby nach Entwurf, Vorzimmer-Rahmen mit Karten, Raum und Admin im Glas |
| (dieser) | Vorzimmer: Browserzeile, Tagesbriefing mit Vorlesen, Update-Wächter; Lobby-Hervorhebung; Raum mit Türen und Grundbesatzung; Schlüssel einlesen |
| (06.10.) | Sprache: Mikrofon und Vorlesen im Raum, Hermes-TTS in der Übersicht, `stimme.ts`, Sprach-Schlüssel in der Rollenvorlage, Installer-Schritt und Selbsttest-Punkt „Sprache“ |

Dieses Dokument: `tikki/HANDOVER.md`. Bitte bei jedem größeren Schritt fortschreiben,
damit die nächste Übergabe wieder vollständig ist.
