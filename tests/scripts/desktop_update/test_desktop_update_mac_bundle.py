"""The detached updater installs the bundle the rebuild produced, whatever the product is called.

electron-builder names the bundle ``<productName>.app``. The shim looked for ``Hermes.app`` only,
so a renamed product rebuilt fine and then relaunched the OLD installed bundle: the swap found
nothing to install and the app stayed one build behind its backend after every update.

Drives the real ``--self-test-mac-bundle`` entry point of ``posix.sh`` (bundle discovery is plain
directory logic; the swap itself needs macOS tools).
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

POSIX_SH = Path(__file__).resolve().parents[3] / "scripts" / "desktop-update" / "posix.sh"

pytestmark = pytest.mark.platforms("posix")


def _rebuilt(install_root: Path, relaunch_target: Path) -> str:
    out = subprocess.run(
        ["bash", str(POSIX_SH), "--self-test-mac-bundle", "--install-root", str(install_root),
         "--relaunch-target", str(relaunch_target)],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


@pytest.mark.parametrize("arch_dir", ["mac-arm64", "mac"])
def test_rebuilt_bundle_is_found_under_the_running_apps_own_name(tmp_path: Path, arch_dir: str) -> None:
    rebuilt = tmp_path / "apps" / "desktop" / "release" / arch_dir / "Neu.app"
    rebuilt.mkdir(parents=True)

    assert _rebuilt(tmp_path, tmp_path / "Applications" / "Neu.app") == str(rebuilt)


def test_installed_bundle_from_before_a_rename_takes_the_renamed_build(tmp_path: Path) -> None:
    release = tmp_path / "apps" / "desktop" / "release" / "mac-arm64"
    (release / "Neu.app").mkdir(parents=True)

    assert _rebuilt(tmp_path, tmp_path / "Applications" / "Alt.app") == str(release / "Neu.app")
    assert _rebuilt(tmp_path / "leer", tmp_path / "Applications" / "Alt.app") == ""
