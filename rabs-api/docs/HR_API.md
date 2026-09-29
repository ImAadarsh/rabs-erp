# UK HR API (ABS Interiors)

Base path: **`/api/hr`**  
Auth: `Authorization: Bearer <JWT>` — unauthenticated → **401** (not 404)  
Org: from JWT `orgId`, or `?organizationId=` / body `organizationId`  
Roles: `ADMIN` | `SUPER_ADMIN` | `HR_MANAGER` | `HR_ADMIN` (+ `FINANCE` on payroll/payslips)  

Migration: **`015_hr_uk.sql`** (`npm run migrate:015`) — does **not** touch CRM `014`.  
Seed: `npm run seed:hr` (fictional UK employees / NI only).

Envelope: success `{ data, meta? }`, errors `{ error: { message, details? } }`.

> **Payroll disclaimer:** PAYE/NI via `POST /payroll-runs/:id/calculate` is an **illustrative stub**, not HMRC-certified. Rates from env (below).

---

## Requirements coverage

| # | Requirement | Coverage |
|---|-------------|----------|
| 1 | Employee records & personal info | `employees` + UK fields (`niNumber`, `taxCode`, `department`, `jobTitle`, …) |
| 2 | Visa / work permit / immigration | `hr_immigration` + `/immigration` |
| 3 | Visa expiry & renewal reminders | `GET /compliance/visa-expiring` + stub log emails |
| 4 | Right to Work documents | `hr_rtw_documents` + `/rtw-documents` (S3 key/url) |
| 5 | UK payroll PAYE & NI | `payroll_runs` / `payroll_lines` + calculate stub |
| 6 | Holiday & leave | `leave_requests`, `hr_leave_policies`, `hr_leave_balances`, approve/reject |
| 7 | Attendance, overtime, absence | `hr_attendance`, `hr_overtime` (+ legacy `time_entries`) |
| 8 | Statutory sick pay | `hr_sick_episodes` |
| 9 | Pension auto-enrolment | `hr_pension` |
| 10 | Contracts & document storage | `hr_documents` + legacy `employment-contracts` / `employee-documents` |
| 11 | Payslip, P45, P60 | `hr_payslips`, `hr_tax_documents` |
| 12 | Recruitment & onboarding | `hr_job_postings`, `hr_applicants`, `hr_onboarding_checklists` |
| 13 | Employee self-service | `/hr/me/*` (JWT user linked via `employees.user_id`) |
| 14 | HR reports & compliance | `GET /reports/summary`, `hr_compliance_alerts` |

---

## Self-service `/api/hr/me/*`

Any authenticated user with a linked `employees.user_id`:

| Method | Path | Notes |
|--------|------|--------|
| GET | `/me` | Profile |
| PATCH | `/me` | Address, phone, emergency contacts only |
| GET/POST | `/me/leave-requests` | List / request leave |
| GET | `/me/leave-balances` | |
| GET | `/me/attendance` | |
| GET | `/me/payslips` | |
| GET | `/me/tax-documents` | |
| GET | `/me/documents` | |
| GET | `/me/pension` | |
| GET | `/me/immigration` | |
| GET | `/me/onboarding` | |

---

## Staff routes (summary)

### Employees
- `GET/POST /employees`, `GET/PATCH/DELETE /employees/:id`
- UK body fields: `niNumber`, `taxCode`, `department`, `jobTitle`, `annualSalary`, `payFrequency`

### Immigration & RTW
- `GET /immigration`, `GET /immigration/:id`, `GET /immigration/employee/:employeeId`
- `POST|PUT /immigration` upsert by `employeeId`
- `GET/POST /rtw-documents`, `PATCH/DELETE /rtw-documents/:id`

### Leave
- `GET/POST/PATCH/DELETE /leave-policies`
- `GET/POST|PUT /leave-balances`
- Legacy `leave-requests` CRUD
- `POST /leave-requests/:id/approve` · `POST /leave-requests/:id/reject` `{ "rejectionReason"? }`

### Attendance / overtime / SSP / pension
- `GET/POST|PUT /attendance`, `DELETE /attendance/:id`
- `GET/POST /overtime`, `PATCH/DELETE /overtime/:id`
- `GET/POST /sick-episodes`, `PATCH/DELETE /sick-episodes/:id`
- `GET/POST|PUT /pension`

### Documents / payslips / tax
- `GET/POST /documents`, `PATCH/DELETE /documents/:id` — store `s3Key` / `documentUrl` (upload via existing S3 helpers)
- `GET/POST /payslips`, `DELETE /payslips/:id`
- `GET/POST /tax-documents`, `DELETE /tax-documents/:id` — `docType`: `P45` \| `P60` \| `P11D` \| `other`

### Payroll
- Legacy `payroll-runs` / `payroll-lines`
- `POST /payroll-runs/:id/calculate` — illustrative PAYE/NI; optional `{ "createPayslips": true, "taxYear": "2025/26" }`

### Recruitment
- `GET/POST /job-postings`, `GET/PATCH/DELETE /job-postings/:id`
- `GET/POST /applicants`, `PATCH/DELETE /applicants/:id`
- `GET/POST /onboarding`, `POST /onboarding/seed`, `PATCH /onboarding/:id`

### Compliance & reports
- `GET /compliance/visa-expiring?withinDays=90`
- `GET /compliance/alerts`, `PATCH /compliance/alerts/:id` `{ "status" }`
- `GET /reports/summary`

### Legacy (unchanged paths)
`employment-contracts`, `employee-documents`, `time-entries`, `shifts`, `tasks`, `kpi-definitions`, `kpi-records`

---

## Env notes (optional payroll stubs)

No secrets in git. Optional overrides on VPS `.env`:

```bash
HR_PAYE_PERSONAL_ALLOWANCE=12570
HR_PAYE_BASIC_RATE_PCT=20
HR_NI_EMPLOYEE_PCT=8
HR_NI_EMPLOYER_PCT=13.8
HR_NI_PRIMARY_THRESHOLD=12570
HR_PENSION_EMPLOYEE_PCT=5
HR_PENSION_EMPLOYER_PCT=3
HR_SSP_WEEKLY_RATE=116.75
```

S3 already configured (`AWS_*`) for document keys under `hr/...`.

---

## Deploy checklist

1. `npm run build` (tsc)
2. `./deploy_api.sh`
3. On VPS: `npm run migrate:015` then `npm run seed:hr`
4. Smoke: `curl -sSI https://api.rabsinteriors.app/api/hr/employees` → **401** without token
