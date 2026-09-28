import type { Locale } from '@/i18n'

import type { AdminSection } from './admin/sections'
import type { Area } from './store'

interface AreaLabels {
  admin: {
    sections: Record<AdminSection, string>
    intro: Record<AdminSection, string>
    roles: { save: string; saved: string; loading: string; missingProfile: string; houseRules: string; pick: string }
    bots: {
      name: string
      task: string
      model: string
      fallback: string
      port: string
      status: string
      atStart: string
      onDemand: string
      online: string
      offline: string
      unknown: string
      setup: string
    }
    users: { name: string; address: string; role: string; admin: string; member: string; invite: string; note: string }
    nodes: { name: string; kind: string; ram: string; role: string; status: string; note: string }
    gedaechtnis: { laeuft: string; aus: string; pruefe: string; erklaerung: string; starten: string }
  }
  areas: Record<Area, string>
  browser: { close: string; newTab: string; untitled: string }
  post: {
    address: string
    addressHint: string
    attachments: string
    cancel: string
    cc: string
    compose: string
    delete: string
    inbox: string
    loading: string
    markUnread: string
    noMessages: string
    noSelection: string
    password: string
    reply: string
    refresh: string
    send: string
    sending: string
    sent: string
    signIn: string
    signInIntro: string
    signInButton: string
    signingIn: string
    signOut: string
    subject: string
    title: string
    to: string
    unread: string
  }
  rail: { label: string }
  raum: { bot: string; fertig: string; fehler: string; unvollstaendig: string }
  suites: {
    abbrechen: string
    amTisch: string
    anlegen: string
    arbeitet: string
    ausweich: string
    daten: string
    leereAusgabe: string
    leereDaten: string
    leereTodos: string
    output: string
    todoWand: string
    zurueck: string
    betreten: string
    einfuehrung: string
    erneut: string
    fehler: string
    hauptmodell: string
    immerDabei: string
    laedt: string
    leer: string
    leerHinweis: string
    name: string
    namePlatzhalter: string
    nachrichten: (n: number) => string
    neu: string
    profilFehlt: string
    verlauf: string
    wirdEroeffnet: string
    ziel: string
    zielPlatzhalter: string
  }
}

