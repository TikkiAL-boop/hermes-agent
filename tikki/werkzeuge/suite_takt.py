"""Tikki – Dauerräume: Takt-Runden und Raumbericht, im Backend, ohne offene App.

Eine Suite ist eine Sitzung des Profils ``raumleiter`` mit der Quelle ``tikki-suite``.
Ob ein Raum einen Takt hat, steht im Raum selbst, im Raumprotokoll: die letzte Zeile
``TAKT: …`` (vom Menschen im Eröffnungstext oder vom Raumleiter bestätigt) gilt,
``TAKT: aus`` beendet ihn. Es gibt keine zweite Liste, die auseinanderlaufen könnte.

Ein einziger Hermes-Cronjob je Rechner (``tikki-takt``, alle 5 Minuten, ohne Modell)
ruft ``takt`` auf. Der sucht die fälligen Räume und startet je Raum eine Runde als
eigenen Prozess: ``hermes -p raumleiter chat --resume <sitzung> -Q``. Hermes erlaubt
genau einen Schreiber je Sitzung; ist der Raum gerade in der App offen, lehnt Hermes
ab, und die Runde versucht es nach einer Minute erneut (bis 30 Minuten). Nach einem
Stromausfall holt der nächste Takt die versäumte Runde einmal nach.

Unterbefehle:

    takt    [--profil P] [--hermes BIN] [--parallel N]   fällige Runden starten
    bericht [--profil P] [--json]                        Stand aller Suiten (für den Wachhalter)
    runde   <sitzung> [--text T] [--profil P] [--hermes BIN] [--takt]
                                                          eine Runde jetzt, blockierend
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

SUITE_PROFIL = "raumleiter"
SUITE_QUELLE = "tikki-suite"
MODUL = "tikki.werkzeuge.suite_takt"

#: Wie lange eine Runde auf einen in der App offenen Raum wartet, und in welchem Abstand.
WARTEN_BIS_S = 30 * 60
WARTEN_TAKT_S = 60
#: Eine Runde darf so lange laufen; danach gilt sie als hängend und wird beendet.
RUNDE_HOECHSTENS_S = 2 * 60 * 60
#: So viele Runden laufen je Rechner gleichzeitig; der Rest kommt im nächsten Takt dran.
PARALLEL_STANDARD = 8

_TAKT = re.compile(r"(?:^|\n)[ \t>*_]*TAKT:[ \t]*([^\n]+)", re.IGNORECASE)
_BRAUCHE = re.compile(r"(?:^|\n)[ \t>*_]*BRAUCHE:[ \t]*([^\n]+)")
_FERTIG = re.compile(r"(?:^|\n)[ \t>*_]*FERTIG:")
_STAND = re.compile(r"(?:^|\n)[ \t>*_]*STAND:[ \t]*([^\n]+)")
_ANSATZ = re.compile(r"(?:^|\n)[ \t>*_]*ANSATZ:[ \t]*([^\n]+)")
#: Runden, die das Backend selbst in einen Raum schreibt, sind keine Antwort des Menschen.
_BACKEND_RUNDEN = ("TAKT-RUNDE", "ÜBUNGSERGEBNIS", "LERNEN", "WACHHALTER")
#: Übungsräume heißen ``<Projekt>-<nutzer>-<nr>@tikki.team``; der Hauptraum trägt nur den Projektnamen.
UEBUNG_TITEL = re.compile(r"^(?P<basis>.+)-(?P<nutzer>[^-@\s]+)-(?P<nr>\d+)@tikki\.team$")
_BESETZT = re.compile(r"open in another|already (?:open|held|owned)", re.IGNORECASE)

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
class RaumStand:
    id: str
    tip: str
    titel: str
    letzte_aktivitaet: float | None = None
    takt: str | None = None
    plan: str | None = None
    stand: str | None = None
    brauche: str | None = None
    fertig: bool = False
    fertig_text: str | None = None
    fertig_zeit: float | None = None
    ansatz: str | None = None
    todos_offen: list[str] = field(default_factory=list)
    todos_erledigt: int = 0
    nachrichten: int = 0

    @property
    def wartet_auf_mensch(self) -> bool:
        return self.brauche is not None


def _text(inhalt) -> str:
    if isinstance(inhalt, str):
        return inhalt
    if isinstance(inhalt, list):
        return "\n".join(teil.get("text", "") for teil in inhalt if isinstance(teil, dict))
    return ""


def raum_stand(sitzung: dict, nachrichten: list[dict]) -> RaumStand:
    """Was ein Raum gerade ist, nur aus seinem Verlauf: Takt, To-dos, offene Frage, fertig."""
    stand = RaumStand(
        id=sitzung["id"],
        tip=sitzung.get("tip") or sitzung["id"],
        titel=(sitzung.get("title") or "").strip() or sitzung["id"],
        letzte_aktivitaet=sitzung.get("last_active") or sitzung.get("started_at"),
        nachrichten=len(nachrichten),
    )
    for nachricht in nachrichten:
        rolle = nachricht.get("role")
        text = _text(nachricht.get("content"))
        stempel = nachricht.get("timestamp")
        if isinstance(stempel, (int, float)):
            stand.letzte_aktivitaet = max(stand.letzte_aktivitaet or 0, float(stempel))
        if rolle in {"user", "assistant"}:
            takt = takt_aus_text(text)
            if takt is not None:
                stand.takt = takt
        if rolle == "user" and stand.ansatz is None:
            ansatz = _ANSATZ.findall(text)
            if ansatz:
                stand.ansatz = ansatz[-1].strip()
        if rolle == "user" and text.strip() and not text.lstrip().startswith(_BACKEND_RUNDEN):
            # Eine Antwort des Menschen beantwortet die offene Frage und öffnet einen fertigen Raum wieder.
            stand.brauche = None
            stand.fertig = False
        if rolle == "assistant" and text.strip():
            brauche = _BRAUCHE.findall(text)
            stand.brauche = brauche[-1].strip() if brauche else None
            stand.fertig = bool(_FERTIG.search(text))
            if stand.fertig:
                stand.fertig_text = text.strip()[-3000:]
                stand.fertig_zeit = float(stempel) if isinstance(stempel, (int, float)) else None
            zeile = _STAND.findall(text)
            if zeile:
                stand.stand = zeile[-1].strip()
        if rolle == "tool" and nachricht.get("tool_name") == "todo":
            with contextlib.suppress(ValueError, TypeError, AttributeError):
                todos = json.loads(text).get("todos") or []
                stand.todos_offen = [
                    str(t.get("content", "")).strip()
                    for t in todos
                    if t.get("status") not in {"completed", "cancelled"}
                ]
                stand.todos_erledigt = sum(1 for t in todos if t.get("status") == "completed")
    stand.plan = zeitplan(stand.takt)
    return stand


def profil_home(profil: str) -> Path:
    from hermes_cli.profiles import get_profile_dir

    return get_profile_dir(profil)


def raeume(home: Path) -> list[RaumStand]:
    """Alle Suiten eines Profils mit ihrem Stand, jüngste zuerst."""
    from hermes_state import SessionDB

    db_pfad = home / "state.db"
    if not db_pfad.is_file():
        return []
    db = SessionDB(db_path=db_pfad, read_only=True)
    try:
        zeilen = db.list_sessions_rich(
            source=SUITE_QUELLE, include_hidden=True, limit=5000, order_by_last_active=True
        )
        ergebnis = []
        for zeile in zeilen:
            tip = db.get_compression_tip(zeile["id"]) or zeile["id"]
            nachrichten = db.get_messages(tip, latest=True, limit=400)
            ergebnis.append(raum_stand({**zeile, "tip": tip}, nachrichten))
        return ergebnis
    finally:
        db.close()


# ─── Zustand der Takt-Runden ─────────────────────────────────────────────────


def _zustand_pfad(home: Path) -> Path:
    return home / "tikki" / "takt.json"


@contextlib.contextmanager
def _zustand(home: Path):
    """Der Zustand aller Takt-Runden eines Profils, unter Dateisperre gelesen und geschrieben."""
    import fcntl

    pfad = _zustand_pfad(home)
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


def _laeuft(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def faellige(raum_liste: list[RaumStand], zustand: dict, jetzt: datetime) -> list[RaumStand]:
    """Räume mit Takt, deren nächste Runde erreicht ist und die nicht gerade eine Runde fahren.

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
        if _laeuft(eintrag.get("pid")):
            continue
        naechste = naechste_runde(raum.plan, eintrag.get("letzte"))
        if naechste is not None and naechste <= jetzt:
            faellig.append(raum)
    return faellig


