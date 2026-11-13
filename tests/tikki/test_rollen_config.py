"""Tikki role profiles: the config the setup script writes must be one Hermes leaves alone.

An unstamped profile config is re-stamped and rewritten by Hermes on first start, after
which ``rollen-einrichten.sh`` would see a diff and write it back on every run.
"""

import json
from pathlib import Path

import pytest

from hermes_cli.config_defaults import DEFAULT_CONFIG
from tikki.werkzeuge import rollen_config

TIKKI = Path(__file__).resolve().parents[2] / "tikki"
KATALOG = TIKKI / "rollen" / "KATALOG.json"
VORLAGE = TIKKI / "hermes" / "vorlage-rolle.yaml"
VORLAGE_HONCHO = TIKKI / "hermes" / "vorlage-honcho.json"


def _rollen():
    # Mit Vererbung: Klone (``klon_von``) tragen Werkzeuge und Freigabe des Originals.
    return rollen_config._katalog(str(KATALOG))


@pytest.mark.parametrize("rolle", _rollen(), ids=lambda r: r["slug"])
def test_profile_config_carries_current_version_and_catalog_port(tmp_path, rolle):
    from ruamel.yaml import YAML

    ziel = tmp_path / "config.yaml"
    assert rollen_config.schreiben(str(KATALOG), str(VORLAGE), rolle["slug"], str(ziel))
    cfg = YAML().load(ziel.read_text(encoding="utf-8"))

    assert cfg["_config_version"] == DEFAULT_CONFIG["_config_version"]
    assert cfg["platforms"]["api_server"]["extra"]["port"] == rolle["port"]
    assert cfg["model"]["provider"] + "/" + cfg["model"]["default"] == rolle["modell"]["primary"]
    assert ("delegation" in cfg) == ("delegation" in rolle["werkzeuge"])


def test_second_write_is_a_no_op(tmp_path):
    ziel = tmp_path / "config.yaml"
    assert rollen_config.schreiben(str(KATALOG), str(VORLAGE), "raumleiter", str(ziel))
    before = ziel.read_bytes()
    assert not rollen_config.schreiben(str(KATALOG), str(VORLAGE), "raumleiter", str(ziel))
    assert ziel.read_bytes() == before


def test_honcho_config_names_the_role_as_ai_peer_in_the_shared_workspace(tmp_path):
    ziel = tmp_path / "honcho.json"
    assert rollen_config.honcho_schreiben(str(VORLAGE_HONCHO), "raumleiter", str(ziel))
    cfg = json.loads(ziel.read_text(encoding="utf-8"))

    assert cfg["aiPeer"] == "raumleiter"
    assert cfg["workspace"] == "tikki"
    assert cfg["sessionStrategy"] == "per-session"
    assert "_hinweis" not in cfg
    assert not rollen_config.honcho_schreiben(str(VORLAGE_HONCHO), "raumleiter", str(ziel))


def test_room_lead_carries_every_bot_toolset():
    """Hermes gives a delegated child only toolsets its parent has: a bot the room lead
    cannot equip is a bot without web, browser or terminal."""
    rollen = {r["slug"]: r for r in _rollen()}
    raumleiter = set(rollen["raumleiter"]["werkzeuge"])

    for slug, rolle in rollen.items():
        if slug in {"tikki", "raumleiter", "wachhalter"} or rolle.get("klon_von"):
            continue
        assert set(rolle["werkzeuge"]) <= raumleiter, slug


