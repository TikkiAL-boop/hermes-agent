"""Schlüsseldatei → Profile: erkannt wird nach Name oder Form, geschrieben ohne Doppel, nie gezeigt."""

import os

from tikki.werkzeuge.schluessel import einlesen, env_schreiben

DATEI = """
# Thorstens Schlüssel
cursor: key_abcdefghijklmnop
XAI_API_KEY=xai-1234567890abcdef
Anthropic sk-ant-api03-zzzzzzzzzzzz
sk-or-v1-openrouterschluessel0000
WA Bridge Token = 9f8e7d6c5b4a39281706
irgendein Text ohne Schlüssel
"""


def test_names_and_key_shapes_are_both_recognised():
    werte = einlesen(DATEI)

    assert werte == {
        "CURSOR_API_KEY": "key_abcdefghijklmnop",
        "XAI_API_KEY": "xai-1234567890abcdef",
        "ANTHROPIC_API_KEY": "sk-ant-api03-zzzzzzzzzzzz",
        "OPENROUTER_API_KEY": "sk-or-v1-openrouterschluessel0000",
        "WA_BRIDGE_TOKEN": "9f8e7d6c5b4a39281706",
    }


def test_env_is_replaced_in_place_and_kept_private(tmp_path):
    env = tmp_path / ".env"
    env.write_text("# Kommentar\nXAI_API_KEY=alt\nANDERES=bleibt\n", encoding="utf-8")

    assert env_schreiben(env, {"XAI_API_KEY": "neu", "CURSOR_API_KEY": "key_x"}) == (1, 1)
    assert env.read_text(encoding="utf-8") == "# Kommentar\nXAI_API_KEY=neu\nANDERES=bleibt\nCURSOR_API_KEY=key_x\n"
    assert env_schreiben(env, {"XAI_API_KEY": "neu"}) == (0, 0)
    assert oct(os.stat(env).st_mode & 0o777) == "0o600"
