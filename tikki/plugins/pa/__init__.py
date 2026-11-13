"""Tikki-Plugin „pa“: die persönliche Assistenz arbeitet selbst.

Jedes Werkzeug hat sein eigenes Toolset; eine Rolle bekommt nur, was ihr Katalog nennt:

- ``post`` (Toolset ``post``, nur mit eingerichtetem Postfach): ungelesene Mails sehen, eine
  lesen, beantworten, neue schreiben, als erledigt markieren. Läuft im Backend, also auch in
  Daueraufträgen ohne geöffnete App. An freigegebene Empfänger wird gesendet; für jeden anderen
  fragt das Werkzeug Hermes' Freigabe, und ohne Ja wird die Mail Entwurf (``post.py``).
- ``briefing_sammeln`` (Toolset ``briefing``): was seit dem letzten Briefing erledigt wurde
  (Ausgaben der Daueraufträge), ungelesene Post, Räume, die warten, neue WhatsApps.
- ``lokale_modelle`` (Toolset ``modelle``): welche Modelle auf der Platte liegen (LM Studio,
  Ollama, Hugging-Face-Cache, ~/Models, ~/Downloads) und welcher Modellserver gerade läuft.
- ``ressourcen_stand`` (Toolset ``ressourcen``): der Blick des MR-Bots – Anbieter (Schlüsselnamen,
  erreichbar, Modelle), Abo-Kommandozeilen, lokale Server, Raumleiter-Klone und „Frei jetzt“.
- ``hermes pa status|briefing|post|freigabe|modelle|ressourcen`` zum Prüfen und Einrichten von Hand.

Daueraufträge selbst legt Tikki mit dem Hermes-Werkzeug ``cronjob`` an („alle 4 Minuten das
Postfach prüfen und beantworten, was zu beantworten ist“).
"""

from __future__ import annotations

import json
import logging
from email.utils import parseaddr

from . import briefing, modelle, post, ressourcen

logger = logging.getLogger(__name__)

_POST_SCHEMA = {
    "name": "post",
    "description": (
        "Das Postfach der Familie: 'ungelesen' listet neue Mails (uid, von, betreff, kurz, automatisch), "
        "'lesen' holt den ganzen Text einer Mail, 'antworten' schickt eine Antwort im selben Faden "
        "und markiert sie als beantwortet, 'senden' schreibt eine neue Mail, 'erledigt' markiert als "
        "gelesen. Mails mit automatisch=true (Newsletter, Autoresponder, Bounces) beantwortet das Werkzeug "
        "nicht. Post an Empfänger, die nicht freigegeben sind, legt es dem Menschen zur Freigabe vor; "
        "ohne sein Ja liegt sie als Entwurf im Postfach (Ergebnis: gesendet=false, entwurf=true)."
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
        "Sammelt, was seit dem letzten Briefing angefallen ist: was die Daueraufträge erledigt haben, "
        "ungelesene Post, Räume, in denen eine Runde gescheitert ist oder eine Wortmeldung des Menschen "
        "noch ohne Antwort ist, neue WhatsApps."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "nur_lesen": {"type": "boolean", "description": "true: Zeitpunkt nicht fortschreiben (Probe)."},
        },
    },
}


def _antwort(daten) -> str:
    return json.dumps(daten, ensure_ascii=False, default=str)


KEIN_POSTFACH = (
    "Kein Postfach eingerichtet: Adresse mit `hermes -p <profil> pa postfach <adresse>` eintragen "
    f"und {post.PASSWORT} in die .env des Profils setzen."
)


def mensch_stimmt_zu(empfaenger: str) -> bool:
    """Hermes' Freigabe für eine Mail an einen nicht freigegebenen Empfänger.

    Dieselbe Schranke wie für gefährliche Befehle: Der Mensch sieht die Frage in der Sitzung
    (einmal / für die Sitzung / immer / nein), im Raum steht sie als offene Freigabe an, ein
    Dauerauftrag folgt ``approvals.cron_mode``, und wo niemand antworten kann, heißt es nein.
    „Immer“ gilt je Empfänger.
    """
    from tools.approval import request_tool_approval

    adresse = parseaddr(empfaenger or "")[1].strip().lower() or str(empfaenger)
    try:
        ergebnis = request_tool_approval("post", f"Mail an {adresse} senden", rule_key=f"post-an:{adresse}")
    except Exception as exc:
        logger.warning("Freigabe für Mail an %s nicht einholbar: %s", adresse, exc)
        return False
    return bool(ergebnis.get("approved"))


