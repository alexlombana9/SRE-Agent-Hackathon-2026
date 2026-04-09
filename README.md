# Trusty — SRE AI Agent Platform

An AI-powered **multi-agent SRE system** that automates the full incident response lifecycle for e-commerce applications: intake, analysis, ticketing, notification, autonomous debugging, and QA code review. Built for the **AgentX Hackathon 2026**.

## Problem

When incidents occur in production e-commerce systems, the manual process of reading reports, classifying severity, assigning teams, creating tickets, and tracking resolution is slow and error-prone. Critical minutes are lost while engineers manually read, categorize, and route each report.

## Solution

A multi-agent system that:

1. **Ingests** multimodal incident reports (text + images + logs) via a real-time web UI
2. **Analyzes** the report using a specialized Analyzer Agent (text + vision)
3. **Gates critical incidents** through human-in-the-loop approval before escalation
4. **Creates tickets** in Linear with full context via a Ticketer Agent
5. **Notifies** engineering teams via Slack, Discord, Email, and SMS through a Notifier Agent
6. **Debugs autonomously** using a Debugger Agent running code in Vercel Sandbox
7. **Reviews fixes** via a QA Reviewer Agent before marking resolution
8. **Closes the loop** by notifying the original reporter when the incident is resolved

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19 + Vite)                   │
│   TanStack Router · TanStack Query · Tailwind CSS v4 · Clerk   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Incident     │  │ Incident     │  │ Ticket Board +       │  │
│  │ Report Form  │  │ Detail +     │  │ Notification Feed    │  │
│  │ (multimodal) │  │ Agent Trail  │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Convex WebSocket (real-time)
┌────────────────────────────▼────────────────────────────────────┐
│                     CONVEX BACKEND                              │
│          (serverless functions + real-time sync + AI)           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Convex AI Agent Component                   │   │
│  │  (persistent threads, tool calls, message history)       │   │
│  │                                                          │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │   │
│  │  │  Analyzer  │→ │   Ticketer   │→ │    Notifier     │  │   │
│  │  │   Agent    │  │    Agent     │  │     Agent       │  │   │
│  │  └────────────┘  └──────────────┘  └─────────────────┘  │   │
│  │         │                                    │           │   │
│  │         ▼                                    │           │   │
│  │  ┌────────────┐  ┌──────────────┐            │           │   │
│  │  │  Debugger  │→ │  QA / Code   │────────────┘           │   │
│  │  │   Agent    │  │Review Agent  │                        │   │
│  │  └────────────┘  └──────────────┘                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌────────┐  ┌────────────┐   │
│  │  Convex  │  │  Convex File │  │ Clerk  │  │  Langfuse  │   │
│  │    DB    │  │   Storage    │  │  Auth  │  │  (traces)  │   │
│  └──────────┘  └──────────────┘  └────────┘  └────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────────┐
          ▼                  ▼                       ▼
   ┌─────────────┐   ┌──────────────┐      ┌───────────────────┐
   │   Linear    │   │  Slack /     │      │  Vercel Sandbox   │
   │  (tickets)  │   │  Discord /   │      │  (safe code exec) │
   └─────────────┘   │  Email / SMS │      └───────────────────┘
                      └──────────────┘
```

### Multi-Agent Pipeline

| Agent | Role | Tools |
|-------|------|-------|
| **Orchestrator** | Coordinates pipeline, manages state, human-in-the-loop gates | Convex actions (sequential sub-agent invocation) |
| **Analyzer** | Multimodal analysis of text, logs, and images | `extract_error_patterns`, `analyze_image`, `lookup_known_issue` |
| **Ticketer** | Creates Linear tickets with full context | `create_linear_ticket`, `update_incident_record` |
| **Notifier** | Multi-channel notifications (Slack, Discord, Email, SMS) | `send_slack_message`, `send_discord_message`, `send_email`, `send_sms` |
| **Debugger** | Autonomous fix in Vercel Sandbox | `create_sandbox`, `run_in_sandbox`, `destroy_sandbox` |
| **QA Reviewer** | Reviews proposed fix, approves or rejects | `analyze_code_changes`, `check_regression_risk` |

### Pipeline Flow

```
Incident submitted
    → Analyzer (text + logs + images)
        → [If Critical: Human Approval Gate]
            → Ticketer (Linear ticket)
                → Notifier (Slack + Discord + Email + SMS)
                    → Debugger (Vercel Sandbox fix)
                        → QA Reviewer (approve/reject)
                            → [If rejected: retry Debugger, max 3 cycles]
                            → Resolution Notifications
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
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