def test_whoever_talks_to_the_human_can_ask_and_whoever_runs_rooms_can_reach_them(tmp_path):
    """Rückfragen und Räume sind Hermes-Werkzeuge, keine Zeilen in der Antwort: Die Rollen, die mit
    dem Menschen sprechen oder Räume führen, tragen sie auf jeder Oberfläche, auch im Dauerauftrag."""
    from ruamel.yaml import YAML

    for slug, noetig in (("tikki", {"clarify", "raeume", "cronjob"}), ("raumleiter", {"clarify", "raeume", "delegation"}),
                         ("wachhalter", {"raeume"})):
        ziel = tmp_path / f"{slug}.yaml"
        rollen_config.schreiben(str(KATALOG), str(VORLAGE), slug, str(ziel))
        cfg = YAML().load(ziel.read_text(encoding="utf-8"))
        for oberflaeche in ("cli", "api_server", "cron"):
            assert noetig <= set(cfg["platform_toolsets"][oberflaeche]), (slug, oberflaeche)
        assert "raeume" in cfg["plugins"]["enabled"]


def test_skill_roles_see_tikki_skills_every_builtin_hermes_skill_and_the_openclaw_library(tmp_path):
    """One entry for ``<repo>/skills`` instead of three hand-picked subfolders: every built-in
    Hermes skill (coding agents, research, youtube-content, ...) follows git without copies."""
    from ruamel.yaml import YAML

    ziel = tmp_path / "profiles" / "rechercheur" / "config.yaml"
    ziel.parent.mkdir(parents=True)
    assert rollen_config.schreiben(str(KATALOG), str(VORLAGE), "rechercheur", str(ziel))
    ordner = YAML().load(ziel.read_text(encoding="utf-8"))["skills"]["external_dirs"]

    assert ordner[0] == str(TIKKI / "skills") and (TIKKI / "skills").is_dir()
    assert ordner[1] == str(TIKKI.parent / "skills")
    assert (Path(ordner[1]) / "autonomous-ai-agents").is_dir() and (Path(ordner[1]) / "research").is_dir()
    assert ordner[2] == str(tmp_path / "profiles" / "openclaw" / "skills")
    assert not any(Path(o).is_relative_to(TIKKI.parent / "skills") for o in ordner[2:])


def test_rerun_keeps_what_was_changed_in_the_profile_and_still_delivers_catalog_changes(tmp_path):
    """Settings made in Hermes (TTS voice, a Telegram platform, an MCP server, a toolset toggled
    with ``hermes tools``) survive the next installer run; a catalog change the user did not touch
    (a toolset the role gains or loses, a corrected model id) still arrives."""
    from ruamel.yaml import YAML
    from hermes_cli.config import atomic_config_write
    from hermes_yaml import roundtrip_yaml

    katalog = tmp_path / "rollen" / "KATALOG.json"
    katalog.parent.mkdir()
    eintraege = json.loads(KATALOG.read_text(encoding="utf-8"))
    katalog.write_text(json.dumps(eintraege), encoding="utf-8")
    ziel = tmp_path / "profiles" / "rechercheur" / "config.yaml"
    ziel.parent.mkdir(parents=True)
    assert rollen_config.schreiben(str(katalog), str(VORLAGE), "rechercheur", str(ziel))

    stand = roundtrip_yaml().load(ziel.read_text(encoding="utf-8"))
    stand["tts"]["edge"]["voice"] = "de-DE-ConradNeural"
    stand["approvals"]["mode"] = "manual"
    stand["platforms"]["telegram"] = {"enabled": True}
    stand["mcp_servers"] = {"notizen": {"command": "notizen-mcp"}}
    stand["platform_toolsets"]["cli"] = [*stand["platform_toolsets"]["cli"], "todo"]
    atomic_config_write(ziel, stand)

    rolle = next(e for e in eintraege if e["slug"] == "rechercheur")
    rolle["werkzeuge"] = [w for w in rolle["werkzeuge"] if w != "browser"] + ["terminal"]
    rolle["modell"]["primary"] = "xai/grok-korrigiert"
    katalog.write_text(json.dumps(eintraege), encoding="utf-8")
    assert rollen_config.schreiben(str(katalog), str(VORLAGE), "rechercheur", str(ziel))

    cfg = YAML(typ="safe").load(ziel.read_text(encoding="utf-8"))
    assert cfg["tts"]["edge"]["voice"] == "de-DE-ConradNeural" and cfg["approvals"]["mode"] == "manual"
    assert cfg["platforms"]["telegram"] == {"enabled": True} and cfg["mcp_servers"] == {"notizen": {"command": "notizen-mcp"}}
    assert set(cfg["platform_toolsets"]["cli"]) == set(rolle["werkzeuge"]) | {"todo"}
    assert set(cfg["platform_toolsets"]["cron"]) == set(rolle["werkzeuge"])
    assert cfg["model"]["provider"] + "/" + cfg["model"]["default"] == "xai/grok-korrigiert"
    assert not rollen_config.schreiben(str(katalog), str(VORLAGE), "rechercheur", str(ziel))


