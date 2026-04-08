# SRE Incident Intake & Triage Agent

## Project Overview

Sistema multi-agente de IA para automatizar el intake, triage, ticketing y notificación de incidentes en aplicaciones e-commerce. Construido para el **AgentX Hackathon 2026**.

## Tech Stack

| Component | Technology |
|---|---|
| Backend | Python 3.12 + FastAPI |
| Agent Framework | Claude Agent SDK |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Frontend | Next.js (App Router) + Tailwind CSS |
| Database | SQLite (via SQLAlchemy async) |
| Observability | Langfuse (self-hosted via Docker, OpenTelemetry) |
| Notifications | Slack webhooks + SendGrid email (real integrations) |
| Deployment | Docker Compose |

## Architecture

Multi-agent system with an **Orchestrator** that coordinates 4 specialized sub-agents:

```
                    ┌──────────────────────────┐
                    │   Orchestrator Agent     │
                    │   (coordinates flow,     │
                    │    manages state,        │
                    │    human-in-the-loop)    │
                    └────────────┬─────────────┘
                                 │
          ┌──────────┬───────────┼───────────┬──────────┐
          ▼          ▼           ▼           ▼          ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ Analyzer │ │Classifier│ │ Ticketer │ │ Notifier │
    │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │
    └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- **Orchestrator**: Coordina el flujo completo. Human-in-the-loop para incidentes Critical.
- **Analyzer Agent**: Analiza texto, logs y attachments del incidente.
- **Classifier Agent**: Clasifica severidad, categoría y asigna equipo.
- **Ticketer Agent**: Crea tickets con datos de triage.
- **Notifier Agent**: Envía notificaciones via Slack y email.

### Artifacts

El sistema genera dos artifacts por cada incidente triageado:
1. **Triage Report** (markdown): Análisis completo con clasificación, evidencia y recomendaciones.
2. **Incident Timeline**: Registro cronológico de cada acción del agente.

### Human-in-the-Loop

Incidentes clasificados como **Critical** requieren aprobación humana antes de crear ticket y notificar. El frontend muestra un prompt de aprobación.

## Project Structure

```
├── CLAUDE.md                    # This file - project overview for Claude
├── AGENTS_USE.md                # Agent documentation (hackathon deliverable)
├── README.md                    # Public-facing project README
├── .claude/
│   ├── skills/                  # Claude Code skills for development
│   │   ├── fastapi-backend/     # FastAPI patterns and conventions
│   │   ├── nextjs-frontend/     # Next.js patterns and conventions
│   │   ├── claude-agent-sdk/    # Claude Agent SDK patterns
│   │   └── langfuse-observability/ # Langfuse integration patterns
│   └── agents/                  # Agent definitions for the SRE system
│       ├── orchestrator.md      # Orchestrator agent spec
│       ├── analyzer.md          # Analyzer agent spec
│       ├── classifier.md        # Classifier agent spec
│       ├── ticketer.md          # Ticketer agent spec
│       └── notifier.md          # Notifier agent spec
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, lifespan
│   │   ├── config.py            # Pydantic Settings
│   │   ├── database.py          # SQLAlchemy async engine
│   │   ├── models.py            # ORM models (Incident, Ticket, Notification)
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── api/                 # REST endpoints
│   │   ├── agent/               # Multi-agent system implementation
│   │   ├── services/            # Business logic (CRUD, files)
│   │   └── security/            # Input sanitization, prompt injection defense
│   └── tests/
├── frontend/                    # Next.js app
│   └── src/
│       ├── app/                 # App Router pages
│       ├── components/          # React components
│       ├── lib/                 # API client, types
│       └── hooks/               # React hooks
└── docker-compose.yml           # Full stack (backend, frontend, langfuse stack)
```

## Conventions

- **Python**: Use async/await everywhere. Type hints required. Pydantic for validation.
- **API**: All endpoints under `/api/v1/`. RESTful. JSON responses.
- **Database**: SQLAlchemy 2.0 async style. UUID primary keys.
- **Frontend**: TypeScript strict. App Router. Server components by default, client components only when needed.
- **Agent tools**: Use `@tool` decorator from Claude Agent SDK. Each tool returns structured data.
- **Error handling**: FastAPI HTTPException for API errors. Agent errors logged to Langfuse.
- **Environment**: All secrets via `.env` file. Never commit secrets.

## Key Commands

```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# Full stack
docker compose up --build

# Tests
cd backend && pytest
```

## Agent System Details

See `.claude/agents/` for individual agent specifications.
See `AGENTS_USE.md` for the complete hackathon documentation.
See `backend/app/agent/` for the implementation.
