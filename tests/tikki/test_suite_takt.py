"""Tikki-Dauerräume: der Takt steht im Raum, das Backend fährt die Runden.

Verträge, keine Momentaufnahmen: was ``zeitplan`` liefert, muss Hermes' eigener Kalender
verstehen; eine Systemrunde beantwortet keine offene Frage; ein Übungsergebnis erreicht
den Hauptraum genau einmal, und nur solange der nicht selbst fertig ist.
"""

from datetime import datetime, timedelta, timezone

import pytest

from cron.jobs import parse_schedule
from tikki.werkzeuge import suite_takt as st


@pytest.mark.parametrize(
    "takt", ["täglich 06:00", "alle 30 Minuten", "stündlich", "werktags 8 Uhr", "montags 09:15", "0 7 * * *"]
)
def test_every_german_takt_is_a_schedule_hermes_understands(takt):
    plan = st.zeitplan(takt)

    assert plan is not None
    assert parse_schedule(plan)["kind"] in {"interval", "cron"}


def test_takt_off_and_last_line_wins():
    assert st.zeitplan("aus") is None
    assert st.takt_aus_text("TAKT: täglich 06:00\n…\n**TAKT: aus**") == "aus"


def _msg(role, text, ts=0.0, **kw):
    return {"role": role, "content": text, "timestamp": ts, **kw}


def test_system_rounds_do_not_answer_an_open_question_but_the_human_does():
    sitzung = {"id": "s1", "title": "Projekt"}
    offen = [_msg("user", "RAUM: Projekt"), _msg("assistant", "STAND: x\nBRAUCHE: Budget? Vorschlag 100 €")]

    assert st.raum_stand(sitzung, offen + [_msg("user", "TAKT-RUNDE 01.01. (täglich)")]).wartet_auf_mensch
    assert not st.raum_stand(sitzung, offen + [_msg("user", "ja, passt")]).wartet_auf_mensch


def test_first_sighting_is_not_due_and_an_elapsed_interval_is():
    sitzung = {"id": "s1", "title": "Dauer"}
    raum = st.raum_stand(sitzung, [_msg("user", "RAUM: Dauer\nTAKT: alle 30 Minuten")])
    jetzt = datetime.now(timezone.utc)
    zustand: dict = {}

    assert st.faellige([raum], zustand, jetzt) == []
    zustand["s1"]["letzte"] = (jetzt - timedelta(minutes=31)).isoformat()
    assert st.faellige([raum], zustand, jetzt) == [raum]


def test_first_finished_practice_room_reaches_the_main_room_once():
    haupt = st.raum_stand({"id": "h", "title": "App"}, [_msg("user", "RAUM: App")])
    fertig = st.raum_stand(
        {"id": "u2", "title": "App-thorsten-2@tikki.team"},
        [_msg("user", "ÜBUNG 2/4\nANSATZ: schnell"), _msg("assistant", "FERTIG: app.html liegt bereit", 10.0)],
    )
    zustand: dict = {}

    runden = st.uebungs_runden([haupt, fertig], zustand)
    assert [(r[0].id, r[3]) for r in runden] == [("h", ("App", "weitergegeben", "u2"))]
    assert "app.html" in runden[0][1]

    zustand["_uebung"] = {"App": {"weitergegeben": "u2"}}
    assert st.uebungs_runden([haupt, fertig], zustand) == []
