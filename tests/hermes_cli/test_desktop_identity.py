"""The desktop app is found under the identity electron-builder gives it (``productName``, app id).

Regression: a renamed product (``productName: "Tikki"``) packaged ``linux-unpacked/Tikki``
while the lookup only knew ``hermes``/``Hermes``, so ``install.sh --include-desktop`` and
``hermes update`` failed with "Desktop build produced no launchable app". The same rename left
the Linux launcher entry, the macOS cache sweep and the installed-bundle launch path on the
historical identity.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hermes_cli import desktop_identity, linux_desktop_entry, main_desktop, uninstall
from hermes_cli.desktop_identity import desktop_app_id, desktop_app_ids, desktop_app_name, desktop_app_names
from hermes_cli.main_desktop import _desktop_packaged_executable_in


@pytest.fixture
def package_json(tmp_path: Path, monkeypatch):
    """A desktop package.json the test controls; the cached name is dropped before and after."""
    path = tmp_path / "package.json"
    monkeypatch.setattr(desktop_identity, "_PACKAGE_JSON", path)
    desktop_app_name.cache_clear()
    yield path
    desktop_app_name.cache_clear()


def test_renamed_product_is_probed_before_the_historical_name(package_json: Path) -> None:
    package_json.write_text(json.dumps({"productName": "Nachbar"}), encoding="utf-8")

    names = desktop_app_names()

    assert names[0] == "Nachbar" and len(names) == 2
    desktop_app_name.cache_clear()
    package_json.unlink()
    assert desktop_app_names() == names[1:]  # the second probe IS the fallback name, once


@pytest.mark.parametrize("content", ["{kaputt", json.dumps({"productName": "  "}), json.dumps({"productName": 7})])
def test_unusable_package_falls_back_to_one_name_and_one_app_id(package_json: Path, content: str) -> None:
    package_json.write_text(content, encoding="utf-8")

    assert len(desktop_app_names()) == 1
    assert desktop_app_ids() == (desktop_app_id(),)


@pytest.mark.platforms("linux")
def test_packaged_executable_named_after_product_is_found(tmp_path: Path) -> None:
    exe = tmp_path / "linux-unpacked" / desktop_app_name()
    exe.parent.mkdir()
    exe.write_bytes(b"")

    assert _desktop_packaged_executable_in(tmp_path) == exe


def test_installed_bundle_under_an_earlier_name_launches_the_rebuilt_executable() -> None:
    """An update-owned bundle refreshed with a renamed build holds ``Contents/MacOS/<product>``."""
    rebuilt = Path("/repo/apps/desktop/release/mac-arm64/Neu.app/Contents/MacOS/Neu")

    target = main_desktop._installed_bundle_executable(Path("/Applications/Alt.app"), rebuilt)

    assert target == Path("/Applications/Alt.app/Contents/MacOS/Neu")


def test_launcher_entry_under_an_earlier_app_id_is_retired_only_when_it_is_ours(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(linux_desktop_entry, "desktop_app_ids", lambda: ("team.neu.app", "org.alt.app"))
    launcher = "/home/u/.local/bin/hermes desktop"
    earlier = tmp_path / "org.alt.app.desktop"
    earlier.write_text(f"[Desktop Entry]\nName=Hermes\nExec={launcher}\n", encoding="utf-8")

    linux_desktop_entry._remove_renamed_app_id_entries(tmp_path, "/opt/anderes/hermes desktop")
    assert earlier.is_file()  # a separately installed build of the historical product keeps its entry

    linux_desktop_entry._remove_renamed_app_id_entries(tmp_path, launcher)
    assert not earlier.exists()


def test_macos_cache_sweep_covers_every_name_and_app_id_the_product_can_have_used() -> None:
    swept = {path.name for path in uninstall._macos_cache_leftover_dirs()}

    assert {*desktop_app_names(), *desktop_app_ids()} <= swept
