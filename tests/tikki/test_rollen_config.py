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
    return json.loads(KATALOG.read_text(encoding="utf-8"))


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
        if slug in {"tikki", "raumleiter", "wachhalter"}:
            continue
        assert set(rolle["werkzeuge"]) <= raumleiter, slug
        assert f"- `{slug}`: {', '.join(rolle['werkzeuge'])}" in soul, slug


def test_skill_roles_see_tikki_skills_coding_agents_and_the_openclaw_library(tmp_path):
    from ruamel.yaml import YAML

    ziel = tmp_path / "profiles" / "rechercheur" / "config.yaml"
    ziel.parent.mkdir(parents=True)
    assert rollen_config.schreiben(str(KATALOG), str(VORLAGE), "rechercheur", str(ziel))
    ordner = YAML().load(ziel.read_text(encoding="utf-8"))["skills"]["external_dirs"]

    assert ordner[0] == str(TIKKI / "skills") and (TIKKI / "skills").is_dir()
    assert ordner[2] == str(tmp_path / "profiles" / "openclaw" / "skills")
