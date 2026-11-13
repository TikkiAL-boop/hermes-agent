"""Die Tikki-Plugins über Hermes' echte Plugin-Discovery, in einem Profil wie nach ``rollen-einrichten.sh``.

Verträge zwischen drei Stellen, die auseinanderlaufen können: was die Plugins bei Hermes anmelden,
was ``rollen_config`` in die config.yaml der Rolle schreibt, und was Hermes daraus je Oberfläche
freischaltet. Nichts davon ist gemockt: die Toolset-Schlüssel kommen aus der Registry, die Hooks
laufen über Hermes' Hook-Dispatch.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import hermes_yaml as yaml
import pytest

from gateway import hosted_room_discussion as discussion
from gateway import hosted_rooms
from hermes_cli import plugins as plugins_mod
from tikki.plugins.gedaechtnis import speicher
from tikki.plugins.pa import post
from tikki.werkzeuge import rollen_config, turn_art

TIKKI = Path(__file__).resolve().parents[2] / "tikki"
KATALOG = str(TIKKI / "rollen" / "KATALOG.json")
VORLAGE = str(TIKKI / "hermes" / "vorlage-rolle.yaml")


@pytest.fixture
def profil(tmp_path: Path, monkeypatch) -> Path:
    """Das Profil ``tikki`` unter einer temporären Hermes-Wurzel: config.yaml der Rolle, beide
    Plugins verlinkt und über Hermes' Discovery geladen."""
    home = tmp_path / ".hermes" / "profiles" / "tikki"
    (home / "plugins").mkdir(parents=True)
    for plugin in sorted(p for p in (TIKKI / "plugins").iterdir() if (p / "plugin.yaml").is_file()):
        (home / "plugins" / plugin.name).symlink_to(plugin)
    rollen_config.schreiben(KATALOG, VORLAGE, "tikki", str(home / "config.yaml"))
    (tmp_path / "keine-mitgelieferten").mkdir()
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / ".tikki"))
    monkeypatch.setenv("HERMES_BUNDLED_PLUGINS", str(tmp_path / "keine-mitgelieferten"))
    for name in (post.PASSWORT, "TIKKI_MAIL_ADDRESS", "HERMES_CRON_SESSION"):
        monkeypatch.delenv(name, raising=False)
    plugins_mod._reset_plugin_managers_for_tests()
    plugins_mod.discover_plugins(force=True)
    yield home
    plugins_mod._reset_plugin_managers_for_tests()


def _rollen() -> list[dict]:
    return rollen_config._katalog(KATALOG)


def test_plugins_melden_ihre_werkzeuge_an_und_genau_die_toolsets_die_rollen_config_kennt(profil: Path) -> None:
    from tools.registry import registry

    geladen = plugins_mod.get_plugin_manager()._plugins
    for name in ("pa", "gedaechtnis", "raeume"):
        manifest = yaml.safe_load((TIKKI / "plugins" / name / "plugin.yaml").read_text(encoding="utf-8"))
        assert geladen[name].enabled and geladen[name].error is None, geladen[name].error
        assert set(manifest["provides_tools"]) == set(geladen[name].tools_registered)
        assert all(registry.get_entry(werkzeug) is not None for werkzeug in manifest["provides_tools"])
    assert {schluessel for schluessel, _, _ in plugins_mod.get_plugin_toolsets()} == set(rollen_config.PLUGIN_TOOLSETS)
    assert "post_llm_call" in geladen["gedaechtnis"].hooks_registered


def test_jede_rolle_bekommt_auf_jeder_oberflaeche_nur_die_plugin_toolsets_ihres_katalogs(profil: Path, tmp_path: Path) -> None:
    """Hermes hält ein Plugin-Toolset, das nicht als „bekannt“ gespeichert ist, für neu und schaltet es
    ein. Auf jeder Oberfläche der Rolle – auch in ihren Daueraufträgen (``cron``) – entscheidet allein
    der Katalog; und ``memory`` ist überall an."""
    import hermes_cli.tools_config as tools_config

    plugin_toolsets = set(rollen_config.PLUGIN_TOOLSETS)
    assert "cron" in rollen_config.OBERFLAECHEN
    for rolle in _rollen():
        ziel = tmp_path / "rollen" / rolle["hermes_profil"] / "config.yaml"
        ziel.parent.mkdir(parents=True)
        rollen_config.schreiben(KATALOG, VORLAGE, rolle["slug"], str(ziel))
        cfg = yaml.safe_load(ziel.read_text(encoding="utf-8"))
        for oberflaeche in rollen_config.OBERFLAECHEN:
            an = set(tools_config._get_platform_tools(cfg, oberflaeche))
            assert an & plugin_toolsets == set(rolle["werkzeuge"]) & plugin_toolsets, (rolle["slug"], oberflaeche)
            assert "memory" in an, (rolle["slug"], oberflaeche)


