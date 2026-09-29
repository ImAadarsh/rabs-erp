/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listAccPayrollRuns, postPayrollToLedger } from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError } from '@/lib/accounting-utils';
import { MtdBanner } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingPayrollPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT', 'HR_MANAGER', 'HR_ADMIN']);
  const [rows, setRows] = useState<any[]>([]);
  const [posting, setPosting] = useState<string | null>(null);
  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await listAccPayrollRuns(orgId);
      setRows(res.data || []);
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load payroll runs'));
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

  async function onPost(id: string) {
    setPosting(id);
    try {
      const res = await postPayrollToLedger(id);
      toast.success((res as any).message || 'Payroll posted to ledger');
      await load();
    } catch (err) {
      toast.error(accApiError(err, 'Failed to post payroll'));
    } finally {
      setPosting(null);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'payrollNumber',
        header: 'Run #',
        cell: ({ row }) => <span className="font-mono text-xs text-brand">{row.original.payrollNumber}</span>,
      },
      {
        accessorKey: 'period',
        header: 'Period',
        cell: ({ row }) => `${formatDate(row.original.periodStart)} – ${formatDate(row.original.periodEnd)}`,
      },
      {
        accessorKey: 'paymentDate',
        header: 'Pay date',
        cell: ({ row }) => formatDate(row.original.paymentDate),
      },
      {
        accessorKey: 'totalGross',
        header: 'Gross',
        cell: ({ row }) => formatMoney(row.original.totalGross, row.original.currency || 'GBP'),
      },
      {
        accessorKey: 'totalNet',
        header: 'Net',
        cell: ({ row }) => formatMoney(row.original.totalNet, row.original.currency || 'GBP'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{row.original.status}</span>,
      },
      {
        accessorKey: 'postedToLedger',
        header: 'Ledger',
        cell: ({ row }) =>
          row.original.postedToLedger ? (
            <span className={statusBadgeClass('posted')}>Posted</span>
          ) : (
            <span className={statusBadgeClass('draft')}>Not posted</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.postedToLedger ? (
            <span className="text-xs text-muted-foreground">
              {row.original.journalEntry?.journalNumber || 'Journal linked'}
            </span>
          ) : (
            <button
              type="button"
              disabled={posting === row.original.id}
              onClick={() => onPost(row.original.id)}
              className="text-xs font-semibold rounded-lg bg-brand text-white px-2.5 py-1.5 hover:bg-brand-600 disabled:opacity-60"
            >
              {posting === row.original.id ? 'Posting…' : 'Post to ledger'}
            </button>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posting]
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Payroll → Ledger" />
        <main className="p-6 md:p-8 space-y-4">
          <MtdBanner>
            PAYE/NI figures come from HR illustrative stubs — not HMRC-certified RTI. Posting creates a double-entry journal (expense vs PAYE/NI/net control).
          </MtdBanner>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Runs are managed in HR. Use Post to ledger here to book wages into the GL.
            </p>
            <Link
              href="/hr/payroll"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
            >
              <ExternalLink size={16} /> Open HR Payroll
            </Link>
          </div>

          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search payroll runs…" />
        </main>
      </div>
    </div>
  );
}
