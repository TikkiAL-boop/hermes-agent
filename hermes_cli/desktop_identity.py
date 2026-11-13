"""The packaged desktop app's identity on disk: its name and its app id.

electron-builder names the bundle and executable after ``productName`` in
``apps/desktop/package.json`` (``<name>.app/Contents/MacOS/<name>``,
``<name>.exe``, ``linux-unpacked/<name>``), and Electron reads the same field
for its runtime app name. Every lookup of a built or installed app tries the
product name first and the historical ``Hermes`` name second, so a renamed
product is found by ``hermes desktop``, ``hermes update`` and the installer
while bundles from before the rename keep working.

The app id (``apps/desktop/product-identity.cjs`` ``appId``: the Wayland app_id
on Linux, the Chromium cache folder on macOS) follows the same rule. It is
computed in JavaScript, so the stable-build id of a renamed product is mirrored
in ``_APP_IDS``; ``tests/hermes_cli/test_linux_desktop_entry.py`` compares the
mirror with the real build identity.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_PACKAGE_JSON = Path(__file__).resolve().parents[1] / "apps" / "desktop" / "package.json"
_DEFAULT = "Hermes"
_DEFAULT_APP_ID = "com.nousresearch.hermes"
_APP_IDS = {"Tikki": "team.tikki.tikki"}


def desktop_app_names() -> tuple[str, ...]:
    """Names to probe for a built or installed app: the product name, then the historical one."""
    name = desktop_app_name()
    return (name,) if name == _DEFAULT else (name, _DEFAULT)


def desktop_app_id() -> str:
    """App id of the stable desktop build of this product."""
    return _APP_IDS.get(desktop_app_name(), _DEFAULT_APP_ID)


def desktop_app_ids() -> tuple[str, ...]:
    """App ids that may have left state behind: the product's, then the historical one."""
    app_id = desktop_app_id()
    return (app_id,) if app_id == _DEFAULT_APP_ID else (app_id, _DEFAULT_APP_ID)


@lru_cache(maxsize=1)
def desktop_app_name() -> str:
    """``productName`` of the desktop package; the historical name when the tree has no desktop app."""
    try:
        name = json.loads(_PACKAGE_JSON.read_text(encoding="utf-8")).get("productName")
    except (OSError, ValueError):
        return _DEFAULT
    return name if isinstance(name, str) and name.strip() else _DEFAULT
