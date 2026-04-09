---
name: langfuse-observability
description: >
  Patterns for integrating Langfuse observability with the SRE agent system.
  Trigger: When working with tracing, metrics, logging, or Langfuse integration.
metadata:
  author: alexlombana9
  version: "2.0"
---

## When to Use

Load this skill when:
- Adding tracing to agent invocations in `convex/agents/`
- Configuring Langfuse for the Convex backend
- Tracking LLM calls, token usage, and costs
- Setting up observability dashboards

## Critical Patterns

### Pattern 1: Initialize Langfuse Client

Initialize Langfuse in Convex actions using environment variables from the Convex dashboard.

```typescript
import { Langfuse } from "langfuse"

function getLangfuse() {
  return new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_HOST!,
  })
}
```

### Pattern 2: Trace an Agent Pipeline

Wrap the orchestrator pipeline in a Langfuse trace with spans for each sub-agent.

```typescript
async function orchestrateTriage(incidentId: string) {
  const langfuse = getLangfuse()
  const trace = langfuse.trace({
    name: "triage-pipeline",
    userId: incidentId,
    metadata: { incidentId },
    tags: ["triage", "sre"],
  })

  // Analyzer span
  const analyzerSpan = trace.span({ name: "analyzer-agent" })
  const analysis = await runAnalyzer(incidentId)
  analyzerSpan.end({ output: analysis })

  // Ticketer span
  const ticketerSpan = trace.span({ name: "ticketer-agent" })
  const ticket = await runTicketer(incidentId, analysis)
  ticketerSpan.end({ output: ticket })

  // Notifier span
  const notifierSpan = trace.span({ name: "notifier-agent" })
  await runNotifier(incidentId, ticket)
  notifierSpan.end()

  await langfuse.flushAsync()
}
```

### Pattern 3: Track LLM Calls

Record each Anthropic API call as a generation observation.

```typescript
async function callLLM(
  trace: LangfuseTraceClient,
  agentName: string,
  systemPrompt: string,
  messages: any[],
  tools: any[],
) {
  const generation = trace.generation({
    name: `${agentName}-llm-call`,
    model: "claude-sonnet-4-6",
    input: messages,
    modelParameters: { max_tokens: 4096 },
  })

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    system: systemPrompt,
    messages,
    tools,
    max_tokens: 4096,
  })

  generation.end({
    output: response.content,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  })

  return response
}
```

### Pattern 4: Score a Triage Result

Add quality scores to evaluate agent performance.

```typescript
langfuse.score({
  traceId: trace.id,
  name: "classification-confidence",
  value: classification.confidence,
  comment: `Severity: ${classification.severity}, Category: ${classification.category}`,
})
```

## Anti-Patterns

### Don't: Forget to flush before action ends

```typescript
// Bad - traces may be lost when Convex action terminates
await runPipeline()
// action ends, pending events dropped

// Good - always flush
await runPipeline()
await langfuse.flushAsync()
```

### Don't: Create traces without metadata

```typescript
// Bad - no context for debugging
const trace = langfuse.trace({ name: "triage" })

// Good - rich metadata for debugging
const trace = langfuse.trace({
  name: "triage-pipeline",
  userId: incidentId,
  metadata: { incidentId, severity, category },
  tags: ["triage", severity],
})
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Init client | `new Langfuse({ publicKey, secretKey, baseUrl })` |
| Create trace | `langfuse.trace({ name, userId, metadata, tags })` |
| Create span | `trace.span({ name, input })` |
| End span | `span.end({ output })` |
| LLM generation | `trace.generation({ name, model, input, modelParameters })` |
| End generation | `generation.end({ output, usage: { input, output } })` |
| Add score | `langfuse.score({ traceId, name, value, comment })` |
| Flush | `await langfuse.flushAsync()` |
