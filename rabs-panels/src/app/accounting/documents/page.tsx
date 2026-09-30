/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listAccDocuments, createAccDocument } from '@/lib/accounting-api';
import { formatDate, accApiError } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingDocumentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;
  const [form, setForm] = useState({
    entityType: 'invoice',
    entityId: '',
    documentName: '',
    documentUrl: '',
  });

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await listAccDocuments(orgId);
      setRows(res.data || []);
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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await createAccDocument({ organizationId: orgId, ...form });
      toast.success('Document linked');
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err, 'Documents require /api/accounting'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'documentName', header: 'Name' },
      { accessorKey: 'entityType', header: 'Linked to', cell: ({ row }) => <span className="capitalize">{row.original.entityType}</span> },
      { accessorKey: 'entityId', header: 'Entity ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.entityId || '—'}</span> },
      {
        accessorKey: 'documentUrl',
        header: 'URL',
        cell: ({ row }) =>
          row.original.documentUrl ? (
            <a href={row.original.documentUrl} target="_blank" rel="noreferrer" className="text-brand text-xs hover:underline">
              Open
            </a>
          ) : (
            '—'
          ),
      },
      { accessorKey: 'createdAt', header: 'Added', cell: ({ row }) => formatDate(row.original.createdAt) },
    ],
    []
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Documents" />
        <main className="p-6 md:p-8 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <p className="text-sm text-muted-foreground">Link S3 / file URLs to invoices, bills, and expenses.</p>
            <AccCreateButton label="Link Document" onClick={() => setOpen(true)} />
          </div>
          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search documents…" />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Link Document" icon={Plus}>
        <form onSubmit={onCreate} className="space-y-3">
          <AccField label="Entity type">
            <select className={accInputClass} value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
              {['invoice', 'bill', 'expense', 'journal', 'other'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </AccField>
          <AccField label="Entity ID"><input className={accInputClass} value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} /></AccField>
          <AccField label="Document name"><input className={accInputClass} value={form.documentName} onChange={(e) => setForm({ ...form, documentName: e.target.value })} required /></AccField>
          <AccField label="Document URL"><input className={accInputClass} value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} required placeholder="https://…" /></AccField>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Save link" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
