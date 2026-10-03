"""Tikki-Gedächtnis: was hineingeht, kommt beim Nachschlagen wieder heraus – und nur einmal."""

import json

from tikki.plugins.gedaechtnis import einspielen, nachschlagen, speicher


def test_ingested_knowledge_is_found_and_reingest_adds_nothing(tmp_path, monkeypatch):
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / "tikki"))
    wissen = tmp_path / "wissen"
    wissen.mkdir()
    (wissen / "waermepumpe.md").write_text(
        "# Förderung\nDie BEG-Förderung für Wärmepumpen beträgt bis zu 70 Prozent.\n", encoding="utf-8"
    )

    assert einspielen([str(wissen)]) == (1, 1)
    assert einspielen([str(wissen)]) == (1, 0)

    treffer = json.loads(nachschlagen({"frage": "Wärmepumpe Förderung", "quelle": "rag"}))["rag"]
    assert treffer and "70 Prozent" in treffer[0]["text"]


def test_a_mirrored_turn_is_searchable(tmp_path, monkeypatch):
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / "tikki"))
    from tikki.plugins.gedaechtnis import _spiegeln

    _spiegeln("sitzung-1", "tikki", "Wann hat Mia Geburtstag?", "Am 14. März.")

    rag = speicher.rag_fuer("thorsten")
    try:
        assert "14. März" in rag.suchen("Mia Geburtstag")[0].text
    finally:
        rag.close()
