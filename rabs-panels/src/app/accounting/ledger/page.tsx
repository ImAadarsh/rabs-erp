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
  listLedgerAccountTypes,
  DEFAULT_LEDGER_ACCOUNT_TYPES,
  type LedgerAccountTypeOption,
} from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, printElement, printTable, downloadCsv, type PrintColumn } from '@/lib/accounting-utils';
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
  const [accountTypes, setAccountTypes] = useState<LedgerAccountTypeOption[]>(DEFAULT_LEDGER_ACCOUNT_TYPES);
  const [tbTotals, setTbTotals] = useState<{ debit: number; credit: number; from?: string; to?: string }>({ debit: 0, credit: 0 });
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
      listLedgerAccountTypes(orgId).then(setAccountTypes);
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
      const glRaw: any[] = Array.isArray(gl.data) ? gl.data : (gl.data as any)?.lines || [];
      setGlLines(
        glRaw.map((l) => ({
          entryDate: l.entryDate ?? l.entry_date,
          journalNumber: l.journalNumber ?? l.journal_number,
          accountCode: l.accountCode ?? l.account_code,
          accountName: l.accountName ?? l.account_name,
          description: l.description ?? l.line_desc ?? l.je_desc,
          debit: Number(l.debit ?? l.debit_amount ?? 0),
          credit: Number(l.credit ?? l.credit_amount ?? 0),
        }))
      );
      const tbData = (tb.data as any) || {};
      const tbList: any[] = tbData.accounts || tbData.rows || [];
      setTbRows(
        tbList.map((r) => ({
          ...r,
          debit: Number(r.debit || 0),
          credit: Number(r.credit || 0),
          net: Number(r.debit || 0) - Number(r.credit || 0),
        }))
      );
      setTbTotals({
        debit: Number(tbData.totalDebit ?? tbList.reduce((s, r) => s + Number(r.debit || 0), 0)),
        credit: Number(tbData.totalCredit ?? tbList.reduce((s, r) => s + Number(r.credit || 0), 0)),
        from: tbData.from,
        to: tbData.to,
      });
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

  const [postingId, setPostingId] = useState<string | null>(null);

  const onPost = useCallback(
    async (id: string) => {
      setPostingId(String(id));
      try {
        await postAccJournal(id);
        setJournals((prev) => prev.map((j) => (String(j.id) === String(id) ? { ...j, status: 'posted' } : j)));
        toast.success('Journal posted');
        await load();
      } catch (err) {
        toast.error(accApiError(err, 'Failed to post journal'));
      } finally {
        setPostingId(null);
      }
    },
    [load]
  );

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
            <button
              type="button"
              disabled={postingId !== null}
              className="text-xs font-semibold text-brand hover:underline disabled:opacity-50 disabled:no-underline"
              onClick={() => onPost(row.original.id)}
            >
              {postingId === String(row.original.id) ? 'Posting…' : 'Post'}
            </button>
          ) : null,
      },
    ],
    [onPost, postingId]
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
      { accessorKey: 'accountType', header: 'Type', cell: ({ row }) => <span className="capitalize">{String(row.original.accountType || '').replace(/_/g, ' ')}</span> },
      { accessorKey: 'debit', header: 'Debit', cell: ({ row }) => (row.original.debit ? formatMoney(row.original.debit) : '—') },
      { accessorKey: 'credit', header: 'Credit', cell: ({ row }) => (row.original.credit ? formatMoney(row.original.credit) : '—') },
      {
        accessorKey: 'net',
        header: 'Balance',
        cell: ({ row }) => {
          const n = Number(row.original.net || 0);
          return n === 0 ? '—' : `${formatMoney(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`;
        },
      },
    ],
    []
  );

  const tbDiff = Math.round((tbTotals.debit - tbTotals.credit) * 100) / 100;
  const tbPeriod = tbTotals.from && tbTotals.to ? `Period ${formatDate(tbTotals.from)} – ${formatDate(tbTotals.to)} · posted journals only` : undefined;
  const balanceLabel = (n: number) => (n === 0 ? '—' : `${formatMoney(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`);
  const typeLabel = (t: unknown) => String(t || '').replace(/_/g, ' ');

  /** One definition per tab drives both Print and CSV so they always match what is on screen. */
  function tabReport(): { title: string; file: string; subtitle?: string; columns: PrintColumn[]; rows: (string | number)[][]; csvRows: (string | number)[][]; footer: (string | number)[][]; csvFooter: (string | number)[][] } {
    if (tab === 'coa') {
      const rows = accounts.map((a) => [a.accountCode || '', a.accountName || '', typeLabel(a.accountType), a.normalBalance || '', a.isActive === false ? 'Inactive' : 'Active']);
      return { title: 'Chart of Accounts', file: 'chart-of-accounts.csv', columns: [{ label: 'Code' }, { label: 'Name' }, { label: 'Type' }, { label: 'Normal balance' }, { label: 'Status' }], rows, csvRows: rows, footer: [], csvFooter: [] };
    }
    if (tab === 'journals') {
      const rows = journals.map((j) => [j.journalNumber || '', formatDate(j.entryDate), j.description || '', j.sourceType || 'manual', j.status || '']);
      return { title: 'Journals', file: 'journals.csv', columns: [{ label: 'Journal #' }, { label: 'Date' }, { label: 'Description' }, { label: 'Source' }, { label: 'Status' }], rows, csvRows: rows, footer: [], csvFooter: [] };
    }
    if (tab === 'gl') {
      const dr = glLines.reduce((s, l) => s + l.debit, 0);
      const cr = glLines.reduce((s, l) => s + l.credit, 0);
      return {
        title: 'General Ledger',
        file: 'general-ledger.csv',
        columns: [{ label: 'Date' }, { label: 'Journal' }, { label: 'Code' }, { label: 'Account' }, { label: 'Description' }, { label: 'Debit', num: true }, { label: 'Credit', num: true }],
        rows: glLines.map((l) => [formatDate(l.entryDate), l.journalNumber || '', l.accountCode || '', l.accountName || '', l.description || '', formatMoney(l.debit), formatMoney(l.credit)]),
        csvRows: glLines.map((l) => [l.entryDate ? String(l.entryDate).slice(0, 10) : '', l.journalNumber || '', l.accountCode || '', l.accountName || '', l.description || '', l.debit, l.credit]),
        footer: [['', '', '', 'Total', '', formatMoney(dr), formatMoney(cr)]],
        csvFooter: [['', '', '', 'Total', '', Math.round(dr * 100) / 100, Math.round(cr * 100) / 100]],
      };
    }
    return {
      title: 'Trial Balance',
      file: 'trial-balance.csv',
      subtitle: tbPeriod,
      columns: [{ label: 'Code' }, { label: 'Account' }, { label: 'Type' }, { label: 'Debit', num: true }, { label: 'Credit', num: true }, { label: 'Balance', num: true }],
      rows: tbRows.map((r) => [r.accountCode || '', r.accountName || '', typeLabel(r.accountType), r.debit ? formatMoney(r.debit) : '—', r.credit ? formatMoney(r.credit) : '—', balanceLabel(r.net)]),
      csvRows: tbRows.map((r) => [r.accountCode || '', r.accountName || '', typeLabel(r.accountType), r.debit, r.credit, r.net]),
      footer: [
        ['', 'Total', '', formatMoney(tbTotals.debit), formatMoney(tbTotals.credit), ''],
        ['', tbDiff === 0 ? 'Balanced' : 'Difference (Dr − Cr)', '', '', '', tbDiff === 0 ? '—' : formatMoney(tbDiff)],
      ],
      csvFooter: [
        ['', 'Total', '', tbTotals.debit, tbTotals.credit, ''],
        ['', 'Difference (Dr - Cr)', '', '', '', tbDiff],
      ],
    };
  }

  function onPrint() {
    const r = tabReport();
    if (!r.rows.length) {
      toast.error(`Nothing to print — ${r.title} has no rows`);
      return;
    }
    printElement(r.title, printTable(r.columns, r.rows, r.footer), r.subtitle);
  }

  function onCsv() {
    const r = tabReport();
    downloadCsv(r.file, [r.columns.map((c) => c.label), ...r.csvRows, ...r.csvFooter]);
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
            <div className="flex gap-2">
              <button type="button" onClick={onPrint} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
                <Printer size={16} /> Print
              </button>
              <button type="button" onClick={onCsv} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
                <Download size={16} /> CSV
              </button>
            </div>
          </div>

          {tab === 'coa' && <RichDataTable columns={coaCols} data={accounts} />}
          {tab === 'journals' && <RichDataTable columns={jeCols} data={journals} />}
          {tab === 'gl' && <RichDataTable columns={glCols} data={glLines} />}
          {tab === 'tb' && (
            <>
              <RichDataTable columns={tbCols} data={tbRows} />
              <div className="flex flex-wrap items-center justify-end gap-6 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
                {tbTotals.from && tbTotals.to ? (
                  <span className="mr-auto text-muted-foreground">
                    Period {formatDate(tbTotals.from)} – {formatDate(tbTotals.to)} · posted journals only
                  </span>
                ) : null}
                <span>Total debit <strong className="tabular-nums">{formatMoney(tbTotals.debit)}</strong></span>
                <span>Total credit <strong className="tabular-nums">{formatMoney(tbTotals.credit)}</strong></span>
                <span className={statusBadgeClass(Math.abs(tbTotals.debit - tbTotals.credit) < 0.01 ? 'posted' : 'overdue')}>
                  {Math.abs(tbTotals.debit - tbTotals.credit) < 0.01 ? 'Balanced' : `Out by ${formatMoney(Math.abs(tbTotals.debit - tbTotals.credit))}`}
                </span>
              </div>
            </>
          )}
        </main>
      </div>

      <AccModal open={openAcc} onClose={() => setOpenAcc(false)} title="Create Ledger Account" icon={Plus}>
        <form onSubmit={onCreateAccount} className="space-y-3">
          <AccField label="Account code"><input className={accInputClass} value={accForm.accountCode} onChange={(e) => setAccForm({ ...accForm, accountCode: e.target.value })} required /></AccField>
          <AccField label="Account name"><input className={accInputClass} value={accForm.accountName} onChange={(e) => setAccForm({ ...accForm, accountName: e.target.value })} required /></AccField>
          <AccField label="Type">
            <select
              className={accInputClass}
              value={accForm.accountType}
              onChange={(e) => {
                const t = accountTypes.find((x) => x.value === e.target.value);
                setAccForm({ ...accForm, accountType: e.target.value, normalBalance: t?.normalBalance || accForm.normalBalance });
              }}
            >
              {accountTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
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
