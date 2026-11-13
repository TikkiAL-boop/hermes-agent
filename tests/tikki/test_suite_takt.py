"""Tikki-Räume ohne eigenes Protokoll: die Lage kommt aus der Art der Ereignisse, der Takt aus Hermes.

Verträge gegen den echten Raumspeicher, keine Momentaufnahmen: Kein Wort, das ein Modell in seine
Antwort schreibt, ändert die Lage eines Raums; eine gescheiterte Runde und eine liegen gebliebene
Wortmeldung wecken den Wachhalter, Ruhe nicht; ein Raum mit altem Takt zieht genau einmal auf
einen Hermes-Zeitplan um, und ein abgestellter Takt bleibt abgestellt, egal wie lange das her ist.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest

from cron.jobs import parse_schedule
from gateway import hosted_rooms
from tikki.werkzeuge import raeume
from tikki.werkzeuge import suite_takt as st

GATEWAY = "install:test-gateway"
T0 = 1_790_000_000.0

#: Zeilen des früheren Protokolls. Sie sind heute Text wie jeder andere.
ALTES_PROTOKOLL = [
    "STAND: Ort gesucht.\nBRAUCHE: Budget? Vorschlag 150 €",
    "FERTIG: alles erledigt",
    "TÜR: Recherche | bitte Preise",
    "RAUM: Zweitraum\nZIEL: irgendwas\nÖFFNE: https://example.org",
]


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


def _ereignis(db: Path, raum_id: str, art: str, nutzlast: dict, jetzt: float, mitglied: str = "raumleiter") -> None:
    r = raeume.stand(raum_id, db)
    hosted_rooms.append_event(
        db, room_id=raum_id, event_id=f"test:{uuid.uuid4().hex}", kind=art,
        actor={"kind": "member", "id": mitglied}, payload={"member_id": mitglied, **nutzlast},
        authority_gateway_id=r["authority_gateway_id"], authority_epoch=r["authority_epoch"], now=jetzt,
    )


def _raumleiter_sagt(db: Path, raum_id: str, text: str, jetzt: float) -> None:
    _ereignis(db, raum_id, "message.member", {"text": text, "thread_id": raeume.HAUPTFADEN}, jetzt)


def _zeile(db: Path, raum_id: str, jetzt: float) -> dict:
    return next(z for z in st.bericht(db=db, jetzt=jetzt) if z["room_id"] == raum_id)


@pytest.mark.parametrize(
    "takt", ["täglich 06:00", "alle 30 Minuten", "stündlich", "werktags 8 Uhr", "montags 09:15", "0 7 * * *"]
)
def test_every_german_takt_is_a_schedule_hermes_understands(takt):
    plan = st.zeitplan(takt)
    assert plan is not None
    assert parse_schedule(plan)["kind"] in {"interval", "cron"}


@pytest.mark.parametrize("text", ALTES_PROTOKOLL)
def test_kein_wort_eines_modells_aendert_die_lage_eines_raums(db: Path, text: str):
    """Die Lage hängt an der Art der Ereignisse. Zwei Räume mit denselben Ereignissen stehen gleich
    da, was auch immer der Raumleiter geschrieben hat."""
    still, redet = _raum(db, "Still"), _raum(db, "Redet", T0 + 1)
    for raum_id, gesagt in ((still, "Ich schaue mir das an."), (redet, text)):
        raeume.senden(raum_id, "Los geht's.", db=db, jetzt=T0 + 10)
        _raumleiter_sagt(db, raum_id, gesagt, T0 + 20)

    a, b = _zeile(db, still, T0 + 4000), _zeile(db, redet, T0 + 4000)
    for feld in ("arbeitet", "gescheitert", "unbeantwortet", "still_seit_min"):
        assert a[feld] == b[feld]
    assert not st.weckbedarf([a, b])


def test_bericht_schliesst_mit_wake_gate_nur_wenn_nirgends_etwas_liegen_geblieben_ist(db: Path, capsys, monkeypatch):
    monkeypatch.setattr(st, "ressourcen_text", lambda: "Ressourcen: –")
    raum_id = _raum(db, "Urlaub")
    raeume.senden(raum_id, "Bitte plant den Urlaub.", db=db, jetzt=T0 + 10)
    _raumleiter_sagt(db, raum_id, "Mache ich.", T0 + 20)

    assert st.main(["bericht", "--db", str(db)]) == 0
    assert capsys.readouterr().out.strip().endswith(st.KEIN_WECKEN)

    # Der Mensch meldet sich, niemand antwortet: erst Ruhe, nach der Frist ein Fall für den Wachhalter.
    raeume.senden(raum_id, "Und, wie weit seid ihr?", db=db, jetzt=T0 + 100)
    frisch = _zeile(db, raum_id, T0 + 100 + 60)
    alt = _zeile(db, raum_id, T0 + 100 + (st.STILL_MIN + 1) * 60)
    assert frisch["unbeantwortet"] and not st.weckbedarf([frisch])
    assert st.weckbedarf([alt])


def test_eine_gescheiterte_runde_weckt_den_wachhalter_bis_wieder_jemand_spricht(db: Path):
    """Runden-Ereignisse schreibt nur der Raumtreiber; hier stehen sie hinter dem echten Protokoll."""
    raum_id = _raum(db, "Bau")
    raeume.senden(raum_id, "Baut das bitte.", db=db, jetzt=T0 + 10)
    _raumleiter_sagt(db, raum_id, "Wird gemacht.", T0 + 20)
    raum, protokoll = raeume.stand(raum_id, db), raeume.verlauf(raum_id, db=db)
    runde = {"payload": {"member_id": "raumleiter"}, "actor": {"kind": "gateway", "id": GATEWAY}, "created_at": T0 + 30}
    begonnen, gescheitert = {**runde, "kind": "turn.started", "seq": 90}, {**runde, "kind": "turn.failed", "seq": 91}

    def weckt(ereignisse: list[dict]) -> bool:
        lage = raeume.lage_aus(raum, ereignisse)
        return st.weckbedarf([{**lage, "still_seit_min": 1}])

    assert not weckt(protokoll)
    assert not weckt([*protokoll, begonnen])
    assert weckt([*protokoll, begonnen, gescheitert])
    assert raeume.lage_aus(raum, [*protokoll, begonnen, gescheitert])["gescheitert"] == "raumleiter"
    wieder_da = {"kind": "message.member", "seq": 92, "created_at": T0 + 50, "actor": {"kind": "member", "id": "raumleiter"},
                 "payload": {"member_id": "raumleiter", "text": "Da bin ich wieder."}}
    assert not weckt([*protokoll, begonnen, gescheitert, wieder_da])


def test_alter_takt_zieht_genau_einmal_auf_einen_hermes_zeitplan_um_und_der_raum_bleibt(db: Path):
    raum_id = _raum(db, "Nachrichtenlage")
    raeume.senden(raum_id, "Bitte jeden Morgen die Lage.\nTAKT: täglich 06:00", db=db, jetzt=T0 + 10)
    ohne = _raum(db, "Einmalig", T0 + 1)
    raeume.senden(ohne, "Nur einmal.", db=db, jetzt=T0 + 10)
    vorher = raeume.verlauf(raum_id, db=db)
    angelegt: list[dict] = []
    anlegen = lambda **job: angelegt.append(job) or {"success": True}  # noqa: E731

    st.umziehen(db=db, anlegen=anlegen, vorhandene=lambda: [])
    st.umziehen(db=db, anlegen=anlegen, vorhandene=lambda: [])

    assert [j["name"] for j in angelegt] == [raeume.ZEITPLAN_NAME.format(room_id=raum_id)]
    assert parse_schedule(angelegt[0]["schedule"])["kind"] == "cron"
    assert raum_id in angelegt[0]["prompt"]
    assert raeume.verlauf(raum_id, db=db) == vorher
    assert {r["room_id"] for r in raeume.liste(db=db)} == {raum_id, ohne}


def test_abgestellter_takt_lebt_beim_umzug_nicht_wieder_auf_egal_wie_lang_der_raum_ist(db: Path, monkeypatch):
    """Früher las der Taktgeber nur Anfang und Ende langer Räume: fiel ``TAKT: aus`` aus dem Fenster,
    galt wieder der Takt vom Anfang. Der Umzug liest das ganze Protokoll."""
    raum_id = _raum(db, "Lang")
    raeume.senden(raum_id, "TAKT: stündlich", db=db, jetzt=T0 + 10)
    raeume.senden(raum_id, "TAKT: aus", db=db, jetzt=T0 + 20)
    for i in range(60):
        _raumleiter_sagt(db, raum_id, f"Notiz {i}", T0 + 30 + i)
    monkeypatch.setattr(raeume, "LAGE_EREIGNISSE", 5)
    angelegt: list[dict] = []

    st.umziehen(db=db, anlegen=lambda **job: angelegt.append(job) or {"success": True}, vorhandene=lambda: [])

    assert angelegt == []


def test_umzug_laesst_stehen_was_der_fruehere_taktgeber_hinterlassen_hat(db: Path):
    raum_id = _raum(db, "Alt")
    pfad = st.zustand_pfad(db)
    pfad.parent.mkdir(parents=True)
    alt = {raum_id: {"plan": "every 1h", "letzte": "2026-10-01T12:00:00+00:00", "runden": 7}}
    pfad.write_text(json.dumps(alt), encoding="utf-8")

    st.umziehen(db=db, anlegen=lambda **job: {"success": True}, vorhandene=lambda: [])

    danach = json.loads(pfad.read_text(encoding="utf-8"))
    assert danach[raum_id] == alt[raum_id]
    assert raum_id in danach["_umgezogen"]


def test_was_der_fruehere_betrieb_im_cron_hinterlassen_hat_verschwindet_und_sonst_nichts(db: Path):
    """Gegen Hermes' echten Cron-Speicher: der alte Taktgeber geht, der Rundgang verliert die
    Anweisungen des alten Verfahrens, und was der Mensch sich eingerichtet hat, bleibt wie es ist."""
    from cron import jobs

    taktgeber = jobs.create_job("Takt", "every 5m", name=st.ALTER_JOB, deliver="local")
    rundgang = jobs.create_job("Wecke stille Räume mit WACHHALTER: und beantworte nie BRAUCHE:", "every 15m",
                               name="tikki-rundgang", deliver="local")
    eigener = jobs.create_job("Schau nach der Post.", "every 4m", name="Post prüfen", deliver="local")
    auftrag = "Schau, wo etwas liegen geblieben ist."

    assert st.abloesen() and st.abloesen() == []
    assert st.angleichen("tikki-rundgang", auftrag) and st.angleichen("tikki-rundgang", auftrag) == []

    danach = {j["id"]: j for j in jobs.list_jobs(include_disabled=True)}
    assert taktgeber["id"] not in danach
    assert danach[rundgang["id"]]["prompt"] == auftrag
    assert danach[rundgang["id"]]["schedule"] == rundgang["schedule"]
    assert {k: danach[eigener["id"]][k] for k in eigener} == eigener
