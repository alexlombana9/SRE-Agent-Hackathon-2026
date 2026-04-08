# PROJECT.md — Trusty: SRE AI Agent Platform

## What is Trusty?

Trusty is an AI-powered SRE (Site Reliability Engineering) platform that automates the full incident response lifecycle for e-commerce applications. When something breaks, engineers submit a report — Trusty does the rest: analyzes the issue, files a ticket, notifies the team, attempts an autonomous fix in a secure sandbox, has that fix reviewed by a QA agent, and closes the loop with the reporter.

Built for the **AgentX Hackathon 2026** on top of Convex, Clerk, and Claude Sonnet 4.6.

---

## Architecture Overview

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
                             │ Convex client (WebSocket, real-time)
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

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TanStack Router, TanStack Query, TanStack Form |
| Styling | Tailwind CSS v4, shadcn/ui, Radix UI |
| Auth | Clerk (React SDK) |
| Backend | Convex (serverless DB + functions + real-time) |
| AI Agents | Convex AI Agent Component + Claude Sonnet 4.6 |
| LLM | `claude-sonnet-4-6` (multimodal: text + images + logs) |
| Ticketing | Linear API |
| Notifications | Slack Webhooks, Discord Webhooks, SendGrid Email, Twilio SMS |
| Sandbox | Vercel Sandbox SDK (isolated code execution for debugging) |
| Observability | Langfuse (LLM traces, token usage, latency) |
| Validation | Zod (schema validation throughout) |

---

## Agent Pipeline — Step by Step

### Phase 1: Intake & Analysis

**Trigger:** User submits an incident report via the UI (title, description, severity, category, + optional attachments: screenshots, log files, video).

```
User Input → Convex Mutation → Convex AI Agent Thread created
                                       │
                                       ▼
                              Analyzer Agent (Claude Sonnet 4.6)
                              ├── Reads: title, description, raw logs
                              ├── Reads: base64 images / screenshots (multimodal)
                              └── Produces: structured analysis JSON
                                  {summary, key_findings, error_patterns,
                                   affected_systems, user_impact, log_analysis}
```

### Phase 2: Ticketing

**Trigger:** Analyzer output is ready.

```
Analyzer output → Ticketer Agent (Claude Sonnet 4.6)
                  ├── Tool: create_linear_ticket
                  │   └── Creates ticket in Linear with full context
                  │       title, description, severity label, assignee
                  └── Returns: {ticket_id, ticket_url, ticket_number}
```

### Phase 3: Notifications (Intake)

**Trigger:** Linear ticket created.

```
Ticket data → Notifier Agent (Claude Sonnet 4.6)
              ├── Tool: send_slack_message   → #sre-incidents channel
              ├── Tool: send_discord_message → SRE Discord server
              ├── Tool: send_email           → assigned team + reporter
              └── Tool: send_sms             → on-call engineer (critical only)
```

### Phase 4: Autonomous Debugging

**Trigger:** After notifications, Debugger Agent is launched asynchronously.

```
Analysis + ticket → Debugger Agent (Claude Sonnet 4.6)
                    ├── Understands: error patterns, affected systems
                    ├── Tool: create_sandbox (Vercel Sandbox SDK)
                    │   └── Spins up isolated Node.js environment
                    ├── Tool: run_in_sandbox
                    │   ├── Replicates the failing scenario
                    │   ├── Iterates on fixes (up to 5 attempts)
                    │   └── Records: what changed, why, test results
                    └── Returns: {fix_description, diff, sandbox_logs, confidence}
```

> The Vercel Sandbox provides a fully isolated, ephemeral execution environment.
> No production systems are touched. See: https://vercel.com/docs/vercel-sandbox/sdk-reference

### Phase 5: QA & Code Review

**Trigger:** Debugger produces a fix candidate.

```
Fix candidate → QA Agent (Claude Sonnet 4.6)
                ├── Analyzes: the proposed diff against the original error
                ├── Tool: analyze_code_changes
                │   ├── Checks: does this actually solve the reported issue?
                │   ├── Checks: are there regressions or side effects?
                │   └── Checks: does it match the e-commerce codebase conventions?
                ├── Produces: {approved: bool, confidence, review_notes, suggestions}
                └── If rejected: feeds back to Debugger for another iteration
```

### Phase 6: Resolution Notifications

**Trigger:** QA Agent approves the fix (or engineer manually resolves the ticket).

```
Resolution → Notifier Agent (second invocation)
             ├── Tool: send_email  → original reporter ("Your issue is resolved")
             ├── Tool: send_slack_message → #sre-incidents (resolution update)
             ├── Tool: send_discord_message → SRE server
             └── Tool: update_linear_ticket → marks ticket as Done
```

---

## State Machine

```
submitted
   │
   ▼
analyzing          ← Analyzer Agent running
   │
   ▼
ticketed           ← Linear ticket created
   │
   ▼
notified           ← Team notifications sent
   │
   ▼
debugging          ← Debugger Agent running in Vercel Sandbox
   │
   ▼
reviewing          ← QA Agent reviewing the fix
   │
   ├──(rejected)──▶ debugging  (retry loop, max 3 cycles)
   │
   ▼
resolved           ← Fix approved, resolution notifications sent
```

