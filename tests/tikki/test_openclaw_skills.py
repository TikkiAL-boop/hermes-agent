"""OpenClaw-Skills: der lokale Katalog findet den Skill, der zur Frage passt."""

from tikki.werkzeuge.openclaw_skills import suchen

KATALOG = [
    {"slug": "pdf-tools", "name": "PDF Tools", "beschreibung": "Merge and split files.", "tags": [], "downloads": 5},
    {"slug": "notes", "name": "Notes", "beschreibung": "Take notes, export to pdf.", "tags": ["pdf"], "downloads": 900},
    {"slug": "weather", "name": "Weather", "beschreibung": "Forecasts.", "tags": [], "downloads": 9999},
]


def test_a_name_match_outranks_a_mention_and_unrelated_skills_stay_out():
    treffer = [e["slug"] for e in suchen("pdf", KATALOG)]

    assert treffer == ["pdf-tools", "notes"]
    assert suchen("", KATALOG) == []
