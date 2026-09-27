import type { Locale } from '@/i18n'

import type { AdminSection } from './admin/sections'
import type { Area } from './store'

interface AreaLabels {
  admin: {
    sections: Record<AdminSection, string>
    intro: Record<AdminSection, string>
    roles: { save: string; saved: string; loading: string; missingProfile: string; houseRules: string; pick: string }
    bots: { name: string; task: string; model: string; fallback: string; port: string; status: string; atStart: string; onDemand: string; online: string; offline: string; unknown: string; setup: string }
    users: { name: string; address: string; role: string; admin: string; member: string; invite: string; note: string }
    nodes: { name: string; kind: string; ram: string; role: string; status: string; note: string }
  }
  areas: Record<Area, string>
  browser: { close: string; newTab: string; untitled: string }
  post: { comingSoon: string; inbox: string; title: string }
  rail: { label: string }
}

const de: AreaLabels = {
  admin: {
    sections: { schluessel: 'Schlüssel', modelle: 'Modelle', regeln: 'Regeln & Prompts', bots: 'Bots', nutzer: 'Nutzer', rechner: 'Rechner', gedaechtnis: 'Gedächtnis', system: 'System' },
    intro: {
      schluessel: 'Alle Anbieter-Schlüssel an einer Stelle. Sie liegen beim Backend, nie in der App.',
      modelle: 'Welches Modell wofür: Tikki im Vorzimmer, der Raumleiter, die Bots. Mit Ausweichkette.',
      regeln: 'Die festen Prompts (SOUL) jeder Rolle. Änderungen gelten sofort für neue Gespräche.',
      bots: 'Die Truppe: fertige Rollen, die der Raumleiter nach Bedarf in einen Raum holt.',
      nutzer: 'Die Familie. Jeder sieht nur seine Räume, der Admin alle.',
      rechner: 'Die Rechnerflotte hinter Tikki. Grundlage für die Bot-Armee.',
      gedaechtnis: 'Was Tikki sich merkt: getrennt nach Nutzer, System und Projekt.',
      system: 'Backend, Gateway, Verbindungen, Updates.'
    },
    roles: { save: 'Speichern', saved: 'Gespeichert', loading: 'Lade …', missingProfile: 'Profil ist auf diesem Backend noch nicht angelegt. Einrichten mit tikki/werkzeuge/rollen-einrichten.sh.', houseRules: 'Hausregeln (gelten für alle Rollen)', pick: 'Rolle wählen' },
    bots: { name: 'Rolle', task: 'Aufgabe', model: 'Modell', fallback: 'Ausweich', port: 'Port', status: 'Status', atStart: 'ab Start im Raum', onDemand: 'nach Bedarf', online: 'erreichbar', offline: 'aus', unknown: 'unbekannt', setup: 'Truppe einrichten: tikki/werkzeuge/rollen-einrichten.sh auf dem Rechner mit Hermes ausführen.' },
    users: { name: 'Name', address: 'Adresse', role: 'Rolle', admin: 'Admin', member: 'Familie', invite: 'Einladen', note: 'Anmeldung mit name@tikki.team. Konten und Rechte kommen mit den Räumen; die Liste hier ist die Vorlage.' },
    nodes: { name: 'Rechner', kind: 'Art', ram: 'RAM', role: 'Rolle', status: 'Status', note: 'Rechner melden sich später selbst an. Bis dahin ist das die geplante Flotte.' }
  },
  areas: { admin: 'Admin', browser: 'Browser', post: 'Post', terminal: 'Terminal', tikki: 'Tikki' },
  browser: { close: 'Tab schließen', newTab: 'Neuer Tab', untitled: 'Neue Seite' },
  post: {
    comingSoon: 'Das Postfach kommt als Nächstes: Posteingang, Schreiben, Anhänge, und Tikki liest mit.',
    inbox: 'Posteingang',
    title: 'Post'
  },
  rail: { label: 'Bereiche' }
}

const en: AreaLabels = {
  admin: {
    sections: { schluessel: 'Keys', modelle: 'Models', regeln: 'Rules & prompts', bots: 'Bots', nutzer: 'Users', rechner: 'Machines', gedaechtnis: 'Memory', system: 'System' },
    intro: {
      schluessel: 'Every provider key in one place. They live with the backend, never in the app.',
      modelle: 'Which model for what: Tikki at the front desk, the room lead, the bots. With fallbacks.',
      regeln: 'The fixed prompt (SOUL) of every role. Changes apply to new conversations right away.',
      bots: 'The troop: ready-made roles the room lead pulls into a room on demand.',
      nutzer: 'The family. Everyone sees only their rooms, the admin sees all.',
      rechner: 'The machine fleet behind Tikki. Foundation for the bot army.',
      gedaechtnis: 'What Tikki remembers: separated by user, system and project.',
      system: 'Backend, gateway, connections, updates.'
    },
    roles: { save: 'Save', saved: 'Saved', loading: 'Loading …', missingProfile: 'Profile is not set up on this backend yet. Run tikki/werkzeuge/rollen-einrichten.sh.', houseRules: 'House rules (apply to every role)', pick: 'Pick a role' },
    bots: { name: 'Role', task: 'Task', model: 'Model', fallback: 'Fallback', port: 'Port', status: 'Status', atStart: 'in the room from the start', onDemand: 'on demand', online: 'reachable', offline: 'off', unknown: 'unknown', setup: 'Set up the troop: run tikki/werkzeuge/rollen-einrichten.sh on the machine running Hermes.' },
    users: { name: 'Name', address: 'Address', role: 'Role', admin: 'Admin', member: 'Family', invite: 'Invite', note: 'Sign-in with name@tikki.team. Accounts and rights ship with the rooms; this list is the template.' },
    nodes: { name: 'Machine', kind: 'Kind', ram: 'RAM', role: 'Role', status: 'Status', note: 'Machines will register themselves later. Until then this is the planned fleet.' }
  },
  areas: { admin: 'Admin', browser: 'Browser', post: 'Mail', terminal: 'Terminal', tikki: 'Tikki' },
  browser: { close: 'Close tab', newTab: 'New tab', untitled: 'New page' },
  post: {
    comingSoon: 'Mail is next: inbox, compose, attachments, and Tikki reads along.',
    inbox: 'Inbox',
    title: 'Mail'
  },
  rail: { label: 'Areas' }
}

/** Tikki is a German-first product; every other locale falls back to English. */
export const areaLabels = (locale: Locale): AreaLabels => (locale === 'de' ? de : en)
