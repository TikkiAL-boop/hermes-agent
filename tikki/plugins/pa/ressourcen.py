"""Modell-Ressourcen (MR): welche Kraft gerade frei ist – Anbieter, Abos, lokale Server, Raumleiter-Klone.

Der MR-Bot (Rolle ``mr``) und der Raumleiter fragen hier nach, wenn ein Modell ausfällt oder ein
Limit erreicht ist; der Wachhalter liest den letzten Stand im Rundgang. Gesammelt wird:

- Anbieter aus ``providers.*`` der Rollen-Configs und Hermes' eingebaute, die der Katalog nennt:
  Schlüssel gesetzt (nur Namen), ``GET /models`` erreichbar, erste Modell-Kennungen, Abo angemeldet.
- Abo-Kommandozeilen (claude, codex, gemini, grok): auf dem PATH, Version, Anmeldedatei vorhanden.
- Lokale Modelle und laufende Server (``modelle.sammeln``).
- Raumleiter und Klone mit ihrer Modellkette aus dem Katalog, und daraus **„Frei jetzt“**:
  lokal, wenn ein Server läuft → Abo-Klon → API-Klon.

Der Stand liegt in ``~/.tikki/ressourcen.json`` (``TIKKI_HOME`` übersteuert). Schlüsselwerte werden
gelesen, um anzuklopfen, und erscheinen nirgends – weder im Stand noch in einer Ausgabe.

    hermes pa ressourcen [--json]            hermes --run-module tikki.plugins.pa.ressourcen [--json]
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import modelle
from .briefing import tikki_home

#: Anbieter, die ein Abo mit Browser-Anmeldung sind (``hermes auth add``), kein Schlüssel.
ABO_ANBIETER = {"anthropic", "openai-codex", "xai-oauth"}
LOKAL = "lokal"
#: Abo-Kommandozeilen wie in ``abos-einrichten.sh``: Name → (Befehl, Anmeldedatei unter $HOME).
ABO_CLIS = {
    "Claude Code": ("claude", ".claude/.credentials.json"),
    "Codex": ("codex", ".codex/auth.json"),
    "Gemini": ("gemini", ".gemini/oauth_creds.json"),
    "Grok Build": ("grok", None),
}
MODELLE_HOECHSTENS = 20
#: Älter als das gilt der Stand im Rundgang als überholt.
FRISCH_S = 2 * 3600
MARKE = "TIKKI-RESSOURCEN "  # Zeilenanfang der JSON-Ausgabe; die App sucht genau diese Zeile.

_REIHENFOLGE = {LOKAL: 0, "abo": 1, "api": 2}


def stand_datei() -> Path:
    return tikki_home() / "ressourcen.json"


def _profile_wurzel() -> Path:
    from hermes_constants import get_default_hermes_root

    return get_default_hermes_root() / "profiles"


def _env_werte(pfad: Path) -> dict[str, str]:
    """Gesetzte Einträge einer .env (Name → Wert). Werte bleiben in diesem Modul."""
    if not pfad.is_file():
        return {}
    werte = {}
    for zeile in pfad.read_text(encoding="utf-8", errors="replace").splitlines():
        name, gleich, wert = zeile.strip().partition("=")
        if gleich and not name.startswith("#") and wert.strip().strip("'\""):
            werte[name.strip()] = wert.strip().strip("'\"")
    return werte


def _config(profil: Path) -> dict:
    from ruamel.yaml import YAML

    pfad = profil / "config.yaml"
    try:
        return (YAML(typ="safe").load(pfad.read_text(encoding="utf-8")) or {}) if pfad.is_file() else {}
    except Exception:
        return {}


def weg(anbieter: str) -> str:
    """Über welchen Weg ein Anbieter läuft: ``lokal``, ``abo`` oder ``api``."""
    return LOKAL if anbieter == LOKAL else "abo" if anbieter in ABO_ANBIETER else "api"


def anklopfen(basis: str, schluessel: str, timeout: float = 5.0) -> tuple[str, list[str]]:
    """``GET {basis}/models`` → (Befund, Modell-Kennungen); Befund leer heißt erreichbar."""
    basis = basis.rstrip("/")
    kopf = {"Authorization": f"Bearer {schluessel}"}
    if "anthropic.com" in basis:
        basis = basis if basis.endswith("/v1") else basis + "/v1"
        kopf.update({"x-api-key": schluessel, "anthropic-version": "2023-06-01"})
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{basis}/models", headers=kopf), timeout=timeout) as a:
            if a.status != 200:
                return f"HTTP {a.status}", []
            daten = json.loads(a.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}", []
    except (OSError, ValueError) as e:
        return f"keine Verbindung ({getattr(e, 'reason', e)})", []
    roh = daten.get("data") if isinstance(daten, dict) else daten
    ids = [str(d.get("id")) for d in roh if isinstance(d, dict) and d.get("id")] if isinstance(roh, list) else []
    return "", ids[:MODELLE_HOECHSTENS]


def _abo_angemeldet(anbieter: str) -> bool | None:
    try:
        from hermes_cli.auth import get_auth_status  # liest nur, erneuert nichts (#68004)

        return bool(get_auth_status(anbieter).get("logged_in"))
    except Exception:
        return None


def anbieter_sammeln(katalog: list[dict], profile: Path, werte: dict[str, str], timeout: float = 5.0) -> list[dict]:
    """Je Anbieter: Schlüsselnamen (gesetzt/fehlend), Abo, Erreichbarkeit, Modelle. Nie ein Wert."""
    eintraege: dict[str, dict] = {}
    for rolle in katalog:
        cfg = _config(profile / rolle["hermes_profil"]).get("providers") or {}
        for name, e in (cfg.items() if isinstance(cfg, dict) else ()):
            e = e if isinstance(e, dict) else {}
            eintraege.setdefault(name, {
                "name": name, "quelle": "config",
                "basis": str(e.get("base_url") or e.get("api") or "").rstrip("/"),
                "schluessel_namen": [n for n in [e.get("key_env") or e.get("api_key_env")] if n],
            })
    gebraucht = {m.split("/", 1)[0] for r in katalog for m in
                 (r["modell"]["primary"], r["modell"]["fallback"], *r["modell"].get("weitere", []))} - {LOKAL}
    try:
        from hermes_cli.auth import PROVIDER_REGISTRY as eingebaut
    except Exception:
        eingebaut = {}
    for name in sorted(gebraucht - set(eintraege)):
        p = eingebaut.get(name)
        eintraege[name] = {
            "name": name, "quelle": "hermes",
            "basis": (p.inference_base_url if p else "").rstrip("/"),
            "schluessel_namen": list(p.api_key_env_vars) if p else [],
        }
    stand = []
    for name, e in eintraege.items():
        gesetzt = [n for n in e["schluessel_namen"] if werte.get(n)]
        eintrag = {
            "name": name, "weg": weg(name), "basis": e["basis"], "quelle": e["quelle"],
            "schluessel": gesetzt, "schluessel_fehlt": [n for n in e["schluessel_namen"] if n not in gesetzt],
            "abo": _abo_angemeldet(name) if weg(name) == "abo" else None,
            "erreichbar": None, "befund": "", "modelle": [],
        }
        if gesetzt and e["basis"]:
            befund, ids = anklopfen(e["basis"], werte[gesetzt[0]], timeout)
            eintrag.update(erreichbar=not befund, befund=befund, modelle=ids)
        elif not gesetzt and eintrag["abo"] is None:
            eintrag["befund"] = "kein Schlüssel"
        stand.append(eintrag)
    return stand


def _version(befehl: str, timeout: float) -> str:
    try:
        r = subprocess.run([befehl, "--version"], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return (r.stdout or r.stderr).strip().splitlines()[0][:80] if (r.stdout or r.stderr).strip() else ""


def abos_sammeln(home: Path | None = None, timeout: float = 5.0) -> list[dict]:
    """Die Kommandozeilen der Abos: vorhanden (Hermes' Resolver), Version, Anmeldedatei da."""
    from hermes_platform.resolver import locate_command

    home = home or Path.home()
    stand = []
    for name, (befehl, datei) in ABO_CLIS.items():
        res = locate_command(befehl)
        pfad = res.command[0] if res.found else None
        stand.append({
            "name": name, "befehl": befehl, "vorhanden": res.found,
            "version": _version(pfad, timeout) if pfad else "",
            "angemeldet": (home / datei).is_file() if datei else None,
        })
    return stand


def klone_sammeln(katalog: list[dict]) -> list[dict]:
    """Raumleiter und seine Klone mit der Modellkette aus dem Katalog."""
    return [
        {"slug": r["slug"], "name": r["name"], "profil": r["hermes_profil"],
         "kette": [r["modell"]["primary"], r["modell"]["fallback"], *r["modell"].get("weitere", [])]}
        for r in katalog if r["slug"] == "raumleiter" or r.get("klon_von") == "raumleiter"
    ]


def frei_jetzt(klone: list[dict], anbieter: list[dict], server: list[dict]) -> list[dict]:
    """Welche Klone gerade nutzbar sind, nach ihrem Hauptmodell: lokal (Server läuft) → Abo → API."""
    nach_name = {a["name"]: a for a in anbieter}
    frei = []
    for k in klone:
        prov = k["kette"][0].split("/", 1)[0]
        a = nach_name.get(prov) or {}
        if prov == LOKAL:
            if not server:
                continue
            grund = "Server läuft: " + ", ".join(s["adresse"] for s in server[:2])
        elif weg(prov) == "abo":
            if not a.get("abo"):
                continue
            grund = f"{prov}: Abo angemeldet"
        elif a.get("erreichbar"):
            grund = f"{prov}: Schlüssel gesetzt, erreichbar"
        else:
            continue
        frei.append({"slug": k["slug"], "weg": weg(prov), "modell": k["kette"][0], "grund": grund})
    frei.sort(key=lambda f: _REIHENFOLGE[f["weg"]])
    return frei


def sammeln(*, katalog: list[dict] | None = None, profile: Path | None = None, umgebung: dict | None = None,
            home: Path | None = None, timeout: float = 5.0, abos: bool = True, lokal: dict | None = None,
            schreiben: bool = True) -> dict:
    if katalog is None:
        from tikki.werkzeuge.raeume import katalog as katalog_lesen

        katalog = katalog_lesen()
    profile = profile or _profile_wurzel()
    werte = dict(os.environ if umgebung is None else umgebung)
    for pfad in [profile.parent / ".env", *(profile / r["hermes_profil"] / ".env" for r in katalog)]:
        for name, wert in _env_werte(pfad).items():
            werte.setdefault(name, wert)
    lokal = lokal if lokal is not None else modelle.sammeln(home=home, timeout=min(timeout, 1.0))
    anbieter = anbieter_sammeln(katalog, profile, werte, timeout)
    klone = klone_sammeln(katalog)
    ergebnis = {
        "zeit": time.time(),
        "anbieter": anbieter,
        "abos": abos_sammeln(home, timeout) if abos else [],
        "lokal": {"server": lokal.get("server") or [], "modelle": len(lokal.get("modelle") or []),
                  "empfehlung": lokal.get("empfehlung") or {}},
        "klone": klone,
        "frei": frei_jetzt(klone, anbieter, lokal.get("server") or []),
    }
    if schreiben:
        datei = stand_datei()
        datei.parent.mkdir(parents=True, exist_ok=True)
        datei.write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1), encoding="utf-8")
    return ergebnis