def test_profile_from_before_the_stamp_takes_the_new_toolsets_and_keeps_foreign_settings(tmp_path):
    """A profile written before the merge stamp existed: what catalog and template define wins once
    (as every run did before), everything else in the file is the user's and stays."""
    from ruamel.yaml import YAML

    ziel = tmp_path / "profiles" / "tikki" / "config.yaml"
    ziel.parent.mkdir(parents=True)
    ziel.write_text(
        "model:\n  provider: xai\n  default: selbst-gewaehlt\n"
        "platform_toolsets:\n  api_server: [gedaechtnis, pa, web]\n  cli: [gedaechtnis, pa, web]\n"
        "known_plugin_toolsets:\n  cli: [gedaechtnis, pa]\n"
        "mcp_servers:\n  notizen:\n    command: notizen-mcp\n", encoding="utf-8")

    assert rollen_config.schreiben(str(KATALOG), str(VORLAGE), "tikki", str(ziel))

    cfg = YAML(typ="safe").load(ziel.read_text(encoding="utf-8"))
    rolle = next(r for r in _rollen() if r["slug"] == "tikki")
    for oberflaeche in rollen_config.OBERFLAECHEN:
        assert set(cfg["platform_toolsets"][oberflaeche]) == set(rolle["werkzeuge"]), oberflaeche
        assert set(cfg["known_plugin_toolsets"][oberflaeche]) == set(rollen_config.PLUGIN_TOOLSETS), oberflaeche
    assert cfg["mcp_servers"] == {"notizen": {"command": "notizen-mcp"}}
    assert cfg["model"]["default"] == "selbst-gewaehlt"
    assert cfg["platforms"]["api_server"]["extra"]["port"] == rolle["port"]


def test_rerun_keeps_the_model_hermes_wrote_and_hermes_indentation(tmp_path, monkeypatch):
    """``hermes model`` / Admin → Modelle go through ``atomic_config_write``; a later installer run
    must neither reset the choice nor rewrite the file over a mere indentation difference."""
    from ruamel.yaml import YAML
    from hermes_cli.config import atomic_config_write
    from hermes_yaml import roundtrip_yaml

    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    ziel = tmp_path / "profiles" / "raumleiter" / "config.yaml"
    ziel.parent.mkdir(parents=True)
    assert rollen_config.schreiben(str(KATALOG), str(VORLAGE), "raumleiter", str(ziel))

    stand = roundtrip_yaml().load(ziel.read_text(encoding="utf-8"))
    stand["model"]["provider"] = "lokal"
    stand["model"]["default"] = "tikki-gross"
    stand["model"]["context_length"] = 65536
    stand["fallback_providers"] = [{"provider": "xai", "model": "grok-4.7"}]
    atomic_config_write(ziel, stand)
    nach_hermes = ziel.read_bytes()

    assert not rollen_config.schreiben(str(KATALOG), str(VORLAGE), "raumleiter", str(ziel))
    assert ziel.read_bytes() == nach_hermes
    cfg = YAML(typ="safe").load(ziel.read_text(encoding="utf-8"))
    assert (cfg["model"]["provider"], cfg["model"]["default"], cfg["model"]["context_length"]) == ("lokal", "tikki-gross", 65536)
    assert cfg["fallback_providers"] == [{"provider": "xai", "model": "grok-4.7"}]

    assert rollen_config.schreiben(str(KATALOG), str(VORLAGE), "raumleiter", str(ziel), modelle_zuruecksetzen=True)
    cfg = YAML(typ="safe").load(ziel.read_text(encoding="utf-8"))
    rolle = next(r for r in _rollen() if r["slug"] == "raumleiter")
    assert cfg["model"]["provider"] + "/" + cfg["model"]["default"] == rolle["modell"]["primary"]
    assert "context_length" not in cfg["model"]


