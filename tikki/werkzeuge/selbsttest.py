"""Tikki – Selbsttest nach der Installation: läuft alles, was Tikki braucht?

Prüft jede Schicht einzeln und sagt, was fehlt – ohne je einen Schlüsselwert zu zeigen:

    Zweig        der Checkout steht auf tikki-app und enthält die Hermes-Basis
    Rollen       jede Rolle aus rollen/KATALOG.json hat ihr Profil mit config.yaml
    Vorzimmer    das aktive Profil ist tikki
    Gedächtnis   das Plugin gedaechtnis ist in jedem Profil verlinkt und eingeschaltet
    Takt         Raumleiter-Takt und Wachhalter-Rundgang stehen als Cronjob bereit
    Schlüssel    für das Vorzimmer-Modell liegt mindestens ein Schlüssel (nur Namen)
    App          die gebaute Tikki-App wird gefunden (auf dem Mac auch in /Applications)
    Backend      `hermes serve` startet und beantwortet /api/status

Ergebnis je Punkt: ✓ in Ordnung, ⚠ läuft, aber mit Einschränkung, ✗ Fehler (Exit 1).

    hermes --run-module tikki.werkzeuge.selbsttest [--ohne-app] [--ohne-backend] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import socket
import subprocess
import sys
import time
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TIKKI = REPO / "tikki"
ZWEIG = "tikki-app"
#: Cronjobs, die rollen-einrichten.sh anlegt: Profil → Jobname.
CRONJOBS = {"raumleiter": "tikki-takt", "wachhalter": "tikki-rundgang"}

OK, WARNUNG, FEHLER = "ok", "warnung", "fehler"
ZEICHEN = {OK: "✓", WARNUNG: "⚠", FEHLER: "✗"}


@dataclass
class Punkt:
    name: str
    stand: str
    text: str


def katalog() -> list[dict]:
    return json.loads((TIKKI / "rollen" / "KATALOG.json").read_text(encoding="utf-8"))


def _git(*args: str) -> str | None:
    r = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def pruefe_zweig() -> Punkt:
    zweig = _git("rev-parse", "--abbrev-ref", "HEAD")
    basis = json.loads((TIKKI / "hermes-basis.json").read_text(encoding="utf-8"))
    if zweig != ZWEIG:
        return Punkt("Zweig", WARNUNG, f"steht auf {zweig or '?'} statt {ZWEIG}")
    enthalten = subprocess.run(
        ["git", "-C", str(REPO), "merge-base", "--is-ancestor", basis["commit"], "HEAD"], capture_output=True
    ).returncode == 0
    if not enthalten:
        return Punkt("Zweig", WARNUNG, f"Hermes-Basis {basis['commit'][:10]} nicht im Verlauf (flacher Klon?)")
    return Punkt("Zweig", OK, f"{ZWEIG}, Hermes {basis['hermes_version']} vom {basis['datum']}")


def _config(profil: Path) -> dict:
    from ruamel.yaml import YAML

    pfad = profil / "config.yaml"
    return (YAML(typ="safe").load(pfad.read_text(encoding="utf-8")) or {}) if pfad.is_file() else {}


def pruefe_rollen(profile: Path) -> Punkt:
    fehlend = [e["hermes_profil"] for e in katalog() if not (profile / e["hermes_profil"] / "config.yaml").is_file()]
    if fehlend:
        return Punkt("Rollen", FEHLER, "ohne Profil: " + ", ".join(fehlend) + " → tikki/werkzeuge/rollen-einrichten.sh")
    return Punkt("Rollen", OK, f"{len(katalog())} Profile eingerichtet")


def pruefe_vorzimmer(home: Path) -> Punkt:
    datei = home / "active_profile"
    aktiv = datei.read_text(encoding="utf-8").strip() if datei.is_file() else "default"
    if aktiv != "tikki":
        return Punkt("Vorzimmer", FEHLER, f"aktives Profil ist {aktiv} → hermes profile use tikki")
    return Punkt("Vorzimmer", OK, "aktives Profil tikki")


def pruefe_gedaechtnis(profile: Path) -> Punkt:
    plugins = sorted(p.name for p in (TIKKI / "plugins").iterdir() if (p / "plugin.yaml").is_file())
    fehlend = []
    for e in katalog():
        profil = profile / e["hermes_profil"]
        an = set((_config(profil).get("plugins") or {}).get("enabled") or [])
        for plugin in plugins:
            link = profil / "plugins" / plugin
            if not (link.exists() and link.resolve() == (TIKKI / "plugins" / plugin).resolve() and plugin in an):
                fehlend.append(f"{e['hermes_profil']}/{plugin}")
    if fehlend:
        return Punkt("Gedächtnis", FEHLER, "Plugin fehlt in: " + ", ".join(fehlend[:8]) + (" …" if len(fehlend) > 8 else ""))
    return Punkt("Gedächtnis", OK, f"Plugins {', '.join(plugins)} in allen Profilen verlinkt und eingeschaltet")


def pruefe_takt(profile: Path) -> Punkt:
    fehlend = []
    for profil, job in CRONJOBS.items():
        datei = profile / profil / "cron" / "jobs.json"
        try:
            daten = json.loads(datei.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            daten = {}
        jobs = daten.get("jobs", daten) if isinstance(daten, dict) else daten
        namen = {j.get("name") for j in jobs if isinstance(j, dict)} if isinstance(jobs, list) else set()
        if job not in namen:
            fehlend.append(f"{profil}/{job}")
    if fehlend:
        return Punkt("Takt", FEHLER, "Cronjob fehlt: " + ", ".join(fehlend))
    return Punkt("Takt", OK, "Raumleiter-Takt (5 min) und Wachhalter-Rundgang (15 min) angelegt")


def _env_namen(pfad: Path) -> set[str]:
    if not pfad.is_file():
        return set()
    namen = set()
    for zeile in pfad.read_text(encoding="utf-8", errors="replace").splitlines():
        name, gleich, wert = zeile.strip().partition("=")
        if gleich and not name.startswith("#") and wert.strip().strip("'\""):
            namen.add(name.strip())
    return namen


def pruefe_schluessel(profile: Path) -> Punkt:
    from tikki.werkzeuge.schluessel import NAMEN

    tikki = next(e for e in katalog() if e["slug"] == "tikki")
    modelle = [tikki["modell"]["primary"], tikki["modell"]["fallback"], *tikki["modell"].get("weitere", [])]
    gebraucht = {NAMEN[m.split("/")[0]] for m in modelle if m.split("/")[0] in NAMEN}
    vorhanden = sorted(gebraucht & _env_namen(profile / "tikki" / ".env"))
    if not vorhanden:
        return Punkt(
            "Schlüssel", WARNUNG,
            "kein Schlüssel für das Vorzimmer (" + ", ".join(sorted(gebraucht)) + ") → schluessel-einlesen.sh",
        )
    return Punkt("Schlüssel", OK, "Vorzimmer hat: " + ", ".join(vorhanden))


def pruefe_app() -> Punkt:
    from hermes_cli.desktop_identity import desktop_app_name
    from hermes_cli.main_desktop import _desktop_packaged_executable

    name = desktop_app_name()
    gebaut = _desktop_packaged_executable(REPO / "apps" / "desktop")
    if gebaut is None:
        return Punkt("App", FEHLER, f"keine gebaute {name}-App unter apps/desktop/release")
    if sys.platform == "darwin":
        installiert = [p for p in (Path("/Applications"), Path.home() / "Applications") if (p / f"{name}.app").is_dir()]
        if not installiert:
            return Punkt("App", WARNUNG, f"gebaut, aber nicht in /Applications: {gebaut.parents[2]}")
        return Punkt("App", OK, f"{installiert[0] / (name + '.app')}")
    return Punkt("App", OK, str(gebaut))


def _freier_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def pruefe_backend(hermes: str, warten: float = 120.0) -> Punkt:
    port, token = _freier_port(), secrets.token_urlsafe(24)
    env = {**os.environ, "HERMES_DASHBOARD_SESSION_TOKEN": token}
    try:
        proc = subprocess.Popen(
            [hermes, "serve", "--port", str(port), "--skip-build"], env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
        )
    except FileNotFoundError:
        return Punkt("Backend", FEHLER, f"{hermes} nicht gefunden")
    anfrage = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/status", headers={"Authorization": f"Bearer {token}"}
    )
    ende, start = time.monotonic() + warten, time.monotonic()
    try:
        while time.monotonic() < ende:
            if proc.poll() is not None:
                return Punkt("Backend", FEHLER, f"hermes serve beendet sich sofort (Exit {proc.returncode})")
            try:
                with urllib.request.urlopen(anfrage, timeout=3) as antwort:
                    if antwort.status == 200:
                        return Punkt("Backend", OK, f"startet und antwortet nach {time.monotonic() - start:.0f} s")
            except OSError:
                time.sleep(1)
        return Punkt("Backend", FEHLER, f"keine Antwort von /api/status nach {warten:.0f} s")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()


def alle(home: Path, *, app: bool, backend: bool, hermes: str) -> list[Punkt]:
    profile = home / "profiles"
    punkte = [
        pruefe_zweig(), pruefe_rollen(profile), pruefe_vorzimmer(home), pruefe_gedaechtnis(profile),
        pruefe_takt(profile), pruefe_schluessel(profile),
    ]
    if app:
        punkte.append(pruefe_app())
    if backend:
        punkte.append(pruefe_backend(hermes))
    return punkte


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="selbsttest", description=__doc__.split("\n\n")[0])
    parser.add_argument("--ohne-app", action="store_true", help="die Desktop-App nicht prüfen")
    parser.add_argument("--ohne-backend", action="store_true", help="hermes serve nicht probestarten")
    parser.add_argument("--hermes", default="hermes", help="Hermes-Befehl für den Backend-Probestart")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    from hermes_constants import get_default_hermes_root

    punkte = alle(
        get_default_hermes_root(), app=not args.ohne_app, backend=not args.ohne_backend,
        hermes=args.hermes,
    )
    if args.json:
        print(json.dumps([asdict(p) for p in punkte], ensure_ascii=False, indent=2))
    else:
        print("Tikki – Selbsttest")
        for p in punkte:
            print(f"  {ZEICHEN[p.stand]} {p.name:<11} {p.text}")
        fehler = sum(p.stand == FEHLER for p in punkte)
        warnungen = sum(p.stand == WARNUNG for p in punkte)
        print(f"\n{len(punkte) - fehler - warnungen} in Ordnung, {warnungen} Hinweise, {fehler} Fehler")
    return 1 if any(p.stand == FEHLER for p in punkte) else 0


if __name__ == "__main__":
    sys.path.insert(0, str(REPO))
    sys.exit(main())
