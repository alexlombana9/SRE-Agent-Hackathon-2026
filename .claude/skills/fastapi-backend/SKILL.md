---
name: convex-backend
description: >
  Patterns and conventions for the Convex backend of the SRE Triage Agent.
  Trigger: When working with backend code, Convex functions, database operations, or services.
metadata:
  author: alexlombana9
  version: "2.0"
---

## When to Use

Load this skill when:
- Creating or modifying Convex queries, mutations, or actions in `convex/`
- Working with the Zod-typed schema in `convex/schema.ts`
- Implementing agent logic in `convex/agents/`
- Adding HTTP action handlers in `convex/http.ts`

## Critical Patterns

### Pattern 1: Zod-Validated Query

All queries and mutations use `zQuery`/`zMutation` wrappers with Zod argument validation.

```typescript
import { z } from "zod"
import { zQuery } from "."

export const getIncident = zQuery({
  args: z.object({ id: z.string().describe("Convex Id<incidents>") }),
  handler: async (ctx, args) => {
    const id = args.id as Id<"incidents">
    const incident = await ctx.db.get(id)
    if (!incident) throw new ConvexError(config.errors.notFound)
    return incident
  },
})
```

### Pattern 2: Zod-Validated Mutation with Auth

All mutations that modify data require authentication.

```typescript
import { ConvexError } from "convex/values"
import { z } from "zod"
import { zMutation } from "."
import { requireUser } from "./auth"

export const createIncident = zMutation({
  args: z.object({
    title: z.string().min(5).max(200),
    description: z.string().min(10).max(10000),
    severity: z.enum(["critical", "high", "medium", "low"]),
    category: z.enum(["payment", "checkout", "inventory", "auth", "performance", "infra", "other"]),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    return ctx.db.insert("incidents", {
      ...args,
      status: "submitted",
      reporterUserId: user._id,
    })
  },
})
```

### Pattern 3: Actions for External API Calls

Use `zAction` for operations that call external services (Anthropic, Linear, Slack, etc.).

```typescript
import { zAction } from "."
import { z } from "zod"

export const runAnalyzer = zAction({
  args: z.object({ incidentId: z.string() }),
  handler: async (ctx, args) => {
    // Read incident data via internal query
    const incident = await ctx.runQuery(internal.incidents.get, { id: args.incidentId })

    // Call external API (Anthropic)
    const analysis = await callAnthropicAPI(incident)

    // Write result back via internal mutation
    await ctx.runMutation(internal.incidents.updateAnalysis, {
      id: args.incidentId,
      analysis,
    })

    return analysis
  },
})
```

### Pattern 4: Scheduled Actions for Pipeline

Use `ctx.scheduler` to chain agent steps without blocking.

```typescript
// In orchestrator action:
await ctx.scheduler.runAfter(0, internal.agents.runAnalyzer, { incidentId })
// The analyzer, when done, schedules the next step:
await ctx.scheduler.runAfter(0, internal.agents.runTicketer, { incidentId })
```

## Anti-Patterns

### Don't: Call external APIs in queries or mutations

```typescript
// Bad - external calls in mutation
export const create = zMutation({
  handler: async (ctx, args) => {
    await fetch("https://api.slack.com/...") // External calls not allowed here!
  },
})

// Good - use an action instead
export const notifySlack = zAction({
  handler: async (ctx, args) => {
    await fetch("https://api.slack.com/...") // Actions can call external APIs
  },
})
```

### Don't: Skip auth checks on mutations

```typescript
// Bad - no auth
export const deleteIncident = zMutation({
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id) // Anyone can delete!
  },
})

// Good - require auth
export const deleteIncident = zMutation({
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"])
    await ctx.db.delete(args.id)
  },
})
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Read by ID | `ctx.db.get(id)` |
| Query with index | `ctx.db.query("table").withIndex("by_field", q => q.eq("field", val)).first()` |
| Insert | `ctx.db.insert("table", { ...data })` |
| Update | `ctx.db.patch(id, { ...updates })` |
| Delete | `ctx.db.delete(id)` |
| List all | `ctx.db.query("table").collect()` |
| Ordered | `ctx.db.query("table").order("desc").collect()` |
| Auth check | `await requireUser(ctx)` |
| Role check | `await requireRole(ctx, ["admin"])` |
| Schedule action | `ctx.scheduler.runAfter(delayMs, actionRef, args)` |
| Call internal query from action | `ctx.runQuery(internal.module.fn, args)` |
| Call internal mutation from action | `ctx.runMutation(internal.module.fn, args)` |
