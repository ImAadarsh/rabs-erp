# RABS — keys / credentials you must supply

Code paths below are implemented and **env-gated**. Without the listed values they no-op safely (timeline note / skipped send).

## Email (SMTP) — required for OTP / notifications

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | e.g. `587` |
| `SMTP_USER` | Sending account |
| `SMTP_PASS` | App password / SMTP secret (**never commit**) |
| `SMTP_FROM` | From header |

Used for: portal OTP, quote send email, appointment/booking confirmations, payment reminder emails.

Set only in server `/var/www/rabs-api/.env` (gitignored). Cleared pending a replacement provider/credential — without these, OTP email and notify mail are skipped.

## Still required from you (optional features)

### Google Calendar sync (appointments + fitting/delivery)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | OAuth client (already used for Google login if set) |
| `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | Refresh token for a calendar user with write access |
| `GOOGLE_CALENDAR_ID` | Optional; default `primary` |

Without these, bookings still work; calendar event IDs stay null.

### SMS OTP / SMS payment reminders

| Variable | Purpose |
|----------|---------|
| `SMS_PROVIDER_API_KEY` | Bearer token for your SMS gateway |
| `SMS_PROVIDER_FROM` | Sender ID / from number |
| `SMS_PROVIDER_URL` | POST endpoint body `{ to, from, body }` |

Portal OTP prefers **email** when SMTP is set. SMS is only used as a fallback when configured.

### Push notifications (mobile)

| Variable | Purpose |
|----------|---------|
| `FCM_SERVER_KEY` | Firebase Cloud Messaging server key |

Not wired to live device push until this (and client FCM setup) is provided.

## Not blocked on keys

- Min sell price + admin override audit
- Payment reminder history API
- Furniture vs carpet/flooring sales split on `/api/rabs/reports/sales`
- Mobile quote editor + product search
- Migration `021_rabs_requirements_gaps.sql` (`npm run migrate:021`)
