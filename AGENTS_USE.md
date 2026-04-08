# AGENTS_USE.md

# Agent #1: SRE Incident Triage System

## 1. Agent Overview

**Agent Name:** SRE Incident Triage System
**Purpose:** Multi-agent system that automates incident intake, analysis, classification, ticketing, and notification for e-commerce applications. Reduces triage time from minutes to seconds by using specialized sub-agents coordinated by an orchestrator, with human-in-the-loop for critical incidents.
**Tech Stack:** Python 3.12, FastAPI, Anthropic Claude API (Sonnet 4.6), SQLAlchemy + SQLite, Langfuse, Slack Webhooks, SendGrid Email

---

## 2. Agents & Capabilities

### Agent: Orchestrator

| Field | Description |
|-------|-------------|
| **Role** | Coordinates the full triage pipeline. Manages state transitions, delegates to sub-agents, handles human-in-the-loop for critical incidents, generates artifacts (triage report + timeline). |
| **Type** | Semi-autonomous (human-in-the-loop for Critical severity) |
| **LLM** | Claude Sonnet 4.6 (decision-making for pipeline control only) |
| **Inputs** | Incident ID from the API. Loads full incident data from DB (text, logs, attachments). |
| **Outputs** | Updated incident record with triage results, triage report (markdown), incident timeline (JSON), Langfuse trace. |
| **Tools** | No direct LLM tools. Orchestrates via Python code calling sub-agents sequentially. |

### Agent: Analyzer

| Field | Description |
|-------|-------------|
| **Role** | Analyzes incident text, raw logs, and image attachments. Produces structured findings: summary, key findings, error patterns, affected systems, user impact. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 (multimodal: text + images) |
| **Inputs** | Incident title, description, raw_logs (text), attachments (base64 images/log files) |
| **Outputs** | Structured analysis JSON: `{summary, key_findings[], error_patterns[], affected_systems[], affected_user_impact, log_analysis, image_analysis}` |
| **Tools** | `extract_error_patterns` (parse logs), `analyze_screenshot` (describe images) |

### Agent: Classifier

| Field | Description |
|-------|-------------|
| **Role** | Classifies incident severity (critical/high/medium/low), category (payment/inventory/checkout/auth/performance/infra/other), and assigns responsible team. Consults runbooks for known issues. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 |
| **Inputs** | Analyzer output (structured analysis JSON), incident title |
| **Outputs** | Classification JSON: `{severity, category, assigned_team, confidence, reasoning, suggested_fix, runbook_match}` |
| **Tools** | `lookup_runbook` (search known issues), `classify_incident` (record classification) |

### Agent: Ticketer

| Field | Description |
|-------|-------------|
| **Role** | Creates structured, actionable tickets in the system with full context from analysis and classification. Composes clear titles and detailed descriptions. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 |
| **Inputs** | Original incident data, analyzer output, classifier output |
| **Outputs** | Created ticket: `{ticket_id, ticket_number, title, description}` |
| **Tools** | `create_ticket` (insert ticket into DB with auto-incrementing SRE-XXXX number) |

### Agent: Notifier

| Field | Description |
|-------|-------------|
| **Role** | Sends notifications to stakeholders via Slack and email. Determines recipients based on severity and team. Records notification status. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4.6 |
| **Inputs** | Incident data, ticket data, classification data |
| **Outputs** | Notification results: `{notifications_sent: [{channel, recipient, status, message_type}]}` |
| **Tools** | `send_slack_notification` (Slack webhook), `send_email_notification` (SendGrid), `record_notification` (DB) |

---

## 3. Architecture & Orchestration

### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js :3001)                │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────┐  │
│  │Dashboard │  │Incident Form │  │  Detail +  │  │ Tickets  │  │
│  │  Stats   │  │ (multipart)  │  │  Triage    │  │  List    │  │
│  └──────────┘  └──────────────┘  │  Progress  │  └──────────┘  │
│                                   └───────────┘                 │
└───────────────────────────┬────────────────────────────────────┘
                            │ HTTP (REST API)
┌───────────────────────────▼────────────────────────────────────┐
│                     BACKEND (FastAPI :8000)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   API Layer (/api/v1/)                    │   │
│  │  POST /incidents  GET /incidents/{id}  POST /tickets/resolve │
│  └────────────────────────────┬──────────────────────────────┘  │
│                               │ BackgroundTask                   │
│  ┌────────────────────────────▼──────────────────────────────┐  │
│  │                   ORCHESTRATOR                             │  │
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
└──────────────────────────────────────────────────────────────────┘
                            │ OpenTelemetry
                ┌───────────▼────────────┐
                │       Langfuse         │
                │   (Observability)      │
                │   Traces, Costs,       │
                │   Token Usage          │
                │       :3000            │
                └────────────────────────┘