def test_rules_edited_in_the_profile_survive_the_next_setup_run(tmp_path):
    """Admin → Regeln writes the profile's SOUL.md. A later installer or update run must not put
    the repo version back over it; an untouched profile keeps following the repo."""
    quelle = tmp_path / "repo-SOUL.md"
    profil = tmp_path / "profiles" / "raumleiter"
    profil.mkdir(parents=True)
    ziel = profil / "SOUL.md"
    ziel.write_text("Hermes placeholder\n", encoding="utf-8")  # what `hermes profile create` leaves

    quelle.write_text("Regeln v1\n", encoding="utf-8")
    assert rollen_config.seele_einrichten(str(quelle), str(ziel)) == "geschrieben"
    assert ziel.read_text(encoding="utf-8") == "Regeln v1\n"

    quelle.write_text("Regeln v2\n", encoding="utf-8")  # the repo moves on, nobody touched the profile
    assert rollen_config.seele_einrichten(str(quelle), str(ziel)) == "geschrieben"
    assert ziel.read_text(encoding="utf-8") == "Regeln v2\n"

    ziel.write_text("Regeln v2\nUnd: duze mich.\n", encoding="utf-8")  # the person edits in the app
    quelle.write_text("Regeln v3\n", encoding="utf-8")
    assert rollen_config.seele_einrichten(str(quelle), str(ziel)) == "behalten"
    assert rollen_config.seele_einrichten(str(quelle), str(ziel)) == "behalten"  # …and on every later run
    assert ziel.read_text(encoding="utf-8") == "Regeln v2\nUnd: duze mich.\n"

    assert rollen_config.seele_einrichten(str(quelle), str(ziel), zuruecksetzen=True) == "geschrieben"
    assert ziel.read_text(encoding="utf-8") == "Regeln v3\n"
    assert rollen_config.seele_einrichten(str(quelle), str(ziel)) == "unverändert"


def test_config_and_rules_keep_their_own_half_of_the_stamp(tmp_path):
    """One stamp file remembers both what Tikki last wrote as config and as SOUL; writing one
    must not forget the other, or the next run would take a kept edit for an untouched file."""
    quelle = tmp_path / "repo-SOUL.md"
    quelle.write_text("Regeln v1\n", encoding="utf-8")
    profil = tmp_path / "profiles" / "raumleiter"
    profil.mkdir(parents=True)
    seele, config = profil / "SOUL.md", profil / "config.yaml"

    rollen_config.seele_einrichten(str(quelle), str(seele))
    rollen_config.schreiben(str(KATALOG), str(VORLAGE), "raumleiter", str(config))
    seele.write_text("Meine Regeln\n", encoding="utf-8")
    quelle.write_text("Regeln v2\n", encoding="utf-8")

    assert rollen_config.seele_einrichten(str(quelle), str(seele)) == "behalten"
    assert not rollen_config.schreiben(str(KATALOG), str(VORLAGE), "raumleiter", str(config))
    assert not rollen_config.veraltet(str(KATALOG), str(VORLAGE), "raumleiter", str(config))
    assert rollen_config.seele_einrichten(str(quelle), str(seele)) == "behalten"
    assert seele.read_text(encoding="utf-8") == "Meine Regeln\n"
