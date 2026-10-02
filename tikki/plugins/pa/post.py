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
import re
import smtplib
import ssl
from dataclasses import asdict, dataclass
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr, parsedate_to_datetime

TIKKI_MAIL_DOMAIN = "tikki.team"

# Automaten (Newsletter, Autoresponder, Bounces) werden nie beantwortet – sonst Antwortschleifen.
# Dieselben Regeln wie Hermes' E-Mail-Adapter (plugins/platforms/email/adapter.py).
_AUTOMATEN_ABSENDER = ("noreply", "no-reply", "no_reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster",
                       "bounce", "notifications@", "automated@", "auto-confirm", "auto-reply", "automailer")
_AUTOMATEN_KOPF = {"Auto-Submitted": lambda v: v.lower() != "no",
                   "Precedence": lambda v: v.lower() in {"bulk", "list", "junk"},
                   "X-Auto-Response-Suppress": lambda v: bool(v), "List-Unsubscribe": lambda v: bool(v),
                   "List-Id": lambda v: bool(v)}
_FLAGS = re.compile(rb"FLAGS \(([^)]*)\)")


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
    antwort_an: str = ""
    automatisch: bool = False
    beantwortet: bool = False


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


def _automatisch(msg: email.message.Message, von: str) -> bool:
    adresse = (parseaddr(von)[1] or von).lower()
    return any(muster in adresse for muster in _AUTOMATEN_ABSENDER) or any(
        (wert := str(msg.get(kopf) or "").strip()) and pruefen(wert) for kopf, pruefen in _AUTOMATEN_KOPF.items())


def nachricht_aus_bytes(uid: str, roh: bytes, *, mit_text: bool = False, flags: str = "") -> Nachricht:
    """Kopfzeilen (und auf Wunsch der Text) einer rohen Mail; ``flags`` sind die IMAP-Flags."""
    msg = email.message_from_bytes(roh)
    datum = None
    try:
        datum = parsedate_to_datetime(msg.get("Date")).isoformat() if msg.get("Date") else None
    except Exception:
        datum = None
    text = _text_aus(msg)
    von = _kopf(msg.get("From"))
    return Nachricht(
        uid=uid, von=von, an=_kopf(msg.get("To")), betreff=_kopf(msg.get("Subject")),
        datum=datum, kurz=" ".join(text.split())[:240], text=text if mit_text else "",
        message_id=(msg.get("Message-ID") or "").strip(), references=(msg.get("References") or "").strip(),
        antwort_an=_kopf(msg.get("Reply-To")), automatisch=_automatisch(msg, von),
        beantwortet="\\answered" in flags.lower(),
    )


