# AGENTS_USE.md

# Trusty — SRE AI Agent Platform

## 1. Agent Overview

**Agent Name:** Trusty SRE Multi-Agent System
**Purpose:** End-to-end automation of incident intake, analysis, ticketing (Linear), multi-channel notification (Slack, Discord, Email, SMS), autonomous debugging via Vercel Sandbox, and AI-driven QA code review. Reduces incident response time from minutes to under 60 seconds for the triage phase, and provides an autonomous fix attempt within minutes of the report.
**Tech Stack:** React 19 + Vite, Convex (AI Agent Component), Claude Sonnet 4.6, Clerk, Linear, Slack/Discord/SendGrid/Twilio, Vercel Sandbox SDK, Langfuse, Zod, TanStack Router/Query

---

## 2. Agents & Capabilities

### Agent: Orchestrator

| Field | Description |
|-------|-------------|
| **Role** | Coordinates the full pipeline. Creates and manages Convex AI Agent threads for each sub-agent. Handles state transitions, human-in-the-loop gates for Critical incidents, and generates the final triage report + timeline artifact. |
| **Type** | Semi-autonomous (human-in-the-loop for Critical severity before Linear ticket is created) |
| **LLM** | Claude Sonnet 4.6 (decision-making for pipeline routing only) |
| **Inputs** | Incident ID. Loads full incident data from Convex DB (text, logs, file storage attachments). |
| **Outputs** | Updated incident record at each step, triage report (markdown), incident timeline (JSON), Langfuse trace. |
| **Tools** | None directly. Coordinates sub-agents by invoking Convex actions sequentially and updating incident status in Convex DB. |

### Agent: Analyzer

| Field | Description |
|-------|-------------|
| **Role** | Performs multimodal analysis of the incident. Reads the title, description, raw log text, and base64-encoded image attachments (screenshots, error dialogs, monitoring graphs). Produces a structured technical summary. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 (multimodal: text + images) |
| **Inputs** | Incident title, description, rawLogs (string), attachment URLs (resolved from Convex File Storage) |
| **Outputs** | Structured analysis JSON: `{summary, key_findings[], error_patterns[], affected_systems[], user_impact, log_analysis, image_analysis, confidence}` |
| **Tools** | `extract_error_patterns` (regex + LLM parse of logs), `analyze_image` (describe screenshot content), `lookup_known_issue` (search Convex knowledge base) |

### Agent: Ticketer

| Field | Description |
|-------|-------------|
| **Role** | Creates a structured, actionable ticket in Linear with full context from the Analyzer output. Assigns severity label, team, and priority. Returns the ticket URL for linking in notifications. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 |
| **Inputs** | Analyzer output JSON, incident title, reporter name, severity, category |
| **Outputs** | `{ticket_id, ticket_number, ticket_url, title, assigned_team}` |
| **Tools** | `create_linear_ticket` (Linear API — creates issue with labels, description, assignee), `update_incident_record` (Convex mutation to save ticket reference) |

### Agent: Notifier

