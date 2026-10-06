"""Tikki-Selbsttest: liest dieselben Dateien, die Hermes und rollen-einrichten.sh schreiben."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

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


def _cronjobs_anlegen(tmp_path: Path, monkeypatch) -> dict[str, str]:
    from cron import jobs

    ids = {}
    for profil, name in selbsttest.CRONJOBS.items():
        home = tmp_path / "profiles" / profil
        home.mkdir(parents=True, exist_ok=True)
        monkeypatch.setenv("HERMES_HOME", str(home))
        ids[profil] = jobs.create_job("Rundgang", "every 15m", name=name, deliver="local")["id"]
    return ids


def test_takt_warnt_wenn_der_letzte_lauf_scheiterte_und_nennt_die_letzte_fehlerzeile(tmp_path: Path, monkeypatch) -> None:
    from cron import jobs

    ids = _cronjobs_anlegen(tmp_path, monkeypatch)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "profiles" / "raumleiter"))
    assert jobs.mark_job_run(ids["raumleiter"], success=False, error="Traceback …\nModuleNotFoundError: tikki")

    punkt = selbsttest.pruefe_takt(tmp_path / "profiles")
    assert punkt.stand == selbsttest.WARNUNG
    assert "raumleiter/tikki-takt" in punkt.text and "ModuleNotFoundError: tikki" in punkt.text
    assert "Traceback" not in punkt.text


def test_takt_meldet_abgeschalteten_cronjob_als_fehler(tmp_path: Path, monkeypatch) -> None:
    from cron import jobs

    ids = _cronjobs_anlegen(tmp_path, monkeypatch)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "profiles" / "wachhalter"))
    assert jobs.pause_job(ids["wachhalter"])

    punkt = selbsttest.pruefe_takt(tmp_path / "profiles")
    assert punkt.stand == selbsttest.FEHLER
    assert "wachhalter/tikki-rundgang" in punkt.text


class _Modelle(BaseHTTPRequestHandler):
    status = 404
    gesehen: list[str] = []

    def do_GET(self) -> None:  # noqa: N802
        _Modelle.gesehen.append(f"{self.path} {self.headers.get('Authorization')}")
        self.send_response(self.status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"data": []}')

    def log_message(self, *args) -> None:
        pass


@pytest.fixture
def modell_server():
    server = HTTPServer(("127.0.0.1", 0), _Modelle)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()
    server.server_close()


def _anbieter_profil(tmp_path: Path, port: int, geheim: str) -> Path:
    profil = tmp_path / "profiles" / "raumleiter"
    profil.mkdir(parents=True)
    (profil / "config.yaml").write_text(
        "providers:\n"
        f"  cursor:\n    base_url: \"http://127.0.0.1:{port}/v1\"\n    key_env: \"CURSOR_API_KEY\"\n"
        "  xai:\n    base_url: \"https://api.x.ai/v1\"\n    key_env: \"XAI_API_KEY\"\n",
        encoding="utf-8",
    )
    (profil / ".env").write_text(f"CURSOR_API_KEY={geheim}\n# XAI_API_KEY=\n", encoding="utf-8")
    return profil


def test_anbieter_warnt_bei_404_mit_handlungshinweis_und_zeigt_nie_den_schluessel(tmp_path: Path, modell_server) -> None:
    geheim = "key_" + "z" * 40
    _Modelle.status, _Modelle.gesehen = 404, []
    _anbieter_profil(tmp_path, modell_server.server_port, geheim)

    punkt = selbsttest.pruefe_anbieter(tmp_path / "profiles")

    assert punkt.stand == selbsttest.WARNUNG
    assert "cursor" in punkt.text and "404" in punkt.text and selbsttest.ANBIETER_HINWEIS["cursor"] in punkt.text
    assert "xai" in punkt.text and "übersprungen" in punkt.text
    assert geheim not in punkt.text
    assert _Modelle.gesehen == [f"/v1/models Bearer {geheim}"]


def _sprach_profil(tmp_path: Path, stt: str = "local", tts: str = "edge") -> Path:
    profil = tmp_path / "profiles" / "tikki"
    profil.mkdir(parents=True, exist_ok=True)
    (profil / "config.yaml").write_text(
        f"stt:\n  provider: \"{stt}\"\n  language: \"de\"\ntts:\n  provider: \"{tts}\"\n", encoding="utf-8"
    )
    return profil


def test_sprache_meldet_fehlendes_whisper_mit_installationsweg_und_installiert_nichts(tmp_path: Path, monkeypatch) -> None:
    import pm
    from tools import transcription_tools, tts_tool

    _sprach_profil(tmp_path)
    monkeypatch.setattr(transcription_tools, "_HAS_FASTER_WHISPER", False)
    monkeypatch.setattr(tts_tool, "_importable", lambda importer: True)
    nachgezogen = []
    stub = lambda extra: nachgezogen.append(extra)  # noqa: E731
    monkeypatch.setattr(pm, "ensure_import", stub)

    punkt = selbsttest.pruefe_sprache(tmp_path / "profiles")

    assert punkt.stand == selbsttest.WARNUNG
    assert "Spracheingabe local" in punkt.text and "hermes pm install --extra voice" in punkt.text
    assert "Sprachausgabe" not in punkt.text
    assert nachgezogen == []
    assert pm.ensure_import is stub  # der Leerlauf gilt nur während der Prüfung


def test_sprache_ist_in_ordnung_wenn_whisper_und_edge_da_sind_und_nennt_den_edge_fehltext_sonst(tmp_path: Path, monkeypatch) -> None:
    from tools import transcription_tools, tts_tool

    _sprach_profil(tmp_path)
    monkeypatch.setattr(transcription_tools, "_HAS_FASTER_WHISPER", True)
    monkeypatch.setattr(tts_tool, "_importable", lambda importer: True)

    punkt = selbsttest.pruefe_sprache(tmp_path / "profiles")
    assert punkt.stand == selbsttest.OK
    assert "hört mit local" in punkt.text and "spricht mit edge" in punkt.text and "Sprache de" in punkt.text

    monkeypatch.setattr(tts_tool, "_importable", lambda importer: False)
    monkeypatch.setattr(tts_tool, "_check_neutts_available", lambda: False)
    punkt = selbsttest.pruefe_sprache(tmp_path / "profiles")
    assert punkt.stand == selbsttest.WARNUNG
    assert "Sprachausgabe" in punkt.text and "edge-tts" in punkt.text


def test_sprache_warnt_ohne_konfigurierten_anbieter_und_steht_im_gesamtlauf(tmp_path: Path) -> None:
    punkte = {p.name: p for p in selbsttest.alle(tmp_path, app=False, backend=False, hermes="hermes")}

    assert punkte["Sprache"].stand == selbsttest.WARNUNG
    assert "stt.provider" in punkte["Sprache"].text


def test_anbieter_ist_in_ordnung_wenn_models_antwortet_und_steht_im_gesamtlauf(tmp_path: Path, modell_server) -> None:
    _Modelle.status, _Modelle.gesehen = 200, []
    _anbieter_profil(tmp_path, modell_server.server_port, "key_" + "z" * 40)

    assert selbsttest.pruefe_anbieter(tmp_path / "profiles").stand == selbsttest.OK
    punkte = {p.name: p for p in selbsttest.alle(tmp_path, app=False, backend=False, hermes="hermes")}
    assert punkte["Anbieter"].stand == selbsttest.OK and "cursor" in punkte["Anbieter"].text