def antwort_bauen(original: Nachricht, text: str, absender: str) -> EmailMessage:
    """Eine Antwort mit korrektem Faden (In-Reply-To, References) an Reply-To, sonst den Absender."""
    msg = EmailMessage()
    ziel = original.antwort_an or original.von
    _, an = parseaddr(ziel)
    msg["From"] = absender
    msg["To"] = an or ziel
    betreff = original.betreff or ""
    msg["Subject"] = betreff if betreff.lower().startswith("re:") else f"Re: {betreff}"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=absender.split("@", 1)[-1] or None)
    msg["Auto-Submitted"] = "auto-replied"
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
        self.tls = ssl.create_default_context()

    def _imap(self) -> imaplib.IMAP4:
        s = self.zugang.imap
        if s.secure:
            conn: imaplib.IMAP4 = imaplib.IMAP4_SSL(s.host, s.port, timeout=self.timeout, ssl_context=self.tls)
        else:
            conn = imaplib.IMAP4(s.host, s.port, timeout=self.timeout)
            conn.starttls(self.tls)
        conn.login(self.zugang.adresse, self.zugang.passwort)
        return conn

    @staticmethod
    def _holen(conn: imaplib.IMAP4, uid: bytes | str) -> tuple[bytes, str]:
        """Rohbytes und IMAP-Flags einer Mail, ohne sie als gelesen zu markieren."""
        _, teile = conn.uid("fetch", uid, "(FLAGS BODY.PEEK[])")
        roh = next((t[1] for t in teile if isinstance(t, tuple)), b"")
        # Die FLAGS stehen je nach Server vor dem Literal (im Tupelkopf) oder dahinter (als nackte Bytes).
        huelle = b" ".join(t[0] if isinstance(t, tuple) else t for t in teile if t)
        treffer = _FLAGS.search(huelle)
        return roh, treffer.group(1).decode(errors="replace") if treffer else ""

    def ungelesen(self, anzahl: int = 12, ordner: str = "INBOX") -> list[Nachricht]:
        conn = self._imap()
        try:
            conn.select(ordner, readonly=True)
            _, daten = conn.uid("search", None, "UNSEEN")
            uids = (daten[0] or b"").split()
            treffer: list[Nachricht] = []
            for uid in reversed(uids[-max(1, anzahl):]):
                roh, flags = self._holen(conn, uid)
                treffer.append(nachricht_aus_bytes(uid.decode(), roh, flags=flags))
            return treffer
        finally:
            conn.logout()

    def lesen(self, uid: str, ordner: str = "INBOX") -> Nachricht | None:
        conn = self._imap()
        try:
            conn.select(ordner, readonly=True)
            roh, flags = self._holen(conn, uid)
            return nachricht_aus_bytes(uid, roh, mit_text=True, flags=flags) if roh else None
        finally:
            conn.logout()

    def erledigt(self, uid: str, ordner: str = "INBOX", *, beantwortet: bool = False) -> None:
        conn = self._imap()
        try:
            conn.select(ordner)
            conn.uid("store", uid, "+FLAGS", "(\\Seen \\Answered)" if beantwortet else "(\\Seen)")
        finally:
            conn.logout()

    def senden(self, msg: EmailMessage) -> str:
        s = self.zugang.smtp
        if s.secure:
            with smtplib.SMTP_SSL(s.host, s.port, timeout=self.timeout, context=self.tls) as smtp:
                smtp.login(self.zugang.adresse, self.zugang.passwort)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.host, s.port, timeout=self.timeout) as smtp:
                smtp.starttls(context=self.tls)
                smtp.login(self.zugang.adresse, self.zugang.passwort)
                smtp.send_message(msg)
        return msg["Message-ID"]

    def antworten(self, uid: str, text: str) -> dict:
        original = self.lesen(uid)
        if original is None:
            return {"fehler": f"Mail {uid} nicht gefunden"}
        if original.automatisch:
            return {"gesendet": False, "fehler": f"Mail {uid} von {original.von!r} kommt von einem Automaten "
                    "(Newsletter, Autoresponder oder Bounce) und wird nicht beantwortet."}
        if original.beantwortet:
            return {"gesendet": False, "fehler": f"Mail {uid} ist schon als beantwortet markiert; keine zweite Antwort."}
        msg = antwort_bauen(original, text, self.zugang.adresse)
        # Erst markieren, dann senden: scheitert das Senden, bleibt die Mail markiert –
        # lieber eine Antwort zu wenig als eine doppelte beim nächsten Lauf.
        self.erledigt(uid, beantwortet=True)
        try:
            kennung = self.senden(msg)
        except Exception as exc:
            return {"gesendet": False, "fehler": f"Senden fehlgeschlagen ({type(exc).__name__}: {exc}). Mail {uid} ist "
                    "bereits als beantwortet markiert und wird nicht automatisch erneut beantwortet."}
        return {"gesendet": True, "an": msg["To"], "betreff": msg["Subject"], "message_id": kennung}


def als_dict(n: Nachricht) -> dict:
    d = asdict(n)
    if not d["text"]:
        d.pop("text")
    return d
