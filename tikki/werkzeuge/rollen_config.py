"""Tikki – Profilkonfiguration einer Rolle aus Katalog und Vorlage erzeugen.

Wird von ``rollen-einrichten.sh`` aufgerufen, bevorzugt über den Hermes-Starter
(``hermes --run-module tikki.werkzeuge.rollen_config``): dann laufen wir im
Hermes-venv (ruamel.yaml ist da) und kennen den aktuellen Konfigurationsstand.
Ohne Hermes im Pfad tut es auch ein Python mit ruamel.yaml; die Version wird
dann nicht gestempelt und Hermes holt das beim ersten Start nach.

Unterbefehle (alle Pfade absolut):

    --pruefen                                      "ok", wenn ruamel.yaml importierbar ist
    zeilen <katalog>                               slug<TAB>name<TAB>port je Rolle
    vorschau <katalog> <vorlage> <slug>            eine Zeile, was geschrieben würde
    schreiben <katalog> <vorlage> <slug> <ziel>    config.yaml schreiben, wenn abweichend
    honcho <vorlage-honcho> <slug> <ziel>         honcho.json der Rolle schreiben, wenn abweichend
"""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path


def _katalog(pfad: str) -> list[dict]:
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def _rolle(katalog: str, slug: str) -> dict:
    for eintrag in _katalog(katalog):
        if eintrag["slug"] == slug:
            return eintrag
    raise SystemExit(f"Rolle {slug!r} steht nicht in {katalog}")


def _modelle(rolle: dict) -> tuple[tuple[str, str], tuple[str, str]]:
    primary = tuple(rolle["modell"]["primary"].split("/", 1))
    fallback = tuple(rolle["modell"]["fallback"].split("/", 1))
    return primary, fallback  # type: ignore[return-value]


def _einmischen(ziel, zusatz: dict) -> None:
    """Rollen-eigene Einstellungen aus dem Katalog (``einstellungen``) tief einmischen."""
    for schluessel, wert in zusatz.items():
        if isinstance(wert, dict) and isinstance(ziel.get(schluessel), dict):
            _einmischen(ziel[schluessel], wert)
        else:
            ziel[schluessel] = wert


def aktuelle_config_version() -> int | None:
    """Der Stand, den Hermes selbst stempeln würde. Ohne Hermes-Umgebung: None.

    Ohne Stempel stuft Hermes die Datei als unversioniert ein, stempelt sie beim
    ersten Start und schreibt sie neu; das Skript sähe danach eine Abweichung
    und würde sie zurückdrehen. Mit dem Stempel bleibt die Datei stabil.
    """
    try:
        from hermes_cli.config_defaults import DEFAULT_CONFIG
    except Exception:
        return None
    version = DEFAULT_CONFIG.get("_config_version")
    return int(version) if isinstance(version, int) else None


def rollen_config(katalog: str, vorlage: str, slug: str):
    """Vorlage laden und mit Modellen, Werkzeugen und Port der Rolle füllen."""
    from ruamel.yaml import YAML

    rolle = _rolle(katalog, slug)
    yaml = YAML()
    yaml.preserve_quotes = True
    with open(vorlage, encoding="utf-8") as f:
        cfg = yaml.load(f)

    (p_prov, p_model), (f_prov, f_model) = _modelle(rolle)
    version = aktuelle_config_version()
    if version is not None:
        cfg.insert(0, "_config_version", version)
    cfg["model"]["provider"] = p_prov
    cfg["model"]["default"] = p_model
    cfg["fallback_providers"] = [{"provider": f_prov, "model": f_model}] + [
        {"provider": prov, "model": model}
        for prov, model in (eintrag.split("/", 1) for eintrag in rolle["modell"].get("weitere", []))
    ]
    cfg.setdefault("approvals", {})["mode"] = rolle.get("freigabe", "smart")
    werkzeuge = list(rolle.get("werkzeuge", []))
    cfg.setdefault("platform_toolsets", {})
    cfg["platform_toolsets"]["api_server"] = list(werkzeuge)
    cfg["platform_toolsets"]["cli"] = list(werkzeuge)
    api = cfg.setdefault("platforms", {}).setdefault("api_server", {})
    api["enabled"] = True
    api.setdefault("extra", {})["port"] = int(rolle["port"])
    api["extra"].setdefault("host", "127.0.0.1")
    # Delegation nur für Rollen, die sie im Katalog haben
    if "delegation" not in werkzeuge:
        cfg.pop("delegation", None)
    _einmischen(cfg, rolle.get("einstellungen") or {})

    buf = io.StringIO()
    yaml.dump(cfg, buf)
    return buf.getvalue()


def schreiben(katalog: str, vorlage: str, slug: str, ziel: str) -> bool:
    """Schreibt config.yaml nur, wenn sich der Inhalt ändert. True = geschrieben."""
    neu = rollen_config(katalog, vorlage, slug)
    zielpfad = Path(ziel)
    alt = zielpfad.read_text(encoding="utf-8") if zielpfad.exists() else None
    if alt == neu:
        return False
    tmp = zielpfad.with_name(zielpfad.name + ".tmp")
    tmp.write_text(neu, encoding="utf-8")
    os.replace(tmp, zielpfad)
    return True


def honcho_config(vorlage: str, slug: str) -> str:
    """Die Honcho-Vorlage mit dem AI-Peer der Rolle; der Rest gilt für alle Rollen gleich."""
    with open(vorlage, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg.pop("_hinweis", None)
    cfg["aiPeer"] = slug
    return json.dumps(cfg, ensure_ascii=False, indent=2) + "\n"


def honcho_schreiben(vorlage: str, slug: str, ziel: str) -> bool:
    """Schreibt honcho.json nur, wenn sich der Inhalt ändert. True = geschrieben."""
    neu = honcho_config(vorlage, slug)
    zielpfad = Path(ziel)
    alt = zielpfad.read_text(encoding="utf-8") if zielpfad.exists() else None
    if alt == neu:
        return False
    tmp = zielpfad.with_name(zielpfad.name + ".tmp")
    tmp.write_text(neu, encoding="utf-8")
    os.replace(tmp, zielpfad)
    return True


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    befehl, rest = argv[0], argv[1:]
    if befehl == "--pruefen":
        import ruamel.yaml  # noqa: F401

        print("ok")
        return 0
    if befehl == "zeilen":
        (katalog,) = rest
        for eintrag in _katalog(katalog):
            print(f"{eintrag['slug']}\t{eintrag['name']}\t{eintrag['port']}")
        return 0
    if befehl == "vorschau":
        katalog, vorlage, slug = rest
        rolle = _rolle(katalog, slug)
        (p_prov, p_model), (f_prov, f_model) = _modelle(rolle)
        version = aktuelle_config_version()
        stempel = f" _config_version={version}" if version is not None else ""
        print(f"  [dry-run] config.yaml: model={p_prov}/{p_model} fallback={f_prov}/{f_model} "
              f"port={rolle['port']} approvals={rolle['freigabe']} toolsets={rolle['werkzeuge']}{stempel}")
        return 0
    if befehl == "schreiben":
        katalog, vorlage, slug, ziel = rest
        if schreiben(katalog, vorlage, slug, ziel):
            print(f"  config.yaml geschrieben: {ziel}")
        else:
            print("  config.yaml unverändert")
        return 0
    if befehl == "honcho":
        vorlage, slug, ziel = rest
        if honcho_schreiben(vorlage, slug, ziel):
            print(f"  honcho.json geschrieben: {ziel}")
        else:
            print("  honcho.json unverändert")
        return 0
    print(f"Unbekannter Befehl: {befehl}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
