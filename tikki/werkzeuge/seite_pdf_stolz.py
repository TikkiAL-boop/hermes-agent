# „Tikki – was wir hier gebaut haben“: die euphorische DIN-A4-Seite (Prompt für Google NotebookLM).
# Braucht reportlab + pypdf: python seite_pdf_stolz.py
from __future__ import annotations

import math
from pathlib import Path

from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from seite_pdf import GELB, GELB_HELL, GRAU, TINTE, txt  # registriert auch die Schriften

OUT = str(Path(__file__).resolve().parents[1] / "Tikki-stolz-auf-einer-Seite.pdf")
ROT = colors.HexColor("#B8321A")

body = ParagraphStyle("body", fontName="DV", fontSize=8.5, leading=10.8, textColor=TINTE, alignment=TA_JUSTIFY)
links = ParagraphStyle("links", parent=body, alignment=TA_LEFT)
small = ParagraphStyle("small", parent=body, fontSize=7.1, leading=8.9, textColor=GRAU)
h1 = ParagraphStyle("h1", fontName="DVB", fontSize=16, leading=19, textColor=TINTE)
h2 = ParagraphStyle("h2", fontName="DVB", fontSize=9.2, leading=11.5, textColor=TINTE, spaceBefore=4.2, spaceAfter=1.2)
prompt = ParagraphStyle("prompt", parent=body, backColor=GELB_HELL, borderPadding=(4, 5, 4, 5), borderColor=GELB,
                        borderWidth=0.6, leading=10.3)
cap = ParagraphStyle("cap", parent=small, alignment=1)
zahl = ParagraphStyle("zahl", fontName="DVB", fontSize=13, leading=14, textColor=TINTE, alignment=1)
zahl_u = ParagraphStyle("zahl_u", parent=small, alignment=1, fontSize=6.6, leading=8)

# Thorstens Flotte (Stand 02.10.2026)
SPARK, SPARK_GB = 22, 128
MAC_GROSS, MAC_GROSS_GB = 2, 512
MAC_MITTEL, MAC_MITTEL_GB = 3, 256
AMD_GB = 512
X86 = 10
UNIFIED_GB = SPARK * SPARK_GB + MAC_GROSS * MAC_GROSS_GB + MAC_MITTEL * MAC_MITTEL_GB + AMD_GB
RECHNER = SPARK + MAC_GROSS + MAC_MITTEL + 1 + X86


def zeichnung_flotte(w=61 * mm, h=52 * mm):
    """Die Hardware-Wand: jede Kachel ein Rechner, Fläche nach unified RAM."""
    d = Drawing(w, h)
    txt(d, w / 2, h - 4 * mm, "Die Flotte: %d Rechner, %s GB unified RAM" % (RECHNER, f"{UNIFIED_GB:,}".replace(",", ".")), 6.2, bold=True)
    x0 = 3 * mm
    k = 4.4 * mm
    y_top = h - 7 * mm
    for i in range(SPARK):
        r, c = divmod(i, 11)
        d.add(Rect(x0 + c * (k + 0.5 * mm), y_top - (r + 1) * k - r * 0.5 * mm, k, k, strokeColor=TINTE, strokeWidth=0.4, fillColor=GELB))
    y = y_top - 2 * k - 0.5 * mm - 3.6 * mm
    txt(d, x0, y, "%d × NVIDIA Spark · je %d GB" % (SPARK, SPARK_GB), 5.2, anchor="start", color=GRAU)
    y -= 2 * mm
    bx = x0
    for gb in [MAC_GROSS_GB] * MAC_GROSS + [MAC_MITTEL_GB] * MAC_MITTEL:
        bw = (9.5 if gb == 512 else 6.8) * mm
        d.add(Rect(bx, y - 6 * mm, bw, 6 * mm, strokeColor=TINTE, strokeWidth=0.5, fillColor=GELB_HELL))
        txt(d, bx + bw / 2, y - 4 * mm, str(gb), 5.4, bold=True)
        bx += bw + 0.8 * mm
    d.add(Rect(bx + 1 * mm, y - 6 * mm, 10.5 * mm, 6 * mm, strokeColor=TINTE, strokeWidth=0.5, fillColor=colors.white))
    txt(d, bx + 6.25 * mm, y - 2.8 * mm, "AMD", 5.2, bold=True)
    txt(d, bx + 6.25 * mm, y - 5.3 * mm, ">%d GB" % AMD_GB, 4.8, color=GRAU)
    y -= 6 * mm + 3.6 * mm
    txt(d, x0, y, "5 × Mac Studio M3 Ultra (2×512, 3×256 GB) · 1 × AMD-KI-Rechner", 5.0, anchor="start", color=GRAU)
    y -= 2 * mm
    for i in range(X86):
        d.add(Rect(x0 + i * 4.3 * mm, y - 3.2 * mm, 3.6 * mm, 3.2 * mm, strokeColor=TINTE, strokeWidth=0.4, fillColor=colors.white))
    y -= 3.2 * mm + 3.4 * mm
    txt(d, x0, y, "%d × x86 Research-Knoten (schnelle Recherche)" % X86, 5.0, anchor="start", color=GRAU)
    txt(d, w / 2, 2.5 * mm, "Nur Strom. Keine Tokenrechnung, kein Zähler, der tickt.", 5.8, bold=True, color=ROT)
    return d