const de: AreaLabels = {
  admin: {
    sections: {
      schluessel: 'Schlüssel',
      modelle: 'Modelle',
      regeln: 'Regeln & Prompts',
      bots: 'Bots',
      nutzer: 'Nutzer',
      rechner: 'Rechner',
      gedaechtnis: 'Gedächtnis',
      system: 'System'
    },
    gedaechtnis: {
      laeuft: 'läuft auf diesem Rechner',
      aus: 'nicht erreichbar',
      pruefe: 'wird geprüft …',
      erklaerung:
        'Honcho ist Tikkis Gedächtnis und läuft als eigener Dienst auf diesem Rechner: ein Workspace für das System, ein Peer je Mensch, ein AI-Peer je Rolle, eine Sitzung je Suite. Alle Rollenprofile zeigen darauf.',
      starten: 'Starten im Terminal:'
    },
    intro: {
      schluessel: 'Alle Anbieter-Schlüssel an einer Stelle. Sie liegen beim Backend, nie in der App.',
      modelle: 'Welches Modell wofür: Tikki im Vorzimmer, der Raumleiter, die Bots. Mit Ausweichkette.',
      regeln: 'Die festen Prompts (SOUL) jeder Rolle. Änderungen gelten sofort für neue Gespräche.',
      bots: 'Die Truppe: fertige Rollen, die der Raumleiter nach Bedarf in eine Suite holt.',
      nutzer: 'Die Familie. Jeder sieht nur seine Räume, der Admin alle.',
      rechner: 'Die Rechnerflotte hinter Tikki. Grundlage für die Bot-Armee.',
      gedaechtnis: 'Was Tikki sich merkt: getrennt nach Nutzer, System und Projekt.',
      system: 'Backend, Gateway, Verbindungen, Updates.'
    },
    roles: {
      save: 'Speichern',
      saved: 'Gespeichert',
      loading: 'Lade …',
      missingProfile:
        'Profil ist auf diesem Backend noch nicht angelegt. Einrichten mit tikki/werkzeuge/rollen-einrichten.sh.',
      houseRules: 'Hausregeln (gelten für alle Rollen)',
      pick: 'Rolle wählen'
    },
    bots: {
      name: 'Rolle',
      task: 'Aufgabe',
      model: 'Modell',
      fallback: 'Ausweich',
      port: 'Port',
      status: 'Status',
      atStart: 'ab Start im Raum',
      onDemand: 'nach Bedarf',
      online: 'erreichbar',
      offline: 'aus',
      unknown: 'unbekannt',
      setup: 'Truppe einrichten: tikki/werkzeuge/rollen-einrichten.sh auf dem Rechner mit Hermes ausführen.'
    },
    users: {
      name: 'Name',
      address: 'Adresse',
      role: 'Rolle',
      admin: 'Admin',
      member: 'Familie',
      invite: 'Einladen',
      note: 'Anmeldung mit name@tikki.team. Konten und Rechte kommen mit den Räumen; die Liste hier ist die Vorlage.'
    },
    nodes: {
      name: 'Rechner',
      kind: 'Art',
      ram: 'RAM',
      role: 'Rolle',
      status: 'Status',
      note: 'Rechner melden sich später selbst an. Bis dahin ist das die geplante Flotte.'
    }
  },
  areas: { admin: 'Admin', browser: 'Browser', post: 'Post', suites: 'Suites', terminal: 'Terminal', tikki: 'Tikki' },
  browser: { close: 'Tab schließen', newTab: 'Neuer Tab', untitled: 'Neue Seite' },
  post: {
    address: 'Adresse',
    addressHint: 'Dein Postfach bei tikki.team, z. B. karin@tikki.team. Das Passwort bleibt auf diesem Rechner.',
    attachments: 'Anhänge',
    cancel: 'Abbrechen',
    cc: 'Kopie',
    compose: 'Schreiben',
    delete: 'Löschen',
    inbox: 'Posteingang',
    loading: 'Lade …',
    markUnread: 'Als ungelesen markieren',
    noMessages: 'Keine Nachrichten in diesem Ordner.',
    noSelection: 'Wähle links eine Nachricht.',
    password: 'Passwort',
    reply: 'Antworten',
    refresh: 'Aktualisieren',
    send: 'Senden',
    sending: 'Sende …',
    sent: 'Gesendet.',
    signIn: 'Anmelden',
    signInIntro: 'Post für die Familie. Melde dich mit deiner tikki.team-Adresse an.',
    signInButton: 'Anmelden',
    signingIn: 'Prüfe Zugang …',
    signOut: 'Abmelden',
    subject: 'Betreff',
    title: 'Post',
    to: 'An',
    unread: 'ungelesen'
  },
  rail: { label: 'Bereiche' },
  raum: { bot: 'Bot', fertig: 'Fertig', fehler: 'Fehlgeschlagen', unvollstaendig: 'Unvollständig' },
  suites: {
    abbrechen: 'Abbrechen',
    amTisch: 'Am Tisch',
    anlegen: 'Suite eröffnen',
    arbeitet: 'arbeitet',
    ausweich: 'Ausweichmodell',
    daten: 'Daten-Screen',
    leereAusgabe: 'Noch nichts fertig. Ergebnisse, Dateien und Links der Bots erscheinen hier.',
    leereDaten: 'Noch nichts hereingegeben. Dateien, Links und Ordner aus dem Gespräch erscheinen hier.',
    leereTodos: 'Noch keine Aufgaben an der Wand. Der Raumleiter hängt sie auf, sobald er plant.',
    output: 'Output-Screen',
    todoWand: 'To-do-Wand',
    zurueck: 'Zur Lobby',
    betreten: 'Betreten',
    einfuehrung:
      'Eine Suite ist ein eigener Raum für ein Vorhaben. Der Raumleiter sitzt von Anfang an am Tisch, bespricht mit dir das Ziel und holt die Bots dazu, die er braucht. Alles, was zur Suite gehört, bleibt in der Suite.',
    erneut: 'Erneut versuchen',
    fehler: 'Die Suites konnten nicht geladen werden.',
    hauptmodell: 'Hauptmodell',
    immerDabei: 'Immer am Tisch',
    laedt: 'Suites werden geladen …',
    leer: 'Noch keine Suites.',
    leerHinweis: 'Die erste entsteht, wenn du hier eine eröffnest oder Tikki im Vorzimmer einen Auftrag bekommt.',
    name: 'Name der Suite',
    namePlatzhalter: 'z. B. Urlaub Ostsee',
    nachrichten: n => (n === 1 ? '1 Nachricht' : `${n} Nachrichten`),
    neu: 'Neue Suite',
    profilFehlt:
      'Das Profil „raumleiter“ gibt es auf diesem Backend noch nicht. Auf dem Rechner tikki/werkzeuge/rollen-einrichten.sh ausführen.',
    verlauf: 'Verlauf',
    wirdEroeffnet: 'Suite wird eröffnet …',
    ziel: 'Ziel',
    zielPlatzhalter: 'Ein Satz: Was muss am Ende fertig sein?'
  }
}