| Field | Description |
|-------|-------------|
| **Role** | Sends multi-channel notifications to stakeholders. Determines recipients and channels based on severity and assigned team. Invoked twice: once on ticket creation, once on resolution. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 (message composition) |
| **Inputs** | Incident data, ticket data, classifier output, notification_phase: `"intake"` or `"resolution"` |
| **Outputs** | `{notifications_sent: [{channel, recipient, status, message_type, timestamp}]}` |
| **Tools** | `send_slack_message` (Slack Webhook → #sre-incidents or #sre-critical), `send_discord_message` (Discord Webhook → SRE server), `send_email` (SendGrid — team + reporter), `send_sms` (Twilio — on-call engineer for Critical only), `record_notification` (Convex mutation) |

### Agent: Debugger

| Field | Description |
|-------|-------------|
| **Role** | The autonomous fix agent. Uses Vercel Sandbox to create an isolated execution environment, replicates the failing scenario from the incident analysis, iterates on code changes, and validates that the fix resolves the reported error. |
| **Type** | Autonomous (with retry loop, max 3 iterations) |
| **LLM** | Claude Sonnet 4.6 |
| **Inputs** | Analyzer output (error patterns, affected systems, log excerpts), incident description |
| **Outputs** | `{fix_description, diff, sandbox_run_id, sandbox_logs, test_results, confidence, iterations_used}` |
| **Tools** | `create_sandbox` (Vercel Sandbox SDK — spin up isolated Node.js environment), `run_in_sandbox` (execute test scenarios and proposed fixes), `destroy_sandbox` (clean up after session), `read_codebase_context` (load relevant e-commerce source files for context) |

> Vercel Sandbox reference: https://vercel.com/docs/vercel-sandbox/sdk-reference
> Each sandbox is ephemeral and network-isolated. No production systems are reachable from within.

### Agent: QA Reviewer

| Field | Description |
|-------|-------------|
| **Role** | Reviews the Debugger Agent's proposed fix. Behaves like an AI code reviewer (similar to Greptile): checks whether the diff actually addresses the root cause, looks for regressions, validates against e-commerce codebase conventions, and either approves or rejects with feedback. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 |
| **Inputs** | Original incident analysis, proposed diff/fix_description, sandbox test results |
| **Outputs** | `{approved: bool, confidence, review_notes, suggestions[], regression_risks[]}` |
| **Tools** | `analyze_code_changes` (semantic diff analysis), `check_regression_risk` (scan for side effects on related systems), `validate_fix_addresses_issue` (compare fix against original error patterns) |

---

## 3. Architecture & Orchestration

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│              FRONTEND (React 19 + Vite + TanStack Router)        │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │ Incident     │  │ Incident Detail +   │  │ Ticket Board + │  │
│  │ Report Form  │  │ Agent Pipeline Trail│  │ Notification   │  │
│  │ (multimodal) │  │ (real-time updates) │  │ Feed           │  │
│  └──────────────┘  └─────────────────────┘  └────────────────┘  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Convex WebSocket (real-time)
┌──────────────────────────────▼───────────────────────────────────┐
│                    CONVEX BACKEND                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │             Convex AI Agent Component                      │  │
│  │  (thread management, tool routing, message persistence)    │  │
│  │                                                            │  │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐              │  │
│  │  │ Analyzer │──▶│ Ticketer │──▶│ Notifier │              │  │
│  │  │  Agent   │   │  Agent   │   │  Agent   │              │  │
│  │  └──────────┘   └──────────┘   └──────────┘              │  │
│  │       │                              ▲                    │  │
│  │       ▼                             │                    │  │
│  │  ┌──────────┐   ┌──────────┐        │                    │  │
│  │  │ Debugger │──▶│    QA    │────────┘                    │  │
│  │  │  Agent   │   │ Reviewer │  (resolution notification)  │  │
│  │  └──────────┘   └──────────┘                             │  │
│  │       ▲               │                                  │  │
│  │       └───(retry)─────┘ (if rejected, max 3 cycles)      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌────────┐  ┌─────────────┐   │
│  │  Convex  │  │ Convex File  │  │ Clerk  │  │  Langfuse   │   │
│  │    DB    │  │   Storage    │  │  Auth  │  │  (tracing)  │   │
│  └──────────┘  └──────────────┘  └────────┘  └─────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          ▼                    ▼                       ▼
   ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │   Linear    │   │  Slack / Discord │   │  Vercel Sandbox  │
   │  (tickets)  │   │  / Email / SMS   │   │  (debug exec)    │
   └─────────────┘   └──────────────────┘   └──────────────────┘
```

- **Orchestration approach:** Sequential pipeline with conditional branching and a retry loop between Debugger → QA Reviewer. The Orchestrator manages state in Convex DB and invokes each sub-agent as a Convex action. Real-time reactive queries propagate state to the frontend instantly — no polling required.

- **State management:** Convex DB. Status transitions per incident: `submitted → analyzing → ticketed → notified → debugging → reviewing → resolved`. Each transition is a Convex mutation, atomically consistent and immediately reactive.

- **Error handling:** Analyzer failure → retry once, then mark incident as `triage_failed`. Ticketer failure → retry with exponential backoff (max 3), then alert on-call. Debugger → QA rejection loop capped at 3 cycles; if no approved fix, incident is flagged for manual resolution. Notifier failures are logged and retried independently; they never block the pipeline.

- **Handoff logic:** Each agent's output is stored as a structured JSON field on the incident record in Convex. The next agent reads its input from that field. All data flows through Convex — agents never call each other directly.

---

## 4. Context Engineering

- **Context sources:** Incident text (title + description), raw log text, image attachments (screenshots via Convex File Storage), Linear ticket history (for deduplication), e-commerce codebase source files (loaded by Debugger Agent for fix context), Convex knowledge base of known issues.

- **Context strategy:** Each agent receives only what it needs. The Analyzer gets raw incident data. The Ticketer receives only the Analyzer's structured JSON output. The Debugger receives error patterns and affected system names, then fetches relevant source files itself via `read_codebase_context`. The QA Reviewer gets the diff + original error patterns side by side. This staged context design minimizes token usage and prevents context confusion.

- **Token management:** Max 4096 output tokens per agent (8192 for Analyzer with large log files). Raw logs truncated to the last 500 lines before LLM call. Images resized to ≤1MB before base64 encoding. Sandbox logs truncated to last 200 lines when passed to QA Reviewer.

- **Grounding:** The Analyzer quotes specific log lines as evidence. The Debugger's fix is always validated against actual sandbox execution results — not just the LLM's prediction. The QA Reviewer compares the proposed diff against the original error patterns extracted by the Analyzer, grounding its approval decision in concrete artifacts.

- **Guardrails:** Input sanitization strips HTML tags and known prompt injection patterns (`ignore previous instructions`, `system prompt`, `you are now`, `act as`, `disregard`, `override`) before any content reaches an LLM. Frontend shows a real-time warning banner when patterns are detected. System prompts include explicit instructions to disregard attempts to override behavior.

---

## 5. Use Cases

### Use Case 1: Standard Incident Triage + Notification

- **Trigger:** User submits incident via web UI with title, description, and optional attachments
- **Steps:**
  1. Frontend submits multipart form data (text fields + files via Convex File Storage)
  2. Convex mutation creates incident record, triggers Orchestrator action
  3. Analyzer Agent processes text + logs + images → structured analysis
  4. Ticketer Agent creates Linear ticket with full context
  5. Notifier Agent sends Slack + Discord + email to assigned team
  6. UI shows real-time agent trail: `Analyzing... → Ticketed → Team Notified`
- **Expected outcome:** Incident triaged in <30 seconds, ticket created in Linear, team notified

### Use Case 2: Critical Incident with Human Approval Gate

- **Trigger:** Analyzer classifies severity as `critical` (or user pre-selects Critical)
- **Steps:**
  1. Steps 1-3 same as standard triage
  2. Orchestrator detects critical severity, sets status to `awaiting_approval`
  3. Immediate Slack + Discord alert: "Critical incident requires human approval before ticketing"
  4. Frontend shows approval prompt on incident detail page
  5. Engineer reviews analysis and approves (or adjusts severity) via Convex mutation
  6. Pipeline resumes: Ticketer → Notifier (with #sre-critical channel) → Debugger → QA
- **Expected outcome:** Critical incidents get human verification before escalation

### Use Case 3: Autonomous Debugging + Fix

- **Trigger:** After team notification, Debugger Agent is launched
- **Steps:**
  1. Debugger reads error patterns from Analyzer output
  2. Creates Vercel Sandbox (isolated Node.js environment)
  3. Loads relevant e-commerce source files for context
  4. Replicates failing scenario in sandbox
  5. Iterates on fix (up to 3 attempts)
  6. QA Reviewer analyzes proposed diff
  7. If approved: fix is documented on the incident record, resolution notifications sent
  8. If rejected: Debugger retries with QA feedback (max 3 cycles)
- **Expected outcome:** Fix proposed and validated within minutes of incident report

### Use Case 4: Resolution & Reporter Notification

- **Trigger:** QA Agent approves fix OR engineer manually resolves Linear ticket
- **Steps:**
  1. Linear webhook triggers Convex HTTP action → marks incident `resolved`
  2. Notifier Agent sends email to original reporter: "Your incident has been resolved"
  3. Slack + Discord update posted to #sre-incidents
  4. Linear ticket status updated to Done
- **Expected outcome:** Reporter notified, ticket closed, full lifecycle complete

### Use Case 5: Multimodal Screenshot Analysis

- **Trigger:** User uploads a screenshot of the error along with the text report
- **Steps:**
  1. Screenshot stored in Convex File Storage
  2. Analyzer Agent retrieves file, encodes as base64
  3. Claude Sonnet 4.6 vision API processes the image alongside log text
  4. Image analysis output included in structured findings: visible error codes, UI state, stack traces visible in screenshot
- **Expected outcome:** Agent extracts error details from both logs and visual artifacts

---

## 6. Observability

- **Logging:** Convex function logs (available in Convex Dashboard) capture all agent actions with incident_id, agent_name, tool_name, duration, and result status. Structured JSON format.

- **Tracing:** Langfuse traces every pipeline invocation end-to-end. Each sub-agent is a span within the parent trace. LLM calls tracked as "generation" observations: model, input/output tokens, cost, latency. Tool calls tracked as individual child spans with inputs and outputs.

- **Metrics:** Token usage per agent (input/output), latency per agent and total pipeline, classification confidence distribution, notification success/failure rates, Debugger fix success rate, QA approval rate, sandbox session duration.

- **Real-time UI:** The incident detail page renders the agent pipeline trail in real time via Convex reactive queries — each status update appears instantly as the pipeline progresses. No polling.

- **Dashboards:** Langfuse dashboard showing: trace timeline, cost per triage, token distribution across agents, latency percentiles, error rates, sandbox usage.

### Evidence

*(Screenshots and Langfuse trace exports to be added after implementation)*

---

## 7. Security & Guardrails

- **Prompt injection defense:** Real-time frontend banner warns users when injection patterns are detected in their input. Server-side: input sanitization strips HTML and known injection strings before reaching any LLM. System prompts instruct Claude to ignore override attempts.

- **Input validation:** Zod schemas enforce field constraints throughout (frontend TanStack Form, Convex mutation validators, agent tool input schemas). Title: 5–200 chars. Description: 10–10000 chars. Attachments: PNG/JPG/GIF/TXT/LOG/JSON only, max 5MB each, max 3 files. Raw logs capped at 50,000 characters.

- **Sandbox isolation:** The Debugger Agent runs all code execution inside Vercel Sandbox. The sandbox is ephemeral, network-isolated, and destroyed after each session. Production systems are unreachable from within the sandbox. No filesystem access to host environment.

- **Tool use safety:** Each agent tool validates its inputs via Zod before execution. Tools can only perform predefined actions. No shell access, no arbitrary HTTP calls, no filesystem writes outside the sandbox context.

- **Auth:** All Convex mutations require a valid Clerk session (JWT-verified server-side). Agent actions run server-side only — no API keys are exposed to the client.

- **Data handling:** All secrets (Anthropic, Linear, Slack, Discord, SendGrid, Twilio, Vercel) stored as Convex environment variables. Never in client code or version control. Reporter PII (email, phone) is stored only for notification purposes and never logged to Langfuse traces.

### Evidence

*(Guardrail test results to be added after implementation)*

---

## 8. Scalability

- **Current capacity:** Convex scales automatically with usage. Agent pipeline throughput is limited primarily by Claude API rate limits (~60 requests/min on standard tier) and Vercel Sandbox session concurrency.

- **Scaling approach:** See SCALING.md for full analysis.

- **Bottlenecks identified:** Claude API rate limits (primary), Vercel Sandbox concurrent session limits, Linear API rate limits during high-volume incidents.

---

## 9. Lessons Learned & Team Reflections

*(To be filled after implementation)*

- **What worked well:**
- **What you would do differently:**
- **Key technical decisions:**
