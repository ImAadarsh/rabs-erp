/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * UK Accounting API client — base `/api/finance` (see zaam-api/docs/UK_ACCOUNTING.md).
 */
import axios from 'axios';
import { getSession } from '@/lib/auth';
import { API_BASE, listPayrollRuns } from '@/lib/api';
import { isApiMissing } from '@/lib/accounting-utils';

function authHeaders() {
  const s = getSession();
  if (!s?.accessToken) return {};
  return { Authorization: `Bearer ${s.accessToken}` };
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(params?: Query) {
  if (!params) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    q.append(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

const BASE = '/api/finance';

async function getFin<T = any>(path: string, params?: Query): Promise<T> {
  const { data } = await axios.get(`${API_BASE}${BASE}${path}${qs(params)}`, { headers: authHeaders() });
  return data;
}

async function postFin<T = any>(path: string, body?: unknown): Promise<T> {
  const { data } = await axios.post(`${API_BASE}${BASE}${path}`, body ?? {}, { headers: authHeaders() });
  return data;
}

async function patchFin<T = any>(path: string, body?: unknown): Promise<T> {
  const { data } = await axios.patch(`${API_BASE}${BASE}${path}`, body ?? {}, { headers: authHeaders() });
  return data;
}

async function putFin<T = any>(path: string, body?: unknown): Promise<T> {
  const { data } = await axios.put(`${API_BASE}${BASE}${path}`, body ?? {}, { headers: authHeaders() });
  return data;
}

// ─── Dashboard / settings ────────────────────────────────────
export async function getAccountingDashboard(organizationId?: string) {
  return getFin('/dashboard', { organizationId });
}

export async function getAccSettings(organizationId?: string) {
  return getFin('/settings', { organizationId });
}

export async function saveAccSettings(payload: any) {
  try {
    return await putFin('/settings', payload);
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return patchFin('/settings', payload);
  }
}

export async function listVatCodes(organizationId?: string) {
  try {
    return await getFin('/vat-codes', { organizationId });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return {
      data: [
        { code: 'S', name: 'Standard 20%', rate: 20, scheme: 'standard' },
        { code: 'R', name: 'Reduced 5%', rate: 5, scheme: 'standard' },
        { code: 'Z', name: 'Zero-rated', rate: 0, scheme: 'standard' },
        { code: 'E', name: 'Exempt', rate: 0, scheme: 'standard' },
        { code: 'OS', name: 'Out of scope', rate: 0, scheme: 'standard' },
      ],
      _stub: true,
    };
  }
}

export async function listAccAuditTrail(organizationId?: string, params?: Query) {
  try {
    return await getFin('/audit-events', { organizationId, ...params });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    const { data } = await axios.get(`${API_BASE}/api/iam/audit-logs?limit=100`, { headers: authHeaders() });
    const rows = (data?.data || data || []).filter((r: any) =>
      String(r.resource || r.entity || r.action || '')
        .toLowerCase()
        .match(/invoice|journal|vat|bank|payment|ledger|finance|payroll|bill|expense/)
    );
    return { data: rows, _sourceNote: 'Filtered IAM audit logs' };
  }
}

// ─── Sales ───────────────────────────────────────────────────
export async function listAccInvoices(organizationId?: string, params?: Query) {
  return getFin('/invoices', { organizationId, ...params });
}

export async function createAccInvoice(payload: any) {
  try {
    return await postFin('/invoices/uk', payload);
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return postFin('/invoices', payload);
  }
}

export async function getAccInvoice(id: string) {
  return getFin(`/invoices/${id}`);
}

export async function postAccInvoice(id: string) {
  return postFin(`/invoices/${id}/post`);
}

export async function listAccCreditNotes(organizationId?: string, params?: Query) {
  try {
    return await getFin('/credit-notes', { organizationId, ...params });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return { data: [] };
  }
}

export async function listAccPayments(organizationId?: string, params?: Query) {
  return getFin('/payments', { organizationId, ...params });
}

// ─── Purchases / Bills ───────────────────────────────────────
export async function listAccBills(organizationId?: string, params?: Query) {
  try {
    return await getFin('/bills', { organizationId, ...params });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return { data: [], _stub: true };
  }
}

export async function createAccBill(payload: any) {
  return postFin('/bills', payload);
}

export async function payAccBill(id: string, payload?: any) {
  return postFin(`/bills/${id}/payments`, payload);
}

export async function getAccBill(id: string, organizationId?: string) {
  return getFin(`/bills/${id}`, { organizationId });
}

export async function submitAccBill(id: string) {
  return postFin(`/bills/${id}/submit`);
}

export async function approveAccBill(id: string) {
  return postFin(`/bills/${id}/approve`);
}

export async function postAccBill(id: string) {
  return postFin(`/bills/${id}/post`);
}

// ─── Banking ─────────────────────────────────────────────────
export async function listAccBankAccounts(organizationId?: string, params?: Query) {
  return getFin('/bank-accounts', { organizationId, ...params });
}

export async function createAccBankAccount(payload: any) {
  return postFin('/bank-accounts', payload);
}

export async function deleteAccBankAccount(id: string) {
  const { data } = await axios.delete(`${API_BASE}${BASE}/bank-accounts/${id}`, { headers: authHeaders() });
  return data;
}

export async function listAccBankTransactions(organizationId?: string, params?: Query) {
  return getFin('/bank-transactions', { organizationId, ...params });
}

export async function createAccBankTransaction(payload: any) {
  return postFin('/bank-transactions', payload);
}

export async function importBankCsv(payload: { organizationId?: string; bankAccountId: string; csv: string }) {
  return postFin('/bank-transactions/import-csv', payload);
}

export async function matchBankTransaction(id: string, payload: any) {
  return postFin(`/bank-transactions/${id}/match`, payload);
}

export async function transferBetweenBanks(payload: any) {
  return postFin('/bank-transfers', payload);
}

// ─── Chart / Ledger / Journals ───────────────────────────────
export async function listAccChartOfAccounts(organizationId?: string, params?: Query) {
  return getFin('/chart-of-accounts', { organizationId, ...params });
}

export async function createAccChartOfAccounts(payload: any) {
  return postFin('/chart-of-accounts', payload);
}

export async function listAccLedgerAccounts(organizationId?: string, params?: Query) {
  return getFin('/ledger-accounts', { organizationId, ...params });
}

export type LedgerAccountTypeOption = {
  value: string;
  label: string;
  normalBalance: 'debit' | 'credit';
  subtypes: string[];
  subtypeOptions?: Array<{ value: string; label: string }>;
};

/** Fallback only — the API (`GET /ledger-accounts/types`) is the source of truth and validates against the same list. */
export const DEFAULT_LEDGER_ACCOUNT_TYPES: LedgerAccountTypeOption[] = [
  { value: 'asset', label: 'Asset', normalBalance: 'debit', subtypes: [] },
  { value: 'liability', label: 'Liability', normalBalance: 'credit', subtypes: [] },
  { value: 'equity', label: 'Equity', normalBalance: 'credit', subtypes: [] },
  { value: 'revenue', label: 'Revenue', normalBalance: 'credit', subtypes: [] },
  { value: 'expense', label: 'Expense', normalBalance: 'debit', subtypes: [] },
  { value: 'cost_of_goods_sold', label: 'Cost of Goods Sold', normalBalance: 'debit', subtypes: [] },
];

export async function listLedgerAccountTypes(organizationId?: string): Promise<LedgerAccountTypeOption[]> {
  try {
    const res = await getFin<{ data: LedgerAccountTypeOption[] }>('/ledger-accounts/types', { organizationId });
    return res?.data?.length ? res.data : DEFAULT_LEDGER_ACCOUNT_TYPES;
  } catch {
    return DEFAULT_LEDGER_ACCOUNT_TYPES;
  }
}

export async function createAccLedgerAccount(payload: any) {
  return postFin('/ledger-accounts', payload);
}

export async function seedUkChartOfAccounts(organizationId: string) {
  try {
    return await postFin('/chart-of-accounts/seed-uk', { organizationId });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return createAccChartOfAccounts({
      organizationId,
      name: 'UK Chart of Accounts',
      isDefault: true,
      status: 'active',
    });
  }
}

export async function listAccJournals(organizationId?: string, params?: Query) {
  return getFin('/journal-entries', { organizationId, ...params });
}

export async function createAccJournal(payload: any) {
  return postFin('/journal-entries', payload);
}

export async function postAccJournal(id: string) {
  return postFin(`/journal-entries/${id}/post`);
}

export async function listAccFiscalPeriods(organizationId?: string) {
  return getFin('/fiscal-periods', { organizationId });
}

export async function getGeneralLedger(organizationId?: string, params?: Query) {
  return getFin('/reports/general-ledger', { organizationId, ...params });
}

export async function getTrialBalance(organizationId?: string, params?: Query) {
  return getFin('/reports/trial-balance', { organizationId, ...params });
}

// ─── VAT ─────────────────────────────────────────────────────
export async function listAccVatReturns(organizationId?: string, params?: Query) {
  return getFin('/vat-returns', { organizationId, ...params });
}

export async function deleteAccVatReturn(id: string) {
  const { data } = await axios.delete(`${API_BASE}${BASE}/vat-returns/${id}`, { headers: authHeaders() });
  return data;
}

export async function createAccVatReturn(payload: any) {
  try {
    return await postFin('/reports/vat-draft', payload);
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return postFin('/vat-returns', payload);
  }
}

export async function exportVatMtdBoxes(id: string) {
  return getFin(`/vat-returns/${id}/export`);
}

export async function submitVatMtdPlaceholder(id: string) {
  return postFin(`/vat-returns/${id}/submit-mtd`);
}

// ─── Payroll ─────────────────────────────────────────────────
export async function listAccPayrollRuns(organizationId?: string, params?: Query) {
  return listPayrollRuns({ organizationId, ...params });
}

export async function postPayrollToLedger(payrollRunId: string, payload?: any) {
  return postFin(`/payroll-runs/${payrollRunId}/post-journal`, payload);
}

// ─── Expenses ────────────────────────────────────────────────
export async function listAccExpenses(organizationId?: string, params?: Query) {
  try {
    return await getFin('/expenses', { organizationId, ...params });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return { data: [], _stub: true };
  }
}

export async function listAccExpenseEmployees(organizationId?: string): Promise<{ data: any[] }> {
  try {
    return await getFin('/expenses/employees', { organizationId });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    const { listEmployees } = await import('@/lib/api');
    return listEmployees({ organizationId });
  }
}

export async function createAccExpense(payload: any) {
  return postFin('/expenses', payload);
}

export async function approveAccExpense(id: string) {
  return postFin(`/expenses/${id}/approve`);
}

export async function rejectAccExpense(id: string, rejectionReason?: string) {
  return postFin(`/expenses/${id}/reject`, { rejectionReason });
}

// ─── Fixed assets ────────────────────────────────────────────
export async function listFixedAssets(organizationId?: string, params?: Query) {
  try {
    return await getFin('/fixed-assets', { organizationId, ...params });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return { data: [], _stub: true };
  }
}

export async function createFixedAsset(payload: any) {
  return postFin('/fixed-assets', payload);
}

export async function depreciateFixedAsset(_id: string, payload?: any) {
  // API: POST /fixed-assets/schedule/:scheduleId/post
  const scheduleId = payload?.scheduleId || _id;
  return postFin(`/fixed-assets/schedule/${scheduleId}/post`, payload);
}

export async function disposeFixedAsset(id: string, payload?: any) {
  return postFin(`/fixed-assets/${id}/dispose`, payload);
}

// ─── Tax ─────────────────────────────────────────────────────
export async function getCorporationTaxWorksheet(organizationId?: string, params?: Query) {
  try {
    return await getFin('/ct-worksheets', { organizationId, ...params });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return {
      data: { taxableProfit: null, adjustments: [], note: 'CT worksheet support data only — not a full CT600 filing' },
      _stub: true,
    };
  }
}

export async function saveCorporationTaxWorksheet(payload: any) {
  try {
    return await postFin('/ct-worksheets', payload);
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return putFin('/ct-worksheets', payload);
  }
}

// ─── Reports ─────────────────────────────────────────────────
export async function getProfitAndLoss(organizationId?: string, params?: Query) {
  return getFin('/reports/profit-and-loss', { organizationId, ...params });
}

export async function getBalanceSheet(organizationId?: string, params?: Query) {
  return getFin('/reports/balance-sheet', { organizationId, ...params });
}

export async function getCashFlow(organizationId?: string, params?: Query) {
  return getFin('/reports/cash-flow', { organizationId, ...params });
}

export async function getAgedReceivables(organizationId?: string, params?: Query) {
  return getFin('/reports/aged-receivables', { organizationId, ...params });
}

export async function getAgedPayables(organizationId?: string, params?: Query) {
  return getFin('/reports/aged-payables', { organizationId, ...params });
}

// ─── Documents (link via entity documentUrl; list from audit/expenses when dedicated list absent) ─
export async function listAccDocuments(organizationId?: string, params?: Query) {
  try {
    return await getFin('/documents', { organizationId, ...params });
  } catch (err) {
    if (!isApiMissing(err)) throw err;
    return { data: [], _stub: true };
  }
}

export async function createAccDocument(payload: any) {
  return postFin('/documents', payload);
}

export async function getAccDocument(id: string, organizationId?: string) {
  return getFin(`/documents/${id}`, { organizationId });
}
