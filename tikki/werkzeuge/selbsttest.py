"""Tikki – Selbsttest nach der Installation: läuft alles, was Tikki braucht?

Prüft jede Schicht einzeln und sagt, was fehlt – ohne je einen Schlüsselwert zu zeigen:

    Zweig        der Checkout steht auf tikki-app und enthält die Hermes-Basis
    Rollen       jede Rolle aus rollen/KATALOG.json hat ihr Profil mit config.yaml
    Vorzimmer    das aktive Profil ist tikki
    Gedächtnis   das Plugin gedaechtnis ist in jedem Profil verlinkt und eingeschaltet
    Takt         Raumleiter-Takt und Wachhalter-Rundgang stehen als Cronjob bereit und laufen
    Gateway      das Host-Gateway läuft (fährt Räume, Takt und Daueraufträge)
    Schlüssel    für das Vorzimmer-Modell liegt mindestens ein Schlüssel (nur Namen)
    Anbieter     jeder Anbieter mit Schlüssel (providers.*) beantwortet GET /models
    Sprache      stt.provider und tts.provider des Vorzimmers sind im Backend nutzbar (Hermes' eigene Auflösung)
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
import urllib.error
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
    """Jobname allein genügt nicht: ein Job, der seit Läufen scheitert oder abgeschaltet ist, steht
    genauso in jobs.json (Felder aus cron/jobs.py::mark_job_run: enabled, last_status, last_error)."""
    fehlend, aus, kaputt = [], [], []
    for profil, job in CRONJOBS.items():
        datei = profile / profil / "cron" / "jobs.json"
        try:
            daten = json.loads(datei.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            daten = {}
        jobs = daten.get("jobs", daten) if isinstance(daten, dict) else daten
        eintrag = next((j for j in jobs if isinstance(j, dict) and j.get("name") == job), None) \
            if isinstance(jobs, list) else None
        if eintrag is None:
            fehlend.append(f"{profil}/{job}")
        elif eintrag.get("enabled") is False:
            aus.append(f"{profil}/{job}")
        elif eintrag.get("last_status") == "error":
            grund = str(eintrag.get("last_error") or "").strip().splitlines() or ["ohne Fehlertext"]
            kaputt.append(f"{profil}/{job}: {grund[-1][:160]}")
    if fehlend or aus:
        return Punkt("Takt", FEHLER, "; ".join(
            filter(None, ["Cronjob fehlt: " + ", ".join(fehlend) if fehlend else "",
                          "Cronjob abgeschaltet: " + ", ".join(aus) + " → hermes -p <profil> cron enable" if aus else ""])))
    if kaputt:
        return Punkt("Takt", WARNUNG, "letzter Lauf gescheitert – " + "; ".join(kaputt) + " → hermes -p <profil> cron logs")
    return Punkt("Takt", OK, "Raumleiter-Takt (5 min) und Wachhalter-Rundgang (15 min) angelegt")


def pruefe_raum(home: Path) -> Punkt:
    """„Suite erstellen“ mit der Prüfung des Gateways selbst: Grundbesatzung und jeder Raumleiter-Klon
    müssen Profile sein, die der Raumdienst als Mitglieder annimmt (mit Identitätsdatei, nicht
    gelöscht) – ein Ordner, den nur ein Cronjob oder Cache angelegt hat, zählt nicht."""
    from gateway.hosted_room_discussion import DiscussionValidationError, validate_roster
    from tikki.werkzeuge import raeume

    bekannt = raeume.lokale_profile(home)
    fehlend: list[str] = []
    for klon in [None, *(k["slug"] for k in raeume.raumleiter_klone())]:
        try:
            validate_roster(raeume.besetzung(raumleiter=klon), local_profiles=bekannt)
        except DiscussionValidationError as e:
            fehlend.append(f"{klon or 'Grundbesatzung'}: {e}")
        except ValueError as e:
            fehlend.append(f"{klon or 'Grundbesatzung'}: Katalog {e}")
    if fehlend and fehlend[0].startswith("Grundbesatzung"):
        return Punkt("Raum", FEHLER, fehlend[0] + " → tikki/werkzeuge/rollen-einrichten.sh")
    if fehlend:
        return Punkt("Raum", WARNUNG, "Klone ohne Profil (Räume gehen mit dem Raumleiter auf): "
                     + "; ".join(fehlend) + " → rollen-einrichten.sh")
    return Punkt("Raum", OK, f"Grundbesatzung und {len(raeume.raumleiter_klone())} Raumleiter-Klone nimmt der Raumdienst an")


def pruefe_gateway() -> Punkt:
    """Das eine Host-Gateway fährt Räume und Daueraufträge – ohne es steht alles still."""
    from gateway.status import get_running_pid

    if get_running_pid(cleanup_stale=False) is not None:
        return Punkt("Gateway", OK, "Host-Gateway läuft (fährt Räume, Takt und Daueraufträge)")
    return Punkt("Gateway", WARNUNG, "kein Gateway aktiv → hermes -p default gateway install (oder: gateway run)")


def _env_werte(pfad: Path) -> dict[str, str]:
    """Gesetzte Einträge einer .env (Name → Wert). Werte bleiben in diesem Modul – nie in einem Punkt-Text."""
    if not pfad.is_file():
        return {}
    werte = {}
    for zeile in pfad.read_text(encoding="utf-8", errors="replace").splitlines():
        name, gleich, wert = zeile.strip().partition("=")
        if gleich and not name.startswith("#") and wert.strip().strip("'\""):
            werte[name.strip()] = wert.strip().strip("'\"")
    return werte


def _env_namen(pfad: Path) -> set[str]:
    return set(_env_werte(pfad))


#: Handlungshinweis je Anbieter, wenn /models nicht mit 200 antwortet.
ANBIETER_HINWEIS = {"cursor": "Endpunkt prüfen, Katalog ggf. auf xai umstellen"}


def pruefe_anbieter(profile: Path, profil: str = "raumleiter") -> Punkt:
    """``GET {base_url}/models`` je Anbieter unter ``providers.*`` der Rollen-Config, dessen
    Schlüssel in der .env steht – ein falscher Cursor-Endpunkt fällt so vor dem ersten Raum auf."""
    anbieter = _config(profile / profil).get("providers") or {}
    if not isinstance(anbieter, dict) or not anbieter:
        return Punkt("Anbieter", WARNUNG, f"keine providers in {profil}/config.yaml → rollen-einrichten.sh")
    werte = _env_werte(profile / profil / ".env")
    ok, warnungen, uebersprungen = [], [], []
    for name, eintrag in anbieter.items():
        eintrag = eintrag if isinstance(eintrag, dict) else {}
        schluessel = werte.get(str(eintrag.get("key_env") or eintrag.get("api_key_env") or ""))
        basis = str(eintrag.get("base_url") or eintrag.get("api") or "").rstrip("/")
        if not schluessel or not basis:
            uebersprungen.append(name)
            continue
        anfrage = urllib.request.Request(f"{basis}/models", headers={"Authorization": f"Bearer {schluessel}"})
        try:
            with urllib.request.urlopen(anfrage, timeout=5) as antwort:
                befund = "" if antwort.status == 200 else f"HTTP {antwort.status}"
        except urllib.error.HTTPError as e:
            befund = f"HTTP {e.code}"
        except OSError as e:
            befund = f"keine Verbindung ({getattr(e, 'reason', e)})"
        if befund:
            hinweis = ANBIETER_HINWEIS.get(name, "base_url und Schlüssel prüfen")
            warnungen.append(f"{name}: {befund} ({basis}/models) → {hinweis}")
        else:
            ok.append(name)
    rest = f" (ohne Schlüssel übersprungen: {', '.join(uebersprungen)})" if uebersprungen else ""
    if warnungen:
        return Punkt("Anbieter", WARNUNG, "; ".join(warnungen) + rest)
    if not ok:
        return Punkt("Anbieter", OK, "kein Anbieterschlüssel gesetzt – nichts geprüft" + rest)
    return Punkt("Anbieter", OK, "/models antwortet: " + ", ".join(ok) + rest)


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


def pruefe_sprache(profile: Path, profil: str = "tikki") -> Punkt:
    """Hört und spricht das Vorzimmer? ``stt``/``tts`` aus <profil>/config.yaml, aufgelöst wie Hermes
    es beim Sprechen tut (``transcription_tools._get_provider``, ``tts_tool._select_builtin_engine``)
    im Home des Profils. Prüfen heißt nicht installieren: Hermes' Importer würden ein fehlendes Extra
    sonst nachziehen (``pm.ensure_import``), hier läuft er leer. Das Mikrofon nimmt die App auf
    (Browser), ein Audiogerät am Backend ist darum nicht nötig."""
    cfg = _config(profile / profil)
    stt_cfg = cfg.get("stt") if isinstance(cfg.get("stt"), dict) else {}
    tts_cfg = cfg.get("tts") if isinstance(cfg.get("tts"), dict) else {}
    stt_gewollt = str(stt_cfg.get("provider") or "").lower().strip()
    tts_gewollt = str(tts_cfg.get("provider") or "edge").lower().strip()
    if not stt_gewollt:
        return Punkt("Sprache", WARNUNG, f"kein stt.provider in {profil}/config.yaml → tikki/werkzeuge/rollen-einrichten.sh")

    import pm
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from tools.transcription_tools import _get_provider
    from tools.tts_tool import _select_builtin_engine

    marke, nachziehen = set_hermes_home_override(profile / profil), pm.ensure_import
    pm.ensure_import = lambda extra: None
    try:
        stt = _get_provider(stt_cfg)
        engine, tts_fehler = _select_builtin_engine(tts_gewollt)
    finally:
        pm.ensure_import = nachziehen
        reset_hermes_home_override(marke)

    probleme = []
    if stt == "none":
        probleme.append(f"Spracheingabe {stt_gewollt} nicht nutzbar → " + (
            "hermes pm install --extra voice" if stt_gewollt == "local" else "Schlüssel und SDK des Anbieters prüfen"))
    if tts_fehler:
        probleme.append("Sprachausgabe: " + str(json.loads(tts_fehler).get("error") or tts_fehler))
    elif engine != tts_gewollt:
        probleme.append(f"Sprachausgabe {tts_gewollt} fehlt, Hermes nimmt {engine}")
    if probleme:
        return Punkt("Sprache", WARNUNG, "; ".join(probleme))
    return Punkt("Sprache", OK, f"hört mit {stt}, spricht mit {engine} (Sprache {stt_cfg.get('language') or 'auto'})")


def pruefe_app() -> Punkt:
    from hermes_cli.desktop_identity import desktop_app_name
    from hermes_cli.main_desktop import _desktop_packaged_executable

    name = desktop_app_name()
    gebaut = _desktop_packaged_executable(REPO / "apps" / "desktop")
    if gebaut is None:
        return Punkt("App", FEHLER, f"keine gebaute {name}-App unter apps/desktop/release")
    code_zeit = int(_git("log", "-1", "--format=%ct") or 0)
    if sys.platform == "darwin":
        installiert = [p / f"{name}.app" for p in (Path("/Applications"), Path.home() / "Applications") if (p / f"{name}.app").is_dir()]
        if not installiert:
            return Punkt("App", WARNUNG, f"gebaut, aber nicht in /Applications: {gebaut.parents[2]}")
        exe = installiert[0] / "Contents" / "MacOS" / name
        if app_ist_aelter(exe.stat().st_mtime if exe.is_file() else 0, code_zeit):
            return Punkt("App", FEHLER, f"{installiert[0]} ist älter als der Code (Stand {time.strftime('%d.%m. %H:%M', time.localtime(code_zeit))})"
                         " → tikki/installieren.sh --ohne-kern (Tikki wird dafür beendet)")
        return Punkt("App", OK, f"{installiert[0]}")
    if app_ist_aelter(gebaut.stat().st_mtime, code_zeit):
        return Punkt("App", FEHLER, f"{gebaut} ist älter als der Code → tikki/installieren.sh")
    return Punkt("App", OK, str(gebaut))


def app_ist_aelter(app_zeit: float, code_zeit: float) -> bool:
    """Eine App, die vor dem letzten Commit gebaut wurde, kann den Code nicht enthalten."""
    return bool(code_zeit) and app_zeit < code_zeit


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
        pruefe_takt(profile), pruefe_schluessel(profile), pruefe_anbieter(profile), pruefe_sprache(profile),
        pruefe_raum(home), pruefe_gateway(),
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
