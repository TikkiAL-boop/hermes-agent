---
name: gemini-cli
description: "Aufgaben an die Gemini CLI im Google-Abo geben."
version: 1.0.0
author: Tikki
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [Coding-Agent, Gemini, Google, Abo]
    related_skills: [claude-code, codex, grok]
---

# Gemini CLI Skill

Gibt eine abgeschlossene Aufgabe an Googles Gemini CLI, die über das Google-Abo der Familie
angemeldet ist (kein API-Schlüssel, keine Zusatzkosten). Gut für lange Dokumente, große
Codebasen und Recherche mit Google-Suche. Kein Ersatz für den Raum: der Bot bleibt
verantwortlich und prüft, was zurückkommt.

## When to Use

- Ein Auftrag braucht sehr viel Kontext (ganze Ordner, lange PDFs, große Repos).
- Eine zweite Meinung zu Code oder Text von einem anderen Modell ist gewünscht.
- Der Raumleiter hat für diese Aufgabe ausdrücklich Gemini genannt.

## Prerequisites

- Gemini CLI installiert (`npm install -g @google/gemini-cli`) und einmal im Terminal mit
  dem Google-Konto angemeldet (`gemini`, dann „Login with Google“).
- Prüfen mit `terminal`: `gemini --version`. Fehlt sie, meldet der Bot das mit `BRAUCHE:`.

## How to Run

Immer nicht-interaktiv über `terminal`, im Arbeitsordner der Aufgabe:

```
gemini -p "<vollständige Aufgabe mit allen Fakten und dem gewünschten Ergebnisformat>"
```

Für maschinenlesbare Antworten `--output-format json` anhängen. Dateien gibt man mit
`@pfad` im Prompt mit (`gemini -p "Fasse @bericht.pdf zusammen"`).

## Quick Reference

| Zweck | Befehl |
|---|---|
| Einmalige Aufgabe | `gemini -p "…"` |
| Mit Datei | `gemini -p "… @datei.md"` |
| JSON-Ausgabe | `gemini -p "…" --output-format json` |
| Version / Anmeldung prüfen | `gemini --version` |

## Procedure

1. Aufgabe so formulieren, dass Gemini sie ohne Rückfrage lösen kann.
2. Mit `terminal` ausführen, Ausgabe vollständig lesen.
3. Ergebnis gegen die Fertig-Kriterien des Raumleiters prüfen; Fehler selbst beheben oder
   mit konkretem Mangel ein zweites Mal fragen.
4. Im Raum berichten: was Gemini geliefert hat und was geprüft ist.

## Pitfalls

- Ohne `-p` startet die interaktive Oberfläche und der Befehl hängt.
- Das Abo hat Tageslimits; bei „quota“ im Fehler auf ein anderes Modell ausweichen.
- Keine Geheimnisse in den Prompt schreiben.

## Verification

`gemini -p "Antworte nur mit OK"` liefert `OK`.
