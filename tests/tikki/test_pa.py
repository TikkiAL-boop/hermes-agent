"""Tikki-Plugin „pa“: Postfach-Regeln wie die App, Briefing nur mit Neuem seit dem letzten Mal.

Der Weg durch IMAP und SMTP (lesen, antworten, senden, ablegen) steht in ``test_post.py``.
"""

from __future__ import annotations

import datetime as dt
import ipaddress
import os
import socket
import ssl
import threading
import time
from pathlib import Path

import pytest

from tikki.plugins.pa import briefing, post


def _selbstsigniertes_zertifikat(ordner: Path) -> tuple[Path, Path]:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "127.0.0.1")])
    jetzt = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(jetzt - dt.timedelta(days=1))
        .not_valid_after(jetzt + dt.timedelta(days=1))
        .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
        .sign(key, hashes.SHA256())
    )
    certfile, keyfile = ordner / "cert.pem", ordner / "key.pem"
    certfile.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    keyfile.write_bytes(key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption(),
    ))
    return certfile, keyfile


def test_imap_verweigert_selbstsigniertes_zertifikat(tmp_path: Path) -> None:
    """Ein Lauscher mit eigenem Zertifikat darf das Passwort nie sehen: TLS-Prüfung ist Pflicht."""
    certfile, keyfile = _selbstsigniertes_zertifikat(tmp_path)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile, keyfile)
    horcher = socket.socket()
    horcher.bind(("127.0.0.1", 0))
    horcher.listen(1)
    horcher.settimeout(10)
    gesehen: list[bytes] = []

    def server() -> None:
        try:
            roh, _ = horcher.accept()
            roh.settimeout(5)
            with ctx.wrap_socket(roh, server_side=True) as tls:
                tls.sendall(b"* OK Falscher IMAP bereit\r\n")
                while True:
                    zeile = tls.recv(4096)
                    if not zeile:
                        break
                    gesehen.append(zeile)
                    tag = zeile.split(b" ", 1)[0]
                    if b"CAPABILITY" in zeile.upper():
                        tls.sendall(b"* CAPABILITY IMAP4rev1\r\n" + tag + b" OK fertig\r\n")
                    else:
                        tls.sendall(tag + b" NO geht nicht\r\n")
        except (OSError, ssl.SSLError):
            pass
        finally:
            horcher.close()

    faden = threading.Thread(target=server, daemon=True)
    faden.start()
    zugang = post.Zugang(
        "thorsten@tikki.team", "geheim",
        post.Server("127.0.0.1", horcher.getsockname()[1], True), post.Server("127.0.0.1", 587, False),
    )
    with pytest.raises(Exception) as info:
        post.Postfach(zugang, timeout=5)._imap()
    faden.join(timeout=10)
    assert not any(b"LOGIN" in zeile.upper() for zeile in gesehen), gesehen
    assert not any(b"geheim" in zeile for zeile in gesehen)
    assert isinstance(info.value, ssl.SSLError), info.value


_MENSCH = (
    b"From: Oma <oma@beispiel.de>\r\nReply-To: Opa <opa@beispiel.de>\r\nTo: thorsten@tikki.team\r\n"
    b"Subject: Sonntag\r\nMessage-ID: <s1@beispiel.de>\r\n\r\nKommt ihr Sonntag?"
)


def test_antworten_markiert_vor_dem_senden(monkeypatch) -> None:
    """Scheitert das Senden, bleibt die Mail markiert: lieber eine Antwort zu wenig als doppelt."""
    fach = post.Postfach(post.zugang({"mail_address": "thorsten@tikki.team"}, "geheim"))
    flags: set[str] = set()
    monkeypatch.setattr(fach, "lesen", lambda uid, ordner="INBOX": post.nachricht_aus_bytes(
        uid, _MENSCH, mit_text=True, flags=" ".join(flags)))
    monkeypatch.setattr(fach, "erledigt", lambda uid, ordner="INBOX", *, beantwortet=False, wartet=False:
                        flags.update({"\\Seen", *(["\\Answered"] if beantwortet else [])}))

    def weg(msg):
        raise ConnectionResetError("SMTP weg")

    monkeypatch.setattr(fach, "_smtp", weg)
    erster = fach.antworten("2", "Ja, gern.", mensch=True, freigabe=[])
    assert "fehler" in erster and not erster.get("gesendet")
    assert "\\Answered" in flags

    monkeypatch.setattr(fach, "_smtp", lambda msg: pytest.fail("keine zweite Antwort"))
    zweiter = fach.antworten("2", "Ja, gern.", mensch=True, freigabe=[])
    assert "fehler" in zweiter and not zweiter.get("gesendet")


def test_senden_braucht_echte_adresse(monkeypatch) -> None:
    import json

    from hermes_constants import get_hermes_home
    from tikki.plugins import pa

    (get_hermes_home() / "config.yaml").write_text(
        "plugins:\n  entries:\n    pa:\n      settings:\n        mail_address: thorsten@tikki.team\n", encoding="utf-8")
    monkeypatch.setenv(post.PASSWORT, "geheim")
    monkeypatch.setattr(post.Postfach, "_smtp", lambda self, msg: pytest.fail("darf nicht senden"))
    ergebnis = json.loads(pa.post_werkzeug({"aktion": "senden", "an": "Oma", "text": "Hallo"}))
    assert "fehler" in ergebnis and "geheim" not in json.dumps(ergebnis)