def zeichnung_tokens(w=61 * mm, h=52 * mm):
    """Vier Quellen links, der Raum rechts: jeder Raum wählt frei."""
    d = Drawing(w, h)
    quellen = [("Abo-CLIs", "Claude · Codex · Gemini · Grok", "Tokens quasi unbegrenzt"),
               ("API-Katalog", "Hunderte Modelle, ein Anbieter", "frei je Rolle und Raum"),
               ("NVIDIA-Katalog", "die komplette NIM-Auswahl", "auf Sparks oder gehostet"),
               ("Lokal", "70B / 122B MoE, unzensiert", "läuft auf der eigenen Flotte")]
    bw, bh, abstand = 31 * mm, 9.6 * mm, 2.2 * mm
    x = 2 * mm
    y = h - 3 * mm
    rx, ry, rw, rh = 38 * mm, h / 2 - 11 * mm, 21 * mm, 22 * mm
    for t, z1, z2 in quellen:
        y -= bh
        d.add(Rect(x, y, bw, bh, strokeColor=TINTE, strokeWidth=0.7, fillColor=colors.white, rx=1.5, ry=1.5))
        txt(d, x + bw / 2, y + bh - 3.4 * mm, t, 6.0, bold=True)
        txt(d, x + bw / 2, y + bh - 6.0 * mm, z1, 4.5, color=GRAU)
        txt(d, x + bw / 2, y + 1.4 * mm, z2, 4.5, color=GRAU)
        d.add(Line(x + bw, y + bh / 2, rx, ry + rh / 2, strokeColor=TINTE, strokeWidth=0.6))
        y -= abstand
    d.add(Polygon([rx, ry + rh / 2, rx - 2.4, ry + rh / 2 + 1.7, rx - 2.4, ry + rh / 2 - 1.7], fillColor=TINTE, strokeColor=None))
    d.add(Rect(rx, ry, rw, rh, strokeColor=TINTE, strokeWidth=0.9, fillColor=GELB, rx=2, ry=2))
    for i, z in enumerate(["Jeder Raum", "wählt frei:", "", "Raumleiter", "Deine KI", "11 Rollen", "Übungsläufe"]):
        txt(d, rx + rw / 2, ry + rh - 3.6 * mm - i * 2.8 * mm, z, 5.8 if i < 2 else 5.0, bold=(i < 2))
    return d


def zeichnung_vergleich(w=61 * mm, h=52 * mm):
    """Links die Firma, rechts die Familie."""
    d = Drawing(w, h)
    sp = (w - 9 * mm) / 2
    def spalte(x, titel, zeilen, fill):
        d.add(Rect(x, 2 * mm, sp, h - 5 * mm, strokeColor=TINTE, strokeWidth=0.7, fillColor=fill, rx=2, ry=2))
        txt(d, x + sp / 2, h - 7 * mm, titel, 5.9, bold=True)
        d.add(Line(x + 2 * mm, h - 9 * mm, x + sp - 2 * mm, h - 9 * mm, strokeColor=TINTE, strokeWidth=0.4))
        y = h - 13.5 * mm
        for z in zeilen:
            txt(d, x + 2 * mm, y, z, 4.8, anchor="start")
            y -= 4.9 * mm
    spalte(3 * mm, "Firma, KI-Abteilung", [
        "Hunderte Mitarbeiter", "Budget, Freigaben, Tickets", "Tokenrechnung je Monat",
        "Ein Modell, ein Anbieter", "Audit je Werkzeug", "Wissen in Silos", "Monate bis zum Rollout"], colors.white)
    spalte(6 * mm + sp, "Familie + Tikki", [
        "Ein Mensch, 14 Bots", "Ein Satz, Raum geht auf", "Strom statt Tokens",
        "Hunderte Modelle je Raum", "Alles im eigenen Haus", "Ein Gedächtnis je Mensch", "Heute installiert"], GELB_HELL)
    mx = 3 * mm + sp + 1.5 * mm
    d.add(Line(mx - 0.5 * mm, h / 2 - 2 * mm, mx + 2.5 * mm, h / 2 - 2 * mm, strokeColor=ROT, strokeWidth=1.2))
    d.add(Polygon([mx + 3 * mm, h / 2 - 2 * mm, mx + 1 * mm, h / 2 - 0.6 * mm, mx + 1 * mm, h / 2 - 3.4 * mm], fillColor=ROT, strokeColor=None))
    return d


