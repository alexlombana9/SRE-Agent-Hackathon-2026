---
name: claude-agent-sdk
description: >
  Patterns for building multi-agent systems with the Claude Agent SDK.
  Trigger: When working with agent code, tools, prompts, or orchestration in convex/agents/.
metadata:
  author: alexlombana9
  version: "2.0"
---

## When to Use

Load this skill when:
- Implementing agent tools in `convex/agents/`
- Designing system prompts for sub-agents
- Building the orchestrator or sub-agent logic
- Integrating the Claude Agent SDK with Convex actions

## Critical Patterns

### Pattern 1: Defining Agent Tools

Tools are defined as JSON schema for the Anthropic API.

```typescript
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

// Define tools as JSON schema for the API
const classifyTool: Anthropic.Tool = {
  name: "classify_incident",
  description: "Classify an incident by severity, category, and assign a team.",
  input_schema: {
    type: "object",
    properties: {
      severity: {
        type: "string",
        enum: ["critical", "high", "medium", "low"],
        description: "Incident severity level",
      },
      category: {
        type: "string",
        enum: ["payment", "inventory", "checkout", "auth", "performance", "infra", "other"],
        description: "Incident category",
      },
      assigned_team: {
        type: "string",
        description: "Team responsible for handling this incident",
      },
      reasoning: {
        type: "string",
        description: "Explanation of why this classification was chosen",
      },
    },
    required: ["severity", "category", "assigned_team", "reasoning"],
  },
}
```

### Pattern 2: Agentic Loop with Tool Use

Run the agent loop — send messages, handle tool_use responses, execute tools, send results back.

```typescript
import Anthropic from "@anthropic-ai/sdk"

async function runAgent(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolHandlers: Record<string, (input: any) => Promise<any>>,
) {
  const client = new Anthropic()
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ]

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    })

    // Check if agent wants to use tools
    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const handler = toolHandlers[block.name]
          const result = await handler(block.input)
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }
      }

      messages.push({ role: "assistant", content: response.content })
      messages.push({ role: "user", content: toolResults })
    } else {
      // Agent is done (stop_reason === "end_turn")
      return response
    }
  }
}
```

### Pattern 3: Multi-Agent Orchestration

Each sub-agent is a separate invocation with its own system prompt and tools. The orchestrator coordinates them sequentially via Convex actions.

```typescript
async function orchestrateTriage(incidentData: IncidentData) {
  // Step 1: Analyzer
  const analysis = await runAgent(
    ANALYZER_PROMPT,
    formatIncident(incidentData),
    analyzerTools,
    analyzerHandlers,
  )

  // Step 2: Classifier (receives analysis output)
  const classification = await runAgent(
    CLASSIFIER_PROMPT,
    `Analyze this triage analysis:\n${JSON.stringify(analysis)}`,
    classifierTools,
    classifierHandlers,
  )

  // Step 3: Check human-in-the-loop for critical
  if (classification.severity === "critical") {
    await requestHumanApproval(incidentData, classification)
    return // Resume after approval
  }

  // Step 4: Ticketer
  const ticket = await runAgent(/* ... */)

  // Step 5: Notifier
  await runAgent(/* ... */)
}
```

## Anti-Patterns

### Don't: Skip the agentic loop

```typescript
// Bad - single call without handling tool_use
const response = await client.messages.create({
  model: "claude-sonnet-4-6", messages, tools,
})
return response.content[0].text // Might be a tool_use block, not text!
```

### Don't: Put all logic in one massive prompt

```typescript
// Bad - one agent doing everything
const SYSTEM_PROMPT = "You are an analyzer, classifier, ticketer, and notifier..."

// Good - each sub-agent has a focused prompt
const ANALYZER_PROMPT = "You are an incident analyzer. Your only job is to..."
const CLASSIFIER_PROMPT = "You are an incident classifier. Given an analysis, you..."
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Create client | `const client = new Anthropic()` |
| Model ID | `claude-sonnet-4-6` |
| Tool use check | `response.stop_reason === "tool_use"` |
| End turn check | `response.stop_reason === "end_turn"` |
| Tool result msg | `{ type: "tool_result", tool_use_id: id, content: "..." }` |
| Max tokens | `4096` for most agents, `8192` for analyzer |
| Vision (images) | Use `{ type: "image", source: { type: "base64", ... } }` in message content |
