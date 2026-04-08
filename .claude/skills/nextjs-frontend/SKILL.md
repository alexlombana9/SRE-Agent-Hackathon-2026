---
name: nextjs-frontend
description: >
  Patterns and conventions for the Next.js frontend of the SRE Triage Agent.
  Trigger: When working with frontend code, React components, pages, or API client.
metadata:
  author: alexlombana9
  version: "1.0"
---

## When to Use

Load this skill when:
- Creating or modifying Next.js pages in `frontend/src/app/`
- Building React components in `frontend/src/components/`
- Working with the API client in `frontend/src/lib/api.ts`
- Implementing React hooks in `frontend/src/hooks/`

## Critical Patterns

### Pattern 1: Server Component Page with Data Fetching

Pages are server components by default. Fetch data on the server.

```tsx
// src/app/incidents/page.tsx
import { fetchIncidents } from "@/lib/api";
import { IncidentCard } from "@/components/IncidentCard";

export default async function IncidentsPage() {
  const { items } = await fetchIncidents();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Incidents</h1>
      {items.map((incident) => (
        <IncidentCard key={incident.id} incident={incident} />
      ))}
    </div>
  );
}
```

### Pattern 2: Client Component with "use client"

Interactive components (forms, buttons with state, polling) must be client components.

```tsx
"use client";

import { useState } from "react";

export function IncidentForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    // ... submit logic
  }

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Pattern 3: Polling for Real-Time Updates

Use polling for triage progress instead of WebSockets.

```tsx
"use client";

import { useEffect, useState } from "react";
import { fetchIncident } from "@/lib/api";
import type { IncidentDetail } from "@/lib/types";

export function TriageProgress({ incidentId }: { incidentId: string }) {
  const [incident, setIncident] = useState<IncidentDetail | null>(null);

  useEffect(() => {
    const poll = setInterval(async () => {
      const data = await fetchIncident(incidentId);
      setIncident(data);
      if (data.status !== "submitted" && data.status !== "triaging") {
        clearInterval(poll);
      }
    }, 2000);
    return () => clearInterval(poll);
  }, [incidentId]);

  return <div>Status: {incident?.status ?? "Loading..."}</div>;
}
```

## Anti-Patterns

### Don't: Use "use client" on pages that don't need interactivity

```tsx
// Bad - DON'T make a list page a client component
"use client";
export default function TicketsPage() { ... }
```

### Don't: Fetch backend API from server components without proper base URL

```tsx
// Bad - relative URL won't work in server components
const res = await fetch("/api/v1/incidents");

// Good - use absolute URL for server-side fetching
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const res = await fetch(`${API_URL}/api/v1/incidents`);
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Server component | Default, no directive needed |
| Client component | Add `"use client"` at top of file |
| Dynamic route | `[id]/page.tsx` with `params: { id: string }` |
| API base URL | `process.env.NEXT_PUBLIC_API_URL` |
| Tailwind colors | Critical=red-500, High=orange-500, Medium=yellow-500, Low=blue-500 |
| Loading state | Create `loading.tsx` in the route folder |
