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


def test_provider_names_in_capitals_mean_the_provider_and_stray_assignments_stay_out():
    """``XAI: …`` is the provider xAI, not a variable called XAI that nothing reads; an arbitrary
    ``NAME=value`` line of a notes file is not a secret to spread over every profile."""
    werte = einlesen(
        "XAI: xai-1234567890abcdef\nCURSOR crsr_abcdefghijklmnop\nOPENAI = sk-proj-abcdefghijklmnop\n"
        "WOHNORT=Kuehlungsborn-Ostsee\nMEIN_DIENST_TOKEN=tok-abcdefghijkl\n"
    )

    assert set(werte) == {"XAI_API_KEY", "CURSOR_API_KEY", "OPENAI_API_KEY", "MEIN_DIENST_TOKEN"}
    assert werte["CURSOR_API_KEY"] == "crsr_abcdefghijklmnop"


def test_profile_bound_secrets_reach_only_their_profile_and_only_role_profiles_get_keys(tmp_path, monkeypatch, capsys):
    from tikki.werkzeuge import schluessel
    from tikki.werkzeuge.raeume import katalog

    wurzel = tmp_path / ".hermes"
    rollen = sorted({e["hermes_profil"] for e in katalog()})
    for name in [*rollen, "openclaw", ".deleted"]:
        (wurzel / "profiles" / name).mkdir(parents=True)
    monkeypatch.setenv("HERMES_HOME", str(wurzel))
    datei = tmp_path / "schluessel.txt"
    datei.write_text("xai: xai-1234567890abcdef\ntelegram 123456:ABCDEFGHIJKLMNOP\nTIKKI_MAIL_PASSWORD=postfach-geheim\n",
                     encoding="utf-8")

    assert schluessel.main([str(datei)]) == 0

    def namen(pfad):
        return {z.split("=", 1)[0] for z in pfad.read_text(encoding="utf-8").splitlines()} if pfad.exists() else None

    gebunden = {"TELEGRAM_BOT_TOKEN", "TIKKI_MAIL_PASSWORD"}
    assert gebunden <= schluessel.PROFILGEBUNDEN
    assert namen(wurzel / "profiles" / "tikki" / ".env") == {"XAI_API_KEY", *gebunden}
    for anderes in [wurzel / ".env", *(wurzel / "profiles" / r / ".env" for r in rollen if r != "tikki")]:
        assert namen(anderes) == {"XAI_API_KEY"}, anderes
    assert namen(wurzel / "profiles" / "openclaw" / ".env") is None
    assert namen(wurzel / "profiles" / ".deleted" / ".env") is None
    assert "geheim" not in capsys.readouterr().out


def test_env_is_replaced_in_place_and_kept_private(tmp_path):
    env = tmp_path / ".env"
    env.write_text("# Kommentar\nXAI_API_KEY=alt\nANDERES=bleibt\n", encoding="utf-8")

    assert env_schreiben(env, {"XAI_API_KEY": "neu", "CURSOR_API_KEY": "key_x"}) == (1, 1)
    assert env.read_text(encoding="utf-8") == "# Kommentar\nXAI_API_KEY=neu\nANDERES=bleibt\nCURSOR_API_KEY=key_x\n"
    assert env_schreiben(env, {"XAI_API_KEY": "neu"}) == (0, 0)
    assert oct(os.stat(env).st_mode & 0o777) == "0o600"
