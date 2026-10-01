"""Postfach der persönlichen Assistenz: lesen, beantworten, senden – aus dem Backend heraus.

Die App hat ihren eigenen Mail-Client (Bereich Post, Electron). Tikkis Daueraufträge laufen
aber im Hermes-Backend (Cronjobs), ohne App. Darum liest dieses Modul dasselbe Postfach direkt
über IMAP/SMTP. Die Serverregeln sind dieselben wie in ``electron/tikki-mail.ts``:
``name@tikki.team`` liegt auf ``mail.tikki.email``, andere Domains auf ``mail.<domain>``;
Umgebungsvariablen ``TIKKI_MAIL_IMAP_HOST``/``_SMTP_HOST``/``_IMAP_PORT``/``_SMTP_PORT``
übersteuern. Zugang: ``TIKKI_MAIL_ADDRESS`` und ``TIKKI_MAIL_PASSWORD`` in der ``.env``.
"""

from __future__ import annotations

import email
import imaplib
import os
import smtplib
from dataclasses import asdict, dataclass
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr, parsedate_to_datetime

TIKKI_MAIL_DOMAIN = "tikki.team"


@dataclass
class Server:
    host: str
    port: int
    secure: bool


@dataclass
class Zugang:
    adresse: str
    passwort: str
    imap: Server
    smtp: Server


@dataclass
class Nachricht:
    uid: str
    von: str
    an: str
    betreff: str
    datum: str | None
    kurz: str
    text: str = ""
    message_id: str = ""
    references: str = ""


def server_fuer(adresse: str, env: dict | None = None) -> tuple[Server, Server]:
    """IMAP- und SMTP-Server einer Adresse, wie die App sie wählt."""
    env = os.environ if env is None else env
    domain = adresse.split("@", 1)[1].lower() if "@" in adresse else ""
    standard = "mail.tikki.email" if domain == TIKKI_MAIL_DOMAIN else f"mail.{domain}"
    imap_host = env.get("TIKKI_MAIL_IMAP_HOST") or standard
    smtp_host = env.get("TIKKI_MAIL_SMTP_HOST") or imap_host
    imap_port = int(env.get("TIKKI_MAIL_IMAP_PORT") or 0) or 993
    smtp_port = int(env.get("TIKKI_MAIL_SMTP_PORT") or 0) or 587
    return Server(imap_host, imap_port, imap_port == 993), Server(smtp_host, smtp_port, smtp_port == 465)


def zugang(env: dict | None = None) -> Zugang | None:
    """Der Zugang aus der Umgebung; None, wenn Adresse oder Passwort fehlen."""
    env = os.environ if env is None else env
    adresse = (env.get("TIKKI_MAIL_ADDRESS") or "").strip().lower()
    passwort = env.get("TIKKI_MAIL_PASSWORD") or ""
    if "@" not in adresse or not passwort:
        return None
    imap, smtp = server_fuer(adresse, env)
    return Zugang(adresse, passwort, imap, smtp)


def _kopf(wert) -> str:
    try:
        return str(make_header(decode_header(wert or ""))).strip()
    except Exception:
        return str(wert or "").strip()


def _text_aus(msg: email.message.Message) -> str:
    """Der lesbare Text einer Mail: erst text/plain, sonst HTML grob entkleidet."""
    teile: list[str] = []
    html = ""
    for teil in msg.walk() if msg.is_multipart() else [msg]:
        if teil.get_content_disposition() == "attachment":
            continue
        typ = teil.get_content_type()
        if typ not in ("text/plain", "text/html"):
            continue
        try:
            roh = teil.get_payload(decode=True) or b""
            inhalt = roh.decode(teil.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        if typ == "text/plain":
            teile.append(inhalt)
        elif not html:
            html = inhalt
    if teile:
        return "\n".join(teile).strip()
    if html:
        import re

        html = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
        html = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", html)
        text = re.sub(r"<[^>]+>", " ", html)
        return "\n".join(" ".join(zeile.split()) for zeile in text.splitlines()).strip()
    return ""


def nachricht_aus_bytes(uid: str, roh: bytes, *, mit_text: bool = False) -> Nachricht:
    """Kopfzeilen (und auf Wunsch der Text) einer rohen Mail."""
    msg = email.message_from_bytes(roh)
    datum = None
    try:
        datum = parsedate_to_datetime(msg.get("Date")).isoformat() if msg.get("Date") else None
    except Exception:
        datum = None
    text = _text_aus(msg)
    return Nachricht(
        uid=uid, von=_kopf(msg.get("From")), an=_kopf(msg.get("To")), betreff=_kopf(msg.get("Subject")),
        datum=datum, kurz=" ".join(text.split())[:240], text=text if mit_text else "",
        message_id=(msg.get("Message-ID") or "").strip(), references=(msg.get("References") or "").strip(),
    )


def antwort_bauen(original: Nachricht, text: str, absender: str) -> EmailMessage:
    """Eine Antwort mit korrektem Faden (In-Reply-To, References) an den Absender."""
    msg = EmailMessage()
    _, an = parseaddr(original.von)
    msg["From"] = absender
    msg["To"] = an or original.von
    betreff = original.betreff or ""
    msg["Subject"] = betreff if betreff.lower().startswith("re:") else f"Re: {betreff}"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=absender.split("@", 1)[-1] or None)
    if original.message_id:
        msg["In-Reply-To"] = original.message_id
        msg["References"] = f"{original.references} {original.message_id}".strip()
    msg.set_content(text)
    return msg