def runden_text(raum: RaumStand, jetzt: datetime) -> str:
    return (
        f"TAKT-RUNDE {jetzt.astimezone().strftime('%d.%m.%Y %H:%M')} ({raum.takt})\n"
        "Neue Runde nach Takt. Prüfe, was seit der letzten Runde passiert ist, verteile die "
        "nächsten Aufgaben, prüfe Ergebnisse und schließe mit dem STAND-Block. "
        "Dieser Raum läuft weiter; kein FERTIG, solange der Takt gilt."
    )


# ─── Runden ausführen ────────────────────────────────────────────────────────


def _hermes(hermes: str | None) -> list[str]:
    return [hermes or os.environ.get("TIKKI_HERMES") or "hermes"]


def runde(
    sitzung: str,
    text: str,
    *,
    profil: str = SUITE_PROFIL,
    hermes: str | None = None,
    warten_bis_s: int = WARTEN_BIS_S,
) -> tuple[bool, str]:
    """Eine Runde in der Suite, blockierend. Wartet, solange der Raum in der App offen ist."""
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", suffix=".txt", prefix="tikki-runde-", delete=False
    ) as datei:
        datei.write(text)
        anfrage = datei.name
    befehl = _hermes(hermes) + [
        "-p", profil, "chat", "--resume", sitzung, "-Q", "--query-file", anfrage,
    ]
    ende = time.monotonic() + max(0, warten_bis_s)
    try:
        while True:
            try:
                lauf = subprocess.run(
                    befehl, capture_output=True, text=True, errors="replace",
                    timeout=RUNDE_HOECHSTENS_S,
                )
            except subprocess.TimeoutExpired:
                return False, f"Runde nach {RUNDE_HOECHSTENS_S // 60} Minuten abgebrochen"
            ausgabe = (lauf.stdout or "") + (lauf.stderr or "")
            if lauf.returncode == 0 and not _BESETZT.search(ausgabe):
                return True, (lauf.stdout or "").strip()
            if _BESETZT.search(ausgabe) and time.monotonic() < ende:
                time.sleep(WARTEN_TAKT_S)
                continue
            if _BESETZT.search(ausgabe):
                return False, "Raum war die ganze Zeit in der App offen; Runde vertagt"
            return False, ausgabe.strip()[-2000:] or f"Hermes endete mit Code {lauf.returncode}"
    finally:
        with contextlib.suppress(OSError):
            os.unlink(anfrage)


