"""Tikki-Plugin „raeume“: das Werkzeug ``raum`` über Hermes' gehosteten Gruppenräumen.

Hermes hat für fast alles, was eine Rolle tun will, ein eigenes Werkzeug: nachfragen (``clarify``),
planen (``cronjob``), abgeben (``delegate_task``), etwas zeigen (``open_preview``). Nur an die Räume
kommt ein Modell von sich aus nicht heran – sie gehören dem Menschen und der App (RPCs ``groups.*``).
Dieses Werkzeug schließt genau diese Lücke, schmal: Räume auflisten, die Lage eines Raums lesen,
einen eröffnen, in einen hineinsprechen, zwei verschmelzen. Alles Weitere bleibt bei Hermes: Die
Runden fährt das Gateway, und wer einen Raum regelmäßig wieder aufrufen will, nimmt ``cronjob``.

Das Werkzeug schreibt nichts vor. Es sagt, was es tut und was es zurückgibt; wann es passt,
entscheidet die Rolle. Eine Nachricht aus dem Werkzeug trägt ihren Sprecher im Absender des
Ereignisses, daran erkennt die App sie – nicht an ihrem Wortlaut.
"""

from __future__ import annotations

import json
import logging
import time

logger = logging.getLogger(__name__)

#: So viele der letzten Wortmeldungen liefert ``stand`` mit.
STAND_NACHRICHTEN = 12
#: So lang darf eine Wortmeldung in ``stand`` sein; der Rest steht im Raum.
STAND_ZEICHEN = 1200

_SCHEMA = {
    "name": "raum",
    "description": (
        "Die Räume des Hauses: Gruppengespräche, in denen ein Raumleiter mit Fachleuten an einem "
        "Vorhaben arbeitet. 'liste' nennt alle Räume mit ihrer Lage (wer arbeitet, ob eine Runde "
        "gescheitert ist, ob eine Wortmeldung noch ohne Antwort ist). 'stand' liefert Mitglieder und "
        "die letzten Wortmeldungen eines Raums. 'rollen' nennt, wer sich in einen Raum holen lässt. "
        "'eroeffnen' legt einen Raum an – Raumleiter und Grundbesatzung sitzen von selbst darin, "
        "'rollen' holt Fachleute dazu – und stellt 'text' als erste Wortmeldung hinein. 'senden' "
        "stellt 'text' in einen bestehenden Raum; mit @name ist ein Mitglied angesprochen, ohne @ "
        "alle. 'verschmelzen' macht aus 'raum' und 'mit' einen neuen Raum mit den Mitgliedern und "
        "den letzten Wortmeldungen beider und löst die zwei alten auf; dafür wird der Mensch um "
        "Freigabe gefragt. Antworten der Mitglieder kommen im Raum, nicht als Ergebnis dieses Aufrufs."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "aktion": {"type": "string", "enum": ["liste", "stand", "rollen", "eroeffnen", "senden", "verschmelzen"]},
            "raum": {"type": "string", "description": "Kennung oder Name des Raums (stand, senden, verschmelzen)."},
            "mit": {"type": "string", "description": "Der zweite Raum bei 'verschmelzen'."},
            "name": {"type": "string", "description": "Name des neuen Raums (eroeffnen; bei verschmelzen freiwillig)."},
            "text": {"type": "string", "description": "Die Wortmeldung (eroeffnen, senden)."},
            "rollen": {"type": "array", "items": {"type": "string"},
                       "description": "Kennungen der Fachleute aus 'rollen', die zusätzlich in den neuen Raum kommen."},
            "raumleiter": {"type": "string",
                           "description": "Kennung eines Raumleiters mit anderem Modell (aus 'rollen'); sonst der übliche."},
        },
        "required": ["aktion"],
    },
}


def _antwort(daten) -> str:
    return json.dumps(daten, ensure_ascii=False, default=str)


def _sprecher() -> str:
    """Wer gerade spricht: der Name der Rolle, in deren Profil der Aufruf läuft."""
    from tikki.werkzeuge import raeume

    profil = "default"
    try:
        from hermes_constants import get_hermes_home

        home = get_hermes_home()
        profil = home.name if home.parent.name == "profiles" else "default"
    except Exception:
        pass
    eintrag = next((e for e in raeume.katalog() if e.get("hermes_profil") == profil), None)
    return str(eintrag["name"]) if eintrag else profil


