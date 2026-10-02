# Tikki gegenüber Hermes – Abschlussbericht

Geprüft: Zweig `tikki-app` (HEAD 49e4d073) gegen Upstream 09472a30. Alle Befunde sind von zwei unabhängigen Prüfern bestätigt; wo deren Schwere abweicht, steht hier der Konsens (die vorsichtigere Einstufung) mit Begründung. Repo und `/root/.hermes` sind unverändert (Ausnahme siehe Abschnitt 5).

## 1. Ampel je Maßstab

| Maßstab | Stand | Begründung | Messwerte |
|---|---|---|---|
| **1 Alle Hermes-Funktionen erhalten** | ⚠ | Kern-Diff ist klein (8 Python-Dateien, +106/−23; Desktop 16 Upstream-Dateien, 10 davon reine Umbenennung), Settings/Palette/Voice/Onboarding/Updater sind Code-identisch. Aber: das `memory`-Werkzeug fehlt in allen 14 Rollenprofilen (Honcho-Werkzeuge werden ausgeblendet), 44 von 58 eingebauten Skills fehlen, Chat-Terminal-Pane bleibt nach Besuch des Terminal-Bereichs leer, Cookie-Auto-Klick läuft auch in Hermes' Agenten-Vorschau, Vorzimmer lässt dem Hermes-Baum bei 1220 px Fenster nur 468 px. | Hermes-Tests 161 ✓/0 ✗; Vitest 26 Dateien/188 Tests ✓; `tsc` Exit 0; `check_profile_scope_patterns` 0 Funde |
| **2 Updates sollen weitergehen** | ✗ (heute) → ⚠ nach zwei Minuten-Reparaturen | Bloßes `hermes update` (CLI, `/update` im Chat) schaltet den Checkout auf `main` = nacktes Hermes um; `selbsttest.py` importiert einen PLUGIN-COMPAT-Zeiger, der upstream entfernt ist (CI-Gate heute rot); 19 ESLint-Fehler. Positiv: Trockenmerge gegen upstream/main (0a374d16) ergibt 8 kleine Konfliktdateien, Python-Kern konfliktfrei; `hermes-aktualisieren.sh` ist defensiv; Desktop-Update-Knopf folgt dem Zweig. | Parked-Branch-Guard: `unmerged:47 → Switching to main`; `check_compat_pointers.py` Exit 1; `eslint src/ electron/` 19 Fehler |
| **3 Skills müssen da sein** | ✗ | Jedes Profil ist mit `--no-skills` angelegt; `external_dirs` reicht nur drei Teilordner durch. Live: 14 Skills im Index statt 57; `skill_view("pdf")` → „not found“ im Profil tikki/schreiber. Werkzeug `skills` selbst (skills_list/skill_view/skill_manage) ist in 13/14 Rollen vorhanden. | Skill-Index 2813 Zeichen (14) vs. 6814 Zeichen (57, +≈1000 Token im gecachten Präfix) |
| **4 Sehr schnelle Konversation** | ⚠ | Grundlage gut: System-Prompt Vorzimmer 14 006 Zeichen ≈ 3,5k Token, byte-stabil (Cache-sicher); 13 Werkzeugschemata ≈ 5,5k Token; Kaltstart 3,5–4 s nur je neuer Sitzung; keine blockierenden Hooks; App-Polling 0 RPC/s in der Übersicht, 1 RPC/s nur im offenen Raum. Bremsen: Tikkis Kernwerkzeuge (post, briefing_sammeln, nachschlagen) sitzen hinter der tool_search-Brücke (eine Extra-LLM-Runde je Aktion); Mensch-Nachricht im Raum ohne `@` fragt alle Mitglieder seriell (Tikki vor dem Raumleiter); Profil-Turn-Lock kippt nach 120 s in stillen `turn.failed`. | Messung Profil tikki/desktop: 13 gesendet, 17 deferred; Replay: 4 Turns (2× pass) ohne `@` vs. 2 Turns mit `@raumleiter` |
| **5 Räume: API-Modell je Raum, bald lokales 70B-MoE + Voice** | ⚠ | Modellweg Katalog→Profil ist geschlossen und getestet; Custom-Provider (`lokal`, `cursor`) werden korrekt aufgelöst, Fallback-Kette greift; Hermes bringt Voice (STT/TTS lokal, Wake-Word, Barge-in) und lokale Modellserver-Doku mit; lokale Modellsuche ist gebaut (0,37 s). Aber: „ein Modell je Raum“ gibt es nicht (Modell = Profil, Übungsräume laufen alle mit demselben Raumleiter), Cursor-Endpunkt ungeprüft, hostweites 16-MiB-Ereignisbudget, Takt-Cronjob läuft live seit 25 Läufen nicht, Postfach ohne Zertifikatsprüfung. | 9 Räume live, 12 888 B belegt; Takt `failure_streak 25`; Wachhalter 96 Modellläufe/Tag |

## 2. Befunde je Maßstab

### Maßstab 1 – Hermes-Funktionen erhalten

**Bestätigte Befunde**

| Titel | Datei:Zeile | Wirkung | Reparatur | Aufwand / Schwere |
|---|---|---|---|---|
| `memory`-Toolset fehlt in jedem Rollenprofil | `tikki/rollen/KATALOG.json` (werkzeuge-Listen), Gate `agent/memory_manager.py:79-96` | Hermes' `memory`-Schreibwerkzeug (MEMORY.md/USER.md) und die 5 Honcho-Werkzeuge erreichen das Modell in App, Räumen und API-Server nicht; Logs zeigen mehrfach „memory toolset is gated off … provider tools and system-prompt block are both withheld“. Lesen von MEMORY.md und Honcho-Prefetch funktionieren weiter. | `"memory"` in `werkzeuge` der Rollen mit `memory.provider` (mindestens tikki, raumleiter, deine-ki, wachhalter; sinnvoll alle 14), `rollen-einrichten.sh` laufen lassen | Minuten / **mittel–hoch** |
| Chat-Terminal-Pane bleibt nach Besuch des Terminal-Bereichs leer | `apps/desktop/src/app/areas/shell.tsx:79` (Dauer-Mount) vs. `right-sidebar/terminal/persistent.tsx:32-36` | `ctrl+\``-Terminal im Chat zeigt nach einem Abstecher in den Tikki-Terminal-Bereich ein leeres Pane; Shells laufen unsichtbar weiter; Pane schließen/öffnen hilft. Reproduziert (Vitest-Harness). | `visited.terminal &&` → `area === 'terminal' &&` (TerminalArea hält keinen eigenen Zustand); HANDOVER 4.3 anpassen; Invariantentest mit zwei Slots | Minuten / **mittel** |
| Vorzimmer-Rahmen: 752 px fest, Hermes misst das Fenster | `apps/desktop/src/app/areas/tikki/vorzimmer-rahmen.tsx:361` (nicht 286), `rail.tsx:35` | Gemessen (Electron/xvfb): Hermes-Spalte bei 1920 → 1168 px, 1440 → 688, 1220 (Standardfenster) → 468, < 760 → 0 px. Hermes hält die Sitzungsleiste (237 px) gedockt, Chat ≈ 230 px bei Erststart. | Container-Query auf das Vorzimmer-Wurzelelement: Raumwand/rechte Wand als Schublade unter ≈ 88 rem, Hermes-Spalte nie unter ≈ 880 px; keine Hermes-Datei anfassen | Stunde / **mittel** |
| Cookie-Auto-Klick läuft im einzigen Webview, also auch in Hermes' Agenten-Vorschau | `apps/desktop/electron/preview-guest-preload-entry.ts:122`, `preview-guest-cookie-consent.ts:79-80` | Dev-Server/Streamlit/lokale HTML mit eigenem Banner oder `class="banner"`+„OK“-Link werden weggeklickt (reproduziert: Szenarien A/B/E/F), `<a>` navigiert den Gast. Sicherheitsgrenze intakt (isTrusted-Gate). | Gast-seitiger Gate vor `startConsent()`: nicht bei `file:`/loopback; Token `banner`/`privacy`/`tracking` an `cookie|consent` koppeln; je ein Test | Stunde / **mittel** |
| Plugin-Toolsets `pa`/`gedaechtnis` landen bei jeder Rolle | `tikki/werkzeuge/rollen_config.py:94-97`, Ursache `hermes_cli/tools_config.py:556-558` | Rechercheur & Co. haben in Räumen `post`, `briefing_sammeln`, `lokale_modelle`, `nachschlagen` (4 Schemata je API-Aufruf); `briefing_sammeln` stempelt dabei das gemeinsame Briefing. | `cfg["known_plugin_toolsets"] = {"api_server": plugins, "cli": plugins}` (aus `plugins.enabled` abgeleitet); Invariantentest Katalog ↔ `_get_platform_tools` | Stunde / **mittel** |
| Briefing-Automatik schreibt nach 12 s in die gerade offene Sitzung | `apps/desktop/src/app/areas/tikki/briefing.ts:167-169, 194-209` | Startet die App im Profil `raumleiter`/`default`, geht der mehrzeilige BRIEFING-Prompt dorthin (Werkzeug existiert dort nicht). Höchstens 1×/4 h, nur bei sichtbarer Tikki-Ebene. | Vor `ausloesen()` prüfen `$activeProfile.get() === PA_PROFIL`, sonst nichts senden und nicht merken; Vitest-Vertrag | Minuten / **niedrig** (mittel, sobald mehrere Profile im Hauptfenster üblich sind) |
| Postfach ohne Zertifikatsprüfung (siehe Maßstab 5) | `tikki/plugins/pa/post.py:168,171,211,216` | Hermes' eigener Mail-Adapter verifiziert; Tikkis Pfad nicht – Regression gegenüber Hermes. | s. u. | Minuten / **hoch** |

