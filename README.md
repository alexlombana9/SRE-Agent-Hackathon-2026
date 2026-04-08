# 🚨 SRE Incident Intake & Triage Agent

An AI-powered SRE agent that automates incident intake, triage, ticketing, and notification for e-commerce applications. Built for the **AgentX Hackathon 2026**.

## 🎯 Problem

When incidents occur in production e-commerce systems, the manual process of reading reports, classifying severity, assigning teams, and tracking resolution is slow and error-prone. Critical minutes are lost while engineers manually read, categorize, and route each report.

## 💡 Solution

An intelligent agent that:

1. **Ingests** multimodal incident reports (text + images/logs) via a web UI
2. **Triages** automatically using an LLM that analyzes the report against the e-commerce codebase
3. **Creates tickets** in the ticketing system with severity, category, and suggested fix
4. **Notifies** the engineering team via email and chat
5. **Tracks resolution** and notifies the original reporter when the incident is closed

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   Backend API    │────▶│   Triage Agent  │
│   (React)    │◀────│   (FastAPI)      │◀────│   (LangGraph)   │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                            │                          │
                    ┌───────┴───────┐         ┌───────┴────────┐
                    │   SQLite DB   │         │   LLM Provider │
                    │  (Incidents   │         │  (OpenRouter / │
                    │   & Tickets)  │         │   Claude/GPT)  │
                    └───────────────┘         └───────┬────────┘
                                                      │
                    ┌─────────────────────────────────┤
                    │                │                 │
             ┌──────┴──────┐ ┌──────┴──────┐ ┌───────┴──────┐
             │   Ticket    │ │    Email    │ │    Chat      │
             │   Service   │ │   Service   │ │   Service    │
             │   (Mock)    │ │   (Mock)    │ │   (Mock)     │
             └─────────────┘ └─────────────┘ └──────────────┘

                    ┌─────────────────┐
                    │    Langfuse     │
                    │ (Observability) │
                    └─────────────────┘
```

## 🛠️ Tech Stack

| Component        | Technology                                |
|-----------------|-------------------------------------------|
| Frontend        | React + Vite + TailwindCSS                 |
| Backend         | Python 3.12 + FastAPI                      |
| Agent           | LangGraph + Tool Calling                   |
| LLM             | Claude / GPT-4o / Gemini via OpenRouter    |
| Database        | SQLite                                     |
| Observability   | Langfuse + OpenTelemetry                   |
| Containerization| Docker Compose                             |

## 🚀 Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/sre-incident-agent.git
cd sre-incident-agent
cp .env.example .env
# Edit .env → add your LLM API key
docker compose up --build
```

| Service      | URL                         |
|-------------|------------------------------|
| Frontend    | http://localhost:3000         |
| Backend API | http://localhost:8000/docs    |
| Langfuse    | http://localhost:3001         |

See [QUICKGUIDE.md](./QUICKGUIDE.md) for detailed instructions.

## 📁 Repository Structure

```
├── backend/               # FastAPI + Agent logic
│   ├── app/
│   │   ├── agent/         # LangGraph triage agent + tools
│   │   ├── models/        # Pydantic schemas + DB models
│   │   ├── routes/        # API endpoints
│   │   ├── services/      # Ticket, email, chat (mocked)
│   │   └── observability/ # Langfuse + tracing setup
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/              # React incident report UI
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
├── AGENTS_USE.md
├── SCALING.md
├── QUICKGUIDE.md
├── README.md
└── LICENSE
```

## 📋 Documentation

| Document | Description |
|----------|-------------|
| [AGENTS_USE.md](./AGENTS_USE.md) | Agent use cases, implementation, observability, and security |
| [SCALING.md](./SCALING.md) | Scalability analysis, assumptions, and technical decisions |
| [QUICKGUIDE.md](./QUICKGUIDE.md) | Step-by-step run & test instructions |

## 🏆 AgentX Hackathon 2026

**#AgentXHackathon**

## 📄 License

[MIT](./LICENSE)
