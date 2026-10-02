"""Tikki-Plugin „pa“: Postfach-Regeln wie die App, Briefing nur mit Neuem seit dem letzten Mal."""

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

_ZUGANG = post.Zugang(
    "thorsten@tikki.team", "geheim",
    post.Server("mail.tikki.email", 993, True), post.Server("mail.tikki.email", 587, False),
)


class _FakePostfach(post.Postfach):
    """Postfach im Speicher: ``mails`` uid → Rohbytes, ``flags`` uid → gesetzte IMAP-Flags."""

    def __init__(self, mails: dict[str, bytes], *, senden_scheitert: bool = False):
        super().__init__(_ZUGANG)
        self.mails = mails
        self.flags: dict[str, set[str]] = {}
        self.gesendet: list = []
        self.senden_scheitert = senden_scheitert

    def lesen(self, uid, ordner="INBOX"):
        roh = self.mails.get(uid)
        return post.nachricht_aus_bytes(uid, roh, mit_text=True, flags=" ".join(self.flags.get(uid, ()))) if roh else None

    def erledigt(self, uid, ordner="INBOX", *, beantwortet=False):
        self.flags.setdefault(uid, set()).update({"\\Seen", "\\Answered"} if beantwortet else {"\\Seen"})

    def senden(self, msg):
        if self.senden_scheitert:
            raise ConnectionResetError("SMTP weg")
        self.gesendet.append(msg)
        return msg["Message-ID"]


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


_AUTOMAT = (
    b"From: Shop <newsletter@laden.de>\r\nTo: thorsten@tikki.team\r\nSubject: Angebote der Woche\r\n"
    b"Message-ID: <nl1@laden.de>\r\nAuto-Submitted: auto-generated\r\nList-Unsubscribe: <mailto:ab@laden.de>\r\n"
    b"\r\nTolle Angebote."
)
_MENSCH = (
    b"From: Oma <oma@beispiel.de>\r\nReply-To: Opa <opa@beispiel.de>\r\nTo: thorsten@tikki.team\r\n"
    b"Subject: Sonntag\r\nMessage-ID: <s1@beispiel.de>\r\n\r\nKommt ihr Sonntag?"
)


def test_automaten_werden_nicht_beantwortet() -> None:
    fach = _FakePostfach({"1": _AUTOMAT, "2": _MENSCH})
    gelistet = post.als_dict(fach.lesen("1"))
    assert gelistet["automatisch"] is True
    assert post.als_dict(fach.lesen("2"))["automatisch"] is False
    assert post.nachricht_aus_bytes("3", b"From: no-reply@bank.de\r\nSubject: x\r\n\r\n").automatisch

    ergebnis = fach.antworten("1", "Danke!")
    assert "fehler" in ergebnis and not ergebnis.get("gesendet")
    assert fach.gesendet == []

    ergebnis = fach.antworten("2", "Ja, gern.")
    assert ergebnis["gesendet"] is True
    (msg,) = fach.gesendet
    assert msg["To"] == "opa@beispiel.de"
    assert msg["Auto-Submitted"] == "auto-replied"


def test_antworten_markiert_vor_dem_senden() -> None:
    """Scheitert das Senden, bleibt die Mail markiert: lieber eine Antwort zu wenig als doppelt."""
    fach = _FakePostfach({"2": _MENSCH}, senden_scheitert=True)
    erster = fach.antworten("2", "Ja, gern.")
    assert "fehler" in erster and not erster.get("gesendet")
    assert "\\Answered" in fach.flags["2"]

    fach.senden_scheitert = False
    zweiter = fach.antworten("2", "Ja, gern.")
    assert "fehler" in zweiter and not zweiter.get("gesendet")
    assert fach.gesendet == []


def test_senden_braucht_echte_adresse(monkeypatch) -> None:
    import json

    from tikki.plugins import pa

    monkeypatch.setenv("TIKKI_MAIL_ADDRESS", "thorsten@tikki.team")
    monkeypatch.setenv("TIKKI_MAIL_PASSWORD", "geheim")
    monkeypatch.setattr(post.Postfach, "senden", lambda self, msg: pytest.fail("darf nicht senden"))
    ergebnis = json.loads(pa.post_werkzeug({"aktion": "senden", "an": "Oma", "text": "Hallo"}))
    assert "fehler" in ergebnis and "geheim" not in json.dumps(ergebnis)


def test_serverregeln_entsprechen_der_app() -> None:
    imap, smtp = post.server_fuer("karin@tikki.team", env={})
    assert (imap.host, imap.port, imap.secure) == ("mail.tikki.email", 993, True)
    assert (smtp.host, smtp.port, smtp.secure) == ("mail.tikki.email", 587, False)

    imap, smtp = post.server_fuer("x@beispiel.de", env={"TIKKI_MAIL_SMTP_PORT": "465"})
    assert imap.host == "mail.beispiel.de"
    assert (smtp.port, smtp.secure) == (465, True)

    assert post.zugang(env={"TIKKI_MAIL_ADDRESS": "a@tikki.team"}) is None


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

    daten = briefing.sammeln(home)

    assert [e["text"] for e in daten["erledigt"]] == ["Zwei Mails beantwortet, eine an Karin weitergeleitet."]
    assert daten["post"] is None and "Postfach" in daten["post_hinweis"]
    assert briefing.letzter_stand() >= daten["jetzt"]
    assert briefing.sammeln(home)["erledigt"] == []
