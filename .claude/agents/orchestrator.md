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
**Role:** Coordinador del pipeline completo de triage de incidentes
**Type:** Semi-autonomous (human-in-the-loop para incidentes Critical)
**LLM:** Claude Sonnet 4.6

## Responsibilities

1. Recibir incidentes nuevos y cargar datos completos de la DB
2. Coordinar la ejecución secuencial de sub-agentes: Analyzer → Classifier → Ticketer → Notifier
3. Gestionar el estado del incidente (submitted → triaging → awaiting_approval → triaged)
4. Implementar human-in-the-loop: pausar el pipeline para incidentes Critical y esperar aprobación
5. Generar artifacts: Triage Report (markdown) y Incident Timeline
6. Manejar errores de sub-agentes y registrar fallbacks
7. Reportar trazas a Langfuse

## Inputs

| Input | Source | Format |
|-------|--------|--------|
| incident_id | FastAPI background task | string (UUID) |
| Incident data | SQLite DB | Incident model (title, description, reporter, attachments, logs) |

## Outputs

| Output | Destination | Format |
|--------|-------------|--------|
| Updated incident | SQLite DB | Incident with severity, category, team, analysis, fix |
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

State is persisted in the SQLite database. The orchestrator updates the incident record at each step:
- `status`: Current pipeline stage
- `severity`, `category`, `assigned_team`: Set after classification
- `agent_analysis`: Set at end with full triage report
- `suggested_fix`: Set at end with fix recommendations

## Implementation File

`backend/app/agent/orchestrator.py`
