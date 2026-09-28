---
name: notebooklm
description: "Quellen in NotebookLM auswerten und Audio erzeugen."
version: 1.0.0
author: Tikki
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [Recherche, Google, NotebookLM, Abo, Browser]
    related_skills: [gemini-cli]
---

# NotebookLM Skill

NotebookLM hat für Privatkonten keine Kommandozeile und keine offene API. Tikki bedient es
deshalb im Browser mit dem angemeldeten Google-Konto der Familie: Notizbuch anlegen,
Quellen hinzufügen, Fragen stellen, Audio-Zusammenfassung erzeugen. Für Firmenkonten gibt
es die NotebookLM-Enterprise-API in Google Cloud; die nutzt dieser Skill nicht.

## When to Use

- Viele Quellen (PDFs, Webseiten, YouTube-Videos) sollen gemeinsam ausgewertet werden.
- Der Mensch möchte eine Audio-Zusammenfassung („Podcast“) zu einem Thema.
- Der Raumleiter nennt NotebookLM ausdrücklich.

## Prerequisites

- Browser-Werkzeuge (`browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`).
- Lokales Surfen mit dem echten Browserprofil ist eingeschaltet (Einstellungen → Browser),
  und das Google-Konto ist dort angemeldet. Sonst meldet der Bot `BRAUCHE: Google-Anmeldung
  im Browser für NotebookLM`.

## How to Run

1. `browser_navigate` zu `https://notebooklm.google.com`.
2. `browser_snapshot`, dann „Neues Notizbuch“ öffnen.
3. Quellen hinzufügen: Links einfügen oder Dateien aus dem Arbeitsordner hochladen.
4. Fragen im Chatfeld stellen; Antworten mit ihren Quellenangaben übernehmen.
5. Für Audio: „Audio-Zusammenfassung“ erzeugen, warten, Datei herunterladen und den Pfad im
   Raum nennen (landet im Output-Screen).

## Quick Reference

| Schritt | Werkzeug |
|---|---|
| Seite öffnen | `browser_navigate` |
| Zustand lesen | `browser_snapshot` |
| Klicken / Tippen | `browser_click`, `browser_type` |
| Ergebnis sichern | `write_file` in den Arbeitsordner |

## Procedure

1. Quellen vorher sammeln (Rechercheur), dann in einem Durchgang hochladen.
2. Fragen präzise stellen, Antworten wörtlich mit Quellenangabe übernehmen.
3. Ergebnis als Markdown im Arbeitsordner ablegen und im Raum berichten.

## Pitfalls

- Die Oberfläche ändert sich; immer erst `browser_snapshot`, nie blind klicken.
- Audio-Zusammenfassungen brauchen mehrere Minuten; zwischendurch mit `browser_snapshot`
  prüfen statt neu zu starten.
- Quellenlimit je Notizbuch beachten; große Sammlungen auf mehrere Notizbücher verteilen.

## Verification

Das Notizbuch zeigt alle Quellen, und die Antwort auf eine Kontrollfrage nennt eine Quelle.
