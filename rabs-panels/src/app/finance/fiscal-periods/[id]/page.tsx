'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { getFiscalPeriod, updateFiscalPeriod } from '@/lib/api';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, CalendarRange, Eye, Loader2, Lock, X } from 'lucide-react';
import { toast } from 'sonner';

/* eslint-disable @typescript-eslint/no-explicit-any */

type PeriodJournal = {
  id: string;
  journalNumber: string;
  entryDate: string;
  entryType: string;
  sourceType: string;
  status: 'draft' | 'posted' | 'voided';
  description?: string | null;
  reference?: string | null;
  totalDebit: number;
  totalCredit: number;
};

const gbp = (n: number) => n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
const cap = (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

const statusClass: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  posted: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  voided: 'bg-red-500/10 text-red-600 border-red-500/20'
};

export default function FiscalPeriodDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [period, setPeriod] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const id = params?.id;
    if (!id) return;
    setLoading(true);
    try {
      const res = await getFiscalPeriod(id);
      setPeriod(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load fiscal period');
      setPeriod(null);
    } finally {
      setLoading(false);
    }
  }, [params?.id]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function onClose() {
    if (!period) return;
    setBusy(true);
    try {
      await updateFiscalPeriod(period.id, { isClosed: true });
      toast.success(`${period.periodName} closed`);
      setConfirmClose(false);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to close fiscal period');
    } finally {
      setBusy(false);
    }
  }

  const journals: PeriodJournal[] = period?.journals ?? [];
  const summary = period?.summary ?? {
    journalCount: 0, postedCount: 0, draftCount: 0, voidedCount: 0, postedDebit: 0, postedCredit: 0
  };
  const balanced = Math.abs(Number(summary.postedDebit) - Number(summary.postedCredit)) < 0.005;

  const columns = useMemo<ColumnDef<PeriodJournal>[]>(() => [
    {
      accessorKey: 'journalNumber',
      header: 'Journal Number',
      cell: ({ row }) => (
        <Link href={`/finance/journal-entries/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.journalNumber}
        </Link>
      )
    },
    { accessorKey: 'entryDate', header: 'Date', cell: ({ row }) => fmtDate(row.original.entryDate) },
    { accessorKey: 'entryType', header: 'Type', cell: ({ row }) => cap(row.original.entryType) },
    { accessorKey: 'sourceType', header: 'Source', cell: ({ row }) => cap(row.original.sourceType) },
    { accessorKey: 'description', header: 'Description', cell: ({ row }) => row.original.description || '—' },
    {
      accessorKey: 'totalDebit',
      header: 'Debit',
      cell: ({ row }) => <span className="tabular-nums">{gbp(row.original.totalDebit)}</span>
    },
    {
      accessorKey: 'totalCredit',
      header: 'Credit',
      cell: ({ row }) => <span className="tabular-nums">{gbp(row.original.totalCredit)}</span>
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusClass[row.original.status] ?? ''}`}>
          {row.original.status}
        </span>
      )
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Link href={`/finance/journal-entries/${row.original.id}`} className="inline-flex rounded p-1.5 hover:bg-muted" title="View">
          <Eye size={16} />
        </Link>
      )
    }
  ], []);

  if (!hydrated || !hasAccess) return null;

  const closedByName = period?.closedBy
    ? [period.closedBy.firstName, period.closedBy.lastName].filter(Boolean).join(' ') || period.closedBy.email
    : null;
  const details: Array<[string, React.ReactNode]> = period
    ? [
        ['Type', cap(period.periodType)],
        ['Start date', fmtDate(period.startDate)],
        ['End date', fmtDate(period.endDate)],
        ['Fiscal year', period.fiscalYear],
        ['Closed', period.isClosed ? `${fmtDate(period.closedAt)}${closedByName ? ` by ${closedByName}` : ''}` : 'Not closed']
      ]
    : [];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Fiscal Period" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="flex w-full flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/finance/fiscal-periods"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to fiscal periods
              </Link>
              {period && !period.isClosed && (
                <button
                  onClick={() => setConfirmClose(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Lock className="h-4 w-4" />
                  Close period
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading fiscal period…
              </div>
            ) : !period ? (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
                Fiscal period not found
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <h1 className="flex items-center gap-3 text-2xl font-bold">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <CalendarRange size={24} />
                      </div>
                      {period.periodName}
                    </h1>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        period.isClosed
                          ? 'bg-muted text-muted-foreground border-border'
                          : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      }`}
                    >
                      {period.isClosed ? 'Closed' : 'Open'}
                    </span>
                  </div>
                  <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    {details.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="mt-0.5 font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {period.isClosed && (
                    <p className="mt-4 text-xs text-muted-foreground">
                      This period is locked: no journals can be created or moved into it. Closed periods cannot be reopened.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  {[
                    ['Journals', String(summary.journalCount)],
                    ['Posted', String(summary.postedCount)],
                    ['Drafts', String(summary.draftCount)],
                    ['Posted debits', gbp(Number(summary.postedDebit))],
                    ['Posted credits', gbp(Number(summary.postedCredit))]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
                {!balanced && (
                  <p className="text-sm text-red-600">
                    Posted debits and credits in this period differ by {gbp(Math.abs(Number(summary.postedDebit) - Number(summary.postedCredit)))}.
                  </p>
                )}

                <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
                  <div className="px-4 pt-4">
                    <h2 className="text-lg font-semibold">Journals in this period</h2>
                  </div>
                  <RichDataTable columns={columns} data={journals} searchPlaceholder="Search journals…" />
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {confirmClose && period && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Close {period.periodName}?</h2>
              <button onClick={() => setConfirmClose(false)} className="rounded p-1 hover:bg-muted" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Closing locks the period: no new journals can be booked into it and it cannot be edited, deleted or reopened.
            </p>
            {summary.draftCount > 0 && (
              <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
                {summary.draftCount} draft journal{summary.draftCount === 1 ? '' : 's'} in this period will stay unposted. Post or delete them first if they should count.
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => void onClose()}
                disabled={busy}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? 'Closing…' : 'Close period'}
              </button>
              <button onClick={() => setConfirmClose(false)} className="rounded-lg border border-border px-4 py-2 hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
