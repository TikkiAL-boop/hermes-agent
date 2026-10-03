"""Tikkis Gedächtnis-Speicher außerhalb von Honcho: RAG je Mensch, TencentDB, Hindsight.

Honcho ist der eine Hermes-Gedächtnisanbieter jedes Profils (``memory.provider``). Alles
andere, was Tikki sich merkt, liegt hier:

- **RAG** – je Mensch eine SQLite-Datei mit Volltextindex (FTS5, BM25), auf Wunsch mit
  Vektoren über einen OpenAI-kompatiblen Embedding-Dienst. Kein Server, keine Abhängigkeit.
- **TencentDB Agent Memory** – vier Schichten (Gespräch, Fakten, Szenen, Persona); eine
  Instanz je Mensch und eine für das Systemwissen (``tikki/dienste/tencentdb/``).
- **Hindsight** – optional, wenn eine Adresse eingetragen ist.

Die Einstellungen stehen in ``~/.tikki/gedaechtnis.json`` (``TIKKI_HOME`` verlegt den
Ordner); ``tencentdb.sh`` trägt seine Instanzen dort selbst ein. Schlüssel stehen nie in
dieser Datei, nur Pfade zu Schlüsseldateien oder Namen von Umgebungsvariablen.
"""

from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import struct
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

TIMEOUT_S = 8


def tikki_home() -> Path:
    return Path(os.environ.get("TIKKI_HOME") or Path.home() / ".tikki").expanduser()


