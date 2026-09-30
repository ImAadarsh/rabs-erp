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
import { listAccInvoices, createAccInvoice, listVatCodes } from '@/lib/accounting-api';
import { listCustomers } from '@/lib/api';
import { formatMoney, formatDate, statusBadgeClass, accApiError } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass, MtdBanner } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingSalesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vatCodes, setVatCodes] = useState<any[]>([]);
  const orgId = session?.user?.organizationId;

  const [form, setForm] = useState({
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    customerId: '',
    customerName: '',
    currency: 'GBP',
    description: '',
    netAmount: '',
    vatCode: 'S',
    vatAmount: '',
    total: '',
  });

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [inv, codes, cust] = await Promise.all([
        listAccInvoices(orgId),
        listVatCodes(orgId),
        listCustomers({ organizationId: orgId, limit: 200 }).catch(() => ({ data: [] })),
      ]);
      setRows(inv.data || []);
      setVatCodes(codes.data || []);
      setCustomers(cust.data || []);
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load invoices'));
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
    if (!form.invoiceNumber || !form.netAmount) {
      toast.error('Invoice number and net amount required');
      return;
    }
    if (!form.customerId) {
      toast.error('Select a customer (required for finance invoices)');
      return;
    }
    setSaving(true);
    try {
      const net = Number(form.netAmount);
      const vat = Number(form.vatAmount || 0);
      const rate = Number((vatCodes.find((c) => c.code === form.vatCode) || { rate: 20 }).rate) || 0;
      await createAccInvoice({
        organizationId: orgId,
        customerId: form.customerId,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || undefined,
        currency: form.currency,
        customerName: form.customerName || undefined,
        status: 'draft',
        notes: form.description || undefined,
        lines: [
          {
            description: form.description || 'Sales invoice',
            quantity: 1,
            unitPrice: net,
            taxRate: rate,
            taxCode: form.vatCode,
            taxAmount: vat,
          },
        ],
      });
      toast.success('Invoice created');
      setOpen(false);
      setForm({
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().slice(0, 10),
        dueDate: '',
        customerId: '',
        customerName: '',
        currency: 'GBP',
        description: '',
        netAmount: '',
        vatCode: 'S',
        vatAmount: '',
        total: '',
      });
      await load();
    } catch (err) {
      toast.error(accApiError(err, 'Failed to create invoice'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: 'Invoice #',
        cell: ({ row }) => (
          <Link href={`/finance/invoices/${row.original.id}`} className="font-mono text-xs text-brand hover:underline">
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: ({ row }) =>
          row.original.customerName ||
          row.original.customer?.companyName ||
          [row.original.customer?.firstName, row.original.customer?.lastName].filter(Boolean).join(' ') ||
          '—',
      },
      {
        accessorKey: 'invoiceDate',
        header: 'Date',
        cell: ({ row }) => formatDate(row.original.invoiceDate),
      },
      {
        accessorKey: 'dueDate',
        header: 'Due',
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => formatMoney(row.original.total, row.original.currency || 'GBP'),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{row.original.status}</span>,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link href={`/finance/invoices/${row.original.id}`} className="text-muted-foreground hover:text-foreground">
            <Eye size={16} />
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
        <Header title="Sales / Invoicing" />
        <main className="p-6 md:p-8 space-y-4">
          <MtdBanner>VAT on invoices uses UK VAT codes. MTD submission is export-only until HMRC credentials are connected.</MtdBanner>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">Customer invoices, VAT lines, and payments. Open an invoice to print.</p>
            <AccCreateButton
              label="Create Invoice"
              onClick={() => {
                setForm((f) => ({
                  ...f,
                  invoiceNumber: `INV-${Date.now().toString().slice(-8)}`,
                }));
                setOpen(true);
              }}
            />
          </div>
          <RichDataTable
            columns={columns}
            data={rows}
          />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Create Invoice" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AccField label="Invoice number">
              <input className={accInputClass} value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} required />
            </AccField>
            <AccField label="Customer">
              <select
                className={accInputClass}
                value={form.customerId}
                onChange={(e) => {
                  const customerId = e.target.value;
                  const c = customers.find((x) => String(x.id) === customerId);
                  const customerName =
                    c?.companyName || [c?.firstName, c?.lastName].filter(Boolean).join(' ') || c?.email || '';
                  setForm({ ...form, customerId, customerName });
                }}
                required
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || c.id}
                  </option>
                ))}
              </select>
            </AccField>
            <AccField label="Invoice date">
              <input type="date" className={accInputClass} value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} required />
            </AccField>
            <AccField label="Due date">
              <input type="date" className={accInputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </AccField>
            <AccField label="Net amount (ex VAT)">
              <input
                type="number"
                step="0.01"
                className={accInputClass}
                value={form.netAmount}
                onChange={(e) => {
                  const netAmount = e.target.value;
                  const calc = recalc(netAmount, form.vatCode);
                  setForm({ ...form, netAmount, ...calc });
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
                  const calc = recalc(form.netAmount, vatCode);
                  setForm({ ...form, vatCode, ...calc });
                }}
              >
                {vatCodes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </AccField>
            <AccField label="VAT amount">
              <input type="number" step="0.01" className={accInputClass} value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} />
            </AccField>
            <AccField label="Gross total">
              <input type="number" step="0.01" className={accInputClass} value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
            </AccField>
          </div>
          <AccField label="Description">
            <input className={accInputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </AccField>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Create invoice" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
