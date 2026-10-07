// Übungsläufe: a new project runs N times — the person's own room plus N-1
// practice rooms with another model and another approach. The first result to
// finish reaches the person's room; once all are done, the room lead writes
// what it learned. Both steps run on the backend (tikki/werkzeuge/suite_takt.py).

export interface Ansatz {
  /** Room-lead clone (catalogue `klon_von: raumleiter`) that leads this practice room; empty keeps the room lead. */
  klon?: string
  /** Short label for the lobby and the room header. */
  kurz: string
  /** The approach the practice room must follow, in the room lead's words. */
  text: string
}

/** Practice runs cycle through these: different APIs, different ways of working. */
export const ANSAETZE: readonly Ansatz[] = [
  {
    klon: 'raumleiter-xai',
    kurz: 'schnell',
    text: 'Schnell und pragmatisch: kleinstes Team, kürzester Weg zu einem brauchbaren Ergebnis.'
  },
  {
    klon: 'raumleiter-anthropic',
    kurz: 'gründlich',
    text: 'Gründlich: erst recherchieren und planen, nach jeder Runde den Prüfer einsetzen.'
  },
  {
    klon: 'raumleiter-codex',
    kurz: 'breit',
    text: 'Maximal parallel: die Aufgabe fein zerlegen und viele Bots gleichzeitig arbeiten lassen.'
  },
  {
    klon: 'raumleiter-lokal',
    kurz: 'lokal',
    text: 'Nur Hausmittel: alles mit den lokalen Modellen im Haus, ohne Cloud-Dienste.'
  },
  {
    klon: 'raumleiter-xai',
    kurz: 'andersrum',
    text: 'Vom Ergebnis her: erst das fertige Ergebnis skizzieren, dann rückwärts die Schritte ableiten.'
  },
  {
    klon: 'raumleiter-anthropic',
    kurz: 'kritisch',
    text: 'Kritisch: zuerst die größten Risiken und Fehlerquellen suchen, dann bauen.'
  }
]

export const ansatzFuer = (nr: number): Ansatz => ANSAETZE[(nr - 2 + ANSAETZE.length) % ANSAETZE.length]!

/** Practice room titles: `<Projekt>-<mensch>-<nr>@tikki.team` (the backend groups by this). */
export const uebungsTitel = (name: string, mensch: string, nr: number): string =>
  `${name.trim()}-${mensch}-${nr}@tikki.team`

const UEBUNG_TITEL = /^(?<basis>.+)-(?<mensch>[^-@\s]+)-(?<nr>\d+)@tikki\.team$/

export interface UebungsTeil {
  basis: string
  mensch: string
  nr: number
}

export function uebungsTeil(titel: string): UebungsTeil | undefined {
  const m = UEBUNG_TITEL.exec(titel.trim())

  return m?.groups ? { basis: m.groups.basis!, mensch: m.groups.mensch!, nr: Number(m.groups.nr) } : undefined
}

/** How many practice rooms may start now: never more than asked, never past the house's capacity. */
export function freieUebungen(gewuenscht: number, laufend: number, kapazitaet: number): number {
  return Math.max(0, Math.min(gewuenscht - 1, kapazitaet - laufend - 1))
}

export function uebungsEroeffnung(nr: number, von: number, ansatz: Ansatz, name: string, ziel: string): string {
  return [
    `ÜBUNG ${nr}/${von}`,
    `ANSATZ: ${ansatz.text}`,
    `RAUM: ${name.trim()}`,
    ...(ziel.trim() ? [`ZIEL: ${ziel.trim()}`] : []),
    'Das ist ein Übungslauf: derselbe Auftrag wie im Hauptraum, genau nach diesem Ansatz. Keine Rückfragen an den Menschen.'
  ].join('\n')
}