**Geprüft und in Ordnung**
- Andockpunkt minimal: `controller.tsx` nur Z. 836–840 (`<AreaShell><LayoutTreeRoot/></AreaShell>`); Palette, Statusleiste, HUD/Pop-out-Fenster außerhalb der Shell.
- Hermes-Layoutbaum im Bereich „Tikki“ immer gemountet; inaktive Bereiche nach Hermes' Keep-alive-Regel (`data-pane-hidden`) versteckt.
- Unverändert gegenüber Upstream: Settings, Composer-Voice-Hooks, Command-Palette, Artifacts, Plugins (Bot Mode), Onboarding, Keybinds, Overlays, `preview-pane.tsx`, `store/preview.ts`, Layout-Konstanten, `window-state.ts`.
- Branding ohne Schlüsselverlust (alle 9 Locales, nur `\bHermes\b`); `TIKKI_BRANDING=off` nur im Vitest; Labels typisiert de/en.
- Theme per Upstream-`retintTheme`, alle Presets bleiben; Admin bettet echte Hermes-Panels ein (`GatewaySettings`, `ProvidersSettings`).
- IPC: 9 neue `tikki:mail:*`-Kanäle, nur invoke/response, Passwort verlässt den Hauptprozess nie; Popup-Policy GHSA-9f4c unverändert; App-Mail-Client (imapflow/nodemailer) prüft Zertifikate.
- Geprüft, kein Fehler (verworfene Befunde): URL-Tabs im Browser-Bereich als „popped“ (dokumentierte Entscheidung, Zurückdocken bräche „nie an zwei Orten“); Markenwache überschreibt auch Nutzertitel in der Anzeige (Thorstens Vorgabe „Kein Mensch sieht Hermes“, Daten unverändert); Windows-AUMID (MSIX ignoriert sie); BotErgebnisse statt Einklappzeile (HANDOVER 8.1); neues userData „Tikki“ (Upstream-Isolationsmodell, Altbestand leer).

### Maßstab 2 – Updates

**Bestätigte Befunde**

| Titel | Datei:Zeile | Wirkung | Reparatur | Aufwand / Schwere |
|---|---|---|---|---|
| `hermes update` ohne `--branch tikki-app` schaltet auf `main` um | `hermes_cli/main_install_repair.py:320`, `update_cmd.py:884ff, 951-953`; Aufrufer `gateway/slash_commands.py:144`, `cli_commands_mixin.py:2717` | Reproduziert: Branch `tikki-app → main`, `tikki/` fehlt, Cronjobs `tikki.werkzeuge.*` → ImportError, Gateway-Fleet neu gestartet auf nacktem Hermes. Tritt ein, wenn der R2-Kanal kein `main`-Record hat (404). HANDOVER:179 und `installieren.sh:107` empfehlen genau diesen Befehl. Desktop-Knopf **nicht** betroffen (`source_check.py:373` nimmt den Checkout-Zweig). Reversibel mit `git checkout tikki-app`. | `installieren.sh`: `hermes config set updates.auto_switch_parked_branch false` (fail-closed: „CODE UPDATE SKIPPED“); `tikki/werkzeuge/tikki-update.sh` = `hermes update --branch tikki-app`; HANDOVER/Installer-Text korrigieren; `selbsttest.py` prüft Zweig + Schlüssel | Minuten / **hoch** |
| `selbsttest.py` nutzt PLUGIN-COMPAT-Zeiger | `tikki/werkzeuge/selbsttest.py:129` | `check_compat_pointers.py` heute Exit 1; nach dem nächsten Merge (upstream hat `is_gateway_running` entfernt, verifiziert per raw.githubusercontent) stirbt der Selbsttest mit ImportError vor der ersten Prüfung; `hermes-aktualisieren.sh pruefen` bemerkt es über `tests/tikki/test_selbsttest.py`. | Z. 129 `from gateway.status import get_running_pid`, Z. 131 `if get_running_pid(cleanup_stale=False) is not None:`; `check_compat_pointers.py` in `pruefen()` | Minuten / **mittel** (heute nichts kaputt, nächster Merge sicher) |
| Erneuter Installer-Lauf setzt config.yaml zurück | `tikki/werkzeuge/rollen_config.py:123-133` | Modelländerungen per `hermes model`/Admin→Modelle und `model.context_length` werden beim nächsten `installieren.sh` überschrieben (live reproduziert); Hermes-Einrückung macht den Lauf nie wieder zum No-op. `hermes-aktualisieren.sh` ist nicht betroffen (nur `--dry-run`). | `yaml.indent(mapping=2, sequence=4, offset=2)`; bestehende `model`/`fallback_providers` übernehmen, Katalogmodelle nur bei neuer Datei oder `--modelle-zuruecksetzen`; Invariantentest | Stunde / **mittel** |
| Detached Updater sucht `Hermes.app` fest | `scripts/desktop-update/posix.sh:395-396` | `mac_swap` ist für Tikki ein No-op; im Standardaufbau kompensiert durch den Python-Pfad (`_install_rebuilt_desktop_app`); `hermes uninstall` lässt `~/Library/Caches/Tikki` stehen. | Bundle-Name aus `basename "$RELAUNCH_TARGET"` probieren, dann Hermes.app; `uninstall.py` um `desktop_app_name()` ergänzen | Minuten / **niedrig** |
| 19 ESLint-Fehler in von Tikki geänderten Upstream-Dateien | `apps/desktop/src/lib/icons.ts:7,103,145,241` u. a. (11 Dateien) | CI-Job „JS & TS checks“ wäre rot; alle auto-fixbar; HANDOVER:212/871 „ESLint nicht lauffähig“ ist überholt. | `npx eslint --fix` auf die 11 Dateien, `prettier --check`, `npm run lint` in `pruefen()` und Vor-Push-Liste | Minuten / **niedrig** |

