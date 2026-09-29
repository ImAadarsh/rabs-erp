# Marketing Email Providers

Multi-provider marketing email for Rabs Interiors. Campaigns are provider-agnostic; connectors hold encrypted credentials per organization. **SendGrid** is the first-class mass-send provider; **Gmail SMTP** remains for cold / low-volume sends. Brevo, SES, and Mailchimp adapters are stubs until keys are configured and full APIs are wired.

**Never commit real API keys.** Prefer per-org connectors in the DB. Optional `SENDGRID_API_KEY` is a global fallback only.

---

## Providers

| Provider | Status | Mass send |
|----------|--------|-----------|
| `sendgrid` | Full (Mail Send v3) | Batched personalizations (100/req, ~200ms gap); default cap 500 / full 5000 |
| `gmail_smtp` | Full (nodemailer) | Per-recipient + 400ms delay; default cap 50 / full 500 |
| `brevo` | Stub | Returns “not configured” / not implemented |
| `ses` | Stub | Returns “not configured” / not implemented |
| `mailchimp` | Stub | Returns “not configured” / not implemented |

Interface: `src/services/marketing/email/EmailProvider.ts`

---

## Env (optional globals)

```env
# Prefer connector credentials in DB. These are fallbacks only.
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=Rabs Interiors
# Webhook verify (set at least one in production)
SENDGRID_WEBHOOK_SECRET=long-random-string
# Or Signed Event Webhook public key (PEM / base64)
SENDGRID_WEBHOOK_VERIFICATION_KEY=

# Existing Gmail SMTP (kept)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Never log `SENDGRID_API_KEY` or `SMTP_PASS`.

---

## How to add a SendGrid connector (panels / API)

1. Create a SendGrid API key (Mail Send permission) in the SendGrid dashboard.
2. Verify a sender / domain in SendGrid.
3. From Marketing → Email connectors (or API below), create:

```http
POST /api/marketing/email-connectors
Authorization: Bearer <staff JWT>
Content-Type: application/json

{
  "provider": "sendgrid",
  "name": "SendGrid production",
  "isDefault": true,
  "credentials": {
    "apiKey": "SG.xxxx",
    "fromEmail": "noreply@yourdomain.com",
    "fromName": "Rabs Interiors"
  }
}
```

4. Test: `POST /api/marketing/email-connectors/:id/test`
5. Create a campaign with `"connectorId": "<id>"` (or leave blank to use org default / env fallback).
6. Send: `POST /api/marketing/email-campaigns/:id/send`

**Env-ref credentials** (use server env instead of storing the key):

```json
{ "useEnv": true, "fromEmail": "noreply@yourdomain.com", "fromName": "Rabs Interiors" }
```

Requires `SENDGRID_API_KEY` on the API host (e.g. `/var/www/rabs-api/.env`). Still do **not** put the key in git.

**No seed ships a real SendGrid key.**

---

## Routes

Auth: staff JWT · Roles: `ADMIN` | `SUPER_ADMIN` | `MARKETING` (except webhook).

### Connectors

| Method | Path |
|--------|------|
| `GET` | `/api/marketing/email-connectors` |
| `POST` | `/api/marketing/email-connectors` |
| `GET` | `/api/marketing/email-connectors/:id` |
| `PATCH` | `/api/marketing/email-connectors/:id` |
| `DELETE` | `/api/marketing/email-connectors/:id` |
| `POST` | `/api/marketing/email-connectors/:id/test` |
| `POST` | `/api/marketing/email-connectors/test` (probe without save) |

Responses never include raw credentials — only `keyHint`.

### Campaigns

| Method | Path |
|--------|------|
| `GET` | `/api/marketing/email-campaigns` |
| `POST` | `/api/marketing/email-campaigns` |
| `GET` | `/api/marketing/email-campaigns/:id` |
| `PATCH` | `/api/marketing/email-campaigns/:id` |
| `DELETE` | `/api/marketing/email-campaigns/:id` |
| `GET` | `/api/marketing/email-campaigns/:id/sends` |
| `POST` | `/api/marketing/email-campaigns/:id/send` |

Create / update body extras:

```json
{
  "name": "Spring blast",
  "subject": "Hello",
  "htmlBody": "<p>…</p>",
  "builderJson": "{\"blocks\":[]}",
  "fromName": "Rabs Interiors",
  "replyTo": "support@yourdomain.com",
  "connectorId": "1",
  "audienceType": "crm_leads",
  "source": "crm_leads",
  "segmentId": null
}
```

`audienceType` / `source`: `crm_leads` | `segment` | `manual`.

Send body:

```json
{ "full": true, "connectorId": "1", "emails": ["a@b.com"] }
```

### Webhook (public)

```http
POST /api/marketing/webhooks/sendgrid?token=<SENDGRID_WEBHOOK_SECRET>
```

Or header `X-Rabs-Webhook-Secret: <secret>`, or SendGrid Signed Event Webhook headers + `SENDGRID_WEBHOOK_VERIFICATION_KEY`.

Events land in `marketing_email_events` (opens, clicks, bounces, etc.).

Configure in SendGrid → Mail Settings → Event Webhook →  
`https://api.rabsinteriors.app/api/marketing/webhooks/sendgrid?token=YOUR_SECRET`

---

## Tables

- `marketing_email_connectors`
- `marketing_email_campaigns` (+ `connector_id`, `builder_json`, `from_name`, `reply_to`, `audience_type`)
- `marketing_email_events`
- `marketing_email_sends` (unchanged)

Migration: `migrations/017_marketing_email_providers.sql` · `npm run migrate:017`

---

## Gmail SMTP connector

```json
{
  "provider": "gmail_smtp",
  "name": "Gmail app password",
  "credentials": {
    "useEnv": true
  }
}
```

Or inline `{ "host", "port", "user", "pass", "from" }` (encrypted at rest).
