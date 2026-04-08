# Scaling Analysis — Trusty SRE Platform

## Architecture Overview

Trusty is built on **Convex**, a fully managed serverless backend. This fundamentally changes the scaling story compared to traditional self-hosted stacks: horizontal scaling of the backend tier is handled automatically by the platform rather than requiring manual infrastructure work.

---

## Current Architecture Capacity

### Single-Deployment Baseline

| Component | Capacity | Bottleneck |
|-----------|----------|------------|
| Convex backend (queries/mutations) | ~1M operations/day (free tier), unlimited (paid) | Convex plan limits |
| Convex actions (long-running, agents) | Concurrent execution, auto-scaled by Convex | Convex plan concurrency limits |
| Claude Sonnet 4.6 (Anthropic) | ~60 requests/min (standard tier) | **Primary bottleneck** |
| Vercel Sandbox | ~10 concurrent sessions (standard) | Sandbox concurrency limit |
| Linear API | 1,500 requests/min | Rarely a bottleneck |
| Slack/Discord Webhooks | ~1 msg/sec per webhook | Webhook rate limiting |
| SendGrid Email | 100 emails/day (free), 100/sec (paid) | Tier-dependent |
| Twilio SMS | Pay-per-message | Cost, not throughput |
| Langfuse (cloud) | Unlimited (cloud) | N/A |

**Estimated throughput:** ~50-60 full triage pipelines per hour (limited by Anthropic rate limits — 5 LLM calls per pipeline: Analyzer + Ticketer + Notifier × 2 + QA Reviewer, with Debugger using additional calls per iteration).

### Assumptions

1. Each full triage invokes **5-8 LLM calls** (5 base agents + up to 3 Debugger iterations)
2. Average triage + debug cycle takes **30-90 seconds** end-to-end (LLM latency dominant)
3. Average incident has **500-2000 character** description + 0-3 attachments
4. Vercel Sandbox sessions average **20-40 seconds** per debug attempt
5. Peak load during business hours; mostly idle overnight
6. Most incidents are Medium/Low (~65%), High (~25%), Critical (~10%)

---

## Scaling Strategy

### Phase 1: Platform Defaults (Current → ~60 triages/hour)

**What Convex handles automatically:**
- Serverless function scaling — no backend instances to manage
- Real-time WebSocket connections — no separate socket server needed
- Database read scaling via Convex's built-in read replica layer
- File storage (attachments) via Convex File Storage — object storage, auto-scaled

**What requires manual action:**
- Request a higher Anthropic API tier to increase LLM rate limits
- Upgrade Convex plan for higher action concurrency
- Use SendGrid paid tier for email volume above 100/day

**Cost:** Minimal. Only requires upgrading API tiers.

### Phase 2: Parallel Agent Execution (60 → 300 triages/hour)

**What changes:**

The current pipeline is sequential. Parallelism can be introduced at two points:
1. **Notifier Agent** can run concurrently with the start of the **Debugger Agent** — notifications don't need to wait for debugging to complete
2. **Multiple Anthropic API keys** distributed across Convex action workers to multiply effective rate limits

```
Analyzer → Ticketer → ┬─ Notifier (concurrent)
                       └─ Debugger → QA → Resolution Notifier
```

This reduces total wall-clock time from ~90s to ~50s and increases throughput by removing the notification bottleneck from the critical path.

**Convex-native approach:** Convex actions can be scheduled concurrently using `ctx.scheduler.runAfter(0, ...)` — no additional infrastructure needed. No Redis, no Celery, no separate worker processes.

### Phase 3: Multi-Key LLM Distribution (300 → 1,000 triages/hour)

**What changes:**

```
Convex Action Pool
├── Action Worker 1 → ANTHROPIC_API_KEY_1
├── Action Worker 2 → ANTHROPIC_API_KEY_2
├── Action Worker 3 → ANTHROPIC_API_KEY_3
└── Action Worker N → ANTHROPIC_API_KEY_N
```

- **Multiple Anthropic API keys** stored as Convex environment variables, rotated across agent invocations
- **Model downgrade for simpler agents:** Use `claude-haiku-4-5` for the Notifier (message composition is simple) and the first pass of the QA Reviewer; reserve Sonnet 4.6 for Analyzer and Debugger
- **Caching:** Cache Analyzer results for identical or near-identical incident descriptions using Convex's caching layer — deduplicated incidents skip the Analyzer entirely
- **Sandbox pooling:** Pre-warm Vercel Sandbox sessions during known peak hours to reduce cold start latency

### Phase 4: Enterprise Scale (1,000+ triages/hour)

**What changes:**

