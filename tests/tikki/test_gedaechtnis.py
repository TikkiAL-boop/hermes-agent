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


def test_changed_file_replaces_its_earlier_content(tmp_path, monkeypatch):
    """Re-ingesting an edited document must update the knowledge, not keep the stale chunks."""
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / "tikki"))
    datei = tmp_path / "wissen" / "waermepumpe.md"
    datei.parent.mkdir()
    datei.write_text("# Förderung\nDie Förderung beträgt bis zu 70 Prozent.\n", encoding="utf-8")
    assert einspielen([str(datei.parent)]) == (1, 1)

    datei.write_text("# Förderung\nDie Förderung beträgt seit Januar bis zu 55 Prozent.\n", encoding="utf-8")
    assert einspielen([str(datei.parent)]) == (1, 1)

    texte = [t["text"] for t in json.loads(nachschlagen({"frage": "Förderung Prozent", "quelle": "rag"}))["rag"]]
    assert len(texte) == 1 and "55 Prozent" in texte[0]


def test_history_backfill_adds_nothing_the_live_mirror_already_holds(tmp_path, monkeypatch):
    """``gedaechtnis verlauf`` after a mirrored turn: same answer, same key, no second copy. Cron
    sessions are no conversation with the human, and profiles outside the role catalog are not read."""
    from hermes_state import SessionDB
    from tikki.plugins.gedaechtnis import _spiegeln, verlauf_nachholen

    wurzel = tmp_path / ".hermes"
    monkeypatch.setenv("HERMES_HOME", str(wurzel))
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / "tikki"))
    for profil, quelle, frage, antwort in (
        ("tikki", "cli", "Wann hat Mia Geburtstag?", "Am 14. März."),
        ("tikki", "cron", "Prüfe mit post die ungelesenen Mails.", "Nichts Neues im Postfach."),
        ("fremdes-profil", "cli", "Was kostet der Urlaub?", "Etwa 1800 Euro."),
    ):
        (wurzel / "profiles" / profil).mkdir(parents=True, exist_ok=True)
        db = SessionDB(db_path=wurzel / "profiles" / profil / "state.db")
        try:
            sitzung = f"sitzung-{quelle}"
            db.create_session(sitzung, quelle)
            db.append_message(sitzung, "user", frage)
            db.append_message(sitzung, "assistant", antwort)
        finally:
            db.close()
    _spiegeln("sitzung-cli", "tikki", "Wann hat Mia Geburtstag?", "Am 14. März.")

    assert verlauf_nachholen() == 0

    rag = speicher.rag_fuer("thorsten")
    try:
        texte = [zeile[0] for zeile in rag._db.execute("SELECT text FROM stuecke")]
    finally:
        rag.close()
    assert texte == [speicher.runden_text("tikki", "Wann hat Mia Geburtstag?", "Am 14. März.")]


def test_a_mirrored_turn_is_searchable(tmp_path, monkeypatch):
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / "tikki"))
    from tikki.plugins.gedaechtnis import _spiegeln

    _spiegeln("sitzung-1", "tikki", "Wann hat Mia Geburtstag?", "Am 14. März.")

    rag = speicher.rag_fuer("thorsten")
    try:
        assert "14. März" in rag.suchen("Mia Geburtstag")[0].text
    finally:
        rag.close()
