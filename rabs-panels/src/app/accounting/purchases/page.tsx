/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listAccBills, createAccBill, listVatCodes } from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass, MtdBanner } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
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

  const [form, setForm] = useState({
    billNumber: '',
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
    const rate = Number((vatCodes.find((c) => c.code === code) || { rate: 20 }).rate) || 0;
    const vat = Math.round(net * rate) / 100;
    return { vatAmount: vat.toFixed(2), total: (net + vat).toFixed(2) };
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      await createAccBill({
        organizationId: orgId,
        billNumber: form.billNumber,
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        supplierName: form.supplierName,
        currency: form.currency,
        description: form.description,
        subtotal: Number(form.netAmount),
        taxTotal: Number(form.vatAmount || 0),
        total: Number(form.total || 0),
        vatCode: form.vatCode,
        status: 'draft',
      });
      toast.success('Bill created');
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err, 'Failed to create bill — needs /api/accounting'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'billNumber', header: 'Bill #', cell: ({ row }) => <span className="font-mono text-xs">{row.original.billNumber || row.original.reference}</span> },
      { accessorKey: 'supplierName', header: 'Supplier', cell: ({ row }) => row.original.supplierName || row.original.supplier?.name || '—' },
      { accessorKey: 'billDate', header: 'Date', cell: ({ row }) => formatDate(row.original.billDate || row.original.invoiceDate) },
      { accessorKey: 'dueDate', header: 'Due', cell: ({ row }) => formatDate(row.original.dueDate) },
      { accessorKey: 'total', header: 'Total', cell: ({ row }) => formatMoney(row.original.total, row.original.currency || 'GBP') },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{row.original.status || 'draft'}</span> },
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
            <p className="text-sm text-muted-foreground">Supplier bills, input VAT, and AP ageing.</p>
            <AccCreateButton
              label="Create Bill"
              onClick={() => {
                setForm((f) => ({ ...f, billNumber: `BILL-${Date.now().toString().slice(-8)}` }));
                setOpen(true);
              }}
            />
          </div>
          <RichDataTable columns={columns} data={rows} />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Create Bill" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AccField label="Bill number">
              <input className={accInputClass} value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} required />
            </AccField>
            <AccField label="Supplier">
              <input className={accInputClass} value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} required />
            </AccField>
            <AccField label="Bill date">
              <input type="date" className={accInputClass} value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} required />
            </AccField>
            <AccField label="Due date">
              <input type="date" className={accInputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </AccField>
            <AccField label="Net amount">
              <input
                type="number"
                step="0.01"
                className={accInputClass}
                value={form.netAmount}
                onChange={(e) => {
                  const netAmount = e.target.value;
                  setForm({ ...form, netAmount, ...recalc(netAmount, form.vatCode) });
                }}
                required
              />
            </AccField>
            <AccField label="VAT code">
              <select
                className={accInputClass}
                value={form.vatCode}
                onChange={(e) => {
                  const vatCode = e.target.value;
                  setForm({ ...form, vatCode, ...recalc(form.netAmount, vatCode) });
                }}
              >
                {vatCodes.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </AccField>
            <AccField label="VAT">
              <input type="number" step="0.01" className={accInputClass} value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} />
            </AccField>
            <AccField label="Total">
              <input type="number" step="0.01" className={accInputClass} value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
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
