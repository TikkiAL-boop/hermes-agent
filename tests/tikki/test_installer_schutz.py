"""``installieren.sh`` ist wiederholbar, ohne dass Arbeit im Checkout still verschwindet.

Der Kern-Installer (``scripts/install.sh``) legt lokale Änderungen in einen Stash, den niemand
zurückspielt, und setzt einen abweichenden Zweig hart auf ``origin`` zurück. Das echte
``installieren.sh`` läuft hier in einem Wegwerf-Checkout mit eigenem ``origin``; an der Stelle des
Kern-Installers steht ein Skript, das nur aufschreibt, dass es gerufen wurde.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

INSTALLER = Path(__file__).resolve().parents[2] / "tikki" / "installieren.sh"

pytestmark = pytest.mark.platforms("posix")


@pytest.fixture
def checkout(tmp_path: Path):
    env = {
        "PATH": os.environ["PATH"], "HOME": str(tmp_path / "home"), "HERMES_HOME": str(tmp_path / "home" / ".hermes"),
        "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@tikki.team", "GIT_COMMITTER_NAME": "t",
        "GIT_COMMITTER_EMAIL": "t@tikki.team", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull,
    }
    (tmp_path / "home").mkdir()
    repo, gerufen = tmp_path / "repo", tmp_path / "kern-installer-lief"

    def git(*args: str) -> None:
        subprocess.run(["git", "-C", str(repo), *args], env=env, check=True, capture_output=True)

    (repo / "tikki").mkdir(parents=True)
    (repo / "scripts").mkdir()
    shutil.copy(INSTALLER, repo / "tikki" / "installieren.sh")
    (repo / "scripts" / "install.sh").write_text(f'#!/bin/sh\ntouch "{gerufen}"\n', encoding="utf-8")
    subprocess.run(["git", "init", "-q", "--bare", str(tmp_path / "origin.git")], env=env, check=True)
    subprocess.run(["git", "init", "-q", "-b", "tikki-app", str(repo)], env=env, check=True)
    git("add", "-A")
    git("commit", "-q", "-m", "Stand")
    git("remote", "add", "origin", str(tmp_path / "origin.git"))
    git("push", "-q", "origin", "tikki-app")

    def installieren() -> subprocess.CompletedProcess:
        return subprocess.run(["bash", str(repo / "tikki" / "installieren.sh"), "--ohne-app", "--ohne-dienste",
                               "--ohne-sprache"], env=env, capture_output=True, text=True)

    return repo, git, installieren, gerufen


def test_ungesicherte_arbeit_haelt_den_installer_auf_bevor_der_kern_installer_sie_wegraeumt(checkout) -> None:
    repo, _git, installieren, gerufen = checkout
    (repo / "notiz.md").write_text("noch nicht committet", encoding="utf-8")

    lauf = installieren()

    assert lauf.returncode != 0 and "--ohne-kern" in lauf.stderr
    assert not gerufen.exists() and (repo / "notiz.md").read_text(encoding="utf-8") == "noch nicht committet"


def test_commits_die_origin_nicht_kennt_halten_den_installer_auf_ein_sauberer_stand_nicht(checkout) -> None:
    repo, git, installieren, gerufen = checkout
    sauber = installieren()  # scheitert erst später (kein hermes), aber der Kern-Installer durfte laufen
    assert gerufen.exists(), sauber.stderr
    gerufen.unlink()

    (repo / "merge.md").write_text("lokaler Hermes-Merge", encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "-m", "lokal")
    lauf = installieren()

    assert lauf.returncode != 0 and "push" in lauf.stderr and not gerufen.exists()