**Geprüft und in Ordnung**
- Trockenmerge upstream/main (02.10.): 8 Konfliktdateien mit winzigen Add/Add-Hunks (5–21 Zeilen), 1 modify/delete (intro-root.tsx, upstream entfernt), Python-Kern konfliktfrei, `MAX_DISCUSSION_MEMBERS=128` bleibt.
- `hermes-aktualisieren.sh`: prüft Zweig/sauberen Stand, merged statt rebased, schreibt `hermes-basis.json`, führt tests/tikki + tsc + vitest aus; Update-Wächter nur Beobachter.
- Desktop-Updater folgt dem ausgecheckten Zweig; `installieren.sh:85` bricht auf fremdem Zweig ab; `hermes update --branch tikki-app` ohne Zweigwechsel und ohne Upstream-Sync-Frage.
- `desktop_identity.py`: für Hermes-Nutzer byteidentisches Verhalten, Fallback „Hermes“ ohne package.json.
- Geprüft, kein Fehler: Konfliktfläche „auf 2–3 Dateien drücken“ (Vorschläge vergrößern die Fläche); `test_desktop_identity.py` CI-Lane (tautologisch, JS-Pendant läuft im Frontend-Lane).

### Maßstab 3 – Skills

**Bestätigter Befund**

| Titel | Datei:Zeile | Wirkung | Reparatur | Aufwand / Schwere |
|---|---|---|---|---|
| Hermes' 57 eingebaute Skills fehlen in jedem Profil | `tikki/werkzeuge/rollen-einrichten.sh:131` (`--no-skills`), `rollen_config.py:108-115` | Schreiber ohne docx/pdf/powerpoint, Datenanalyst ohne xlsx, Organisator ohne notion/google-workspace, alle ohne github/systematic-debugging …; `skill_view("pdf")` → „Skill 'pdf' not found“. Gilt auch für den Menschen im Vorzimmer. HANDOVER:81/92 versprechen das Gegenteil; die Begrenzung in 4.11 gilt nur ClawHub. | In `rollen_config.py` die drei Teilordner durch **einen** Eintrag `str(repo / "skills")` an Position 1 ersetzen (Reihenfolge tikki/skills, repo/skills, openclaw hält den bestehenden Test grün); `--no-skills` darf bleiben (external_dirs folgen Git ohne Kopien). Fürs Vorzimmer bei Bedarf `skills.disabled` je Kategorie. | Minuten / **hoch** |

**Geprüft und in Ordnung**
- Skill-Kern (toolsets, skill_tool, prompt_builder, Slash `/skills`) unverändert; `skills_list/skill_view/skill_manage` live in tikki/raumleiter/rechercheur vorhanden; Raum-Mitglieder bekommen ihre Skills über `platform_toolsets.api_server`.
- Pflicht-Skill `hermes-agent` überall sichtbar; Tikki-Skills (gemini-cli, notebooklm, openclaw-skills) bestehen die HARDLINE-Frontmatter-Regeln mit dem echten Parser.
- ClawHub-Suche offline endet sauber (Exit 0); Tests `test_rollen_config`/`test_openclaw_skills` 19 ✓.
- Hinweise (niedrig): `hermes-agent` ist dreifach eingehängt → „Ambiguous skill name“ (openclaw-Bibliothek nicht als Ganzes mounten); Kategorie „general“ falsch beschriftet (entfällt mit der Reparatur); `openclaw-skills/SKILL.md:28` verweist auf nicht existentes Skript.

### Maßstab 4 – Geschwindigkeit

**Bestätigte Befunde**

| Titel | Datei:Zeile | Wirkung | Reparatur | Aufwand / Schwere |
|---|---|---|---|---|
| tool_search versteckt Tikkis Kernwerkzeuge | `tikki/rollen/KATALOG.json:31` (einstellungen); Ursache `tools/tool_search.py:150-162, 202-206` | `post`, `briefing_sammeln`, `lokale_modelle`, `nachschlagen` sind nur mit Name + 60 Zeichen eingebettet → je Aktion zusätzlich `tool_describe` → `tool_call` (≥ 1 Extra-LLM-Runde); SOUL und Briefing-Prompt nennen die nackten Namen; Risiko, dass kleine/lokale Modelle die Brücke nicht nutzen (HANDOVER 5.0 selbst „nicht bewiesen“). Live-Log: „17 deferred“ direkt vor dem Briefing-Turn. | KATALOG tikki (und Rollen mit pa/gedaechtnis): `"tools": {"tool_search": {"enabled": "off"}}` → 27 statt 13 Schemata (+≈2,9k Token, gecacht); raumleiter erst messen; Test, dass die drei Werkzeuge direkt gesendet werden | Minuten / **mittel** |
| Mensch-Nachricht im Raum ohne `@` → Runde 0 fragt alle, Tikki zuerst | `apps/desktop/src/app/areas/suites/store.ts:534-535`; Kern `gateway/hosted_room_discussion.py:644-647` | Replay: 4 serielle Turns (2× `(pass)`), Raumleiter an Position 1; mit `@raumleiter` 2 Turns, Position 0. Widerspricht HANDOVER:527/572 und Anforderung 6. Sekundenzahlen nicht gemessen (kein Modell). | In `auftragGeben` `@raumleiter ` voranstellen, wenn kein Raum-Handle/@all im Text (gegen `suite.mitglieder` prüfen, nicht `/@\w/`); Vitest-Vertrag; SOUL-Sätze „oder etwas Neues beizutragen“ auf Folgerunden beziehen | Minuten / **mittel** |
| Profil-Turn-Lock: nach 120 s Warten gilt der Turn als fehlgeschlagen | `tui_gateway/hosted_room_driver.py:587`, `tools/bot_relay.py:655-669`, `config_defaults.py:1942` | Reproduziert (flock, verkürztes Budget): zweiter Raum `failed target_busy`, Submit nie erreicht, stiller `turn.failed`, keine Antwort auf diese Nachricht, App zeigt nichts. Alle Räume teilen Profil `raumleiter`; Takt (5 min) und Wachhalter (15 min) feuern gleichzeitig in viele Räume. HANDOVER 4.8 „warten aufeinander“ ist unvollständig. | `/root/.hermes/config.yaml` (Gateway-Profil default): `bot_mode: {turn_wait_seconds: 1830}`; Nebenwirkung auf Bot-Mode-DMs im HANDOVER notieren. Sauber: Upstream-PR (TurnBusyError vor Submit wie `not_admitted` requeuen) | Minuten / **mittel** |
| Alle Räume teilen einen Raumleiter (ein Lock hostweit) | `tikki/werkzeuge/raeume.py:71`; Kern unverändert | Strukturell: N Takt-Räume ≈ N × Rundendauer; mit 120-s-Budget wird aus „langsam“ „verworfen“. Nicht gemessen (0 `turn.settled` live); HANDOVER 4.7a führt es als offen. Kleinster Takt in der App ist 30 min, Rechnung des Prüfers („5 min“) 6–12× überzogen. | Erst Takt reparieren und messen (`bericht` um Rundendauer/Wartezeit ergänzen); dann Lock-Schlüssel `(profile, room_id)` in `hosted_room_service.py:158-160` als dokumentierter Fork-Patch oder Upstream-PR; keine Klon-Profile für dieses Problem | Tag / **niedrig–mittel** |
| Cursor als Hauptanbieter: Endpunkt ungeprüft, falscher Pfad kostet je Turn 3 Versuche + Fallback | `tikki/rollen/KATALOG.json:9, 47`; `vorlage-rolle.yaml:35` | Simuliert: bei 404 an `api.cursor.com/v1` 9,6 s / 7,9 s je Turn, in **jedem** Turn neu (Hermes stellt das Primärmodell je Turn wieder her); nichts im Installer prüft den Endpunkt. Prämisse (kein Chat-Endpunkt) hier nicht verifizierbar (Egress gesperrt). Cursor-Primär ist Thorstens Vorgabe (HANDOVER:66/113) → Katalog nicht gegen ihn ändern. | `selbsttest.py` Punkt `pruefe_anbieter` (`GET {base_url}/models`, 404/Verbindungsfehler → ROT mit Handlungshinweis); HANDOVER §7: Cursor-Test (`curl -H "Authorization: Bearer $CURSOR_API_KEY" https://api.cursor.com/v1/models`) **vor** `rollen-einrichten.sh`; Katalog erst mit Thorsten umstellen, falls der Test scheitert | Stunde / **mittel** |
| Wachhalter: 96 Opus-Läufe/Tag auch ohne Arbeit; weckt Takt-Räume zusätzlich | `tikki/werkzeuge/suite_takt.py:488-490`; Job `tikki-rundgang` every 15m | Live: 6 Läufe heute, jeder ein Modellversuch gegen 9 Räume ohne Handlungsbedarf; einziger abgeschlossener Lauf 23,7 min; belegt den Raumleiter-Lock und das Claude-Abo-Kontingent. Takt-Räume-Weckung aus SOUL ableitbar, nicht beobachtet. | Reine Funktion `weckbedarf(zeilen)`; Textmodus druckt `{"wakeAgent": false}` als letzte Zeile, wenn nichts ansteht (Hermes-Gate `cron/scheduler_prompt.py:20-34`); SOUL: „Räume mit Takt lässt du dem Takt“ (mit Thorsten); Kadenz und Modell nicht ändern | Stunde / **mittel** |

