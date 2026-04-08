# SCALING.md — Scalability Analysis

## Current Architecture Capacity

Single-node deployment via Docker Compose, suitable for small-to-medium SRE teams (~5–50 incidents/hour).

| Component      | Current Capacity        | Bottleneck                    |
|---------------|-------------------------|-------------------------------|
| Frontend      | ~100 concurrent users    | Single container              |
| Backend API   | ~50 req/s                | Single FastAPI process        |
| Triage Agent  | ~10 concurrent triages   | LLM API rate limits           |
| Database      | ~1,000 incidents         | SQLite single-writer lock     |
| Notifications | ~100/min                 | Mock services, no queue       |

---

## Scaling Strategy

### Phase 1 — Vertical Scaling (Quick Wins)

- Increase Uvicorn workers (1 → N based on CPU cores)
- Run agent triage as async background tasks
- Replace SQLite with PostgreSQL for concurrent writes

### Phase 2 — Horizontal Scaling (Production-Ready)

```
              ┌──────────────┐
              │ Load Balancer │
              └──────┬───────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │ API  1  │ │ API  2  │ │ API  3  │
   └────┬────┘ └────┬────┘ └────┬────┘
        └────────────┼────────────┘
                     │
              ┌──────┴───────┐
              │ Message Queue │
              │ (Redis/RMQ)  │
              └──────┬───────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │Worker 1 │ │Worker 2 │ │Worker 3 │
   │ (Agent) │ │ (Agent) │ │ (Agent) │
   └─────────┘ └─────────┘ └─────────┘
                     │
              ┌──────┴───────┐
              │  PostgreSQL   │
              └──────────────┘
```

Key changes:
- Multiple FastAPI instances behind Nginx/Traefik
- Redis or RabbitMQ to decouple submission from triage processing
- Dedicated agent workers consuming from the queue
- PostgreSQL with read replicas
- Redis cache for frequent reads (incident status, routing rules)

### Phase 3 — Cloud-Native (Enterprise)

- Kubernetes with HPA based on queue depth
- Managed PostgreSQL (RDS / Cloud SQL) + PgBouncer
- Multi-key LLM rotation and provider fallback for rate limit resilience
- CDN for static frontend assets

---

## Assumptions

1. **LLM API is the primary bottleneck.** Each triage takes 3–10s. Scaling the backend alone yields diminishing returns without addressing LLM throughput.
2. **Incidents are bursty.** A failed deployment triggers many reports at once. Queue-based architecture absorbs bursts without dropping requests.
3. **Read-heavy workload.** Engineers check status far more often than new incidents arrive. Read replicas and caching handle this efficiently.
4. **Mock services are replaceable.** The service layer uses abstract interfaces — swapping mocks for real Jira/Slack/SMTP requires only config changes.

---

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite for MVP | Zero-config, embedded, sufficient for demo. Clear migration path to PostgreSQL. |
| Async agent processing | LLM calls are slow; blocking the API limits throughput. Background tasks keep UI responsive. |
| Service abstraction layer | Mock and real integrations share the same interface. Scaling requires no architecture changes. |
| Stateless backend | No session state in API. Any instance handles any request → easy horizontal scaling. |
| OpenRouter support | One API key → multiple providers. Simplifies failover and model switching at scale. |