def _runde_im_takt(sitzung: str, raum_id: str, text: str, profil: str, hermes: str | None) -> int:
    """Kindprozess einer Takt-Runde: fahren, dann den Zustand fortschreiben."""
    home = profil_home(profil)
    beginn = datetime.now(timezone.utc).astimezone()
    ok, meldung = runde(sitzung, text, profil=profil, hermes=hermes)
    with _zustand(home) as zustand:
        eintrag = zustand.setdefault(raum_id, {})
        eintrag["pid"] = None
        eintrag["ergebnis"] = "ok" if ok else "fehler"
        eintrag["meldung"] = meldung[-500:]
        if ok:
            eintrag["letzte"] = beginn.isoformat()
        else:
            eintrag["fehlversuche"] = int(eintrag.get("fehlversuche", 0)) + 1
            # Nach drei Fehlschlägen wartet der Raum bis zur nächsten regulären Gelegenheit.
            if eintrag["fehlversuche"] >= 3:
                eintrag["letzte"] = beginn.isoformat()
                eintrag["fehlversuche"] = 0
    return 0 if ok else 1


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


def uebungs_runden(raum_liste: list[RaumStand], zustand: dict) -> list[tuple]:
    """Runden, die Übungsräume für ihren Hauptraum auslösen: (Raum, Text, Grund, Merker).

    Der Merker ``(projekt, feld, wert)`` wird erst gesetzt, wenn die Runde wirklich startet.

    1. Der erste fertige Ansatz geht sofort an den Hauptraum, solange der selbst noch
       nicht fertig ist: der Mensch bekommt das schnellste Ergebnis, nicht das eigene.
    2. Sind alle fertig (oder der Hauptraum fertig und die Übungen seit einem Tag still),
       vergleicht der Hauptraum einmal die Ansätze und schreibt ERFAHRUNG-Zeilen.
    """
    jetzt = time.time()
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
                f"ÜBUNGSERGEBNIS aus „{erster.titel}“ (Ansatz: {erster.ansatz or 'unbekannt'}) ist zuerst fertig.\n"
                f"{_kurz(erster.fertig_text)}\n\n"
                "Prüfe es gegen das Raumziel. Erfüllt es das Ziel, übernimm es als Ergebnis dieses "
                "Raums und schließe mit FERTIG; sonst arbeite weiter und nutze, was brauchbar ist."
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
                f"LERNEN: Alle Übungsläufe zu „{basis}“ sind durch.\n{ansaetze}\n\n"
                "Vergleiche die Ansätze mit deinem eigenen: Was war schneller, was besser, was "
                "billiger? Schreib drei bis fünf Zeilen, jede beginnend mit ERFAHRUNG:, die beim "
                "nächsten ähnlichen Auftrag helfen. Kein neuer Auftrag, kein FERTIG."
            ), "Erfahrungen aus den Übungsläufen", (basis, "gelernt", True)))
    return runden


