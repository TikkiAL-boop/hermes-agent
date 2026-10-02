"""Lokale Modelle finden: was auf der Platte liegt und welcher Modellserver gerade läuft.

Die App fragt beim Start danach (``hermes pa modelle --json`` über ``cli.exec``), Tikki und später
der MR-Bot über das Werkzeug ``lokale_modelle``. Gesucht wird dort, wo die üblichen Werkzeuge
ablegen – LM Studio, Ollama, der Hugging-Face-Cache (dort landen auch die MLX-Modelle), ``~/Models``
und ``~/Downloads`` –, dazu die bekannten Ports OpenAI-kompatibler Server. Das Ergebnis liegt in
``~/.tikki/modelle.json`` (``TIKKI_HOME`` übersteuert), damit Räume und Briefing es ohne neue Suche
lesen können. Nichts wird geladen, gestartet oder verändert.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from .briefing import tikki_home

# Ports, auf denen Modellserver üblicherweise antworten (OpenAI-kompatibel, /v1/models).
PORTS = {1234: "lmstudio", 11434: "ollama", 8080: "llama.cpp / mlx_lm", 8000: "vllm", 8081: "server", 5000: "server"}
TIEFE = 4
TIEFE_DOWNLOADS = 2
KONTEXT_MINDESTENS = 65536  # Hermes startet mit weniger nicht (agent/agent_init.py::_enforce_minimum_context)

_SHARD = re.compile(r"-\d{5}-of-\d{5}(?=\.gguf$)")
_PARAMETER = re.compile(r"(?<![A-Za-z0-9])(\d{1,3}(?:[.,]\d)?)\s?[bB](?![A-Za-z0-9])")
_AKTIV = re.compile(r"(?<![A-Za-z0-9])A(\d{1,3}(?:\.\d)?)[bB](?![A-Za-z0-9])")
_QUANT = re.compile(r"(?i)(?<![A-Za-z0-9])(IQ\d_\w+|Q\d(?:_[A-Z0-9]+)*|\d-?bit|fp16|bf16|fp8|int8|int4|nf4|mxfp4)(?![A-Za-z0-9])")


@dataclass
class Modell:
    name: str
    pfad: str
    format: str  # gguf | mlx | safetensors | ollama
    quelle: str  # lmstudio | ollama | huggingface | ordner | downloads
    gb: float
    parameter: str | None = None
    aktiv: str | None = None  # bei MoE: aktive Parameter je Token
    quant: str | None = None
    start: str = ""  # Startbefehl als Hinweis, mit 64k Kontext


@dataclass
class Server:
    adresse: str  # OpenAI-kompatible Basis, z. B. http://127.0.0.1:1234/v1
    art: str
    modelle: list[str] = field(default_factory=list)


def parameter_aus_name(name: str) -> tuple[str | None, str | None]:
    """„Qwen3-235B-A22B-4bit“ → („235B“, „22B“); „Llama-3.3-70B-Instruct-Q4_K_M“ → („70B“, None)."""
    aktiv = _AKTIV.search(name)
    treffer = [m for m in _PARAMETER.finditer(name) if not (aktiv and m.start() >= aktiv.start() and m.end() <= aktiv.end())]
    gesamt = max((float(m.group(1).replace(",", ".")) for m in treffer), default=None)
    fmt = lambda z: (f"{z:g}B" if z is not None else None)  # noqa: E731
    return fmt(gesamt), (fmt(float(aktiv.group(1))) if aktiv else None)


def quant_aus_name(name: str) -> str | None:
    m = _QUANT.search(name)
    return m.group(1).upper().replace("BIT", "bit") if m else None


def ordner_kandidaten(home: Path) -> list[tuple[Path, str, int]]:
    """(Ordner, Quelle, Suchtiefe) – nur, was es gibt."""
    kandidaten = [
        (home / ".lmstudio" / "models", "lmstudio", TIEFE),
        (home / ".cache" / "lm-studio" / "models", "lmstudio", TIEFE),
        (home / ".cache" / "huggingface" / "hub", "huggingface", 1),
        (home / "Models", "ordner", TIEFE),
        (home / "models", "ordner", TIEFE),
        (home / "Downloads", "downloads", TIEFE_DOWNLOADS),
    ]
    return [(p, q, t) for p, q, t in kandidaten if p.is_dir()]


def _groesse(pfad: Path) -> int:
    if pfad.is_file():
        try:
            return pfad.stat().st_size
        except OSError:
            return 0
    summe = 0
    for wurzel, _dirs, dateien in os.walk(pfad):
        for d in dateien:
            try:
                summe += (Path(wurzel) / d).stat().st_size  # folgt Symlinks (HF-Cache → blobs)
            except OSError:
                pass
    return summe


def _gb(bytes_: int) -> float:
    return round(bytes_ / 1e9, 1)


def _ist_mlx(ordner: Path) -> bool:
    if "mlx" in str(ordner).lower():
        return True
    try:
        cfg = json.loads((ordner / "config.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(cfg, dict) and "quantization" in cfg


def startbefehl(m: Modell) -> str:
    if m.format == "gguf":
        return f"llama-server -m '{m.pfad}' -c {KONTEXT_MINDESTENS} --port 8080"
    if m.format == "mlx":
        return f"mlx_lm.server --model '{m.pfad}' --port 8080  # Hermes: lokal/{Path(m.pfad).name}, context_length {KONTEXT_MINDESTENS}"
    if m.format == "ollama":
        return f"OLLAMA_CONTEXT_LENGTH={KONTEXT_MINDESTENS} ollama serve  # Hermes: lokal.base_url http://127.0.0.1:11434/v1, Modell lokal/{m.name}"
    return f"vllm serve '{m.pfad}' --max-model-len {KONTEXT_MINDESTENS} --port 8000"


def _modell(name: str, pfad: Path, format_: str, quelle: str, bytes_: int) -> Modell:
    gesamt, aktiv = parameter_aus_name(name)
    m = Modell(name=name, pfad=str(pfad), format=format_, quelle=quelle, gb=_gb(bytes_), parameter=gesamt, aktiv=aktiv,
               quant=quant_aus_name(name))
    m.start = startbefehl(m)
    return m


def modelle_in(ordner: Path, quelle: str, tiefe: int = TIEFE) -> list[Modell]:
    """GGUF-Dateien (Shards zusammengefasst) und safetensors/MLX-Ordner unter *ordner*."""
    funde: list[Modell] = []
    basis_tiefe = len(ordner.parts)
    for wurzel, dirs, dateien in os.walk(ordner):
        w = Path(wurzel)
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "blobs")
        if len(w.parts) - basis_tiefe >= tiefe:
            dirs[:] = []
        ggufs = [d for d in dateien if d.lower().endswith(".gguf")]
        gruppen: dict[str, list[Path]] = {}
        for d in ggufs:
            gruppen.setdefault(_SHARD.sub("", d), []).append(w / d)
        for kern, teile in sorted(gruppen.items()):
            name = kern[:-5] if kern.lower().endswith(".gguf") else kern
            funde.append(_modell(name, teile[0] if len(teile) == 1 else w, "gguf", quelle, sum(_groesse(t) for t in teile)))
        if "config.json" in dateien and any(d.endswith(".safetensors") for d in dateien):
            name = w.name if w.parent == ordner or quelle != "huggingface" else w.name
            funde.append(_modell(name, w, "mlx" if _ist_mlx(w) else "safetensors", quelle, _groesse(w)))
            dirs[:] = []
    return funde


def modelle_huggingface(hub: Path) -> list[Modell]:
    """``models--org--name/snapshots/<hash>`` → ein Modell je Repo (jüngster Snapshot)."""
    funde: list[Modell] = []
    for repo in sorted(hub.glob("models--*")):
        snapshots = sorted((repo / "snapshots").glob("*"), key=lambda p: p.stat().st_mtime if p.exists() else 0)
        if not snapshots:
            continue
        snap = snapshots[-1]
        name = repo.name[len("models--"):].replace("--", "/", 1)
        dateien = {d.name for d in snap.iterdir()} if snap.is_dir() else set()
        if any(d.lower().endswith(".gguf") for d in dateien):
            for m in modelle_in(snap, "huggingface", 1):
                m.name = f"{name} · {m.name}"
                funde.append(m)
        elif "config.json" in dateien and any(d.endswith(".safetensors") for d in dateien):
            funde.append(_modell(name, snap, "mlx" if _ist_mlx(snap) or name.startswith("mlx-community/") else "safetensors",
                                 "huggingface", _groesse(snap)))
    return funde


def modelle_ollama(home: Path) -> list[Modell]:
    wurzel = home / ".ollama" / "models" / "manifests"
    if not wurzel.is_dir():
        return []
    funde: list[Modell] = []
    for manifest in sorted(wurzel.rglob("*")):
        if not manifest.is_file():
            continue
        try:
            daten = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        schichten = daten.get("layers") if isinstance(daten, dict) else None
        if not isinstance(schichten, list):
            continue
        rel = manifest.relative_to(wurzel).parts  # registry / namespace / name / tag
        if len(rel) < 4:
            continue
        namespace, name, tag = rel[-3], rel[-2], rel[-1]
        voll = f"{name}:{tag}" if namespace == "library" else f"{namespace}/{name}:{tag}"
        bytes_ = sum(int(s.get("size") or 0) for s in schichten if isinstance(s, dict))
        funde.append(_modell(voll, manifest, "ollama", "ollama", bytes_))
    return funde


def modelle_auf_platte(home: Path | None = None, extra: list[Path] | None = None) -> list[Modell]:
    home = home or Path.home()
    funde: list[Modell] = []
    for ordner, quelle, tiefe in ordner_kandidaten(home):
        funde.extend(modelle_huggingface(ordner) if quelle == "huggingface" else modelle_in(ordner, quelle, tiefe))
    for ordner in extra or []:
        if ordner.is_dir():
            funde.extend(modelle_in(ordner, "ordner", TIEFE))
    funde.extend(modelle_ollama(home))
    gesehen: set[str] = set()
    einzig: list[Modell] = []
    for m in funde:
        schluessel = m.pfad if m.format != "ollama" else m.name
        if schluessel in gesehen:
            continue
        gesehen.add(schluessel)
        einzig.append(m)
    einzig.sort(key=lambda m: -m.gb)
    return einzig


def _hole(url: str, timeout: float) -> dict | list | None:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": "Bearer lokal"}), timeout=timeout) as a:
            return json.loads(a.read().decode("utf-8", errors="replace"))
    except Exception:
        return None


def server_suchen(ports: dict[int, str] | None = None, timeout: float = 0.7, host: str = "127.0.0.1",
                  zusatz: list[str] | None = None) -> list[Server]:
    """Welche Modellserver antworten gerade – und mit welchen Modell-Kennungen (für ``lokal/<id>``)."""
    adressen: list[tuple[str, str]] = [(f"http://{host}:{p}/v1", art) for p, art in (ports or PORTS).items()]
    for z in zusatz or []:
        basis = z.rstrip("/")
        if basis and basis not in {a for a, _ in adressen}:
            adressen.append((basis, "config"))
    funde: list[Server] = []
    for basis, art in adressen:
        daten = _hole(f"{basis}/models", timeout)
        ids: list[str] = []
        if isinstance(daten, dict) and isinstance(daten.get("data"), list):
            ids = [str(d.get("id")) for d in daten["data"] if isinstance(d, dict) and d.get("id")]
        elif art == "ollama" or urlparse(basis).port == 11434:
            tags = _hole(basis.rsplit("/v1", 1)[0] + "/api/tags", timeout)
            if isinstance(tags, dict) and isinstance(tags.get("models"), list):
                ids = [str(m.get("name")) for m in tags["models"] if isinstance(m, dict) and m.get("name")]
        if daten is None and not ids:
            continue
        funde.append(Server(adresse=basis, art=art, modelle=ids))
    return funde


def lokal_adresse_aus_config() -> str | None:
    """``providers.lokal.base_url`` des aktiven Profils, falls gesetzt (wird mit abgefragt)."""
    try:
        from hermes_cli.config import load_config_readonly
        anbieter = (load_config_readonly() or {}).get("providers") or {}
        lokal = anbieter.get("lokal") if isinstance(anbieter, dict) else None
        url = (lokal or {}).get("base_url") or (lokal or {}).get("api")
        return str(url) if url else None
    except Exception:
        return None


def empfehlung(modelle: list[Modell]) -> dict[str, str | None]:
    """Was wofür: das größte für die Räume, das kleinste ab 7B für Sprache (schnell)."""
    brauchbar = [m for m in modelle if m.parameter]
    if not brauchbar:
        return {"raeume": None, "sprache": None}
    groesse = lambda m: float(m.parameter[:-1])  # noqa: E731
    schnell = sorted((m for m in brauchbar if groesse(m) >= 7), key=lambda m: float((m.aktiv or m.parameter)[:-1]))
    return {"raeume": max(brauchbar, key=groesse).name, "sprache": schnell[0].name if schnell else None}


def sammeln(home: Path | None = None, extra: list[Path] | None = None, ports: dict[int, str] | None = None,
            timeout: float = 0.7, schreiben: bool = True) -> dict:
    zusatz = [a] if (a := lokal_adresse_aus_config()) else []
    modelle = modelle_auf_platte(home, extra)
    server = server_suchen(ports, timeout, zusatz=zusatz)
    ergebnis = {
        "zeit": time.time(),
        "modelle": [asdict(m) for m in modelle],
        "server": [asdict(s) for s in server],
        "empfehlung": empfehlung(modelle),
        "kontext_mindestens": KONTEXT_MINDESTENS,
    }
    if schreiben:
        datei = tikki_home() / "modelle.json"
        datei.parent.mkdir(parents=True, exist_ok=True)
        datei.write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1), encoding="utf-8")
    return ergebnis


def als_text(ergebnis: dict) -> str:
    zeilen: list[str] = []
    modelle = ergebnis.get("modelle") or []
    server = ergebnis.get("server") or []
    if not modelle and not server:
        return ("Keine lokalen Modelle gefunden (LM Studio, Ollama, Hugging-Face-Cache, ~/Models, ~/Downloads) "
                "und kein Modellserver auf den üblichen Ports.")
    if modelle:
        zeilen.append(f"{len(modelle)} Modell(e) auf der Platte:")
        for m in modelle:
            kenn = " · ".join(x for x in [m.get("parameter"), f"{m['aktiv']} aktiv" if m.get("aktiv") else None, m.get("quant"),
                                           m.get("format"), f"{m['gb']} GB", m.get("quelle")] if x)
            zeilen.append(f"  {m['name']}  ({kenn})")
    if server:
        zeilen.append(f"{len(server)} Modellserver läuft/laufen:")
        for s in server:
            zeilen.append(f"  {s['adresse']}  [{s['art']}]  " + (", ".join(s["modelle"]) if s["modelle"] else "(keine Modell-Liste)"))
    e = ergebnis.get("empfehlung") or {}
    if e.get("raeume"):
        zeilen.append(f"Vorschlag: Räume → {e['raeume']}; Sprache/schnell → {e.get('sprache') or e['raeume']}.")
    zeilen.append(f"Hermes braucht je Modell mindestens {ergebnis.get('kontext_mindestens', KONTEXT_MINDESTENS)} Token Kontext; "
                  "Startbefehle stehen je Modell unter 'start'.")
    return "\n".join(zeilen)


def werkzeug(args: dict) -> str:
    extra = [Path(p).expanduser() for p in (args.get("ordner") or []) if isinstance(p, str)]
    ergebnis = sammeln(extra=extra or None)
    return json.dumps({"text": als_text(ergebnis), **{k: ergebnis[k] for k in ("modelle", "server", "empfehlung")}},
                      ensure_ascii=False)


MARKE = "TIKKI-MODELLE "  # Zeilenanfang der JSON-Ausgabe; die App sucht genau diese Zeile in der cli.exec-Ausgabe.


def cli(args) -> int:
    extra = [Path(p).expanduser() for p in (getattr(args, "ordner", None) or [])]
    ergebnis = sammeln(extra=extra or None, timeout=float(getattr(args, "timeout", 0.7) or 0.7))
    if getattr(args, "json", False):
        print(MARKE + json.dumps(ergebnis, ensure_ascii=False))
    else:
        print(als_text(ergebnis))
    return 0
