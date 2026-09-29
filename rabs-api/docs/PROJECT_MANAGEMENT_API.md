# Project Management API

Base path: **`/api/pm`**  
Auth: `Authorization: Bearer <staff JWT>`  
Org: from JWT `orgId`, or `?organizationId=` / body `organizationId`  
Roles: `ADMIN` | `SUPER_ADMIN` | `PROJECT_MANAGER`  

> There is no `OPERATIONS` / `MANAGER` role in IAM today. `PROJECT_MANAGER` is seeded like CRM’s `SALES_REP` (migration `013` + `npm run seed:pm`).

Envelope: success `{ data, meta? }`, errors `{ error: { message, details? } }`.

---

## Dashboard

### `GET /api/pm/dashboard`

```json
{
  "data": {
    "projectsByStatus": {
      "draft": 0,
      "active": 2,
      "on_hold": 0,
      "completed": 0,
      "cancelled": 0
    },
    "activeProjects": 2,
    "productionReadyCount": 1,
    "myOpenTasks": 3,
    "overdueTasks": 0,
    "openWorkOrders": 3,
    "upcomingMilestones": [{ "id": "1", "title": "Hardware delivered", "dueDate": "2026-08-22", "status": "pending" }],
    "asOf": "2026-08-21T18:00:00.000Z"
  }
}
```

---

## Projects / Jobs

### `GET /api/pm/projects`
Query: `status`, `ownerUserId`, `customerId`, `search`, `page`, `limit`

### `POST /api/pm/projects`
```json
{
  "name": "Retail POS Rollout",
  "code": "POS-N1",
  "customerId": "12",
  "orderId": null,
  "scope": "Deploy POS across northern stores",
  "objectives": "Go-live with trained staff",
  "status": "draft",
  "startDate": "2026-08-01",
  "endDate": "2026-09-30",
  "budget": 45000,
  "currency": "GBP",
  "ownerUserId": "1"
}
```
Status enum: `draft` | `active` | `on_hold` | `completed` | `cancelled`

### `GET /api/pm/projects/:id`
Includes nested `deliverables[]`, `members[]`, `tasks[]`, `milestones[]`, `workOrders[]`.

### `PATCH /api/pm/projects/:id` · `DELETE /api/pm/projects/:id`

### `GET /api/pm/projects/:id/progress`
Computes and persists `progress_pct` (tasks 70% + milestones 20% + deliverables 10% when all present).

```json
{
  "data": {
    "progressPct": 42.5,
    "taskProgressPct": 40,
    "milestoneProgressPct": 33.33,
    "deliverableProgressPct": 50,
    "tasksTotal": 4,
    "tasksDone": 1,
    "milestonesTotal": 3,
    "milestonesAchieved": 1,
    "deliverablesTotal": 3,
    "deliverablesDone": 1,
    "workOrdersTotal": 2,
    "workOrdersDone": 0
  }
}
```

### `POST /api/pm/projects/:id/mark-production-ready`
Sets `productionReady: true` (promotes `draft` → `active`).

### `POST /api/pm/projects/:id/complete`
Sets `status: completed`, `completedAt`, `progressPct: 100`, `productionReady: true`.

---

## Deliverables

- `GET /api/pm/projects/:id/deliverables`
- `POST /api/pm/projects/:id/deliverables` `{ "title", "description?", "status?", "dueDate?" }`
- `PATCH /api/pm/projects/:id/deliverables/:deliverableId`
- `DELETE /api/pm/projects/:id/deliverables/:deliverableId`

Status: `pending` | `in_progress` | `done` | `cancelled`

---

## Members

- `GET /api/pm/projects/:id/members`
- `POST /api/pm/projects/:id/members` `{ "userId", "role?" }` — upserts
- `PATCH /api/pm/projects/:id/members/:memberId` `{ "role" }`
- `DELETE /api/pm/projects/:id/members/:memberId`

Member role: `owner` | `manager` | `member` | `viewer`

---

## Work Stages

Org-level templates (`projectId` null) or per-project stages.

