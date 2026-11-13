"""Tikki – Raumbericht, und der Umzug der alten Raum-Takte auf Hermes-Zeitpläne.

Die Räume fährt Hermes' Gateway (``gateway/hosted_rooms.py``, siehe ``raeume.py``). Dass ein Raum
regelmäßig wieder aufgerufen wird, ist ein Hermes-Zeitplan wie jeder andere: Die App legt ihn an,
wenn der Mensch beim Eröffnen einen Takt wählt (RPC ``cron.manage``), eine Rolle legt ihn mit ihrem
Werkzeug ``cronjob`` an. Es gibt keinen eigenen Taktgeber mehr und kein Protokoll aus Zeilen, die ein
Modell in seine Antwort schreiben müsste. Dieses Modul liest nur Zustand:

    bericht [--json] [--db PFAD]   Lage aller Räume aus der Art ihrer Ereignisse (für den Rundgang
                                   des Wachhalters); ohne --json folgt der Block „Ressourcen“ aus dem
                                   Stand des MR-Bots und am Ende ``{"wakeAgent": false}``, wenn nirgends
                                   etwas liegen geblieben ist – Hermes' Cron spart sich dann den Lauf
    umziehen [--db PFAD]           einmalig je Raum: Räume, die noch nach dem alten Verfahren getaktet
                                   waren (eine Zeile ``TAKT: …`` im Raum, die der frühere Taktgeber
                                   alle fünf Minuten las), bekommen einen Hermes-Zeitplan im Profil, in
                                   dem der Aufruf läuft. Die Räume und ihr Verlauf bleiben unberührt.
    abloesen                       den Cronjob ``tikki-takt`` des früheren Taktgebers aus dem Profil
                                   entfernen, in dem der Aufruf läuft
    angleichen NAME AUFTRAG        den Auftrag eines vorhandenen Cronjobs dem Repo angleichen (der
                                   Rundgang alter Einrichtungen trägt sonst weiter die alten Anweisungen)

Welche Räume schon umgezogen sind, steht in ``<Hermes-Wurzel>/tikki/takt.json`` (``_umgezogen``),
neben dem, was der frühere Taktgeber dort hinterlassen hat; nichts davon wird gelöscht.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import sys
import time
from pathlib import Path

from tikki.werkzeuge import raeume

#: Ab so vielen Minuten ohne Antwort gilt eine Wortmeldung des Menschen als liegen geblieben.
STILL_MIN = 30
#: Der Cronjob des früheren Taktgebers (Profil ``raumleiter``).
ALTER_JOB = "tikki-takt"

# ─── Nur für den Umzug: die Takt-Angabe des alten Verfahrens ─────────────────

_TAKT = re.compile(r"(?:^|\n)[ \t>*_]*TAKT:[ \t]*([^\n]+)", re.IGNORECASE)
_AUS = {"aus", "stopp", "stop", "keiner", "kein", "nein", "off", "none", "-"}
_WOCHENTAGE = {
    "sonntags": 0, "montags": 1, "dienstags": 2, "mittwochs": 3,
    "donnerstags": 4, "freitags": 5, "samstags": 6,
}


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


def alter_takt(raum: dict, db: Path) -> str | None:
    """Der Takt, den ein Raum nach dem alten Verfahren zuletzt hatte, als Hermes-Zeitplan.

    Gelesen wird das ganze Protokoll, nicht ein Fenster: die letzte Angabe des Menschen oder des
    Raumleiters gilt, und ein abgestellter Takt (``TAKT: aus``) bleibt abgestellt, egal wie lange
    das her ist.
    """
    letzte: str | None = None
    for n in raeume.nachrichten(raeume.verlauf(raum["room_id"], hoechstens=10**9, db=db), raum):
        if n["von"] in ("mensch", raeume.RAUMLEITER) and (treffer := _TAKT.findall(n["text"] or "")):
            letzte = treffer[-1].strip().strip("*_`").strip()
    return zeitplan(letzte)


def runden_prompt(raum: dict) -> str:
    """Was der Zeitplan eines Raums der Rolle aufträgt, in deren Profil er läuft."""
    return (
        f"Im Raum „{raum.get('name') or raum['room_id']}“ (Kennung {raum['room_id']}) ist die nächste "
        "regelmäßige Runde dran. Schau dir den Stand des Raums an und stoße die Runde dort an."
    )


def zustand_pfad(db: Path) -> Path:
    return db.parent / "tikki" / "takt.json"


@contextlib.contextmanager
def _zustand(db: Path):
    """``takt.json`` unter Dateisperre lesen und schreiben; was schon darin steht, bleibt stehen."""
    import fcntl

    pfad = zustand_pfad(db)
    pfad.parent.mkdir(parents=True, exist_ok=True)
    with open(pfad.with_suffix(".lock"), "a+") as sperre:
        fcntl.flock(sperre, fcntl.LOCK_EX)
        try:
            daten = json.loads(pfad.read_text(encoding="utf-8")) if pfad.exists() else {}
        except ValueError:
            daten = {}
        vorher = json.dumps(daten, sort_keys=True)
        yield daten
        if json.dumps(daten, sort_keys=True) != vorher:
            tmp = pfad.with_suffix(".tmp")
            tmp.write_text(json.dumps(daten, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp, pfad)


def _cron(**argumente) -> dict:
    """Hermes' eigenes Cron-Werkzeug im Profil des Aufrufs."""
    from tools.cronjob_tools import cronjob

    return json.loads(cronjob(**argumente))