def kennzahlen():
    daten = [[Paragraph(f"{UNIFIED_GB:,}".replace(",", ".") + " GB", zahl), Paragraph(str(RECHNER), zahl), Paragraph("14", zahl),
              Paragraph("128", zahl), Paragraph("∞", zahl)],
             [Paragraph("unified RAM in der Flotte", zahl_u), Paragraph("Rechner im Haus", zahl_u), Paragraph("Bots mit eigener Persönlichkeit", zahl_u),
              Paragraph("Bots je Raum (statt 6)", zahl_u), Paragraph("Tokens über Abo-CLIs, nur Strom", zahl_u)]]
    t = Table(daten, colWidths=[36.8 * mm] * 5)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, GELB), ("BACKGROUND", (0, 0), (-1, -1), GELB_HELL),
                           ("LINEBEFORE", (1, 0), (-1, -1), 0.4, GELB), ("TOPPADDING", (0, 0), (-1, 0), 4), ("BOTTOMPADDING", (0, 1), (-1, 1), 4),
                           ("TOPPADDING", (0, 1), (-1, 1), 0), ("BOTTOMPADDING", (0, 0), (-1, 0), 0)]))
    return t


def bauen():
    doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=13 * mm, rightMargin=13 * mm, topMargin=10 * mm, bottomMargin=8 * mm,
                            title="Tikki – was wir hier gebaut haben", author="Tikki-Projekt", subject="Prompt für Google NotebookLM")
    s = []
    s.append(Paragraph("Tikki – was wir hier gebaut haben", h1))
    s.append(Paragraph("Die stolze Fassung. Ein Haus voller KI-Räume, eine Rechenflotte, die sonst in Firmen mit Hunderten Mitarbeitern steht, "
                       "und eine Familie, die das alles einfach benutzt. Stand 2. Oktober 2026, Repo <b>TikkiAL-boop/hermes-agent</b>, Zweig <b>tikki-app</b>.", small))
    s.append(Spacer(1, 4))
    s.append(Paragraph(
        "<b>Prompt an NotebookLM:</b> Du bist der begeisterte Erklärer meines Projekts <b>Tikki</b>. Nimm diese Seite als Quelle und erzähle jedem, "
        "der fragt, was hier entstanden ist und warum es einzigartig ist: ein Familien-KI-System mit eigener Rechenflotte, Hunderten Modellen zur freien "
        "Wahl und praktisch unbegrenzten Tokens, bei dem jedes Projekt ein Raum voller Bots ist. Sei stolz, aber bleibe bei den Fakten dieser Seite.", prompt))

    s.append(Paragraph("1 · Was wir erreicht haben", h2))
    s.append(Paragraph(
        "Aus dem offenen Agenten Hermes ist <b>Tikki</b> geworden: eine Mac-App, in der ein Projekt kein Chatfenster ist, sondern ein <b>Raum</b> mit "
        "vier Wänden, rundem Tisch und einer Besatzung, die auch arbeitet, wenn die App zu ist. Am Eingang steht die persönliche Assistentin Tikki, die "
        "empfängt, das Briefing gibt, Post beantwortet und aus einem Satz einen Raum macht. Im Raum führt ein <b>Raumleiter</b> (Grok 4.7), daneben "
        "sitzen Tikki und <b>Deine KI</b>, dazu bis zu 125 weitere Rollen aus dem Katalog. Räume haben Türen zueinander, lassen sich verschmelzen, laufen "
        "im Takt rund um die Uhr, und ein Wachhalter weckt, was still wird. Installation mit einem Befehl, Selbsttest grün, Räume in der echten App "
        "gegen das echte Gateway durchgespielt. Das ist kein Prototyp, das läuft.", body))

    s.append(Paragraph("2 · Warum das einzigartig ist", h2))
    s.append(Paragraph(
        "<b>Modellfreiheit.</b> Über die Abo-CLIs (Claude, Codex, Gemini, Grok, Cursor) sind die Tokens praktisch unbegrenzt; dazu ein API-Katalog mit "
        "Hunderten Modellen und die komplette NVIDIA-Modellauswahl, jedes Modell je Rolle und je Raum frei wählbar, mit Ausweichkette, wenn eins ausfällt. "
        "<b>Übungsläufe</b> lassen denselben Auftrag parallel mit verschiedenen Modellen laufen, das erste fertige Ergebnis gewinnt, und der Raumleiter "
        "lernt aus dem Vergleich. <b>Eigene Hardware.</b> %d NVIDIA Spark mit je %d GB, fünf Mac Studio M3 Ultra (zwei mit 512 GB, drei mit 256 GB), "
        "ein AMD-KI-Rechner mit über %d GB unified RAM und zehn schnelle x86-Knoten für Recherche: zusammen <b>über %s GB unified RAM</b> auf %d Rechnern. "
        "Damit laufen 70B- und 122B-Mixture-of-Experts-Modelle lokal, unzensiert, mit MLX, und die einzige laufende Rechnung ist der Strom. "
        "<b>Alles im Haus.</b> Gedächtnis je Mensch, Post, Räume und Modelle liegen auf eigenen Platten; nichts davon braucht einen fremden Dienst."
        % (SPARK, SPARK_GB, AMD_GB, f"{UNIFIED_GB:,}".replace(",", "."), RECHNER), body))

    s.append(Spacer(1, 3))
    s.append(kennzahlen())
    s.append(Spacer(1, 3))
    zeile = Table([[zeichnung_flotte(), zeichnung_tokens(), zeichnung_vergleich()],
                   [Paragraph("Die Rechenflotte, Kachel für Kachel", cap), Paragraph("Vier Token-Quellen, ein Raum", cap),
                    Paragraph("Firma gegen Familie", cap)]], colWidths=[61 * mm, 61 * mm, 61 * mm])
    zeile.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, 0), 1), ("BOTTOMPADDING", (0, 1), (-1, 1), 0)]))
    s.append(KeepTogether(zeile))

    s.append(Paragraph("3 · Firma gegen Familie", h2))
    s.append(Paragraph(
        "Eine KI-Abteilung mit Hunderten Mitarbeitern hat Budgetrunden, Freigaben, eine Tokenrechnung, die jeden Monat wächst, meist einen Anbieter und "
        "ein Modell, Datenschutz-Audits je Werkzeug und Wissen, das in Silos liegt. Hier: ein Mensch sagt einen Satz, und ein Raum geht auf. Vierzehn Bots "
        "mit eigener Persönlichkeit, jeder mit dem Modell, das zu seiner Aufgabe passt. Keine Tokenrechnung, weil die Flotte im Keller steht und die Abos "
        "die Spitzen abfangen. Ein Gedächtnis je Familienmitglied statt eines Firmen-Wikis. Und alles, was eine Firma in Monaten ausrollt, ist hier ein "
        "Skript, das in einer Kaffeepause durchläuft. Das <b>Family-KI-Konzept</b> dreht die Reihenfolge um: nicht Werkzeuge für Abteilungen, sondern ein "
        "Haus, in dem die KI die Räume bewohnt und die Familie darin lebt. Kinder werden ernst genommen, Sorgen zuerst gehört, Technik bleibt unsichtbar.", body))

    s.append(Paragraph("4 · Was als Nächstes kommt", h2))
    s.append(Paragraph(
        "Der <b>MR-Bot</b> (Model Resources) behält Schlüssel, Limits, Abos, CLIs und lokale Modelle im Blick und sagt dem Raumleiter, welche Kraft gerade frei "
        "ist. <b>Deine KI spricht</b>: lokale Stimme auf der Flotte, xAI Ara als zweiter Kanal. Eine <b>photorealistische 3D-Oberfläche</b> für die Räume. "
        "Die Flotte wird eingebunden: Modelle auf die Sparks und Macs verteilt, Räume über Rechner verteilt, Raumleiter-Klone für echte Parallelität. "
        "Zum Schluss der Login nur für eigene Domains mit PIN per Mail.", links))
    s.append(Spacer(1, 3))
    s.append(Paragraph("Quellen im Repo: tikki/HANDOVER.md, tikki/README.md, tikki/rollen/KATALOG.json, tikki/Tikki-auf-einer-Seite.pdf (die nüchterne Fassung), "
                       "Draft-PR github.com/TikkiAL-boop/hermes-agent/pull/1. Hardware-Angaben: Thorsten, 02.10.2026.", small))
    doc.build(s)


if __name__ == "__main__":
    bauen()
    from pypdf import PdfReader
    print("Seiten:", len(PdfReader(OUT).pages))