**Geprüft und in Ordnung**
- System-Prompt byte-stabil (keine Uhrzeit/kein Datum; Briefing-Datum nur in der Nutzer-Nachricht); keine `pre_llm_call`-Hooks; Gedächtnis-Spiegelung im Hintergrund-Thread; Honcho-Wartezeit Turn 1 ≤ 5 s, später 0 s.
- Prompt-Masse tikki 3,5k / raumleiter 3,9k Token; 13/14 Schemata; Kaltstart 3,5–4 s je Sitzung, danach gecacht.
- App-Polling: Raum 1 RPC/s nur geöffnet; Übersicht 0 RPC/s + 1 RPC/60 s; Desktop streamt immer (`display.streaming` ist CLI-only, Hinweis).
- Runden 1–2 nur per Erwähnung; Deckel 3 Runden/10 Antworten; Treiber wacht sofort auf, Poll 0,25 s.
- Fallback-Kette korrekt (`xai/grok-4.7 → cursor/… → lokal/…`); `reasoning_effort: low` fürs Vorzimmer.
- Hinweise (niedrig): Live-Profile stehen noch auf `lokal/tikki-schnell` + `context_length 65536` (Cloud-Teststand; mit API-Modell halbiert die Zeile das Fenster → vor Go-live zurücksetzen); Lobby lädt Details nur für 50 jüngste Räume als Burst von bis zu 101 RPCs.

### Maßstab 5 – Räume, API → lokal, Voice

**Bestätigte Befunde**