def neue_mail_bauen(an: str, betreff: str, text: str, absender: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = absender
    msg["To"] = an
    msg["Subject"] = betreff
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=absender.split("@", 1)[-1] or None)
    msg.set_content(text)
    return msg


class Postfach:
    """Dünne Hülle um imaplib/smtplib; jede Methode öffnet und schließt ihre Verbindung."""

    def __init__(self, zugang: Zugang, timeout: float = 30.0):
        self.zugang = zugang
        self.timeout = timeout

    def _imap(self) -> imaplib.IMAP4:
        s = self.zugang.imap
        if s.secure:
            conn: imaplib.IMAP4 = imaplib.IMAP4_SSL(s.host, s.port, timeout=self.timeout)
        else:
            conn = imaplib.IMAP4(s.host, s.port, timeout=self.timeout)
            conn.starttls()
        conn.login(self.zugang.adresse, self.zugang.passwort)
        return conn

    def ungelesen(self, anzahl: int = 12, ordner: str = "INBOX") -> list[Nachricht]:
        conn = self._imap()
        try:
            conn.select(ordner, readonly=True)
            _, daten = conn.uid("search", None, "UNSEEN")
            uids = (daten[0] or b"").split()
            treffer: list[Nachricht] = []
            for uid in reversed(uids[-max(1, anzahl):]):
                _, teile = conn.uid("fetch", uid, "(BODY.PEEK[])")
                roh = next((t[1] for t in teile if isinstance(t, tuple)), b"")
                treffer.append(nachricht_aus_bytes(uid.decode(), roh))
            return treffer
        finally:
            conn.logout()

    def lesen(self, uid: str, ordner: str = "INBOX") -> Nachricht | None:
        conn = self._imap()
        try:
            conn.select(ordner, readonly=True)
            _, teile = conn.uid("fetch", uid, "(BODY.PEEK[])")
            roh = next((t[1] for t in teile if isinstance(t, tuple)), b"")
            return nachricht_aus_bytes(uid, roh, mit_text=True) if roh else None
        finally:
            conn.logout()

    def erledigt(self, uid: str, ordner: str = "INBOX") -> None:
        conn = self._imap()
        try:
            conn.select(ordner)
            conn.uid("store", uid, "+FLAGS", "(\\Seen)")
        finally:
            conn.logout()

    def senden(self, msg: EmailMessage) -> str:
        s = self.zugang.smtp
        if s.secure:
            with smtplib.SMTP_SSL(s.host, s.port, timeout=self.timeout) as smtp:
                smtp.login(self.zugang.adresse, self.zugang.passwort)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.host, s.port, timeout=self.timeout) as smtp:
                smtp.starttls()
                smtp.login(self.zugang.adresse, self.zugang.passwort)
                smtp.send_message(msg)
        return msg["Message-ID"]

    def antworten(self, uid: str, text: str) -> dict:
        original = self.lesen(uid)
        if original is None:
            return {"fehler": f"Mail {uid} nicht gefunden"}
        msg = antwort_bauen(original, text, self.zugang.adresse)
        kennung = self.senden(msg)
        self.erledigt(uid)
        return {"gesendet": True, "an": msg["To"], "betreff": msg["Subject"], "message_id": kennung}


def als_dict(n: Nachricht) -> dict:
    d = asdict(n)
    if not d["text"]:
        d.pop("text")
    return d
