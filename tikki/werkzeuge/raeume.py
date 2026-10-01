"""Tikki – Räume auf Hermes' gehosteten Gruppenräumen.

Ein Tikki-Raum ist ein gehosteter Hermes-Raum (``gateway.hosted_rooms``): ein Eintrag mit Mitgliedern
und ein Ereignislog in ``shared-state.db`` an der Wurzel von ``~/.hermes``. Das Gateway (``hermes
gateway run`` als Dienst, oder jedes ``hermes serve``) fährt die Runden selbst: Nach jeder Nachricht
des Menschen bekommt jedes Mitglied, das angesprochen ist – ohne @ alle –, den ungelesenen Teil des
Gesprächs und antwortet oder sagt „(pass)“. So lesen alle mit, und der Raum läuft auch ohne App.

Dieses Modul ist der Klient dafür, ohne Netz: Räume anlegen (mit Grundbesatzung aus dem Katalog),
Nachrichten als Mensch einstellen (Takt, Türen), Verlauf lesen, umbenennen, auflösen, zwei Räume
verschmelzen. Die App spricht dieselben Dinge über die RPCs ``groups.*`` an.

Grenzen des Kerns, die hier gelten: Mitgliedernamen (``handle``) ohne @all/@everyone, Raum-Kennungen
``^[A-Za-z0-9][A-Za-z0-9._:-]*$`` (kein @, darum heißt der Raum nur im Anzeigenamen
„Projekt-mensch@tikki.team“), höchstens ``MAX_DISCUSSION_MEMBERS`` Mitglieder (Tikki: 128), je
Mensch-Nachricht höchstens 3 Runden und 10 veröffentlichte Antworten. Eine Nachricht ohne @ fragt
jedes Mitglied der Reihe nach – Takt und Türen sprechen deshalb immer @raumleiter an.

    hermes --run-module tikki.werkzeuge.raeume anlegen "Urlaub Ostsee" --rollen rechercheur schreiber
    hermes --run-module tikki.werkzeuge.raeume senden <raum> "…" [--von Thorsten]
    hermes --run-module tikki.werkzeuge.raeume verlauf <raum> | stand <raum> | liste
    hermes --run-module tikki.werkzeuge.raeume verschmelzen <raum-a> <raum-b> [--name …]
    hermes --run-module tikki.werkzeuge.raeume tuer <von> <nach> "…"
    hermes --run-module tikki.werkzeuge.raeume aufloesen <raum>
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import uuid
from pathlib import Path

from gateway import hosted_room_discussion as discussion
from gateway import hosted_rooms

TIKKI = Path(__file__).resolve().parents[1]
KATALOG = TIKKI / "rollen" / "KATALOG.json"
#: Alle Tikki-Räume tragen dieses Präfix in der Raum-Kennung; so bleiben fremde Räume außen vor.
PRAEFIX = "tikki-"
#: Ein Raum ist ein Gespräch: ein Faden für Mensch, Takt und Türen.
HAUPTFADEN = "haupt"
#: Wie viele der letzten Nachrichten ein verschmolzener Raum aus jedem Vorgänger mitbekommt.
VERSCHMELZEN_NACHRICHTEN = 12


# ── Katalog und Mitglieder ───────────────────────────────────────────────────

def katalog() -> list[dict]:
    return json.loads(KATALOG.read_text(encoding="utf-8"))


def rolle(slug: str) -> dict | None:
    return next((e for e in katalog() if e["slug"] == slug), None)


def grundbesatzung() -> list[str]:
    """Wer in jedem Raum von Anfang an sitzt (Katalog: ``im_raum_ab_start``)."""
    return [e["slug"] for e in katalog() if e.get("im_raum_ab_start")]


def mitglied(slug: str) -> dict:
    """Ein Katalogeintrag als Raum-Mitglied: Kennung, Profil und @-Name sind der Slug."""
    e = rolle(slug)
    if e is None:
        raise ValueError(f"unbekannte Rolle {slug!r}")
    return {"member_id": slug, "profile": e["hermes_profil"], "handle": slug, "display_name": e["name"]}


def besetzung(rollen: list[str] | None = None) -> list[dict]:
    """Grundbesatzung plus gewünschte Rollen, jede nur einmal, Reihenfolge erhalten."""
    gesehen: list[str] = []
    for slug in [*grundbesatzung(), *(rollen or [])]:
        if slug not in gesehen:
            gesehen.append(slug)
    return [mitglied(s) for s in gesehen]


# ── Speicherort und Kennungen ────────────────────────────────────────────────

def db_pfad() -> Path:
    return hosted_rooms.default_db_path()


def lokale_profile(wurzel: Path) -> tuple[str, ...]:
    """Profile, die das Gateway als Mitglieder annimmt (wie ``HostedRoomService.local_profiles``)."""
    from hermes_constants import named_profile_has_identity, named_profile_is_deleted

    profile = {"default"}
    ordner = wurzel / "profiles"
    if ordner.is_dir():
        profile.update(
            p.name for p in ordner.iterdir()
            if p.is_dir() and not p.name.startswith(".") and named_profile_has_identity(p) and not named_profile_is_deleted(p)
        )
    return tuple(sorted(profile))


def slug(text: str, laenge: int = 40) -> str:
    roh = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    roh = re.sub(r"[^A-Za-z0-9]+", "-", roh).strip("-").lower()
    return (roh or "raum")[:laenge].strip("-")


def _base36(n: int) -> str:
    ziffern = "0123456789abcdefghijklmnopqrstuvwxyz"
    aus = ""
    while n:
        n, r = divmod(n, 36)
        aus = ziffern[r] + aus
    return aus or "0"


def raum_id(name: str, jetzt: float | None = None) -> str:
    """Kennung eines neuen Raums: lesbar, eindeutig, im Kern-Alphabet."""
    return f"{PRAEFIX}{slug(name)}-{_base36(int((jetzt or time.time()) * 1000))}"


def ist_tikki_raum(raum: dict) -> bool:
    return str(raum.get("room_id", "")).startswith(PRAEFIX)


# ── Lesen ────────────────────────────────────────────────────────────────────

def liste(db: Path | None = None, *, auch_fremde: bool = False) -> list[dict]:
    """Aktive Räume, jüngste zuerst."""
    raeume = hosted_rooms.list_rooms(db or db_pfad())
    if not auch_fremde:
        raeume = [r for r in raeume if ist_tikki_raum(r)]
    return sorted(raeume, key=lambda r: r.get("updated_at") or 0, reverse=True)


def stand(room_id: str, db: Path | None = None) -> dict:
    return hosted_rooms.room_state(db or db_pfad(), room_id=room_id)


def verlauf(room_id: str, *, seit: int = 0, hoechstens: int = 2000, db: Path | None = None) -> list[dict]:
    """Alle Ereignisse nach ``seit``, über Seiten hinweg."""
    db = db or db_pfad()
    ereignisse: list[dict] = []
    cursor = seit
    while len(ereignisse) < hoechstens:
        seite = hosted_rooms.read_events(db, room_id=room_id, since_seq=cursor, limit=min(500, hoechstens - len(ereignisse)))
        ereignisse.extend(seite["events"])
        if not seite.get("has_more") or seite["cursor"] == cursor:
            break
        cursor = seite["cursor"]
    return ereignisse


def nachrichten(ereignisse: list[dict], raum: dict | None = None) -> list[dict]:
    """Nur das Gesagte: Mensch und Mitglieder, mit Sprecher, Text und Zeit."""
    namen = {m["member_id"]: m.get("display_name") or m.get("handle") or m["member_id"] for m in (raum or {}).get("members", [])}
    aus = []
    for e in ereignisse:
        if e["kind"] == "message.user":
            aus.append({"seq": e["seq"], "von": "mensch", "name": "Mensch", "text": e["payload"]["text"], "zeit": e["created_at"]})
        elif e["kind"] == "message.member":
            kennung = e["payload"].get("member_id") or e["actor"].get("id") or "?"
            aus.append({"seq": e["seq"], "von": kennung, "name": namen.get(kennung, kennung), "text": e["payload"]["text"], "zeit": e["created_at"]})
    return aus


def wer_arbeitet(ereignisse: list[dict]) -> str | None:
    """Das Mitglied, dessen Runde begonnen, aber noch nicht geendet hat."""
    offen: str | None = None
    for e in ereignisse:
        if e["kind"] == "turn.started":
            offen = e["payload"].get("member_id")
        elif e["kind"] in ("turn.settled", "turn.failed", "turn.cancelled", "turn.deferred"):
            offen = None
    return offen


# ── Schreiben ────────────────────────────────────────────────────────────────

def anlegen(name: str, rollen: list[str] | None = None, *, db: Path | None = None, jetzt: float | None = None,
            gateway_id: str | None = None) -> dict:
    """Einen Raum mit Grundbesatzung und den gewünschten Rollen anlegen."""
    db = db or db_pfad()
    mitglieder = besetzung(rollen)
    discussion.validate_roster(mitglieder, local_profiles=lokale_profile(db.parent))
    return hosted_rooms.create_room(
        db, room_id=raum_id(name, jetzt), name=name, members=mitglieder,
        authority_gateway_id=gateway_id or hosted_rooms.local_authority_gateway_id(), now=jetzt,
    )


def senden(room_id: str, text: str, *, von: str | None = None, faden: str = HAUPTFADEN,
           kennung: str | None = None, db: Path | None = None, jetzt: float | None = None) -> dict:
    """Eine Nachricht des Menschen (oder in seinem Auftrag: Takt, Tür) in den Raum stellen.

    Der Kern kennt den Menschen nicht beim Namen („User“); ``von`` stellt ihn dem Text voran,
    damit mehrere Menschen im Raum unterscheidbar bleiben. Das Gateway plant die Runde beim
    nächsten Blick auf den Raum (höchstens ~5 s später).
    """
    db = db or db_pfad()
    r = stand(room_id, db)
    nutzlast = discussion.validate_user_payload({"text": f"{von}: {text}" if von else text, "thread_id": faden})
    return hosted_rooms.append_event(
        db, room_id=room_id, event_id=kennung or f"tikki:{uuid.uuid4().hex}", kind="message.user",
        actor={"kind": "user", "id": "tikki"}, payload=nutzlast,
        authority_gateway_id=r["authority_gateway_id"], authority_epoch=r["authority_epoch"], now=jetzt,
    )


def umbenennen(room_id: str, name: str, *, db: Path | None = None) -> dict:
    return hosted_rooms.rename_room(db or db_pfad(), room_id=room_id, event_id=f"tikki-name:{uuid.uuid4().hex}", name=name)


def aufloesen(room_id: str, *, db: Path | None = None, jetzt: float | None = None) -> dict:
    db = db or db_pfad()
    r = stand(room_id, db)
    return hosted_rooms.disband_room(
        db, room_id=room_id, expected_gateway_id=r["authority_gateway_id"], expected_epoch=r["authority_epoch"], now=jetzt,
    )


def zusammenfassung(room_id: str, *, anzahl: int = VERSCHMELZEN_NACHRICHTEN, db: Path | None = None) -> str:
    """Die letzten Wortmeldungen eines Raums als Zitat, für Verschmelzen und Türen."""
    r = stand(room_id, db)
    letzte = nachrichten(verlauf(room_id, db=db), r)[-anzahl:]
    zeilen = [f"## {r['name']}"]
    zeilen += [f"- {n['name']}: {' '.join(n['text'].split())[:600]}" for n in letzte] or ["- (noch nichts gesagt)"]
    return "\n".join(zeilen)


def verschmelzen(a: str, b: str, *, name: str | None = None, db: Path | None = None, jetzt: float | None = None,
                 gateway_id: str | None = None) -> dict:
    """Zwei Räume werden einer: Mitglieder vereint, die letzten Wortmeldungen beider als Auftakt,
    die alten Räume aufgelöst. Der Kern kann Mitglieder nicht nachträglich ändern, darum ein neuer
    Raum; die Sitzungen der Mitglieder aus den alten Räumen bleiben als Gedächtnis (RAG) erhalten.
    """
    db = db or db_pfad()
    ra, rb = stand(a, db), stand(b, db)
    mitglieder: list[dict] = []
    for m in [*ra["members"], *rb["members"]]:
        if all(m["profile"] != x["profile"] for x in mitglieder):
            mitglieder.append({k: m[k] for k in ("member_id", "profile", "handle", "display_name") if k in m})
    discussion.validate_roster(mitglieder, local_profiles=lokale_profile(db.parent))
    neuer_name = name or f"{ra['name']} + {rb['name']}"
    auftakt = (
        f"@raumleiter Dieser Raum ist aus zwei Räumen verschmolzen: „{ra['name']}“ und „{rb['name']}“. "
        f"Hier der Stand beider; führe sie zu einem Ziel zusammen und sag, was als Nächstes dran ist.\n\n"
        f"{zusammenfassung(a, db=db)}\n\n{zusammenfassung(b, db=db)}"
    )
    neu = hosted_rooms.create_room(
        db, room_id=raum_id(neuer_name, jetzt), name=neuer_name, members=mitglieder,
        authority_gateway_id=gateway_id or ra["authority_gateway_id"], now=jetzt,
    )
    senden(neu["room_id"], auftakt, db=db, jetzt=jetzt)
    aufloesen(a, db=db, jetzt=jetzt)
    aufloesen(b, db=db, jetzt=jetzt)
    return neu


def tuer(von: str, nach: str, text: str, *, db: Path | None = None, jetzt: float | None = None) -> dict:
    """Eine Tür zwischen Räumen: Raum A spricht in Raum B hinein, als Nachricht an dessen Raumleiter."""
    rv = stand(von, db)
    return senden(nach, f"[Tür aus „{rv['name']}“] @raumleiter {text}", db=db, jetzt=jetzt)


# ── Kommandozeile ────────────────────────────────────────────────────────────

def _drucke(daten) -> None:
    print(json.dumps(daten, ensure_ascii=False, indent=1, default=str))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="raeume", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="befehl", required=True)
    p = sub.add_parser("anlegen"); p.add_argument("name"); p.add_argument("--rollen", nargs="*", default=[])
    p = sub.add_parser("senden"); p.add_argument("raum"); p.add_argument("text"); p.add_argument("--von")
    p = sub.add_parser("verlauf"); p.add_argument("raum"); p.add_argument("--seit", type=int, default=0)
    p = sub.add_parser("stand"); p.add_argument("raum")
    sub.add_parser("liste")
    p = sub.add_parser("umbenennen"); p.add_argument("raum"); p.add_argument("name")
    p = sub.add_parser("aufloesen"); p.add_argument("raum")
    p = sub.add_parser("verschmelzen"); p.add_argument("a"); p.add_argument("b"); p.add_argument("--name")
    p = sub.add_parser("tuer"); p.add_argument("von"); p.add_argument("nach"); p.add_argument("text")
    a = parser.parse_args(argv)

    if a.befehl == "anlegen":
        r = anlegen(a.name, a.rollen)
        print(f"{r['room_id']}  {r['name']}  Mitglieder: {', '.join(m['handle'] for m in r['members'])}")
    elif a.befehl == "senden":
        print(senden(a.raum, a.text, von=a.von)["seq"])
    elif a.befehl == "verlauf":
        r = stand(a.raum)
        for n in nachrichten(verlauf(a.raum, seit=a.seit), r):
            print(f"[{n['seq']}] {n['name']}: {n['text']}")
    elif a.befehl == "stand":
        _drucke(stand(a.raum))
    elif a.befehl == "liste":
        for r in liste():
            print(f"{r['room_id']:<48} {r['name']}  ({len(r['members'])} Mitglieder)")
    elif a.befehl == "umbenennen":
        _drucke(umbenennen(a.raum, a.name))
    elif a.befehl == "aufloesen":
        _drucke(aufloesen(a.raum))
    elif a.befehl == "verschmelzen":
        r = verschmelzen(a.a, a.b, name=a.name)
        print(f"{r['room_id']}  {r['name']}")
    elif a.befehl == "tuer":
        print(tuer(a.von, a.nach, a.text)["seq"])
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(TIKKI.parent))
    sys.exit(main())
