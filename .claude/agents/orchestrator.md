---
name: orchestrator
description: >
  Orchestrator agent that coordinates the full incident triage pipeline.
  Manages state transitions, delegates to sub-agents, and handles human-in-the-loop for critical incidents.
type: orchestrator
model: claude-sonnet-4-6
---

## Agent Overview

**Agent Name:** Orchestrator
**Role:** Coordinator of the full incident triage pipeline
**Type:** Semi-autonomous (human-in-the-loop for Critical incidents)
**LLM:** Claude Sonnet 4.6

## Responsibilities

1. Receive new incidents and load complete data from the DB
2. Coordinate sequential execution of sub-agents: Analyzer → Classifier → Ticketer → Notifier
3. Manage incident state (submitted → triaging → awaiting_approval → triaged)
4. Implement human-in-the-loop: pause the pipeline for Critical incidents and wait for approval
5. Generate artifacts: Triage Report (markdown) and Incident Timeline
6. Handle sub-agent errors and log fallbacks
7. Report traces to Langfuse

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| incident_id | Convex action trigger | string (Convex ID) |
| Incident data | Convex DB | Incident record (title, description, reporter, attachments, logs) |

## Outputs

| Output | Destination | Format |
|--------|-------------|--------|
| Updated incident | Convex DB | Incident with severity, category, team, analysis, fix |
| Triage Report | DB (agent_analysis field) | Markdown document |
| Incident Timeline | DB (JSON in timeline field) | Array of {timestamp, agent, action, details} |
| Trace | Langfuse | Full trace with spans per sub-agent |

## Flow

```
START (incident_id)
  │
  ▼
Load incident from DB
Set status = "triaging"
Initialize timeline = []
  │
  ▼
Call Analyzer Agent
  → Receives: incident text, logs, attachments
  → Returns: structured analysis (summary, key_findings, error_patterns, affected_systems)
  → Timeline: {agent: "analyzer", action: "analysis_complete", details: ...}
  │
  ▼
Call Classifier Agent
  → Receives: analyzer output
  → Returns: {severity, category, assigned_team, confidence, reasoning}
  → Timeline: {agent: "classifier", action: "classification_complete", details: ...}
  │
  ▼
Is severity == "critical"?
  ├── YES → Set status = "awaiting_approval"
  │         Save partial results to DB
  │         Notify via Slack: "🚨 Critical incident requires approval"
  │         PAUSE (wait for human approval via API)
  │         Timeline: {agent: "orchestrator", action: "awaiting_approval"}
  │
  └── NO ──┐
           ▼
Call Ticketer Agent
  → Receives: incident data + classification
  → Returns: {ticket_id, ticket_number}
  → Timeline: {agent: "ticketer", action: "ticket_created", details: ...}
  │
  ▼
Call Notifier Agent
  → Receives: incident + ticket + classification
  → Returns: {notifications_sent: [{channel, recipient, status}]}
  → Timeline: {agent: "notifier", action: "notifications_sent", details: ...}
  │
  ▼
Generate Triage Report (markdown)
Save to incident.agent_analysis
Set status = "triaged"
Save timeline to incident
  │
  ▼
END
```

## Error Handling

| Error | Action |
|-------|--------|
| Analyzer fails | Retry once. If still fails, set status="triage_failed", log to Langfuse, notify via Slack |
| Classifier fails | Use default severity="medium", category="other", team="platform-team" |
| Ticketer fails | Log error, set status="triaged" without ticket, notify team manually |
| Notifier fails | Log error, record failed notifications in DB, don't block pipeline |
| LLM rate limit | Exponential backoff with max 3 retries |

## State Management

State is persisted in Convex DB. The orchestrator updates the incident record at each step:
- `status`: Current pipeline stage
- `severity`, `category`, `assigned_team`: Set after classification
- `agent_analysis`: Set at end with full triage report
- `suggested_fix`: Set at end with fix recommendations

## Implementation File

`convex/agents/orchestrator.ts`
