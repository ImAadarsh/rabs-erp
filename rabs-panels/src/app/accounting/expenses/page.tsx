/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listAccExpenses, createAccExpense, approveAccExpense, rejectAccExpense, listAccExpenseEmployees } from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, accFieldErrors } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass } from '@/components/accounting/acc-modal';
import { FileUploadField } from '@/components/file-upload-field';
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
  const emptyForm = () => ({
    employeeId: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    category: 'travel',
    description: '',
    amount: '',
    vatAmount: '0',
    receiptUrls: [] as string[],
  });
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [ex, emp] = await Promise.all([
        listAccExpenses(orgId),
        listAccExpenseEmployees(orgId).catch((err) => {
          toast.error(accApiError(err, 'Could not load employees'));
          return { data: [] as any[] };
        }),
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
    const next: Record<string, string> = {};
    if (!form.expenseDate) next.expenseDate = 'Date is required';
    if (!(Number(form.amount) > 0)) next.amount = 'Amount must be greater than 0';
    if (Number(form.vatAmount || 0) < 0) next.taxAmount = 'VAT cannot be negative';
    if (Number(form.vatAmount || 0) > Number(form.amount || 0)) next.taxAmount = 'VAT cannot exceed the amount';
    if (!form.description.trim()) next.description = 'Description is required';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await createAccExpense({
        organizationId: orgId,
        employeeId: form.employeeId || undefined,
        expenseDate: form.expenseDate,
        category: form.category,
        description: form.description.trim(),
        amount: Number(form.amount),
        taxAmount: Number(form.vatAmount || 0),
        receiptUrl: form.receiptUrls[0] || undefined,
      });
      toast.success('Expense created');
      setOpen(false);
      await load();
    } catch (err) {
      setErrors(accFieldErrors(err));
      toast.error(accApiError(err, 'Failed to create expense'));
    } finally {
      setSaving(false);
    }
  }

  const [pending, setPending] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);

  const onStatusAction = useCallback(
    async (row: any, action: 'approve' | 'reject') => {
      let reason: string | undefined;
      if (action === 'reject') {
        const input = window.prompt(`Reject expense "${row.description}"? Optional reason:`, '');
        if (input === null) return;
        reason = input.trim() || undefined;
      }
      const id = String(row.id);
      setPending({ id, action });
      try {
        const res: any = action === 'approve' ? await approveAccExpense(id) : await rejectAccExpense(id, reason);
        const updated = res?.data || { status: action === 'approve' ? 'approved' : 'rejected' };
        setRows((prev) => prev.map((r) => (String(r.id) === id ? { ...r, ...updated, employee: r.employee, vatCode: r.vatCode } : r)));
        toast.success(action === 'approve' ? 'Expense approved and posted to the ledger' : 'Expense rejected');
        await load();
      } catch (err) {
        toast.error(accApiError(err, `Failed to ${action} expense`));
      } finally {
        setPending(null);
      }
    },
    [load]
  );

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
        cell: ({ row }) => {
          if (!['draft', 'submitted', 'pending'].includes(row.original.status)) return null;
          const busy = pending?.id === String(row.original.id);
          return (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={pending !== null}
                className="text-xs font-semibold text-brand hover:underline disabled:opacity-50 disabled:no-underline"
                onClick={() => onStatusAction(row.original, 'approve')}
              >
                {busy && pending?.action === 'approve' ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={pending !== null}
                className="text-xs text-red-600 hover:underline disabled:opacity-50 disabled:no-underline"
                onClick={() => onStatusAction(row.original, 'reject')}
              >
                {busy && pending?.action === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          );
        },
      },
    ],
    [onStatusAction, pending]
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
            <p className="text-sm text-muted-foreground">Employee expenses with receipt upload and approval.</p>
            <AccCreateButton
              label="Create Expense"
              onClick={() => {
                setForm(emptyForm());
                setErrors({});
                setOpen(true);
              }}
            />
          </div>
          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search expenses…" />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Create Expense" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-3" noValidate>
          <AccField label="Employee" error={errors.employeeId} hint={employees.length ? undefined : 'No employees found for this organisation'}>
            <select className={accInputClass} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">{employees.length ? 'Select…' : 'No employees'}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {[e.firstName, e.lastName].filter(Boolean).join(' ') || e.employeeNumber}
                </option>
              ))}
            </select>
          </AccField>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Date" error={errors.expenseDate}><input type="date" className={accInputClass} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} required /></AccField>
            <AccField label="Category">
              <select className={accInputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {['travel', 'meals', 'office', 'mileage', 'other'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </AccField>
            <AccField label="Amount (gross)" error={errors.amount}><input type="number" step="0.01" min="0.01" className={accInputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></AccField>
            <AccField label="VAT" error={errors.taxAmount}><input type="number" step="0.01" min="0" className={accInputClass} value={form.vatAmount} onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} /></AccField>
          </div>
          <AccField label="Description" error={errors.description}><input className={accInputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></AccField>
          <AccField label="Receipt" error={errors.receiptUrl} hint="Image or PDF">
            <FileUploadField
              value={form.receiptUrls}
              onChange={(urls) => setForm((f) => ({ ...f, receiptUrls: urls }))}
              folder="accounting/receipts"
              accept="image/*,.pdf"
            />
          </AccField>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Submit expense" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
