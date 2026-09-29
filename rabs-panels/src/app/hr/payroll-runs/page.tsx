'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listPayrollRuns, createPayrollRun, updatePayrollRun, deletePayrollRun, listBusinessUnits } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type PayrollRun = {
  id: string;
  payrollNumber: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  totalGross: number;
  totalNet: number;
  currency: string;
  employeeCount: number;
  status: 'draft' | 'calculated' | 'approved' | 'paid' | 'posted';
  organization?: { id: string; name: string };
};

export default function PayrollRunsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PayrollRun[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    businessUnitId: '',
    payrollNumber: '',
    periodStart: '',
    periodEnd: '',
    paymentDate: '',
    currency: 'GBP',
    status: 'draft' as 'draft' | 'calculated' | 'approved' | 'paid' | 'posted'
  });
  const [editing, setEditing] = useState<PayrollRun | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    payrollNumber: '',
    periodStart: '',
    periodEnd: '',
    paymentDate: '',
    currency: 'GBP',
    status: 'draft' as 'draft' | 'calculated' | 'approved' | 'paid' | 'posted'
  });
  const [confirmDel, setConfirmDel] = useState<PayrollRun | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [payrollRes] = await Promise.all([
          listPayrollRuns({ organizationId: session?.user?.organizationId })
        ]);
        setItems(payrollRes.data || []);
        
        if (session?.user?.organizationId) {
          setForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
          try {
            const buRes = await listBusinessUnits(session.user.organizationId);
            setBusinessUnits(buRes.data || []);
          } catch (e) {
            console.error('Failed to load business units:', e);
          }
        }
      } catch (e: any) {
        toast.error('Failed to load payroll runs');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.payrollNumber || !form.periodStart || !form.periodEnd || !form.paymentDate) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createPayrollRun(form);
      toast.success('Payroll Run created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        businessUnitId: '',
        payrollNumber: '',
        periodStart: '',
        periodEnd: '',
        paymentDate: '',
        currency: 'GBP',
        status: 'draft'
      });
      const res = await listPayrollRuns({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create payroll run');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updatePayrollRun(editing.id, editForm);
      toast.success('Payroll Run updated');
      setEditing(null);
      const res = await listPayrollRuns({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update payroll run');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deletePayrollRun(confirmDel.id);
      toast.success('Payroll Run deleted');
      setConfirmDel(null);
      const res = await listPayrollRuns({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete payroll run');
    }
  }

  const columns = useMemo<ColumnDef<PayrollRun>[]>(() => [
    { accessorKey: 'payrollNumber', header: 'Payroll #' },
    { 
      accessorKey: 'periodStart', 
      header: 'Period Start',
      cell: ({ row }) => row.original.periodStart ? new Date(row.original.periodStart).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'periodEnd', 
      header: 'Period End',
      cell: ({ row }) => row.original.periodEnd ? new Date(row.original.periodEnd).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'paymentDate', 
      header: 'Payment Date',
      cell: ({ row }) => row.original.paymentDate ? new Date(row.original.paymentDate).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'totalGross', 
      header: 'Total Gross',
      cell: ({ row }) => `${row.original.currency} ${row.original.totalGross?.toLocaleString('en-GB', { minimumFractionDigits: 2 }) || '0.00'}`
    },
    { 
      accessorKey: 'totalNet', 
      header: 'Total Net',
      cell: ({ row }) => `${row.original.currency} ${row.original.totalNet?.toLocaleString('en-GB', { minimumFractionDigits: 2 }) || '0.00'}`
    },
    { accessorKey: 'employeeCount', header: 'Employees' },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => {
            const item = row.original;
            setEditing(item);
            setEditForm({
              businessUnitId: (item as any).businessUnit?.id || '',
              payrollNumber: item.payrollNumber,
              periodStart: item.periodStart,
              periodEnd: item.periodEnd,
              paymentDate: item.paymentDate,
              currency: item.currency,
              status: item.status
            });
          }} className="p-1.5 hover:bg-muted rounded">
            <Pencil size={16} />
          </button>
          <button onClick={() => setConfirmDel(row.original)} className="p-1.5 hover:bg-muted rounded text-destructive">
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="HR · Payroll Runs" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="HR · Payroll Runs" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view this page.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="HR · Payroll Runs" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Payroll Runs</h1>
                <p className="text-muted-foreground mt-1">Process and manage payroll runs</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Payroll Run
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Payroll Run</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Payroll Number *</label>
                      <input
                        type="text"
                        value={form.payrollNumber}
                        onChange={(e) => setForm({ ...form, payrollNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Period Start *</label>
                        <input
                          type="date"
                          value={form.periodStart}
                          onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Period End *</label>
                        <input
                          type="date"
                          value={form.periodEnd}
                          onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Payment Date *</label>
                        <input
                          type="date"
                          value={form.paymentDate}
                          onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Currency</label>
                        <input
                          type="text"
                          value={form.currency}
                          onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          maxLength={3}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                        Create
                      </button>
                      <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {editing && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Edit Payroll Run</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="draft">Draft</option>
                        <option value="calculated">Calculated</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                        <option value="posted">Posted</option>
                      </select>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                        Update
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDel && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-md w-full p-6">
                  <h2 className="text-xl font-bold mb-4">Confirm Delete</h2>
                  <p className="text-muted-foreground mb-6">
                    Are you sure you want to delete payroll run "{confirmDel.payrollNumber}"? This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={onDelete}
                      className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