def stand_lesen() -> dict | None:
    try:
        return json.loads(stand_datei().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def frei_zeile(ergebnis: dict) -> str:
    frei = ergebnis.get("frei") or []
    if not frei:
        return "Frei jetzt: nichts – kein Schlüssel erreichbar, kein Abo angemeldet, kein lokaler Server."
    erster, rest = frei[0], frei[1:]
    zeile = f"Frei jetzt: {erster['slug']} ({erster['grund']})"
    return zeile + (f"; danach {', '.join(f['slug'] for f in rest)}." if rest else ".")


def als_text(ergebnis: dict) -> str:
    z = ["Anbieter | Schlüssel | erreichbar | Modelle"]
    for a in ergebnis.get("anbieter") or []:
        schluessel = ", ".join(a["schluessel"]) or ("Abo" if a["weg"] == "abo" else "–")
        erreichbar = ("Abo " + ("angemeldet" if a["abo"] else "abgemeldet")) if a["weg"] == "abo" and a["erreichbar"] is None \
            else "ja" if a["erreichbar"] else a["befund"] or "nicht geprüft"
        z.append(f"{a['name']} | {schluessel} | {erreichbar} | " + (", ".join(a["modelle"][:5]) or "–"))
    z.append("Abos: " + ("; ".join(
        f"{b['name']} {'✓ ' + (b['version'] or 'da') if b['vorhanden'] else '✗ fehlt'}"
        + ("" if b["angemeldet"] is None or not b["vorhanden"] else (", angemeldet" if b["angemeldet"] else ", nicht angemeldet"))
        for b in ergebnis.get("abos") or []) or "nicht geprüft"))
    lokal = ergebnis.get("lokal") or {}
    server = lokal.get("server") or []
    z.append(f"Lokal: {lokal.get('modelle', 0)} Modell(e) auf der Platte; " + (
        "Server: " + "; ".join(f"{s['adresse']} [{', '.join(s['modelle']) or s['art']}]" for s in server)
        if server else "kein Modellserver läuft"))
    z.append("Raumleiter-Klone: " + "; ".join(f"{k['slug']} → {' → '.join(k['kette'])}" for k in ergebnis.get("klone") or []))
    z.append(frei_zeile(ergebnis))
    return "\n".join(z)


def kurzbericht(jetzt: float | None = None) -> str:
    """Der Block „Ressourcen“ für den Rundgang: nur lesen, nie sammeln."""
    stand = stand_lesen()
    if not stand:
        return "Ressourcen: kein Stand – hermes -p mr pa ressourcen"
    alter = (jetzt or time.time()) - float(stand.get("zeit") or 0)
    ausfaelle = [f"{a['name']} ({a['befund']})" for a in stand.get("anbieter") or [] if a.get("erreichbar") is False]
    zeilen = [f"Ressourcen (MR, Stand vor {int(alter / 60)} min): {frei_zeile(stand)}"]
    if ausfaelle:
        zeilen.append("  Ausfall: " + ", ".join(ausfaelle))
    if alter > FRISCH_S:
        zeilen.append("  Hinweis: Stand älter als 2 h – Cronjob tikki-ressourcen (Profil mr) prüfen")
    return "\n".join(zeilen)


def werkzeug(args: dict, **_kw) -> str:
    ergebnis = sammeln(timeout=float(args.get("timeout") or 5.0))
    return json.dumps({"text": als_text(ergebnis), **{k: ergebnis[k] for k in ("anbieter", "abos", "lokal", "klone", "frei")}},
                      ensure_ascii=False)


def cli(args) -> int:
    ergebnis = sammeln(timeout=float(getattr(args, "timeout", 5.0) or 5.0))
    if getattr(args, "json", False):
        print(MARKE + json.dumps(ergebnis, ensure_ascii=False))
    else:
        print(als_text(ergebnis))
    return 0


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="ressourcen", description=__doc__.split("\n\n")[0])
    parser.add_argument("--json", action="store_true", help="Maschinenlesbar (eine Zeile, Präfix TIKKI-RESSOURCEN)")
    parser.add_argument("--timeout", type=float, default=5.0, help="Sekunden je Anbieter-Anfrage")
    return cli(parser.parse_args(argv))


if __name__ == "__main__":  # hermes --run-module tikki.plugins.pa.ressourcen
    sys.exit(main())