```

- **Orchestration approach:** Sequential pipeline with conditional branching. The Orchestrator coordinates sub-agents in order: Analyzer → Classifier → (human approval gate if Critical) → Ticketer → Notifier. Each sub-agent is a separate Claude API invocation with its own system prompt and tools.

- **State management:** SQLite database. The Orchestrator updates the incident record at each pipeline step. Status transitions: `submitted → triaging → [awaiting_approval] → triaged`. Timeline events stored as JSON array on the incident record.

- **Error handling:** Each sub-agent failure is handled independently. Analyzer failure → retry once, then abort. Classifier failure → fallback to defaults (medium/other/platform-team). Ticketer failure → log and continue without ticket. Notifier failure → record failed notification, don't block pipeline. LLM rate limits → exponential backoff (max 3 retries).

- **Handoff logic:** Sub-agents communicate via structured JSON. The Orchestrator passes each sub-agent's output as input to the next. No direct agent-to-agent communication. All data flows through the Orchestrator.

---

## 4. Context Engineering

- **Context sources:** Incident text (user-submitted title + description), raw log text (pasted by user), image attachments (screenshots, diagrams), runbook knowledge base (local JSON file with known issues and fix procedures).

- **Context strategy:** Each sub-agent receives only the context it needs. The Analyzer gets raw incident data. The Classifier gets the Analyzer's structured output (not raw data). The Ticketer gets both. This focused context prevents confusion and keeps token usage efficient.

- **Token management:** Max 4096 output tokens per sub-agent (8192 for Analyzer when processing long logs). System prompts are concise and task-focused. Large log files are truncated to the last 500 lines before sending to the LLM. Images are resized if larger than 1MB.

- **Grounding:** The Classifier uses a local runbook knowledge base to ground suggestions in real operational procedures. Error patterns are extracted from actual logs, not generated. The Analyzer quotes specific log lines and error messages as evidence. Confidence scores indicate how certain the classification is.

---

## 5. Use Cases

### Use Case 1: Standard Incident Triage

- **Trigger:** User submits incident via web UI (POST /api/v1/incidents)
- **Steps:**
  1. Frontend sends multipart form data (title, description, files, logs)
  2. Backend creates incident record, saves files, launches background triage
  3. Orchestrator loads incident, sets status to "triaging"
  4. Analyzer processes text + logs + images, returns structured analysis
  5. Classifier evaluates analysis, looks up runbooks, classifies severity/category/team
  6. Ticketer creates ticket with full context (SRE-XXXX)
  7. Notifier sends Slack message to #sre-incidents + email to reporter
  8. Orchestrator generates triage report + timeline, sets status to "triaged"
- **Expected outcome:** Incident triaged in <30 seconds, ticket created, team notified via Slack and email

### Use Case 2: Critical Incident with Human Approval

- **Trigger:** Classifier determines severity = "critical"
- **Steps:**
  1. Steps 1-5 same as standard triage
  2. Orchestrator detects critical severity, sets status to "awaiting_approval"
  3. Immediate Slack notification: "Critical incident requires approval"
  4. Frontend shows approval prompt on incident detail page
  5. Human reviews classification and approves/modifies via API
  6. Orchestrator resumes: Ticketer creates ticket, Notifier sends to #sre-critical
- **Expected outcome:** Critical incidents get human verification before ticketing, preventing false escalations

### Use Case 3: Ticket Resolution with Reporter Notification

- **Trigger:** Engineer resolves ticket via POST /api/v1/tickets/{id}/resolve
- **Steps:**
  1. Engineer adds resolution notes and clicks "Resolve"
  2. Backend updates ticket status to "resolved"
  3. Backend updates incident status to "resolved"
  4. Notifier sends email to original reporter: "Your incident has been resolved"
  5. Notifier sends Slack update to #sre-incidents
- **Expected outcome:** Reporter is notified their issue is resolved, closing the loop

---

## 6. Observability

- **Logging:** Structured logging with Python's logging module. JSON format. All agent actions logged with incident_id, agent_name, action, duration. Logs stored in stdout (Docker captures them).

- **Tracing:** Langfuse traces every triage invocation end-to-end. Each sub-agent is a span within the parent trace. LLM calls tracked as "generation" observations with model, tokens, cost. Tool calls tracked as individual spans.

- **Metrics:** Token usage per agent (input/output), latency per agent and total pipeline, classification confidence distribution, notification success/failure rates, triage throughput (incidents/hour).

- **Dashboards:** Langfuse dashboard at :3000 showing: trace timeline, cost per triage, token distribution across agents, latency percentiles, error rates.

### Evidence

*(Screenshots and trace exports to be added after implementation)*

---

## 7. Security & Guardrails

- **Prompt injection defense:** Input sanitization strips HTML tags and known injection patterns ("ignore previous instructions", "system prompt", "you are now"). Content is validated before reaching any LLM. System prompts include explicit instructions to ignore user attempts to override behavior.

- **Input validation:** Pydantic schemas enforce field lengths (title: 5-200 chars, description: 10-10000 chars). File uploads validated by MIME type whitelist (PNG, JPG, GIF, TXT, CSV, JSON, PDF only) and size limit (10MB). Raw logs capped at 50,000 characters.

- **Tool use safety:** Agent tools can only perform predefined actions (classify, create ticket, send notification). No filesystem access, no shell commands, no external API calls beyond Slack and SendGrid. Each tool validates its inputs before execution.

- **Data handling:** API keys stored in environment variables, never in code. SQLite database file excluded from version control. Reporter emails used only for notifications. No PII logged to Langfuse traces.

### Evidence

*(Test results to be added after implementation)*

---

## 8. Scalability

- **Current capacity:** Single-instance deployment handles ~100 incidents/hour (limited by LLM API rate). SQLite supports up to ~1000 concurrent reads.

- **Scaling approach:** Horizontal scaling via multiple backend instances behind a load balancer. Replace SQLite with PostgreSQL for concurrent writes. Add Redis queue (Celery/RQ) for triage job processing. Each sub-agent can be scaled independently.

- **Bottlenecks identified:** LLM API rate limits (primary bottleneck), SQLite write locking under concurrent triage, synchronous notification sending.

---

## 9. Lessons Learned & Team Reflections

*(To be filled after implementation)*

- **What worked well:**
- **What you would do differently:**
- **Key technical decisions:**

---