def _lage(raum: dict) -> dict:
    from tikki.werkzeuge import raeume

    lage = raeume.lage(raum)
    aktiv = lage.pop("letzte_aktivitaet")
    lage["still_seit_min"] = int((time.time() - aktiv) / 60) if aktiv else None
    return lage


def _rollen() -> list[dict]:
    from tikki.werkzeuge import raeume

    return [
        {
            "kennung": e["slug"], "name": e["name"], "kurz": e.get("kurz", ""),
            **({"raumleiter_mit_anderem_modell": True} if e.get("klon_von") == raeume.RAUMLEITER else {}),
            **({"sitzt_in_jedem_raum": True} if e.get("im_raum_ab_start") else {}),
        }
        for e in raeume.katalog()
    ]


def _freigabe(grund: str, schluessel: str) -> bool:
    """Hermes' Freigabe für einen Schritt, der sich nicht zurücknehmen lässt."""
    try:
        from tools.approval import request_tool_approval

        return bool(request_tool_approval("raum", grund, rule_key=schluessel).get("approved"))
    except Exception as exc:
        logger.warning("Freigabe für %r nicht einholbar: %s", grund, exc)
        return False


def raum_werkzeug(args: dict, **_kw) -> str:
    from tikki.werkzeuge import raeume

    aktion = str(args.get("aktion") or "").strip()
    text = str(args.get("text") or "").strip()
    try:
        if aktion == "rollen":
            return _antwort({"rollen": _rollen()})
        if aktion == "liste":
            vorhanden = raeume.liste() if raeume.db_pfad().is_file() else []
            return _antwort({"raeume": [_lage(r) for r in vorhanden]})
        if aktion == "eroeffnen":
            name = str(args.get("name") or "").strip()
            if not name:
                return _antwort({"fehler": "name wird gebraucht"})
            rollen = [str(r).strip() for r in (args.get("rollen") or []) if str(r).strip()]
            neu = raeume.anlegen(name, rollen, raumleiter=str(args.get("raumleiter") or "").strip() or None)
            if text:
                raeume.senden(neu["room_id"], text, von=_sprecher())
            return _antwort({"eroeffnet": neu["room_id"], "name": neu["name"],
                             "mitglieder": [m["handle"] for m in neu["members"]]})
        raum = raeume.finden(str(args.get("raum") or ""))
        if aktion == "stand":
            seit = max(0, int(raum.get("latest_seq") or 0) - raeume.LAGE_EREIGNISSE)
            letzte = raeume.nachrichten(raeume.verlauf(raum["room_id"], seit=seit), raum)[-STAND_NACHRICHTEN:]
            return _antwort({**_lage(raum), "zuletzt": [{"von": n["name"], "text": n["text"][:STAND_ZEICHEN]} for n in letzte]})
        if aktion == "senden":
            if not text:
                return _antwort({"fehler": "text wird gebraucht"})
            seq = raeume.senden(raum["room_id"], text, von=_sprecher())["seq"]
            return _antwort({"gesendet": True, "raum": raum["room_id"], "name": raum["name"], "seq": seq})
        if aktion == "verschmelzen":
            zweiter = raeume.finden(str(args.get("mit") or ""))
            grund = f"Räume „{raum['name']}“ und „{zweiter['name']}“ verschmelzen (beide werden aufgelöst)"
            if not _freigabe(grund, f"raum-verschmelzen:{raum['room_id']}:{zweiter['room_id']}"):
                return _antwort({"verschmolzen": False, "grund": "vom Menschen nicht freigegeben"})
            neu = raeume.verschmelzen(raum["room_id"], zweiter["room_id"], name=str(args.get("name") or "").strip() or None)
            return _antwort({"verschmolzen": True, "raum": neu["room_id"], "name": neu["name"],
                             "mitglieder": [m["handle"] for m in neu["members"]]})
        return _antwort({"fehler": f"unbekannte Aktion {aktion!r}"})
    except Exception as exc:
        logger.warning("raum %s fehlgeschlagen: %s", aktion, exc)
        return _antwort({"fehler": f"{type(exc).__name__}: {exc}"})


def register(ctx) -> None:
    ctx.register_tool(
        name="raum", toolset="raeume", schema=_SCHEMA, handler=raum_werkzeug,
        description=_SCHEMA["description"], emoji="🚪",
    )
