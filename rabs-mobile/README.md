# RABS Mobile (Flutter + PWA)

One app, three role homes — **field** (fitter/driver), **staff** (sales/office), **customer** — synced to `rabs-api`.

## Run

```bash
cd rabs-mobile
flutter pub get

# Local API
flutter run -d chrome --dart-define=API_BASE=http://localhost:4000

# Production API
flutter run --dart-define=API_BASE=https://api.rabsinteriors.app
```

## PWA / web build

```bash
flutter build web --release --dart-define=API_BASE=https://api.rabsinteriors.app
# Output: build/web/  → deploy to e.g. app.rabsinteriors.app
```

## Staff login

Use the same IAM email/password as the web panels (`/api/iam/auth/login`).

Role routing:

| Roles / capabilities | Home |
| --- | --- |
| FITTER / DRIVER (fieldwork, no customers) | Field — My work |
| OFFICE / SURVEYOR / sales caps | Staff — RABS pipeline |
| Customer portal OTP | Customer — My jobs |

## Customer portal

1. Customer taps **Customer** on the login screen.
2. Enters phone or email on their quote → receives OTP.
3. In non-production API responses, `devCode` is returned so you can test without SMS.

API: `/api/rabs/portal/request-otp`, `verify-otp`, `me`, `jobs`, `quotes/:id/accept|decline`.

## Out of scope (use web admin)

HR, finance ledger, inventory admin, RABS `/admin` settings.