def test_serverregeln_entsprechen_der_app() -> None:
    imap, smtp = post.server_fuer("karin@tikki.team")
    assert (imap.host, imap.port, imap.secure) == ("mail.tikki.email", 993, True)
    assert (smtp.host, smtp.port, smtp.secure) == ("mail.tikki.email", 587, False)

    imap, smtp = post.server_fuer("x@beispiel.de", {"mail_smtp_port": 465})
    assert imap.host == "mail.beispiel.de"
    assert (smtp.port, smtp.secure) == (465, True)

    assert post.zugang({"mail_address": "a@tikki.team"}, "") is None


def test_freigabe_gilt_fuer_die_adresse_oder_ihre_domain_und_nie_fuer_aehnliche() -> None:
    liste = post.freigabe({"mail_freigabe": ["Oma@Beispiel.de", "@tikki.team", "kaputt"]})

    assert post.freigegeben("Oma <oma@beispiel.de>", liste) and post.freigegeben("karin@tikki.team", liste)
    for fremd in ("opa@beispiel.de", "x@tikki.team.fremd.example", "oma@beispiel.de@fremd.example", "tikki.team", ""):
        assert not post.freigegeben(fremd, liste), fremd
    assert not post.freigegeben("oma@beispiel.de", post.freigabe({}))


def test_antwort_bleibt_im_faden_und_geht_an_den_absender() -> None:
    roh = (
        b"From: Vermieter <hausverwaltung@beispiel.de>\r\nTo: thorsten@tikki.team\r\n"
        b"Subject: =?utf-8?q?Nebenkosten_2025?=\r\nMessage-ID: <abc@beispiel.de>\r\n"
        b"Date: Wed, 01 Oct 2026 09:00:00 +0200\r\nContent-Type: text/html; charset=utf-8\r\n\r\n"
        b"<p>Bitte <b>best\xc3\xa4tigen</b> Sie den Termin.</p><script>x()</script>"
    )
    original = post.nachricht_aus_bytes("7", roh, mit_text=True)
    assert original.betreff == "Nebenkosten 2025"
    assert "bestätigen Sie den Termin" in original.text and "x()" not in original.text

    antwort = post.antwort_bauen(original, "Passt, Dienstag 10 Uhr.", "thorsten@tikki.team")
    assert antwort["To"] == "hausverwaltung@beispiel.de"
    assert antwort["Subject"] == "Re: Nebenkosten 2025"
    assert antwort["In-Reply-To"] == "<abc@beispiel.de>"
    assert "<abc@beispiel.de>" in antwort["References"]


def test_briefing_nimmt_nur_ausgaben_seit_dem_letzten_mal(tmp_path: Path, monkeypatch) -> None:
    home = tmp_path / "profiles" / "tikki"
    (home / "cron" / "output" / "job-a").mkdir(parents=True)
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / ".tikki"))
    for key in ("TIKKI_MAIL_ADDRESS", "TIKKI_MAIL_PASSWORD", "WA_BRIDGE_TOKEN"):
        monkeypatch.delenv(key, raising=False)

    alt = home / "cron" / "output" / "job-a" / "alt.md"
    alt.write_text("Mails geprüft: nichts Neues.", encoding="utf-8")
    os.utime(alt, (time.time() - 7200, time.time() - 7200))
    briefing.stand_setzen(time.time() - 3600)
    neu = home / "cron" / "output" / "job-a" / "neu.md"
    neu.write_text("Zwei Mails beantwortet, eine an Karin weitergeleitet.", encoding="utf-8")

    daten = briefing.sammeln()

    assert [e["text"] for e in daten["erledigt"]] == ["Zwei Mails beantwortet, eine an Karin weitergeleitet."]
    assert daten["post"] is None and "Postfach" in daten["post_hinweis"]
    assert briefing.letzter_stand() >= daten["jetzt"]
    assert briefing.sammeln()["erledigt"] == []


def test_briefing_bleibt_klein_auch_wenn_ein_auftrag_hunderte_male_lief(tmp_path: Path, monkeypatch) -> None:
    """Ein Vier-Minuten-Auftrag schreibt 360 Ausgaben am Tag. Das Briefing trägt je Auftrag die
    jüngsten mit Text, zählt den Rest und bleibt insgesamt gedeckelt."""
    home = tmp_path / "profiles" / "tikki"
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("TIKKI_HOME", str(tmp_path / ".tikki"))
    for key in ("TIKKI_MAIL_ADDRESS", "TIKKI_MAIL_PASSWORD", "WA_BRIDGE_TOKEN"):
        monkeypatch.delenv(key, raising=False)
    jetzt = time.time()
    auftraege = [f"job-{i}" for i in range(briefing.HOECHSTENS // briefing.JE_AUFTRAG + 2)]
    for auftrag in auftraege:
        (home / "cron" / "output" / auftrag).mkdir(parents=True)
        for lauf in range(briefing.JE_AUFTRAG * 3):
            datei = home / "cron" / "output" / auftrag / f"{lauf:03d}.md"
            datei.write_text(f"{auftrag} Lauf {lauf}", encoding="utf-8")
            os.utime(datei, (jetzt - 1000 + lauf, jetzt - 1000 + lauf))

    daten = briefing.sammeln(stempeln=False)

    assert len(daten["erledigt"]) == briefing.HOECHSTENS
    assert daten["erledigt_laeufe"] == {auftrag: briefing.JE_AUFTRAG * 3 for auftrag in auftraege}
    je_auftrag: dict[str, list[str]] = {}
    for eintrag in daten["erledigt"]:
        je_auftrag.setdefault(eintrag["auftrag"], []).append(eintrag["text"])
    assert all(len(texte) <= briefing.JE_AUFTRAG for texte in je_auftrag.values())
    juengster = f"Lauf {briefing.JE_AUFTRAG * 3 - 1}"
    assert all(texte[0].endswith(juengster) for texte in je_auftrag.values())
