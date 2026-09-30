/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listAccLedgerAccounts,
  createAccLedgerAccount,
  listAccChartOfAccounts,
  createAccChartOfAccounts,
  seedUkChartOfAccounts,
  listAccJournals,
  createAccJournal,
  postAccJournal,
  getGeneralLedger,
  getTrialBalance,
  listAccFiscalPeriods,
} from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, printElement, downloadCsv } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Printer, Download } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'coa' | 'journals' | 'gl' | 'tb';

export default function AccountingLedgerPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [tab, setTab] = useState<Tab>('coa');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'journals' || t === 'gl' || t === 'tb' || t === 'coa') setTab(t);
  }, []);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [charts, setCharts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [glLines, setGlLines] = useState<any[]>([]);
  const [tbRows, setTbRows] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [openAcc, setOpenAcc] = useState(false);
  const [openJe, setOpenJe] = useState(false);
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;

  const [accForm, setAccForm] = useState({
    chartOfAccountsId: '',
    accountCode: '',
    accountName: '',
    accountType: 'asset' as string,
    normalBalance: 'debit' as string,
  });

  const [jeForm, setJeForm] = useState({
    journalNumber: '',
    entryDate: new Date().toISOString().slice(0, 10),
    fiscalPeriodId: '',
    description: '',
    debitAccountId: '',
    creditAccountId: '',
    amount: '',
  });

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [coa, led, jes, gl, tb, fp] = await Promise.all([
        listAccChartOfAccounts(orgId),
        listAccLedgerAccounts(orgId),
        listAccJournals(orgId),
        getGeneralLedger(orgId),
        getTrialBalance(orgId),
        listAccFiscalPeriods(orgId),
      ]);
      setCharts(coa.data || []);
      setAccounts(led.data || []);
      setJournals(jes.data || []);
      setGlLines((gl.data as any)?.lines || []);
      setTbRows((tb.data as any)?.rows || []);
      setPeriods(fp.data || []);
      if ((coa.data || [])[0]) setAccForm((f) => ({ ...f, chartOfAccountsId: f.chartOfAccountsId || coa.data[0].id }));
      if ((fp.data || [])[0]) setJeForm((f) => ({ ...f, fiscalPeriodId: f.fiscalPeriodId || fp.data[0].id }));
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load ledger'));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (hasAccess) load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function ensureChart() {
    if (!orgId) return null;
    if (charts[0]) return charts[0].id;
    try {
      await seedUkChartOfAccounts(orgId);
      const res = await listAccChartOfAccounts(orgId);
      setCharts(res.data || []);
      return res.data?.[0]?.id;
    } catch {
      const created = await createAccChartOfAccounts({
        organizationId: orgId,
        name: 'UK Chart of Accounts',
        isDefault: true,
        status: 'active',
      });
      const id = (created as any)?.data?.id || (created as any)?.id;
      await load();
      return id;
    }
  }

  async function onCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const chartId = accForm.chartOfAccountsId || (await ensureChart());
      if (!chartId) throw new Error('No chart of accounts');
      await createAccLedgerAccount({
        organizationId: orgId,
        chartOfAccountsId: chartId,
        accountCode: accForm.accountCode,
        accountName: accForm.accountName,
        accountType: accForm.accountType,
        normalBalance: accForm.normalBalance,
        isActive: true,
      });
      toast.success('Ledger account created');
      setOpenAcc(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onCreateJournal(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const amount = Number(jeForm.amount);
    if (!jeForm.debitAccountId || !jeForm.creditAccountId || !amount) {
      toast.error('Debit, credit accounts and amount required');
      return;
    }
    if (jeForm.debitAccountId === jeForm.creditAccountId) {
      toast.error('Debit and credit must be different accounts');
      return;
    }
    setSaving(true);
    try {
      await createAccJournal({
        organizationId: orgId,
        fiscalPeriodId: jeForm.fiscalPeriodId || periods[0]?.id,
        journalNumber: jeForm.journalNumber || `JE-${Date.now().toString().slice(-8)}`,
        entryDate: jeForm.entryDate,
        entryType: 'standard',
        sourceType: 'manual',
        description: jeForm.description,
        status: 'draft',
        journalLines: [
          { ledgerAccountId: jeForm.debitAccountId, lineNumber: 1, description: jeForm.description, debitAmount: amount, creditAmount: 0, currency: 'GBP' },
          { ledgerAccountId: jeForm.creditAccountId, lineNumber: 2, description: jeForm.description, debitAmount: 0, creditAmount: amount, currency: 'GBP' },
        ],
      });
      toast.success('Journal created (draft)');
      setOpenJe(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onPost(id: string) {
    try {
      await postAccJournal(id);
      toast.success('Journal posted');
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    }
  }

  const coaCols = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'accountCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.accountCode}</span> },
      { accessorKey: 'accountName', header: 'Name' },
      { accessorKey: 'accountType', header: 'Type', cell: ({ row }) => <span className="capitalize">{String(row.original.accountType || '').replace(/_/g, ' ')}</span> },
      { accessorKey: 'normalBalance', header: 'Normal', cell: ({ row }) => <span className="capitalize">{row.original.normalBalance}</span> },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => <span className={statusBadgeClass(row.original.isActive === false ? 'inactive' : 'active')}>{row.original.isActive === false ? 'Inactive' : 'Active'}</span>,
      },
    ],
    []
  );

  const jeCols = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'journalNumber', header: 'Journal #', cell: ({ row }) => <span className="font-mono text-xs text-brand">{row.original.journalNumber}</span> },
      { accessorKey: 'entryDate', header: 'Date', cell: ({ row }) => formatDate(row.original.entryDate) },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => row.original.description || '—' },
      { accessorKey: 'sourceType', header: 'Source', cell: ({ row }) => <span className="capitalize">{row.original.sourceType || 'manual'}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{row.original.status}</span> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'draft' ? (
            <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => onPost(row.original.id)}>
              Post
            </button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journals]
  );

  const glCols = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'entryDate', header: 'Date', cell: ({ row }) => formatDate(row.original.entryDate) },
      { accessorKey: 'journalNumber', header: 'Journal', cell: ({ row }) => <span className="font-mono text-xs">{row.original.journalNumber}</span> },
      { accessorKey: 'accountCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.accountCode}</span> },
      { accessorKey: 'accountName', header: 'Account' },
      { accessorKey: 'debit', header: 'Debit', cell: ({ row }) => formatMoney(row.original.debit) },
      { accessorKey: 'credit', header: 'Credit', cell: ({ row }) => formatMoney(row.original.credit) },
    ],
    []
  );

  const tbCols = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'accountCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.accountCode}</span> },
      { accessorKey: 'accountName', header: 'Account' },
      { accessorKey: 'debit', header: 'Debit', cell: ({ row }) => formatMoney(row.original.debit) },
      { accessorKey: 'credit', header: 'Credit', cell: ({ row }) => formatMoney(row.original.credit) },
      { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => formatMoney(row.original.balance) },
    ],
    []
  );

  function printTb() {
    const rows = tbRows
      .map(
        (r) =>
          `<tr><td>${r.accountCode || ''}</td><td>${r.accountName || ''}</td><td class="num">${formatMoney(r.debit)}</td><td class="num">${formatMoney(r.credit)}</td><td class="num">${formatMoney(r.balance)}</td></tr>`
      )
      .join('');
    printElement(
      'Trial Balance',
      `<table><thead><tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${rows}</tbody></table>`
    );
  }

  function csvTb() {
    downloadCsv('trial-balance.csv', [
      ['Code', 'Account', 'Debit', 'Credit', 'Balance'],
      ...tbRows.map((r) => [r.accountCode, r.accountName, r.debit, r.credit, r.balance]),
    ]);
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Accounting — COA / Journals / GL / TB" />
        <main className="p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                ['coa', 'Chart of Accounts'],
                ['journals', 'Journals'],
                ['gl', 'General Ledger'],
                ['tb', 'Trial Balance'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-brand/15 text-brand ring-1 ring-brand/30' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
            <div className="flex-1" />
            {tab === 'coa' && <AccCreateButton label="Create Account" onClick={() => setOpenAcc(true)} />}
            {tab === 'journals' && (
              <AccCreateButton
                label="Create Journal"
                onClick={() => {
                  setJeForm((f) => ({ ...f, journalNumber: `JE-${Date.now().toString().slice(-8)}` }));
                  setOpenJe(true);
                }}
              />
            )}
            {tab === 'tb' && (
              <div className="flex gap-2">
                <button type="button" onClick={printTb} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
                  <Printer size={16} /> Print
                </button>
                <button type="button" onClick={csvTb} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
                  <Download size={16} /> CSV
                </button>
              </div>
            )}
          </div>

          {tab === 'coa' && <RichDataTable columns={coaCols} data={accounts} />}
          {tab === 'journals' && <RichDataTable columns={jeCols} data={journals} />}
          {tab === 'gl' && <RichDataTable columns={glCols} data={glLines} />}
          {tab === 'tb' && <RichDataTable columns={tbCols} data={tbRows} />}
        </main>
      </div>

      <AccModal open={openAcc} onClose={() => setOpenAcc(false)} title="Create Ledger Account" icon={Plus}>
        <form onSubmit={onCreateAccount} className="space-y-3">
          <AccField label="Account code"><input className={accInputClass} value={accForm.accountCode} onChange={(e) => setAccForm({ ...accForm, accountCode: e.target.value })} required /></AccField>
          <AccField label="Account name"><input className={accInputClass} value={accForm.accountName} onChange={(e) => setAccForm({ ...accForm, accountName: e.target.value })} required /></AccField>
          <AccField label="Type">
            <select className={accInputClass} value={accForm.accountType} onChange={(e) => setAccForm({ ...accForm, accountType: e.target.value })}>
              {['asset', 'liability', 'equity', 'revenue', 'expense', 'cost_of_goods_sold'].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </AccField>
          <AccField label="Normal balance">
            <select className={accInputClass} value={accForm.normalBalance} onChange={(e) => setAccForm({ ...accForm, normalBalance: e.target.value })}>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </AccField>
          <AccModalActions onCancel={() => setOpenAcc(false)} submitLabel="Create account" submitting={saving} />
        </form>
      </AccModal>

      <AccModal open={openJe} onClose={() => setOpenJe(false)} title="Create Journal Entry" icon={Plus} wide>
        <form onSubmit={onCreateJournal} className="space-y-3">
          <p className="text-xs text-muted-foreground">Double-entry: one debit and one credit for the same amount.</p>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Journal #"><input className={accInputClass} value={jeForm.journalNumber} onChange={(e) => setJeForm({ ...jeForm, journalNumber: e.target.value })} required /></AccField>
            <AccField label="Date"><input type="date" className={accInputClass} value={jeForm.entryDate} onChange={(e) => setJeForm({ ...jeForm, entryDate: e.target.value })} required /></AccField>
          </div>
          <AccField label="Fiscal period">
            <select className={accInputClass} value={jeForm.fiscalPeriodId} onChange={(e) => setJeForm({ ...jeForm, fiscalPeriodId: e.target.value })}>
              <option value="">Select…</option>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.periodName || p.name}</option>)}
            </select>
          </AccField>
          <AccField label="Description"><input className={accInputClass} value={jeForm.description} onChange={(e) => setJeForm({ ...jeForm, description: e.target.value })} /></AccField>
          <AccField label="Debit account">
            <select className={accInputClass} value={jeForm.debitAccountId} onChange={(e) => setJeForm({ ...jeForm, debitAccountId: e.target.value })} required>
              <option value="">Select…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.accountName}</option>)}
            </select>
          </AccField>
          <AccField label="Credit account">
            <select className={accInputClass} value={jeForm.creditAccountId} onChange={(e) => setJeForm({ ...jeForm, creditAccountId: e.target.value })} required>
              <option value="">Select…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.accountName}</option>)}
            </select>
          </AccField>
          <AccField label="Amount"><input type="number" step="0.01" className={accInputClass} value={jeForm.amount} onChange={(e) => setJeForm({ ...jeForm, amount: e.target.value })} required /></AccField>
          <AccModalActions onCancel={() => setOpenJe(false)} submitLabel="Create journal" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
