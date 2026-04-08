# Scaling Analysis

## Current Architecture Capacity

### Single-Instance Baseline

The application runs as a single Docker Compose stack with the following characteristics:

| Component | Capacity | Bottleneck |
|-----------|----------|------------|
| FastAPI backend | ~500 req/s for CRUD, ~10 concurrent triages | LLM API calls during triage |
| SQLite database | ~1,000 concurrent reads, 1 write at a time | Write lock under concurrent triage |
| Claude Sonnet 4.6 | ~60 requests/min (API rate limit) | Primary bottleneck for triage throughput |
| Slack Webhooks | ~1 msg/sec per webhook | Slack rate limiting |
| SendGrid Email | ~100 emails/sec (free tier: 100/day) | Tier-dependent |
| Langfuse | Depends on self-hosted resources | Postgres + ClickHouse capacity |

**Estimated throughput:** ~50-60 incidents triaged per hour (limited by LLM API rate).

### Assumptions

1. Each triage invokes **4 LLM calls** (one per sub-agent: Analyzer, Classifier, Ticketer, Notifier)
2. Average triage takes **15-30 seconds** end-to-end (dominated by LLM latency)
3. Average incident report is **500-2000 characters** with 0-3 attachments
4. Peak load expected during business hours, not 24/7 sustained
5. Most incidents are Medium/Low severity (~70%), High (~20%), Critical (~10%)

---

## Scaling Strategy

### Phase 1: Vertical Scaling (Current → 200 incidents/hour)

**What changes:**
- Increase API rate limits with Anthropic (higher tier plan)
- Use SQLite WAL mode for better concurrent read/write performance
- Add connection pooling for external services (Slack, SendGrid)

**What stays the same:**
- Single Docker Compose deployment
- SQLite as the database
- Synchronous sub-agent pipeline

**Cost:** Minimal. Only requires a higher Anthropic API tier.

### Phase 2: Horizontal Backend Scaling (200 → 1,000 incidents/hour)

**What changes:**

```
                    ┌─────────────┐
                    │ Load        │
                    │ Balancer    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Backend  │ │ Backend  │ │ Backend  │
        │ Instance │ │ Instance │ │ Instance │
        │    1     │ │    2     │ │    3     │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └────────────┼────────────┘
                          ▼
                   ┌─────────────┐
                   │ PostgreSQL  │
                   │ (replaces   │
                   │  SQLite)    │
                   └─────────────┘
```

- **Replace SQLite with PostgreSQL** for concurrent write support
- **Multiple backend instances** behind a load balancer (nginx/Traefik)
- **Redis task queue** (Celery or ARQ) for async triage processing
- Each backend instance can process triage jobs independently

**Database migration:** SQLAlchemy abstracts the database layer. Switching from SQLite to PostgreSQL requires only changing `DATABASE_URL` in the environment. No code changes needed.

**Why Redis queue:** Decouples incident creation from triage processing. The API returns immediately, and triage workers pick up jobs from the queue. This prevents request timeouts and enables independent scaling of API servers vs. triage workers.

### Phase 3: Agent-Level Parallelism (1,000 → 5,000 incidents/hour)

**What changes:**
- **Parallel sub-agent execution** where possible (Analyzer and Classifier can partially overlap)
- **Multiple LLM API keys** distributed across triage workers to multiply rate limits
- **Batch notifications** — aggregate multiple incidents into single Slack messages during high-volume periods
- **Caching layer** — Redis cache for runbook lookups and repeated error patterns

**Agent optimization:**
- Use Claude Haiku 4.5 for the Notifier agent (message composition is simpler, doesn't need Sonnet)
- Pre-classify obvious incidents with a lightweight rule-based filter before invoking LLM agents
- Cache Analyzer results for duplicate/similar incidents (deduplicated by description similarity)

### Phase 4: Enterprise Scale (5,000+ incidents/hour)

**What changes:**
- **Kubernetes deployment** with auto-scaling pods per service
- **Dedicated LLM inference** (Anthropic's batch API or self-hosted models for lower-severity triage)
- **Event-driven architecture** — replace REST polling with WebSocket/SSE for real-time UI updates
- **Sharded database** or dedicated read replicas for dashboard queries
- **Multi-region deployment** for global SRE teams

---

## Technical Decisions & Trade-offs

### Why SQLite for v1?

| Consideration | SQLite | PostgreSQL |
|---------------|--------|------------|
| Setup complexity | Zero — file-based | Requires separate service |
| Concurrent reads | Excellent | Excellent |
| Concurrent writes | Limited (WAL helps) | Excellent |
| Deployment | Single container | Additional container |
| Migration path | SQLAlchemy makes it trivial | N/A |

**Decision:** SQLite for hackathon simplicity. The SQLAlchemy ORM layer ensures a zero-code-change migration to PostgreSQL when scaling.

### Why Background Tasks instead of a Job Queue?

| Consideration | FastAPI BackgroundTasks | Celery/Redis Queue |
|---------------|----------------------|-------------------|
| Setup | Zero — built into FastAPI | Requires Redis + worker process |
| Monitoring | Limited | Rich (Flower dashboard, dead letter queues) |
| Retry logic | Manual implementation | Built-in with configurable policies |
| Scaling | Tied to web server process | Independent worker scaling |

**Decision:** BackgroundTasks for v1. Simple, no additional infrastructure. Upgrade path to Celery/Redis is straightforward — replace `background_tasks.add_task(fn)` with `fn.delay()`.

### Why Polling instead of WebSockets?

| Consideration | Polling (2s interval) | WebSockets |
|---------------|----------------------|------------|
| Implementation | 5 lines of `setInterval` | Connection management, reconnection logic |
| Server load | Slightly higher (repeated requests) | Lower (push-based) |
| Perceived latency | ≤2 seconds | Near-instant |
| Debugging | Standard HTTP requests | Requires WS-specific tooling |
| Scaling | Stateless — works behind any LB | Requires sticky sessions or Redis pub/sub |

**Decision:** Polling for v1. Indistinguishable from real-time for a 15-30 second triage process. WebSockets add complexity without meaningful UX improvement at this scale.

### Why Sequential Agent Pipeline?

| Consideration | Sequential | Parallel |
|---------------|-----------|---------|
| Correctness | Guaranteed — each agent has full context from previous | Risk of stale/incomplete context |
| Debugging | Linear trace — easy to follow | Concurrent spans — harder to debug |
| Latency | Sum of all agents (~20s) | Max of parallel agents (~12s) |
| Complexity | Simple loop | Async coordination, merging results |

**Decision:** Sequential for v1. Correctness and debuggability outweigh the ~8 second latency savings. The pipeline is already fast enough (<30s) that parallelism provides marginal UX benefit.

---

## Bottleneck Summary

| Priority | Bottleneck | Impact | Mitigation |
|----------|-----------|--------|------------|
| 1 | LLM API rate limits | Caps triage throughput at ~60/hour | Higher tier, multiple keys, lighter models for simple agents |
| 2 | SQLite write locking | Blocks concurrent triage DB updates | Switch to PostgreSQL |
| 3 | Synchronous notifications | Adds latency to each triage | Async notification queue |
| 4 | Single backend instance | Can't scale horizontally | Load balancer + multiple instances |
| 5 | Frontend polling | Unnecessary requests during idle time | WebSockets or SSE |
