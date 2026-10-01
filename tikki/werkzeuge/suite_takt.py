"""Tikki – Dauerräume: Takt-Runden, Türen, Übungsläufe und Raumbericht auf gehosteten Räumen.

Die Räume selbst fährt Hermes' Gateway (``gateway/hosted_rooms.py``, siehe ``raeume.py``): nach
jeder Nachricht des Menschen bekommt jedes angesprochene Mitglied den ungelesenen Teil des
Gesprächs, höchstens drei Runden und zehn Antworten je Nachricht. Dieses Modul ist nur der Taktgeber
dazu, ohne Modell, alle fünf Minuten aus einem Hermes-Cronjob: es liest die Raumprotokolle und
stellt – immer an ``@raumleiter``, damit nicht jedes Mitglied der Reihe nach gefragt wird – drei
Arten von Nachrichten ein:

- ``TAKT-RUNDE n``, wenn der Takt eines Raums fällig ist. Der Takt steht im Raum selbst: die letzte
  Zeile ``TAKT: …`` (vom Menschen im Eröffnungstext oder vom Raumleiter bestätigt) gilt, ``TAKT: aus``
  beendet ihn. Es gibt keine zweite Liste, die auseinanderlaufen könnte.
- Türen: eine Zeile ``TÜR: <Raum> | <Text>`` des Raumleiters wird einmal in den genannten Raum
  weitergereicht.
- Übungsläufe: das erste fertige Übungsergebnis geht in den Hauptraum, und sind alle durch, die
  Bitte ``LERNEN:``.

Nur der Zustand des Taktgebers (letzte Runde, zuletzt gelesene Zeile, Merker) liegt in
``<Hermes-Wurzel>/tikki/takt.json`` unter Dateisperre, neben ``shared-state.db``.

Unterbefehle:

    takt    [--db PFAD]            fällige Runden, Türen und Übungsergebnisse einstellen
    bericht [--json] [--db PFAD]   Stand aller Räume (für Wachhalter und Briefing)
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

from tikki.werkzeuge import raeume

#: Das Mitglied, dessen Zeilen (STAND, BRAUCHE, FERTIG, AUFGABEN, TÜR) Takt und Wände lesen.
RAUMLEITER = "raumleiter"
#: So viele Ereignisse vom Ende eines Raums werden gelesen; lange Räume halten ihren Anfang extra.
FENSTER = 1500
ANFANG = 40

_TAKT = re.compile(r"(?:^|\n)[ \t>*_]*TAKT:[ \t]*([^\n]+)", re.IGNORECASE)
_BRAUCHE = re.compile(r"(?:^|\n)[ \t>*_]*BRAUCHE:[ \t]*([^\n]+)")
_FERTIG = re.compile(r"(?:^|\n)[ \t>*_]*FERTIG:[ \t]*")
_STAND = re.compile(r"(?:^|\n)[ \t>*_]*STAND:[ \t]*([^\n]+)")
_ANSATZ = re.compile(r"(?:^|\n)[ \t>*_]*ANSATZ:[ \t]*([^\n]+)")
_AUFGABEN = re.compile(r"(?:^|\n)[ \t>*_]*AUFGABEN:[ \t]*\n((?:[ \t]*-[ \t]*\[[ xX]\][^\n]*\n?)+)")
_AUFGABE = re.compile(r"^[ \t]*-[ \t]*\[([ xX])\][ \t]*(.+?)[ \t]*$", re.MULTILINE)
_TUER = re.compile(r"(?:^|\n)[ \t>*_]*TÜR:[ \t]*([^|\n]+?)[ \t]*\|[ \t]*([^\n]+)")
#: Nachrichten, die das Backend in einen Raum stellt, sind keine Antwort des Menschen – auch wenn
#: der Mensch ihnen seinen Namen voranstellt oder sie @raumleiter ansprechen.
_SYSTEM = re.compile(
    r"^(?:[^:\n@\[]{1,40}:[ \t]*)?(?:@raumleiter[ \t]*)?(?:TAKT-RUNDE|ÜBUNGSERGEBNIS|LERNEN:|WACHHALTER:|\[Tür)"
)
#: Übungsräume heißen ``<Projekt>-<nutzer>-<nr>@tikki.team``; der Hauptraum trägt nur den Projektnamen.
UEBUNG_TITEL = re.compile(r"^(?P<basis>.+)-(?P<nutzer>[^-@\s]+)-(?P<nr>\d+)@tikki\.team$")

_AUS = {"aus", "stopp", "stop", "keiner", "kein", "nein", "off", "none", "-"}
_WOCHENTAGE = {
    "sonntags": 0, "montags": 1, "dienstags": 2, "mittwochs": 3,
    "donnerstags": 4, "freitags": 5, "samstags": 6,
}


# ─── Takt lesen ──────────────────────────────────────────────────────────────


def takt_aus_text(text: str) -> str | None:
    """Die letzte ``TAKT:``-Angabe eines Textes, ohne Markdown-Reste."""
    treffer = _TAKT.findall(text or "")
    if not treffer:
        return None
    return treffer[-1].strip().strip("*_`").strip()


def _uhrzeit(text: str, standard: tuple[int, int]) -> tuple[int, int] | None:
    m = re.search(r"(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?\b", text)
    if not m:
        return standard
    stunde, minute = int(m.group(1)), int(m.group(2) or 0)
    if stunde > 23 or minute > 59:
        return None
    return stunde, minute


def zeitplan(takt: str | None) -> str | None:
    """Deutscher Takt → Hermes-Zeitplan (``every 30m`` oder Cron-Ausdruck). ``None`` = kein Takt.

    Verstanden: stündlich, halbstündlich, alle N Minuten/Stunden, täglich [HH:MM],
    werktags [HH:MM], montags … sonntags [HH:MM] (auch „wöchentlich montags“),
    ein Cron-Ausdruck mit fünf Feldern und alles, was Hermes selbst versteht.
    """
    if not takt:
        return None
    text = takt.strip().lower()
    if text in _AUS or text.startswith(("aus ", "aus,", "aus.")):
        return None
    if re.fullmatch(r"[\d*/,\-]+(\s+[\d*/,\-]+){4}", text):
        return text
    if text.startswith("halbstündlich"):
        return "every 30m"
    if text.startswith("stündlich"):
        return "every 1h"
    m = re.match(r"alle\s+(\d+)\s*(minuten|minute|min|m|stunden|stunde|std|h|tage|tag|d)\b", text)
    if m:
        zahl, einheit = int(m.group(1)), m.group(2)
        if zahl <= 0:
            return None
        if einheit.startswith(("m",)):
            return f"every {zahl}m"
        if einheit.startswith(("s", "h")):
            return f"every {zahl}h"
        return f"every {zahl * 24}h"
    if text.startswith("täglich") or text.startswith("taeglich") or text.startswith("jeden tag"):
        zeit = _uhrzeit(text, (6, 0))
        return f"{zeit[1]} {zeit[0]} * * *" if zeit else None
    if text.startswith("werktags"):
        zeit = _uhrzeit(text, (8, 0))
        return f"{zeit[1]} {zeit[0]} * * 1-5" if zeit else None
    for name, tag in _WOCHENTAGE.items():
        if name in text:
            zeit = _uhrzeit(text, (9, 0))
            return f"{zeit[1]} {zeit[0]} * * {tag}" if zeit else None
    try:
        from cron.jobs import parse_schedule

        plan = parse_schedule(takt.strip())
    except Exception:
        return None
    return takt.strip() if plan.get("kind") in {"interval", "cron"} else None


def naechste_runde(plan: str, letzte: str | None) -> datetime | None:
    """Wann die nächste Runde fällig ist, gerechnet ab der letzten (Hermes' eigener Kalender)."""
    from cron.jobs import compute_next_run, parse_schedule

    iso = compute_next_run(parse_schedule(plan), letzte)
    return datetime.fromisoformat(iso) if iso else None


# ─── Raum lesen ──────────────────────────────────────────────────────────────


@dataclass
class Tuer:
    seq: int
    ziel: str
    text: str


@dataclass
class RaumStand:
    id: str
    titel: str
    mitglieder: list[str] = field(default_factory=list)
    letzte_aktivitaet: float | None = None
    letzte_seq: int = 0
    takt: str | None = None
    plan: str | None = None
    stand: str | None = None
    brauche: str | None = None
    fertig: bool = False
    fertig_text: str | None = None
    fertig_zeit: float | None = None
    ansatz: str | None = None
    aufgaben_offen: list[str] = field(default_factory=list)
    aufgaben_erledigt: int = 0
    nachrichten: int = 0
    arbeitet: str | None = None
    tueren: list[Tuer] = field(default_factory=list)

    @property
    def wartet_auf_mensch(self) -> bool:
        return self.brauche is not None


def ist_systemnachricht(text: str) -> bool:
    return bool(_SYSTEM.match((text or "").lstrip()))


def raum_stand(raum: dict, ereignisse: list[dict]) -> RaumStand:
    """Was ein Raum gerade ist, nur aus seinem Protokoll: Takt, Aufgaben, offene Frage, fertig, Türen.

    Gelesen werden die Zeilen des Raumleiters; die Berichtsformate der anderen Rollen (etwa das
    ``STAND: <Datum>`` des Rechercheurs) sind keine Raumaussage. Eine Nachricht des Menschen
    beantwortet die offene Frage und öffnet einen fertigen Raum wieder; Systemnachrichten nicht.
    """
    stand = RaumStand(
        id=raum["room_id"], titel=(raum.get("name") or "").strip() or raum["room_id"],
        mitglieder=[m.get("handle") or m["member_id"] for m in raum.get("members", [])],
        letzte_aktivitaet=raum.get("updated_at"), letzte_seq=int(raum.get("latest_seq") or 0),
        arbeitet=raeume.wer_arbeitet(ereignisse),
    )
    for e in ereignisse:
        stand.letzte_aktivitaet = max(stand.letzte_aktivitaet or 0, float(e.get("created_at") or 0))
        stand.letzte_seq = max(stand.letzte_seq, int(e["seq"]))
    gesagt = raeume.nachrichten(ereignisse, raum)
    stand.nachrichten = len(gesagt)
    for n in gesagt:
        text, von = n["text"], n["von"]
        if von == "mensch" and ist_systemnachricht(text):
            continue
        if von not in ("mensch", RAUMLEITER):
            continue
        takt = takt_aus_text(text)
        if takt is not None:
            stand.takt = takt
        if von == "mensch":
            if stand.ansatz is None and (ansatz := _ANSATZ.findall(text)):
                stand.ansatz = ansatz[-1].strip()
            if text.strip():
                stand.brauche = None
                stand.fertig = False
            continue
        brauche = _BRAUCHE.findall(text)
        stand.brauche = brauche[-1].strip() if brauche else None
        if treffer := _FERTIG.search(text):
            stand.fertig = True
            stand.fertig_text = text[treffer.start():].strip()[:3000]
            stand.fertig_zeit = n["zeit"]
        if zeile := _STAND.findall(text):
            stand.stand = zeile[-1].strip()
        if block := _AUFGABEN.search(text):
            aufgaben = _AUFGABE.findall(block.group(1))
            stand.aufgaben_offen = [a for kreuz, a in aufgaben if kreuz == " "]
            stand.aufgaben_erledigt = sum(1 for kreuz, _ in aufgaben if kreuz != " ")
        stand.tueren += [Tuer(n["seq"], ziel.strip(), inhalt.strip()) for ziel, inhalt in _TUER.findall(text)]
    stand.plan = zeitplan(stand.takt)
    return stand


def ereignisse(raum: dict, db: Path) -> list[dict]:
    """Das Protokoll eines Raums: ganz, oder bei langen Räumen Anfang (Takt, Ansatz) plus Ende."""
    letzte = int(raum.get("latest_seq") or 0)
    if letzte <= FENSTER:
        return raeume.verlauf(raum["room_id"], hoechstens=FENSTER + 1, db=db)
    anfang = raeume.verlauf(raum["room_id"], hoechstens=ANFANG, db=db)
    return anfang + raeume.verlauf(raum["room_id"], seit=max(anfang[-1]["seq"], letzte - FENSTER), db=db)


def alle_raeume(db: Path | None = None) -> list[RaumStand]:
    """Alle Tikki-Räume mit ihrem Stand, jüngste zuerst. Ohne Speicher gibt es keine Räume."""
    db = db or raeume.db_pfad()
    if not db.is_file():
        return []
    return [raum_stand(r, ereignisse(r, db)) for r in raeume.liste(db=db)]


def raum_finden(name: str, raum_liste: list[RaumStand]) -> RaumStand | None:
    """Ein Raum nach dem Wort des Raumleiters: genauer Name, eindeutiger Namensanfang, dann Kennung."""
    wort = name.strip()
    for raum in raum_liste:
        if raum.titel == wort:
            return raum
    anfang = [r for r in raum_liste if r.titel.lower().startswith(wort.lower())]
    if len(anfang) == 1:
        return anfang[0]
    return next((r for r in raum_liste if r.id == wort), None)


# ─── Zustand des Taktgebers ──────────────────────────────────────────────────


def zustand_pfad(db: Path) -> Path:
    return db.parent / "tikki" / "takt.json"


@contextlib.contextmanager
def _zustand(db: Path):
    """Der Zustand des Taktgebers, unter Dateisperre gelesen und geschrieben."""
    import fcntl

    pfad = zustand_pfad(db)
    pfad.parent.mkdir(parents=True, exist_ok=True)
    with open(pfad.with_suffix(".lock"), "a+") as sperre:
        fcntl.flock(sperre, fcntl.LOCK_EX)
        try:
            daten = json.loads(pfad.read_text(encoding="utf-8")) if pfad.exists() else {}
        except ValueError:
            daten = {}
        yield daten
        tmp = pfad.with_suffix(".tmp")
        tmp.write_text(json.dumps(daten, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, pfad)


def _zustand_lesen(db: Path) -> dict:
    try:
        return json.loads(zustand_pfad(db).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def faellige(raum_liste: list[RaumStand], zustand: dict, jetzt: datetime) -> list[RaumStand]:
    """Räume mit Takt, deren nächste Runde erreicht ist.

    Ein Raum, der zum ersten Mal einen Takt zeigt, beginnt mit dem Zeitpunkt, an dem er
    gesehen wird: seine erste Runde ist die nächste Gelegenheit, nicht sofort.
    """
    faellig = []
    for raum in raum_liste:
        if not raum.plan:
            continue
        eintrag = zustand.setdefault(raum.id, {})
        if eintrag.get("plan") != raum.plan:
            eintrag["plan"] = raum.plan
            eintrag["letzte"] = jetzt.isoformat()
            continue
        naechste = naechste_runde(raum.plan, eintrag.get("letzte"))
        if naechste is not None and naechste <= jetzt:
            faellig.append(raum)
    return faellig


def runden_text(raum: RaumStand, nummer: int, jetzt: datetime) -> str:
    return (
        f"@raumleiter TAKT-RUNDE {nummer} · {jetzt.strftime('%d.%m.%Y %H:%M')}: Neue Runde nach Takt ({raum.takt}). "
        "Prüfe, was seit der letzten Runde passiert ist, verteile die nächsten Aufgaben an die Mitglieder "
        "(@slug), prüfe Ergebnisse und schließe mit STAND: und AUFGABEN:. "
        "Dieser Raum läuft weiter; kein FERTIG, solange der Takt gilt."
    )


# ─── Türen ───────────────────────────────────────────────────────────────────


def tueren_weiterreichen(raum_liste: list[RaumStand], zustand: dict, db: Path, jetzt: float) -> list[str]:
    """Jede neue ``TÜR:``-Zeile eines Raumleiters einmal in den Zielraum stellen.

    Was nicht zustellbar ist (unbekannter Raum, mehrdeutiger Anfang, der Raum selbst), bleibt im
    Zustand stehen, damit der Bericht es dem Wachhalter zeigt.
    """
    meldungen = []
    for raum in raum_liste:
        eintrag = zustand.setdefault(raum.id, {})
        gesehen = int(eintrag.get("gesehen", 0))
        for tuer in raum.tueren:
            if tuer.seq <= gesehen:
                continue
            ziel = raum_finden(tuer.ziel, raum_liste)
            if ziel is None or ziel.id == raum.id:
                eintrag["unzustellbar"] = [*eintrag.get("unzustellbar", [])[-4:], {"ziel": tuer.ziel, "text": tuer.text[:200], "seq": tuer.seq}]
                meldungen.append(f"Tür nicht zustellbar: {raum.titel} → „{tuer.ziel}“")
                continue
            raeume.tuer(raum.id, ziel.id, tuer.text, db=db, jetzt=jetzt)
            meldungen.append(f"Tür: {raum.titel} → {ziel.titel}")
        eintrag["gesehen"] = max(gesehen, raum.letzte_seq)
    return meldungen


# ─── Übungsläufe ─────────────────────────────────────────────────────────────


def uebungsgruppen(raum_liste: list[RaumStand]) -> dict[str, dict]:
    """Hauptraum und Übungsräume je Projekt. Ohne Hauptraum gibt es keine Gruppe."""
    haupt = {raum.titel: raum for raum in raum_liste if not UEBUNG_TITEL.match(raum.titel)}
    gruppen: dict[str, dict] = {}
    for raum in raum_liste:
        m = UEBUNG_TITEL.match(raum.titel)
        if m and m.group("basis") in haupt:
            gruppe = gruppen.setdefault(m.group("basis"), {"haupt": haupt[m.group("basis")], "uebungen": []})
            gruppe["uebungen"].append(raum)
    return gruppen


def _kurz(text: str | None, laenge: int = 1500) -> str:
    text = (text or "").strip()
    return text if len(text) <= laenge else text[: laenge - 1] + "…"


def _nummer(raum: RaumStand) -> str:
    m = UEBUNG_TITEL.match(raum.titel)
    return m.group("nr") if m else "?"


def uebungs_runden(raum_liste: list[RaumStand], zustand: dict, jetzt: float) -> list[tuple]:
    """Nachrichten, die Übungsräume für ihren Hauptraum auslösen: (Hauptraum, Text, Grund, Merker).

    Der Merker ``(projekt, feld, wert)`` wird erst gesetzt, wenn die Nachricht wirklich im Raum ist.

    1. Der erste fertige Ansatz geht sofort an den Hauptraum, solange der selbst noch
       nicht fertig ist: der Mensch bekommt das schnellste Ergebnis, nicht das eigene.
    2. Sind alle fertig (oder der Hauptraum fertig und die Übungen seit einem Tag still),
       vergleicht der Hauptraum einmal die Ansätze und schreibt ERFAHRUNG-Zeilen.
    """
    runden = []
    uebung = zustand.get("_uebung", {})
    for basis, gruppe in uebungsgruppen(raum_liste).items():
        haupt: RaumStand = gruppe["haupt"]
        merk = uebung.get(basis, {})
        fertige = sorted(
            (r for r in gruppe["uebungen"] if r.fertig),
            key=lambda r: r.fertig_zeit or r.letzte_aktivitaet or 0,
        )
        if fertige and not haupt.fertig and not merk.get("weitergegeben"):
            erster = fertige[0]
            runden.append((haupt, (
                f"@raumleiter ÜBUNGSERGEBNIS {_nummer(erster)}: Übungsraum „{erster.titel}“ "
                f"(Ansatz: {erster.ansatz or 'unbekannt'}) ist zuerst fertig.\n"
                f"{_kurz(erster.fertig_text)}\n"
                + (f"STAND: {erster.stand}\n" if erster.stand else "")
                + "\nPrüfe es gegen das Raumziel. Erfüllt es das Ziel, übernimm es als Ergebnis dieses "
                "Raums und schließe mit FERTIG:; sonst arbeite weiter und nutze, was brauchbar ist."
            ), f"erstes Ergebnis aus {erster.titel}", (basis, "weitergegeben", erster.id)))
            continue
        still = all(
            r.fertig or (r.letzte_aktivitaet and jetzt - r.letzte_aktivitaet > 24 * 3600)
            for r in gruppe["uebungen"]
        )
        if haupt.fertig and still and gruppe["uebungen"] and not merk.get("gelernt"):
            ansaetze = "\n\n".join(
                f"— {r.titel} (Ansatz: {r.ansatz or 'unbekannt'}, "
                f"{'fertig' if r.fertig else 'nicht fertig geworden'}):\n{_kurz(r.fertig_text or r.stand, 700)}"
                for r in gruppe["uebungen"]
            )
            runden.append((haupt, (
                f"@raumleiter LERNEN: Alle Übungsläufe zu „{basis}“ sind durch.\n{ansaetze}\n\n"
                "Vergleiche die Ansätze mit deinem eigenen: Was war schneller, was besser, was "
                "billiger? Schreib drei bis fünf Zeilen, jede beginnend mit ERFAHRUNG:, die beim "
                "nächsten ähnlichen Auftrag helfen. Kein neuer Auftrag, kein FERTIG."
            ), "Erfahrungen aus den Übungsläufen", (basis, "gelernt", True)))
    return runden


# ─── Takt ────────────────────────────────────────────────────────────────────


def _jetzt(jetzt: datetime | None) -> datetime:
    if jetzt is not None:
        return jetzt
    from hermes_time import now

    return now()


def takt(*, db: Path | None = None, jetzt: datetime | None = None) -> list[str]:
    """Ein Tick des Taktgebers. Rückgabe: je eingestellter Nachricht eine Zeile."""
    db = db or raeume.db_pfad()
    jetzt = _jetzt(jetzt)
    stempel = jetzt.timestamp()
    raum_liste = alle_raeume(db)
    meldungen: list[str] = []
    with _zustand(db) as zustand:
        meldungen += tueren_weiterreichen(raum_liste, zustand, db, stempel)
        for haupt, text, grund, (projekt, feld, wert) in uebungs_runden(raum_liste, zustand, stempel):
            raeume.senden(haupt.id, text, db=db, jetzt=stempel)
            zustand.setdefault("_uebung", {}).setdefault(projekt, {})[feld] = wert
            meldungen.append(f"{grund}: {haupt.titel}")
        for raum in faellige(raum_liste, zustand, jetzt):
            eintrag = zustand[raum.id]
            nummer = int(eintrag.get("runden", 0)) + 1
            raeume.senden(raum.id, runden_text(raum, nummer, jetzt), db=db, jetzt=stempel)
            eintrag["letzte"], eintrag["runden"] = jetzt.isoformat(), nummer
            meldungen.append(f"Takt-Runde {nummer} ({raum.takt}): {raum.titel}")
        bekannt = {raum.id for raum in raum_liste}
        for alt in [k for k in zustand if not k.startswith("_") and k not in bekannt]:
            zustand.pop(alt, None)
    return meldungen


# ─── Bericht ─────────────────────────────────────────────────────────────────


def bericht(*, db: Path | None = None, jetzt: float | None = None) -> list[dict]:
    """Stand aller Räume, so kurz, dass ein Modell ihn in einem Blick liest."""
    db = db or raeume.db_pfad()
    jetzt = jetzt or time.time()
    zustand = _zustand_lesen(db)
    zeilen = []
    for raum in alle_raeume(db):
        daten = asdict(raum)
        daten.pop("tueren", None)
        eintrag = zustand.get(raum.id) or {}
        daten["still_seit_min"] = int((jetzt - raum.letzte_aktivitaet) / 60) if raum.letzte_aktivitaet else None
        daten["letzte_takt_runde"] = eintrag.get("letzte") if raum.plan else None
        daten["takt_runden"] = int(eintrag.get("runden", 0))
        daten["tueren_unzustellbar"] = eintrag.get("unzustellbar", [])
        zeilen.append(daten)
    return zeilen


def _bericht_text(zeilen: list[dict]) -> str:
    if not zeilen:
        return "Keine Räume."
    teile = [f"{len(zeilen)} Räume:"]
    for z in zeilen:
        zustand = (
            "wartet auf Mensch" if z["brauche"] else
            "fertig" if z["fertig"] and not z["plan"] else
            f"arbeitet (@{z['arbeitet']})" if z["arbeitet"] else
            "aktiv"
        )
        teile.append(
            f"- [{z['id']}] {z['titel']} · {zustand} · still seit {z['still_seit_min']} min"
            + (f" · Takt {z['takt']}" if z["plan"] else "")
            + (f" · offen: {'; '.join(z['aufgaben_offen'][:5])}" if z["aufgaben_offen"] else "")
            + (f" · BRAUCHE: {z['brauche']}" if z["brauche"] else "")
            + (f" · STAND: {z['stand']}" if z["stand"] else "")
            + (f" · Tür nicht zustellbar: {', '.join('„' + t['ziel'] + '“' for t in z['tueren_unzustellbar'])}"
               if z["tueren_unzustellbar"] else "")
        )
    return "\n".join(teile)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="suite_takt", description=__doc__.split("\n\n")[0])
    unter = parser.add_subparsers(dest="befehl", required=True)
    p_takt = unter.add_parser("takt")
    p_takt.add_argument("--db", type=Path)
    p_bericht = unter.add_parser("bericht")
    p_bericht.add_argument("--db", type=Path)
    p_bericht.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    if args.befehl == "takt":
        for zeile in takt(db=args.db):
            print(zeile)
        return 0
    zeilen = bericht(db=args.db)
    print(json.dumps(zeilen, ensure_ascii=False, indent=2) if args.json else _bericht_text(zeilen))
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    sys.exit(main())
