# Eine DIN-A4-Seite „Tikki auf einer Seite“ (Prompt für Google NotebookLM, drei Zeichnungen). Braucht reportlab + pypdf: python seite_pdf.py
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, Circle, String, Line, Polygon, Wedge

pdfmetrics.registerFont(TTFont("DV", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DVB", italic="DV", boldItalic="DVB")

GELB = colors.HexColor("#F2C230")
GELB_HELL = colors.HexColor("#FFF4C2")
TINTE = colors.HexColor("#2B2410")
GRAU = colors.HexColor("#6B6250")

OUT = str(Path(__file__).resolve().parents[1] / "Tikki-auf-einer-Seite.pdf")

body = ParagraphStyle("body", fontName="DV", fontSize=8.1, leading=10.2, textColor=TINTE, alignment=TA_JUSTIFY)
small = ParagraphStyle("small", parent=body, fontSize=7.2, leading=9, textColor=GRAU)
h1 = ParagraphStyle("h1", fontName="DVB", fontSize=15, leading=18, textColor=TINTE)
h2 = ParagraphStyle("h2", fontName="DVB", fontSize=9.2, leading=11.5, textColor=TINTE, spaceBefore=4.5, spaceAfter=1.2)
prompt = ParagraphStyle("prompt", parent=body, backColor=GELB_HELL, borderPadding=(4, 5, 4, 5), borderColor=GELB,
                        borderWidth=0.6, leading=10.4)
cap = ParagraphStyle("cap", parent=small, alignment=1)
links = ParagraphStyle("links", parent=body, alignment=TA_LEFT)


def txt(d, x, y, s, size=6.4, bold=False, anchor="middle", color=TINTE):
    d.add(String(x, y, s, fontName="DVB" if bold else "DV", fontSize=size, textAnchor=anchor, fillColor=color))


def zeichnung_raum(w=60 * mm, h=50 * mm):
    """Ein Raum von oben: vier Wände, runder Tisch, Bots, eine Tür zum Nachbarraum."""
    import math
    d = Drawing(w, h)
    m = 3 * mm
    top = h - 4 * mm
    d.add(Rect(m, m, w - 2 * m, top - m, strokeColor=TINTE, strokeWidth=1.1, fillColor=GELB_HELL))
    def tafel(x, y, bw, bh, name):
        d.add(Rect(x, y, bw, bh, strokeColor=TINTE, strokeWidth=0.6, fillColor=colors.white))
        txt(d, x + bw / 2, y + bh / 2 - 2, name, 5.4, bold=True)
    tafel(m + 1.2 * mm, top - 5.2 * mm, 17 * mm, 4 * mm, "TO-DO-WAND")      # oben links
    tafel(w - m - 1.2 * mm - 13 * mm, top - 5.2 * mm, 13 * mm, 4 * mm, "DATEN")   # oben rechts
    tafel(w - m - 1.2 * mm - 14 * mm, m + 1.2 * mm, 14 * mm, 4 * mm, "OUTPUT")   # unten rechts
    # Tür in der linken Wand, unten
    d.add(Rect(m - 0.7, m + 7 * mm, 1.4, 7 * mm, strokeColor=None, fillColor=GELB_HELL))
    d.add(Line(m, m + 7 * mm, m + 5 * mm, m + 11.5 * mm, strokeColor=TINTE, strokeWidth=0.9))
    txt(d, m + 1.2 * mm, m + 1.5 * mm, "TÜR zum Nachbarraum", 5.0, anchor="start", color=GRAU)
    cx, cy, r = w / 2 + 1 * mm, (top + m) / 2 - 0.5 * mm, 6 * mm
    d.add(Circle(cx, cy, r, strokeColor=TINTE, strokeWidth=0.9, fillColor=GELB))
    txt(d, cx, cy - 2, "Tisch", 5.6, bold=True)
    namen = ["Raumleiter", "Tikki (PA)", "Deine KI", "Rechercheur", "Prüfer", "… weitere"]
    ring = r + 3.6 * mm
    for i, n in enumerate(namen):
        a = math.pi / 2 + i * 2 * math.pi / len(namen)
        bx, by = cx + math.cos(a) * ring, cy + math.sin(a) * ring
        d.add(Circle(bx, by, 1.8 * mm, strokeColor=TINTE, strokeWidth=0.6, fillColor=colors.white if i else GELB))
        c = math.cos(a)
        if abs(c) < 0.3:
            anchor, tx, ty = "middle", bx, (by + 2.6 * mm if math.sin(a) > 0 else by - 2.6 * mm - 4)
        else:
            anchor, tx, ty = ("start", bx + 2.6 * mm, by - 2) if c > 0 else ("end", bx - 2.6 * mm, by - 2)
        txt(d, tx, ty, n, 5.2, bold=(i == 0), anchor=anchor)
    txt(d, w / 2, 0.6 * mm, "Ein Projekt = ein Raum. Alle am Tisch lesen alles mit.", 5.4, color=GRAU)
    return d


def zeichnung_technik(w=60 * mm, h=50 * mm):
    """Schichten: App – Backend – Gateway (24/7) – Räume/Profile/Daueraufträge – Modelle."""
    d = Drawing(w, h)
    def box(x, y, bw, bh, titel, zeile=None, fill=colors.white):
        d.add(Rect(x, y, bw, bh, strokeColor=TINTE, strokeWidth=0.8, fillColor=fill, rx=1.5, ry=1.5))
        txt(d, x + bw / 2, y + bh - 7.5 if zeile else y + bh / 2 - 2.2, titel, 6.2, bold=True)
        if zeile:
            txt(d, x + bw / 2, y + 2.6, zeile, 4.9, color=GRAU)
    def pfeil(x1, y1, x2, y2):
        d.add(Line(x1, y1, x2, y2, strokeColor=TINTE, strokeWidth=0.8))
        d.add(Polygon([x2, y2, x2 - 1.6, y2 + 2.4, x2 + 1.6, y2 + 2.4], fillColor=TINTE, strokeColor=None))
    bw = w - 8 * mm
    x = 4 * mm
    box(x, h - 10 * mm, bw, 8.5 * mm, "Tikki-App (Mac, Electron)", "Übersicht · Suites · Browser · Post · Terminal · Admin", GELB_HELL)
    pfeil(w / 2, h - 10 * mm, w / 2, h - 13 * mm)
    box(x, h - 21 * mm, bw, 8 * mm, "Backend „hermes serve“ (lokal)", "startet mit der App, endet mit ihr")
    pfeil(w / 2, h - 21 * mm, w / 2, h - 24 * mm)
    box(x, h - 32 * mm, bw, 8 * mm, "Host-Gateway (läuft rund um die Uhr)", "fährt Räume, Daueraufträge, Wachhalter", GELB)
    pfeil(w / 2, h - 32 * mm, w / 2, h - 35 * mm)
    k = (bw - 2 * 2 * mm) / 3
    for i, (t, z) in enumerate([("Räume", "shared-state.db"), ("14 Profile", "1 Bot = 1 Profil"), ("Modelle", "Cursor·xAI·lokal")]):
        box(x + i * (k + 2 * mm), 1 * mm, k, 9 * mm, t, z)
    return d


def zeichnung_installation(w=60 * mm, h=50 * mm):
    """Drei Schritte zur laufenden App und der Weg der Bots."""
    d = Drawing(w, h)
    schritte = [("1", "Zweig holen", "git clone -b tikki-app …"),
                ("2", "installieren.sh", "Kern, 14 Rollen, App, Gateway, Selbsttest"),
                ("3", "open -a Tikki", "oder DMG aus den GitHub-Releases")]
    y = h - 9 * mm
    for n, t, z in schritte:
        d.add(Circle(6 * mm, y, 3 * mm, strokeColor=TINTE, strokeWidth=0.8, fillColor=GELB))
        txt(d, 6 * mm, y - 2.2, n, 6.5, bold=True)
        txt(d, 11 * mm, y + 0.4, t, 6.6, bold=True, anchor="start")
        txt(d, 11 * mm, y - 5.2, z, 5.2, anchor="start", color=GRAU)
        if n != "3":
            d.add(Line(6 * mm, y - 3 * mm, 6 * mm, y - 7.5 * mm, strokeColor=TINTE, strokeWidth=0.8))
        y -= 10.5 * mm
    # Schlüssel-Kasten
    d.add(Rect(3 * mm, 1.5 * mm, w - 6 * mm, 9.5 * mm, strokeColor=TINTE, strokeWidth=0.6, fillColor=colors.white, strokeDashArray=[2, 1.5]))
    txt(d, w / 2, 7.6 * mm, "Schlüssel: nur in der Datei cvcv.txt", 5.8, bold=True)
    txt(d, w / 2, 3.2 * mm, "schluessel-einlesen.sh liest sie ein, zeigt nie Werte", 5.2, color=GRAU)
    return d


def bauen():
    doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=13 * mm, rightMargin=13 * mm, topMargin=11 * mm, bottomMargin=9 * mm,
                            title="Tikki auf einer Seite", author="Tikki-Projekt", subject="Prompt für Google NotebookLM")
    s = []
    s.append(Paragraph("Tikki auf einer Seite", h1))
    s.append(Paragraph("Was diese App ist, wie sie gebaut ist und wie man sie betreibt – als Prompt für Google NotebookLM. Stand 2. Oktober 2026, "
                       "Repo <b>TikkiAL-boop/hermes-agent</b>, Zweig <b>tikki-app</b>.", small))
    s.append(Spacer(1, 4))
    s.append(Paragraph(
        "<b>Prompt an NotebookLM:</b> Du bist mein Erklärer für mein Softwareprojekt <b>Tikki</b>. Nimm diese Seite als einzige Quelle. "
        "Erkläre mir auf Nachfrage in einfachem Deutsch, was Tikki kann, welche Teile es gibt, wie sie zusammenhängen und was noch offen ist. "
        "Bleibe bei dem, was hier steht; wenn etwas nicht drinsteht, sag das. Verwende die Begriffe genau so wie hier (Raum, Raumleiter, "
        "Übersicht, Briefing, Dauerauftrag, Tür, Verschmelzen, Gateway, Profil, Rolle).", prompt))

    s.append(Paragraph("1 · Kurz gesagt", h2))
    s.append(Paragraph(
        "Tikki ist eine eigene Mac-App auf Basis des Open-Source-Agenten <b>Hermes Agent</b> (Nous Research, MIT). Sie macht aus einem KI-Agenten "
        "ein <b>Haus mit Räumen</b>: jedes Projekt bekommt einen Raum, in dem ein Raumleiter mit beliebig vielen spezialisierten Bots arbeitet – "
        "auch dann, wenn die App geschlossen ist. Am Eingang steht die persönliche Assistentin <b>Tikki</b>: sie empfängt, gibt das Briefing, "
        "erledigt Post und Daueraufträge und macht aus Wünschen Räume. Der Hermes-Kern ist bis auf zwei kleine, dokumentierte Stellen unverändert; "
        "alles Eigene liegt in <b>tikki/</b> und in den App-Bereichen.", body))

    s.append(Paragraph("2 · Die sechs Bereiche der App (linke Leiste)", h2))
    s.append(Paragraph(
        "<b>Übersicht</b> – Raumübersicht mit Tikki: Begrüßung, Tagesbriefing (erledigte Aufträge, Post, Räume, die den Menschen brauchen, WhatsApp), "
        "Karte „Daueraufträge“, Browserzeile. Sagt man „Plan mir …“, antwortet Tikki mit <i>RAUM:</i> und <i>ZIEL:</i>, und der Raum öffnet sich. "
        "<b>Suites</b> – die Räume (Abschnitt 3). <b>Browser</b> – eingebaut, klickt Cookie-Banner selbst weg. <b>Post</b> – eigener Mail-Client "
        "für name@tikki.team. <b>Terminal</b> – Kommandozeile. <b>Admin</b> – Bots, Gedächtnis, Betrieb (Übungsläufe, Briefing-Automatik). "
        "Design „Gelbes Glas“: gelbe Glasflächen, Raumbild in Zentralperspektive, kein Hermes-Branding sichtbar.", body))

    s.append(Paragraph("3 · Räume, Bots, Dauerbetrieb", h2))
    s.append(Paragraph(
        "Ein Raum ist technisch ein <b>gehosteter Gruppenraum von Hermes</b>. In jedem Raum sitzen von Anfang an drei: der <b>Raumleiter</b> "
        "(Grok 4.7 über das Cursor-Abo, Ausweich xAI), <b>Tikki</b> (bringt Wissen über den Menschen, Post, Aufträge) und <b>Deine KI</b> "
        "(persönliches Modell, später lokal, mit Sprache). Dazu holt der Raumleiter Rollen aus dem Katalog: Rechercheur, Prüfer, Schreiber, Frontend- und "
        "Backend-Entwickler, Sicherheitsbeauftragter, Datenanalyst, Organisator, API-Fachmann, Übersetzer, Wachhalter. Alle lesen alles mit; wer nichts "
        "beizutragen hat, schweigt. Der Raumleiter führt mit festen Zeilen: <i>STAND:</i>, <i>AUFGABEN:</i> (To-do-Wand), <i>BRAUCHE:</i> (eine Entscheidung "
        "des Menschen), <i>FERTIG:</i>. <b>Türen</b> tragen eine Nachricht in einen anderen Raum, <b>Verschmelzen</b> macht aus zwei Räumen einen mit "
        "vereinter Besatzung. Räume mit <i>TAKT:</i> („täglich 06:00“) laufen als Dauerauftrag; der <b>Wachhalter</b> weckt alle 15 Minuten stille Räume; "
        "<b>Übungsläufe</b> lassen denselben Auftrag parallel mit anderen Ansätzen laufen, das erste fertige Ergebnis gewinnt.", body))

    s.append(Spacer(1, 3))
    zeile = Table([[zeichnung_raum(), zeichnung_technik(), zeichnung_installation()],
                   [Paragraph("Der Raum: vier Wände, runder Tisch, Tür", cap),
                    Paragraph("Schichten: App, Backend, Gateway", cap),
                    Paragraph("Einrichten in drei Schritten", cap)]],
                  colWidths=[61 * mm, 61 * mm, 61 * mm])
    zeile.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                               ("BOTTOMPADDING", (0, 1), (-1, 1), 0)]))
    s.append(KeepTogether(zeile))

    s.append(Paragraph("4 · Unter der Haube", h2))
    s.append(Paragraph(
        "Die App (Electron, React) spricht per JSON-RPC mit einem lokalen Backend <b>hermes serve</b>. Jeder Bot ist ein eigenes <b>Hermes-Profil</b> "
        "(eigene Konfiguration, eigenes Modell mit Ausweichkette, eigene Werkzeuge, eigene SOUL-Datei als Persönlichkeit); 14 Profile richtet das Skript "
        "<i>rollen-einrichten.sh</i> ein. Genau <b>ein Host-Gateway</b> aus dem Hauptprofil läuft rund um die Uhr und bedient alle Profile: es fährt die "
        "Räume (Speicher <i>shared-state.db</i>), die Daueraufträge (Hermes-Cronjobs), Takt und Wachhalter. <b>Gedächtnis</b>: Honcho als Anbieter plus das "
        "Plugin <i>gedaechtnis</i> (Wissensdatenbank je Mensch, RAG, Werkzeug <i>nachschlagen</i>). <b>Post</b>: Plugin <i>pa</i> mit Werkzeug <i>post</i> "
        "(lesen, antworten, senden; „schick weg“ heißt schicken) und <i>briefing_sammeln</i>. <b>Modelle</b>: über Abos (Cursor, Claude, Codex, Gemini, "
        "Grok) oder Schlüssel; ein lokales Modell über den Anbieter <i>lokal</i> (braucht mindestens 64k Kontext). Schlüssel stehen nur in der "
        "Datei <i>~/.hermes/.env</i>, nie im Code, Chat oder in SOULs.", body))

    s.append(Paragraph("5 · Einrichten, aktualisieren, prüfen", h2))
    s.append(Paragraph(
        "Ein Befehl: <i>~/.hermes/hermes-agent/tikki/installieren.sh</i> (Hermes-Kern, Tikki.app nach /Programme, Rollen, Plugins, Cronjobs, Schlüssel "
        "aus cvcv.txt, Gateway, Selbsttest ✓/⚠/✗). Aktualisieren: <i>git pull</i> und dasselbe Skript. Prüfen: <i>selbsttest.py</i>. Für einen zweiten "
        "Rechner baut der GitHub-Workflow „Tikki App (macOS Download)“ ein DMG unter Releases (unsigniert: beim ersten Start Rechtsklick → Öffnen). "
        "Von der Kommandozeile: <i>raeume.py anlegen|senden|verlauf|verschmelzen|tuer</i>, <i>suite_takt.py takt|bericht</i>, <i>hermes pa briefing|post</i>.", links))

    s.append(Paragraph("6 · Stand und offene Punkte", h2))
    s.append(Paragraph(
        "<b>Geprüft:</b> Installation auf dem Mac (Selbsttest 7 ✓), Räume in der App gegen das laufende Gateway (anlegen, Auftrag, Türen, Verschmelzen), "
        "App-Tests 12.402 grün, Tikki-Tests 44 grün. <b>Noch nicht gebaut:</b> MR-Bot (behält Schlüssel, Limits, Abos und lokale Modelle im Blick und meldet "
        "dem Raumleiter), Sprache (lokale KI mit Stimme, xAI Ara als zweiter Kanal), 3D-Oberfläche, lokales MLX-Modell (70B/122B MoE, unzensiert) im "
        "Vergleich zur API, Login nur für eigene Domains mit PIN per Mail (erst nach der Testphase), feste API-Regeln, Raumleiter-Klone für echte Parallelität.", body))
    s.append(Spacer(1, 3))
    s.append(Paragraph("Quellen im Repo: tikki/HANDOVER.md (Übergabe, Abschnitte 1.0, 3, 4.2a', 4.7a, 4.8, 10), tikki/README.md, tikki/rollen/KATALOG.json, "
                       "Draft-PR github.com/TikkiAL-boop/hermes-agent/pull/1.", small))
    doc.build(s)


if __name__ == "__main__":
    bauen()
    from pypdf import PdfReader
    print("Seiten:", len(PdfReader(OUT).pages))
