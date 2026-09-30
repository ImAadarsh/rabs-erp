# CRM Sales + Account 360 API

Base path: `/api/crm`  
Auth: `Authorization: Bearer <staff JWT>`  
Org: from JWT `orgId`, or `?organizationId=` / body `organizationId`  
Roles: `CS_AGENT` | `CUSTOMER_SERVICE` | `SALES_REP` | `ADMIN` | `SUPER_ADMIN`  
Account = ERP `customers` (no parallel CrmCustomer). Owner column: `customers.crm_owner_user_id`.

Envelope: success `{ data, meta? }`, errors `{ error: { message, details? } }`.

---

## Dashboard

### `GET /api/crm/dashboard`

```json
{
  "data": {
    "openTickets": 12,
    "myOpenDeals": 3,
    "openDealsTotal": 8,
    "overdueActivities": 2,
    "leadsByStatus": {
      "new": 4,
      "contacted": 2,
      "qualified": 1,
      "unqualified": 0,
      "converted": 5,
      "lost": 1
    },
    "asOf": "2026-08-21T16:00:00.000Z"
  }
}
```

No fake CSAT.

---

## Leads

### `GET /api/crm/leads`
Query: `status`, `ownerUserId`, `search`, `page`, `limit`  
Response item includes `tags[]`.

### `POST /api/crm/leads`
```json
{
  "name": "Aisha Khan",
  "company": "Khan Convenience",
  "email": "aisha@example.com",
  "phone": "+4477...",
  "source": "website",
  "status": "new",
  "ownerUserId": "12",
  "affiliateId": null,
  "notes": null
}
```
Statuses: `new|contacted|qualified|unqualified|converted|lost`

### `GET /api/crm/leads/:id` · `PATCH /api/crm/leads/:id`

### `POST /api/crm/leads/:id/convert`
```json
{
  "customerId": "optional-existing",
  "createDeal": true,
  "dealName": "Onboarding deal",
  "dealAmount": 2500,
  "currency": "GBP",
  "pipelineId": "optional",
  "stageId": "optional",
  "ownerUserId": "optional",
  "customerType": "business"
}
```
Response:
```json
{
  "data": {
    "lead": { "...": "status converted, convertedCustomerId set" },
    "customer": { "...": "created or linked ERP customer" },
    "deal": { "...": "or null if createDeal false" }
  }
}
```
If no `customerId`, matches by email in org or creates customer.

### Tags
- `POST /api/crm/leads/:id/tags` `{ "tagId"? | "name"?, "color"? }`
- `DELETE /api/crm/leads/:id/tags/:tagId`

---

## Pipelines & stages

### `GET /api/crm/pipelines` — includes nested `stages[]` sorted by `position`
### `POST /api/crm/pipelines`
```json
{ "name": "Onboarding", "type": "onboarding", "isDefault": true }
```
`type`: `onboarding|expansion|credit`

### `PATCH /api/crm/pipelines/:id`

### `GET /api/crm/stages?pipelineId=`
### `POST /api/crm/stages`
```json
{
  "pipelineId": "1",
  "name": "Proposal",
  "position": 1,
  "probability": 50,
  "isWon": false,
  "isLost": false
}
```
### `PATCH /api/crm/stages/:id` · `DELETE /api/crm/stages/:id`

---

## Deals

### `GET /api/crm/deals`
Query: `status`, `pipelineId`, `stageId`, `customerId`, `ownerUserId`, `page`, `limit`  
Statuses: `open|won|lost`

### `POST /api/crm/deals`
```json
{
  "pipelineId": "1",
  "stageId": "optional-first-stage",
  "customerId": "42",
  "name": "Q3 expansion",
  "amount": 5000,
  "currency": "GBP",
  "expectedClose": "2026-09-30",
  "ownerUserId": "12",
  "leadId": null
}
```

### `GET /api/crm/deals/:id` — includes `stageHistory[]`, `tags[]`
### `PATCH /api/crm/deals/:id`

### `POST /api/crm/deals/:id/move`
```json
{ "stageId": "5", "note": "Moved after call", "lostReason": "optional if lost stage" }
```
Writes `crm_deal_stage_history`. Won/lost stages flip `status`.

### Tags
- `POST /api/crm/deals/:id/tags` · `DELETE /api/crm/deals/:id/tags/:tagId`

---

## Activities

### `GET /api/crm/activities`
Query: `ownerUserId`, `customerId`, `leadId`, `dealId`, `ticketId`, `type`, `openOnly`, `overdue`, `page`, `limit`  
`type`: `task|call|meeting|note`

### `POST /api/crm/activities`
```json
{
  "type": "task",
  "subject": "Call buyer",
  "body": "Discuss credit terms",
  "dueAt": "2026-08-25T10:00:00.000Z",
  "ownerUserId": "12",
  "customerId": "42",
  "leadId": null,
  "dealId": "7",
  "ticketId": null,
  "orderId": null
}
```

### `PATCH /api/crm/activities/:id`
Complete: `{ "completed": true }` or `{ "completedAt": "..." }` / reopen `{ "completed": false }`

---

## Accounts (ERP customers)

