# SRE Incident Intake & Triage Agent

An AI-powered **multi-agent SRE system** that automates incident intake, triage, ticketing, and notification for e-commerce applications. Built for the **AgentX Hackathon 2026**.

## Problem

When incidents occur in production e-commerce systems, the manual process of reading reports, classifying severity, assigning teams, and tracking resolution is slow and error-prone. Critical minutes are lost while engineers manually read, categorize, and route each report.

## Solution

A multi-agent system that:

1. **Ingests** multimodal incident reports (text + images/logs) via a web UI
2. **Analyzes** the report using a specialized Analyzer Agent
3. **Classifies** severity, category, and assigns a team via a Classifier Agent
4. **Gates critical incidents** through human-in-the-loop approval before escalation
5. **Creates tickets** with full context via a Ticketer Agent
6. **Notifies** the engineering team via Slack and email through a Notifier Agent
7. **Tracks resolution** and notifies the original reporter when the incident is closed

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js :3001)                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────┐  │
│  │Dashboard │  │Incident Form │  │  Detail +  │  │ Tickets  │  │
│  │  Stats   │  │ (multipart)  │  │  Triage    │  │  List    │  │
│  └──────────┘  └──────────────┘  │  Progress  │  └──────────┘  │
│                                   └───────────┘                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP (REST API)
┌───────────────────────────▼─────────────────────────────────────┐
│                     BACKEND (FastAPI :8000)                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     ORCHESTRATOR                           │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │ Analyzer │─▶│ Classifier │─▶│ Ticketer │─▶│Notifier │ │  │
│  │  │  Agent   │  │   Agent    │  │  Agent   │  │  Agent  │ │  │
│  │  └──────────┘  └─────┬──────┘  └──────────┘  └─────────┘ │  │
│  │                      │                                     │  │
│  │              ┌───────▼────────┐                            │  │
│  │              │ Human-in-Loop  │  (Critical only)           │  │
│  │              │ Approval Gate  │                             │  │
│  │              └────────────────┘                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌─────────┐  ┌─────────────┐  │
│  │  SQLite  │  │   Runbooks   │  │  Slack   │  │  SendGrid   │  │
│  │    DB    │  │    (JSON)    │  │ Webhook  │  │   Email     │  │
│  └──────────┘  └──────────────┘  └─────────┘  └─────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ OpenTelemetry
               ┌───────────▼────────────┐
               │       Langfuse         │
               │   (Observability)      │
               │       :3000            │
               └────────────────────────┘
```

### Multi-Agent Pipeline

| Agent | Role | Tools |
|-------|------|-------|
| **Orchestrator** | Coordinates pipeline, manages state, human-in-the-loop | Python orchestration (no LLM tools) |
| **Analyzer** | Analyzes incident text, logs, and images | `extract_error_patterns`, `analyze_screenshot` |
| **Classifier** | Classifies severity/category/team, consults runbooks | `lookup_runbook`, `classify_incident` |
| **Ticketer** | Creates structured tickets with full context | `create_ticket` |
| **Notifier** | Sends Slack and email notifications | `send_slack_notification`, `send_email_notification`, `record_notification` |

### Pipeline Flow

```
Incident submitted
    → Analyzer (text + logs + images)
        → Classifier (severity / category / team)
            → [If Critical: Human Approval Gate]
                → Ticketer (SRE-XXXX)
                    → Notifier (Slack + Email)
                        → Triage Report + Timeline generated
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js (App Router) + Tailwind CSS |
| Backend | Python 3.12 + FastAPI |
| Agent Framework | Anthropic Claude API (tool use) |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Database | SQLite (via SQLAlchemy async) |
| Observability | Langfuse (self-hosted) + OpenTelemetry |
| Notifications | Slack Webhooks + SendGrid Email |
| Containerization | Docker Compose |

## Quick Start

```bash
git clone https://github.com/alexlombana9/SRE-Agent-Hackathon-2026.git
cd SRE-Agent-Hackathon-2026
cp .env.example .env
# Edit .env with your API keys (Anthropic, Slack, SendGrid)
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3001 |
| Backend API | http://localhost:8000/docs |
| Langfuse | http://localhost:3000 |

See [QUICKGUIDE.md](./QUICKGUIDE.md) for detailed step-by-step instructions.

## Repository Structure

```
├── backend/                     # Python FastAPI + Multi-Agent system
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, lifespan
│   │   ├── config.py            # Pydantic Settings (env vars)
│   │   ├── database.py          # SQLAlchemy async engine
│   │   ├── models.py            # ORM models (Incident, Ticket, Notification)
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── api/                 # REST API endpoints
│   │   ├── agent/               # Multi-agent system
│   │   │   ├── orchestrator.py  # Pipeline coordinator
│   │   │   ├── analyzer.py      # Incident analysis agent
│   │   │   ├── classifier.py    # Severity/category classifier agent
│   │   │   ├── ticketer.py      # Ticket creation agent
│   │   │   ├── notifier.py      # Notification dispatch agent
│   │   │   ├── prompts.py       # System prompts per agent
│   │   │   ├── tools.py         # Tool definitions
│   │   │   └── runbooks.json    # Known issue knowledge base
│   │   ├── services/            # Business logic (CRUD, files)
│   │   └── security/            # Input sanitization, prompt injection defense
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                    # Next.js incident management UI
│   ├── src/
│   │   ├── app/                 # App Router pages
│   │   ├── components/          # React components
│   │   ├── lib/                 # API client, types
│   │   └── hooks/               # React hooks
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml           # Full stack orchestration
├── .env.example                 # Environment variable template
├── CLAUDE.md                    # Project context for Claude
├── AGENTS_USE.md                # Agent documentation (hackathon deliverable)
├── SCALING.md                   # Scalability analysis
├── QUICKGUIDE.md                # Step-by-step run & test guide
├── README.md                    # This file
└── LICENSE                      # MIT
```

## Documentation

| Document | Description |
|----------|-------------|
| [AGENTS_USE.md](./AGENTS_USE.md) | Multi-agent architecture, use cases, observability, and security |
| [SCALING.md](./SCALING.md) | Scalability analysis, assumptions, and technical decisions |
| [QUICKGUIDE.md](./QUICKGUIDE.md) | Step-by-step instructions to run and test the application |

## AgentX Hackathon 2026

**#AgentXHackathon**

## License

[MIT](./LICENSE)