def post_werkzeug(args: dict, **_kw) -> str:
    aktion = str(args.get("aktion") or "").strip()
    try:
        werte = post.einstellungen()
        zugang = post.zugang(werte)
        if zugang is None:
            return _antwort({"fehler": KEIN_POSTFACH})
        fach = post.Postfach(zugang)
        if aktion == "ungelesen":
            anzahl = max(1, min(50, int(args.get("anzahl") or 12)))
            return post.rahmen(_antwort({"ungelesen": [post.als_dict(n) for n in fach.ungelesen(anzahl)]}), "post")
        uid = str(args.get("uid") or "").strip()
        if aktion in ("lesen", "antworten", "erledigt"):
            uid = post.uid_pruefen(uid)
        if aktion == "lesen":
            n = fach.lesen(uid)
            return post.rahmen(_antwort(post.als_dict(n)), "post") if n else _antwort({"fehler": "Mail nicht gefunden"})
        # Nicht der Prompt und nicht die Mail entscheiden, ob gesendet wird, sondern Hermes' Freigabe.
        mensch, freigabe = mensch_stimmt_zu, post.freigabe(werte)
        if aktion == "antworten":
            text = str(args.get("text") or "").strip()
            if not text:
                return _antwort({"fehler": "text wird gebraucht"})
            return _antwort(fach.antworten(uid, text, mensch=mensch, freigabe=freigabe))
        if aktion == "senden":
            an, betreff, text = (str(args.get(k) or "").strip() for k in ("an", "betreff", "text"))
            if not an or not text:
                return _antwort({"fehler": "an und text werden gebraucht"})
            if "@" not in parseaddr(an)[1]:
                return _antwort({"fehler": f"'an' ist keine E-Mail-Adresse: {an!r}"})
            msg = post.neue_mail_bauen(an, betreff or "(kein Betreff)", text, zugang.adresse)
            return _antwort(fach.zustellen(msg, mensch=mensch, freigabe=freigabe))
        if aktion == "erledigt":
            fach.erledigt(uid)
            return _antwort({"erledigt": uid})
        return _antwort({"fehler": f"unbekannte Aktion {aktion!r}"})
    except Exception as exc:
        logger.warning("post %s fehlgeschlagen: %s", aktion, exc)
        return _antwort({"fehler": f"{type(exc).__name__}: {exc}"})


def briefing_werkzeug(args: dict, **_kw) -> str:
    """Das Briefing für das Modell: Eigenes als JSON, Post und WhatsApp gerahmt als Fremdinhalt."""
    daten = briefing.sammeln(stempeln=not bool(args.get("nur_lesen")))
    fremd = {quelle: daten.pop(quelle) for quelle in ("post", "whatsapp") if daten.get(quelle)}
    return "\n".join([_antwort(daten), *(post.rahmen(_antwort(inhalt), quelle) for quelle, inhalt in fremd.items())])


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
        "(lokal → Abo → API). Schlüsselwerte enthält das Ergebnis nicht."
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
    a = sub.add_parser("postfach", help="Adresse des Postfachs für dieses Profil eintragen (Passwort: .env)")
    a.add_argument("adresse")
    f = sub.add_parser("freigabe", help="Empfänger, an die Tikki ohne Nachfrage senden darf (Adresse oder @domain)")
    f.add_argument("--dazu", action="append", default=[], metavar="EMPFÄNGER")
    f.add_argument("--weg", action="append", default=[], metavar="EMPFÄNGER")
    m = sub.add_parser("modelle", help="Lokale Modelle und laufende Modellserver finden")
    m.add_argument("--json", action="store_true", help="Maschinenlesbar (eine Zeile, Präfix TIKKI-MODELLE)")
    m.add_argument("--ordner", action="append", default=[], help="Zusätzlicher Ordner, mehrfach möglich")
    m.add_argument("--timeout", type=float, default=0.7, help="Sekunden je Server-Anfrage")
    r = sub.add_parser("ressourcen", help="Modell-Ressourcen (MR): Anbieter, Abos, lokal, Klone, Frei jetzt")
    r.add_argument("--json", action="store_true", help="Maschinenlesbar (eine Zeile, Präfix TIKKI-RESSOURCEN)")
    r.add_argument("--timeout", type=float, default=5.0, help="Sekunden je Anbieter-Anfrage")


