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
  listAccBankAccounts,
  createAccBankAccount,
  listAccBankTransactions,
  createAccBankTransaction,
  importBankCsv,
} from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass, accTextareaClass } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingBankingPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [tab, setTab] = useState<'accounts' | 'transactions'>('accounts');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAcc, setOpenAcc] = useState(false);
  const [openTxn, setOpenTxn] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;

  const [accForm, setAccForm] = useState({
    accountName: '',
    accountNumber: '',
    sortCode: '',
    bankName: '',
    currency: 'GBP',
    openingBalance: '0',
  });
  const [txnForm, setTxnForm] = useState({
    bankAccountId: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    type: 'credit' as 'credit' | 'debit',
  });
  const [csvForm, setCsvForm] = useState({ bankAccountId: '', csv: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        listAccBankAccounts(orgId),
        listAccBankTransactions(orgId),
      ]);
      setAccounts(a.data || []);
      setTxns(t.data || []);
      if ((a.data || [])[0] && !txnForm.bankAccountId) {
        setTxnForm((f) => ({ ...f, bankAccountId: a.data[0].id }));
        setCsvForm((f) => ({ ...f, bankAccountId: a.data[0].id }));
      }
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load banking'));
    } finally {
      setLoading(false);
    }
  }, [orgId, txnForm.bankAccountId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (hasAccess) load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function onCreateAcc(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await createAccBankAccount({
        organizationId: orgId,
        accountName: accForm.accountName,
        accountNumber: accForm.accountNumber || undefined,
        sortCode: accForm.sortCode || undefined,
        bankName: accForm.bankName || undefined,
        currency: accForm.currency,
        openingBalance: Number(accForm.openingBalance || 0),
        currentBalance: Number(accForm.openingBalance || 0),
        status: 'active',
      });
      toast.success('Bank account created');
      setOpenAcc(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onCreateTxn(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const amt = Number(txnForm.amount);
      await createAccBankTransaction({
        organizationId: orgId,
        bankAccountId: txnForm.bankAccountId,
        transactionDate: txnForm.transactionDate,
        description: txnForm.description,
        amount: txnForm.type === 'debit' ? -Math.abs(amt) : Math.abs(amt),
        status: 'unmatched',
      });
      toast.success('Transaction added');
      setOpenTxn(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onImport(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await importBankCsv({ organizationId: orgId, bankAccountId: csvForm.bankAccountId, csv: csvForm.csv });
      toast.success('CSV imported');
      setOpenImport(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err, 'CSV import needs /api/accounting'));
    } finally {
      setSaving(false);
    }
  }

  const accCols = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'accountName', header: 'Account', cell: ({ row }) => <span className="font-medium">{row.original.accountName || row.original.name}</span> },
      { accessorKey: 'bankName', header: 'Bank', cell: ({ row }) => row.original.bankName || '—' },
      { accessorKey: 'sortCode', header: 'Sort code', cell: ({ row }) => row.original.sortCode || '—' },
      { accessorKey: 'accountNumber', header: 'Account no.', cell: ({ row }) => <span className="font-mono text-xs">{row.original.accountNumber || '—'}</span> },
      {
        accessorKey: 'currentBalance',
        header: 'Balance',
        cell: ({ row }) => formatMoney(row.original.currentBalance ?? row.original.balance, row.original.currency || 'GBP'),
      },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={statusBadgeClass(row.original.status || 'active')}>{row.original.status || 'active'}</span> },
    ],
    []
  );

  const txnCols = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'transactionDate', header: 'Date', cell: ({ row }) => formatDate(row.original.transactionDate || row.original.date) },
      { accessorKey: 'description', header: 'Description' },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => {
          const n = Number(row.original.amount || 0);
          return <span className={n < 0 ? 'text-red-600' : 'text-emerald-600'}>{formatMoney(n)}</span>;
        },
      },
      { accessorKey: 'status', header: 'Match', cell: ({ row }) => <span className={statusBadgeClass(row.original.status || row.original.matchStatus || 'unmatched')}>{row.original.status || row.original.matchStatus || 'unmatched'}</span> },
    ],
    []
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Banking" />
        <main className="p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {(['accounts', 'transactions'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-brand/15 text-brand ring-1 ring-brand/30' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t}
              </button>
            ))}
            <div className="flex-1" />
            {tab === 'accounts' ? (
              <AccCreateButton label="Create Account" onClick={() => setOpenAcc(true)} />
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpenImport(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <Upload size={16} /> Import CSV
                </button>
                <AccCreateButton label="Add Transaction" onClick={() => setOpenTxn(true)} />
              </div>
            )}
          </div>

          {tab === 'accounts' ? (
            <RichDataTable columns={accCols} data={accounts} />
          ) : (
            <RichDataTable columns={txnCols} data={txns} />
          )}
        </main>
      </div>

      <AccModal open={openAcc} onClose={() => setOpenAcc(false)} title="Create Bank Account" icon={Plus}>
        <form onSubmit={onCreateAcc} className="space-y-3">
          <AccField label="Account name"><input className={accInputClass} value={accForm.accountName} onChange={(e) => setAccForm({ ...accForm, accountName: e.target.value })} required /></AccField>
          <AccField label="Bank name"><input className={accInputClass} value={accForm.bankName} onChange={(e) => setAccForm({ ...accForm, bankName: e.target.value })} /></AccField>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Sort code"><input className={accInputClass} value={accForm.sortCode} onChange={(e) => setAccForm({ ...accForm, sortCode: e.target.value })} placeholder="00-00-00" /></AccField>
            <AccField label="Account number"><input className={accInputClass} value={accForm.accountNumber} onChange={(e) => setAccForm({ ...accForm, accountNumber: e.target.value })} /></AccField>
          </div>
          <AccField label="Opening balance"><input type="number" step="0.01" className={accInputClass} value={accForm.openingBalance} onChange={(e) => setAccForm({ ...accForm, openingBalance: e.target.value })} /></AccField>
          <AccModalActions onCancel={() => setOpenAcc(false)} submitLabel="Create account" submitting={saving} />
        </form>
      </AccModal>

      <AccModal open={openTxn} onClose={() => setOpenTxn(false)} title="Add Transaction" icon={Plus}>
        <form onSubmit={onCreateTxn} className="space-y-3">
          <AccField label="Bank account">
            <select className={accInputClass} value={txnForm.bankAccountId} onChange={(e) => setTxnForm({ ...txnForm, bankAccountId: e.target.value })} required>
              <option value="">Select…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName || a.name}</option>)}
            </select>
          </AccField>
          <AccField label="Date"><input type="date" className={accInputClass} value={txnForm.transactionDate} onChange={(e) => setTxnForm({ ...txnForm, transactionDate: e.target.value })} required /></AccField>
          <AccField label="Description"><input className={accInputClass} value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} required /></AccField>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Type">
              <select className={accInputClass} value={txnForm.type} onChange={(e) => setTxnForm({ ...txnForm, type: e.target.value as any })}>
                <option value="credit">Money in</option>
                <option value="debit">Money out</option>
              </select>
            </AccField>
            <AccField label="Amount"><input type="number" step="0.01" className={accInputClass} value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} required /></AccField>
          </div>
          <AccModalActions onCancel={() => setOpenTxn(false)} submitLabel="Add transaction" submitting={saving} />
        </form>
      </AccModal>

      <AccModal open={openImport} onClose={() => setOpenImport(false)} title="Import bank CSV" icon={Upload} wide>
        <form onSubmit={onImport} className="space-y-3">
          <AccField label="Bank account">
            <select className={accInputClass} value={csvForm.bankAccountId} onChange={(e) => setCsvForm({ ...csvForm, bankAccountId: e.target.value })} required>
              <option value="">Select…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName || a.name}</option>)}
            </select>
          </AccField>
          <AccField label="CSV" hint="date,description,amount — one row per line">
            <textarea className={accTextareaClass} value={csvForm.csv} onChange={(e) => setCsvForm({ ...csvForm, csv: e.target.value })} rows={8} required />
          </AccField>
          <AccModalActions onCancel={() => setOpenImport(false)} submitLabel="Import" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
