"""Die Dienste-Skripte (Honcho, TencentDB) reichen Schlüssel weiter, ohne sie in eine Prozessliste zu legen.

Die echten Skripte laufen mit ``git``, ``docker`` und ``curl`` aus einem Ordner voller Attrappen,
die ihre Argumente aufschreiben. Verträge: kein Schlüsselwert steht je in den Argumenten eines
gestarteten Programms; der Wert kommt Zeichen für Zeichen in der Datei an, die der Dienst liest
(auch mit ``|`` und ``&``); und der dokumentierte Embedding-Schlüssel wird wirklich geschrieben.
"""

from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

import pytest

DIENSTE = Path(__file__).resolve().parents[2] / "tikki" / "dienste"
XAI = "xai-ab|cd&ef\\1"
EMBEDDING = "emb-geheim-4711"

pytestmark = pytest.mark.platforms("posix")


def _lauf(tmp_path: Path, skript: Path, *args: str) -> tuple[subprocess.CompletedProcess, str]:
    ablage, protokoll = tmp_path / "bin", tmp_path / "argumente"
    ablage.mkdir(exist_ok=True)
    for name in ("git", "docker", "curl"):
        (ablage / name).write_text(f'#!/bin/sh\necho "{name} $*" >> "{protokoll}"\nexit 0\n', encoding="utf-8")
        (ablage / name).chmod(0o755)
    env = {
        "PATH": f"{ablage}{os.pathsep}{os.environ['PATH']}", "HOME": str(tmp_path / "home"),
        "TIKKI_DIENSTE": str(tmp_path / "dienste"), "TIKKI_HOME": str(tmp_path / "tikki"), "XAI_API_KEY": XAI,
        "TIKKI_EMBEDDING_BASE_URL": "http://127.0.0.1:9000/v1", "TIKKI_EMBEDDING_API_KEY": EMBEDDING,
    }
    lauf = subprocess.run(["bash", str(skript), *args], env=env, capture_output=True, text=True)
    return lauf, protokoll.read_text(encoding="utf-8") if protokoll.exists() else ""


def test_honcho_schreibt_schluessel_wortgetreu_in_die_env_und_nie_in_argumente(tmp_path: Path) -> None:
    ziel = tmp_path / "dienste" / "honcho"
    (ziel / ".git").mkdir(parents=True)
    (ziel / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
    (ziel / ".env").write_text("LLM_OPENAI_API_KEY=alt\nEMBED_MESSAGES=false\nANDERES=bleibt\n", encoding="utf-8")

    lauf, argumente = _lauf(tmp_path, DIENSTE / "honcho" / "honcho.sh", "start")

    assert lauf.returncode == 0, lauf.stderr
    zeilen = (ziel / ".env").read_text(encoding="utf-8").splitlines()
    assert f"LLM_OPENAI_API_KEY={XAI}" in zeilen and "ANDERES=bleibt" in zeilen and "EMBED_MESSAGES=true" in zeilen
    assert [z for z in zeilen if z.endswith(f"={EMBEDDING}")], "der Embedding-Schlüssel fehlt in der .env"
    assert len([z for z in zeilen if z.startswith("LLM_OPENAI_API_KEY=")]) == 1
    assert XAI not in argumente and EMBEDDING not in argumente and "docker compose up" in argumente
    assert stat.S_IMODE((ziel / ".env").stat().st_mode) == 0o600


def test_tencentdb_gibt_dem_container_die_schluessel_ueber_eine_datei_nur_fuer_den_besitzer(tmp_path: Path) -> None:
    quelle = tmp_path / "dienste" / "tencentdb" / "quelle"
    (quelle / ".git").mkdir(parents=True)
    (quelle / "MemoryCore").mkdir()
    (quelle / "MemoryCore" / "tdai-gateway.standalone.yaml").write_text('language: "zh"\n', encoding="utf-8")

    lauf, argumente = _lauf(tmp_path, DIENSTE / "tencentdb" / "tencentdb.sh", "start", "system")

    assert lauf.returncode == 0, lauf.stderr
    ziel = tmp_path / "dienste" / "tencentdb"
    gateway_schluessel = (ziel / "system.key").read_text(encoding="utf-8").strip()
    umgebung = (ziel / "system.env").read_text(encoding="utf-8").splitlines()
    assert f"TDAI_LLM_API_KEY={XAI}" in umgebung and f"TDAI_GATEWAY_API_KEY={gateway_schluessel}" in umgebung
    assert XAI not in argumente and gateway_schluessel not in argumente
    assert f"--env-file {ziel / 'system.env'}" in argumente
    assert stat.S_IMODE((ziel / "system.env").stat().st_mode) == 0o600
