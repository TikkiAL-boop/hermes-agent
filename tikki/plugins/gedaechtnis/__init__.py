"""Tikki-Plugin „gedaechtnis“: keine Information, kein Arbeitsschritt geht verloren.

- Nach jeder Runde (``post_llm_call``) geht im Hintergrund ins Gedächtnis, was dazugehört:
  ein Gespräch mit dem Menschen als Frage-Antwort-Paar an die TencentDB-Instanzen des Menschen
  und des Systems und in seine RAG-Sammlung; die Wortmeldung eines Mitglieds im Raum als
  Raumwissen (System-Instanz, RAG) – nie als „Mensch:“. Läufe ohne Menschen (Daueraufträge,
  delegierte Bots) werden nicht gespiegelt. Die Runde wartet darauf nicht.
- Das Werkzeug ``nachschlagen`` sucht in RAG, TencentDB und (falls eingerichtet)
  Hindsight. Honcho hat eigene Werkzeuge über den Gedächtnisanbieter.
- ``hermes gedaechtnis einspielen <pfad>`` nimmt Dateien (Markdown, Text) ins Systemwissen
  und in die RAG-Sammlung auf; ``hermes gedaechtnis verlauf`` holt alle bisherigen
  Gespräche der Tikki-Profile nach.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from . import speicher

logger = logging.getLogger(__name__)

_SCHEMA = {
    "name": "nachschlagen",
    "description": (
        "Schlägt in Tikkis Gedächtnis nach: in der Wissenssammlung des Menschen (RAG: frühere "
        "Gespräche, Projekte, eingespielte Dokumente), in TencentDB (Fakten, Szenen, Persona – "
        "je Mensch und fürs ganze System) und in Hindsight, falls eingerichtet. Nutze es, bevor "
        "du etwas neu recherchierst oder den Menschen etwas fragst, das er schon gesagt haben könnte."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "frage": {"type": "string", "description": "Wonach gesucht wird, in ganzen Worten."},
            "quelle": {
                "type": "string",
                "enum": ["alle", "rag", "tencent", "hindsight"],
                "description": "Wo gesucht wird; Standard: alle.",
            },
            "anzahl": {"type": "integer", "description": "Treffer je Quelle (1–20, Standard 6)."},
        },
        "required": ["frage"],
    },
}


def _profil() -> str:
    try:
        from hermes_constants import get_hermes_home

        home = get_hermes_home()
        return home.name if home.parent.name == "profiles" else "default"
    except Exception:
        return "default"


def nachschlagen(args: dict, **_kw) -> str:
    frage = str(args.get("frage") or "").strip()
    if not frage:
        return json.dumps({"fehler": "frage fehlt"}, ensure_ascii=False)
    quelle = args.get("quelle") or "alle"
    anzahl = max(1, min(20, int(args.get("anzahl") or 6)))
    cfg = speicher.einstellungen()
    nutzer = cfg["nutzer"]
    ergebnis: dict[str, object] = {}
    if quelle in ("alle", "rag"):
        rag = speicher.rag_fuer(nutzer, cfg)
        try:
            ergebnis["rag"] = [
                {"quelle": t.quelle, "titel": t.titel, "text": t.text} for t in rag.suchen(frage, anzahl)
            ]
        finally:
            rag.close()
    if quelle in ("alle", "tencent"):
        for name, instanz in speicher.tencent_instanzen(cfg, nutzer):
            try:
                ergebnis[name] = speicher.tencent_suchen(instanz, frage, anzahl) or "keine Treffer"
            except Exception as exc:
                ergebnis[name] = f"nicht erreichbar: {exc}"
    if quelle in ("alle", "hindsight") and (cfg.get("hindsight") or {}).get("url"):
        try:
            ergebnis["hindsight"] = speicher.hindsight_suchen(cfg, frage) or "keine Treffer"
        except Exception as exc:
            ergebnis["hindsight"] = f"nicht erreichbar: {exc}"
    return json.dumps(ergebnis, ensure_ascii=False)


def _spiegeln(sitzung: str, profil: str, frage: str, antwort: str) -> None:
    """Eine Runde mit einem Menschen: in seine Speicher und die des Systems."""
    cfg = speicher.einstellungen()
    nutzer = cfg["nutzer"]
    schluessel = f"{profil}:{sitzung}"
    for name, instanz in speicher.tencent_instanzen(cfg, nutzer):
        try:
            speicher.tencent_merken(instanz, schluessel, nutzer if name != "tencent:system" else "system",
                                    frage, antwort)
        except Exception as exc:
            logger.debug("gedaechtnis: %s nicht erreichbar: %s", name, exc)
    try:
        speicher.hindsight_merken(cfg, f"Mensch: {frage}\nTikki ({profil}): {antwort}")
    except Exception as exc:
        logger.debug("gedaechtnis: Hindsight nicht erreichbar: %s", exc)
    rag = speicher.rag_fuer(nutzer, cfg)
    try:
        rag.aufnehmen(
            f"gespraech:{profil}", sitzung, speicher.runden_text(profil, frage, antwort),
            schluessel=speicher.runden_schluessel(profil, sitzung, antwort),
        )
    finally:
        rag.close()


def _raum_spiegeln(sitzung: str, profil: str, raum: str, mitglied: str, antwort: str) -> None:
    """Die Wortmeldung eines Mitglieds im Raum: Wissen des Systems, nicht etwas, das der Mensch
    gesagt hat. Der Prompt der Runde (die Wortmeldungen der anderen) wird nicht gespiegelt – jedes
    Mitglied spiegelt seine eigene, so steht jede genau einmal im Gedächtnis."""
    cfg = speicher.einstellungen()
    system = (cfg.get("tencent") or {}).get("system") or {}
    if system.get("url"):
        try:
            speicher.tencent_merken(system, f"{profil}:{sitzung}", "system", f"Raum „{raum}“", f"@{mitglied}: {antwort}")
        except Exception as exc:
            logger.debug("gedaechtnis: tencent:system nicht erreichbar: %s", exc)
    try:
        speicher.hindsight_merken(cfg, speicher.raum_text(raum, mitglied, profil, antwort))
    except Exception as exc:
        logger.debug("gedaechtnis: Hindsight nicht erreichbar: %s", exc)
    rag = speicher.rag_fuer(cfg["nutzer"], cfg)
    try:
        rag.aufnehmen(
            f"raum:{profil}", raum, speicher.raum_text(raum, mitglied, profil, antwort),
            schluessel=speicher.runden_schluessel(profil, sitzung, antwort),
        )
    finally:
        rag.close()


def nach_der_runde(*, session_id: str = "", user_message=None, assistant_response=None, platform=None, **_kw) -> None:
    """Nach jeder Runde: Gespräche mit dem Menschen und Wortmeldungen im Raum merken. Läufe ohne
    Menschen (Daueraufträge, delegierte Bots, HTTP-Aufrufe) sind kein Gespräch und bleiben draußen."""
    from tikki.werkzeuge.turn_art import AUFTRAG, RAUM, raum_aus_prompt, turn_art

    frage = user_message if isinstance(user_message, str) else ""
    antwort = assistant_response if isinstance(assistant_response, str) else ""
    art = turn_art(plattform=platform, prompt=frage)
    if art == AUFTRAG or not (frage.strip() and antwort.strip()):
        return
    from agent.memory_provider import spawn_context_thread

    if art == RAUM:
        raum = raum_aus_prompt(frage)
        if raum is None or speicher.ist_pass(antwort):
            return
        ziel, argumente = _raum_spiegeln, (session_id, _profil(), *raum, antwort)
    else:
        ziel, argumente = _spiegeln, (session_id, _profil(), frage, antwort)
    spawn_context_thread(ziel, name="tikki-gedaechtnis", args=argumente).start()


# ─── hermes gedaechtnis … ────────────────────────────────────────────────────


def _cli_setup(parser) -> None:
    unter = parser.add_subparsers(dest="gedaechtnis_befehl", required=True)
    einspielen = unter.add_parser("einspielen", help="Dateien ins Systemwissen und die RAG-Sammlung aufnehmen")
    einspielen.add_argument("pfade", nargs="+")
    unter.add_parser("verlauf", help="Alle bisherigen Gespräche der Tikki-Profile nachholen")
    unter.add_parser("status", help="Welche Speicher erreichbar sind")


def einspielen(pfade: list[str]) -> tuple[int, int]:
    """Dateien aufnehmen: RAG des Menschen und TencentDB-Systeminstanz. Rückgabe (Dateien, Stücke)."""
    cfg = speicher.einstellungen()
    rag = speicher.rag_fuer(cfg["nutzer"], cfg)
    system = (cfg.get("tencent") or {}).get("system") or {}
    dateien = stuecke = 0
    try:
        for pfad in pfade:
            wurzel = Path(pfad).expanduser()
            kandidaten = [wurzel] if wurzel.is_file() else sorted(
                p for p in wurzel.rglob("*") if p.suffix.lower() in {".md", ".txt", ".rst"}
            )
            for datei in kandidaten:
                text = datei.read_text(encoding="utf-8", errors="replace")
                titel = str(datei.relative_to(wurzel.parent)) if datei != wurzel else datei.name
                # Eine geänderte Datei ersetzt ihren früheren Stand; eine unveränderte bleibt, wie sie ist.
                neu = rag.ersetzen("wissen", titel, text, schluessel=f"datei:{datei.resolve()}")
                stuecke += neu
                dateien += 1
                # Nur Neues ins Systemgedächtnis: ein zweites Einspielen erzeugt dort keine Doppel.
                if system.get("url") and neu:
                    for teil in speicher._stueckeln(text, 3000, 0):
                        speicher.tencent_merken(system, f"wissen:{titel}", "system", f"Wissen aus {titel}", teil)
    finally:
        rag.close()
    return dateien, stuecke


def verlauf_nachholen() -> int:
    """Die bisherigen Gespräche der Tikki-Profile (state.db) in die RAG-Sammlung aufnehmen, ohne
    Doppel – nach denselben Regeln und mit denselben Schlüsseln wie das Spiegeln nach der Runde:
    Gespräche mit dem Menschen als solche, Wortmeldungen im Raum als Raumwissen, Läufe ohne
    Menschen (Daueraufträge) gar nicht. Profile, die nicht im Rollenkatalog stehen, bleiben außen vor."""
    from hermes_cli.profiles import get_profile_dir
    from hermes_state import SessionDB
    from tikki.werkzeuge.raeume import katalog
    from tikki.werkzeuge.turn_art import OHNE_MENSCH, RAUM_QUELLE, raum_aus_prompt

    cfg = speicher.einstellungen()
    rag = speicher.rag_fuer(cfg["nutzer"], cfg)
    neu = 0
    try:
        wurzel = get_profile_dir("tikki").parent
        for home in sorted(wurzel / e["hermes_profil"] for e in katalog()):
            if not (home / "state.db").is_file():
                continue
            db = SessionDB(db_path=home / "state.db", read_only=True)
            try:
                for zeile in db.list_sessions_rich(limit=100000, include_hidden=True):
                    quelle = str(zeile.get("source") or "").strip().lower()
                    if quelle in OHNE_MENSCH:
                        continue
                    frage = None
                    for nachricht in db.get_messages(zeile["id"]):
                        inhalt = nachricht.get("content") if isinstance(nachricht.get("content"), str) else ""
                        if nachricht.get("role") == "user":
                            frage = inhalt
                        elif nachricht.get("role") == "assistant" and frage and inhalt.strip():
                            neu += _nachholen(rag, home.name, zeile, nachricht, frage, inhalt,
                                              raum_aus_prompt(frage), quelle == RAUM_QUELLE)
                            frage = None
            finally:
                db.close()
    finally:
        rag.close()
    return neu


def _nachholen(rag, profil: str, sitzung: dict, nachricht: dict, frage: str, antwort: str,
               raum: tuple[str, str] | None, raum_sitzung: bool) -> int:
    """Eine Antwort aus dem Verlauf aufnehmen, wenn sie noch fehlt; Rückgabe: neue Stücke."""
    schluessel = speicher.runden_schluessel(profil, sitzung["id"], antwort)
    # Vor dem gemeinsamen Schlüssel nahm ``verlauf`` unter ``msg:<profil>:<id>`` auf.
    if rag.kennt(f"msg:{profil}:{nachricht.get('id')}"):
        return 0
    if raum is not None:
        if speicher.ist_pass(antwort):
            return 0
        return rag.aufnehmen(f"raum:{profil}", raum[0], speicher.raum_text(*raum, profil, antwort), schluessel=schluessel)
    if raum_sitzung:
        return 0  # Raum-Sitzung ohne lesbaren Raum-Prompt: kein Gespräch mit dem Menschen
    return rag.aufnehmen(
        f"gespraech:{profil}", sitzung.get("title") or sitzung["id"],
        speicher.runden_text(profil, frage, antwort), schluessel=schluessel,
    )


def _cli(args) -> int:
    befehl = args.gedaechtnis_befehl
    if befehl == "einspielen":
        dateien, stuecke = einspielen(args.pfade)
        print(f"{dateien} Dateien, {stuecke} neue Stücke aufgenommen.")
        return 0
    if befehl == "verlauf":
        print(f"{verlauf_nachholen()} neue Stücke aus bisherigen Gesprächen aufgenommen.")
        return 0
    cfg = speicher.einstellungen()
    print(f"Mensch: {cfg['nutzer']}")
    rag = speicher.rag_fuer(cfg["nutzer"], cfg)
    print(f"RAG: {rag.pfad}")
    rag.close()
    for name, instanz in speicher.tencent_instanzen(cfg, cfg["nutzer"]):
        zustand = "erreichbar" if speicher.tencent_gesund(instanz) else "nicht erreichbar"
        print(f"{name}: {instanz['url']} {zustand}")
    print(f"Hindsight: {(cfg.get('hindsight') or {}).get('url') or 'nicht eingerichtet'}")
    return 0


def register(ctx) -> None:
    ctx.register_tool(
        name="nachschlagen", toolset="gedaechtnis", schema=_SCHEMA, handler=nachschlagen,
        description=_SCHEMA["description"], emoji="🗂️",
    )
    ctx.register_hook("post_llm_call", nach_der_runde)
    ctx.register_cli_command(
        name="gedaechtnis", help="Tikkis Gedächtnis: Wissen einspielen, Verlauf nachholen, Status",
        setup_fn=_cli_setup, handler_fn=_cli,
    )