- **Convex enterprise plan:** Dedicated Convex deployment with higher throughput limits, SLA guarantees, and isolated compute
- **Anthropic Batch API:** For non-urgent incidents (Medium/Low severity), use Anthropic's batch API to process multiple incidents in a single batch job — lower cost, higher throughput, asynchronous delivery
- **Event-driven Linear webhooks:** Replace manual polling of ticket status with Linear → Convex webhook integration for instant resolution detection
- **Read replicas / caching layer:** For the observability dashboard (read-heavy queries over historical incident data), add a Convex query cache or export to a dedicated analytics store
- **Multi-region Convex deployment:** For global SRE teams across time zones, Convex's multi-region support can route requests to the nearest deployment

---

## Technical Decisions & Trade-offs

### Why Convex instead of FastAPI + SQLite?

| Consideration | Convex | FastAPI + SQLite |
|---------------|--------|-----------------|
| Real-time updates | Built-in reactive queries | Requires polling or WebSocket layer |
| Horizontal scaling | Automatic | Manual instances + load balancer |
| Background jobs | Native scheduled actions | Requires Celery + Redis |
| Type safety | Zod schema end-to-end (DB → client) | Separate Pydantic + TypeScript types |
| Auth integration | Clerk SDK native | Manual JWT validation |
| Setup complexity | Zero infrastructure | Docker orchestration required |
| File storage | Convex File Storage (built-in) | Local filesystem or S3 |

**Decision:** Convex eliminates an entire infrastructure layer while providing better real-time UX through reactive queries. The trade-off is vendor lock-in to the Convex platform, which is acceptable given the hackathon timeframe and the platform's production viability.

### Why Vercel Sandbox for Debugging?

| Consideration | Vercel Sandbox | Local exec / Docker exec |
|---------------|---------------|--------------------------|
| Isolation | Full — ephemeral, no production access | Risk of agent escaping to host |
| Setup | API call — no infrastructure | Requires Docker-in-Docker or VM |
| Security | Network-isolated by default | Requires manual firewalling |
| Cleanup | Automatic on session end | Requires explicit teardown |
| Concurrency | Managed by Vercel | Requires container orchestration |

**Decision:** Vercel Sandbox is the only safe option for allowing an autonomous agent to execute arbitrary code. The alternative (unrestricted code execution) is unacceptable for a production SRE system. See: https://vercel.com/docs/vercel-sandbox/sdk-reference

### Why Real-time Instead of Polling?

Convex reactive queries push updates to the frontend the instant a Convex mutation occurs. There is no polling interval — state changes appear within ~100ms. This gives a significantly better UX for the agent pipeline trail (users see each step complete in real time) without any additional infrastructure (no WebSocket server, no SSE endpoint, no Redis pub/sub).

### Why Sequential Agents (with selective parallelism)?

| Consideration | Fully Sequential | Selective Parallel |
|---------------|------------------|--------------------|
| Correctness | Guaranteed full context at each step | Requires careful dependency analysis |
| Debugging | Linear Langfuse trace | Concurrent spans — slightly harder |
| Latency | Sum of all agents | Reduced by parallelizing independent steps |
| Complexity | Minimal | Moderate — need to coordinate futures |

**Decision:** Core analysis pipeline (Analyzer → Ticketer → Debugger → QA) remains sequential because each step depends on the previous output. Notifications are parallelized with debugging because they are independent. This gives most of the latency benefit with minimal coordination complexity.

### Why Not WebSockets / SSE?

Convex's reactive query system is a WebSocket-based push protocol managed entirely by the Convex client SDK. We get all the benefits of WebSockets (instant push, no polling overhead) without writing any WebSocket server code.

---

## Bottleneck Summary

| Priority | Bottleneck | Impact | Mitigation |
|----------|-----------|--------|------------|
| 1 | Anthropic API rate limits | Caps pipeline throughput at ~60/hour | Higher tier, multiple keys, Haiku for simple agents |
| 2 | Vercel Sandbox concurrency | Limits simultaneous autonomous debug sessions | Sandbox session pooling, pre-warming |
| 3 | Sequential agent pipeline | Adds latency for each step | Parallelize Notifier with Debugger |
| 4 | Linear API rate limits | Rarely hit at current scale | Request higher tier if needed |
| 5 | Slack/Discord rate limits | Limits notification burst | Batch notifications during high-volume events |

---

## Cost Model (Approximate)

| Component | Cost at 60 triages/hour | Cost at 1,000 triages/hour |
|-----------|------------------------|---------------------------|
| Claude Sonnet 4.6 | ~$1.50/hour (5 calls × 1k tokens avg) | ~$25/hour |
| Convex (paid plan) | ~$25/month flat | ~$100-300/month |
| Vercel Sandbox | ~$0.05/session | ~$50/hour at peak |
| SendGrid (email) | ~$0.001/email | ~$1/hour |
| Twilio (SMS, Critical only) | ~$0.01/SMS × 10% of volume | ~$1/hour |
| Linear | Fixed team plan | Fixed team plan |

**Total at baseline:** ~$2-3/hour during peak, ~$30-50/month at moderate usage.
