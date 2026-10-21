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
import {
  listAccDocuments,
  createAccDocument,
  listAccInvoices,
  listAccBills,
  listAccExpenses,
  listAccJournals,
} from '@/lib/accounting-api';
import { formatDate, formatMoney, accApiError, accFieldErrors } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass } from '@/components/accounting/acc-modal';
import { FileUploadField } from '@/components/file-upload-field';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

type EntityType = 'invoice' | 'bill' | 'expense' | 'journal' | 'other';
type RefOption = { value: string; label: string };

const REF_LABEL: Record<EntityType, string> = {
  invoice: 'Invoice (number, order number or ID)',
  bill: 'Bill (number or ID)',
  expense: 'Expense (ID)',
  journal: 'Journal (number or ID)',
  other: 'Reference',
};

export default function AccountingDocumentsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refOptions, setRefOptions] = useState<Record<string, RefOption[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const orgId = session?.user?.organizationId;
  const emptyForm = () => ({
    entityType: 'invoice' as EntityType,
    entityId: '',
    entityRef: '',
    manualRef: false,
    documentName: '',
    documentUrls: [] as string[],
    documentUrl: '',
  });
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const type = q.get('entityType') as EntityType | null;
    if (type && type in REF_LABEL) {
      setForm({ ...emptyForm(), entityType: type, entityId: q.get('entityId') || '' });
      setErrors({});
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (!open || !orgId || form.entityType === 'other' || refOptions[form.entityType]) return;
    const type = form.entityType;
    (async () => {
      try {
        let opts: RefOption[] = [];
        if (type === 'invoice') {
          const res: any = await listAccInvoices(orgId, { limit: 500 });
          opts = (res.data || []).map((i: any) => ({
            value: String(i.id),
            label: [i.invoiceNumber, i.orderNumber || i.order?.orderNumber, i.customerName || i.customer?.name, formatMoney(i.total, i.currency || 'GBP')]
              .filter(Boolean)
              .join(' · '),
          }));
        } else if (type === 'bill') {
          const res: any = await listAccBills(orgId);
          opts = (res.data || []).map((b: any) => ({
            value: String(b.id),
            label: [b.billNumber, b.supplier?.name, formatMoney(b.total, b.currency || 'GBP')].filter(Boolean).join(' · '),
          }));
        } else if (type === 'expense') {
          const res: any = await listAccExpenses(orgId);
          opts = (res.data || []).map((x: any) => ({
            value: String(x.id),
            label: [`#${x.id}`, x.description, formatDate(x.expenseDate), formatMoney(x.amount)].filter(Boolean).join(' · '),
          }));
        } else if (type === 'journal') {
          const res: any = await listAccJournals(orgId);
          opts = (res.data || []).map((j: any) => ({
            value: String(j.id),
            label: [j.journalNumber, j.description, formatDate(j.entryDate)].filter(Boolean).join(' · '),
          }));
        }
        setRefOptions((m) => ({ ...m, [type]: opts }));
      } catch {
        setRefOptions((m) => ({ ...m, [type]: [] }));
      }
    })();
  }, [open, orgId, form.entityType, refOptions]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const documentUrl = form.documentUrls[0] || form.documentUrl.trim();
    const next: Record<string, string> = {};
    const useId = form.entityType !== 'other' && !form.manualRef;
    if (form.entityType !== 'other' && !(useId ? form.entityId : form.entityRef.trim())) next.entityRef = 'Choose the record to link this document to';
    if (!form.documentName.trim()) next.documentName = 'Document name is required';
    if (!documentUrl) next.documentUrl = 'Upload a file or enter a document URL';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await createAccDocument({
        organizationId: orgId,
        entityType: form.entityType,
        entityId: useId ? form.entityId : undefined,
        entityRef: form.entityType !== 'other' && !useId ? form.entityRef.trim() : undefined,
        documentName: form.documentName.trim(),
        documentUrl,
      });
      toast.success('Document linked');
      setOpen(false);
      if (window.location.search) router.replace('/accounting/documents');
      await load();
    } catch (err) {
      setErrors(accFieldErrors(err));
      toast.error(accApiError(err, 'Failed to link document'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'documentName',
        header: 'Name',
        cell: ({ row }) => (
          <Link href={`/accounting/documents/${row.original.id}`} className="font-medium text-brand hover:underline">
            {row.original.documentName || 'Document'}
          </Link>
        ),
      },
      { accessorKey: 'entityType', header: 'Linked to', cell: ({ row }) => <span className="capitalize">{row.original.entityType}</span> },
      {
        accessorKey: 'entityRef',
        header: 'Reference',
        cell: ({ row }) => {
          const ref = row.original.entityRef || row.original.entityId || '—';
          return row.original.entityHref ? (
            <Link href={row.original.entityHref} className="font-mono text-xs hover:underline">{ref}</Link>
          ) : (
            <span className="font-mono text-xs">{ref}</span>
          );
        },
      },
      {
        accessorKey: 'documentUrl',
        header: 'File',
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
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Link href={`/accounting/documents/${row.original.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            <Eye size={14} /> View
          </Link>
        ),
      },
    ],
    []
  );

  const options = refOptions[form.entityType] || [];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Documents" />
        <main className="p-6 md:p-8 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <p className="text-sm text-muted-foreground">Upload files and link them to invoices, bills, expenses and journals.</p>
            <AccCreateButton
              label="Upload / Link Document"
              onClick={() => {
                setForm(emptyForm());
                setErrors({});
                setOpen(true);
              }}
            />
          </div>
          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search documents…" />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Upload / Link Document" icon={Plus}>
        <form onSubmit={onCreate} className="space-y-3" noValidate>
          <AccField label="Entity type" error={errors.entityType}>
            <select
              className={accInputClass}
              value={form.entityType}
              onChange={(e) => {
                setForm({ ...form, entityType: e.target.value as EntityType, entityId: '', entityRef: '', manualRef: false });
                setErrors((prev) => ({ ...prev, entityRef: '' }));
              }}
            >
              {(['invoice', 'bill', 'expense', 'journal', 'other'] as const).map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </AccField>
          {form.entityType !== 'other' ? (
            <AccField
              label={REF_LABEL[form.entityType]}
              error={errors.entityRef}
              hint={
                refOptions[form.entityType] === undefined
                  ? 'Loading records…'
                  : form.manualRef
                    ? 'Type the exact number or ID'
                    : options.length
                      ? undefined
                      : 'No records found — type a number or ID instead'
              }
            >
              {form.manualRef || (refOptions[form.entityType] !== undefined && !options.length) ? (
                <input
                  className={accInputClass}
                  value={form.entityRef}
                  onChange={(e) => {
                    setForm({ ...form, entityRef: e.target.value, manualRef: true });
                    setErrors((prev) => ({ ...prev, entityRef: '' }));
                  }}
                  placeholder={form.entityType === 'invoice' ? 'INV-2026-00122' : ''}
                  autoComplete="off"
                />
              ) : (
                <select
                  className={accInputClass}
                  value={form.entityId}
                  onChange={(e) => {
                    setForm({ ...form, entityId: e.target.value });
                    setErrors((prev) => ({ ...prev, entityRef: '' }));
                  }}
                >
                  <option value="">Select…</option>
                  {form.entityId && !options.some((o) => o.value === form.entityId) ? (
                    <option value={form.entityId}>#{form.entityId}</option>
                  ) : null}
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
              {options.length ? (
                <button
                  type="button"
                  className="text-[11px] text-brand hover:underline"
                  onClick={() => {
                    setForm({ ...form, manualRef: !form.manualRef, entityRef: '', entityId: '' });
                    setErrors((prev) => ({ ...prev, entityRef: '' }));
                  }}
                >
                  {form.manualRef ? 'Pick from the list instead' : 'Not in the list? Type a number or ID'}
                </button>
              ) : null}
            </AccField>
          ) : null}
          <AccField label="Document name" error={errors.documentName}>
            <input className={accInputClass} value={form.documentName} onChange={(e) => setForm({ ...form, documentName: e.target.value })} required />
          </AccField>
          <AccField label="File" error={errors.documentUrl} hint="Upload a file, or paste an external link below">
            <FileUploadField
              value={form.documentUrls}
              onChange={(urls) => setForm((f) => ({ ...f, documentUrls: urls }))}
              folder="accounting/documents"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
            />
          </AccField>
          {!form.documentUrls.length ? (
            <AccField label="Or document URL">
              <input
                className={accInputClass}
                value={form.documentUrl}
                onChange={(e) => setForm({ ...form, documentUrl: e.target.value })}
                placeholder="https://…"
              />
            </AccField>
          ) : null}
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Save" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
