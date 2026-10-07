"""Tikki – API-Schlüssel aus einer Textdatei in die Profile übernehmen, ohne sie je anzuzeigen.

Thorsten hält seine Schlüssel in einer Textdatei (z. B. ``~/Downloads/cv.cv.txt``). Dieses
Werkzeug liest sie ein, erkennt bekannte Anbieter an Namen und Schlüsselform und schreibt sie
in die ``.env`` des Hauptprofils und jeder Tikki-Rolle. Werte erscheinen nie in der Ausgabe,
nur Schlüsselnamen und Zahlen. Die Datei selbst bleibt unverändert; danach sollte sie aus dem
Download-Ordner verschwinden (``--danach-loeschen``).

Verstandene Zeilenformen (Groß-/Kleinschreibung egal, Anführungszeichen egal):

    XAI_API_KEY=xai-…              CURSOR_API_KEY: key_…
    cursor  key_…                  anthropic: sk-ant-…
    openai = sk-…                  gemini AIza…
    honcho …                       wa bridge token …

Aufruf (bevorzugt über Hermes, damit die Profilpfade stimmen):

    hermes --run-module tikki.werkzeuge.schluessel <datei> [--nur-anzeigen] [--danach-loeschen]
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
    (re.compile(r"^key_"), "CURSOR_API_KEY"),
    (re.compile(r"^sk-"), "OPENAI_API_KEY"),
]

_ZEILE = re.compile(r"^\s*(?:export\s+)?([A-Za-z][\w .\-]*?)\s*(?:[:=]|\t| )\s*[\"']?([^\s\"']{8,})[\"']?\s*$")
_NUR_WERT = re.compile(r"^\s*[\"']?([^\s\"']{16,})[\"']?\s*$")


def _variable(name: str) -> str | None:
    n = name.strip().lower()
    if re.fullmatch(r"[A-Z][A-Z0-9_]+", name.strip()):
        return name.strip()
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
    tmp.write_text("\n".join(zeilen).rstrip("\n") + "\n", encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, pfad)
    os.chmod(pfad, 0o600)
    return neu, ersetzt


def ziele() -> list[Path]:
    """Die ``.env`` des Hauptprofils und jeder vorhandenen Rolle."""
    from hermes_cli.profiles import get_profile_dir

    haupt = get_profile_dir("default")
    profile = haupt / "profiles"
    pfade = [haupt / ".env"]
    if profile.is_dir():
        pfade += sorted(p / ".env" for p in profile.iterdir() if p.is_dir())
    return pfade


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="schluessel", description=__doc__.split("\n\n")[0])
    parser.add_argument("datei")
    parser.add_argument("--nur-anzeigen", action="store_true", help="nur sagen, was erkannt wurde")
    parser.add_argument("--danach-loeschen", action="store_true", help="die Textdatei nach dem Übernehmen löschen")
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
    for pfad in ziele():
        neu, ersetzt = env_schreiben(pfad, werte)
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
