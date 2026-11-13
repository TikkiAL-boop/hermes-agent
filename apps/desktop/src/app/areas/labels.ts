import type { Locale } from '@/i18n'

import type { AdminSection } from './admin/sections'
import type { Area } from './store'

interface AreaLabels {
  admin: {
    sections: Record<AdminSection, string>
    intro: Record<AdminSection, string>
    roles: {
      save: string
      saved: string
      unsaved: string
      discard: string
      loading: string
      loadError: string
      retry: string
      saveError: (profile: string) => string
      clones: (namen: string) => string
      missingProfile: string
      houseRules: string
      pick: string
    }
    bots: {
      name: string
      task: string
      model: string
      vorgabe: string
      port: string
      status: string
      atStart: string
      onDemand: string
      online: string
      offline: string
      missing: string
      unknown: string
      statusFehler: string
      setup: string
    }
    users: { name: string; address: string; role: string; admin: string; member: string; invite: string; note: string }
    nodes: { name: string; kind: string; ram: string; role: string; status: string; note: string }
    gedaechtnis: {
      laeuft: string
      aus: string
      pruefe: string
      unbekannt: string
      erklaerung: string
      starten: string
    }
    ressourcen: {
      titel: string
      erklaerung: string
      pruefen: string
      aktualisieren: string
      laedt: string
      fehler: string
      anbieter: string
      schluessel: string
      erreichbar: string
      modelle: string
      abo: string
      angemeldet: string
      abgemeldet: string
      ja: string
      nichtGeprueft: string
      abos: string
      lokal: string
      keinServer: string
      frei: string
      nichtsFrei: string
    }
    betrieb: {
      mensch: string
      menschHinweis: string
      waToken: string
      waTokenHinweis: string
      waTokenPlatzhalter: string
      waTokenErsetzen: string
      waTokenSpeichern: string
      waTokenEntfernen: string
      waTokenStand: Record<'unbekannt' | 'gesetzt' | 'fehlt' | 'fehler', string>
      rundUmDieUhr: string
    }
  }
  areas: Record<Area, string>
  browser: { close: string; newTab: string; untitled: string; zurueck: string; adresse: string }
  post: {
    address: string
    addressHint: string
    attachments: string
    bilderBlockiert: string
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
    wrote: (from: string) => string
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
    briefingBitte: string
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
    output: string
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
    brauchtDich: string
    /** A person in a room whom no one named. */
    mensch: string
    takt: string
    takte: Record<'stuendlich' | 'halbstuendlich' | 'taeglich' | 'werktags' | 'montags', string>
    taktEinmalig: string
    taktEigener: string
    taktPlatzhalter: string
    dauerauftrag: string
    leiter: string
    leiterStandard: (modell: string) => string
    rollen: string
    keineNachrichten: string
    denkt: (name: string) => string
    schreiben: string
    senden: string
    mikro: string
    mikroStopp: string
    mikroSchreibt: string
    vorlesen: string
    freigabe: string
    freigabeEinmal: string
    freigabeAblehnen: string
    rueckfrage: string
    rueckfrageAntwort: string
    rueckfrageSenden: string
    rundeGescheitert: string
    rundeNochmal: string
    zeitplanPausiert: string
    offeneFreigabe: string
    offeneRueckfrage: string
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
      mensch: 'Name des Menschen',
      menschHinweis: 'Steht vor dem, was du in einem Raum sagst – so bleiben mehrere Menschen dort unterscheidbar.',
      waToken: 'WhatsApp-Bridge-Token',
      waTokenHinweis:
        'Damit liest Tikki fürs Briefing neue WhatsApps. Das Token liegt beim Backend im Profil tikki, nicht in der App; angezeigt wird es nie.',
      waTokenPlatzhalter: 'Token einfügen',
      waTokenErsetzen: 'Neues Token einfügen',
      waTokenSpeichern: 'Speichern',
      waTokenEntfernen: 'Entfernen',
      waTokenStand: {
        unbekannt: 'wird geprüft …',
        gesetzt: 'hinterlegt',
        fehlt: 'nicht hinterlegt',
        fehler: 'Nicht erreichbar – läuft das Backend und ist das Profil tikki eingerichtet?'
      },
      rundUmDieUhr:
        'Rund um die Uhr: Räume mit Takt laufen als Dauerauftrag im Backend weiter, auch wenn die App zu ist. Der Wachhalter geht alle 15 Minuten durch alle Räume; ihn richtet tikki/werkzeuge/rollen-einrichten.sh ein.'
    },
    gedaechtnis: {
      laeuft: 'läuft auf diesem Rechner',
      aus: 'nicht erreichbar',
      pruefe: 'wird geprüft …',
      unbekannt: 'Stand unbekannt',
      erklaerung:
        'Honcho ist Tikkis Gedächtnis und läuft als eigener Dienst auf diesem Rechner: ein Workspace für das System, ein Peer je Mensch, ein AI-Peer je Rolle, eine Sitzung je Suite. Alle Rollenprofile zeigen darauf.',
      starten: 'Starten im Terminal:'
    },
    ressourcen: {
      titel: 'Ressourcen (MR)',
      erklaerung:
        'Was gerade frei ist: Anbieter-Schlüssel (nur Namen) und ob ihr Endpunkt antwortet, Abo-Kommandozeilen, lokale Modellserver, und welcher Raumleiter-Klon nutzbar ist – lokal vor Abo vor API. Geprüft auf dem Tikki-Rechner; stündlich erneuert der MR-Bot den Stand.',
      pruefen: 'Jetzt prüfen',
      aktualisieren: 'Aktualisieren',
      laedt: 'wird geprüft …',
      fehler: 'Prüfung fehlgeschlagen – läuft das Backend und ist das Profil tikki eingerichtet?',
      anbieter: 'Anbieter',
      schluessel: 'Schlüssel',
      erreichbar: 'erreichbar',
      modelle: 'Modelle',
      abo: 'Abo',
      angemeldet: 'angemeldet',
      abgemeldet: 'abgemeldet',
      ja: 'ja',
      nichtGeprueft: 'nicht geprüft',
      abos: 'Abos',
      lokal: 'Lokal',
      keinServer: 'kein Modellserver läuft',
      frei: 'Frei jetzt',
      nichtsFrei: 'nichts – kein Schlüssel erreichbar, kein Abo angemeldet, kein lokaler Server'
    },
    intro: {
      schluessel: 'Alle Anbieter-Schlüssel an einer Stelle. Sie liegen beim Backend, nie in der App.',
      modelle: 'Welches Modell wofür: Tikki im Vorzimmer, der Raumleiter, die Bots. Mit Ausweichkette.',
      regeln: 'Die festen Prompts (SOUL) jeder Rolle. Änderungen gelten sofort für neue Gespräche.',
      bots: 'Die Truppe: fertige Rollen, die der Raumleiter nach Bedarf in eine Suite holt.',
      nutzer: 'Die Familie. Jeder sieht nur seine Räume, der Admin alle.',
      rechner: 'Die Rechnerflotte hinter Tikki. Grundlage für die Bot-Armee.',
      gedaechtnis: 'Was Tikki sich merkt: getrennt nach Nutzer, System und Projekt.',
      betrieb: 'Wie die Räume arbeiten: dein Name im Raum, Dauerbetrieb.',
      system: 'Backend, Gateway, Verbindungen, Updates.'
    },
    roles: {
      save: 'Speichern',
      saved: 'Gespeichert',
      unsaved: 'Ungespeicherte Änderungen',
      discard: 'Verwerfen',
      loading: 'Lade …',
      loadError: 'Die Regeln sind gerade nicht lesbar.',
      retry: 'Erneut versuchen',
      saveError: (profile: string) => `Nicht gespeichert für ${profile}:`,
      clones: (namen: string) => `Speichern gilt auch für: ${namen}.`,
      missingProfile:
        'Profil ist auf diesem Backend noch nicht angelegt. Einrichten mit tikki/werkzeuge/rollen-einrichten.sh.',
      houseRules: 'Hausregeln (gelten für alle Rollen)',
      pick: 'Rolle wählen'
    },
    bots: {
      name: 'Rolle',
      task: 'Aufgabe',
      model: 'Modell',
      vorgabe: 'Vorgabe',
      port: 'Port',
      status: 'Status',
      atStart: 'ab Start im Raum',
      onDemand: 'nach Bedarf',
      online: 'läuft',
      offline: 'aus',
      missing: 'nicht eingerichtet',
      unknown: 'unbekannt',
      statusFehler: 'Der Stand der Rollen ist gerade nicht lesbar – läuft das Backend?',
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
    bilderBlockiert:
      'Bilder aus dem Netz werden nicht geladen – so erfährt der Absender nicht, dass du die Mail liest.',
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
    unread: 'ungelesen',
    wrote: (from: string) => `${from} schrieb:`
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
    briefingBitte: 'Gib mir bitte ein Briefing.',
    vorlesen: 'Antwort vorlesen',
    vorlesenAn: 'an',
    vorlesenAus: 'aus',
    keinChat: 'Kein Gespräch offen. Klick zuerst ins Eingabefeld.',
    update: 'Tikki-Update verfügbar',
    // Says what is true without the upstream's name: the brand watch would turn
    // "bei Hermes" into "bei Tikki", and these changes are not Tikki's own.
    updateText: (n, version) => `${n} neue Änderungen stehen bereit${version ? ` (Version ${version})` : ''}.`,
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
    output: 'Output-Screen',
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
      'Der Raumdienst läuft auf diesem Backend nicht. Das Gateway neu starten (tikki/werkzeuge/rollen-einrichten.sh richtet es ein).',
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
    brauchtDich: 'Braucht dich',
    mensch: 'Mensch',
    takt: 'Takt',
    takte: {
      stuendlich: 'stündlich',
      halbstuendlich: 'alle 30 Minuten',
      taeglich: 'täglich 06:00',
      werktags: 'werktags 08:00',
      montags: 'montags 09:00'
    },
    taktEinmalig: 'Einmalig',
    taktEigener: 'Eigener Takt …',
    taktPlatzhalter: 'z. B. every 2h oder 0 7 * * *',
    dauerauftrag: 'Dauerauftrag',
    leiter: 'Raumleiter-Modell',
    leiterStandard: (modell: string) => `Standard (${modell})`,
    rollen: 'Bots von Anfang an am Tisch (Raumleiter und deine KI sitzen immer dort)',
    keineNachrichten: 'Noch nichts gesagt. Der Raumleiter meldet sich, sobald er geplant hat.',
    denkt: name => `${name} denkt …`,
    schreiben: 'In den Raum sprechen … (Enter sendet, @raumleiter weckt nur ihn)',
    senden: 'Senden',
    mikro: 'Mikrofon: sprechen statt tippen',
    mikroStopp: 'Aufnahme beenden',
    mikroSchreibt: 'Wird verschriftlicht …',
    vorlesen: 'Raumleiter vorlesen',
    freigabe: 'bittet um Freigabe',
    freigabeEinmal: 'Einmal erlauben',
    freigabeAblehnen: 'Ablehnen',
    rueckfrage: 'Rückfrage',
    rueckfrageAntwort: 'Deine Antwort',
    rueckfrageSenden: 'Antworten',
    rundeGescheitert: 'Eine Runde ist gescheitert',
    rundeNochmal: 'Noch einmal versuchen',
    zeitplanPausiert: 'pausiert',
    offeneFreigabe: 'Freigabe offen',
    offeneRueckfrage: 'Rückfrage offen',
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
    zielPlatzhalter: 'Worum geht es? Das wird deine erste Nachricht im Raum.'
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
      betrieb: 'How rooms work: your name in a room, around-the-clock operation.',
      system: 'Backend, gateway, connections, updates.'
    },
    roles: {
      save: 'Save',
      saved: 'Saved',
      unsaved: 'Unsaved changes',
      discard: 'Discard',
      loading: 'Loading …',
      loadError: 'The rules cannot be read right now.',
      retry: 'Try again',
      saveError: (profile: string) => `Not saved for ${profile}:`,
      clones: (namen: string) => `Saving also applies to: ${namen}.`,
      missingProfile: 'Profile is not set up on this backend yet. Run tikki/werkzeuge/rollen-einrichten.sh.',
      houseRules: 'House rules (apply to every role)',
      pick: 'Pick a role'
    },
    bots: {
      name: 'Role',
      task: 'Task',
      model: 'Model',
      vorgabe: 'Default',
      port: 'Port',
      status: 'Status',
      atStart: 'in the room from the start',
      onDemand: 'on demand',
      online: 'running',
      offline: 'off',
      missing: 'not set up',
      unknown: 'unknown',
      statusFehler: 'The state of the roles cannot be read right now – is the backend running?',
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
      mensch: 'Person name',
      menschHinweis: 'Goes in front of what you say in a room, so several people stay apart there.',
      waToken: 'WhatsApp bridge token',
      waTokenHinweis:
        'Lets Tikki read new WhatsApp messages for the briefing. The token lives with the backend in the tikki profile, not in the app; it is never shown.',
      waTokenPlatzhalter: 'Paste token',
      waTokenErsetzen: 'Paste a new token',
      waTokenSpeichern: 'Save',
      waTokenEntfernen: 'Remove',
      waTokenStand: {
        unbekannt: 'checking …',
        gesetzt: 'stored',
        fehlt: 'not stored',
        fehler: 'Not reachable – is the backend running and the tikki profile set up?'
      },
      rundUmDieUhr:
        'Around the clock: rooms with a schedule keep running on the backend as a standing order even when the app is closed. The watchkeeper walks all rooms every 15 minutes; tikki/werkzeuge/rollen-einrichten.sh sets it up.'
    },
    gedaechtnis: {
      laeuft: 'running on this machine',
      aus: 'not reachable',
      pruefe: 'checking …',
      unbekannt: 'state unknown',
      erklaerung:
        "Honcho is Tikki's memory and runs as its own service on this machine: one workspace for the system, one peer per person, one AI peer per role, one session per suite. Every role profile points at it.",
      starten: 'Start it in the terminal:'
    },
    ressourcen: {
      titel: 'Resources (MR)',
      erklaerung:
        'What is free right now: provider keys (names only) and whether their endpoint answers, subscription CLIs, local model servers, and which room-lead clone is usable – local before subscription before API. Probed on the Tikki machine; the MR bot refreshes it hourly.',
      pruefen: 'Check now',
      aktualisieren: 'Refresh',
      laedt: 'checking …',
      fehler: 'Check failed – is the backend running and the tikki profile set up?',
      anbieter: 'Provider',
      schluessel: 'Key',
      erreichbar: 'reachable',
      modelle: 'Models',
      abo: 'Subscription',
      angemeldet: 'signed in',
      abgemeldet: 'signed out',
      ja: 'yes',
      nichtGeprueft: 'not checked',
      abos: 'Subscriptions',
      lokal: 'Local',
      keinServer: 'no model server running',
      frei: 'Free now',
      nichtsFrei: 'nothing – no key reachable, no subscription signed in, no local server'
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
    bilderBlockiert: 'Pictures from the net are not loaded – so the sender does not learn that you read the mail.',
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
    unread: 'unread',
    wrote: (from: string) => `${from} wrote:`
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
    briefingBitte: 'Please give me a briefing.',
    vorlesen: 'Read replies aloud',
    vorlesenAn: 'on',
    vorlesenAus: 'off',
    keinChat: 'No conversation open. Click into the input first.',
    update: 'Tikki update available',
    updateText: (n, version) => `${n} new changes are available${version ? ` (version ${version})` : ''}.`,
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
    output: 'Output screen',
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
      'The room service is not running on this backend. Restart the gateway (tikki/werkzeuge/rollen-einrichten.sh sets it up).',
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
    brauchtDich: 'Needs you',
    mensch: 'Person',
    takt: 'Schedule',
    takte: {
      stuendlich: 'hourly',
      halbstuendlich: 'every 30 minutes',
      taeglich: 'daily 06:00',
      werktags: 'weekdays 08:00',
      montags: 'Mondays 09:00'
    },
    taktEinmalig: 'Once',
    taktEigener: 'Custom schedule …',
    taktPlatzhalter: 'e.g. every 2h or 0 7 * * *',
    dauerauftrag: 'Standing order',
    leiter: 'Room-lead model',
    leiterStandard: (modell: string) => `Default (${modell})`,
    rollen: 'Bots at the table from the start (the room lead and your AI always sit there)',
    keineNachrichten: 'Nothing said yet. The room lead speaks up once it has planned.',
    denkt: name => `${name} is thinking …`,
    schreiben: 'Speak into the room … (Enter sends, @raumleiter wakes only the lead)',
    senden: 'Send',
    mikro: 'Microphone: speak instead of typing',
    mikroStopp: 'Stop recording',
    mikroSchreibt: 'Transcribing …',
    vorlesen: 'Read the room lead aloud',
    freigabe: 'asks for approval',
    freigabeEinmal: 'Allow once',
    freigabeAblehnen: 'Deny',
    rueckfrage: 'Question',
    rueckfrageAntwort: 'Your answer',
    rueckfrageSenden: 'Answer',
    rundeGescheitert: 'A turn failed',
    rundeNochmal: 'Try again',
    zeitplanPausiert: 'paused',
    offeneFreigabe: 'Approval pending',
    offeneRueckfrage: 'Question pending',
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
    zielPlatzhalter: 'What is it about? This becomes your first message in the room.'
  }
}

/** Tikki is a German-first product; every other locale falls back to English. */
export const areaLabels = (locale: Locale): AreaLabels => (locale === 'de' ? de : en)
