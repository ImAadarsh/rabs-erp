# CRM Integrations — External Lead Ingest & Marketing Sync

Stable API shapes for Salesforce / HubSpot / Zapier and the panels Marketing UI.

## Auth (external systems)

Inbound lead webhooks use an **integration API key**, not a staff JWT.

| Header | Value |
|--------|--------|
| `X-Rabs-Api-Key` | `<integration_key>` |
| or `Authorization` | `Bearer <integration_key>` |

Keys are stored hashed in `crm_integration_keys` (org-scoped). Staff create/regenerate via CRM admin routes. Optional MVP env fallback: `CRM_LEAD_INGEST_API_KEY` (+ `CRM_LEAD_INGEST_ORG_ID`, default `1`).

---

## Inbound lead webhook

### `POST /api/integrations/leads`

Accepts a single lead object or `{ "records": [ ... ] }` (max 100).

**Idempotency:** when `externalId` / Salesforce `Id` is present, upsert on `(organization_id, source, external_id)`.  
`source` is taken from the integration key (`salesforce` | `hubspot` | `zapier` | `generic`) when not `generic`.

Auto-syncs each lead into Marketing segment **CRM Leads** when an email is present.

### Salesforce-ish payload

```json
{
  "Id": "00Qxxxxxxxxxxxx",
  "Email": "buyer@example.com",
  "FirstName": "Aisha",
  "LastName": "Khan",
  "Company": "Khan Convenience",
  "Phone": "+447700900123",
  "LeadSource": "Web",
  "Status": "Open",
  "Description": "Interested in wholesale"
}
```

### Generic payload

```json
{
  "email": "buyer@example.com",
  "name": "Aisha Khan",
  "company": "Khan Convenience",
  "phone": "+447700900123",
  "source": "partner",
  "externalId": "ext-123",
  "raw": { "any": "extra fields" }
}
```

### Example curl (fake key)

```bash
curl -sS -X POST 'https://api.rabsinteriors.app/api/integrations/leads' \
  -H 'Content-Type: application/json' \
  -H 'X-Rabs-Api-Key: rabs_salesforce_deadbeef.0123456789abcdef0123456789abcdef' \
  -d '{
    "Id": "00QFAKELEAD001",
    "Email": "demo.lead@example.com",
    "FirstName": "Demo",
    "LastName": "Lead",
    "Company": "Demo Retail Ltd",
    "Phone": "+447700000001",
    "LeadSource": "Web",
    "Status": "Open",
    "Description": "Test ingest — do not spam"
  }'
```

### Success response (single)

```json
{
  "data": {
    "id": "42",
    "created": true,
    "externalId": "00QFAKELEAD001",
    "email": "demo.lead@example.com",
    "name": "Demo Lead",
    "status": "new",
    "source": "salesforce",
    "marketingSync": {
      "segmentId": "7",
      "customerId": "99",
      "added": true
    }
  },
  "meta": { "count": 1, "organizationId": "1" }
}
```

Errors: `401` missing/invalid key · `400` bad body.

---

## Staff: manage integration keys

Auth: staff JWT · Roles: `ADMIN` | `SUPER_ADMIN`

| Method | Path |
|--------|------|
| `GET` | `/api/crm/integration-keys` |
| `POST` | `/api/crm/integration-keys` |
| `POST` | `/api/crm/integration-keys/:id/regenerate` |
| `POST` | `/api/crm/integration-keys/:id/deactivate` |

### Create body

```json
{
  "name": "Salesforce Production",
  "source": "salesforce"
}
```

Response includes plaintext `key` **once** (prefix + secret). Store it in Salesforce Named Credential / Zapier.

```json
{
  "data": {
    "id": "1",
    "name": "Salesforce Production",
    "keyPrefix": "rabs_salesforce_a1b2c3",
    "key": "rabs_salesforce_a1b2c3.<hex>",
    "source": "salesforce",
    "active": true
  }
}
```

---

## CRM → Marketing

On inbound ingest and on staff `POST /api/crm/leads`, leads with email are synced into a static Marketing segment:

- Name: `CRM Leads`
- Code: `CRM_LEADS`

Creates/finds an ERP `customers` row for the email and adds a `segment_members` row.

### `POST /api/crm/leads/:id/sync-to-marketing`

Staff JWT · CRM staff roles.

```json
{
  "data": {
    "segmentId": "7",
    "customerId": "99",
    "added": true
  }
}
```

`400` if lead has no email.

---

## Cold email / marketing email campaigns

See **[MARKETING_EMAIL_PROVIDERS.md](./MARKETING_EMAIL_PROVIDERS.md)** for multi-provider connectors (SendGrid first-class, Gmail SMTP, stubs for Brevo/SES/Mailchimp).

Base: `/api/marketing/email-campaigns` · Connectors: `/api/marketing/email-connectors`  
Auth: staff JWT · Roles: `ADMIN` | `SUPER_ADMIN` | `MARKETING`

### Env (Gmail SMTP and optional SendGrid fallback)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM="RABS <your-account@gmail.com>"

# Optional global SendGrid fallback (prefer DB connector)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=
SENDGRID_WEBHOOK_SECRET=
```

Never log `SMTP_PASS` or `SENDGRID_API_KEY`. List/get responses include `meta.smtpConfigured` and `meta.sendgridConfigured`.

### CRUD

| Method | Path |
|--------|------|
| `GET` | `/api/marketing/email-campaigns` |
| `POST` | `/api/marketing/email-campaigns` |
| `GET` | `/api/marketing/email-campaigns/:id` |
| `PATCH` | `/api/marketing/email-campaigns/:id` |
| `DELETE` | `/api/marketing/email-campaigns/:id` |
| `GET` | `/api/marketing/email-campaigns/:id/sends` |
| `POST` | `/api/marketing/email-campaigns/:id/send` |

### Create body

```json
{
  "name": "Spring cold outreach",
  "subject": "Wholesale with RABS",
  "htmlBody": "<p>Hi,</p><p>…</p>",
  "builderJson": null,
  "fromName": "RABS",
  "replyTo": "support@example.com",
  "connectorId": null,
  "audienceType": "crm_leads",
  "source": "crm_leads",
  "segmentId": null,
  "status": "draft"
}
```

`audienceType` / `source`: `crm_leads` (open leads with email) | `segment` (requires `segmentId`) | `manual` (pass `emails` on send).

### Send

`POST /api/marketing/email-campaigns/:id/send?full=1`

- Uses campaign `connectorId`, else org default connector, else env SendGrid / SMTP.
- SendGrid default cap **500** (full **5000**); Gmail SMTP default **50** (full **500**).
- Optional body `{ "emails": ["a@b.com"], "connectorId": "1", "full": true }`.
- Writes `marketing_email_sends` rows (`queued` → `sent` | `failed`).

Existing Marketing module campaigns (`/api/marketing/campaigns`) remain for ops tracking.

---

## Tables

- `crm_integration_keys`
- `crm_leads.external_id` (+ unique `(organization_id, source, external_id)`)
- `marketing_email_campaigns`
- `marketing_email_sends`
- `marketing_email_connectors` (migration 017)
- `marketing_email_events` (migration 017)

Migration: `migrations/012_crm_marketing_email.sql` · `npm run migrate:012`  
Providers: `migrations/017_marketing_email_providers.sql` · `npm run migrate:017`
