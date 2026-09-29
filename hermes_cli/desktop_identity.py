"""The packaged desktop app's name on disk.

electron-builder names the bundle and executable after ``productName`` in
``apps/desktop/package.json`` (``<name>.app/Contents/MacOS/<name>``,
``<name>.exe``, ``linux-unpacked/<name>``), and Electron reads the same field
for its runtime app name. Every lookup of a built or installed app tries the
product name first and the historical ``Hermes`` name second, so a renamed
product is found by ``hermes desktop``, ``hermes update`` and the installer
while bundles from before the rename keep working.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_PACKAGE_JSON = Path(__file__).resolve().parents[1] / "apps" / "desktop" / "package.json"
_DEFAULT = "Hermes"


def desktop_app_names() -> tuple[str, ...]:
    """Names to probe for a built or installed app: the product name, then the historical one."""
    name = desktop_app_name()
    return (name,) if name == _DEFAULT else (name, _DEFAULT)


@lru_cache(maxsize=1)
def desktop_app_name() -> str:
    """``productName`` of the desktop package; the historical name when the tree has no desktop app."""
    try:
        name = json.loads(_PACKAGE_JSON.read_text(encoding="utf-8")).get("productName")
    except (OSError, ValueError):
        return _DEFAULT
    return name if isinstance(name, str) and name.strip() else _DEFAULT