def einstellungen() -> dict:
    """Die Gedächtnis-Einstellungen; fehlt die Datei, gelten die Vorgaben (nur RAG)."""
    pfad = tikki_home() / "gedaechtnis.json"
    try:
        daten = json.loads(pfad.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        daten = {}
    daten.setdefault("nutzer", "thorsten")
    daten.setdefault("rag", {})
    daten.setdefault("tencent", {})
    daten.setdefault("hindsight", {})
    return daten


def _schluessel(eintrag: dict) -> str | None:
    """Schlüssel aus einer Schlüsseldatei oder einer Umgebungsvariablen, nie aus der Einstellung selbst."""
    datei = eintrag.get("schluessel_datei")
    if datei:
        try:
            return Path(datei).expanduser().read_text(encoding="utf-8").strip() or None
        except OSError:
            return None
    name = eintrag.get("schluessel_env")
    if name:
        try:
            from agent.secret_scope import get_secret

            return get_secret(name)
        except Exception:
            return os.environ.get(name)
    return None


def _post(url: str, daten: dict, schluessel: str | None = None, timeout: float = TIMEOUT_S) -> dict:
    kopf = {"Content-Type": "application/json"}
    if schluessel:
        kopf["Authorization"] = f"Bearer {schluessel}"
    anfrage = urllib.request.Request(
        url, data=json.dumps(daten).encode("utf-8"), headers=kopf, method="POST"
    )
    with urllib.request.urlopen(anfrage, timeout=timeout) as antwort:
        text = antwort.read().decode("utf-8", errors="replace")
    return json.loads(text) if text.strip() else {}


# ─── RAG ─────────────────────────────────────────────────────────────────────


@dataclass
class Treffer:
    quelle: str
    titel: str
    text: str
    zeit: float | None = None
    wert: float = 0.0


def _stueckeln(text: str, groesse: int = 1200, ueberlapp: int = 150) -> list[str]:
    text = re.sub(r"\n{3,}", "\n\n", (text or "").strip())
    if len(text) <= groesse:
        return [text] if text else []
    stuecke, start = [], 0
    while start < len(text):
        ende = min(len(text), start + groesse)
        umbruch = text.rfind("\n", start + groesse // 2, ende)
        if ende < len(text) and umbruch > 0:
            ende = umbruch
        stuecke.append(text[start:ende].strip())
        if ende >= len(text):
            break
        start = max(ende - ueberlapp, start + 1)
    return [s for s in stuecke if s]


def _fts_anfrage(frage: str) -> str:
    """Freitext → FTS5-Ausdruck: Wörter als Präfixe, ODER-verknüpft (BM25 ordnet)."""
    woerter = re.findall(r"[\wäöüÄÖÜß]{2,}", frage.lower())
    return " OR ".join(f'"{w}"*' for w in woerter[:24])


class Rag:
    """Die Wissenssammlung eines Menschen: eine SQLite-Datei, Volltext plus optional Vektoren."""

    def __init__(self, pfad: Path, embedding: dict | None = None):
        self.pfad = pfad
        self.embedding = embedding or {}
        pfad.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(pfad, timeout=30)
        self._db.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS stuecke (
                id INTEGER PRIMARY KEY, quelle TEXT NOT NULL, titel TEXT NOT NULL,
                text TEXT NOT NULL, zeit REAL NOT NULL, schluessel TEXT UNIQUE, vektor BLOB
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS stuecke_fts USING fts5(
                titel, text, content='stuecke', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
            );
            CREATE TRIGGER IF NOT EXISTS stuecke_ai AFTER INSERT ON stuecke BEGIN
                INSERT INTO stuecke_fts(rowid, titel, text) VALUES (new.id, new.titel, new.text);
            END;
            CREATE TRIGGER IF NOT EXISTS stuecke_ad AFTER DELETE ON stuecke BEGIN
                INSERT INTO stuecke_fts(stuecke_fts, rowid, titel, text) VALUES ('delete', old.id, old.titel, old.text);
            END;
            """
        )

    def close(self) -> None:
        self._db.close()

    def _vektor(self, text: str) -> list[float] | None:
        if not self.embedding.get("base_url") or not self.embedding.get("model"):
            return None
        try:
            antwort = _post(
                self.embedding["base_url"].rstrip("/") + "/embeddings",
                {"model": self.embedding["model"], "input": text[:8000]},
                _schluessel(self.embedding),
            )
            return list(antwort["data"][0]["embedding"])
        except Exception:
            return None

    def aufnehmen(self, quelle: str, titel: str, text: str, schluessel: str | None = None) -> int:
        """Text in Stücken aufnehmen. ``schluessel`` macht die Aufnahme wiederholbar (kein Doppel)."""
        neu = 0
        for nr, stueck in enumerate(_stueckeln(text)):
            eindeutig = f"{schluessel}#{nr}" if schluessel else None
            if eindeutig and self._db.execute(
                "SELECT 1 FROM stuecke WHERE schluessel = ?", (eindeutig,)
            ).fetchone():
                continue
            vektor = self._vektor(stueck)
            self._db.execute(
                "INSERT INTO stuecke (quelle, titel, text, zeit, schluessel, vektor) VALUES (?, ?, ?, ?, ?, ?)",
                (quelle, titel, stueck, time.time(), eindeutig,
                 struct.pack(f"{len(vektor)}f", *vektor) if vektor else None),
            )
            neu += 1
        self._db.commit()
        return neu

    def suchen(self, frage: str, anzahl: int = 6) -> list[Treffer]:
        ausdruck = _fts_anfrage(frage)
        if not ausdruck:
            return []
        zeilen = self._db.execute(
            "SELECT s.quelle, s.titel, s.text, s.zeit, s.vektor, bm25(stuecke_fts) AS rang "
            "FROM stuecke_fts JOIN stuecke s ON s.id = stuecke_fts.rowid "
            "WHERE stuecke_fts MATCH ? ORDER BY rang LIMIT ?",
            (ausdruck, max(anzahl * 8, 40)),
        ).fetchall()
        frage_vektor = self._vektor(frage) if any(z[4] for z in zeilen) else None
        treffer = []
        for quelle, titel, text, zeit, blob, rang in zeilen:
            wert = -float(rang)
            if frage_vektor and blob:
                vektor = struct.unpack(f"{len(blob) // 4}f", blob)
                if len(vektor) == len(frage_vektor):
                    punkt = sum(a * b for a, b in zip(vektor, frage_vektor))
                    norm = math.sqrt(sum(a * a for a in vektor)) * math.sqrt(sum(b * b for b in frage_vektor))
                    wert = wert + 10.0 * (punkt / norm if norm else 0.0)
            treffer.append(Treffer(quelle=quelle, titel=titel, text=text, zeit=zeit, wert=wert))
        treffer.sort(key=lambda t: t.wert, reverse=True)
        return treffer[:anzahl]


def rag_fuer(nutzer: str, cfg: dict | None = None) -> Rag:
    cfg = cfg if cfg is not None else einstellungen()
    ordner = Path(cfg["rag"].get("ordner") or tikki_home() / "rag").expanduser()
    return Rag(ordner / f"{re.sub(r'[^a-z0-9_.-]', '_', nutzer.lower())}.sqlite", cfg["rag"].get("embedding"))


# ─── TencentDB Agent Memory ──────────────────────────────────────────────────


def tencent_instanzen(cfg: dict, nutzer: str) -> list[tuple[str, dict]]:
    """Die Instanzen, in die ein Gespräch dieses Menschen gehört: seine eigene und die des Systems."""
    t = cfg.get("tencent") or {}
    ergebnis = []
    eigene = (t.get("nutzer") or {}).get(nutzer)
    if eigene and eigene.get("url"):
        ergebnis.append((f"tencent:{nutzer}", eigene))
    if (t.get("system") or {}).get("url"):
        ergebnis.append(("tencent:system", t["system"]))
    return ergebnis


def tencent_gesund(instanz: dict) -> bool:
    try:
        with urllib.request.urlopen(instanz["url"].rstrip("/") + "/health", timeout=3) as antwort:
            return antwort.status == 200
    except (urllib.error.URLError, OSError, ValueError):
        return False


def tencent_merken(instanz: dict, sitzung: str, nutzer: str, frage: str, antwort: str) -> None:
    _post(instanz["url"].rstrip("/") + "/capture", {
        "user_content": frage, "assistant_content": antwort,
        "session_key": sitzung, "session_id": sitzung, "user_id": nutzer,
    }, _schluessel(instanz))


def tencent_suchen(instanz: dict, frage: str, anzahl: int) -> str:
    url = instanz["url"].rstrip("/")
    schluessel = _schluessel(instanz)
    teile = []
    for pfad in ("/search/memories", "/search/conversations"):
        try:
            antwort = _post(url + pfad, {"query": frage, "limit": anzahl}, schluessel)
        except (urllib.error.URLError, OSError, ValueError):
            continue
        if str(antwort.get("results") or "").strip():
            teile.append(str(antwort["results"]).strip())
    return "\n\n".join(teile)


# ─── Hindsight (optional) ────────────────────────────────────────────────────


def hindsight_suchen(cfg: dict, frage: str) -> str:
    h = cfg.get("hindsight") or {}
    if not h.get("url"):
        return ""
    antwort = _post(
        h["url"].rstrip("/") + f"/v1/default/banks/{h.get('bank') or 'tikki'}/memories/recall",
        {"query": frage}, _schluessel(h),
    )
    ergebnisse = antwort.get("results") or antwort.get("memories") or []
    return "\n".join(f"- {e.get('text') or e.get('content') or e}" for e in ergebnisse if e)


def hindsight_merken(cfg: dict, text: str) -> None:
    h = cfg.get("hindsight") or {}
    if h.get("url"):
        _post(
            h["url"].rstrip("/") + f"/v1/default/banks/{h.get('bank') or 'tikki'}/memories",
            {"items": [{"content": text}]}, _schluessel(h),
        )
