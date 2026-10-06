"""Tikki-Plugin „pa“: die persönliche Assistenz arbeitet selbst.

- Werkzeug ``post``: ungelesene Mails sehen, eine lesen, beantworten (sagt der Mensch „schick
  weg“, wird geschickt), neue schreiben, als erledigt markieren. Läuft im Backend, also auch in
  Daueraufträgen ohne geöffnete App.
- Werkzeug ``briefing_sammeln``: was seit dem letzten Briefing erledigt wurde (Ausgaben der
  Daueraufträge), ungelesene Post, Räume, die warten, neue WhatsApps. Tikki trägt es vor.
- Werkzeug ``lokale_modelle``: welche Modelle auf der Platte liegen (LM Studio, Ollama, Hugging-Face-
  Cache, ~/Models, ~/Downloads) und welcher Modellserver gerade läuft – die App fragt das beim Start.
- Werkzeug ``ressourcen_stand``: der Blick des MR-Bots – Anbieter (Schlüsselnamen, erreichbar, Modelle),
  Abo-Kommandozeilen, lokale Server, Raumleiter-Klone und „Frei jetzt“; Stand in ``~/.tikki/ressourcen.json``.
- ``hermes pa status|briefing|post|modelle|ressourcen`` zum Prüfen von Hand.

Daueraufträge selbst legt Tikki mit dem Hermes-Werkzeug ``cronjob`` an („alle 4 Minuten das
Postfach prüfen und beantworten, was zu beantworten ist“).
"""

from __future__ import annotations

import json
import logging
from email.utils import parseaddr
from pathlib import Path

from . import briefing, modelle, post, ressourcen

logger = logging.getLogger(__name__)

_POST_SCHEMA = {
    "name": "post",
    "description": (
        "Das Postfach der Familie: 'ungelesen' listet neue Mails (uid, von, betreff, kurz, automatisch), "
        "'lesen' holt den ganzen Text einer Mail, 'antworten' schickt eine Antwort im selben Faden "
        "und markiert sie als beantwortet, 'senden' schreibt eine neue Mail, 'erledigt' markiert als "
        "gelesen. Mails mit automatisch=true (Newsletter, Autoresponder, Bounces) werden nie beantwortet. "
        "Antworten gehen sofort raus – wenn der Mensch gesagt hat, dass du antworten sollst, "
        "fragst du nicht noch einmal."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "aktion": {"type": "string", "enum": ["ungelesen", "lesen", "antworten", "senden", "erledigt"]},
            "uid": {"type": "string", "description": "Kennung der Mail aus 'ungelesen' (für lesen/antworten/erledigt)."},
            "text": {"type": "string", "description": "Text der Antwort oder der neuen Mail."},
            "an": {"type": "string", "description": "Empfänger bei 'senden'."},
            "betreff": {"type": "string", "description": "Betreff bei 'senden'."},
            "anzahl": {"type": "integer", "description": "Wie viele bei 'ungelesen' (1–50, Standard 12)."},
        },
        "required": ["aktion"],
    },
}

_BRIEFING_SCHEMA = {
    "name": "briefing_sammeln",
    "description": (
        "Sammelt alles für das Briefing: was deine Daueraufträge seit dem letzten Briefing erledigt "
        "haben, ungelesene Post, Räume, die auf den Menschen warten, neue WhatsApps. Rufe es auf, "
        "wenn der Mensch 'Briefing' sagt oder ankommt; danach erzählst du es ihm."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "nur_lesen": {"type": "boolean", "description": "true: Zeitpunkt nicht fortschreiben (Probe)."},
        },
    },
}


def _home() -> Path:
    from hermes_constants import get_hermes_home

    return get_hermes_home()


def _antwort(daten) -> str:
    return json.dumps(daten, ensure_ascii=False, default=str)


def post_werkzeug(args: dict, **_kw) -> str:
    aktion = str(args.get("aktion") or "").strip()
    zugang = post.zugang()
    if zugang is None:
        return _antwort({"fehler": "Kein Postfach eingerichtet: TIKKI_MAIL_ADDRESS und TIKKI_MAIL_PASSWORD in der .env setzen."})
    fach = post.Postfach(zugang)
    try:
        if aktion == "ungelesen":
            anzahl = max(1, min(50, int(args.get("anzahl") or 12)))
            return _antwort({"ungelesen": [post.als_dict(n) for n in fach.ungelesen(anzahl)]})
        uid = str(args.get("uid") or "").strip()
        if aktion == "lesen":
            n = fach.lesen(uid) if uid else None
            return _antwort(post.als_dict(n) if n else {"fehler": "uid fehlt oder Mail nicht gefunden"})
        if aktion == "antworten":
            text = str(args.get("text") or "").strip()
            if not uid or not text:
                return _antwort({"fehler": "uid und text werden gebraucht"})
            return _antwort(fach.antworten(uid, text))
        if aktion == "senden":
            an, betreff, text = (str(args.get(k) or "").strip() for k in ("an", "betreff", "text"))
            if not an or not text:
                return _antwort({"fehler": "an und text werden gebraucht"})
            if "@" not in parseaddr(an)[1]:
                return _antwort({"fehler": f"'an' ist keine E-Mail-Adresse: {an!r}"})
            kennung = fach.senden(post.neue_mail_bauen(an, betreff or "(kein Betreff)", text, zugang.adresse))
            return _antwort({"gesendet": True, "an": an, "betreff": betreff, "message_id": kennung})
        if aktion == "erledigt":
            if not uid:
                return _antwort({"fehler": "uid fehlt"})
            fach.erledigt(uid)
            return _antwort({"erledigt": uid})
        return _antwort({"fehler": f"unbekannte Aktion {aktion!r}"})
    except Exception as exc:
        logger.warning("post %s fehlgeschlagen: %s", aktion, exc)
        return _antwort({"fehler": f"{type(exc).__name__}: {exc}"})