const en: AreaLabels = {
  admin: {
    sections: {
      schluessel: 'Keys',
      modelle: 'Models',
      regeln: 'Rules & prompts',
      bots: 'Bots',
      nutzer: 'Users',
      rechner: 'Machines',
      gedaechtnis: 'Memory',
      system: 'System'
    },
    intro: {
      schluessel: 'Every provider key in one place. They live with the backend, never in the app.',
      modelle: 'Which model for what: Tikki at the front desk, the room lead, the bots. With fallbacks.',
      regeln: 'The fixed prompt (SOUL) of every role. Changes apply to new conversations right away.',
      bots: 'The troop: ready-made roles the room lead pulls into a suite on demand.',
      nutzer: 'The family. Everyone sees only their rooms, the admin sees all.',
      rechner: 'The machine fleet behind Tikki. Foundation for the bot army.',
      gedaechtnis: 'What Tikki remembers: separated by user, system and project.',
      system: 'Backend, gateway, connections, updates.'
    },
    roles: {
      save: 'Save',
      saved: 'Saved',
      loading: 'Loading …',
      missingProfile: 'Profile is not set up on this backend yet. Run tikki/werkzeuge/rollen-einrichten.sh.',
      houseRules: 'House rules (apply to every role)',
      pick: 'Pick a role'
    },
    bots: {
      name: 'Role',
      task: 'Task',
      model: 'Model',
      fallback: 'Fallback',
      port: 'Port',
      status: 'Status',
      atStart: 'in the room from the start',
      onDemand: 'on demand',
      online: 'reachable',
      offline: 'off',
      unknown: 'unknown',
      setup: 'Set up the troop: run tikki/werkzeuge/rollen-einrichten.sh on the machine running Hermes.'
    },
    users: {
      name: 'Name',
      address: 'Address',
      role: 'Role',
      admin: 'Admin',
      member: 'Family',
      invite: 'Invite',
      note: 'Sign-in with name@tikki.team. Accounts and rights ship with the rooms; this list is the template.'
    },
    nodes: {
      name: 'Machine',
      kind: 'Kind',
      ram: 'RAM',
      role: 'Role',
      status: 'Status',
      note: 'Machines will register themselves later. Until then this is the planned fleet.'
    },
    gedaechtnis: {
      laeuft: 'running on this machine',
      aus: 'not reachable',
      pruefe: 'checking …',
      erklaerung:
        "Honcho is Tikki's memory and runs as its own service on this machine: one workspace for the system, one peer per person, one AI peer per role, one session per suite. Every role profile points at it.",
      starten: 'Start it in the terminal:'
    }
  },
  areas: { admin: 'Admin', browser: 'Browser', post: 'Mail', suites: 'Suites', terminal: 'Terminal', tikki: 'Tikki' },
  browser: { close: 'Close tab', newTab: 'New tab', untitled: 'New page' },
  post: {
    address: 'Address',
    addressHint: 'Your tikki.team mailbox, e.g. karin@tikki.team. The password stays on this machine.',
    attachments: 'Attachments',
    cancel: 'Cancel',
    cc: 'Cc',
    compose: 'Compose',
    delete: 'Delete',
    inbox: 'Inbox',
    loading: 'Loading …',
    markUnread: 'Mark as unread',
    noMessages: 'No messages in this folder.',
    noSelection: 'Pick a message on the left.',
    password: 'Password',
    reply: 'Reply',
    refresh: 'Refresh',
    send: 'Send',
    sending: 'Sending …',
    sent: 'Sent.',
    signIn: 'Sign in',
    signInIntro: 'Mail for the family. Sign in with your tikki.team address.',
    signInButton: 'Sign in',
    signingIn: 'Checking access …',
    signOut: 'Sign out',
    subject: 'Subject',
    title: 'Mail',
    to: 'To',
    unread: 'unread'
  },
  rail: { label: 'Areas' },
  raum: { bot: 'Bot', fertig: 'Done', fehler: 'Failed', unvollstaendig: 'Incomplete' },
  suites: {
    abbrechen: 'Cancel',
    amTisch: 'At the table',
    anlegen: 'Open suite',
    arbeitet: 'working',
    ausweich: 'Fallback model',
    daten: 'Data screen',
    leereAusgabe: 'Nothing finished yet. Results, files and links from the bots appear here.',
    leereDaten: 'Nothing handed in yet. Files, links and folders from the conversation appear here.',
    leereTodos: 'No tasks on the wall yet. The room lead pins them up once it plans.',
    output: 'Output screen',
    todoWand: 'To-do wall',
    zurueck: 'To the lobby',
    betreten: 'Enter',
    einfuehrung:
      'A suite is a room of its own for one undertaking. The room lead sits at the table from the start, works out the goal with you and brings in the bots it needs. Everything that belongs to the suite stays in the suite.',
    erneut: 'Try again',
    fehler: 'The suites could not be loaded.',
    hauptmodell: 'Primary model',
    immerDabei: 'Always at the table',
    laedt: 'Loading suites …',
    leer: 'No suites yet.',
    leerHinweis: 'The first one appears when you open one here or Tikki is given a task at the front desk.',
    name: 'Suite name',
    namePlatzhalter: 'e.g. Baltic Sea holiday',
    nachrichten: n => (n === 1 ? '1 message' : `${n} messages`),
    neu: 'New suite',
    profilFehlt:
      'The profile "raumleiter" does not exist on this backend yet. Run tikki/werkzeuge/rollen-einrichten.sh on the machine.',
    verlauf: 'History',
    wirdEroeffnet: 'Opening suite …',
    ziel: 'Goal',
    zielPlatzhalter: 'One sentence: what has to be done in the end?'
  }
}

/** Tikki is a German-first product; every other locale falls back to English. */
export const areaLabels = (locale: Locale): AreaLabels => (locale === 'de' ? de : en)