def _cli_briefing(args, _ctx) -> int:
    print(_antwort(briefing.sammeln(stempeln=not args.nur_lesen)))
    return 0


def _cli_post(args, _ctx) -> int:
    print(post_werkzeug({"aktion": args.aktion, "uid": args.uid}))
    return 0


def _cli_postfach(args, ctx) -> int:
    adresse = parseaddr(args.adresse)[1].strip().lower()
    if adresse.count("@") != 1:
        print(f"Keine E-Mail-Adresse: {args.adresse!r}")
        return 2
    ctx.set_config("mail_address", adresse)
    print(f"Postfach {adresse} eingetragen. Das Passwort gehört als {post.PASSWORT} in die .env dieses Profils.")
    return 0


def _cli_freigabe(args, ctx) -> int:
    liste = post.freigabe()
    neu = [e for e in liste if e not in {w.strip().lower() for w in args.weg}]
    for eintrag in (d.strip().lower() for d in args.dazu):
        if "@" not in eintrag:
            print(f"Kein Empfänger (Adresse oder @domain): {eintrag!r}")
            return 2
        if eintrag not in neu:
            neu.append(eintrag)
    if neu != liste:
        ctx.set_config("mail_freigabe", neu)
    print("Ohne Menschen darf Tikki senden an: " + (", ".join(neu) or "niemanden (alles wird Entwurf)"))
    return 0


def _cli_status(_args, _ctx) -> int:
    zugang = post.zugang()
    print(f"Postfach: {zugang.adresse + ' über ' + zugang.imap.host if zugang else 'nicht eingerichtet'}")
    print("Freigabe ohne Menschen: " + (", ".join(post.freigabe()) or "niemand (alles wird Entwurf)"))
    letzter = briefing.letzter_stand()
    print(f"Letztes Briefing: {('vor %.0f min' % ((briefing.time.time() - letzter) / 60)) if letzter else 'noch keins'}")
    return 0


_CLI_BEFEHLE = {
    "modelle": lambda args, _ctx: modelle.cli(args), "ressourcen": lambda args, _ctx: ressourcen.cli(args),
    "briefing": _cli_briefing, "post": _cli_post, "postfach": _cli_postfach, "freigabe": _cli_freigabe,
    "status": _cli_status,
}

#: Werkzeug → (Toolset, Schema, Handler, Emoji, check_fn). Ein Toolset je Werkzeug: MR und der
#: Raumleiter brauchen den Ressourcen-Stand, aber weder das Postfach noch Tikkis Briefing-Stempel.
WERKZEUGE = {
    "post": ("post", _POST_SCHEMA, post_werkzeug, "✉️", post.eingerichtet),
    "briefing_sammeln": ("briefing", _BRIEFING_SCHEMA, briefing_werkzeug, "📋", None),
    "lokale_modelle": ("modelle", _MODELLE_SCHEMA, modelle.werkzeug, "🧠", None),
    "ressourcen_stand": ("ressourcen", _RESSOURCEN_SCHEMA, ressourcen.werkzeug, "📡", None),
}


def register(ctx) -> None:
    for name, (toolset, schema, handler, emoji, check_fn) in WERKZEUGE.items():
        ctx.register_tool(
            name=name, toolset=toolset, schema=schema, handler=handler, check_fn=check_fn,
            description=schema["description"], emoji=emoji,
        )
    ctx.register_cli_command(
        name="pa", help="Tikkis persönliche Assistenz: Postfach, Briefing, lokale Modelle, Ressourcen",
        setup_fn=_cli_setup,
        handler_fn=lambda args: _CLI_BEFEHLE[getattr(args, "pa_befehl", None) or "status"](args, ctx),
    )
