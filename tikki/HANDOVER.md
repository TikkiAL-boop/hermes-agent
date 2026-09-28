# Tikki – Handover (Stand 28.09.2026, Commit `f4a3b983` auf `tikki-app`)

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
- **Bot-Truppe**: 12 fertige Rollen (`tikki/rollen/`), je ein Hermes-Profil mit eigenem
  Port, Modell und Ausweichmodell, per Skript einrichtbar.
- **Hermes-Kern (Python) hat keine geänderte Zeile.** Alle Tikki-Änderungen liegen in
  `apps/desktop` und `tikki/`. Upstream-Updates sollen weiter sauber einspielbar sein.
- **Noch nicht gebaut**: die Räume (Raumleiter + bis zu 30 Bots in einem Chat), das
  PA-Vorzimmer mit den vier Modi, Nutzer-Login, Honcho-Trennung, Rechnerflotte, Web auf
  tikki.team.
- Offener Draft-PR: <https://github.com/TikkiAL-boop/hermes-agent/pull/1> (konfliktfrei,
  keine CI, wartet nur auf Merge-Entscheidung von Thorsten).

---

## 1. Was Tikki sein soll (Anforderungen von Thorsten, wörtlich sinngemäß)

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
fehlt im Workspace). ESLint startet nicht (`globals` fehlt im Workspace); noch nicht
untersucht.

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
| `shell.tsx` | `AreaShell`: Rail links, rechts eine `AreaLayer` je Bereich (absolute, `inset-0`). Inaktive Ebenen bekommen `invisible` + `hiddenPaneProps` (`data-pane-hidden`, `PaneVisibleContext`), damit Hermes-Panes wissen, dass sie unsichtbar sind. **Tikki** (Chat = `children`, der Hermes-Layoutbaum) ist immer gemountet. **Browser** und **Terminal** werden beim ersten Besuch gemountet und bleiben es (Zustand geht nicht verloren). **Post** und **Admin** werden nur gemountet, wenn aktiv. |
| `browser-area.tsx` | Tab-Leiste über den bestehenden Hermes-Vorschau-Tabs (`$previewTabs`, nur `kind: 'url'`). Aktiver Tab persistiert unter `tikki.desktop.browser.activeTab`. Tabs werden per `markBrowserTabPopped(id, true)` als „herausgelöst“ markiert, damit der Chat-Baum sie nicht doppelt zeigt. `newBrowserTab()`, `closeRightRailTab()`. Rendert `PreviewTilePane` (Hermes-Komponente mit `<webview partition="persist:hermes-preview">`). |
| `terminal-area.tsx` | `ensureTerminal()` + `TerminalPaneChrome`. Nutzt den persistenten xterm-Overlay von Hermes. |
| `post-area.tsx`, `post/store.ts` | Mail-Client, siehe 4.5. |
| `admin/` | siehe 4.6. |
| Andockpunkt | `src/app/contrib/controller.tsx`: `<AreaShell><LayoutTreeRoot titlebar /></AreaShell>`. |
| Terminal-Overlay | `src/app/right-sidebar/terminal/persistent.tsx`: `registeredSlots[]` + `publishSlot()` (neuester Slot gewinnt), `terminalTakeover = takeoverPref || area === 'terminal'`. |

### 4.4 Browser: Cookie-Auto-Klick