def briefing_werkzeug(args: dict, **_kw) -> str:
    return _antwort(briefing.sammeln(_home(), stempeln=not bool(args.get("nur_lesen"))))


_MODELLE_SCHEMA = {
    "name": "lokale_modelle",
    "description": (
        "Welche KI-Modelle liegen auf diesem Rechner (LM Studio, Ollama, Hugging-Face-Cache, ~/Models, "
        "~/Downloads) und welcher Modellserver läuft gerade mit welchen Modell-Kennungen. Liefert Größe, "
        "Parameter, Quantisierung, Startbefehl und einen Vorschlag, was für Räume und was für Sprache taugt."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "ordner": {"type": "array", "items": {"type": "string"}, "description": "Zusätzliche Ordner, die durchsucht werden sollen."},
        },
    },
}


_RESSOURCEN_SCHEMA = {
    "name": "ressourcen_stand",
    "description": (
        "Welche Modell-Kraft gerade frei ist: je Anbieter Schlüssel gesetzt (nur Namen), Endpunkt erreichbar, "
        "Modelle; Abo-Kommandozeilen (claude, codex, gemini, grok) vorhanden und angemeldet; lokale Modelle und "
        "laufende Server; Raumleiter-Klone mit Modellkette; und 'Frei jetzt' – welcher Klon nutzbar ist "
        "(lokal → Abo → API). Rufe es auf, wenn ein Modell ausfällt, ein Limit erreicht ist oder jemand "
        "@mr fragt. Nenne nie Schlüsselwerte."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "timeout": {"type": "number", "description": "Sekunden je Anbieter-Anfrage (Standard 5)."},
        },
    },
}


def _cli_setup(parser) -> None:
    sub = parser.add_subparsers(dest="pa_befehl")
    sub.add_parser("status", help="Postfach-Zugang und letztes Briefing")
    b = sub.add_parser("briefing", help="Briefing-Daten sammeln")
    b.add_argument("--nur-lesen", action="store_true", help="Zeitpunkt nicht fortschreiben")
    p = sub.add_parser("post", help="Postfach von Hand")
    p.add_argument("aktion", choices=["ungelesen", "lesen", "erledigt"])
    p.add_argument("uid", nargs="?")
    m = sub.add_parser("modelle", help="Lokale Modelle und laufende Modellserver finden")
    m.add_argument("--json", action="store_true", help="Maschinenlesbar (eine Zeile, Präfix TIKKI-MODELLE)")
    m.add_argument("--ordner", action="append", default=[], help="Zusätzlicher Ordner, mehrfach möglich")
    m.add_argument("--timeout", type=float, default=0.7, help="Sekunden je Server-Anfrage")
    r = sub.add_parser("ressourcen", help="Modell-Ressourcen (MR): Anbieter, Abos, lokal, Klone, Frei jetzt")
    r.add_argument("--json", action="store_true", help="Maschinenlesbar (eine Zeile, Präfix TIKKI-RESSOURCEN)")
    r.add_argument("--timeout", type=float, default=5.0, help="Sekunden je Anbieter-Anfrage")


def _cli(args) -> int:
    befehl = getattr(args, "pa_befehl", None) or "status"
    if befehl == "modelle":
        return modelle.cli(args)
    if befehl == "ressourcen":
        return ressourcen.cli(args)
    if befehl == "briefing":
        print(_antwort(briefing.sammeln(_home(), stempeln=not args.nur_lesen)))
        return 0
    if befehl == "post":
        print(post_werkzeug({"aktion": args.aktion, "uid": args.uid}))
        return 0
    zugang = post.zugang()
    print(f"Postfach: {zugang.adresse + ' über ' + zugang.imap.host if zugang else 'nicht eingerichtet'}")
    letzter = briefing.letzter_stand()
    print(f"Letztes Briefing: {('vor %.0f min' % ((briefing.time.time() - letzter) / 60)) if letzter else 'noch keins'}")
    return 0


def register(ctx) -> None:
    ctx.register_tool(
        name="post", toolset="pa", schema=_POST_SCHEMA, handler=post_werkzeug,
        description=_POST_SCHEMA["description"], emoji="✉️",
    )
    ctx.register_tool(
        name="briefing_sammeln", toolset="pa", schema=_BRIEFING_SCHEMA, handler=briefing_werkzeug,
        description=_BRIEFING_SCHEMA["description"], emoji="📋",
    )
    ctx.register_tool(
        name="lokale_modelle", toolset="pa", schema=_MODELLE_SCHEMA, handler=modelle.werkzeug,
        description=_MODELLE_SCHEMA["description"], emoji="🧠",
    )
    ctx.register_tool(
        name="ressourcen_stand", toolset="pa", schema=_RESSOURCEN_SCHEMA, handler=ressourcen.werkzeug,
        description=_RESSOURCEN_SCHEMA["description"], emoji="📡",
    )
    ctx.register_cli_command(
        name="pa", help="Tikkis persönliche Assistenz: Postfach, Briefing, lokale Modelle, Ressourcen",
        setup_fn=_cli_setup, handler_fn=_cli,
    )
