# UK Accounting API (ABS Interiors)

Base path: **`/api/finance`**  
Auth: `Authorization: Bearer <JWT>`  
Org: JWT `orgId`, or `?organizationId=` / body `organizationId`  
Roles: `ADMIN` | `SUPER_ADMIN` | `FINANCE` | **`ACCOUNTANT`**

Migration: **`018_uk_accounting.sql`** (`npm run migrate:018`) — extends existing invoices / journals / bank / VAT; does not replace them.  
Seed: `npm run seed:accounting` — UK COA + VAT codes + FY period + ACCOUNTANT role.

Envelope: success `{ data, meta? }`, errors `{ error: { message, details? } }`.

> **MTD / HMRC:** Structured VAT box **export** + placeholder submit endpoint. **Not** full live MTD VAT or RTI payroll unless HMRC credentials are configured. See [Credentials later](#credentials-needed-later-hmrc).

---

## Requirements coverage

| # | Tab / area | Coverage |
|---|------------|----------|
| 1 | Dashboard | `GET /dashboard` — cash, income/expenses YTD, P&L summary, VAT due, open AR/AP, alerts |
| 2 | Sales | Invoices (existing + `POST /invoices/uk`), recurring, credit notes, payments, customer statements |
| 3 | Purchases | Supplier bills, approve/post/pay, supplier statements; expenses link via `/expenses` |
| 4 | Banking | Accounts + txns (existing), CSV import, match, rules, transfers, reconciliations |
| 5 | Accounting | UK COA seed, journals with balance check + `POST .../post`, GL + trial balance reports |
| 6 | VAT | Schemes in settings, VAT codes, calc on invoices/bills, VAT draft report, MTD export + placeholder submit |
| 7 | Payroll link | `POST /payroll-runs/:id/post-journal` → PAYE/NI/net control accounts; `GET /payroll-payslips` |
| 8 | Expenses | Employee expenses + receipt URL + approve (posts journal) |
| 9 | Fixed assets | Register, depreciation schedule post, dispose + journal |
| 10 | Tax (CT) | `ct-worksheets` — taxable profit adjustments (not full CT600) |
| 11 | Reporting | P&L, Balance Sheet, TB, Cash Flow (indirect MVP), Aged AR/AP, VAT |
| 12 | Documents | `documentUrl` / `receiptUrl` on invoices, bills, credit notes, expenses |
| 13 | Audit trail | Append-only `acc_audit_events` + existing IAM `auditMiddleware` |
| 14 | Users | Reuses IAM; adds **`ACCOUNTANT`** role |

---

## Route map

### Dashboard & settings
| Method | Path | Notes |
|--------|------|--------|
| GET | `/dashboard` | Aggregates |
| GET/PUT/PATCH | `/settings` | VAT scheme flags, MTD client id flag |
| GET/POST | `/vat-codes` | UK VAT codes |
| PATCH | `/vat-codes/:id` | |
| GET | `/audit-events` | Append-only accounting audit |

### Reports
| Method | Path |
|--------|------|
| GET | `/reports/trial-balance?from&to` |
| GET | `/reports/profit-and-loss?from&to` |
| GET | `/reports/balance-sheet?to` |
| GET | `/reports/cash-flow?from&to` |
| GET | `/reports/aged-receivables?asOf` |
| GET | `/reports/aged-payables?asOf` |
| GET | `/reports/general-ledger?from&to&ledgerAccountId` |
| GET | `/reports/vat-draft?from&to` |
| POST | `/reports/vat-draft` | Persist draft VAT return with boxes 1–9 |

### Double-entry spine
| Method | Path | Notes |
|--------|------|--------|
| CRUD | `/chart-of-accounts`, `/ledger-accounts`, `/fiscal-periods`, `/journal-entries` | Existing, extended roles |
| POST | `/journal-entries/:id/post` | Post draft if balanced |

### Sales
| Method | Path |
|--------|------|
| POST | `/invoices/uk` | Create with VAT calc + optional `documentUrl` |
| POST | `/invoices/:id/post` | Dr Debtors / Cr Sales / Cr VAT |
| POST | `/invoices/payments` | Record payment + optional bank journal |
| GET/POST | `/credit-notes` | |
| GET/POST | `/recurring-invoices` | |
| POST | `/recurring-invoices/:id/run` | Spawn invoice from template |
| GET | `/customers/:customerId/statement` | |

### Purchases & expenses
| Method | Path |
|--------|------|
| GET/POST | `/bills` |
| POST | `/bills/:id/submit` · `/approve` · `/post` · `/payments` |
| GET | `/suppliers/:supplierId/statement` |
| GET/POST | `/expenses` |
| POST | `/expenses/:id/submit` · `/approve` · `/reject` |

### Banking
| Method | Path |
|--------|------|
| POST | `/bank-transactions/import-csv` | Body: `{ bankAccountId, csv }` |
| GET | `/bank-transactions/:id/suggest-matches` |
| POST | `/bank-transactions/:id/match` |
| GET/POST | `/bank-rules` · `POST /bank-rules/apply` |
| POST | `/bank-transfers` |
| GET/POST | `/bank-reconciliations` · `POST .../:id/complete` |

### VAT / MTD
| Method | Path | Notes |
|--------|------|--------|
| GET | `/vat-returns/:id/export` | Structured boxes JSON |
| POST | `/vat-returns/:id/submit-mtd` | **501** unless `hmrcMtdEnabled` + client id; otherwise placeholder only |

### Payroll ↔ GL
| Method | Path |
|--------|------|
| POST | `/payroll-runs/:id/post-journal` | From HR payroll run |
| GET | `/payroll-payslips?payrollRunId` | Read HR payslips |

### Fixed assets & CT
| Method | Path |
|--------|------|
| GET/POST | `/fixed-assets` |
| POST | `/fixed-assets/schedule/:scheduleId/post` |
| POST | `/fixed-assets/:id/dispose` |
| GET/POST/PUT | `/ct-worksheets` | Support data — not CT600 |

---

## Seeded UK COA (key codes)

| Code | Name | Role |
|------|------|------|
| 1000 | Bank Current | Cash |
| 1200 | Trade Debtors | AR |
| 1300 / 2100 | VAT input / output | VAT |
| 2000 | Trade Creditors | AP |
| 2200–2240 | PAYE / NI / Net / Pension controls | Payroll journals |
| 4000 | Sales | Revenue |
| 6000–6200 | Wages / Employer NI / Pension expense | Payroll |
| 1500 / 1510 / 6500 | FA cost / accum / depr expense | Assets |

VAT codes: `S` 20%, `R` 5%, `Z`, `E`, `OS`, `RC`.

---

## Credentials needed later (HMRC)

| Integration | Purpose | Status now |
|-------------|---------|------------|
| HMRC MTD VAT API (client id/secret, fraud headers, OAuth) | Live VAT return submission | Export + placeholder only |
| HMRC RTI (FPS/EPS) | Live payroll submissions | **Out of scope** — HR calculate is illustrative; accounting posts journals only |
| Open Banking / bank feed API | Live bank feeds | CSV import MVP only |

Env placeholders (optional, never commit secrets):

```bash
# HMRC MTD (future) — prefer DB acc_org_settings.hmrc_mtd_*
# HMRC_MTD_CLIENT_ID=
# HMRC_MTD_CLIENT_SECRET=
# HMRC_MTD_ENABLED=false
```

---

## Local bootstrap

```bash
npm run migrate:018
npm run seed:accounting
npm run build   # tsc
./deploy_api.sh # production VPS
```