| Datei | Zweck |
|---|---|
| `electron/preview-guest-cookie-consent.ts` | Reine Regeln, ohne DOM, testbar. `KNOWN_CONSENT_SELECTORS` (OneTrust, Cookiebot, Didomi, Quantcast, Sourcepoint, Usercentrics, TrustArc, Google `#L2AGLb`, Amazon `#sp-cc-accept`, Facebook, Bing …). `ACCEPT_TEXT` (deutsch zuerst: „alle akzeptieren“, „zustimmen“, „einverstanden“, …; dann en/fr/es/it/nl). `CONSENT_CONTAINER` (Regex über Attribute der Vorfahren: cookie, consent, cmp, gdpr, privacy, datenschutz …). `REJECT_TEXT` (ablehnen, einstellungen, verwalten, reject, manage …) wird nie geklickt. `MAX_CLICKS_PER_PAGE = 4`. `acceptOnce(host)`: erst bekannte Selektoren, dann generischer Knopf **nur innerhalb eines Consent-Containers**. `installCookieConsentAutoAccept(host)`: sofort, nach 800 ms, nach 2,5 s, dann bei DOM-Mutationen (entprellt 300 ms), Stopp nach Budget oder 45 s. |
| `electron/preview-guest-preload-entry.ts` | Der gebündelte Guest-Preload (`dist/preview-guest-preload.js`), den `main.ts` per `will-attach-webview` **nur** an Webviews mit Partition `persist:hermes-preview` hängt. Enthält den Upstream-Teil (Weiterleitung von `_blank`-Links an den Host) und neu den Consent-Teil: `deepQuery()` durchsucht Dokument **und offene Shadow Roots**, `describe()` baut `ConsentElement` (Attribute, Vorfahren-Attribute bis 12 Ebenen, sichtbarer Text, `getClientRects().length > 0`). Start bei `DOMContentLoaded`. |
| Tests | `electron/preview-guest-cookie-consent.test.ts` (Regeln, Prioritäten, Budget, Entprellung). |
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

### 4.7 Bot-Truppe (`tikki/`)

| Datei | Zweck |
|---|---|
| `rollen/KATALOG.json` | Liste von 12 Rollen. Felder: `slug`, `name`, `icon`, `kurz`, `kategorie`, `modell.{primary,fallback}` (Form `anbieter/modell`), `werkzeuge` (Hermes-Toolset-Namen), `freigabe` (`smart`), `port`, `hermes_profil`, `im_raum_ab_start`. |
| Rollen und Ports | `tikki` 8650 (Vorzimmer, grok-4.7 → opus-5.5, keine Werkzeuge) · `raumleiter` 8651 (opus-5.5 → grok-4.7, Werkzeuge `delegation`, `todo`, im Raum ab Start) · `rechercheur` 8652 · `pruefer` 8653 · `schreiber` 8654 · `frontend-entwickler` 8655 · `backend-entwickler` 8656 · `sicherheitsbeauftragter` 8657 · `datenanalyst` 8658 · `organisator` 8659 · `api-fachmann` 8660 · `uebersetzer` 8661 (alle grok-4.7 → opus-5.5, `smart`). |
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
3. Cursor-`base_url` und Modellname für Opus 5.5 bestätigen.
4. Bestätigen, dass `mail.tikki.email` mit 993/587 der richtige Server ist.
5. Optional: Logo in ≥ 1024 px liefern.
6. PR #1 mergen oder offen lassen (beides ist in Ordnung).

---

## 8. Nächste Bauschritte (Reihenfolge, wie mit Thorsten besprochen)

### 8.1 Räume (der Kern der Idee) – noch nicht begonnen

Ziel: Ein Raum ist ein Chat mit einem Raumleiter und bis zu 30 Bots; alles sichtbar.

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
- Prettier vor jedem Commit (`npx prettier --write …`); ESLint aktuell nicht lauffähig.
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

- `pkill -f "<muster>"` in derselben Shell-Zeile killt die eigene Shell; `pkill -x electron`.
- Electron headless: `--no-sandbox --disable-gpu --use-gl=swiftshader --in-process-gpu`
  unter `xvfb-run`; `--remote-debugging-port` geht nur mit Dev-Server → Playwright
  `_electron.launch`.
- `uv sync` mit altem uv scheitert am Lockfile-Format; uv ≥ 0.12 nötig.
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

Dieses Dokument: `tikki/HANDOVER.md`. Bitte bei jedem größeren Schritt fortschreiben,
damit die nächste Übergabe wieder vollständig ist.
