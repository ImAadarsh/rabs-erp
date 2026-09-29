/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listAccAuditTrail } from '@/lib/accounting-api';
import { formatDate, accApiError } from '@/lib/accounting-utils';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

export default function AccountingAuditTrailPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await listAccAuditTrail(orgId);
      setRows(res.data || []);
      setNote((res as any)._sourceNote || '');
    } catch (e) {
      toast.error(accApiError(e));
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

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'When',
        cell: ({ row }) => formatDate(row.original.createdAt || row.original.timestamp),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => row.original.action || row.original.event || '—',
      },
      {
        accessorKey: 'resource',
        header: 'Resource',
        cell: ({ row }) => row.original.resource || row.original.entityType || row.original.entity || '—',
      },
      {
        accessorKey: 'resourceId',
        header: 'ID',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.resourceId || row.original.entityId || '—'}</span>
        ),
      },
      {
        accessorKey: 'actor',
        header: 'User',
        cell: ({ row }) =>
          row.original.user?.email ||
          row.original.actorEmail ||
          row.original.userId ||
          '—',
      },
    ],
    []
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Audit Trail" />
        <main className="p-6 md:p-8 space-y-4">
          <p className="text-sm text-muted-foreground">
            Append-only create / update / post / approve events for accounting entities.
            {note ? ` ${note}` : ''}
          </p>
          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search audit…" />
        </main>
      </div>
    </div>
  );
}
