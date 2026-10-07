"""Tikki-Räume auf gehosteten Hermes-Räumen: Besetzung, Nachrichten, Verschmelzen – gegen den echten Speicher."""

from __future__ import annotations

from pathlib import Path

import pytest

from gateway import hosted_room_discussion as discussion
from tikki.werkzeuge import raeume

GATEWAY = "install:test-gateway"


@pytest.fixture
def zuhause(tmp_path: Path, monkeypatch) -> Path:
    """Eine Hermes-Wurzel, in der jede Katalogrolle ein Profil mit Identitätsmarker hat."""
    wurzel = tmp_path / ".hermes"
    for e in raeume.katalog():
        profil = wurzel / "profiles" / e["hermes_profil"]
        profil.mkdir(parents=True)
        (profil / "config.yaml").write_text("model:\n  default: x\n", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(wurzel))
    return wurzel


def test_jeder_raum_sitzt_die_grundbesatzung_und_der_kern_nimmt_eine_grosse_crew_an(zuhause: Path) -> None:
    db = zuhause / "shared-state.db"
    alle = [e["slug"] for e in raeume.katalog()]
    assert len(alle) > 6  # mehr als die alte Hermes-Grenze

    raum = raeume.anlegen("Urlaub Ostsee", alle, db=db, jetzt=1_790_000_000.0, gateway_id=GATEWAY)

    handles = [m["handle"] for m in raum["members"]]
    assert handles[: len(raeume.grundbesatzung())] == raeume.grundbesatzung()
    assert set(handles) == set(alle) and len(handles) == len(alle)
    assert raum["room_id"].startswith(raeume.PRAEFIX) and "@" not in raum["room_id"]
    assert discussion.MAX_DISCUSSION_MEMBERS >= len(alle)


def test_nachricht_traegt_den_namen_des_menschen_und_erscheint_im_verlauf(zuhause: Path) -> None:
    db = zuhause / "shared-state.db"
    raum = raeume.anlegen("Kindergeburtstag", ["organisator"], db=db, jetzt=1_790_000_000.0, gateway_id=GATEWAY)

    raeume.senden(raum["room_id"], "@raumleiter Plan bitte bis Freitag.", von="Thorsten", db=db, jetzt=1_790_000_001.0)

    gesagt = raeume.nachrichten(raeume.verlauf(raum["room_id"], db=db), raum)
    assert [n["text"] for n in gesagt] == ["Thorsten: @raumleiter Plan bitte bis Freitag."]
    assert gesagt[0]["von"] == "mensch"
    assert raeume.liste(db=db)[0]["room_id"] == raum["room_id"]


def test_verschmelzen_vereint_mitglieder_zitiert_beide_und_loest_die_alten_auf(zuhause: Path) -> None:
    db = zuhause / "shared-state.db"
    a = raeume.anlegen("Recherche", ["rechercheur"], db=db, jetzt=1_790_000_000.0, gateway_id=GATEWAY)
    b = raeume.anlegen("Website", ["frontend-entwickler"], db=db, jetzt=1_790_000_001.0, gateway_id=GATEWAY)
    raeume.senden(a["room_id"], "Quellen gesammelt.", von="Thorsten", db=db, jetzt=1_790_000_002.0)
    raeume.senden(b["room_id"], "Startseite steht.", von="Thorsten", db=db, jetzt=1_790_000_003.0)

    c = raeume.verschmelzen(a["room_id"], b["room_id"], db=db, jetzt=1_790_000_010.0)

    profile = [m["profile"] for m in c["members"]]
    assert {"rechercheur", "frontend-entwickler"} <= set(profile) and len(profile) == len(set(profile))
    auftakt = raeume.nachrichten(raeume.verlauf(c["room_id"], db=db), c)[0]["text"]
    assert "Quellen gesammelt." in auftakt and "Startseite steht." in auftakt and auftakt.startswith("@raumleiter")
    assert {r["room_id"] for r in raeume.liste(db=db)} == {c["room_id"]}


def test_raumleiter_klon_sitzt_als_raumleiter_mit_eigenem_profil(zuhause: Path) -> None:
    db = zuhause / "shared-state.db"
    klone = [k["slug"] for k in raeume.raumleiter_klone()]
    assert klone and all(k.startswith("raumleiter-") for k in klone)
    klon = raeume.rolle(klone[0])
    original = raeume.rolle("raumleiter")
    assert klon["werkzeuge"] == original["werkzeuge"] and klon["modell"] != original["modell"]  # geerbt bzw. eigen

    raum = raeume.anlegen("Übung", ["rechercheur"], db=db, jetzt=1_790_000_000.0, gateway_id=GATEWAY, raumleiter=klone[0])

    leiter = next(m for m in raum["members"] if m["member_id"] == "raumleiter")
    assert (leiter["handle"], leiter["profile"]) == ("raumleiter", klon["hermes_profil"])
    with pytest.raises(ValueError):
        raeume.besetzung([], raumleiter="rechercheur")


def test_tuer_spricht_den_raumleiter_des_anderen_raums_an(zuhause: Path) -> None:
    db = zuhause / "shared-state.db"
    a = raeume.anlegen("Recherche", [], db=db, jetzt=1_790_000_000.0, gateway_id=GATEWAY)
    b = raeume.anlegen("Website", [], db=db, jetzt=1_790_000_001.0, gateway_id=GATEWAY)

    raeume.tuer(a["room_id"], b["room_id"], "Die Quellenliste liegt vor.", db=db, jetzt=1_790_000_002.0)

    text = raeume.nachrichten(raeume.verlauf(b["room_id"], db=db), b)[-1]["text"]
    assert text.startswith("[Tür aus „Recherche“] @raumleiter")