## Quick Start

### Local Development

```bash
git clone https://github.com/alexlombana9/SRE-Agent-Hackathon-2026.git
cd SRE-Agent-Hackathon-2026

# Install pnpm if not already installed
npm install -g pnpm

# Install dependencies
pnpm install

# Start Convex (auto-generates .env.local with VITE_CONVEX_URL)
npx convex dev
```

After Convex starts, set the **required** environment variables:

```bash
# Clerk auth (from https://dashboard.clerk.com → API Keys)
npx convex env set CLERK_FRONTEND_API_URL https://your-app.clerk.accounts.dev

# Anthropic LLM (from https://console.anthropic.com — must have credits loaded)
npx convex env set ANTHROPIC_API_KEY sk-ant-your-key

# Twilio (required at startup — use real creds or placeholders)
npx convex env set TWILIO_ACCOUNT_SID ACxxxxx
npx convex env set TWILIO_AUTH_TOKEN your-token
```

Add the Clerk publishable key to `.env.local`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your-key-here
```

**Critical:** Create a JWT Template in Clerk Dashboard → Configure → JWT Templates → New → name it `convex`, set claims to `{"aud": "convex"}`. Without this, authentication will not work.

```bash
# Start both frontend and Convex dev server
pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Convex Dashboard (local) | http://127.0.0.1:6790 |
| Langfuse | https://cloud.langfuse.com (if configured) |

See [QUICKGUIDE.md](./QUICKGUIDE.md) for detailed step-by-step instructions including all API key setup and troubleshooting.

## Repository Structure

```
├── convex/                      # Convex backend (serverless DB + functions)
│   ├── schema.ts                # Database schema (Zod-typed tables)
│   ├── index.ts                 # Core utilities (zQuery, zMutation, zodTable)
│   ├── auth.ts                  # Auth helpers (getCurrentUser, requireRole)
│   ├── auth.config.ts           # Clerk authentication config
│   ├── config.ts                # Error response config
│   ├── users.ts                 # User management (CRUD, RBAC)
│   ├── http.ts                  # HTTP action handlers (webhooks)
│   └── agents/                  # Agent implementations (planned)
│
├── src/                         # React 19 frontend (Vite)
│   ├── routes/                  # TanStack Router file-based routes
│   │   ├── __root.tsx           # Root layout (Clerk + Convex + Query providers)
│   │   ├── index.tsx            # Auth redirect
│   │   ├── sign-in.tsx          # Clerk sign-in page
│   │   ├── _authenticated.tsx   # Protected layout (auth guard)
│   │   └── demo/                # Demo pages (Convex, forms, query)
│   ├── components/              # Shared UI components
│   │   ├── Header.tsx           # Navigation header
│   │   ├── Footer.tsx           # Footer
│   │   ├── ThemeToggle.tsx      # Light/dark/auto theme
│   │   └── ui/                  # shadcn/ui component library
│   ├── integrations/            # Provider wrappers (Convex, TanStack Query)
│   ├── hooks/                   # React hooks
│   ├── lib/                     # Utilities (query client, env validation)
│   └── styles.css               # Tailwind CSS v4 entry point
│
├── .claude/
│   ├── agents/                  # Agent specifications (markdown)
│   │   ├── orchestrator.md
│   │   ├── analyzer.md
│   │   ├── classifier.md
│   │   ├── ticketer.md
│   │   └── notifier.md
│   └── skills/                  # Claude Code development skills
│
├── context/                     # Hackathon reference documents
├── PROJECT.md                   # Complete technical specification
├── AGENTS_USE.md                # Agent documentation (hackathon deliverable)
├── SCALING.md                   # Scalability analysis
├── QUICKGUIDE.md                # Setup and test instructions
├── CLAUDE.md                    # Project context for Claude Code
└── README.md                    # This file
```

## Documentation

| Document | Description |
|----------|-------------|
| [PROJECT.md](./PROJECT.md) | Complete technical specification and architecture details |
| [AGENTS_USE.md](./AGENTS_USE.md) | Multi-agent architecture, use cases, observability, and security |
| [SCALING.md](./SCALING.md) | Scalability analysis, bottlenecks, and cost model |
| [QUICKGUIDE.md](./QUICKGUIDE.md) | Step-by-step instructions to run and test the application |

## AgentX Hackathon 2026

**#AgentXHackathon**

## License

[MIT](./LICENSE)