### `GET /api/pm/stages`
Query: `projectId` (includes org templates + project stages), `templateOnly=true`

### `POST /api/pm/stages`
```json
{ "name": "Production", "position": 2, "projectId": null }
```

### `PATCH /api/pm/stages/:id` · `DELETE /api/pm/stages/:id`

---

## Work Orders

### `GET /api/pm/work-orders`
Query: `projectId`, `status`, `assigneeUserId`, `stageId`, `page`, `limit`

### `POST /api/pm/work-orders`
```json
{
  "projectId": "1",
  "title": "Install terminals",
  "description": null,
  "status": "scheduled",
  "assigneeUserId": "2",
  "stageId": "3",
  "scheduledStart": "2026-08-18T09:00:00.000Z",
  "scheduledEnd": "2026-08-25T17:00:00.000Z"
}
```
Status: `draft` | `scheduled` | `in_progress` | `done` | `cancelled`

### `GET|PATCH|DELETE /api/pm/work-orders/:id`

---

## Tasks & Assignment

### `GET /api/pm/tasks`
Query: `projectId`, `workOrderId`, `status`, `assigneeUserId`, `priority`, `overdue=true`, `page`, `limit`

### `POST /api/pm/tasks`
```json
{
  "projectId": "1",
  "workOrderId": "2",
  "title": "On-site install day",
  "description": null,
  "assigneeUserId": "2",
  "status": "todo",
  "priority": "urgent",
  "dueDate": "2026-08-25",
  "estimateHours": 32,
  "loggedHours": 0,
  "progressPct": 0
}
```
Status: `todo` | `in_progress` | `blocked` | `done` | `cancelled`  
Priority: `low` | `medium` | `high` | `urgent`

### `GET /api/pm/tasks/:id` — includes `dependencies[]`, `dependents[]`
### `PATCH|DELETE /api/pm/tasks/:id`

### `POST /api/pm/tasks/:id/complete`
Sets `status: done`, `progressPct: 100`, `completedAt`.

### Dependencies
- `POST /api/pm/tasks/:id/dependencies` `{ "dependsOnTaskId": "3" }` — same project only
- `DELETE /api/pm/tasks/:id/dependencies/:dependsOnTaskId`

---

## Milestones

### `GET /api/pm/milestones`
Query: `projectId`, `status`, `upcoming=true`, `page`, `limit`

### `POST /api/pm/milestones`
```json
{ "projectId": "1", "title": "Stores live", "dueDate": "2026-09-30", "status": "pending" }
```
Status: `pending` | `achieved` | `missed` | `cancelled`

### `GET|PATCH|DELETE /api/pm/milestones/:id`

---

## Staff Scheduling

### `GET /api/pm/schedule-blocks`
Query: `userId`, `projectId`, `taskId`, `from`, `to`, `page`, `limit`

### `POST /api/pm/schedule-blocks`
```json
{
  "userId": "2",
  "projectId": "1",
  "taskId": "4",
  "startAt": "2026-08-19T09:00:00.000Z",
  "endAt": "2026-08-19T13:00:00.000Z",
  "notes": "Terminal imaging"
}
```

### `GET|PATCH|DELETE /api/pm/schedule-blocks/:id`

---

## Tables (migration `013_project_management.sql`)

| Table | Purpose |
|-------|---------|
| `pm_projects` | Jobs / projects |
| `pm_deliverables` | Scope deliverables |
| `pm_work_stages` | Org or project stages |
| `pm_work_orders` | Work orders |
| `pm_tasks` | Tasks |
| `pm_task_dependencies` | Task deps |
| `pm_milestones` | Milestones |
| `pm_schedule_blocks` | Staff schedule |
| `pm_project_members` | Team membership |

---

## Ops

```bash
npm run migrate:013   # migrations/013_project_management.sql
npm run seed:pm       # 2 sample projects (codes PM-SEED-POS, PM-SEED-B2B), non-destructive
./deploy_api.sh       # build + rsync + PM2 restart
```

Unauthenticated calls return **401** (router mounts `authMiddleware` before handlers), not 404.
