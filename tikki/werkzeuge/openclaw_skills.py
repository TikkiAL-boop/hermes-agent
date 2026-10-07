"""Tikki – OpenClaw-Skills (ClawHub) bereitstellen: ganzer Katalog durchsuchbar, Skills auf Abruf.

ClawHub hat zehntausende Skills. Alle in jedes Profil zu installieren würde jeden Aufruf
aufblähen und fremde Anweisungen ungeprüft verteilen. Stattdessen:

    katalog                 den ganzen ClawHub-Katalog lokal ablegen (~/.tikki/openclaw-katalog.json)
    suchen <frage>          im lokalen Katalog suchen (ohne Katalog: live bei ClawHub)
    installieren <slug…>    in die gemeinsame Bibliothek (Profil „openclaw“) installieren –
                            durch Hermes' Sicherheitsprüfung, blockierte Skills bleiben draußen
    beliebteste <n>         die ersten n Skills installieren (nach Downloads, sonst ClawHub-Reihenfolge)

Alle Rollen mit dem Werkzeug „skills“ sehen die Bibliothek über ``skills.external_dirs``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

BIBLIOTHEK = "openclaw"


def _katalog_pfad() -> Path:
    return Path(os.environ.get("TIKKI_HOME") or Path.home() / ".tikki").expanduser() / "openclaw-katalog.json"


def _eintrag(meta) -> dict:
    extra = getattr(meta, "extra", None) or {}
    stats = extra.get("stats") if isinstance(extra.get("stats"), dict) else {}
    return {
        "slug": str(meta.identifier).removeprefix("clawhub/"),
        "name": meta.name,
        "beschreibung": meta.description or "",
        "tags": list(getattr(meta, "tags", None) or []),
        "downloads": int(extra.get("downloads") or stats.get("downloads") or 0),
    }


def katalog_laden() -> list[dict]:
    """Den ganzen ClawHub-Katalog holen (Hermes' eigene ClawHub-Quelle, Cursor-Paginierung)."""
    from tools.skills_hub_clawhub import ClawHubSource

    return [_eintrag(meta) for meta in ClawHubSource()._load_catalog_index(max_items=0)]


def katalog_speichern(eintraege: list[dict]) -> Path:
    pfad = _katalog_pfad()
    pfad.parent.mkdir(parents=True, exist_ok=True)
    tmp = pfad.with_suffix(".tmp")
    tmp.write_text(json.dumps(eintraege, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, pfad)
    return pfad


def suchen(frage: str, eintraege: list[dict], anzahl: int = 10) -> list[dict]:
    """Einfache Rangfolge: Treffer im Namen zählen vierfach, in Tags doppelt, im Text einfach, dann Beliebtheit."""
    woerter = [w for w in re.findall(r"[\wäöüß]{2,}", frage.lower())]
    if not woerter:
        return []
    bewertet = []
    for e in eintraege:
        name, text, tags = e["name"].lower() + " " + e["slug"].lower(), e["beschreibung"].lower(), " ".join(e["tags"]).lower()
        punkte = sum(4 * (w in name) + 2 * (w in tags) + (w in text) for w in woerter)
        if punkte:
            bewertet.append((punkte, e.get("downloads", 0), e))
    bewertet.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [e for _, _, e in bewertet[:anzahl]]


def _live_suchen(frage: str, anzahl: int) -> list[dict]:
    from tools.skills_hub_clawhub import ClawHubSource

    return [_eintrag(meta) for meta in ClawHubSource().search(frage, limit=anzahl)]


def _hermes() -> str:
    return os.environ.get("TIKKI_HERMES") or "hermes"


def bibliothek_sicherstellen() -> None:
    """Das Profil „openclaw“ trägt die Bibliothek; ohne mitgelieferte Skills, ohne Alias."""
    from hermes_cli.profiles import get_profile_dir

    if not get_profile_dir(BIBLIOTHEK).is_dir():
        subprocess.run(
            [_hermes(), "profile", "create", BIBLIOTHEK, "--no-alias", "--no-skills",
             "--description", "Tikki: OpenClaw-Skill-Bibliothek für alle Rollen"],
            check=True, capture_output=True, text=True,
        )


def installieren(slugs: list[str]) -> list[tuple[str, bool, str]]:
    bibliothek_sicherstellen()
    ergebnis = []
    for slug in slugs:
        kennung = slug if slug.startswith("clawhub/") else f"clawhub/{slug}"
        lauf = subprocess.run(
            [_hermes(), "-p", BIBLIOTHEK, "skills", "install", kennung, "--yes"],
            capture_output=True, text=True, errors="replace",
        )
        ausgabe = (lauf.stdout + lauf.stderr).strip()
        ergebnis.append((slug, lauf.returncode == 0 and "blocked" not in ausgabe.lower(), ausgabe[-300:]))
    return ergebnis


def _katalog_lesen() -> list[dict] | None:
    try:
        return json.loads(_katalog_pfad().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="openclaw_skills", description=__doc__.split("\n\n")[0])
    unter = parser.add_subparsers(dest="befehl", required=True)
    unter.add_parser("katalog")
    p_suchen = unter.add_parser("suchen")
    p_suchen.add_argument("frage")
    p_suchen.add_argument("--anzahl", type=int, default=10)
    p_inst = unter.add_parser("installieren")
    p_inst.add_argument("slugs", nargs="+")
    p_beliebt = unter.add_parser("beliebteste")
    p_beliebt.add_argument("anzahl", type=int)
    args = parser.parse_args(argv)

    if args.befehl == "katalog":
        eintraege = katalog_laden()
        print(f"{len(eintraege)} Skills im Katalog: {katalog_speichern(eintraege)}")
        return 0 if eintraege else 1
    if args.befehl == "suchen":
        katalog = _katalog_lesen()
        treffer = suchen(args.frage, katalog, args.anzahl) if katalog else _live_suchen(args.frage, args.anzahl)
        for e in treffer:
            print(f"{e['slug']}\t{e['name']}\t{e['beschreibung'][:120]}")
        if not treffer:
            print("Keine Treffer." + ("" if katalog else " (Kein lokaler Katalog und ClawHub nicht erreichbar?)"))
        return 0
    if args.befehl == "beliebteste":
        katalog = _katalog_lesen() or katalog_laden()
        slugs = [e["slug"] for e in sorted(katalog, key=lambda e: e.get("downloads", 0), reverse=True)[: args.anzahl]]
    else:
        slugs = args.slugs
    fehler = 0
    for slug, ok, meldung in installieren(slugs):
        print(f"{'✓' if ok else '✗'} {slug}" + ("" if ok else f"  ({meldung.splitlines()[-1] if meldung else 'Fehler'})"))
        fehler += not ok
    return 1 if fehler and fehler == len(slugs) else 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    sys.exit(main())
