"""Tikki – API-Schlüssel aus einer Textdatei in die Profile übernehmen, ohne sie je anzuzeigen.

Thorsten hält seine Schlüssel in einer Textdatei (z. B. ``~/Downloads/cv.cv.txt``). Dieses
Werkzeug liest sie ein, erkennt bekannte Anbieter an Namen und Schlüsselform und schreibt sie
in die ``.env`` des Hauptprofils und jeder Tikki-Rolle. Werte erscheinen nie in der Ausgabe,
nur Schlüsselnamen und Zahlen. Die Datei selbst bleibt unverändert; danach sollte sie aus dem
Download-Ordner verschwinden (``--danach-loeschen``).

Verstandene Zeilenformen (Groß-/Kleinschreibung egal, Anführungszeichen egal):

    XAI_API_KEY=xai-…              CURSOR_API_KEY: key_…
    cursor  key_…                  anthropic: sk-ant-…
    openai = sk-…   XAI: xai-…     gemini AIza…
    honcho …                       wa bridge token …

Ein wörtlicher Variablenname wird nur übernommen, wenn er auf ``_KEY``, ``_TOKEN``, ``_SECRET``
oder ``_PASSWORD`` endet. Geschrieben wird in die ``.env`` des Hauptprofils und der Rollen aus dem
Katalog; Geheimnisse, die einem Profil gehören (Postfach-Passwort, WhatsApp- und Bot-Token), nur
ins Zielprofil.

Aufruf (bevorzugt über Hermes, damit die Profilpfade stimmen):

    hermes --run-module tikki.werkzeuge.schluessel <datei> [--nur-anzeigen] [--danach-loeschen] [--profil tikki]
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

#: Anbietername (wie er in der Datei stehen kann) → Umgebungsvariable, die Hermes/Tikki lesen.
NAMEN: dict[str, str] = {
    "xai": "XAI_API_KEY", "grok": "XAI_API_KEY", "x.ai": "XAI_API_KEY",
    "cursor": "CURSOR_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY", "claude": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY", "chatgpt": "OPENAI_API_KEY", "gpt": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY", "google": "GEMINI_API_KEY",
    "perplexity": "PERPLEXITY_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "groq": "GROQ_API_KEY",
    "elevenlabs": "ELEVENLABS_API_KEY",
    "deepgram": "DEEPGRAM_API_KEY",
    "honcho": "HONCHO_API_KEY",
    "tavily": "TAVILY_API_KEY",
    "firecrawl": "FIRECRAWL_API_KEY",
    "brave": "BRAVE_API_KEY",
    "github": "GITHUB_TOKEN",
    "telegram": "TELEGRAM_BOT_TOKEN",
    "wa_bridge": "WA_BRIDGE_TOKEN", "wa-bridge": "WA_BRIDGE_TOKEN", "wabridge": "WA_BRIDGE_TOKEN",
    "wa bridge": "WA_BRIDGE_TOKEN", "bridge": "WA_BRIDGE_TOKEN", "whatsapp": "WA_BRIDGE_TOKEN",
    "lokal": "LOKAL_API_KEY",
    "api_server": "API_SERVER_KEY",
}

#: Schlüsselformen, an denen der Anbieter auch ohne Namen erkennbar ist.
FORMEN: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^sk-ant-"), "ANTHROPIC_API_KEY"),
    (re.compile(r"^xai-"), "XAI_API_KEY"),
    (re.compile(r"^sk-or-"), "OPENROUTER_API_KEY"),
    (re.compile(r"^pplx-"), "PERPLEXITY_API_KEY"),
    (re.compile(r"^gsk_"), "GROQ_API_KEY"),
    (re.compile(r"^AIza"), "GEMINI_API_KEY"),
    (re.compile(r"^(ghp_|github_pat_)"), "GITHUB_TOKEN"),
    (re.compile(r"^tvly-"), "TAVILY_API_KEY"),
    (re.compile(r"^fc-"), "FIRECRAWL_API_KEY"),
    (re.compile(r"^(key_|crsr_)"), "CURSOR_API_KEY"),
    (re.compile(r"^sk-"), "OPENAI_API_KEY"),
]

#: Ein wörtlich genannter Variablenname wird nur übernommen, wenn er wie ein Geheimnis heißt –
#: nicht jedes ``GROSS=wert`` einer Notizdatei gehört in die .env aller Profile.
GEHEIM_ENDEN = ("_KEY", "_TOKEN", "_SECRET", "_PASSWORD")
#: Geheimnisse, die genau einem Profil gehören (ein Bot-Token darf nicht in zwei Profilen stehen,
#: Postfach und WhatsApp sind die der Assistentin): sie gehen nur ins Zielprofil (``--profil``,
#: Standard tikki). ``API_SERVER_KEY`` bleibt bei allen: jede Rolle braucht einen, um ihren
#: HTTP-Dienst zu starten, und die Datei nennt nur einen.
PROFILGEBUNDEN = frozenset({"TELEGRAM_BOT_TOKEN", "TIKKI_MAIL_PASSWORD", "WA_BRIDGE_TOKEN"})

_ZEILE = re.compile(r"^\s*(?:export\s+)?([A-Za-z][\w .\-]*?)\s*(?:[:=]|\t| )\s*[\"']?([^\s\"']{8,})[\"']?\s*$")
_NUR_WERT = re.compile(r"^\s*[\"']?([^\s\"']{16,})[\"']?\s*$")
_VARIABLENNAME = re.compile(r"[A-Z][A-Z0-9_]*")


def _variable(name: str) -> str | None:
    """Der Name vor dem Wert → Variable. Ein Anbietername gilt in jeder Schreibweise (``XAI``,
    ``Cursor``, ``x.ai``); erst danach zählt ein wörtlicher Variablenname, und nur, wenn er wie ein
    Geheimnis heißt; zuletzt ein Stichwort in freiem Text (``wa bridge token``)."""
    roh = name.strip()
    n = roh.lower()
    if n in NAMEN:
        return NAMEN[n]
    if _VARIABLENNAME.fullmatch(roh):
        return roh if roh.endswith(GEHEIM_ENDEN) else None
    for stichwort, variable in NAMEN.items():
        if stichwort in n:
            return variable
    return None


def _nach_form(wert: str) -> str | None:
    for muster, variable in FORMEN:
        if muster.search(wert):
            return variable
    return None


def einlesen(text: str) -> dict[str, str]:
    """Zeilen → {VARIABLE: wert}. Erst Name, sonst Schlüsselform; Unbekanntes bleibt liegen."""
    gefunden: dict[str, str] = {}
    for roh in text.splitlines():
        zeile = roh.strip()
        if not zeile or zeile.startswith("#"):
            continue
        m = _ZEILE.match(zeile)
        if m:
            variable = _variable(m.group(1)) or _nach_form(m.group(2))
            if variable:
                gefunden.setdefault(variable, m.group(2))
                continue
        m = _NUR_WERT.match(zeile)
        if m and (variable := _nach_form(m.group(1))):
            gefunden.setdefault(variable, m.group(1))
    return gefunden


def env_schreiben(pfad: Path, werte: dict[str, str]) -> tuple[int, int]:
    """``KEY=wert`` je Variable setzen oder ersetzen. Rückgabe (neu, ersetzt)."""
    zeilen = pfad.read_text(encoding="utf-8").splitlines() if pfad.exists() else []
    neu = ersetzt = 0
    for variable, wert in werte.items():
        muster = re.compile(rf"^\s*#?\s*{re.escape(variable)}\s*=")
        for i, zeile in enumerate(zeilen):
            if muster.match(zeile):
                if zeile.strip() != f"{variable}={wert}":
                    zeilen[i] = f"{variable}={wert}"
                    ersetzt += 1
                break
        else:
            zeilen.append(f"{variable}={wert}")
            neu += 1
    pfad.parent.mkdir(parents=True, exist_ok=True)
    tmp = pfad.with_suffix(pfad.suffix + ".tmp")
    # Von der ersten Sekunde an nur für den Besitzer lesbar – nicht erst nach dem Schreiben.
    with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        os.fchmod(f.fileno(), 0o600)
        f.write("\n".join(zeilen).rstrip("\n") + "\n")
    os.replace(tmp, pfad)
    return neu, ersetzt


def ziele(profil: str = "tikki") -> list[tuple[Path, bool]]:
    """``(.env, ist Zielprofil)`` für das Hauptprofil und jede eingerichtete Rolle aus dem Katalog.
    Andere Ordner unter ``profiles/`` (die Skill-Bibliothek, gelöschte Profile) bekommen keine Schlüssel."""
    from hermes_cli.profiles import get_profile_dir
    from tikki.werkzeuge.raeume import katalog

    haupt = get_profile_dir("default")
    rollen = sorted({e["hermes_profil"] for e in katalog()})
    return [(haupt / ".env", profil == "default")] + [
        (haupt / "profiles" / name / ".env", name == profil) for name in rollen if (haupt / "profiles" / name).is_dir()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="schluessel", description=__doc__.split("\n\n")[0])
    parser.add_argument("datei")
    parser.add_argument("--nur-anzeigen", action="store_true", help="nur sagen, was erkannt wurde")
    parser.add_argument("--danach-loeschen", action="store_true", help="die Textdatei nach dem Übernehmen löschen")
    parser.add_argument("--profil", default="tikki",
                        help="Profil, dem die profilgebundenen Geheimnisse gehören (Postfach, Bot-Token; Standard: tikki)")
    args = parser.parse_args(argv)

    quelle = Path(args.datei).expanduser()
    if not quelle.is_file():
        print(f"Datei nicht gefunden: {quelle}", file=sys.stderr)
        return 1
    werte = einlesen(quelle.read_text(encoding="utf-8", errors="replace"))
    if not werte:
        print("Keine Schlüssel erkannt. Erwartet: NAME=wert je Zeile (z. B. XAI_API_KEY=…).", file=sys.stderr)
        return 1
    print(f"Erkannt ({len(werte)}): " + ", ".join(sorted(werte)))
    if args.nur_anzeigen:
        return 0
    gebunden = sorted(set(werte) & PROFILGEBUNDEN)
    if gebunden:
        print(f"Nur ins Profil {args.profil}: " + ", ".join(gebunden))
    for pfad, zielprofil in ziele(args.profil):
        neu, ersetzt = env_schreiben(pfad, {k: v for k, v in werte.items() if zielprofil or k not in PROFILGEBUNDEN})
        print(f"  {pfad}: {neu} neu, {ersetzt} ersetzt")
    if args.danach_loeschen:
        quelle.unlink()
        print(f"Quelle gelöscht: {quelle}")
    else:
        print(f"Hinweis: {quelle} enthält weiter alle Schlüssel – am besten löschen (--danach-loeschen).")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    sys.exit(main())
