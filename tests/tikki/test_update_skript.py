"""``tikki-update.sh`` ist der eine Update-Befehl: Code holen, Rollen nachziehen, prüfen – in dieser Reihenfolge.

Früher endete das Skript mit ``exec hermes update``: neue SOULs, Vorlagenänderungen, neue Rollen und
geänderte Cron-Skripte erreichten die Profile nicht. Das echte Skript läuft hier neben einem
``rollen-einrichten.sh`` und mit einem ``hermes``, die nur aufschreiben, dass sie gerufen wurden.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

SKRIPT = Path(__file__).resolve().parents[2] / "tikki" / "werkzeuge" / "tikki-update.sh"

pytestmark = pytest.mark.platforms("posix")


def _lauf(tmp_path: Path, update_exit: int) -> tuple[int, list[str]]:
    werkzeuge, ablage, protokoll = tmp_path / "werkzeuge", tmp_path / "bin", tmp_path / "protokoll"
    werkzeuge.mkdir()
    ablage.mkdir()
    shutil.copy(SKRIPT, werkzeuge / "tikki-update.sh")
    (werkzeuge / "rollen-einrichten.sh").write_text(f'#!/bin/sh\necho rollen >> "{protokoll}"\n', encoding="utf-8")
    (ablage / "hermes").write_text(
        f'#!/bin/sh\necho "hermes $*" >> "{protokoll}"\n[ "$1" = update ] && exit {update_exit}\nexit 0\n', encoding="utf-8")
    for datei in (werkzeuge / "rollen-einrichten.sh", ablage / "hermes"):
        datei.chmod(0o755)
    env = {"PATH": f"{ablage}{os.pathsep}{os.environ['PATH']}", "HOME": str(tmp_path)}
    lauf = subprocess.run(["bash", str(werkzeuge / "tikki-update.sh")], env=env, capture_output=True, text=True)
    return lauf.returncode, protokoll.read_text(encoding="utf-8").splitlines() if protokoll.exists() else []


def test_nach_dem_update_werden_die_rollen_nachgezogen_und_alles_geprueft(tmp_path: Path) -> None:
    code, schritte = _lauf(tmp_path, update_exit=0)

    assert code == 0
    assert [s.split()[:2] for s in schritte[:1]] == [["hermes", "update"]] and "tikki-app" in schritte[0]
    assert schritte[1] == "rollen" and "tikki.werkzeuge.selbsttest" in schritte[2]


def test_scheitert_das_update_bleiben_die_profile_unberuehrt(tmp_path: Path) -> None:
    code, schritte = _lauf(tmp_path, update_exit=3)

    assert code != 0 and len(schritte) == 1 and "rollen" not in schritte
