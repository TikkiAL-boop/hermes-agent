"""Tikki – Profilkonfiguration einer Rolle aus Katalog und Vorlage erzeugen.

Wird von ``rollen-einrichten.sh`` aufgerufen, bevorzugt über den Hermes-Starter
(``hermes --run-module tikki.werkzeuge.rollen_config``): dann laufen wir im
Hermes-venv (ruamel.yaml ist da) und kennen den aktuellen Konfigurationsstand.
Ohne Hermes im Pfad tut es auch ein Python mit ruamel.yaml; die Version wird
dann nicht gestempelt und Hermes holt das beim ersten Start nach.

Unterbefehle (alle Pfade absolut):

    --pruefen                                      "ok", wenn ruamel.yaml importierbar ist
    profilwurzel                                   der Ordner, in dem Hermes die Profile anlegt
    zeilen <katalog>                               slug<TAB>name<TAB>port je Rolle
    vorschau <katalog> <vorlage> <slug>            eine Zeile, was geschrieben würde
    schreiben <katalog> <vorlage> <slug> <ziel> [--modelle-zuruecksetzen] [--frisch]
                                                   config.yaml auf den Stand von Katalog und Vorlage
                                                   bringen; eine vorhandene Datei wird gemischt: was
                                                   im Profil geändert wurde (Hermes-Einstellungen,
                                                   hermes tools, hermes model), bleibt. --frisch
                                                   ersetzt sie (eben angelegtes Profil),
                                                   --modelle-zuruecksetzen erzwingt die Katalogmodelle
    seele <quelle> <ziel> [--zuruecksetzen] [--nur-ansehen]
                                                   SOUL.md der Rolle auf die Fassung des Repos bringen,
                                                   solange sie im Profil niemand geändert hat (Admin →
                                                   Regeln); --zuruecksetzen erzwingt die Repo-Fassung
    honcho <vorlage-honcho> <slug> <ziel>         honcho.json der Rolle schreiben, wenn abweichend
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
from pathlib import Path

#: Toolsets, die die Tikki-Plugins anmelden (``tikki/plugins/*``); eine Rolle bekommt davon nur,
#: was ihr Katalog nennt. Der Vertrag mit den Plugins steht in ``tests/tikki/test_plugins_echt.py``.
PLUGIN_TOOLSETS = ("briefing", "gedaechtnis", "modelle", "post", "raeume", "ressourcen")
#: Oberflächen, auf denen jede Rolle läuft: HTTP-Dienst und Raum-Runden (``api_server``), Terminal
#: und App (``cli``), Daueraufträge (``cron``).
OBERFLAECHEN = ("api_server", "cli", "cron")
#: Neben jeder config.yaml: was Tikki zuletzt festgelegt hat – die Basis für das Mischen.
STEMPEL = "tikki-rolle.json"
_FEHLT = object()


def _vererben(eintraege: list[dict]) -> list[dict]:
    """Ein Klon (``klon_von``) erbt alles vom Original und überschreibt nur, was er selbst nennt
    (Modellkette, Port, Name) – so bleibt ein Raumleiter-Klon derselbe Raumleiter mit anderem Modell."""
    nach_slug = {e["slug"]: e for e in eintraege}
    aus = []
    for e in eintraege:
        quelle = nach_slug.get(e.get("klon_von") or "")
        aus.append({**quelle, **e} if quelle else e)
    return aus


def _katalog(pfad: str) -> list[dict]:
    with open(pfad, encoding="utf-8") as f:
        return _vererben(json.load(f))


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


def profilwurzel() -> Path:
    """Der Ordner, in dem ``hermes profile create`` Profile anlegt – von Hermes erfragt, damit
    Skripte nie ``~/.hermes`` annehmen (eigenes ``HERMES_HOME``, Docker-Wurzel)."""
    from hermes_constants import get_default_hermes_root

    return get_default_hermes_root() / "profiles"


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


def _yaml():
    """Derselbe Emitter wie Hermes' config.yaml-Schreiber (``hermes_yaml.roundtrip_yaml``): sonst
    schreibt Hermes die Datei beim ersten ``hermes model`` mit anderer Einrückung neu, und der
    nächste Installer-Lauf sähe eine Abweichung und drehte alles zurück."""
    try:
        from hermes_yaml import roundtrip_yaml

        return roundtrip_yaml()
    except ImportError:
        from ruamel.yaml import YAML

        yaml = YAML(typ="rt")
        yaml.width = 2**31 - 1
        yaml.preserve_quotes = True
        yaml.allow_unicode = True
        yaml.default_flow_style = False
        yaml.indent(mapping=2, sequence=4, offset=2)
        return yaml


def soll_config(katalog: str, vorlage: str, slug: str, ziel: str | None = None,
                oberflaechen: tuple[str, ...] = OBERFLAECHEN):
    """Was Tikki für die Rolle festlegt: die Vorlage, gefüllt mit Modellen, Werkzeugen und Port aus
    dem Katalog (als Dokument mit den Kommentaren der Vorlage).

    ``ziel`` (Pfad der config.yaml) verankert die Skill-Ordner: Tikki-Skills, alle eingebauten
    Hermes-Skills und die OpenClaw-Bibliothek im Profil ``openclaw``.
    """
    rolle = _rolle(katalog, slug)
    with open(vorlage, encoding="utf-8") as f:
        cfg = _yaml().load(f)

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
    # Dieselbe Werkzeugliste auf jeder Oberfläche, auf der die Rolle läuft – auch in ihren
    # Daueraufträgen: ohne Eintrag für ``cron`` liefe der Rundgang des Wachhalters mit Hermes'
    # vollem Cron-Satz. Und jedes Plugin-Toolset als „bekannt“: sonst hält Hermes es für neu und
    # schaltet es dort ein, auch bei Rollen, die es im Katalog nicht haben
    # (hermes_cli/tools_config.py::_enabled_plugin_toolsets).
    cfg["platform_toolsets"] = {o: list(werkzeuge) for o in oberflaechen}
    cfg["known_plugin_toolsets"] = {o: sorted(PLUGIN_TOOLSETS) for o in oberflaechen}
    api = cfg.setdefault("platforms", {}).setdefault("api_server", {})
    api["enabled"] = True
    api.setdefault("extra", {})["port"] = int(rolle["port"])
    api["extra"].setdefault("host", "127.0.0.1")
    # Delegation nur für Rollen, die sie im Katalog haben
    if "delegation" not in werkzeuge:
        cfg.pop("delegation", None)
    if "skills" in werkzeuge and ziel:
        repo = Path(katalog).resolve().parents[2]
        profile = Path(ziel).resolve().parent.parent
        # Alle eingebauten Hermes-Skills als ein Ordner: folgen Git ohne Kopien.
        cfg.setdefault("skills", {})["external_dirs"] = [
            str(repo / "tikki" / "skills"),
            str(repo / "skills"),
            str(profile / "openclaw" / "skills"),
        ]
    _einmischen(cfg, rolle.get("einstellungen") or {})
    return cfg


# ─── Mischen: was Tikki festlegt, was der Mensch im Profil geändert hat ──────


def _schlicht(wert):
    """Ein YAML-Dokument als schlichte dicts/Listen (zum Vergleichen und für den Stempel)."""
    if isinstance(wert, dict):
        return {str(k): _schlicht(v) for k, v in wert.items()}
    if isinstance(wert, (list, tuple)):
        return [_schlicht(v) for v in wert]
    if isinstance(wert, (bool, int, float)) or wert is None:
        return wert
    return str(wert)


def _skalarliste(wert) -> bool:
    return isinstance(wert, list) and not any(isinstance(e, (dict, list)) for e in wert)


def _schnitt(ist, soll):
    """Der Teil von *ist*, den auch *soll* festlegt (gleiche Schlüssel, die Werte von *ist*)."""
    if isinstance(ist, dict) and isinstance(soll, dict):
        return {k: _schnitt(ist[k], soll[k]) for k in ist if k in soll}
    return ist


def _aenderungen(basis, soll, ist, pfad: tuple = ()) -> list[tuple[tuple, object]]:
    """Drei-Wege-Mischen: was an *ist* zu ändern ist, damit Tikkis neue Festlegung (*soll*) ankommt,
    ohne zu verlieren, was der Mensch seit dem letzten Lauf (*basis*) geändert hat.

    Je Wert: steht er noch so da, wie Tikki ihn zuletzt schrieb, folgt er *soll*; sonst bleibt er.
    Listen einfacher Werte (Werkzeuge, Plugins, Skill-Ordner) mischen je Eintrag. Rückgabe:
    ``(Pfad, Wert)`` je Änderung, ``_FEHLT`` als Wert heißt löschen.
    """
    if isinstance(soll, dict) and isinstance(ist, dict) and (basis is _FEHLT or isinstance(basis, dict)):
        basis = {} if basis is _FEHLT else basis
        aus: list[tuple[tuple, object]] = []
        for k in dict.fromkeys([*ist, *soll, *basis]):
            aus += _aenderungen(basis.get(k, _FEHLT), soll.get(k, _FEHLT), ist.get(k, _FEHLT), (*pfad, k))
        return aus
    if _skalarliste(soll) and _skalarliste(ist) and (basis is _FEHLT or _skalarliste(basis)):
        basis = [] if basis is _FEHLT else basis
        gemischt = [e for e in ist if e in soll or e not in basis] + [e for e in soll if e not in basis and e not in ist]
        return [] if gemischt == ist else [(pfad, gemischt)]
    return [(pfad, soll)] if ist == basis and soll != ist else []


def _kette(cfg: dict) -> tuple | None:
    """Die Modellkette einer config: (Anbieter, Modell, Ausweichmodelle); None ohne Hauptmodell."""
    modell = cfg.get("model")
    if not isinstance(modell, dict) or not modell.get("provider") or not modell.get("default"):
        return None
    ausweich = cfg.get("fallback_providers")
    return (str(modell["provider"]), str(modell["default"]), tuple(
        (str(e.get("provider")), str(e.get("model"))) for e in (ausweich if isinstance(ausweich, list) else [])
        if isinstance(e, dict)))


def _anwenden(doc, aenderungen: list[tuple[tuple, object]]) -> None:
    for pfad, wert in aenderungen:
        knoten = doc
        for schluessel in pfad[:-1]:
            if not isinstance(knoten.get(schluessel), dict):
                knoten[schluessel] = {}
            knoten = knoten[schluessel]
        if wert is _FEHLT:
            knoten.pop(pfad[-1], None)
        else:
            knoten[pfad[-1]] = wert


def _stempel_datei(pfad: Path) -> dict:
    """Der ganze Stempel: ``config`` (letzte Festlegung der config.yaml), ``seele`` (Prüfsumme der
    zuletzt eingerichteten SOUL.md). Fehlt er oder ist er unlesbar: leer."""
    try:
        daten = json.loads(pfad.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return daten if isinstance(daten, dict) else {}


def _stempel_lesen(pfad: Path) -> dict | None:
    config = _stempel_datei(pfad).get("config")
    return config if isinstance(config, dict) else None


def _ersetzen(pfad: Path, text: str) -> None:
    tmp = pfad.with_name(pfad.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, pfad)


def schreiben(katalog: str, vorlage: str, slug: str, ziel: str, *, modelle_zuruecksetzen: bool = False,
              frisch: bool = False) -> bool:
    """Die config.yaml der Rolle auf den Stand von Katalog und Vorlage bringen. True = geschrieben.

    Eine neue Datei (oder ``frisch``: ein eben angelegtes Profil, dessen config.yaml noch nichts von
    der Rolle weiß) ist die gefüllte Vorlage. Eine vorhandene wird gemischt (``_aenderungen``): was
    der Mensch im Profil geändert hat (Hermes-Einstellungen, ``hermes tools``, ``hermes config
    set``), bleibt; was Tikki zuletzt schrieb und nun anders festlegt, folgt. Tikkis letzte
    Festlegung steht als Stempel neben der Datei (``tikki-rolle.json``).

    Die Modellkette zählt als Ganzes: Sie folgt dem Katalog, solange der Mensch nicht davon
    abgewichen ist (``hermes model``, Admin → Modelle); ``modelle_zuruecksetzen`` erzwingt den
    Katalog. Ein Profil aus der Zeit vor dem Stempel behält ein vom Katalog abweichendes Modell –
    ob es gewählt wurde oder nur älter ist, lässt sich dort nicht mehr sagen.
    """
    zielpfad, stempelpfad = Path(ziel), Path(ziel).with_name(STEMPEL)
    yaml = _yaml()
    ist_doc = None
    if zielpfad.is_file() and not frisch:
        try:
            ist_doc = yaml.load(zielpfad.read_text(encoding="utf-8"))
        except Exception:
            ist_doc = None
    if not isinstance(ist_doc, dict):
        soll_doc = soll_config(katalog, vorlage, slug, ziel)
        puffer = io.StringIO()
        yaml.dump(soll_doc, puffer)
        neu_text = puffer.getvalue()
        geschrieben = not zielpfad.is_file() or zielpfad.read_text(encoding="utf-8") != neu_text
        if geschrieben:
            _ersetzen(zielpfad, neu_text)
        _stempeln(stempelpfad, config=_schlicht(soll_doc))
        return geschrieben

    ist = _schlicht(ist_doc)
    eigene = tuple(o for o in (ist.get("platform_toolsets") or {}) if o not in OBERFLAECHEN) \
        if isinstance(ist.get("platform_toolsets"), dict) else ()
    soll = _schlicht(soll_config(katalog, vorlage, slug, ziel, (*OBERFLAECHEN, *eigene)))
    for o in eigene:  # eine Oberfläche des Menschen (Telegram …): seine Werkzeugliste, aber kein Plugin-Leck
        soll["platform_toolsets"].pop(o)
    basis = _stempel_lesen(stempelpfad)
    stempel = json.loads(json.dumps(soll))
    kette_basis = _kette(basis if basis is not None else soll)
    if basis is None:
        basis = _schnitt(ist, soll)
    # Die Version stempelt und hebt Hermes selbst (Migration); eine vorhandene Datei gehört ihm.
    modellteile = ("model", "fallback_providers")
    for teil in (basis, soll, ist):
        for schluessel in ("_config_version", *modellteile):
            teil.pop(schluessel, None)
    aenderungen = _aenderungen(basis, soll, ist)
    kette_ist = _kette(_schlicht(ist_doc))
    if (modelle_zuruecksetzen or kette_ist is None or kette_ist == kette_basis) and kette_ist != _kette(stempel):
        aenderungen += [((teil,), stempel[teil]) for teil in modellteile]
    if aenderungen:
        _anwenden(ist_doc, aenderungen)
        puffer = io.StringIO()
        yaml.dump(ist_doc, puffer)
        _ersetzen(zielpfad, puffer.getvalue())
    _stempeln(stempelpfad, config=stempel)
    return bool(aenderungen)


def veraltet(katalog: str, vorlage: str, slug: str, ziel: str) -> bool:
    """Ob die Rolle nicht mehr eingerichtet wurde, seit Katalog oder Vorlage sich geändert haben:
    der Stempel neben der config.yaml ist nicht, was Tikki heute festlegen würde. So fällt auf,
    wenn ein Update den Code geholt hat (``/update``, der Knopf in der App), ohne die Rollen
    nachzuziehen – der Selbsttest fragt hier nach."""
    stempel = _stempel_lesen(Path(ziel).with_name(STEMPEL))
    if stempel is None:
        return True
    soll = _schlicht(soll_config(katalog, vorlage, slug, ziel))
    for teil in (soll, stempel):
        teil.pop("_config_version", None)  # die Version führt Hermes
        bekannt = teil.get("known_plugin_toolsets")
        if isinstance(bekannt, dict):  # Oberflächen, die der Mensch dazugenommen hat, zählen hier nicht
            teil["known_plugin_toolsets"] = {o: bekannt.get(o) for o in OBERFLAECHEN}
    return soll != stempel


def _stempeln(pfad: Path, **teile) -> None:
    """Teile des Stempels festhalten (``config``, ``seele``); was der Aufruf nicht nennt, bleibt."""
    text = json.dumps({**_stempel_datei(pfad), **teile}, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if not pfad.is_file() or pfad.read_text(encoding="utf-8") != text:
        _ersetzen(pfad, text)


def _pruefsumme(inhalt: bytes) -> str:
    return hashlib.sha256(inhalt).hexdigest()


def seele_einrichten(quelle: str, ziel: str, *, zuruecksetzen: bool = False, nur_ansehen: bool = False) -> str:
    """Die SOUL.md der Rolle auf die Fassung des Repos bringen, solange sie im Profil niemand
    geändert hat. Rückgabe: ``geschrieben``, ``unverändert`` oder ``behalten``.

    Die Regeln einer Rolle pflegt der Mensch auch in der App (Admin → Regeln schreibt in dieselbe
    Datei). Darum merkt sich der Stempel, welche Fassung Tikki zuletzt eingerichtet hat: Trägt das
    Profil noch genau die, folgt es dem Repo; trägt es eine andere, hat sie jemand geändert und
    sie bleibt (``zuruecksetzen`` holt die Repo-Fassung zurück). Ohne Stempel – ein eben angelegtes
    Profil mit Hermes' Platzhalter, oder eines aus der Zeit davor – folgt die Datei dem Repo: dort
    ließ sich eine eigene Fassung nie halten, jeder Lauf hat sie ersetzt.

    ``nur_ansehen`` sagt, was geschähe, und schreibt nichts.
    """
    zielpfad = Path(ziel)
    stempelpfad = zielpfad.with_name(STEMPEL)
    neu = Path(quelle).read_bytes()
    alt = zielpfad.read_bytes() if zielpfad.is_file() else None
    eingerichtet = _stempel_datei(stempelpfad).get("seele")
    geaendert = alt is not None and isinstance(eingerichtet, str) and _pruefsumme(alt) != eingerichtet
    if alt != neu and geaendert and not zuruecksetzen:
        return "behalten"
    if nur_ansehen:
        return "unverändert" if alt == neu else "geschrieben"
    if alt != neu:
        tmp = zielpfad.with_name(zielpfad.name + ".tmp")
        tmp.write_bytes(neu)
        os.replace(tmp, zielpfad)
    _stempeln(stempelpfad, seele=_pruefsumme(neu))
    return "unverändert" if alt == neu else "geschrieben"


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
    if befehl == "profilwurzel":
        print(profilwurzel())
        return 0
    if befehl == "zeilen":
        (katalog,) = rest
        for eintrag in _katalog(katalog):
            # slug, Name, Port, Rolle, deren SOUL gilt (Klone nehmen die des Originals)
            print(f"{eintrag['slug']}\t{eintrag['name']}\t{eintrag['port']}\t{eintrag.get('klon_von') or eintrag['slug']}")
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
        schalter = {"--modelle-zuruecksetzen", "--frisch"}
        katalog, vorlage, slug, ziel = [r for r in rest if r not in schalter]
        if schreiben(katalog, vorlage, slug, ziel, modelle_zuruecksetzen="--modelle-zuruecksetzen" in rest,
                     frisch="--frisch" in rest):
            print(f"  config.yaml geschrieben: {ziel}")
        else:
            print("  config.yaml unverändert")
        return 0
    if befehl == "seele":
        schalter = {"--zuruecksetzen", "--nur-ansehen"}
        quelle, ziel = [r for r in rest if r not in schalter]
        ergebnis = seele_einrichten(quelle, ziel, zuruecksetzen="--zuruecksetzen" in rest,
                                    nur_ansehen="--nur-ansehen" in rest)
        if ergebnis == "behalten":
            print("  SOUL.md im Profil geändert (Admin → Regeln) – bleibt; die Repo-Fassung holt --seelen-zuruecksetzen")
        elif ergebnis == "geschrieben":
            print(f"  SOUL.md -> {ziel}")
        else:
            print("  SOUL.md unverändert")
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
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # ohne Hermes-Starter: hermes_constants aus dem Repo
    sys.exit(main(sys.argv[1:]))
