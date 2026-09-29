'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listFiscalPeriods, createFiscalPeriod, updateFiscalPeriod, deleteFiscalPeriod, listOrganizations } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type FiscalPeriod = {
  id: string;
  periodName: string;
  periodType: 'month' | 'quarter' | 'year';
  startDate: string;
  endDate: string;
  fiscalYear: number;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: { firstName?: string; lastName?: string };
};

export default function FiscalPeriodsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FiscalPeriod[]>([]);
  const [organizations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    periodName: '',
    periodType: 'month' as 'month' | 'quarter' | 'year',
    startDate: '',
    endDate: '',
    fiscalYear: new Date().getFullYear()
  });
  const [editing, setEditing] = useState<FiscalPeriod | null>(null);
  const [editForm, setEditForm] = useState({
    periodName: '',
    periodType: 'month' as 'month' | 'quarter' | 'year',
    startDate: '',
    endDate: '',
    fiscalYear: new Date().getFullYear(),
    isClosed: false
  });
  const [confirmDel, setConfirmDel] = useState<FiscalPeriod | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const itemsRes = await listFiscalPeriods({ organizationId: session?.user?.organizationId });
        setItems(itemsRes.data || []);
      } catch (e: any) {
        if (e?.response?.status === 403) {
          toast.error('You do not have permission to view fiscal periods.');
        } else {
          toast.error('Failed to load fiscal periods');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.periodName || !form.startDate || !form.endDate) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createFiscalPeriod({ ...form, organizationId: session?.user?.organizationId || form.organizationId });
      toast.success('Fiscal Period created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        periodName: '',
        periodType: 'month',
        startDate: '',
        endDate: '',
        fiscalYear: new Date().getFullYear()
      });
      const res = await listFiscalPeriods({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create fiscal period');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.periodName || !editForm.startDate || !editForm.endDate) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateFiscalPeriod(editing.id, editForm);
      toast.success('Fiscal Period updated');
      setEditing(null);
      const res = await listFiscalPeriods({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update fiscal period');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteFiscalPeriod(confirmDel.id);
      toast.success('Fiscal Period deleted');
      setConfirmDel(null);
      const res = await listFiscalPeriods({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete fiscal period');
    }
  }

  const columns = useMemo<ColumnDef<FiscalPeriod>[]>(() => [
    { accessorKey: 'periodName', header: 'Period Name' },
    { 
      accessorKey: 'periodType', 
      header: 'Type',
      cell: ({ row }) => row.original.periodType.charAt(0).toUpperCase() + row.original.periodType.slice(1)
    },
    { 
      accessorKey: 'startDate', 
      header: 'Start Date',
      cell: ({ row }) => new Date(row.original.startDate).toLocaleDateString()
    },
    { 
      accessorKey: 'endDate', 
      header: 'End Date',
      cell: ({ row }) => new Date(row.original.endDate).toLocaleDateString()
    },
    { accessorKey: 'fiscalYear', header: 'Fiscal Year' },
    {
      accessorKey: 'isClosed',
      header: 'Closed',
      cell: ({ row }) => row.original.isClosed ? 'Yes' : 'No'
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          {!row.original.isClosed && (
            <button onClick={() => {
              setEditing(row.original);
              setEditForm({
                periodName: row.original.periodName,
                periodType: row.original.periodType,
                startDate: row.original.startDate,
                endDate: row.original.endDate,
                fiscalYear: row.original.fiscalYear,
                isClosed: row.original.isClosed
              });
            }} className="p-1.5 hover:bg-muted rounded">
              <Pencil size={16} />
            </button>
          )}
          {!row.original.isClosed && (
            <button onClick={() => setConfirmDel(row.original)} className="p-1.5 hover:bg-muted rounded text-destructive">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )
    }
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Finance · Fiscal Periods" />
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
          <Header title="Finance · Fiscal Periods" />
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
        <Header title="Finance · Fiscal Periods" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Fiscal Periods</h1>
                <p className="text-muted-foreground mt-1">Manage accounting periods</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Fiscal Period
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Fiscal Period</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Period Name *</label>
                      <input
                        type="text"
                        value={form.periodName}
                        onChange={(e) => setForm({ ...form, periodName: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        placeholder="e.g., January 2024"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Period Type *</label>
                        <select
                          value={form.periodType}
                          onChange={(e) => setForm({ ...form, periodType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="month">Month</option>
                          <option value="quarter">Quarter</option>
                          <option value="year">Year</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Fiscal Year *</label>
                        <input
                          type="number"
                          value={form.fiscalYear}
                          onChange={(e) => setForm({ ...form, fiscalYear: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Date *</label>
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End Date *</label>
                        <input
                          type="date"
                          value={form.endDate}
                          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
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
                    <h2 className="text-xl font-bold">Edit Fiscal Period</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Period Name *</label>
                      <input
                        type="text"
                        value={editForm.periodName}
                        onChange={(e) => setEditForm({ ...editForm, periodName: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Period Type *</label>
                        <select
                          value={editForm.periodType}
                          onChange={(e) => setEditForm({ ...editForm, periodType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="month">Month</option>
                          <option value="quarter">Quarter</option>
                          <option value="year">Year</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Fiscal Year *</label>
                        <input
                          type="number"
                          value={editForm.fiscalYear}
                          onChange={(e) => setEditForm({ ...editForm, fiscalYear: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Date *</label>
                        <input
                          type="date"
                          value={editForm.startDate}
                          onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End Date *</label>
                        <input
                          type="date"
                          value={editForm.endDate}
                          onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
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
                    Are you sure you want to delete "{confirmDel.periodName}"? This action cannot be undone.
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

