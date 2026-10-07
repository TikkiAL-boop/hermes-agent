# TencentDB Agent Memory für Tikki

Vier Schichten Gedächtnis (Gespräch → Fakten → Szenen → Persona), als eigener Dienst auf dem
Rechner. **Eine Instanz je Mensch und eine für das ganze Systemwissen**, weil der Gateway
selbst keine Mandanten trennt.

```bash
export XAI_API_KEY=…                                  # zieht Fakten und Szenen heraus
tikki/dienste/tencentdb/tencentdb.sh start system     # Port 8420
tikki/dienste/tencentdb/tencentdb.sh start thorsten   # Port 8421, nächster Mensch 8422 …
tikki/dienste/tencentdb/tencentdb.sh status
```

Das Skript baut das Docker-Bild aus einem festgenagelten Stand, legt je Instanz Datenordner,
Konfiguration und Schlüssel unter `~/.tikki/dienste/tencentdb/` an und trägt die Instanz in
`~/.tikki/gedaechtnis.json` ein. Ab dann schreibt das Tikki-Plugin `gedaechtnis` jede Runde in
die Instanz des Menschen und ins Systemwissen, und das Werkzeug `nachschlagen` sucht dort.

**Unser Wissen einspielen** (Dokumente, Handover, Rollen, alles Markdown/Text):

```bash
hermes -p tikki gedaechtnis einspielen tikki/ ~/Dokumente/Tikki-Wissen
hermes -p tikki gedaechtnis verlauf     # alle bisherigen Gespräche aller Profile nachholen
hermes -p tikki gedaechtnis status
```

Wiederholtes Einspielen erzeugt keine Doppel. Geprüft gegen den echten Gateway (Stand
`29bb8dff`): Aufnahme über `/capture`, Suche über `/search/memories` und
`/search/conversations`, Bearer-Schlüssel je Instanz.
