"""MR-Bot: der Ressourcen-Stand nennt Schlüssel nur beim Namen, klopft wirklich an und ordnet „Frei jetzt“."""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from tikki.plugins.pa import ressourcen
from tikki.werkzeuge import suite_takt

GEHEIM = "key_" + "z" * 40


class _Modelle(BaseHTTPRequestHandler):
    status = 200
    gesehen: list[str] = []

    def do_GET(self) -> None:  # noqa: N802
        _Modelle.gesehen.append(f"{self.path} {self.headers.get('Authorization')}")
        self.send_response(self.status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"data": [{"id": f"m{i}"} for i in range(25)]}).encode())

    def log_message(self, *args) -> None:
        pass


@pytest.fixture
def server():
    s = HTTPServer(("127.0.0.1", 0), _Modelle)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    _Modelle.gesehen = []
    yield s
    s.shutdown()
    s.server_close()


def _katalog(port: int) -> list[dict]:
    return [
        {"slug": "raumleiter", "name": "Raumleiter", "hermes_profil": "raumleiter",
         "modell": {"primary": "cursor/claude", "fallback": "xai/grok-4.7", "weitere": ["xai-oauth/grok-4.7"]}},
        {"slug": "raumleiter-xai", "name": "Raumleiter (xAI)", "hermes_profil": "raumleiter-xai", "klon_von": "raumleiter",
         "modell": {"primary": "xai/grok-4.7", "fallback": "cursor/claude", "weitere": []}},
        {"slug": "raumleiter-anthropic", "name": "Raumleiter (Claude)", "hermes_profil": "raumleiter-anthropic",
         "klon_von": "raumleiter", "modell": {"primary": "anthropic/claude-opus-5-5", "fallback": "xai/grok-4.7", "weitere": []}},
        {"slug": "raumleiter-lokal", "name": "Raumleiter (lokal)", "hermes_profil": "raumleiter-lokal", "klon_von": "raumleiter",
         "modell": {"primary": "lokal/tikki-gross", "fallback": "xai/grok-4.7", "weitere": []}},
    ]


def _profile(tmp_path: Path, port: int) -> Path:
    profile = tmp_path / ".hermes" / "profiles"
    profil = profile / "raumleiter"
    profil.mkdir(parents=True, exist_ok=True)
    (profil / "config.yaml").write_text(
        f"providers:\n  cursor:\n    base_url: \"http://127.0.0.1:{port}/v1\"\n    key_env: \"CURSOR_API_KEY\"\n"
        f"  xai:\n    base_url: \"http://127.0.0.1:{port}/xai\"\n    key_env: \"XAI_API_KEY\"\n",
        encoding="utf-8",
    )
    (profil / ".env").write_text(f"CURSOR_API_KEY={GEHEIM}\n# XAI_API_KEY=\n", encoding="utf-8")
    return profile


def _sammeln(tmp_path: Path, port: int, monkeypatch, *, server: list | None = None, abo: bool = False) -> dict:
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / ".tikki"))
    monkeypatch.setattr(ressourcen, "_abo_angemeldet", lambda name: abo)
    return ressourcen.sammeln(
        katalog=_katalog(port), profile=_profile(tmp_path, port), umgebung={}, abos=False,
        lokal={"server": server or [], "modelle": [], "empfehlung": {}},
    )


def test_anbieter_werden_angeklopft_und_der_stand_nennt_nie_einen_schluesselwert(tmp_path: Path, monkeypatch, server) -> None:
    _Modelle.status = 200
    stand = _sammeln(tmp_path, server.server_port, monkeypatch)

    nach_name = {a["name"]: a for a in stand["anbieter"]}
    assert nach_name["cursor"]["erreichbar"] is True and nach_name["cursor"]["schluessel"] == ["CURSOR_API_KEY"]
    assert len(nach_name["cursor"]["modelle"]) == ressourcen.MODELLE_HOECHSTENS
    assert nach_name["xai"]["erreichbar"] is None and nach_name["xai"]["schluessel_fehlt"] == ["XAI_API_KEY"]
    assert nach_name["xai-oauth"]["weg"] == "abo" and nach_name["xai-oauth"]["abo"] is False
    assert _Modelle.gesehen == [f"/v1/models Bearer {GEHEIM}"]  # ohne Schlüssel wird nicht angeklopft

    datei = tmp_path / ".tikki" / "ressourcen.json"
    text = datei.read_text(encoding="utf-8")
    assert json.loads(text)["zeit"] == stand["zeit"]
    assert GEHEIM not in text and GEHEIM not in ressourcen.als_text(stand)
    assert "CURSOR_API_KEY" in ressourcen.als_text(stand)


def test_404_heisst_nicht_erreichbar_und_frei_jetzt_ordnet_lokal_vor_abo_vor_api(tmp_path: Path, monkeypatch, server) -> None:
    _Modelle.status = 404
    stand = _sammeln(tmp_path, server.server_port, monkeypatch)
    cursor = next(a for a in stand["anbieter"] if a["name"] == "cursor")
    assert cursor["erreichbar"] is False and "404" in cursor["befund"]
    assert stand["frei"] == []
    assert "nichts" in ressourcen.frei_zeile(stand)

    _Modelle.status = 200
    lokal = [{"adresse": "http://127.0.0.1:1234/v1", "art": "lmstudio", "modelle": ["tikki-gross"]}]
    stand = _sammeln(tmp_path, server.server_port, monkeypatch, server=lokal, abo=True)

    assert [f["slug"] for f in stand["frei"]] == ["raumleiter-lokal", "raumleiter-anthropic", "raumleiter"]
    assert [f["weg"] for f in stand["frei"]] == ["lokal", "abo", "api"]
    assert ressourcen.frei_zeile(stand).startswith("Frei jetzt: raumleiter-lokal (Server läuft")


def test_rundgang_liest_den_stand_nur_und_warnt_wenn_er_alt_ist(tmp_path: Path, monkeypatch, server) -> None:
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / ".tikki"))
    assert "kein Stand" in suite_takt.ressourcen_text()

    _Modelle.status = 404
    stand = _sammeln(tmp_path, server.server_port, monkeypatch)
    text = ressourcen.kurzbericht(jetzt=stand["zeit"] + 60)
    assert "Ausfall: cursor" in text and "älter als 2 h" not in text and GEHEIM not in text
    assert "älter als 2 h" in ressourcen.kurzbericht(jetzt=stand["zeit"] + ressourcen.FRISCH_S + 1)
    assert _Modelle.gesehen == [f"/v1/models Bearer {GEHEIM}"]  # der Rundgang klopft nicht noch einmal an
    assert time.time() - stand["zeit"] < 60
