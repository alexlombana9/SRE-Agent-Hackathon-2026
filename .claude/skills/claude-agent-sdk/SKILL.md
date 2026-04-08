---
name: claude-agent-sdk
description: >
  Patterns for building multi-agent systems with the Claude Agent SDK.
  Trigger: When working with agent code, tools, prompts, or orchestration in backend/app/agent/.
metadata:
  author: alexlombana9
  version: "1.0"
---

## When to Use

Load this skill when:
- Implementing agent tools in `backend/app/agent/tools.py`
- Designing system prompts in `backend/app/agent/prompts.py`
- Building the orchestrator or sub-agent logic in `backend/app/agent/`
- Integrating the Claude Agent SDK with the FastAPI backend

## Critical Patterns

### Pattern 1: Defining Agent Tools

Tools are async Python functions. They receive structured input and return structured output for the LLM.

```python
import anthropic

client = anthropic.Anthropic()

# Define tools as JSON schema for the API
classify_tool = {
    "name": "classify_incident",
    "description": "Classify an incident by severity, category, and assign a team.",
    "input_schema": {
        "type": "object",
        "properties": {
            "severity": {
                "type": "string",
                "enum": ["critical", "high", "medium", "low"],
                "description": "Incident severity level"
            },
            "category": {
                "type": "string",
                "enum": ["payment", "inventory", "checkout", "auth", "performance", "infra", "other"],
                "description": "Incident category"
            },
            "assigned_team": {
                "type": "string",
                "description": "Team responsible for handling this incident"
            },
            "reasoning": {
                "type": "string",
                "description": "Explanation of why this classification was chosen"
            }
        },
        "required": ["severity", "category", "assigned_team", "reasoning"]
    }
}
```

### Pattern 2: Agentic Loop with Tool Use

Run the agent loop manually — send messages, handle tool_use responses, execute tools, send results back.

```python
import anthropic
import json

async def run_agent(system_prompt: str, user_message: str, tools: list, tool_handlers: dict):
    client = anthropic.Anthropic()
    messages = [{"role": "user", "content": user_message}]

    while True:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=system_prompt,
            tools=tools,
            messages=messages,
        )

        # Check if agent wants to use tools
        if response.stop_reason == "tool_use":
            # Collect all tool uses from response
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    handler = tool_handlers[block.name]
                    result = await handler(block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})
        else:
            # Agent is done (stop_reason == "end_turn")
            return response
```

### Pattern 3: Multi-Agent Orchestration

Each sub-agent is a separate invocation with its own system prompt and tools. The orchestrator coordinates them sequentially.

```python
async def orchestrate_triage(incident_data: dict):
    # Step 1: Analyzer
    analysis = await run_agent(
        system_prompt=ANALYZER_PROMPT,
        user_message=format_incident(incident_data),
        tools=analyzer_tools,
        tool_handlers=analyzer_handlers,
    )

    # Step 2: Classifier (receives analysis output)
    classification = await run_agent(
        system_prompt=CLASSIFIER_PROMPT,
        user_message=f"Analyze this triage analysis:\n{analysis}",
        tools=classifier_tools,
        tool_handlers=classifier_handlers,
    )

    # Step 3: Check human-in-the-loop for critical
    if classification["severity"] == "critical":
        await request_human_approval(incident_data, classification)
        return  # Resume after approval

    # Step 4: Ticketer
    ticket = await run_agent(...)

    # Step 5: Notifier
    await run_agent(...)
```

## Anti-Patterns

### Don't: Skip the agentic loop

```python
# Bad - single call without handling tool_use
response = client.messages.create(model="claude-sonnet-4-6", messages=messages, tools=tools)
return response.content[0].text  # Might be a tool_use block, not text!
```

### Don't: Put all logic in one massive prompt

```python
# Bad - one agent doing everything
SYSTEM_PROMPT = "You are an analyzer, classifier, ticketer, and notifier..."

# Good - each sub-agent has a focused prompt
ANALYZER_PROMPT = "You are an incident analyzer. Your only job is to..."
CLASSIFIER_PROMPT = "You are an incident classifier. Given an analysis, you..."
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Create client | `client = anthropic.Anthropic()` |
| Model ID | `claude-sonnet-4-6` |
| Tool use check | `response.stop_reason == "tool_use"` |
| End turn check | `response.stop_reason == "end_turn"` |
| Tool result msg | `{"type": "tool_result", "tool_use_id": id, "content": "..."}` |
| Max tokens | `4096` for most agents, `8192` for analyzer |
| Vision (images) | Use `{"type": "image", "source": {"type": "base64", ...}}` in message content |