def test_briefing_geht_direkt_ans_modell_und_post_erst_mit_eingerichtetem_postfach(profil: Path, monkeypatch) -> None:
    """Tikkis Werkzeuge stehen im Schema selbst, nicht hinter der Werkzeugsuche; ``post`` gibt es
    nur in einem Profil mit Postfach (``check_fn``)."""
    from hermes_cli.config import load_config
    from hermes_cli.tools_config import _get_platform_tools
    from model_tools import get_tool_definitions
    from tools.registry import invalidate_check_fn_cache

    def namen() -> set[str]:
        invalidate_check_fn_cache()
        toolsets = sorted(_get_platform_tools(load_config(), "cli"))
        return {d["function"]["name"] for d in get_tool_definitions(enabled_toolsets=toolsets, quiet_mode=False)}

    ohne = namen()
    assert "briefing_sammeln" in ohne and "lokale_modelle" in ohne and "post" not in ohne

    cfg = yaml.safe_load((profil / "config.yaml").read_text(encoding="utf-8"))
    cfg.setdefault("plugins", {}).setdefault("entries", {})["pa"] = {"settings": {"mail_address": "tikki@tikki.team"}}
    (profil / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    monkeypatch.setenv(post.PASSWORT, "geheim")

    assert "post" in namen()


def test_tikki_eroeffnet_einen_raum_mit_dem_werkzeug_und_ihre_worte_tragen_ihren_namen_im_absender(profil: Path) -> None:
    """Der Weg vom Vorzimmer in einen Raum ist ein Werkzeugaufruf über Hermes' Registry – kein Text,
    den die App aus der Antwort lesen müsste. Der Raum liegt im echten Raumspeicher, mit Grundbesatzung."""
    from tikki.werkzeuge import raeume
    from tools.registry import registry

    for e in raeume.katalog():
        ordner = profil.parent / e["hermes_profil"]
        ordner.mkdir(exist_ok=True)
        if not (ordner / "config.yaml").exists():
            (ordner / "config.yaml").write_text("model:\n  default: x\n", encoding="utf-8")

    def raum(**args) -> dict:
        return json.loads(registry.dispatch("raum", args))

    neu = raum(aktion="eroeffnen", name="Urlaub Ostsee", rollen=["rechercheur"], text="@raumleiter Bitte plant eine Woche Ostsee.")

    assert set(raeume.grundbesatzung()) | {"rechercheur"} <= set(neu["mitglieder"])
    (eintrag,) = raum(aktion="liste")["raeume"]
    assert eintrag["room_id"] == neu["eroeffnet"] and eintrag["unbeantwortet"] is True
    auftakt = raeume.verlauf(neu["eroeffnet"])[-1]
    assert auftakt["kind"] == "message.user" and auftakt["actor"]["display_name"] == "Tikki"
    assert raum(aktion="senden", raum="Urlaub", text="Noch etwas.")["gesendet"] is True
    assert "fehler" in raum(aktion="senden", raum="gibt es nicht", text="Hallo")


def _warten_auf(bedingung, sekunden: float = 10.0):
    ende = time.monotonic() + sekunden
    while time.monotonic() < ende:
        if (wert := bedingung()):
            return wert
        time.sleep(0.05)
    return bedingung()


def _raum_prompt(tmp_path: Path) -> str:
    """Der Prompt einer Raum-Runde, wie das Gateway ihn wirklich baut."""
    db = tmp_path / "raum.db"
    mitglieder = [{"member_id": n, "profile": n, "handle": n, "display_name": n.title()} for n in ("tikki", "raumleiter")]
    raum = hosted_rooms.create_room(db, room_id="tikki-urlaub", name="Urlaub Ostsee", members=mitglieder,
                                    authority_gateway_id="gateway-a", now=1)
    hosted_rooms.append_event(
        db, room_id="tikki-urlaub", event_id="u1", kind="message.user", actor={"kind": "user", "id": "tikki"},
        authority_gateway_id="gateway-a", authority_epoch=1, payload={"text": "@tikki Was wissen wir?", "thread_id": "haupt"},
        now=2)
    ereignisse = hosted_rooms.read_events(db, room_id="tikki-urlaub", since_seq=0, limit=50)["events"]
    return discussion.plan_next_task(raum, ereignisse, local_profiles=("tikki", "raumleiter")).task.payload["prompt"]


def test_nur_was_ein_mensch_sagt_steht_als_mensch_im_gedaechtnis(profil: Path, tmp_path: Path) -> None:
    """Über Hermes' Hook-Dispatch: ein Dauerauftrag wird nicht gespiegelt, eine Raum-Runde als
    Wortmeldung des Mitglieds (ohne den Prompt mit den Worten der anderen), ein Gespräch als Gespräch."""
    prompt = _raum_prompt(tmp_path)
    assert turn_art.raum_aus_prompt(prompt) == ("Urlaub Ostsee", "tikki")  # Vertrag mit dem Prompt des Kerns

    def runde(frage: str, antwort: str, plattform: str) -> None:
        plugins_mod.invoke_hook(
            "post_llm_call", session_id="sitzung-1", task_id="t", turn_id="u", user_message=frage,
            assistant_response=antwort, conversation_history=[], model="m", platform=plattform)

    runde("Prüfe mit post die ungelesenen Mails.", "Zwei Mails beantwortet (Dauerauftrag).", "cron")
    runde(prompt, "(pass)", "api_server")
    runde(prompt, "Das Ferienhaus in Kühlungsborn ist bis Freitag reserviert.", "api_server")
    runde("Wann hat Mia Geburtstag?", "Am 14. März.", "cli")

    def stuecke() -> list[str]:
        rag = speicher.rag_fuer("thorsten")
        try:
            return [zeile[0] for zeile in rag._db.execute("SELECT text FROM stuecke ORDER BY id")]
        finally:
            rag.close()

    gemerkt = _warten_auf(lambda: (s := stuecke()) and len(s) >= 2 and s)
    assert sorted(gemerkt) == sorted([
        speicher.runden_text("tikki", "Wann hat Mia Geburtstag?", "Am 14. März."),
        speicher.raum_text("Urlaub Ostsee", "tikki", "tikki", "Das Ferienhaus in Kühlungsborn ist bis Freitag reserviert."),
    ])