def _jobs() -> list[dict]:
    return list(_cron(action="list", include_disabled=True).get("jobs") or [])


def umziehen(*, db: Path | None = None, anlegen=None, vorhandene=None) -> list[str]:
    """Jeden Raum mit altem Takt einmal auf einen Hermes-Zeitplan umziehen. Rückgabe: je Raum eine Zeile.

    Ein Raum zieht genau einmal um: Wer danach seinen Zeitplan in Hermes pausiert oder löscht,
    bekommt ihn nicht wieder. Einen Zeitplan mit dem Namen des Raums (``raeume.ZEITPLAN_NAME``),
    den es schon gibt, lässt der Umzug stehen.
    """
    db = db or raeume.db_pfad()
    if not db.is_file():
        return []
    anlegen = anlegen or (lambda **job: _cron(action="create", deliver="local", **job))
    meldungen: list[str] = []
    with _zustand(db) as zustand:
        umgezogen: list[str] = zustand.setdefault("_umgezogen", [])
        offen = [r for r in raeume.liste(db=db) if r["room_id"] not in umgezogen]
        if not offen:
            return []
        namen = {str(j.get("name") or "") for j in (vorhandene() if vorhandene else _jobs())}
        for raum in offen:
            plan = alter_takt(raum, db)
            name = raeume.ZEITPLAN_NAME.format(room_id=raum["room_id"])
            if plan and name not in namen:
                ergebnis = anlegen(name=name, schedule=plan, prompt=runden_prompt(raum))
                if isinstance(ergebnis, dict) and (ergebnis.get("error") or ergebnis.get("success") is False):
                    meldungen.append(f"Fehler: {raum['name']}: {ergebnis.get('error') or ergebnis}")
                    continue
                meldungen.append(f"Zeitplan {plan}: {raum['name']}")
            umgezogen.append(raum["room_id"])
    return meldungen


def abloesen() -> list[str]:
    """Den Cronjob des früheren Taktgebers im Profil des Aufrufs entfernen."""
    entfernt = []
    for job in _jobs():
        if job.get("name") == ALTER_JOB and (kennung := job.get("job_id") or job.get("id")):
            _cron(action="remove", job_id=kennung)
            entfernt.append(f"Cronjob {ALTER_JOB} entfernt")
    return entfernt


def angleichen(name: str, auftrag: str) -> list[str]:
    """Den Auftrag eines vorhandenen Cronjobs im Profil des Aufrufs dem Repo angleichen.

    Ein Rundgang, der vor der Umstellung eingerichtet wurde, trägt noch die Anweisungen des alten
    Verfahrens; wie die Seele folgt sein Auftrag dem Repo. Zeitplan, Skript und Zustand bleiben.
    """
    from cron.jobs import list_jobs

    geaendert = []
    for job in list_jobs(include_disabled=True):
        if job.get("name") == name and (job.get("prompt") or "") != auftrag:
            _cron(action="update", job_id=job["id"], prompt=auftrag)
            geaendert.append(f"Cronjob {name}: Auftrag angeglichen")
    return geaendert


