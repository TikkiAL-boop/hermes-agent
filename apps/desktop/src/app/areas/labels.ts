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
    betrieb: {
      uebungen: string
      uebungenHinweis: string
      kapazitaet: string
      kapazitaetHinweis: string
      mensch: string
      menschHinweis: string
      rundUmDieUhr: string
      briefingAutomatik: string
      briefingAutomatikHinweis: string
    }
  }
  areas: Record<Area, string>
  browser: { close: string; newTab: string; untitled: string; zurueck: string; adresse: string }
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
  rail: { label: string; hinweis: Record<Area, string> }
  vorzimmer: {
    titel: string
    gespraechsKi: string
    imVorzimmer: string
    auftraege: string
    auftraegeHinweis: string
    keineAuftraege: string
    auftraegeFehler: string
    modelle: string
    modelleSuche: string
    modelleFehler: string
    keineModelle: string
    modelleServer: (art: string) => string
    modelleWeitere: (n: number) => string
    modelleVorschlag: (raeume: string, sprache: string) => string
    modelleHinweis: string
    naechster: (wann: string) => string
    pausiert: string
    geradeImChat: string
    zuletztBesucht: string
    keineBesuche: string
    brauchtDich: string
    keinerWartet: string
    neueSuite: string
    neueSuiteHinweis: string
    einstellungen: string
    briefing: string
    briefingLaeuft: string
    vorlesen: string
    vorlesenAn: string
    vorlesenAus: string
    keinChat: string
    update: string
    updateText: (n: number, version: string) => string
    updateBefehl: string
    updateAktuell: string
  }
  raum: {
    bot: string
    fertig: string
    fehler: string
    unvollstaendig: string
    besatzung: string
    tueren: string
    keineTueren: string
    besatzungRollen: { raumleiter: string; gedaechtnis: string; wachhalter: string; pruefer: string; suche: string }
  }
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
    erneut: string
    fehler: string
    hauptmodell: string
    immerDabei: string
    laedt: string
    leer: string
    leerHinweis: string
    name: string
    namePlatzhalter: string
    mitglieder: (n: number) => string
    neu: string
    raumdienstFehlt: string
    rollenFehlen: (profile: string) => string
    verlauf: string
    wirdEroeffnet: string
    ziel: string
    zielPlatzhalter: string
    suchen: string
    erstellen: string
    verbinden: string
    verbindenHinweis: string
    verbindenName: string
    aufmerksamkeit: string
    allesRuhig: string
    wartetAufDich: string
    fertigGemeldet: string
    brauchtDich: string
    stand: string
    takt: string
    taktEinmalig: string
    taktEigener: string
    taktPlatzhalter: string
    dauerauftrag: string
    leiter: string
    leiterStandard: (modell: string) => string
    rollen: string
    uebungenGeplant: (n: number) => string
    uebungslaeufe: (n: number) => string
    uebungslauf: (nr: number) => string
    keineNachrichten: string
    denkt: (name: string) => string
    schreiben: string
    senden: string
    freigabe: string
    freigabeEinmal: string
    freigabeAblehnen: string
    tuerNach: (name: string) => string
    tuerText: string
    tuerPlatzhalter: string
    tuerSenden: string
    tuerBetreten: string
    tuerGesendet: (name: string) => string
    verschmelzen: string
    verschmelzenHinweis: string
    verschmelzenMit: (name: string) => string
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
      betrieb: 'Betrieb',
      system: 'System'
    },
    betrieb: {
      uebungen: 'Übungsläufe je Auftrag',
      uebungenHinweis:
        'Jeder neue Auftrag läuft so oft: dein Raum plus Übungsräume mit anderen Modellen und Ansätzen. Das erste fertige Ergebnis bekommst du sofort, danach lernt der Raumleiter aus dem Vergleich. Übungsräume starten nur, wenn genug Kapazität frei ist. 1 = aus.',
      kapazitaet: 'Gleichzeitige Räume',
      kapazitaetHinweis:
        'So viele Räume dürfen im ganzen Haus gleichzeitig arbeiten. Übungsläufe halten sich daran, dein Raum nie.',
      mensch: 'Name des Menschen',
      menschHinweis: 'Steht in den Namen der Übungsräume: Projekt-name-2@tikki.team.',
      briefingAutomatik: 'Briefing beim Ankommen',
      briefingAutomatikHinweis: 'Tikki begrüßt dich mit dem Briefing, wenn das letzte länger als vier Stunden her ist.',
      rundUmDieUhr:
        'Rund um die Uhr: Räume mit Takt laufen im Backend weiter, auch wenn die App zu ist; der Wachhalter geht alle 15 Minuten durch alle Räume. Beides richtet tikki/werkzeuge/rollen-einrichten.sh ein.'
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
      betrieb: 'Wie die Räume arbeiten: Übungsläufe, Kapazität, Dauerbetrieb.',
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
      setup: 'Truppe einrichten: tikki/werkzeuge/rollen-einrichten.sh auf dem Tikki-Rechner ausführen.'
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
  browser: {
    close: 'Tab schließen',
    newTab: 'Neuer Tab',
    untitled: 'Neue Seite',
    zurueck: 'Zum Vorzimmer',
    adresse: 'Webadresse oder Suche …'
  },
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
  rail: {
    label: 'Bereiche',
    hinweis: {
      admin: 'Einstellungen',
      browser: 'Im Netz',
      post: 'Deine Mails',
      suites: 'Arbeitsräume',
      terminal: 'Kommandozeile',
      tikki: 'Übersicht'
    }
  },
  vorzimmer: {
    titel: 'Übersicht',
    gespraechsKi: 'Deine Gesprächs-KI',
    imVorzimmer: 'Tikki',
    auftraege: 'Tikkis Daueraufträge',
    auftraegeHinweis: 'Sag ihr im Chat, was sie regelmäßig tun soll – „guck alle 4 Minuten nach Mails“.',
    keineAuftraege: 'Noch keine. Tikki legt sie an, sobald du ihr einen Auftrag gibst.',
    auftraegeFehler: 'Aufträge gerade nicht lesbar.',
    modelle: 'Modelle im Haus',
    modelleSuche: 'Suche auf der Platte und nach laufenden Servern …',
    modelleFehler: 'Modellsuche gerade nicht möglich (Backend ohne Plugin pa?).',
    keineModelle: 'Kein lokales Modell gefunden. Räume laufen über API und Abos.',
    modelleServer: (art: string) => `Server läuft (${art}):`,
    modelleWeitere: (n: number) => `+ ${n} weitere`,
    modelleVorschlag: (raeume: string, sprache: string) =>
      raeume === sprache
        ? `Vorschlag: ${raeume} für Räume und Sprache.`
        : `Vorschlag: ${raeume} für Räume, ${sprache} für Sprache.`,
    modelleHinweis:
      'Beim Start gesucht. Zum Einsatz: Server mit 64k Kontext starten, Rolle auf lokal/<Modell> stellen.',
    naechster: (wann: string) => `nächster Lauf ${wann}`,
    pausiert: 'pausiert',
    geradeImChat: 'Gerade im Chat',
    zuletztBesucht: 'Zuletzt besucht',
    keineBesuche: 'Noch keine Suite besucht.',
    brauchtDich: 'Braucht dich',
    keinerWartet: 'Gerade wartet keine Suite auf dich.',
    neueSuite: 'Neue Suite',
    neueSuiteHinweis: 'Platz für einen Auftrag',
    einstellungen: 'Einstellungen',
    briefing: 'Briefing',
    briefingLaeuft: 'Sammle …',
    vorlesen: 'Antwort vorlesen',
    vorlesenAn: 'an',
    vorlesenAus: 'aus',
    keinChat: 'Kein Gespräch offen. Klick zuerst ins Eingabefeld.',
    update: 'Tikki-Update verfügbar',
    updateText: (n, version) => `${n} neue Änderungen bei Hermes${version ? ` (Version ${version})` : ''}.`,
    updateBefehl: 'Übernehmen im Terminal:',
    updateAktuell: 'Tikki ist auf dem neuesten Stand.'
  },
  raum: {
    bot: 'Bot',
    fertig: 'Fertig',
    fehler: 'Fehlgeschlagen',
    unvollstaendig: 'Unvollständig',
    besatzung: 'Grundbesatzung',
    tueren: 'Türen',
    keineTueren: 'Keine anderen Räume',
    besatzungRollen: {
      raumleiter: 'Raumleiter',
      gedaechtnis: 'Gedächtnis',
      wachhalter: 'Wachhalter',
      pruefer: 'Prüfer',
      suche: 'Suche'
    }
  },
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
    erneut: 'Erneut versuchen',
    fehler: 'Die Suites konnten nicht geladen werden.',
    hauptmodell: 'Hauptmodell',
    immerDabei: 'Immer am Tisch',
    laedt: 'Suites werden geladen …',
    leer: 'Noch keine Suites.',
    leerHinweis: 'Die erste entsteht, wenn du hier eine eröffnest oder Tikki im Vorzimmer einen Auftrag bekommt.',
    name: 'Name der Suite',
    namePlatzhalter: 'z. B. Urlaub Ostsee',
    mitglieder: n => (n === 1 ? '1 am Tisch' : `${n} am Tisch`),
    neu: 'Neue Suite',
    raumdienstFehlt:
      'Der Raumdienst läuft auf diesem Backend nicht. Das Hermes-Gateway neu starten (tikki/werkzeuge/rollen-einrichten.sh richtet es ein).',
    rollenFehlen: (profile: string) =>
      `Auf diesem Rechner fehlen die Rollen ${profile}. Einmal tikki/werkzeuge/rollen-einrichten.sh ausführen, dann klappt die Suite.`,
    verlauf: 'Verlauf',
    wirdEroeffnet: 'Suite wird eröffnet …',
    ziel: 'Ziel',
    suchen: 'Suite suchen …',
    erstellen: 'Suite erstellen',
    verbinden: 'Suite verbinden',
    verbindenHinweis: 'Eine bestehende Suite über ihren Namen betreten.',
    verbindenName: 'Name der Suite',
    aufmerksamkeit: 'Benötigt deine Aufmerksamkeit',
    allesRuhig: 'Alles ruhig. Keine Suite wartet auf dich.',
    wartetAufDich: 'Wartet auf deine Antwort',
    fertigGemeldet: 'Der Raumleiter meldet: fertig',
    brauchtDich: 'Braucht dich',
    stand: 'Stand',
    takt: 'Takt',
    taktEinmalig: 'Einmalig – fertig ist fertig',
    taktEigener: 'Eigener Takt …',
    taktPlatzhalter: 'z. B. alle 2 Stunden, montags 09:00, 0 7 * * *',
    dauerauftrag: 'Dauerauftrag',
    leiter: 'Raumleiter-Modell',
    leiterStandard: (modell: string) => `Standard (${modell})`,
    rollen: 'Bots von Anfang an am Tisch (Raumleiter und deine KI sitzen immer dort)',
    uebungenGeplant: n => (n > 1 ? `Dazu ${n - 1} Übungsläufe mit anderen Ansätzen, wenn Kapazität frei ist.` : ''),
    uebungslaeufe: n => (n === 1 ? '1 Übungslauf' : `${n} Übungsläufe`),
    uebungslauf: nr => `Übungslauf ${nr}`,
    keineNachrichten: 'Noch nichts gesagt. Der Raumleiter meldet sich, sobald er geplant hat.',
    denkt: name => `${name} denkt …`,
    schreiben: 'In den Raum sprechen … (Enter sendet, @raumleiter weckt nur ihn)',
    senden: 'Senden',
    freigabe: 'bittet um Freigabe',
    freigabeEinmal: 'Einmal erlauben',
    freigabeAblehnen: 'Ablehnen',
    tuerNach: name => `Durch die Tür nach „${name}“`,
    tuerText: 'Nachricht an den anderen Raum',
    tuerPlatzhalter: 'Was soll der Raumleiter dort wissen oder tun?',
    tuerSenden: 'Durch die Tür schicken',
    tuerBetreten: 'Hinübergehen',
    tuerGesendet: name => `An „${name}“ geschickt.`,
    verschmelzen: 'Verschmelzen',
    verschmelzenHinweis:
      'Zwei Räume werden einer: alle Bots beider Räume an einem Tisch, der Stand beider als Auftakt. Die alten Räume werden aufgelöst.',
    verschmelzenMit: name => `Mit „${name}“ verschmelzen`,
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
      betrieb: 'Operations',
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
      betrieb: 'How rooms work: practice runs, capacity, around-the-clock operation.',
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
      setup: 'Set up the troop: run tikki/werkzeuge/rollen-einrichten.sh on the Tikki machine.'
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
    betrieb: {
      uebungen: 'Practice runs per order',
      uebungenHinweis:
        'Every new order runs this many times: your room plus practice rooms with other models and approaches. You get the first finished result right away; afterwards the room lead learns from the comparison. Practice rooms only start when there is capacity. 1 = off.',
      kapazitaet: 'Rooms at the same time',
      kapazitaetHinweis:
        'How many rooms may work at once across the house. Practice runs respect it, your own room never waits.',
      mensch: 'Person name',
      menschHinweis: 'Used in practice room names: project-name-2@tikki.team.',
      briefingAutomatik: 'Briefing on arrival',
      briefingAutomatikHinweis: 'Tikki greets you with the briefing when the last one is more than four hours old.',
      rundUmDieUhr:
        'Around the clock: rooms with a schedule keep running on the backend even when the app is closed; the watchkeeper walks all rooms every 15 minutes. tikki/werkzeuge/rollen-einrichten.sh sets both up.'
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
  browser: {
    close: 'Close tab',
    newTab: 'New tab',
    untitled: 'New page',
    zurueck: 'To reception',
    adresse: 'Web address or search …'
  },
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
  rail: {
    label: 'Areas',
    hinweis: {
      admin: 'Settings',
      browser: 'On the web',
      post: 'Your mail',
      suites: 'Workrooms',
      terminal: 'Command line',
      tikki: 'Overview'
    }
  },
  vorzimmer: {
    titel: 'Overview',
    gespraechsKi: 'Your conversation AI',
    imVorzimmer: 'Tikki',
    auftraege: 'Tikki’s standing orders',
    auftraegeHinweis: 'Tell her in the chat what to do regularly – “check the mail every 4 minutes”.',
    keineAuftraege: 'None yet. Tikki creates them as soon as you give her an order.',
    auftraegeFehler: 'Orders cannot be read right now.',
    modelle: 'Models in the house',
    modelleSuche: 'Searching the disk and for running servers …',
    modelleFehler: 'Model search not possible right now (backend without the pa plugin?).',
    keineModelle: 'No local model found. Rooms run on APIs and subscriptions.',
    modelleServer: (art: string) => `Server running (${art}):`,
    modelleWeitere: (n: number) => `+ ${n} more`,
    modelleVorschlag: (raeume: string, sprache: string) =>
      raeume === sprache
        ? `Suggestion: ${raeume} for rooms and speech.`
        : `Suggestion: ${raeume} for rooms, ${sprache} for speech.`,
    modelleHinweis: 'Searched at start. To use one: start its server with 64k context and set a role to lokal/<model>.',
    naechster: (wann: string) => `next run ${wann}`,
    pausiert: 'paused',
    geradeImChat: 'In this chat',
    zuletztBesucht: 'Recently visited',
    keineBesuche: 'No suite visited yet.',
    brauchtDich: 'Needs you',
    keinerWartet: 'No suite is waiting for you right now.',
    neueSuite: 'New suite',
    neueSuiteHinweis: 'Room for an order',
    einstellungen: 'Settings',
    briefing: 'Briefing',
    briefingLaeuft: 'Collecting …',
    vorlesen: 'Read replies aloud',
    vorlesenAn: 'on',
    vorlesenAus: 'off',
    keinChat: 'No conversation open. Click into the input first.',
    update: 'Tikki update available',
    updateText: (n, version) => `${n} new changes in Hermes${version ? ` (version ${version})` : ''}.`,
    updateBefehl: 'Apply in the terminal:',
    updateAktuell: 'Tikki is up to date.'
  },
  raum: {
    bot: 'Bot',
    fertig: 'Done',
    fehler: 'Failed',
    unvollstaendig: 'Incomplete',
    besatzung: 'Base crew',
    tueren: 'Doors',
    keineTueren: 'No other rooms',
    besatzungRollen: {
      raumleiter: 'Room lead',
      gedaechtnis: 'Memory',
      wachhalter: 'Watchkeeper',
      pruefer: 'Reviewer',
      suche: 'Search'
    }
  },
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
    erneut: 'Try again',
    fehler: 'The suites could not be loaded.',
    hauptmodell: 'Primary model',
    immerDabei: 'Always at the table',
    laedt: 'Loading suites …',
    leer: 'No suites yet.',
    leerHinweis: 'The first one appears when you open one here or Tikki is given a task at the front desk.',
    name: 'Suite name',
    namePlatzhalter: 'e.g. Baltic Sea holiday',
    mitglieder: n => (n === 1 ? '1 at the table' : `${n} at the table`),
    neu: 'New suite',
    raumdienstFehlt:
      'The room service is not running on this backend. Restart the Hermes gateway (tikki/werkzeuge/rollen-einrichten.sh sets it up).',
    rollenFehlen: (profile: string) =>
      `The roles ${profile} are missing on this machine. Run tikki/werkzeuge/rollen-einrichten.sh once, then the suite opens.`,
    verlauf: 'History',
    wirdEroeffnet: 'Opening suite …',
    ziel: 'Goal',
    suchen: 'Search suites …',
    erstellen: 'Create suite',
    verbinden: 'Join suite',
    verbindenHinweis: 'Enter an existing suite by its name.',
    verbindenName: 'Suite name',
    aufmerksamkeit: 'Needs your attention',
    allesRuhig: 'All quiet. No suite is waiting for you.',
    wartetAufDich: 'Waiting for your answer',
    fertigGemeldet: 'The room lead reports: done',
    brauchtDich: 'Needs you',
    stand: 'Status',
    takt: 'Schedule',
    taktEinmalig: 'Once – done is done',
    taktEigener: 'Custom schedule …',
    taktPlatzhalter: 'e.g. alle 2 Stunden, montags 09:00, 0 7 * * *',
    dauerauftrag: 'Standing order',
    leiter: 'Room-lead model',
    leiterStandard: (modell: string) => `Default (${modell})`,
    rollen: 'Bots at the table from the start (the room lead and your AI always sit there)',
    uebungenGeplant: n => (n > 1 ? `Plus ${n - 1} practice runs with other approaches when capacity allows.` : ''),
    uebungslaeufe: n => (n === 1 ? '1 practice run' : `${n} practice runs`),
    uebungslauf: nr => `Practice run ${nr}`,
    keineNachrichten: 'Nothing said yet. The room lead speaks up once it has planned.',
    denkt: name => `${name} is thinking …`,
    schreiben: 'Speak into the room … (Enter sends, @raumleiter wakes only the lead)',
    senden: 'Send',
    freigabe: 'asks for approval',
    freigabeEinmal: 'Allow once',
    freigabeAblehnen: 'Deny',
    tuerNach: name => `Through the door to “${name}”`,
    tuerText: 'Message to the other room',
    tuerPlatzhalter: 'What should the room lead over there know or do?',
    tuerSenden: 'Send through the door',
    tuerBetreten: 'Walk over',
    tuerGesendet: name => `Sent to “${name}”.`,
    verschmelzen: 'Merge',
    verschmelzenHinweis:
      'Two rooms become one: every bot of both rooms at one table, the state of both as the opening. The old rooms are disbanded.',
    verschmelzenMit: name => `Merge with “${name}”`,
    zielPlatzhalter: 'One sentence: what has to be done in the end?'
  }
}

/** Tikki is a German-first product; every other locale falls back to English. */
export const areaLabels = (locale: Locale): AreaLabels => (locale === 'de' ? de : en)
