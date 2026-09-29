"""Tikki-Selbsttest: liest dieselben Dateien, die Hermes und rollen-einrichten.sh schreiben."""

from __future__ import annotations

from pathlib import Path

from tikki.werkzeuge import selbsttest


def test_leeres_zuhause_meldet_jede_fehlende_schicht_und_nie_einen_schluesselwert(tmp_path: Path) -> None:
    geheim = "xai-" + "q" * 40
    tikki = tmp_path / "profiles" / "tikki"
    tikki.mkdir(parents=True)
    (tikki / ".env").write_text(f"XAI_API_KEY={geheim}\n# CURSOR_API_KEY=\n", encoding="utf-8")

    punkte = {p.name: p for p in selbsttest.alle(tmp_path, app=False, backend=False, hermes="hermes")}

    for name in ("Rollen", "Vorzimmer", "Gedächtnis", "Takt"):
        assert punkte[name].stand == selbsttest.FEHLER, name
    assert punkte["Schlüssel"].stand == selbsttest.OK
    assert "XAI_API_KEY" in punkte["Schlüssel"].text
    assert all(geheim not in p.text for p in punkte.values())


def test_takt_erkennt_cronjobs_im_format_des_hermes_schedulers(tmp_path: Path, monkeypatch) -> None:
    from cron import jobs

    for profil, name in selbsttest.CRONJOBS.items():
        home = tmp_path / "profiles" / profil
        home.mkdir(parents=True)
        monkeypatch.setenv("HERMES_HOME", str(home))
        jobs.create_job("Rundgang", "every 15m", name=name, deliver="local")

    assert selbsttest.pruefe_takt(tmp_path / "profiles").stand == selbsttest.OK
