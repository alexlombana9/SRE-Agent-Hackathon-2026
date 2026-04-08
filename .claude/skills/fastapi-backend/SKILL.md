---
name: fastapi-backend
description: >
  Patterns and conventions for the FastAPI backend of the SRE Triage Agent.
  Trigger: When working with backend code, API endpoints, database models, or services.
metadata:
  author: alexlombana9
  version: "1.0"
---

## When to Use

Load this skill when:
- Creating or modifying FastAPI endpoints in `backend/app/api/`
- Working with SQLAlchemy models or database operations
- Creating Pydantic schemas for request/response validation
- Implementing business logic services in `backend/app/services/`

## Critical Patterns

### Pattern 1: Async Endpoint with DB Session

All endpoints use async and receive the DB session via dependency injection.

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import IncidentDetail

router = APIRouter()

@router.get("/{incident_id}", response_model=IncidentDetail)
async def get_incident(incident_id: str, db: AsyncSession = Depends(get_db)):
    incident = await incident_service.get_incident(db, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident
```

### Pattern 2: Service Layer with AsyncSession

All database operations go through service functions, never directly in endpoints.

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Incident

async def get_incident(db: AsyncSession, incident_id: str) -> Incident | None:
    stmt = select(Incident).where(Incident.id == incident_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
```

### Pattern 3: Background Tasks for Async Processing

Long-running operations (like agent triage) use FastAPI BackgroundTasks.

```python
from fastapi import BackgroundTasks

@router.post("/", status_code=201)
async def create_incident(
    data: IncidentCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    incident = await incident_service.create_incident(db, **data.model_dump())
    background_tasks.add_task(run_triage, incident.id)
    return incident
```

## Anti-Patterns

### Don't: Sync database operations

```python
# Bad - DON'T do this
@router.get("/{id}")
def get_incident(id: str):
    with Session() as db:
        return db.query(Incident).get(id)
```

### Don't: Business logic directly in endpoints

```python
# Bad - DON'T do this
@router.post("/")
async def create(data: IncidentCreate, db: AsyncSession = Depends(get_db)):
    incident = Incident(**data.model_dump())
    db.add(incident)
    await db.commit()  # Logic should be in service layer
    return incident
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Get DB session | `db: AsyncSession = Depends(get_db)` |
| Return 404 | `raise HTTPException(status_code=404, detail="...")` |
| Background task | `background_tasks.add_task(fn, *args)` |
| Multipart upload | `file: UploadFile = File(...)` |
| Query params | `status: str \| None = Query(None)` |
| Pagination | `page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100)` |
