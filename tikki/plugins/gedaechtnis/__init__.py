"""Tikki-Plugin „gedaechtnis“: keine Information, kein Arbeitsschritt geht verloren.

- Nach jeder Runde (``post_llm_call``) geht das Frage-Antwort-Paar im Hintergrund an
  die TencentDB-Instanzen des Menschen und des Systems und in seine RAG-Sammlung.
  Die Runde wartet darauf nicht: das Vorzimmer bleibt schnell.
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
        rag.aufnehmen(f"gespraech:{profil}", sitzung, f"Mensch: {frage}\n\nAntwort ({profil}): {antwort}")
    finally:
        rag.close()


def nach_der_runde(*, session_id: str = "", user_message=None, assistant_response=None, **_kw) -> None:
    frage = user_message if isinstance(user_message, str) else ""
    antwort = assistant_response if isinstance(assistant_response, str) else ""
    if not (frage.strip() and antwort.strip()):
        return
    from agent.memory_provider import spawn_context_thread

    spawn_context_thread(
        _spiegeln, name="tikki-gedaechtnis", args=(session_id, _profil(), frage, antwort)
    ).start()


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
                neu = rag.aufnehmen("wissen", titel, text, schluessel=f"datei:{datei.resolve()}")
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
    """Alle Gespräche aller Tikki-Profile (state.db) in die RAG-Sammlung aufnehmen, ohne Doppel."""
    from hermes_cli.profiles import get_profile_dir
    from hermes_state import SessionDB

    cfg = speicher.einstellungen()
    rag = speicher.rag_fuer(cfg["nutzer"], cfg)
    neu = 0
    try:
        wurzel = get_profile_dir("tikki").parent
        for home in sorted(p for p in wurzel.iterdir() if (p / "state.db").is_file()):
            db = SessionDB(db_path=home / "state.db", read_only=True)
            try:
                for zeile in db.list_sessions_rich(limit=100000, include_hidden=True):
                    frage = None
                    for nachricht in db.get_messages(zeile["id"]):
                        inhalt = nachricht.get("content") if isinstance(nachricht.get("content"), str) else ""
                        if nachricht.get("role") == "user":
                            frage = inhalt
                        elif nachricht.get("role") == "assistant" and frage and inhalt.strip():
                            neu += rag.aufnehmen(
                                f"gespraech:{home.name}", zeile.get("title") or zeile["id"],
                                f"Mensch: {frage}\n\nAntwort ({home.name}): {inhalt}",
                                schluessel=f"msg:{home.name}:{nachricht.get('id')}",
                            )
                            frage = None
            finally:
                db.close()
    finally:
        rag.close()
    return neu


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
