# Honcho als Tikki-Dienst

Honcho ist das Gedächtnis von Tikki: ein Workspace `tikki` für das System, ein Peer je Mensch,
ein AI-Peer je Rolle, eine Honcho-Sitzung je Suite. Es läuft **auf dem eigenen Rechner**, nicht
in der Cloud. `honcho.sh` holt Honcho in einem festgenagelten Stand (`HONCHO_SHA`, v3.2.1) und
startet API, Deriver, Postgres mit pgvector und Redis per Docker Compose. Alle Ports liegen nur
auf `127.0.0.1`; die API antwortet auf `http://127.0.0.1:8000/health`.

```bash
export XAI_API_KEY="…"                       # Deriver + Dialektik über xAI (OpenAI-kompatibel)
tikki/dienste/honcho/honcho.sh start         # holen, .env schreiben, starten, auf /health warten
tikki/dienste/honcho/honcho.sh status        # läuft / aus
tikki/dienste/honcho/honcho.sh logs
tikki/dienste/honcho/honcho.sh stop
```

Die Hermes-Profile zeigen über `tikki/hermes/vorlage-honcho.json` (`baseUrl`) auf diesen Dienst;
ein lokaler `baseUrl` braucht keinen `HONCHO_API_KEY`. Der Admin-Bereich **Gedächtnis** zeigt, ob
Honcho erreichbar ist.

## Embeddings

xAI bietet keine Embeddings. Ohne eigenen Endpunkt setzt das Skript `EMBED_MESSAGES=false`:
Honcho läuft dann mit Volltext statt Vektorsuche. Für Vektorsuche einen OpenAI-kompatiblen
Embedding-Endpunkt angeben, z. B. einen lokalen Dienst auf dem Mac Studio:

```bash
export TIKKI_EMBEDDING_BASE_URL="http://127.0.0.1:11434/v1"
export TIKKI_EMBEDDING_MODEL="nomic-embed-text"
```

## Ablage

`~/.tikki/dienste/honcho` (Quelltext, `docker-compose.yml`, `.env` mit Rechten 600). Mit
`TIKKI_DIENSTE` verschiebbar. Die Datenbank liegt in Docker-Volumes (`pgdata`, `redis-data`).
