"""Lokale Modelle finden: Platte (GGUF-Shards, MLX, HF-Cache, Ollama) und laufende Server – gegen echte Dateien."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from tikki.plugins.pa import modelle


def _datei(pfad: Path, groesse: int = 1_000_000) -> None:
    pfad.parent.mkdir(parents=True, exist_ok=True)
    with pfad.open("wb") as f:
        f.truncate(groesse)


def test_name_verraet_parameter_aktive_parameter_und_quantisierung() -> None:
    assert modelle.parameter_aus_name("Qwen3-235B-A22B-4bit") == ("235B", "22B")
    assert modelle.parameter_aus_name("Llama-3.3-70B-Instruct-Q4_K_M") == ("70B", None)
    assert modelle.parameter_aus_name("gpt-oss-120b-MXFP4") == ("117B", "5.1B")  # bekannter Name schlägt die Zahl
    assert modelle.parameter_aus_name("GLM-4.5-Air-4bit") == ("106B", "12B")
    assert modelle.parameter_aus_name("Mixtral-8x22B-Instruct-v0.1") == ("8x22B", None)
    assert modelle.parameter_aus_name("SmolLM2-135M-Instruct") == (None, None)
    assert modelle.quant_aus_name("Llama-3.3-70B-Instruct-Q4_K_M.gguf") == "Q4_K_M"
    assert modelle.quant_aus_name("mlx-community/Qwen3-235B-A22B-4bit") == "4bit"


def test_platte_fasst_shards_zusammen_erkennt_mlx_hf_cache_und_ollama(tmp_path: Path) -> None:
    home = tmp_path
    # LM Studio: ein GGUF in zwei Shards → ein Modell mit der Summe
    for i in (1, 2):
        _datei(home / f".lmstudio/models/bartowski/Llama-3.3-70B/Llama-3.3-70B-Instruct-Q4_K_M-0000{i}-of-00002.gguf", 2_000_000)
    # MLX-Ordner im HF-Cache (Snapshot mit Symlink-Struktur ist egal, config.json + safetensors zählt)
    snap = home / ".cache/huggingface/hub/models--mlx-community--Qwen3-235B-A22B-4bit/snapshots/abc"
    (snap).mkdir(parents=True)
    (snap / "config.json").write_text(json.dumps({"quantization": {"bits": 4}}), encoding="utf-8")
    _datei(snap / "model-00001-of-00002.safetensors", 3_000_000)
    _datei(snap / "model-00002-of-00002.safetensors", 3_000_000)
    # Ollama-Manifest
    manifest = home / ".ollama/models/manifests/registry.ollama.ai/library/gpt-oss/120b"
    manifest.parent.mkdir(parents=True)
    manifest.write_text(json.dumps({"layers": [{"size": 60_000_000_000}, {"size": 1_000}]}), encoding="utf-8")
    # Downloads: nur flach
    _datei(home / "Downloads/gemma-3-27b-it-Q8_0.gguf", 500_000)
    _datei(home / "Downloads/tief/noch/tiefer/versteckt-9b.gguf", 500_000)

    funde = {m.name: m for m in modelle.modelle_auf_platte(home)}

    shard = funde["Llama-3.3-70B-Instruct-Q4_K_M"]
    assert (shard.format, shard.quelle, shard.parameter, shard.quant) == ("gguf", "lmstudio", "70B", "Q4_K_M")
    assert shard.gb == round(4_000_000 / 1e9, 1) and "llama-server" in shard.start and "65536" in shard.start
    mlx = funde["mlx-community/Qwen3-235B-A22B-4bit"]
    assert (mlx.format, mlx.quelle, mlx.parameter, mlx.aktiv) == ("mlx", "huggingface", "235B", "22B")
    assert "mlx_lm.server" in mlx.start
    ollama = funde["gpt-oss:120b"]
    assert (ollama.format, ollama.gb) == ("ollama", 60.0)
    assert "gemma-3-27b-it-Q8_0" in funde and "versteckt-9b" not in funde
    assert [m.name for m in modelle.modelle_auf_platte(home)][0] == "gpt-oss:120b"  # größte zuerst

    vorschlag = modelle.empfehlung(list(funde.values()))
    assert vorschlag == {"raeume": "mlx-community/Qwen3-235B-A22B-4bit", "sprache": "mlx-community/Qwen3-235B-A22B-4bit"}


class _Modelle(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/v1/models":
            body = json.dumps({"data": [{"id": "qwen3-235b-a22b"}, {"id": "gemma-3-27b"}]}).encode()
            self.send_response(200)
        else:
            body, _ = b"{}", self.send_response(404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):  # still
        pass


def test_server_suche_findet_laufenden_openai_server_und_schreibt_die_sammlung(tmp_path: Path, monkeypatch) -> None:
    server = HTTPServer(("127.0.0.1", 0), _Modelle)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        port = server.server_address[1]
        gefunden = modelle.server_suchen({port: "test", port + 1: "leer"}, timeout=1.0)
        assert [s.art for s in gefunden] == ["test"]
        assert gefunden[0].modelle == ["qwen3-235b-a22b", "gemma-3-27b"]
        assert gefunden[0].adresse == f"http://127.0.0.1:{port}/v1"

        monkeypatch.setenv("TIKKI_HOME", str(tmp_path / "tikki"))
        ergebnis = modelle.sammeln(home=tmp_path / "leer", ports={port: "test"}, timeout=1.0)
        gespeichert = json.loads((tmp_path / "tikki" / "modelle.json").read_text(encoding="utf-8"))
        assert gespeichert["server"][0]["modelle"] == ergebnis["server"][0]["modelle"]
        assert "qwen3-235b-a22b" in modelle.als_text(ergebnis)
    finally:
        server.shutdown()
