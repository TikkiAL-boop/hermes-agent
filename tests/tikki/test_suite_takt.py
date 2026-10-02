"""Tikki-Dauerräume: der Takt steht im Raum, das Gateway fährt die Runden, der Taktgeber stellt nur ein.

Verträge gegen den echten Raumspeicher, keine Momentaufnahmen: was ``zeitplan`` liefert, muss
Hermes' Kalender verstehen; ein fälliger Takt ergibt genau eine ``TAKT-RUNDE`` an ``@raumleiter``
und keine zweite vor dem nächsten Slot; eine Systemnachricht beantwortet keine offene Frage, der
Mensch schon; eine Tür und ein Übungsergebnis erreichen ihren Zielraum genau einmal.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from cron.jobs import parse_schedule
from gateway import hosted_rooms
from tikki.werkzeuge import raeume
from tikki.werkzeuge import suite_takt as st

GATEWAY = "install:test-gateway"
T0 = 1_790_000_000.0

# Dieselben drei Beispieltexte liest die App in apps/desktop/src/app/areas/suites/store.test.ts.
BRAUCHE_TEXT = "STAND: Ort gesucht.\nBRAUCHE: Budget? Vorschlag 150 €"
SYSTEM_NACHRICHTEN = [
    "thorsten: @raumleiter TAKT-RUNDE 2 · 01.10.2026 12:00: Neue Runde nach Takt (stündlich).",
    "@raumleiter WACHHALTER: bitte weiterarbeiten",
    "[Tür aus „Recherche“] @raumleiter Die Quellen liegen vor.",
    "@raumleiter ÜBUNGSERGEBNIS 2: Übungsraum „App-thorsten-2@tikki.team“ ist zuerst fertig.",
    "@raumleiter LERNEN: Alle Übungsläufe zu „App“ sind durch.",
]
ZWISCHENRUF = "@rechercheur such inzwischen drei Orte heraus."
STAND_OHNE_BRAUCHE = "STAND: Ort gebucht, Budget nicht mehr nötig."
AUFGABEN_TEXT = (
    "STAND: zweite Runde\n**AUFGABEN:** (Stand 12:00)\n* [x] Häuser an der Ostsee sammeln\n"
    "- [ ] Preise vergleichen\n\nTÜR: Recherche | bitte Preise"
)


@pytest.fixture
def db(tmp_path: Path, monkeypatch) -> Path:
    """Eine Hermes-Wurzel, in der jede Katalogrolle ein Profil mit Identitätsmarker hat."""
    wurzel = tmp_path / ".hermes"
    for e in raeume.katalog():
        profil = wurzel / "profiles" / e["hermes_profil"]
        profil.mkdir(parents=True)
        (profil / "config.yaml").write_text("model:\n  default: x\n", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(wurzel))
    return wurzel / "shared-state.db"


def _raum(db: Path, name: str, jetzt: float = T0) -> str:
    return raeume.anlegen(name, [], db=db, jetzt=jetzt, gateway_id=GATEWAY)["room_id"]


def _raumleiter_sagt(db: Path, raum_id: str, text: str, jetzt: float) -> None:
    r = raeume.stand(raum_id, db)
    hosted_rooms.append_event(
        db, room_id=raum_id, event_id=f"test:{uuid.uuid4().hex}", kind="message.member",
        actor={"kind": "member", "id": "raumleiter"},
        payload={"member_id": "raumleiter", "text": text, "thread_id": raeume.HAUPTFADEN},
        authority_gateway_id=r["authority_gateway_id"], authority_epoch=r["authority_epoch"], now=jetzt,
    )


def _texte(db: Path, raum_id: str) -> list[str]:
    return [n["text"] for n in raeume.nachrichten(raeume.verlauf(raum_id, db=db))]


@pytest.mark.parametrize(
    "takt", ["täglich 06:00", "alle 30 Minuten", "stündlich", "werktags 8 Uhr", "montags 09:15", "0 7 * * *"]
)
def test_every_german_takt_is_a_schedule_hermes_understands(takt):
    plan = st.zeitplan(takt)

    assert plan is not None
    assert parse_schedule(plan)["kind"] in {"interval", "cron"}
    assert st.zeitplan("aus") is None


def test_faelliger_takt_ergibt_genau_eine_runde_an_den_raumleiter_und_keine_vor_dem_naechsten_slot(db: Path):
    jetzt = datetime.now(timezone.utc)
    raum = _raum(db, "Nachrichtenlage")
    raeume.senden(raum, "@raumleiter Halte die KI-News aktuell.\nTAKT: alle 30 Minuten", von="Thorsten", db=db, jetzt=T0 + 1)

    assert st.takt(db=db, jetzt=jetzt - timedelta(minutes=31)) == []  # erstes Sehen: nächste Gelegenheit, nicht sofort
    gemeldet = st.takt(db=db, jetzt=jetzt)
    runden = [t for t in _texte(db, raum) if "TAKT-RUNDE" in t]

    assert len(gemeldet) == 1 and len(runden) == 1
    assert runden[0].startswith("@raumleiter TAKT-RUNDE 1 ·") and "alle 30 Minuten" in runden[0]
    assert st.takt(db=db, jetzt=jetzt + timedelta(minutes=1)) == []
    assert len([t for t in _texte(db, raum) if "TAKT-RUNDE" in t]) == 1

    _raumleiter_sagt(db, raum, "STAND: Lage ruhig.\nTAKT: aus", jetzt=T0 + 2)
    assert st.takt(db=db, jetzt=jetzt + timedelta(hours=2)) == []


def test_brauche_nach_der_letzten_menschnachricht_wartet_und_der_mensch_loest_sie(db: Path):
    raum = _raum(db, "Kindergeburtstag")
    raeume.senden(raum, "@raumleiter Plane die Feier.", von="Thorsten", db=db, jetzt=T0 + 1)
    _raumleiter_sagt(db, raum, (
        "STAND: Ort gesucht.\nAUFGABEN:\n- [x] Gästeliste (@organisator)\n- [ ] Ort buchen (@organisator)\n"
        "BRAUCHE: Budget? Vorschlag 150 €"
    ), jetzt=T0 + 2)

    [z] = st.bericht(db=db, jetzt=T0 + 2 + 9 * 60)
    assert z["brauche"] == "Budget? Vorschlag 150 €" and z["stand"] == "Ort gesucht."
    assert z["aufgaben_offen"] == ["Ort buchen (@organisator)"] and z["aufgaben_erledigt"] == 1
    assert z["still_seit_min"] == 9 and "wartet auf Mensch" in st._bericht_text([z])

    raeume.senden(raum, "@raumleiter WACHHALTER: bitte weiterarbeiten", db=db, jetzt=T0 + 3)
    assert st.bericht(db=db)[0]["brauche"] is not None  # eine Systemnachricht antwortet nicht

    raeume.senden(raum, "ja, 150 € passen", von="Thorsten", db=db, jetzt=T0 + 4)
    assert st.bericht(db=db)[0]["brauche"] is None


def test_systemnachrichten_lassen_brauche_offen_und_die_letzte_raumleiter_nachricht_gilt(db: Path):
    raum = _raum(db, "Kindergeburtstag")
    raeume.senden(raum, "@raumleiter Plane die Feier.", von="Thorsten", db=db, jetzt=T0 + 1)
    _raumleiter_sagt(db, raum, BRAUCHE_TEXT, jetzt=T0 + 2)
    for i, text in enumerate(SYSTEM_NACHRICHTEN):
        raeume.senden(raum, text, db=db, jetzt=T0 + 3 + i)
        assert st.bericht(db=db)[0]["brauche"] == "Budget? Vorschlag 150 €", text

    _raumleiter_sagt(db, raum, ZWISCHENRUF, jetzt=T0 + 20)  # kein STAND/FERTIG: die Frage steht weiter
    assert st.bericht(db=db)[0]["brauche"] == "Budget? Vorschlag 150 €"
    _raumleiter_sagt(db, raum, STAND_OHNE_BRAUCHE, jetzt=T0 + 21)
    assert st.bericht(db=db)[0]["brauche"] is None

    _raumleiter_sagt(db, raum, BRAUCHE_TEXT, jetzt=T0 + 22)
    raeume.senden(raum, "ja, 150 € passen", von="Thorsten", db=db, jetzt=T0 + 23)
    assert st.bericht(db=db)[0]["brauche"] is None


def test_aufgaben_block_wird_fett_mit_zusatz_und_sternchen_gelesen_wie_in_der_app(db: Path):
    raum = _raum(db, "Urlaub")
    _raumleiter_sagt(db, raum, AUFGABEN_TEXT, jetzt=T0 + 2)

    [z] = st.bericht(db=db)
    assert z["aufgaben_offen"] == ["Preise vergleichen"] and z["aufgaben_erledigt"] == 1


def test_ein_raum_der_die_nachricht_ablehnt_kostet_den_anderen_nicht_ihre_runde(db: Path, monkeypatch, capsys):
    jetzt = datetime.now(timezone.utc)
    raeume_ids = {}
    for i, name in enumerate(["A", "B", "C"]):
        raeume_ids[name] = _raum(db, name, T0 + i)
        raeume.senden(raeume_ids[name], "@raumleiter Dranbleiben.\nTAKT: alle 30 Minuten", von="Thorsten", db=db, jetzt=T0 + 10 + i)
    assert st.takt(db=db, jetzt=jetzt - timedelta(minutes=31)) == []

    echt = raeume.senden

    def senden(room_id, text, **kw):
        if room_id == raeume_ids["B"]:
            raise hosted_rooms.HostedRoomError("This Group Chat reached its history limit.")
        return echt(room_id, text, **kw)

    monkeypatch.setattr(raeume, "senden", senden)
    rc = st.main(["takt", "--db", str(db)])
    ausgabe = capsys.readouterr().out

    assert rc != 0
    assert [z for z in ausgabe.splitlines() if z.startswith(st.FEHLER)] == [f"{st.FEHLER}B: This Group Chat reached its history limit."]
    runden = {n: [t for t in _texte(db, r) if "TAKT-RUNDE" in t] for n, r in raeume_ids.items()}
    assert len(runden["A"]) == 1 and len(runden["C"]) == 1 and runden["B"] == []

    assert all(z.startswith(st.FEHLER) for z in st.takt(db=db, jetzt=jetzt + timedelta(minutes=1)))  # B bleibt fällig
    assert {n: len([t for t in _texte(db, r) if "TAKT-RUNDE" in t]) for n, r in raeume_ids.items()} == {"A": 1, "B": 0, "C": 1}
    bericht_b = next(z for z in st.bericht(db=db) if z["id"] == raeume_ids["B"])
    assert "history limit" in bericht_b["fehler"] and st.weckbedarf([bericht_b])


def test_bericht_schliesst_mit_wake_gate_nur_wenn_kein_raum_den_wachhalter_braucht(db: Path, capsys):
    def letzte_zeile() -> str:
        assert st.main(["bericht", "--db", str(db)]) == 0
        return capsys.readouterr().out.strip().splitlines()[-1]

    assert letzte_zeile() == '{"wakeAgent": false}'

    takt_raum = _raum(db, "Nachrichtenlage")
    raeume.senden(takt_raum, "@raumleiter Halte die Lage aktuell.\nTAKT: stündlich", von="Thorsten", db=db, jetzt=T0 + 1)
    _raumleiter_sagt(db, takt_raum, "STAND: läuft.\nAUFGABEN:\n- [ ] Quellen sichten (@rechercheur)", jetzt=T0 + 2)
    assert letzte_zeile() == '{"wakeAgent": false}'  # Räume mit Takt gehören dem Takt

    stiller = _raum(db, "Kindergeburtstag", T0 + 3)
    raeume.senden(stiller, "@raumleiter Plane die Feier.", von="Thorsten", db=db, jetzt=T0 + 4)
    _raumleiter_sagt(db, stiller, "STAND: Ort gesucht.\nAUFGABEN:\n- [ ] Ort buchen (@organisator)", jetzt=T0 + 5)
    assert not st.weckbedarf(st.bericht(db=db, jetzt=T0 + 5 + 29 * 60))
    assert st.weckbedarf(st.bericht(db=db, jetzt=T0 + 5 + 31 * 60))
    assert letzte_zeile() != '{"wakeAgent": false}'

    _raumleiter_sagt(db, stiller, "STAND: Ort gebucht.\nAUFGABEN:\n- [x] Ort buchen\nBRAUCHE: Budget?", jetzt=T0 + 6)
    assert st.weckbedarf(st.bericht(db=db, jetzt=T0 + 7))


def test_tuer_zeile_des_raumleiters_erreicht_den_zielraum_einmal_und_unbekannte_stehen_im_bericht(db: Path):
    jetzt = datetime.now(timezone.utc)
    a, b = _raum(db, "Recherche Ostsee"), _raum(db, "Website Ostsee", T0 + 1)
    _raumleiter_sagt(db, a, "STAND: Quellen stehen.\nTÜR: website ostsee | Die Quellenliste liegt unter quellen.md.", jetzt=T0 + 2)
    _raumleiter_sagt(db, a, "TÜR: Buchhaltung | Rechnung bitte", jetzt=T0 + 3)

    st.takt(db=db, jetzt=jetzt)

    assert _texte(db, b) == ["[Tür aus „Recherche Ostsee“] @raumleiter Die Quellenliste liegt unter quellen.md."]
    assert st.takt(db=db, jetzt=jetzt + timedelta(minutes=5)) == []
    assert len(_texte(db, b)) == 1
    bericht_a = next(z for z in st.bericht(db=db) if z["id"] == a)
    assert [t["ziel"] for t in bericht_a["tueren_unzustellbar"]] == ["Buchhaltung"]
    assert "Buchhaltung" in st._bericht_text(st.bericht(db=db))


def test_erstes_fertiges_uebungsergebnis_erreicht_den_hauptraum_einmal(db: Path):
    jetzt = datetime.now(timezone.utc)
    haupt, uebung = _raum(db, "App"), _raum(db, "App-thorsten-2@tikki.team", T0 + 1)
    raeume.senden(uebung, "@raumleiter ÜBUNG 2/4\nANSATZ: schnell\nBau die App.", von="Thorsten", db=db, jetzt=T0 + 2)
    _raumleiter_sagt(db, uebung, "STAND: app.html gebaut.\nFERTIG: app.html liegt bereit", jetzt=T0 + 3)

    st.takt(db=db, jetzt=jetzt)
    texte = _texte(db, haupt)

    assert len(texte) == 1 and texte[0].startswith("@raumleiter ÜBUNGSERGEBNIS 2:")
    assert "app.html liegt bereit" in texte[0] and "schnell" in texte[0] and "STAND: app.html gebaut." in texte[0]
    st.takt(db=db, jetzt=jetzt + timedelta(minutes=5))
    assert _texte(db, haupt) == texte
