/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listAccExpenses, createAccExpense, approveAccExpense } from '@/lib/accounting-api';
import { listEmployees } from '@/lib/api';
import { formatMoney, formatDate, statusBadgeClass, accApiError } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingExpensesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [stub, setStub] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;
  const [form, setForm] = useState({
    employeeId: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    category: 'travel',
    description: '',
    amount: '',
    vatAmount: '0',
    receiptUrl: '',
  });

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [ex, emp] = await Promise.all([
        listAccExpenses(orgId),
        listEmployees({ organizationId: orgId }).catch(() => ({ data: [] })),
      ]);
      setRows(ex.data || []);
      setStub(Boolean((ex as any)._stub));
      setEmployees(emp.data || []);
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
      await createAccExpense({
        organizationId: orgId,
        employeeId: form.employeeId || undefined,
        expenseDate: form.expenseDate,
        category: form.category,
        description: form.description,
        amount: Number(form.amount),
        vatAmount: Number(form.vatAmount || 0),
        receiptUrl: form.receiptUrl || undefined,
        status: 'pending',
      });
      toast.success('Expense submitted');
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err, 'Expenses require /api/accounting'));
    } finally {
      setSaving(false);
    }
  }

  async function onApprove(id: string) {
    try {
      await approveAccExpense(id);
      toast.success('Expense approved');
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'expenseDate', header: 'Date', cell: ({ row }) => formatDate(row.original.expenseDate) },
      {
        accessorKey: 'employee',
        header: 'Employee',
        cell: ({ row }) =>
          row.original.employeeName ||
          [row.original.employee?.firstName, row.original.employee?.lastName].filter(Boolean).join(' ') ||
          '—',
      },
      { accessorKey: 'category', header: 'Category', cell: ({ row }) => <span className="capitalize">{row.original.category}</span> },
      { accessorKey: 'description', header: 'Description' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => formatMoney(row.original.amount) },
      {
        accessorKey: 'receiptUrl',
        header: 'Receipt',
        cell: ({ row }) =>
          row.original.receiptUrl ? (
            <a href={row.original.receiptUrl} target="_blank" rel="noreferrer" className="text-brand text-xs hover:underline">
              View
            </a>
          ) : (
            '—'
          ),
      },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{row.original.status}</span> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'pending' ? (
            <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => onApprove(row.original.id)}>
              Approve
            </button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Expenses" />
        <main className="p-6 md:p-8 space-y-4">
          {stub ? (
            <p className="text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-100">
              Expense API pending — create calls <code className="font-mono text-xs">POST /api/accounting/expenses</code>.
            </p>
          ) : null}
          <div className="flex justify-between items-center flex-wrap gap-3">
            <p className="text-sm text-muted-foreground">Employee expenses with receipt URL and approval.</p>
            <AccCreateButton label="Create Expense" onClick={() => setOpen(true)} />
          </div>
          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search expenses…" />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Create Expense" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-3">
          <AccField label="Employee">
            <select className={accInputClass} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {[e.firstName, e.lastName].filter(Boolean).join(' ') || e.employeeNumber}
                </option>
              ))}
            </select>
          </AccField>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Date"><input type="date" className={accInputClass} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} required /></AccField>
            <AccField label="Category">
              <select className={accInputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['travel', 'meals', 'office', 'mileage', 'other'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </AccField>
            <AccField label="Amount"><input type="number" step="0.01" className={accInputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></AccField>
            <AccField label="VAT"><input type="number" step="0.01" className={accInputClass} value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} /></AccField>
          </div>
          <AccField label="Description"><input className={accInputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></AccField>
          <AccField label="Receipt URL" hint="S3 or public URL"><input className={accInputClass} value={form.receiptUrl} onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })} placeholder="https://…" /></AccField>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Submit expense" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
