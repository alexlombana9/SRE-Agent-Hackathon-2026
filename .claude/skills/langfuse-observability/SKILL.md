---
name: langfuse-observability
description: >
  Patterns for integrating Langfuse observability with the SRE agent system.
  Trigger: When working with tracing, metrics, logging, or Langfuse integration.
metadata:
  author: alexlombana9
  version: "1.0"
---

## When to Use

Load this skill when:
- Adding tracing to agent invocations
- Configuring Langfuse in `backend/app/agent/`
- Working with OpenTelemetry instrumentation
- Setting up the Langfuse Docker service

## Critical Patterns

### Pattern 1: Initialize Langfuse Client

```python
from langfuse import Langfuse

from app.config import settings

langfuse = Langfuse(
    public_key=settings.langfuse_public_key,
    secret_key=settings.langfuse_secret_key,
    host=settings.langfuse_host,
)
```

### Pattern 2: Trace an Agent Invocation

Wrap each agent call in a Langfuse trace with spans for each step.

```python
from langfuse.decorators import observe, langfuse_context

@observe(name="triage-orchestrator")
async def orchestrate_triage(incident_id: str):
    langfuse_context.update_current_trace(
        user_id=incident_id,
        metadata={"incident_id": incident_id},
        tags=["triage", "sre"],
    )

    analysis = await run_analyzer(incident_id)
    classification = await run_classifier(analysis)
    ticket = await create_ticket(classification)
    await send_notifications(ticket)

@observe(name="analyzer-agent")
async def run_analyzer(incident_id: str):
    # Each sub-agent becomes a span within the trace
    ...
```

### Pattern 3: Track LLM Calls with Anthropic Integration

```python
from langfuse.decorators import observe
from langfuse import Langfuse

langfuse = Langfuse()

@observe(as_type="generation")
async def call_llm(system_prompt: str, messages: list, tools: list):
    response = client.messages.create(
        model="claude-sonnet-4-6",
        system=system_prompt,
        messages=messages,
        tools=tools,
        max_tokens=4096,
    )

    # Langfuse automatically captures input/output/tokens/cost
    langfuse_context.update_current_observation(
        model="claude-sonnet-4-6",
        usage={
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
        },
    )
    return response
```

## Anti-Patterns

### Don't: Forget to flush on shutdown

```python
# Bad - traces may be lost
# Good - flush pending events
langfuse.flush()
```

### Don't: Create traces without metadata

```python
# Bad - no context for debugging
@observe()
async def run_agent(): ...

# Good - rich metadata for debugging
@observe(name="classifier-agent")
async def run_agent():
    langfuse_context.update_current_trace(
        metadata={"incident_id": id, "severity": severity},
        tags=["classifier"],
    )
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Init client | `langfuse = Langfuse(public_key=..., secret_key=..., host=...)` |
| Trace function | `@observe(name="trace-name")` |
| LLM generation | `@observe(as_type="generation")` |
| Add metadata | `langfuse_context.update_current_trace(metadata={...})` |
| Add score | `langfuse.score(trace_id=..., name="quality", value=0.9)` |
| Flush | `langfuse.flush()` |
| Shutdown | `langfuse.shutdown()` |