| Titel | Datei:Zeile | Wirkung | Reparatur | Aufwand / Schwere |
|---|---|---|---|---|
| Postfach IMAP/SMTP ohne Zertifikatsprüfung | `tikki/plugins/pa/post.py:168, 171, 211, 216` | Live reproduziert: Fake-Server mit selbstsigniertem Zertifikat erhält `LOGIN pa@… "SEHR-GEHEIM"` bzw. `AUTH PLAIN` im Klartext des gefälschten Tunnels; betrifft alle Postfunktionen und das Briefing der Daueraufträge (unbeaufsichtigt im Cron). App-Client und Hermes' E-Mail-Adapter verifizieren. | `ctx = ssl.create_default_context()` einmal anlegen; `IMAP4_SSL(..., ssl_context=ctx)`, `starttls(ssl_context=ctx)`, `SMTP_SSL(..., context=ctx)`, `starttls(context=ctx)`; Vertragstest mit lokalem Fake-Server (heute rot) | Minuten / **hoch** |
| Postfach ohne Schleifen-/Doppelantwort-/Empfängerschutz | `tikki/plugins/pa/post.py:221-228, 130-144`; `pa/__init__.py:94-99` | `senden` vor `erledigt` (bei Fehler Doppelantwort, reproduziert), antwortet an `From` statt `Reply-To`, kein `Auto-Submitted`, keine Erkennung von Newslettern/Autorespondern (Hermes' Adapter hat genau das), `an` ungeprüft. Heute latent: Job pausiert, kein Postfach konfiguriert. | `automatisch`-Feld nach Hermes' Tabelle (`Auto-Submitted`, `Precedence`, `List-Id`, noreply); `Reply-To` nutzen, `Auto-Submitted: auto-replied` setzen; `\Answered`-Flag **vor** dem Senden setzen (fail-closed); `parseaddr(an)` mit `@`; 2 Verträge | Stunde / **mittel** |
| Selbsttest meldet „Takt ✓“, Takt-Cronjob scheitert seit 25 Läufen | `tikki/werkzeuge/selbsttest.py:119-124`; installiertes `/root/.hermes/profiles/raumleiter/scripts/tikki-takt.sh` | Installiertes Skript trägt noch `--hermes` (Stand 6962149f; HEAD erzeugt es ohne); `suite_takt: error: unrecognized arguments`; kein Raum bekommt Takt-Runden/Türen/Übungsergebnisse; Selbsttest prüft nur den Jobnamen. `hermes-aktualisieren.sh` schreibt Cron-Skripte nach Updates nicht neu (`--dry-run`), derselbe Zustand entsteht auf dem Mac bei der nächsten Skriptänderung. | Sofort: `rollen-einrichten.sh --nur raumleiter`. `pruefe_takt`: `last_status == "error"` → WARNUNG mit letzter Zeile von `last_error`, `enabled: false` → FEHLER; Test. `hermes-aktualisieren.sh:40`: echter idempotenter Lauf statt `--dry-run` | Minuten / **mittel** |
| Taktgeber verliert Zustand bei Fehler in einem Raum | `tikki/werkzeuge/suite_takt.py:449-460, 274-290` | Reproduziert: wirft `senden` für Raum B, bekommt Raum C jede 5 min eine weitere „Runde 1“, Raum A nie; Ausnahme läuft in den Cronjob. | Je Raum `HostedRoomError` fangen, Meldung sammeln, `continue`; fehlgeschlagene Tür als `unzustellbar`; `_zustand` mit `try/finally`; Exit ≠ 0 bei Fehlern; Vertragstest | Stunde / **mittel** |
| Hostweites 16-MiB-Ereignisbudget; Dauer-Takt-Räume füllen es | `tikki/werkzeuge/suite_takt.py:458`; Kern `gateway/hosted_rooms.py:43, 547-553` | Reproduziert: voller Host blockiert **alle** Räume (auch neue), Takt bricht den ganzen Tick ab, Erholung nur durch `aufloesen`. Tempo: 1 Dauerraum ≈ 0,5–3 MB/Tag (6–18 Tage), 100 Räume mit 5-min-Takt ≈ 8,6 MB/Tag allein durch Takt-Zeilen. Grenze steht nicht in HANDOVER 4.8. | (1) `takt()` fängt `HostedRoomError` je `senden`; (2) `bericht` zeigt `SUM(event_bytes)/16 MiB` und `latest_seq/50 000`, Wachhalter warnt ab 80 %; (3) Rotation nach `verschmelzen`-Muster mit Schwelle Hostbudget ÷ aktive Takt-Räume; (4) Grenzen in HANDOVER; (5) Upstream-PR: Budget als `config.yaml`-Einstellung, bis dahin Kernänderung Nr. 3 dokumentiert | Stunden–Tag / **mittel–hoch** (latent, im Zielbetrieb binnen Tagen) |
| „Ein Modell je Raum“ gibt es nicht | `apps/desktop/src/app/areas/suites/uebung.ts:8-9`; `tui_gateway/hosted_room_driver.py:882-886` | `provider/model` je Ansatz hat keinen Leser; alle Übungsräume (live: 3 Stück) laufen mit demselben Raumleiter-Profil, wegen Profil-Lock nacheinander. Admin-Text, SOUL und HANDOVER:33 versprechen „andere Modelle“; HANDOVER:491/510 nennt es offen. Anforderung 17 und Maßstab 5 heute nur je Profil erfüllbar. | Klonprofile des Raumleiters als `klone`-Liste am Raumleiter-Eintrag (gleiche SOUL, anderes `modell.primary`, eigener Port, einer `lokal/…` = API→lokal-Schalter); `uebung.ts` liefert je Ansatz das Klonprofil; nur `profile` des Mitglieds tauschen, `member_id`/`handle` bleiben `raumleiter`. Sofort: Texte entschärfen, toten Code markieren | Tag / **mittel** |
| App und Takt lesen Raumkonventionen unterschiedlich | `apps/desktop/src/app/areas/suites/store.ts:173-184, 229, 271-272`; `suite_takt.py:53-54` | Reproduziert: nach `TAKT-RUNDE`/`WACHHALTER:`/`[Tür …]` verschwindet „Braucht dich“ in der App, Python meldet weiter „wartet“; `**AUFGABEN:**`/`* [ ]` sieht die App, der Wachhalter nicht. HANDOVER:536 nennt die gemeinsame Regel ausdrücklich. | `nachrichtAus` setzt `system` per `_SYSTEM`-Regex auf dem Rohtext; `raumleiterSeitMensch` ignoriert Systemnachrichten; Python `_AUFGABEN` auf `[^\n]*\n` und `[-*]` lockern; BRAUCHE-Semantik („letzte Raumleiter-Nachricht gilt“) in HANDOVER festlegen; Spiegeltests beidseitig | Stunde / **mittel** |

**Geprüft und in Ordnung**
- Modellweg Katalog → `rollen_config.py:83-92` → config.yaml getestet (13 Rollen); Custom-Provider (`providers.<name>` mit base_url/key_env/api_mode) werden von `config_providers.py`/`agent_init.py` korrekt aufgelöst; xai ist eingebaut, `providers.xai` unschädlich; Fallback bei 404/401/Verbindungsfehler greift.
- 64k-Mindestkontext wie dokumentiert; lokale Endpunkte akzeptieren `model.context_length`.
- Hermes bringt Voice vollständig mit: `voice_chat_mode chained|gpt-live`, STT local (faster-whisper)/groq/openai/mistral/xai/…, TTS edge/piper/kittentts/neutts/xai/… plus Kommando-Provider, Wake-Word, Barge-in; Desktop-Hooks unverändert.
- Lokale Modellsuche (Arbeitsstand) gebaut und getestet: `sammeln()` 0,37 s, Parser erkennt Qwen3.5-122B-A10B/35B-A3B, Empfehlung `raeume`/`sprache`; Werkzeug `lokale_modelle` registriert. Hinweis: GLM-4.5-Air und Mixtral-8x22B werden nicht geparst (Muster `(\d+)x(\d+)B` / Namenstabelle ergänzen).
- Ein Host-Gateway aus `default` bedient alle 15 Profile; Räume-Speicher aus Profil-Homes korrekt aufgelöst; `(pass)`-Regeln Kern/App/Takt konsistent; Raumleiter-SOUL ↔ Katalog getestet; Schlüssel nur in `.env` (0600), nie in Ausgaben.
- Hinweise (niedrig): Tikki-SOUL widerspricht sich bei BRAUCHE (Z. 85 vs. 118); `abos-einrichten.sh` kennt `xai-oauth`, Katalog nutzt nur `xai/` (SuperGrok-Abo ungenutzt); Job „Post prüfen“ steht auf 240 min statt 4; Mail-Passwort in `tikki-mail.json` im Klartext bei ausgeschaltetem safeStorage (dokumentiert, wie Hermes-Tokens); bewusst fehlende Toolsets (vision, image_gen, mcp, kanban) nicht dokumentiert – Thorsten sollte vision für tikki/deine-ki bestätigen.

## 3. Plan: lokales 70B-MoE mit MLX für Räume und Voice

Zielrechner Mac Studio M3 Ultra (256/512 GB), DGX Spark (128 GB, CUDA, kein MLX). **Alle Token/s sind Schätzungen** (≈ 819 GB/s Bandbreite ÷ Bytes der aktiven Parameter × 0,6), nicht gemessen.

**Schritt 1 – Modelle (4-Bit-MLX, `mlx-community/*-4bit`)**

| Modell | gesamt/aktiv | RAM ≈ | t/s ≈ | Rolle |
|---|---|---|---|---|
| Qwen3.5-35B-A3B | 35B/3B | 20 GB | 100–150 | **Voice / schnelles Sprechen** |
| Qwen3.5-122B-A10B | 122B/10B | 65–70 GB | 40–60 | **Räume** (passt auch auf 256 GB und auf den Spark) |
| Qwen3-235B-A22B | 235B/22B | 125–135 GB | 25–35 | stärkster Raumleiter, nur Mac |
| GLM-4.5-Air | 106B/12B | 60 GB | 40–50 | Alternative Räume |
| gpt-oss-120b | 117B/5B | 65 GB | 60–80 | nur als abliterated-Variante („unzensiert“) |
| Mixtral-8x22B | 141B/39B | 80 GB | 15–20 | nicht nehmen |

Beide Empfehlungen gleichzeitig im Speicher ≈ 90 GB + KV-Cache. „Unzensiert“: `*-abliterated` aus mlx-community/huihui-ai; die Modellsuche findet sie im HF-Cache. Download: `hf download mlx-community/Qwen3.5-122B-A10B-4bit` und `…35B-A3B-4bit`, dann `df -h ~`. DGX Spark: vLLM/llama.cpp mit `--max-model-len 65536`, ≈ ⅓ der Mac-Geschwindigkeit, für Bots/Batch.

**Schritt 2 – Server (zwei Modelle, Kontext ≥ 64k)**
- Empfohlen: **omlx** (Hermes-Doku `website/docs/guides/local-llm-on-mac.md:147-184`) auf `127.0.0.1:8000`, mehrere Modelle, `/v1/models` listet beide, Prefix-Caching → eine `providers.lokal`-Adresse.
- Alternative:
  ```bash
  pip install -U mlx-lm
  python -m mlx_lm server --model mlx-community/Qwen3.5-122B-A10B-4bit --host 127.0.0.1 --port 8090 --max-tokens 8192
  python -m mlx_lm server --model mlx-community/Qwen3.5-35B-A3B-4bit  --host 127.0.0.1 --port 8091 --max-tokens 8192
  ```
  Port 8080 meiden (Hermes' llama-server-Probe). `/v1/models` meldet keine Fenstergröße → `model.context_length: 65536` je Profil ist Pflicht. Autostart per launchd; Startbefehle liefert die Modellsuche je Modell.

**Schritt 3 – Hermes-Konfiguration über Vorlage + Katalog (nicht von Hand)**
```yaml
# tikki/hermes/vorlage-rolle.yaml
providers:
  lokal:          # Räume
    base_url: "http://127.0.0.1:8090/v1"    # omlx: :8000/v1
    key_env: "LOKAL_API_KEY"
    api_mode: "chat_completions"
    context_length: 65536
  lokal-schnell:  # Voice
    base_url: "http://127.0.0.1:8091/v1"
    key_env: "LOKAL_API_KEY"
    api_mode: "chat_completions"
    context_length: 65536
model:
  context_length: 65536
agent:
  local_stream_stale_timeout: 900
```
Katalog: `modell.primary: "lokal/mlx-community/Qwen3.5-122B-A10B-4bit"` (exakte ID aus `/v1/models`, kein Alias); Vorzimmer/Deine KI `lokal-schnell/…35B-A3B…`. Danach `rollen-einrichten.sh --nur <slug>` und Gateway-Neustart. Voraussetzung: Befund „Installer setzt config zurück“ repariert, sonst überschreibt jeder Lauf Handänderungen.

**Schritt 4 – Voice**
```yaml
voice: { voice_chat_mode: chained, barge_in: true, stop_phrases: ["stopp", "stop"] }
stt:   { provider: local, language: de, local: { model: large-v3, vad: true } }   # faster-whisper
tts:   { provider: piper, piper: { voice: de_DE-thorsten-high } }                   # oder mlx-kokoro als Kommando-Provider
```
`hermes pm install --extra voice --extra piper`. xAI-Sprach-APIs (`tts.provider: xai`, `stt.provider: xai`) sind als zweiter Kanal vorhanden. **Zu bauen von Tikki:** die Tikki-Flächen haben kein Mikrofon (`suite-room.tsx:548-575` ist ein Textfeld, Vorzimmer liest nur per `speechSynthesis` vor). Kleinster Schritt: im Vorzimmer den Hermes-Composer (mit Mikro-Knopf) als Gesprächsfeld nutzen; für Räume den Sprach-Hook an `auftragGeben` hängen und die Raumleiter-Antwort per TTS sprechen. Latenzziel erste Silbe < 1,5 s (Schätzung, 35B-A3B + whisper large-v3 + Piper).

**Schritt 5 – Umschalten API ↔ lokal**
- Heute: Modell = Profil; Umschalten = Katalog ändern → `rollen-einrichten.sh --nur <slug>` → Gateway-Neustart (nie mitten im Gespräch, Modellwechsel bricht den Prompt-Cache).
- Klein: je Rolle zwei Ketten `modell.api`/`modell.lokal`, `rollen_config.py --modelle lokal|api` wählt die aktive und nimmt die andere als Ausweich.
- Je Raum: Raumleiter-Klone (`raumleiter-lokal`, `raumleiter-api`) als Mitglied in Übungsräumen → echter Vergleich „erster fertig gewinnt“, löst nebenbei den Profil-Lock (Befund „Ein Modell je Raum“).
- Vorher Takt-Cron reparieren und Rundendauer messen, damit die 100-Räume-Rechnung auf echten Werten steht.

## 4. Reparaturliste (priorisiert)

**Stufe A – verliert eine Hermes-Funktion, bremst die Konversation oder gefährdet Daten**

| # | Datei | Änderung | Aufwand | Test | sofort? |
|---|---|---|---|---|---|
| 1 | `tikki/plugins/pa/post.py:168,171,211,216` | `ssl.create_default_context()` an alle vier Aufrufe übergeben | Minuten | ja: Fake-Server mit selbstsigniertem Zertifikat → `SSLCertVerificationError`, kein LOGIN | **sofort** |
| 2 | `tikki/installieren.sh` (+ HANDOVER:179, installieren.sh:107, neues `tikki/werkzeuge/tikki-update.sh`) | `hermes config set updates.auto_switch_parked_branch false`; Update-Weg = `hermes update --branch tikki-app`; Selbsttest prüft Zweig und Schlüssel | Minuten | ja: selbsttest-Punkt | **sofort** |
| 3 | `tikki/werkzeuge/rollen_config.py:108-115` | Drei Teilordner durch einen Eintrag `repo/skills` an Position 1 ersetzen; HANDOVER 4.10 | Minuten | bestehender `test_rollen_config` bleibt grün; Vertrag „skill_view pdf lädt“ optional | **sofort** |
| 4 | `tikki/rollen/KATALOG.json` (werkzeuge) | `"memory"` in alle Rollen mit `memory.provider` | Minuten | ja: `memory_provider_tools_enabled(_get_platform_tools(cfg, plat))` True je Rolle | **sofort** |
| 5 | `tikki/rollen/KATALOG.json:31` (tikki, Rollen mit pa/gedaechtnis) | `"tools": {"tool_search": {"enabled": "off"}}` | Minuten | ja: post/briefing_sammeln/nachschlagen in der gesendeten Werkzeugliste | **sofort** |
| 6 | `apps/desktop/src/app/areas/suites/store.ts:534` | `@raumleiter ` voranstellen, wenn kein Raum-Handle/@all im Text; HANDOVER 527/572, SOUL-Sätze | Minuten | ja: Vitest-Vertrag | **sofort** |
| 7 | `/root/.hermes/config.yaml` (Gateway-Profil) + HANDOVER 4.8 | `bot_mode: {turn_wait_seconds: 1830}`; Nebenwirkung Bot-Mode-DMs dokumentieren | Minuten | nein (Konfiguration) | **sofort** |
| 8 | `apps/desktop/src/app/areas/shell.tsx:79` | `visited.terminal` → `area === 'terminal'`; HANDOVER 4.3 | Minuten | ja: zwei Slots in `persistent.test.tsx` | **sofort** |
| 9 | `tikki/werkzeuge/rollen_config.py` nach Z. 97 | `known_plugin_toolsets` aus `plugins.enabled` für api_server/cli | Stunde | ja: Katalog ↔ `_get_platform_tools` je Rolle | sofort |
| 10 | `apps/desktop/electron/preview-guest-preload-entry.ts:122`, `preview-guest-cookie-consent.ts:79-80` | Gate `file:`/loopback; `banner`/`privacy`/`tracking` an `cookie\|consent` koppeln; HANDOVER 4.4 | Stunde | ja: 2 Tests (Host-Gate, `class=banner`+OK nicht geklickt) | sofort |
| 11 | `tikki/werkzeuge/selbsttest.py` (neu `pruefe_anbieter`), HANDOVER §7 | `GET {base_url}/models` je Provider mit Schlüssel; Cursor-Test vor `rollen-einrichten.sh` | Stunde | ja: Fake-HTTP 404 → ROT, 200 → OK | sofort |
| 12 | `apps/desktop/src/app/areas/tikki/vorzimmer-rahmen.tsx:345-364` | Container-Queries, Wände als Schublade, Hermes-Spalte ≥ ≈ 880 px | Stunde | Vitest optional | später |
| 13 | `tui_gateway/hosted_room_service.py:158-160` oder Upstream-PR | Lock-Schlüssel `(profile, room_id)`; `max_concurrent_rooms` aus config | Tag | ja: zwei Räume, zweite Runde nicht `turn.failed` | später (erst messen) |
| 14 | `uebung.ts`, `store.ts`, KATALOG (klone), `rollen-einrichten.sh` | Raumleiter-Klonprofile je Ansatz; sofort Texte entschärfen | Tag | ja: Übungsraum trägt Klonprofil, `member_id` bleibt raumleiter | später |

**Stufe B – Betrieb und Update-Hygiene**

| # | Datei | Änderung | Aufwand | Test | sofort? |
|---|---|---|---|---|---|
| 15 | `tikki/werkzeuge/selbsttest.py:129,131` | `get_running_pid(cleanup_stale=False) is not None`; `check_compat_pointers.py` in `pruefen()` | Minuten | `check_compat_pointers.py` Exit 0 | **sofort** |
| 16 | Zielmaschine | `tikki/werkzeuge/rollen-einrichten.sh --nur raumleiter` (ersetzt kaputtes Takt-Skript) | Minuten | `hermes -p raumleiter cron list` nach 5 min grün | **sofort** |
| 17 | `tikki/werkzeuge/selbsttest.py:119-124`, `hermes-aktualisieren.sh:40` | `last_status/enabled` prüfen; echter idempotenter Rollen-Lauf statt `--dry-run` | Minuten | ja: Job mit `last_status=error` → WARNUNG | **sofort** |
| 18 | `apps/desktop` (11 Dateien), HANDOVER:199-212/871, `hermes-aktualisieren.sh:39` | `npx eslint --fix`, `prettier --check`; `npm run lint` in Prüfliste und `pruefen()` | Minuten | `npm run lint` 0 Fehler | **sofort** |
| 19 | `apps/desktop/src/app/areas/tikki/briefing.ts:204-208` | Automatik nur bei `$activeProfile.get() === PA_PROFIL`, sonst nicht merken | Minuten | ja: Vitest (tikki → feuert, raumleiter → nicht) | **sofort** |
| 20 | `scripts/desktop-update/posix.sh:394-398`, `hermes_cli/uninstall.py:917` | Bundle-Name aus `basename "$RELAUNCH_TARGET"`; `caches / desktop_app_name()` | Minuten | Bash-Fixture nur mit Tikki.app → Swap | sofort |
| 21 | `tikki/werkzeuge/suite_takt.py:449-460, 274-290` | `HostedRoomError` je Raum fangen, Tür als unzustellbar, `_zustand` try/finally, Exit ≠ 0 | Stunde | ja: Raum B wirft → A/C genau eine Runde | sofort |
| 22 | `tikki/werkzeuge/rollen_config.py:123-133` | Hermes-Einrückung; `model`/`fallback_providers` erhalten, `--modelle-zuruecksetzen`; `delegation` beim Merge explizit entfernen | Stunde | ja: Hermes schreibt Modell → zweiter Lauf No-op | sofort |
| 23 | `tikki/plugins/pa/post.py`, `pa/__init__.py:94-99` | `automatisch`-Erkennung, `Reply-To`, `Auto-Submitted`, `\Answered` vor Senden, Adressprüfung | Stunde | ja: 2 Verträge | sofort |
| 24 | `tikki/werkzeuge/suite_takt.py` (main/bericht), wachhalter/SOUL.md | `weckbedarf()`; `{"wakeAgent": false}` ohne Handlungsbedarf; SOUL-Satz zu Takt-Räumen mit Thorsten | Stunde | ja: leer/nur Takt → Gate-Zeile; offen+31 min → keine | sofort |
| 25 | `store.ts:173-184, 229, 271`, `suite_takt.py:53-54`, HANDOVER:536 | Systemnachrichten in App ignorieren; AUFGABEN-Regex lockern; BRAUCHE-Semantik festlegen | Stunde | ja: Spiegeltests beidseitig | sofort |
| 26 | `suite_takt.py` (takt/bericht), wachhalter-SOUL, HANDOVER 4.8, später Upstream-PR | Budget-Fang, Host-Auslastung im Bericht, Rotation, 16-MiB/50 000-Grenzen dokumentieren, Budget konfigurierbar | Stunden–Tag | ja: voller Host bricht Tick nicht ab; Rotation gibt Budget frei | später |

## 5. Hinweise zur Prüfung selbst

- Ein Prüfer hat beim Nachstellen von Befund 22 versehentlich `rollen_config.py schreiben` gegen die echten Profile tikki und raumleiter laufen lassen (16:18 UTC) und beide `config.yaml` sofort aus den Hermes-Sicherungen (`backups/config/config.yaml.good.20261001-15…`) byteidentisch wiederhergestellt; zwei zusätzliche Sicherungsdateien des falschen Standes liegen harmlos im `backups/`-Ordner. Das war zugleich die Live-Reproduktion des Befunds.
- Ein erster Import löste Hermes' Lazy-Install aus und synchronisierte `/home/user/hermes-agent/.venv` auf `uv.lock`; der Bau-Schwanz wurde abgebrochen, Repo und Prozesse sind sauber.
- Latenzzahlen in Sekunden für Räume sind Schätzungen: in dieser Umgebung lief kein Modell erfolgreich (alle Raum-Turns `turn.failed`/`deferred`), `api.cursor.com` war nicht erreichbar (Egress gesperrt).

```json
{
  "sofort": [
    {"datei": "tikki/plugins/pa/post.py:168,171,211,216", "aenderung": "ssl.create_default_context() an IMAP4_SSL/starttls/SMTP_SSL/starttls übergeben", "test": "tests/tikki/test_pa.py: selbstsigniertes Zertifikat → SSLCertVerificationError, kein LOGIN beim Fake-Server"},
    {"datei": "tikki/installieren.sh (+ tikki/werkzeuge/tikki-update.sh, HANDOVER:179, installieren.sh:107)", "aenderung": "hermes config set updates.auto_switch_parked_branch false; dokumentierter Update-Weg = hermes update --branch tikki-app", "test": "selbsttest.py prüft HEAD == tikki-app und updates.auto_switch_parked_branch == false"},
    {"datei": "tikki/werkzeuge/rollen_config.py:108-115", "aenderung": "drei Teilordner durch einen Eintrag repo/skills an Position 1 ersetzen; HANDOVER 4.10", "test": "tests/tikki/test_rollen_config.py bleibt grün; optional skill_view('pdf') lädt"},
    {"datei": "tikki/rollen/KATALOG.json (werkzeuge aller Rollen mit memory.provider)", "aenderung": "\"memory\" in die werkzeuge-Listen aufnehmen, rollen-einrichten.sh laufen lassen", "test": "memory_provider_tools_enabled(_get_platform_tools(cfg, plat)) ist True für cli und api_server"},
    {"datei": "tikki/rollen/KATALOG.json:31 (tikki, Rollen mit pa/gedaechtnis)", "aenderung": "einstellungen.tools.tool_search.enabled = off", "test": "get_tool_definitions mit _load_enabled_toolsets('desktop'): post, briefing_sammeln, nachschlagen direkt gesendet"},
    {"datei": "apps/desktop/src/app/areas/suites/store.ts:534", "aenderung": "auftragGeben stellt @raumleiter voran, wenn kein Raum-Handle/@all im Text; HANDOVER 527/572 und SOUL-Sätze angleichen", "test": "store.test.ts: ohne Handle → '<name>: @raumleiter …', mit @tikki unverändert"},
    {"datei": "/root/.hermes/config.yaml (Gateway-Profil default) + HANDOVER 4.8", "aenderung": "bot_mode: {turn_wait_seconds: 1830}; Nebenwirkung auf Bot-Mode-DMs dokumentieren", "test": "kein Test (Konfiguration)"},
    {"datei": "apps/desktop/src/app/areas/shell.tsx:79", "aenderung": "visited.terminal && → area === 'terminal' &&, visited.terminal streichen; HANDOVER 4.3", "test": "persistent.test.tsx: Slot A, Slot B mounten/unmounten → Overlay über A sichtbar"},
    {"datei": "tikki/werkzeuge/rollen_config.py (nach Zeile 97)", "aenderung": "known_plugin_toolsets für api_server/cli aus plugins.enabled setzen", "test": "test_rollen_config.py: _get_platform_tools(cfg,'api_server') ∩ {pa,gedaechtnis} == Katalog je Rolle"},
    {"datei": "apps/desktop/electron/preview-guest-preload-entry.ts:122 + preview-guest-cookie-consent.ts:79-80", "aenderung": "startConsent nicht bei file:/loopback; banner/privacy/tracking nur mit cookie|consent; HANDOVER 4.4", "test": "preview-guest-cookie-consent.test.ts: consentAllowedFor(url) und class=banner+OK nicht geklickt"},
    {"datei": "tikki/werkzeuge/selbsttest.py (neu pruefe_anbieter) + HANDOVER §7", "aenderung": "GET {base_url}/models je providers.*-Eintrag mit gesetztem Schlüssel; 404/Verbindungsfehler ROT; Cursor-Test vor rollen-einrichten.sh", "test": "tests/tikki: Fake-HTTP 404 → ROT, 200 → OK"},
    {"datei": "tikki/werkzeuge/selbsttest.py:129,131", "aenderung": "from gateway.status import get_running_pid; if get_running_pid(cleanup_stale=False) is not None; check_compat_pointers.py in pruefen() von hermes-aktualisieren.sh", "test": "scripts/check_compat_pointers.py Exit 0; tests/tikki/test_selbsttest.py grün"},
    {"datei": "Zielmaschine: tikki/werkzeuge/rollen-einrichten.sh --nur raumleiter", "aenderung": "ersetzt das installierte Takt-Skript mit --hermes-Argument", "test": "hermes -p raumleiter cron list: tikki-takt ohne Fehler nach dem nächsten Lauf"},
    {"datei": "tikki/werkzeuge/selbsttest.py:119-124 + hermes-aktualisieren.sh:40", "aenderung": "pruefe_takt liest enabled/last_status/last_error (error → WARNUNG, disabled → FEHLER); echter idempotenter rollen-einrichten-Lauf statt --dry-run", "test": "test_selbsttest.py: Job mit mark_job_run(success=False) → WARNUNG"},
    {"datei": "apps/desktop (icons.ts, brand.test.ts, scope-selector.tsx, quick-entry-app.tsx, persistent.tsx, message-reactions.tsx, status.tsx, intro.tsx, intro-root.tsx, cards/setup.tsx, options.tsx) + HANDOVER:199-212/871 + hermes-aktualisieren.sh:39", "aenderung": "npx eslint --fix, prettier --check; npm run lint in Vor-Push-Liste und pruefen()", "test": "npm run lint → 0 Fehler"},
    {"datei": "apps/desktop/src/app/areas/tikki/briefing.ts:204-208", "aenderung": "Automatik nur wenn $activeProfile.get() === PA_PROFIL, sonst nichts senden und nicht merken", "test": "briefing.test.ts: Profil tikki → ausloesen, raumleiter → nicht, letztesBriefing unverändert"},
    {"datei": "scripts/desktop-update/posix.sh:394-398 + hermes_cli/uninstall.py:917", "aenderung": "Bundle-Name aus basename \"$RELAUNCH_TARGET\" zuerst probieren; caches/desktop_app_name() aufräumen; HANDOVER §10 ergänzen", "test": "tests/scripts/desktop_update: Fixture nur mit Tikki.app → Swap"},
    {"datei": "tikki/werkzeuge/suite_takt.py:449-460, 274-290, 351", "aenderung": "HostedRoomError je senden/tuer fangen und weitermachen, Tür als unzustellbar, _zustand mit try/finally, Exit ≠ 0 bei Fehlern", "test": "test_suite_takt.py: Raum B wirft → A und C genau eine Runde, Fehlzeile im Bericht"},
    {"datei": "tikki/werkzeuge/rollen_config.py:123-133", "aenderung": "yaml.indent(mapping=2, sequence=4, offset=2); vorhandene model/fallback_providers übernehmen, Katalogmodelle nur bei neuer Datei oder --modelle-zuruecksetzen; delegation beim Merge explizit entfernen", "test": "test_rollen_config.py: Hermes atomic_config_write setzt provider/context_length → zweiter schreiben()-Lauf False, Modell bleibt"},
    {"datei": "tikki/plugins/pa/post.py (nachricht_aus_bytes, antwort_bauen, antworten) + pa/__init__.py:94-99", "aenderung": "automatisch-Erkennung (Auto-Submitted/Precedence/List-Id/noreply), Reply-To, Auto-Submitted: auto-replied, \\Answered vor dem Senden, parseaddr(an) mit @", "test": "test_pa.py: Autoresponder nicht beantwortet; Markieren vor Senden, zweiter Aufruf sendet nicht"},
    {"datei": "tikki/werkzeuge/suite_takt.py (main/bericht) + tikki/rollen/wachhalter/SOUL.md", "aenderung": "weckbedarf(zeilen); Textmodus druckt {\"wakeAgent\": false} ohne Handlungsbedarf; Takt-Räume dem Takt lassen (mit Thorsten)", "test": "test_suite_takt.py: leer/nur Takt-Räume → Gate-Zeile; offene Aufgaben 31 min still ohne Takt → keine"},
    {"datei": "apps/desktop/src/app/areas/suites/store.ts:173-184,229,271 + tikki/werkzeuge/suite_takt.py:53-54 + HANDOVER:536", "aenderung": "nachrichtAus setzt system per _SYSTEM-Regex, raumleiterSeitMensch ignoriert Systemnachrichten; AUFGABEN-Regex auf [^\\n]*\\n und [-*]; BRAUCHE-Semantik festlegen", "test": "store.test.ts und test_suite_takt.py mit denselben drei Beispieltexten"}
  ],
  "spaeter": [
    {"datei": "apps/desktop/src/app/areas/tikki/vorzimmer-rahmen.tsx:345-364", "aenderung": "Container-Queries: Seitenwände als Schublade unter ≈88 rem, Hermes-Spalte nie unter ≈880 px; Zeilenangabe im Befund 361", "test": "optional Vitest auf Klassen je Containerbreite"},
    {"datei": "tui_gateway/hosted_room_service.py:158-160 (Fork-Patch oder Upstream-PR) + suite_takt bericht", "aenderung": "Turn-Lock-Schlüssel (profile, room_id); max_concurrent_rooms aus config.yaml; Rundendauer/Wartezeit im Bericht messen", "test": "tests/tikki: zwei Räume gleiches Profil, zweite Runde endet nicht als turn.failed"},
    {"datei": "apps/desktop/src/app/areas/suites/uebung.ts, store.ts, tikki/rollen/KATALOG.json (klone), rollen-einrichten.sh:124-131, labels.ts:204/517, raumleiter/SOUL.md:86, HANDOVER:33", "aenderung": "Raumleiter-Klonprofile je Ansatz (gleiche SOUL, anderes modell.primary, einer lokal/…); nur profile des Mitglieds tauschen; bis dahin Versprechen 'andere Modelle' entschärfen", "test": "store.test.ts: Übungsraum trägt Klonprofil, member_id/handle bleiben raumleiter"},
    {"datei": "tikki/werkzeuge/suite_takt.py (takt/bericht), wachhalter/SOUL.md, HANDOVER 4.8; Upstream-PR gateway/hosted_rooms.py", "aenderung": "Host-Auslastung SUM(event_bytes)/16 MiB und latest_seq/50 000 im Bericht, Warnung ab 80 %, Rotation nach verschmelzen-Muster, Grenzen dokumentieren, Budget als config.yaml-Einstellung (bis dahin Kernänderung Nr. 3)", "test": "test_suite_takt.py mit MAX_GATEWAY_EVENT_BYTES klein: voller Host bricht Tick nicht ab; Rotation gibt Budget frei"},
    {"datei": "tikki/hermes/vorlage-rolle.yaml, tikki/rollen/KATALOG.json, tikki/werkzeuge/rollen_config.py", "aenderung": "providers lokal/lokal-schnell (MLX-Server, context_length 65536), Ketten modell.api/modell.lokal mit --modelle-Schalter, Voice-Konfiguration (stt local, tts piper/mlx-kokoro), Mikrofon in Vorzimmer/Räumen", "test": "test_rollen_config: aktive Kette und Ausweichkette je Modus; Vitest für Sprach-Hook an auftragGeben"},
    {"datei": "tikki/plugins/pa/modelle.py:31", "aenderung": "Muster (\\d+)x(\\d+)[bB] und Namenstabelle (GLM-4.5-Air, GLM-4.5) ergänzen", "test": "tests/tikki/test_modelle.py: beide Namen liefern Parameter"},
    {"datei": "tikki/werkzeuge/rollen_config.py (external_dirs openclaw) + tikki/skills/openclaw-skills/SKILL.md:28 + tikki/rollen/tikki/SOUL.md:118 + wachhalter/SOUL.md:65 + HANDOVER:645/654-656", "aenderung": "openclaw-Bibliothek ohne autonomous-ai-agents einhängen (hermes-agent-Kollision); Skriptpfad korrigieren; BRAUCHE-Hausregel angleichen; Rollentabelle/Grenzen aktualisieren", "test": "skill_view('hermes-agent') eindeutig"}
  ]
}
```