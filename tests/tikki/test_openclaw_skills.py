"""OpenClaw-Skills: der lokale Katalog findet den Skill, der zur Frage passt."""

import json
from pathlib import Path

from tikki.werkzeuge import rollen_config
from tikki.werkzeuge.openclaw_skills import bibliothek_entdoppeln, suchen

TIKKI = Path(__file__).resolve().parents[2] / "tikki"


def test_a_role_can_open_the_essential_skill_although_the_library_profile_holds_a_copy(tmp_path, monkeypatch):
    """Hermes seeds ``hermes-agent`` into every profile, the skill library included. A role mounts
    the library next to ``<repo>/skills``; with two same-named skills ``skill_view`` refuses to guess."""
    from agent.skill_utils import ESSENTIAL_SKILLS, _external_dirs_cache_clear
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from tools.skills_sync import sync_skills
    from tools.skills_tool import skill_view

    wurzel = tmp_path / ".hermes"
    bibliothek, rolle = wurzel / "profiles" / "openclaw", wurzel / "profiles" / "rechercheur"
    bibliothek.mkdir(parents=True)
    rolle.mkdir()
    (bibliothek / ".no-bundled-skills").write_text("", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", str(wurzel))
    marke = set_hermes_home_override(str(bibliothek))
    try:
        sync_skills(quiet=True)  # was Hermes beim Anlegen und bei jedem Update für das Profil tut
    finally:
        reset_hermes_home_override(marke)
    pflicht = sorted(ESSENTIAL_SKILLS)[0]
    assert list((bibliothek / "skills").rglob(f"{pflicht}/SKILL.md")), "Ausgangslage: die Bibliothek trägt die Kopie"
    rollen_config.schreiben(str(TIKKI / "rollen" / "KATALOG.json"), str(TIKKI / "hermes" / "vorlage-rolle.yaml"),
                            "rechercheur", str(rolle / "config.yaml"))

    bibliothek_entdoppeln(bibliothek)

    monkeypatch.setenv("HERMES_HOME", str(rolle))
    _external_dirs_cache_clear()
    ergebnis = json.loads(skill_view(pflicht))
    assert ergebnis.get("success") is not False and "Ambiguous" not in json.dumps(ergebnis), ergebnis

KATALOG = [
    {"slug": "pdf-tools", "name": "PDF Tools", "beschreibung": "Merge and split files.", "tags": [], "downloads": 5},
    {"slug": "notes", "name": "Notes", "beschreibung": "Take notes, export to pdf.", "tags": ["pdf"], "downloads": 900},
    {"slug": "weather", "name": "Weather", "beschreibung": "Forecasts.", "tags": [], "downloads": 9999},
]


def test_a_name_match_outranks_a_mention_and_unrelated_skills_stay_out():
    treffer = [e["slug"] for e in suchen("pdf", KATALOG)]

    assert treffer == ["pdf-tools", "notes"]
    assert suchen("", KATALOG) == []
