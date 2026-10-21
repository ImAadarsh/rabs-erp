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
import { listAccBills, createAccBill, listVatCodes } from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, accFieldErrors, vatRateFraction } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass, MtdBanner } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingPurchasesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stub, setStub] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vatCodes, setVatCodes] = useState<any[]>([]);
  const orgId = session?.user?.organizationId;

  const emptyForm = () => ({
    billNumber: `BILL-${Date.now().toString().slice(-8)}`,
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    supplierName: '',
    currency: 'GBP',
    description: '',
    netAmount: '',
    vatCode: 'S',
    vatAmount: '',
    total: '',
  });
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [bills, codes] = await Promise.all([listAccBills(orgId), listVatCodes(orgId)]);
      setRows(bills.data || []);
      setStub(Boolean((bills as any)._stub));
      setVatCodes(codes.data || []);
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load bills'));
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

  function recalc(netStr: string, code: string) {
    const net = Number(netStr) || 0;
    const rate = vatRateFraction((vatCodes.find((c) => c.code === code) || { rate: 0 }).rate);
    const vat = Math.round(net * rate * 100) / 100;
    // Reverse charge: the buyer self-accounts the VAT, so it is not owed to the supplier.
    const payableVat = code === 'RC' ? 0 : vat;
    return { vatAmount: vat.toFixed(2), total: (net + payableVat).toFixed(2) };
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const next: Record<string, string> = {};
    if (!form.billNumber.trim()) next.billNumber = 'Bill number is required';
    if (!form.supplierName.trim()) next.supplierName = 'Supplier is required';
    if (!form.billDate) next.billDate = 'Bill date is required';
    if (!(Number(form.netAmount) > 0)) next.subtotal = 'Net amount must be greater than 0';
    if (form.dueDate && form.billDate && form.dueDate < form.billDate) next.dueDate = 'Due date cannot be before bill date';
    setErrors(next);
    if (Object.keys(next).length) return;
    const vatCodeId = vatCodes.find((c) => c.code === form.vatCode)?.id;
    setSaving(true);
    try {
      const created: any = await createAccBill({
        organizationId: orgId,
        billNumber: form.billNumber.trim(),
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        supplierName: form.supplierName.trim(),
        currency: form.currency,
        description: form.description.trim() || undefined,
        subtotal: Number(form.netAmount),
        vatCodeId: vatCodeId ? String(vatCodeId) : undefined,
      });
      const newId = created?.data?.id;
      toast.success('Bill created', newId ? { action: { label: 'View', onClick: () => router.push(`/accounting/purchases/${newId}`) } } : undefined);
      setOpen(false);
      await load();
    } catch (err) {
      setErrors(accFieldErrors(err));
      toast.error(accApiError(err, 'Failed to create bill'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'billNumber',
        header: 'Bill #',
        cell: ({ row }) => (
          <Link href={`/accounting/purchases/${row.original.id}`} className="font-mono text-xs text-brand hover:underline">
            {row.original.billNumber || row.original.reference}
          </Link>
        ),
      },
      { accessorKey: 'supplierName', header: 'Supplier', cell: ({ row }) => row.original.supplierName || row.original.supplier?.name || '—' },
      { accessorKey: 'billDate', header: 'Date', cell: ({ row }) => formatDate(row.original.billDate || row.original.invoiceDate) },
      { accessorKey: 'dueDate', header: 'Due', cell: ({ row }) => formatDate(row.original.dueDate) },
      { accessorKey: 'total', header: 'Total', cell: ({ row }) => formatMoney(row.original.total, row.original.currency || 'GBP') },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{String(row.original.status || 'draft').replace(/_/g, ' ')}</span> },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Link href={`/accounting/purchases/${row.original.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" title="View bill">
            <Eye size={14} /> View
          </Link>
        ),
      },
    ],
    []
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Purchases / Bills" />
        <main className="p-6 md:p-8 space-y-4">
          <MtdBanner />
          {stub ? (
            <p className="text-sm text-amber-700 dark:text-amber-200 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              Supplier bills API not deployed yet. Create will call <code className="font-mono text-xs">POST /api/accounting/bills</code> when live.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">Supplier bills, input VAT, and AP ageing. Click a bill number to view, approve, post, pay or attach documents.</p>
            <AccCreateButton
              label="Create Bill"
              onClick={() => {
                setForm(emptyForm());
                setErrors({});
                setOpen(true);
              }}
            />
          </div>
          <RichDataTable columns={columns} data={rows} />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Create Bill" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AccField label="Bill number" error={errors.billNumber}>
              <input className={accInputClass} value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} required />
            </AccField>
            <AccField label="Supplier" error={errors.supplierName || errors.supplierId} hint="Existing supplier name, or a new one is created">
              <input className={accInputClass} value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} required />
            </AccField>
            <AccField label="Bill date" error={errors.billDate}>
              <input type="date" className={accInputClass} value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} required />
            </AccField>
            <AccField label="Due date" error={errors.dueDate}>
              <input type="date" className={accInputClass} value={form.dueDate} min={form.billDate || undefined} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </AccField>
            <AccField label="Net amount" error={errors.subtotal}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={accInputClass}
                value={form.netAmount}
                onChange={(e) => {
                  const netAmount = e.target.value;
                  setForm({ ...form, netAmount, ...recalc(netAmount, form.vatCode) });
                }}
                required
              />
            </AccField>
            <AccField label="VAT code" error={errors.vatCodeId}>
              <select
                className={accInputClass}
                value={form.vatCode}
                onChange={(e) => {
                  const vatCode = e.target.value;
                  setForm({ ...form, vatCode, ...recalc(form.netAmount, vatCode) });
                }}
              >
                <option value="">No VAT</option>
                {vatCodes.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </AccField>
            <AccField label="VAT" hint="Calculated from VAT code">
              <input type="number" className={accInputClass} value={form.vatAmount} readOnly tabIndex={-1} />
            </AccField>
            <AccField label="Total" hint={form.vatCode === 'RC' ? 'Reverse charge: VAT is not paid to the supplier' : 'Net + VAT'}>
              <input type="number" className={accInputClass} value={form.total} readOnly tabIndex={-1} />
            </AccField>
          </div>
          <AccField label="Description">
            <input className={accInputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </AccField>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Create bill" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
