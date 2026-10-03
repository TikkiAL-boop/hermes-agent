"""The desktop app is found under the name electron-builder gives it (``productName``).

Regression: a renamed product (``productName: "Tikki"``) packaged ``linux-unpacked/Tikki``
while the lookup only knew ``hermes``/``Hermes``, so ``install.sh --include-desktop`` and
``hermes update`` failed with "Desktop build produced no launchable app".
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hermes_cli.desktop_identity import desktop_app_name
from hermes_cli.main_desktop import _desktop_packaged_executable_in


def test_app_name_is_the_desktop_package_product_name() -> None:
    package = Path(__file__).resolve().parents[2] / "apps" / "desktop" / "package.json"
    assert desktop_app_name() == json.loads(package.read_text(encoding="utf-8"))["productName"]


@pytest.mark.platforms("linux")
def test_packaged_executable_named_after_product_is_found(tmp_path: Path) -> None:
    exe = tmp_path / "linux-unpacked" / desktop_app_name()
    exe.parent.mkdir()
    exe.write_bytes(b"")

    assert _desktop_packaged_executable_in(tmp_path) == exe