def _starte_runde(
    home: Path, profil: str, hermes: str | None, raum: RaumStand, text: str, grund: str, zustand: dict
) -> None:
    """Eine Runde als eigenen Prozess starten; ihr Ergebnis schreibt der Prozess selbst zurück."""
    protokolle = home / "tikki" / "runden"
    protokolle.mkdir(parents=True, exist_ok=True)
    befehl = _hermes(hermes) + [
        "--run-module", MODUL, "runde", raum.tip, "--takt", "--raum", raum.id,
        "--profil", profil, "--text", text,
    ]
    if hermes:
        befehl += ["--hermes", hermes]
    with open(protokolle / f"{raum.id}.log", "a", encoding="utf-8") as log:
        log.write(f"\n== {datetime.now(timezone.utc).isoformat()} {grund}\n")
        log.flush()
        kind = subprocess.Popen(
            befehl, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    zustand.setdefault(raum.id, {})["pid"] = kind.pid


def takt(profil: str, hermes: str | None, parallel: int) -> list[str]:
    """Fällige Runden als eigene Prozesse starten. Rückgabe: je gestarteter Runde eine Zeile."""
    home = profil_home(profil)
    raum_liste = raeume(home)
    jetzt = datetime.now(timezone.utc).astimezone()
    gestartet: list[str] = []
    with _zustand(home) as zustand:
        laufend = sum(
            1 for k, e in zustand.items() if not k.startswith("_") and isinstance(e, dict) and _laeuft(e.get("pid"))
        )
        auftraege = [a for a in uebungs_runden(raum_liste, zustand)
                     if not _laeuft((zustand.get(a[0].id) or {}).get("pid"))]
        auftraege += [(r, runden_text(r, jetzt), f"Takt-Runde ({r.takt})", None)
                      for r in faellige(raum_liste, zustand, jetzt)]
        belegt: set[str] = set()
        for raum, text, grund, merker in auftraege:
            if laufend >= parallel:
                break
            if raum.id in belegt:
                continue
            _starte_runde(home, profil, hermes, raum, text, grund, zustand)
            if merker:
                projekt, feld, wert = merker
                zustand.setdefault("_uebung", {}).setdefault(projekt, {})[feld] = wert
            belegt.add(raum.id)
            laufend += 1
            gestartet.append(f"{grund}: {raum.titel}")
        bekannt = {raum.id for raum in raum_liste}
        for alt in [k for k in zustand if not k.startswith("_") and k not in bekannt]:
            zustand.pop(alt, None)
    return gestartet


def bericht(profil: str) -> list[dict]:
    """Stand aller Suiten, so kurz, dass ein Modell ihn in einem Blick liest."""
    jetzt = time.time()
    zeilen = []
    home = profil_home(profil)
    try:
        with open(_zustand_pfad(home), encoding="utf-8") as f:
            zustand = json.load(f)
    except (OSError, ValueError):
        zustand = {}
    for raum in raeume(home):
        daten = asdict(raum)
        daten["still_seit_min"] = (
            int((jetzt - raum.letzte_aktivitaet) / 60) if raum.letzte_aktivitaet else None
        )
        daten["runde_laeuft"] = _laeuft((zustand.get(raum.id) or {}).get("pid"))
        daten["letzte_takt_runde"] = (zustand.get(raum.id) or {}).get("letzte")
        daten["letztes_ergebnis"] = (zustand.get(raum.id) or {}).get("ergebnis")
        zeilen.append(daten)
    return zeilen


def _bericht_text(zeilen: list[dict]) -> str:
    if not zeilen:
        return "Keine Suiten."
    teile = [f"{len(zeilen)} Suiten (Profil {SUITE_PROFIL}):"]
    for z in zeilen:
        zustand = (
            "wartet auf Mensch" if z["brauche"] else
            "fertig" if z["fertig"] and not z["plan"] else
            "Runde läuft" if z["runde_laeuft"] else
            "aktiv"
        )
        teile.append(
            f"- [{z['tip']}] {z['titel']} · {zustand} · still seit {z['still_seit_min']} min"
            + (f" · Takt {z['takt']}" if z["plan"] else "")
            + (f" · offen: {'; '.join(z['todos_offen'][:5])}" if z["todos_offen"] else "")
            + (f" · BRAUCHE: {z['brauche']}" if z["brauche"] else "")
            + (f" · STAND: {z['stand']}" if z["stand"] else "")
        )
    return "\n".join(teile)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="suite_takt", description=__doc__.split("\n\n")[0])
    unter = parser.add_subparsers(dest="befehl", required=True)
    p_takt = unter.add_parser("takt")
    p_takt.add_argument("--profil", default=SUITE_PROFIL)
    p_takt.add_argument("--hermes")
    p_takt.add_argument("--parallel", type=int, default=PARALLEL_STANDARD)
    p_bericht = unter.add_parser("bericht")
    p_bericht.add_argument("--profil", default=SUITE_PROFIL)
    p_bericht.add_argument("--json", action="store_true")
    p_runde = unter.add_parser("runde")
    p_runde.add_argument("sitzung")
    p_runde.add_argument("--text", default="Neue Runde: Stand prüfen, weiterarbeiten, STAND-Block.")
    p_runde.add_argument("--profil", default=SUITE_PROFIL)
    p_runde.add_argument("--hermes")
    p_runde.add_argument("--takt", action="store_true", help=argparse.SUPPRESS)
    p_runde.add_argument("--raum", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    if args.befehl == "takt":
        for zeile in takt(args.profil, args.hermes, max(1, args.parallel)):
            print(zeile)
        return 0
    if args.befehl == "bericht":
        zeilen = bericht(args.profil)
        print(json.dumps(zeilen, ensure_ascii=False, indent=2) if args.json else _bericht_text(zeilen))
        return 0
    if args.takt:
        return _runde_im_takt(args.sitzung, args.raum or args.sitzung, args.text, args.profil, args.hermes)
    ok, meldung = runde(args.sitzung, args.text, profil=args.profil, hermes=args.hermes)
    print(meldung)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    sys.exit(main())
