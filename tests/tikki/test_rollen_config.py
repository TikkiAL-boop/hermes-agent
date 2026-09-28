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
