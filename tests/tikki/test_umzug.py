"""Umzug auf einen anderen Rechner: was ``umzug.sh packen`` mitnimmt, kommt mit ``auspacken`` heil an.

Das echte Skript läuft zwischen zwei erfundenen Rechnern (zwei HOME-Ordner unter ``tmp_path``),
ohne Code-Teil. Verträge: Die Räume gehören nach dem Umzug dem neuen Rechner (``install_id``), der
Taktgeber vergisst nichts, eine Datenbank kommt mit allem an, was beim Packen noch im WAL stand,
vorhandener Zustand wird nie stillschweigend ersetzt, und ``--ohne-schluessel`` hält Wort.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import tarfile
from pathlib import Path

import pytest

SKRIPT = Path(__file__).resolve().parents[2] / "tikki" / "werkzeuge" / "umzug.sh"

pytestmark = pytest.mark.platforms("posix")


def _umzug(home: Path, *args: str, cwd: Path) -> subprocess.CompletedProcess:
    env = {
        "PATH": os.environ["PATH"], "HOME": str(home), "HERMES_HOME": str(home / ".hermes"),
        "TIKKI_HOME": str(home / ".tikki"), "LANG": "C.UTF-8",
    }
    return subprocess.run(["bash", str(SKRIPT), *args], cwd=cwd, env=env, capture_output=True, text=True)


@pytest.fixture
def alter_rechner(tmp_path: Path):
    """Ein Rechner mit Tikki: Hermes-Wurzel, ein Profil, ~/.tikki, App-Daten – und einem Gateway,
    das die Raum-Datenbank gerade offen hat (ein Eintrag steht nur im WAL)."""
    home = tmp_path / "u" / "t"
    wurzel, tikki, app = home / ".hermes", home / ".tikki", home / ".config" / "Tikki"
    for ordner in (wurzel / "profiles" / "tikki", wurzel / "tikki", tikki / "dienste" / "honcho",
                   tikki / "dienste" / "tencentdb" / "quelle", app):
        ordner.mkdir(parents=True)
    (wurzel / "install_id").write_text("alt-rechner-0001\n", encoding="utf-8")
    (wurzel / "config.yaml").write_text(f"skills:\n  external_dirs:\n    - {home}/.hermes/hermes-agent/skills\n", encoding="utf-8")
    (wurzel / ".env").write_text("XAI_API_KEY=xai-geheim\n", encoding="utf-8")
    (wurzel / "tikki" / "takt.json").write_text(json.dumps({"tikki-raum": {"gesehen": 41}}), encoding="utf-8")
    (wurzel / "profiles" / "tikki" / "config.yaml").write_text("model:\n  default: x\n", encoding="utf-8")
    (wurzel / "profiles" / "tikki" / ".env").write_text("TIKKI_MAIL_PASSWORD=mail-geheim\n", encoding="utf-8")
    (tikki / "briefing.json").write_text('{"zuletzt": 1}', encoding="utf-8")
    (tikki / "dienste" / "honcho" / ".env").write_text("LLM_OPENAI_API_KEY=xai-geheim\n", encoding="utf-8")
    (tikki / "dienste" / "tencentdb" / "system.key").write_text("tdai-geheim\n", encoding="utf-8")
    (tikki / "dienste" / "tencentdb" / "quelle" / "README.md").write_text("Quellklon", encoding="utf-8")
    (app / "tikki-mail.json").write_text('{"password": "mail-geheim"}', encoding="utf-8")
    (app / "window-state.json").write_text("{}", encoding="utf-8")
    gateway = sqlite3.connect(wurzel / "shared-state.db")
    gateway.execute("PRAGMA journal_mode=WAL")
    gateway.execute("PRAGMA wal_autocheckpoint=0")
    gateway.execute("CREATE TABLE raeume (name TEXT)")
    gateway.execute("INSERT INTO raeume VALUES ('Urlaub Ostsee')")
    gateway.commit()
    yield home
    gateway.close()


def test_umzug_bringt_kennung_takt_und_eine_heile_datenbank_auf_den_neuen_rechner(alter_rechner: Path, tmp_path: Path) -> None:
    arbeit = tmp_path / "schreibtisch"
    arbeit.mkdir()
    gepackt = _umzug(alter_rechner, "packen", "mein.tar.gz", "--ohne-code", cwd=arbeit)
    assert gepackt.returncode == 0, gepackt.stderr + gepackt.stdout
    archiv = arbeit / "mein.tar.gz"  # ein relatives Ziel landet dort, wo der Mensch steht
    assert archiv.is_file() and archiv.stat().st_mode & 0o077 == 0

    # Der neue Benutzername beginnt wie der alte (…/u/t → …/u/thorsten).
    neu = tmp_path / "u" / "thorsten"
    neu.mkdir()
    ausgepackt = _umzug(neu, "auspacken", str(archiv), cwd=tmp_path)
    assert ausgepackt.returncode == 0, ausgepackt.stderr + ausgepackt.stdout

    wurzel = neu / ".hermes"
    assert (wurzel / "install_id").read_text(encoding="utf-8") == (alter_rechner / ".hermes" / "install_id").read_text(encoding="utf-8")
    assert json.loads((wurzel / "tikki" / "takt.json").read_text(encoding="utf-8")) == {"tikki-raum": {"gesehen": 41}}
    db = sqlite3.connect(wurzel / "shared-state.db")
    try:
        assert db.execute("SELECT name FROM raeume").fetchall() == [("Urlaub Ostsee",)]
    finally:
        db.close()
    assert f"- {neu}/.hermes/hermes-agent/skills\n" in (wurzel / "config.yaml").read_text(encoding="utf-8")
    assert not (neu / ".tikki" / "dienste" / "tencentdb" / "quelle").exists()  # Quellklone holt das Dienst-Skript neu


def test_auspacken_ersetzt_vorhandenen_zustand_nur_auf_ausdruecklichen_wunsch(alter_rechner: Path, tmp_path: Path) -> None:
    """Ein Rechner mit normalem Hermes hat kein einziges Rollenprofil – seine config.yaml, seine
    Schlüssel und eine liegengebliebene WAL-Datei dürfen trotzdem nicht stillschweigend weichen."""
    archiv = tmp_path / "umzug.tar.gz"
    assert _umzug(alter_rechner, "packen", str(archiv), "--ohne-code", cwd=tmp_path).returncode == 0
    neu = tmp_path / "neu"
    (neu / ".hermes").mkdir(parents=True)
    (neu / ".hermes" / "config.yaml").write_text("model:\n  default: meins\n", encoding="utf-8")
    (neu / ".hermes" / "shared-state.db-wal").write_bytes(b"alter Stand eines anderen Speichers")

    abgelehnt = _umzug(neu, "auspacken", str(archiv), cwd=tmp_path)

    assert abgelehnt.returncode != 0 and "config.yaml" in abgelehnt.stderr
    assert (neu / ".hermes" / "config.yaml").read_text(encoding="utf-8") == "model:\n  default: meins\n"
    assert not (neu / ".hermes" / "install_id").exists() and not (neu / ".tikki").exists()

    assert _umzug(neu, "auspacken", str(archiv), "--ueberschreiben", cwd=tmp_path).returncode == 0
    assert not (neu / ".hermes" / "shared-state.db-wal").exists()
    db = sqlite3.connect(neu / ".hermes" / "shared-state.db")
    try:
        assert db.execute("SELECT name FROM raeume").fetchall() == [("Urlaub Ostsee",)]
    finally:
        db.close()


def test_ohne_schluessel_traegt_das_archiv_kein_geheimnis(alter_rechner: Path, tmp_path: Path) -> None:
    archiv = tmp_path / "ohne.tar.gz"
    assert _umzug(alter_rechner, "packen", str(archiv), "--ohne-code", "--ohne-schluessel", cwd=tmp_path).returncode == 0

    with tarfile.open(archiv) as tar:
        namen = tar.getnames()
        inhalt = b"".join(tar.extractfile(m).read() for m in tar.getmembers() if m.isfile())
    assert not [n for n in namen if Path(n).name in {".env", "tikki-mail.json"} or n.endswith(".key")]
    assert b"geheim" not in inhalt
    assert any(n.endswith("zustand/app/window-state.json") for n in namen)  # der Rest der App-Daten zieht um
