# Quick Guide

Step-by-step instructions to run and test the SRE Incident Triage Agent.

---

## Prerequisites

- **Docker** and **Docker Compose** installed ([Install Docker](https://docs.docker.com/get-docker/))
- **API Keys:**
  - Anthropic API key ([Get one](https://console.anthropic.com/))
  - Slack Webhook URL ([Create one](https://api.slack.com/messaging/webhooks))
  - SendGrid API key ([Get one](https://app.sendgrid.com/settings/api_keys))

---

## 1. Clone the Repository

```bash
git clone https://github.com/alexlombana9/SRE-Agent-Hackathon-2026.git
cd SRE-Agent-Hackathon-2026
```

## 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your API keys:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SENDGRID_API_KEY=SG.your-sendgrid-key
SENDGRID_FROM_EMAIL=your-verified-sender@example.com
```

## 3. Start the Application

```bash
docker compose up --build
```

Wait for all services to start. You'll see logs from:
- `sre-backend` — FastAPI backend on port 8000
- `sre-frontend` — Next.js frontend on port 3001
- `sre-langfuse` — Langfuse observability on port 3000
- `sre-langfuse-db`, `sre-clickhouse`, `sre-redis`, `sre-minio` — Langfuse dependencies

## 4. Access the Services

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3001 | Incident management UI |
| Backend API docs | http://localhost:8000/docs | Swagger/OpenAPI interactive docs |
| Langfuse | http://localhost:3000 | LLM observability dashboard |

**Langfuse default credentials:** `admin@sre.local` / `admin123`

---

## 5. Test the Application

### Test 1: Submit an Incident (via UI)

1. Open http://localhost:3001
2. Click **"New Incident"**
3. Fill in the form:
   - **Title:** `Payment gateway timeout on checkout`
   - **Description:** `Multiple customers reporting that checkout fails with a timeout error after clicking "Pay Now". The error started around 10:15 AM. Stripe dashboard shows elevated error rates. Approximately 200 orders affected in the last hour.`
   - **Reporter name:** `Jane Doe`
   - **Reporter email:** `jane@example.com`
   - **Raw logs (optional):**
     ```
     2026-04-08T10:15:23Z ERROR payment-service: Stripe API timeout after 30000ms
     2026-04-08T10:15:24Z ERROR payment-service: Failed to process payment for order #8842
     2026-04-08T10:15:25Z WARN  order-service: Payment callback not received, retrying...
     2026-04-08T10:16:01Z ERROR payment-service: Stripe API timeout after 30000ms
     ```
4. Click **"Submit"**
5. Watch the triage progress indicator as the agents work:
   - Analyzing... → Classifying... → Creating ticket... → Notifying...
6. Once complete, verify:
   - Severity is set (expected: **Critical** or **High**)
   - Category is set (expected: **Payment**)
   - A ticket was created (e.g., **SRE-0001**)
   - Agent analysis and suggested fix are displayed

### Test 2: Submit via API

```bash
curl -X POST http://localhost:8000/api/v1/incidents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Product search returning empty results",
    "description": "Search functionality is broken. Users searching for any product get zero results. The search index may need rebuilding. Issue started after the 2 AM deployment.",
    "reporter_name": "John Smith",
    "reporter_email": "john@example.com"
  }'
```

Then check the incident status:

```bash
# Replace {id} with the incident ID from the response
curl http://localhost:8000/api/v1/incidents/{id}
```

### Test 3: Critical Incident (Human-in-the-Loop)

1. Submit an incident with clearly critical language:
   - **Title:** `Complete site outage - 500 errors on all pages`
   - **Description:** `The entire website is returning 500 Internal Server Error. No customer can access any page. Revenue impact is total. All monitoring alerts are firing.`
2. The Classifier should mark this as **Critical**
3. The pipeline pauses at the **approval gate**
4. The UI shows an approval prompt — click **"Approve"** to continue
5. Ticket is created and critical notifications are sent to `#sre-critical`

### Test 4: Resolve a Ticket

1. Navigate to the **Tickets** page
2. Click on an open ticket
3. Add resolution notes: `Stripe API was experiencing an outage. Status restored at 11:30 AM. No action needed on our side.`
4. Click **"Resolve"**
5. Verify:
   - Ticket status changes to **Resolved**
   - Reporter receives an email notification
   - Slack message posted to `#sre-incidents`

### Test 5: Check Observability

1. Open Langfuse at http://localhost:3000
2. Log in with `admin@sre.local` / `admin123`
3. Navigate to **Traces**
4. Click on a triage trace to see:
   - Full pipeline timeline (Orchestrator → Analyzer → Classifier → Ticketer → Notifier)
   - Token usage per agent
   - Cost per triage
   - Latency breakdown per step
   - Tool calls and their inputs/outputs

---

## 6. Stop the Application

```bash
docker compose down
```

To also remove volumes (database, Langfuse data):

```bash
docker compose down -v
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | Change ports in `docker-compose.yml` or stop conflicting services |
| Anthropic API errors | Verify `ANTHROPIC_API_KEY` in `.env` is valid |
| Slack notifications not arriving | Verify `SLACK_WEBHOOK_URL` — test with `curl -X POST -H 'Content-Type: application/json' -d '{"text":"test"}' YOUR_WEBHOOK_URL` |
| SendGrid email not sending | Verify sender email is verified in SendGrid dashboard |
| Langfuse not loading | Wait 2-3 minutes for all dependencies to initialize |
| Database errors | Remove volume and restart: `docker compose down -v && docker compose up --build` |