### `GET /api/crm/accounts`
Enriched list:
```json
{
  "data": [
    {
      "id": "42",
      "email": "...",
      "companyName": "...",
      "crmOwnerUserId": "12",
      "crmOwner": { "id": "12", "...": "..." },
      "tags": [{ "id": "1", "name": "vip", "color": "#C9A227" }],
      "openTicketsCount": 1,
      "openDealsCount": 2,
      "lastOrderDate": "2026-08-01T12:00:00.000Z"
    }
  ],
  "meta": { "total": 100, "page": 1, "limit": 50 }
}
```
Query: `search`, `ownerUserId`, `page`, `limit`

### `GET /api/crm/accounts/:customerId` — Account 360
```json
{
  "data": {
    "customer": { "...": "ERP customer + crmOwner" },
    "addresses": [],
    "recentOrders": [],
    "openTickets": [],
    "deals": [],
    "activities": [],
    "notes": [],
    "tags": [],
    "portalRetailer": { "id": "1", "email": "...", "status": "active" }
  }
}
```
`portalRetailer` is `null` if no B2B retailer account.  
Query: `orderLimit` (default 10, max 50).

### `PATCH /api/crm/accounts/:customerId`
```json
{ "crmOwnerUserId": "12" }
```

### Notes (`customer_notes`)
- `GET /api/crm/accounts/:customerId/notes`
- `POST /api/crm/accounts/:customerId/notes`
```json
{ "note": "Spoke to buyer", "noteType": "follow_up", "isImportant": false }
```

### Tags
- `POST /api/crm/accounts/:customerId/tags` · `DELETE /api/crm/accounts/:customerId/tags/:tagId`

---

## Tags catalog

### `GET /api/crm/tags` · `POST /api/crm/tags`
```json
{ "name": "vip", "color": "#C9A227" }
```

---

## Existing (unchanged paths)

- Tickets: `/tickets`, `/tickets/:id`, messages, assign  
- Canned: `/canned-responses`  
- Tiers: `/customer-tiers`  

Ticket list/get also allow `SALES_REP` / `CUSTOMER_SERVICE` for Account 360 context.

---

## Deploy / seed

```bash
cd rabs-api
npm run migrate:011   # migrations/011_crm_sales.sql
npm run migrate:012   # lead ingest keys + Gmail email campaigns
npm run migrate:014   # contacts, lead qualification, deal probability, settings
npm run seed:crm      # pipelines, sample leads/deals/activities (non-destructive)
npx tsc --noEmit
```

External lead ingest + cold email: see [CRM_INTEGRATIONS.md](./CRM_INTEGRATIONS.md).

---

## Contacts

### `GET /api/crm/contacts`
Query: `customerId`, `search`, `page`, `limit`

### `POST /api/crm/contacts`
```json
{
  "customerId": "42",
  "firstName": "Sam",
  "lastName": "Buyer",
  "email": "sam@example.com",
  "phone": "+4477...",
  "title": "Buyer",
  "isPrimary": true,
  "notes": null
}
```

### `GET /api/crm/contacts/:id` · `PATCH /api/crm/contacts/:id` · `DELETE /api/crm/contacts/:id`

---

## Account timeline

### `GET /api/crm/accounts/:customerId/timeline`
Query: `limit` (default 100, max 300)

Unified chronological feed of activities, notes, ticket messages, and deal stage changes.

```json
{
  "data": [
    {
      "id": "activity:12",
      "type": "activity",
      "at": "2026-08-21T10:00:00.000Z",
      "title": "Call buyer",
      "body": "...",
      "meta": {}
    }
  ]
}
```

Account 360 `GET /accounts/:id` also returns `contacts[]`.

---

## Lead qualification

Leads support:
- `score` (0–100)
- `priority` (`low|medium|high|urgent`)
- `qualifiedAt` (set when status → `qualified`)
- `disqualifiedReason`

List filter: `?priority=`

---

## Auto-assignment & follow-ups

### `GET /api/crm/settings` · `PATCH /api/crm/settings` (ADMIN)
```json
{ "autoAssignLeads": true, "autoFollowupOnLead": true }
```

Also returns `salesReps`, `salesRepCount`, and `assignableUsers` (staff for owner dropdowns).

### `GET /api/crm/assignable-users`
CRM staff. Returns `{ id, email, firstName, lastName, role }` for active users with
`SALES_REP`, `ADMIN`, `SUPER_ADMIN`, `CS_AGENT`, or `CUSTOMER_SERVICE`.

### `PATCH /api/crm/leads/:id` — set `ownerUserId` to assign; creates follow-up when `autoFollowupOnLead`.

### `POST /api/crm/leads/bulk-assign`
```json
{ "leadIds": ["1", "2"], "ownerUserId": "12" }
```

On lead create / inbound ingest (when no `ownerUserId`):
- If `autoAssignLeads`: round-robin among active `SALES_REP` users
- If `autoFollowupOnLead`: create task activity due +1 day for the owner

---

## Deal probability & forecast

Deals expose `probability` (from `probabilityOverride` or stage) and `probabilitySource` (`override|stage`).

### `PATCH /api/crm/deals/:id`
```json
{ "probabilityOverride": 55 }
```
Pass `null` to clear override and use stage probability.

### `GET /api/crm/forecast`
Query: `ownerUserId`, `pipelineId`, `from`, `to` (expected close date range)

```json
{
  "data": {
    "totalPipeline": 50000,
    "weightedForecast": 27500,
    "dealCount": 8,
    "byMonth": [{ "month": "2026-09", "amount": 10000, "weighted": 6500, "count": 2 }],
    "byStage": [],
    "byOwner": [],
    "deals": []
  }
}
```
