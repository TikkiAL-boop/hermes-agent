"""Das Briefing: was Tikki seit dem letzten Mal erledigt hat und was neu ist.

Tikkis Daueraufträge sind Hermes-Cronjobs ihres Profils; jeder Lauf hinterlässt eine Datei unter
``<profil>/cron/output/<job>/<zeit>.md``. Das Briefing sammelt alles, was seit dem letzten
Briefing dazukam, dazu ungelesene Post, Räume, in denen etwas liegen geblieben ist, und neue WhatsApps,
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
#: Je Dauerauftrag kommen die jüngsten Läufe mit Text ins Briefing, insgesamt höchstens so viele;
#: der Rest wird gezählt. Ein Vier-Minuten-Auftrag schreibt 360 Dateien am Tag – als Werkzeugausgabe
#: wären das rund 250 kB, das erste Briefing (seit = 0) alles, was je lief.
JE_AUFTRAG = 5
HOECHSTENS = 30


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


def erledigtes(seit: float) -> tuple[list[dict], dict[str, int]]:
    """Cron-Ausgaben des Profils, die nach *seit* geschrieben wurden, jüngste zuerst – je Auftrag
    die jüngsten ``JE_AUFTRAG``, zusammen höchstens ``HOECHSTENS``. Dazu je Auftrag, wie viele
    Läufe es seit *seit* insgesamt gab."""
    from cron.jobs import get_cron_output_dir, load_jobs

    ausgaben = get_cron_output_dir()
    namen = {j.get("id"): j.get("name") or j.get("id") for j in load_jobs() if isinstance(j, dict)}
    juengste: list[tuple[float, str, Path]] = []
    laeufe: dict[str, int] = {}
    if not ausgaben.is_dir():
        return [], laeufe
    for job_dir in ausgaben.iterdir():
        if not job_dir.is_dir():
            continue
        neu = []
        for datei in job_dir.glob("*.md"):
            try:
                zeit = datei.stat().st_mtime
            except OSError:
                continue
            if zeit > seit:
                neu.append((zeit, datei))
        if neu:
            auftrag = str(namen.get(job_dir.name, job_dir.name))
            laeufe[auftrag] = laeufe.get(auftrag, 0) + len(neu)
            juengste += [(zeit, auftrag, datei) for zeit, datei in sorted(neu, reverse=True)[:JE_AUFTRAG]]
    treffer: list[dict] = []
    for zeit, auftrag, datei in sorted(juengste, reverse=True)[:HOECHSTENS]:
        try:
            text = datei.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            continue
        treffer.append({"auftrag": auftrag, "zeit": zeit, "text": text[:AUSZUG] + ("…" if len(text) > AUSZUG else "")})
    return treffer, laeufe


def wartende_raeume() -> list[dict]:
    """Räume, in denen etwas liegen geblieben ist – abgelesen an der Art ihrer Ereignisse, nicht an
    Worten: eine gescheiterte Runde, oder eine Wortmeldung des Menschen, auf die niemand geantwortet
    hat und an der niemand arbeitet. Die Räume liegen neben der Hermes-Wurzel, nicht im Profil."""
    try:
        from tikki.werkzeuge import raeume

        lagen = [raeume.lage(r) for r in raeume.liste()] if raeume.db_pfad().is_file() else []
    except Exception:
        return []
    return [
        {"titel": l["name"], "gescheitert": l["gescheitert"], "unbeantwortet": l["unbeantwortet"]}
        for l in lagen if l["gescheitert"] or l["unbeantwortet"]
    ][:10]


def neue_whatsapps(token: str | None = None, timeout: float = 4.0) -> list[dict] | None:
    """Neue WhatsApps über die WA-Bridge; ohne ``token`` gilt ``WA_BRIDGE_TOKEN`` des Profils, in
    dem der Aufruf läuft (Secret-Scope, nicht ``os.environ``)."""
    if token is None:
        from agent.secret_scope import get_secret

        token = get_secret("WA_BRIDGE_TOKEN")
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


def sammeln(*, stempeln: bool = True, mails: int = 12) -> dict:
    """Alles für ein Briefing aus dem Profil, in dem der Aufruf läuft; setzt danach den Zeitpunkt,
    wenn *stempeln*. ``erledigt_laeufe`` nennt je Auftrag alle Läufe seit dem letzten Mal – auch
    die, deren Text nicht mehr in ``erledigt`` steht."""
    seit = letzter_stand()
    erledigt, laeufe = erledigtes(seit)
    ergebnis: dict = {"seit": seit, "jetzt": time.time(), "erledigt": erledigt, "erledigt_laeufe": laeufe}
    zugang = post.zugang()
    if zugang is None:
        ergebnis["post"] = None
        ergebnis["post_hinweis"] = "kein Postfach eingerichtet (hermes pa postfach <adresse>, Passwort in der .env)"
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