All state transitions are persisted in Convex and streamed in real-time to the frontend via Convex's reactive query system — no polling needed.

---

## Key Design Decisions

### Why Convex?

Convex replaces the entire backend stack (FastAPI + SQLite + background workers) with a single platform. Real-time reactivity is built-in — when an agent updates incident state, the frontend reflects it instantly without polling. The Convex AI Agent Component handles agent thread management, tool call routing, and message history persistence natively.

### Why Vercel Sandbox?

The Debugger Agent needs to execute code to validate fixes. Vercel Sandbox provides an isolated, ephemeral Node.js environment with no access to production systems. The sandbox is created per incident, executes the agent's test scenarios, and is destroyed after the session. This makes the debugging loop safe by default.

### Why Sequential Agents?

Each agent depends on the structured output of the previous one. The Ticketer needs the Analyzer's classification. The Debugger needs the Analyzer's error patterns. Sequential execution guarantees full context at each step and produces a linear, debuggable Langfuse trace.

### Multimodal Input

The Analyzer Agent sends images (screenshots, diagrams) directly to Claude Sonnet 4.6's vision API alongside text and log content. File attachments are stored in Convex File Storage and referenced by URL when building the agent's message context.

### Human-in-the-Loop

Critical incidents (auto-classified or user-marked) pause the pipeline before creating the Linear ticket. The frontend shows an approval prompt. Engineers can modify the classification before the pipeline continues.

---

## Data Model (Convex Schema)

```
incidents
├── _id, _creationTime
├── title, description (text)
├── reporterName, reporterEmail, reporterPhone
├── severity: "critical" | "high" | "medium" | "low"
├── category: "payment" | "checkout" | "inventory" | "auth" | "performance" | "infra" | "other"
├── status: "submitted" | "analyzing" | "ticketed" | "notified" | "debugging" | "reviewing" | "resolved"
├── attachmentIds: string[]          ← Convex File Storage IDs
├── rawLogs: string
├── analysis: object                  ← Analyzer output
├── classification: object            ← Severity, team, confidence
├── linearTicketId, linearTicketUrl
├── fixDescription, fixDiff
├── qaResult: object
└── timeline: {event, timestamp, agentName, detail}[]

notifications
├── _id, incidentId
├── channel: "slack" | "discord" | "email" | "sms"
├── recipient, status, sentAt, messageBody

agentThreads
├── _id, incidentId, agentName
└── threadId (Convex AI Agent thread reference)
```

---

## Security & Guardrails

- **Prompt injection defense:** Input sanitization strips known injection patterns before reaching any LLM. Frontend shows a real-time guardrail banner when patterns are detected.
- **Input validation:** Zod schemas enforce field lengths and types throughout (frontend form, Convex mutations, agent tool inputs).
- **Sandbox isolation:** Debugger Agent code execution is fully contained within Vercel Sandbox — no filesystem access to production, no network egress beyond the sandbox's controlled environment.
- **Auth:** All Convex mutations require a valid Clerk session. Agents run server-side only.
- **Secrets:** All API keys in environment variables via Convex dashboard environment config. Never in client code.

---

## Observability

- **Langfuse** traces every agent invocation with: model, input tokens, output tokens, latency, tool calls, cost.
- **Convex Dashboard** shows function logs, error rates, and real-time DB state.
- **Frontend agent trail** displays each pipeline step's status, duration, and agent output in real time.

---

## Project Structure

```
├── PROJECT.md                   # This file
├── AGENTS_USE.md                # Agent documentation (hackathon deliverable)
├── QUICKGUIDE.md                # Setup and test instructions
├── SCALING.md                   # Scaling analysis
├── README.md                    # Public-facing overview
├── CLAUDE.md                    # Claude Code project context
├── docker-compose.yml           # Full stack container orchestration
├── .env.example                 # Required environment variables
│
├── src/                         # React frontend (Vite)
│   ├── routes/                  # TanStack Router file-based routes
│   │   ├── index.tsx            # Auth redirect
│   │   ├── sign-in.tsx
│   │   ├── _authenticated.tsx   # Protected layout
│   │   └── demo/                # Demo pages
│   ├── components/              # Shared UI components
│   ├── hooks/                   # React hooks
│   ├── lib/                     # API helpers, types
│   └── styles.css               # Tailwind CSS v4 entry
│
├── convex/                      # Convex backend
│   ├── schema.ts                # Database schema (Zod-typed)
│   ├── index.ts                 # Shared utilities (zQuery, zMutation, etc.)
│   ├── auth.ts / auth.config.ts # Clerk integration
│   ├── http.ts                  # HTTP action handlers
│   ├── users.ts                 # User mutations/queries
│   └── agents/                  # Agent implementations
│       ├── orchestrator.ts      # Pipeline coordinator
│       ├── analyzer.ts          # Multimodal incident analyzer
│       ├── ticketer.ts          # Linear ticket creation
│       ├── notifier.ts          # Multi-channel notifications
│       ├── debugger.ts          # Vercel Sandbox debugging
│       └── qa.ts                # Code review / fix validation
│
└── context/                     # Hackathon reference docs
    ├── assignment.md
    ├── technical_requirements.md
    ├── deliverables.md
    └── resources_for_hackathon.md
```
