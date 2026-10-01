"""Tikki-Plugin „pa“: Postfach-Regeln wie die App, Briefing nur mit Neuem seit dem letzten Mal."""

from __future__ import annotations

import os
import time
from pathlib import Path

from tikki.plugins.pa import briefing, post


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
