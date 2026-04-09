# Trusty — SRE AI Agent Platform

## Project Overview

Sistema multi-agente de IA para automatizar el ciclo completo de respuesta a incidentes en aplicaciones e-commerce: intake, análisis, ticketing, notificación, debugging autónomo y code review por IA. Construido para el **AgentX Hackathon 2026**.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React 19 + Vite 7 + TanStack Start (Router / Query / Form) |
| Styling | Tailwind CSS v4 + shadcn/ui + Radix UI |
| Auth | Clerk (React SDK + JWT) |
| Backend | Convex (serverless DB + functions + real-time sync) |
| AI Agents | Convex AI Agent Component + Claude Sonnet 4.6 |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) — multimodal |
| Ticketing | Linear API |
| Notifications | Slack Webhooks, Discord Webhooks, Resend Email, Twilio SMS |
| Sandbox | Vercel Sandbox SDK (isolated code execution) |
| Observability | Langfuse (LLM traces, token usage, latency) |
| Validation | Zod v4 (schema validation end-to-end) |
| Linter / Formatter | Biome |
| Package Manager | pnpm |

## Architecture

Multi-agent system with an **Orchestrator** that coordinates 5 specialized sub-agents via Convex AI Agent Component:

```
                    ┌──────────────────────────┐
                    │   Orchestrator Agent     │
                    │   (coordinates flow,     │
                    │    manages state,        │
                    │    human-in-the-loop)    │
                    └────────────┬─────────────┘
                                 │
       ┌──────────┬──────────────┼──────────────┬──────────┐
       ▼          ▼              ▼              ▼          ▼
 ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
 │ Analyzer │ │ Ticketer │ │ Notifier │ │ Debugger │ │    QA    │
 │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │ │ Reviewer │
 └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- **Orchestrator**: Coordina el pipeline secuencial. Human-in-the-loop para incidentes Critical.
- **Analyzer Agent**: Análisis multimodal del incidente (texto + imágenes + logs).
- **Ticketer Agent**: Crea tickets en Linear con contexto completo.
- **Notifier Agent**: Notificaciones multi-canal (Slack, Discord, Email, SMS).
- **Debugger Agent**: Fix autónomo en Vercel Sandbox (aislado, efímero).
- **QA Reviewer Agent**: Revisa el fix propuesto, aprueba o rechaza con feedback.

### Data Flow

Los agentes no se comunican entre sí directamente. Toda la data fluye a través de Convex DB: cada agente escribe su output como JSON estructurado en el registro del incidente, y el siguiente agente lee de ahí.

### State Machine

```
submitted → analyzing → ticketed → notified → debugging → reviewing → resolved
```

Cada transición es una Convex mutation — atómicamente consistente y reactiva en el frontend via WebSocket.

### Human-in-the-Loop

Incidentes clasificados como **Critical** pausan el pipeline antes del ticketing. El frontend muestra un prompt de aprobación. El ingeniero puede modificar la clasificación antes de continuar.

### Artifacts

El sistema genera por cada incidente triageado:
1. **Triage Report** (markdown): Análisis completo con clasificación, evidencia y recomendaciones.
2. **Incident Timeline**: Registro cronológico de cada acción del agente (JSON).

## Project Structure

```
├── CLAUDE.md                    # This file - project context for Claude Code
├── PROJECT.md                   # Complete technical specification
├── AGENTS_USE.md                # Agent documentation (hackathon deliverable)
├── SCALING.md                   # Scalability analysis
├── QUICKGUIDE.md                # Setup and test instructions
├── README.md                    # Public-facing project README
├── .claude/
│   ├── skills/                  # Claude Code skills for development
│   │   ├── claude-agent-sdk/    # Claude Agent SDK patterns
│   │   ├── convex-backend/       # Convex backend patterns
│   │   └── langfuse-observability/ # Langfuse integration patterns
│   └── agents/                  # Agent definitions for the SRE system
│       ├── orchestrator.md      # Orchestrator agent spec
│       ├── analyzer.md          # Analyzer agent spec
│       ├── classifier.md        # Classifier agent spec
│       ├── ticketer.md          # Ticketer agent spec
│       └── notifier.md          # Notifier agent spec
├── convex/                      # Convex backend (serverless)
│   ├── schema.ts                # Database schema (Zod-typed tables)
│   ├── index.ts                 # Core utilities (zQuery, zMutation, zodTable)
│   ├── auth.ts                  # Auth helpers (getCurrentUser, requireRole)
│   ├── auth.config.ts           # Clerk authentication config
│   ├── config.ts                # Error response config
│   ├── users.ts                 # User management (CRUD, RBAC)
│   ├── todos.ts                 # Demo CRUD (reference)
│   ├── http.ts                  # HTTP action handlers (webhooks)
│   └── agents/                  # Agent implementations (planned)
├── src/                         # React 19 frontend (Vite)
│   ├── routes/                  # TanStack Router file-based routes
│   │   ├── __root.tsx           # Root layout (Clerk + Convex + Query providers)
│   │   ├── index.tsx            # Auth redirect
│   │   ├── sign-in.tsx          # Clerk sign-in page
│   │   ├── _authenticated.tsx   # Protected layout (auth guard)
│   │   └── demo/                # Demo pages
│   ├── components/              # Shared UI components
│   │   └── ui/                  # shadcn/ui component library (Radix)
│   ├── integrations/            # Provider wrappers (Convex, TanStack Query)
│   ├── hooks/                   # React hooks
│   ├── lib/                     # Utilities (query client, env validation, cn)
│   └── styles.css               # Tailwind CSS v4 entry point
└── context/                     # Hackathon reference documents
```

## Conventions

- **Backend (Convex)**: Use `zQuery`/`zMutation`/`zAction` wrappers with Zod validation. All functions are async. Use `zodTable()` factory for type-safe tables.
- **Auth**: All mutations require valid Clerk session. RBAC via `requireRole(ctx, ["admin"])`.
- **Frontend**: TypeScript strict. File-based routing (TanStack Router). Client components with `useQuery()`/`useMutation()` from Convex React.
- **Validation**: Zod schemas enforce field constraints throughout (frontend forms, Convex mutations, agent tool inputs).
- **Agent tools**: JSON schema-based tool definitions compatible with Convex AI Agent Component.
- **Error handling**: `ConvexError` for API errors. Agent errors logged to Langfuse.
- **Environment**: Frontend secrets in `.env.local` (Vite). Backend secrets as Convex environment variables (dashboard).
- **Real-time**: No polling. Convex reactive queries push updates via WebSocket instantly.

## Key Commands

```bash
# Full stack (frontend + Convex dev server)
pnpm dev

# Frontend only
pnpm dev:web

# Convex only
pnpm dev:convex

# Build
pnpm build

# Tests
pnpm test

# Lint & format
pnpm check
```

## Agent System Details

See `.claude/agents/` for individual agent specifications.
See `AGENTS_USE.md` for the complete hackathon documentation.
See `PROJECT.md` for the full technical specification.
See `convex/agents/` for the implementation (planned).
