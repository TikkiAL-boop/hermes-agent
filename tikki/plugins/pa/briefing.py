"""Das Briefing: was Tikki seit dem letzten Mal erledigt hat und was neu ist.

Tikkis Daueraufträge sind Hermes-Cronjobs ihres Profils; jeder Lauf hinterlässt eine Datei unter
``<profil>/cron/output/<job>/<zeit>.md``. Das Briefing sammelt alles, was seit dem letzten
Briefing dazukam, dazu ungelesene Post, Räume, die auf den Menschen warten, und neue WhatsApps,
wenn die WA-Bridge erreichbar ist. Der Zeitpunkt des letzten Briefings steht in
``~/.tikki/briefing.json`` (``TIKKI_HOME`` übersteuert) – pro Mensch.
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
from pathlib import Path

from . import post

AUSZUG = 700


def tikki_home() -> Path:
    return Path(os.environ.get("TIKKI_HOME") or Path.home() / ".tikki")


def _stand_datei() -> Path:
    return tikki_home() / "briefing.json"


def letzter_stand() -> float:
    try:
        return float(json.loads(_stand_datei().read_text(encoding="utf-8")).get("zuletzt") or 0)
    except (OSError, ValueError):
        return 0.0


def stand_setzen(zeit: float | None = None) -> None:
    datei = _stand_datei()
    datei.parent.mkdir(parents=True, exist_ok=True)
    datei.write_text(json.dumps({"zuletzt": zeit or time.time()}), encoding="utf-8")


def erledigtes(seit: float, home: Path | None = None) -> list[dict]:
    """Cron-Ausgaben des Profils, die nach *seit* geschrieben wurden, jüngste zuerst."""
    from cron.jobs import get_cron_output_dir, load_jobs

    ausgaben = home / "cron" / "output" if home else get_cron_output_dir()
    namen = {j.get("id"): j.get("name") or j.get("id") for j in load_jobs() if isinstance(j, dict)}
    treffer: list[dict] = []
    if not ausgaben.is_dir():
        return treffer
    for job_dir in ausgaben.iterdir():
        if not job_dir.is_dir():
            continue
        for datei in job_dir.glob("*.md"):
            try:
                zeit = datei.stat().st_mtime
            except OSError:
                continue
            if zeit <= seit:
                continue
            try:
                text = datei.read_text(encoding="utf-8", errors="replace").strip()
            except OSError:
                continue
            treffer.append({
                "auftrag": namen.get(job_dir.name, job_dir.name), "zeit": zeit,
                "text": text[:AUSZUG] + ("…" if len(text) > AUSZUG else ""),
            })
    treffer.sort(key=lambda t: t["zeit"], reverse=True)
    return treffer


def wartende_raeume() -> list[dict]:
    """Räume, deren Raumleiter auf den Menschen wartet; die Räume liegen neben der Hermes-Wurzel, nicht im Profil."""
    try:
        from tikki.werkzeuge.suite_takt import alle_raeume
    except Exception:
        return []
    try:
        return [
            {"titel": r.titel, "brauche": r.brauche, "stand": r.stand}
            for r in alle_raeume() if r.brauche
        ][:10]
    except Exception:
        return []


def neue_whatsapps(env: dict | None = None, timeout: float = 4.0) -> list[dict] | None:
    env = os.environ if env is None else env
    token = env.get("WA_BRIDGE_TOKEN")
    if not token:
        return None
    try:
        anfrage = urllib.request.Request("http://127.0.0.1:8765/chats", headers={"X-Bridge-Token": token})
        with urllib.request.urlopen(anfrage, timeout=timeout) as antwort:
            daten = json.loads(antwort.read().decode("utf-8", errors="replace"))
    except Exception:
        return None
    chats = daten.get("chats") if isinstance(daten, dict) else daten
    treffer = []
    for c in chats or []:
        if not isinstance(c, dict):
            continue
        name = str(c.get("name") or c.get("chat") or c.get("title") or "").strip()
        letzte = str(c.get("lastMessage") or c.get("last") or c.get("preview") or c.get("text") or "").strip()
        ungelesen = int(c.get("unread") or c.get("unreadCount") or 0) > 0
        if name and (ungelesen or letzte):
            treffer.append({"name": name, "letzte": letzte, "ungelesen": ungelesen})
    treffer.sort(key=lambda c: not c["ungelesen"])
    return treffer[:8]


def sammeln(home: Path, *, stempeln: bool = True, mails: int = 12) -> dict:
    """Alles für ein Briefing; setzt danach den Zeitpunkt, wenn *stempeln*."""
    seit = letzter_stand()
    ergebnis: dict = {"seit": seit, "jetzt": time.time(), "erledigt": erledigtes(seit)}
    zugang = post.zugang()
    if zugang is None:
        ergebnis["post"] = None
        ergebnis["post_hinweis"] = "kein Postfach eingerichtet (TIKKI_MAIL_ADDRESS/TIKKI_MAIL_PASSWORD)"
    else:
        try:
            ergebnis["post"] = [post.als_dict(n) for n in post.Postfach(zugang).ungelesen(mails)]
        except Exception as exc:  # Netz, Login – das Briefing fällt deswegen nicht aus
            ergebnis["post"] = None
            ergebnis["post_hinweis"] = f"Postfach nicht erreichbar: {type(exc).__name__}"
    ergebnis["raeume"] = wartende_raeume()
    ergebnis["whatsapp"] = neue_whatsapps()
    if stempeln:
        stand_setzen(ergebnis["jetzt"])
    return ergebnis
