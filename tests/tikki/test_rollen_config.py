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


def test_room_lead_carries_every_bot_toolset_and_its_soul_names_them():
    """Hermes gives a delegated child only toolsets its parent has: a bot the room lead
    cannot equip is a bot without web, browser or terminal."""
    rollen = {r["slug"]: r for r in _rollen()}
    soul = (TIKKI / "rollen" / "raumleiter" / "SOUL.md").read_text(encoding="utf-8")
    raumleiter = set(rollen["raumleiter"]["werkzeuge"])

    for slug, rolle in rollen.items():
        if slug in {"tikki", "raumleiter", "wachhalter"} or rolle.get("klon_von"):
            continue
        assert set(rolle["werkzeuge"]) <= raumleiter, slug
        assert f"- `{slug}`: {', '.join(rolle['werkzeuge'])}" in soul, slug


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


@pytest.mark.parametrize("rolle", _rollen(), ids=lambda r: r["slug"])
@pytest.mark.parametrize("plattform", ["api_server", "cli"])
def test_plugin_toolsets_reach_only_the_roles_that_list_them(tmp_path, monkeypatch, rolle, plattform):
    """Hermes treats a plugin toolset absent from ``known_plugin_toolsets`` as "new" and enables it
    everywhere; the role's catalog ``werkzeuge`` must be the only thing that decides."""
    from ruamel.yaml import YAML
    import hermes_cli.tools_config as tools_config

    plugin_toolsets = {"pa", "gedaechtnis"}
    monkeypatch.setattr(tools_config, "_get_plugin_toolset_keys", lambda: set(plugin_toolsets))
    ziel = tmp_path / "profiles" / rolle["hermes_profil"] / "config.yaml"
    ziel.parent.mkdir(parents=True)
    rollen_config.schreiben(str(KATALOG), str(VORLAGE), rolle["slug"], str(ziel))
    cfg = YAML(typ="safe").load(ziel.read_text(encoding="utf-8"))

    aktiv = set(tools_config._get_platform_tools(cfg, plattform)) & plugin_toolsets
    assert aktiv == set(rolle["werkzeuge"]) & plugin_toolsets


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