# ─── Bericht ─────────────────────────────────────────────────────────────────


def bericht(*, db: Path | None = None, jetzt: float | None = None) -> list[dict]:
    """Die Lage aller Räume, so kurz, dass ein Modell sie in einem Blick liest."""
    db = db or raeume.db_pfad()
    if not db.is_file():
        return []
    jetzt = jetzt or time.time()
    zeilen = []
    for raum in raeume.liste(db=db):
        lage = raeume.lage(raum, db=db)
        aktiv = lage.pop("letzte_aktivitaet")
        lage["still_seit_min"] = int((jetzt - aktiv) / 60) if aktiv else None
        zeilen.append(lage)
    return zeilen


def weckbedarf(zeilen: list[dict]) -> bool:
    """Ob der Wachhalter (ein Modelllauf) gebraucht wird, oder ob der Bericht nur Ruhe meldet.

    Gebraucht wird er, wenn in einem Raum eine Runde gescheitert ist, oder wenn eine Wortmeldung
    des Menschen länger als ``STILL_MIN`` Minuten ohne Antwort ist und niemand daran arbeitet.
    """
    return any(z["gescheitert"] or (z["unbeantwortet"] and (z["still_seit_min"] or 0) > STILL_MIN) for z in zeilen)


#: Die letzte Ausgabezeile, bei der Hermes' Cron den Lauf ohne Modell beendet (``cron/scheduler_prompt.py``).
KEIN_WECKEN = json.dumps({"wakeAgent": False})


def _bericht_text(zeilen: list[dict]) -> str:
    if not zeilen:
        return "Keine Räume."
    teile = [f"{len(zeilen)} Räume:"]
    for z in zeilen:
        lage = (
            f"arbeitet (@{z['arbeitet']})" if z["arbeitet"] else
            f"Runde von @{z['gescheitert']} gescheitert" if z["gescheitert"] else
            "Wortmeldung des Menschen ohne Antwort" if z["unbeantwortet"] else
            "ruhig"
        )
        teile.append(f"- [{z['room_id']}] {z['name']} · {lage} · still seit {z['still_seit_min']} min")
    return "\n".join(teile)


def ressourcen_text() -> str:
    """Der Block „Ressourcen“ aus dem letzten Stand des MR-Bots – nur gelesen, nie gesammelt; so sieht
    der Rundgang einen Ausfall, ohne selbst anzuklopfen. ``weckbedarf`` bleibt davon unberührt."""
    from tikki.plugins.pa.ressourcen import kurzbericht

    return kurzbericht()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="suite_takt", description=__doc__.split("\n\n")[0])
    unter = parser.add_subparsers(dest="befehl", required=True)
    p_bericht = unter.add_parser("bericht")
    p_bericht.add_argument("--db", type=Path)
    p_bericht.add_argument("--json", action="store_true")
    unter.add_parser("umziehen").add_argument("--db", type=Path)
    unter.add_parser("abloesen")
    p_angleichen = unter.add_parser("angleichen")
    p_angleichen.add_argument("name")
    p_angleichen.add_argument("auftrag")
    args = parser.parse_args(argv)

    if args.befehl == "umziehen":
        zeilen = umziehen(db=args.db)
        print("\n".join(zeilen))
        return 1 if any(z.startswith("Fehler: ") for z in zeilen) else 0
    if args.befehl == "abloesen":
        print("\n".join(abloesen()))
        return 0
    if args.befehl == "angleichen":
        print("\n".join(angleichen(args.name, args.auftrag)))
        return 0
    zeilen = bericht(db=args.db)
    if args.json:
        print(json.dumps(zeilen, ensure_ascii=False, indent=2))
        return 0
    print(_bericht_text(zeilen))
    print(ressourcen_text())
    if not weckbedarf(zeilen):
        print(KEIN_WECKEN)
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    sys.exit(main())
