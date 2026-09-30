'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listBudgetLines, createBudgetLine, updateBudgetLine, deleteBudgetLine, listOrganizations, listBusinessUnits, listLedgerAccounts, listFiscalPeriods, listCostCenters } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type BudgetLine = {
  id: string;
  budgetedAmount: number;
  actualAmount: number;
  variance?: number;
  variancePercent?: number;
  ledgerAccount?: { id: string; accountCode: string; accountName: string };
  costCenter?: { id: string; code: string; name: string } | null;
  fiscalPeriod?: { id: string; periodName: string };
};

export default function BudgetLinesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BudgetLine[]>([]);
  const [organizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    businessUnitId: '',
    costCenterId: '',
    ledgerAccountId: '',
    fiscalPeriodId: '',
    budgetedAmount: 0,
    actualAmount: 0,
    variancePercent: 0,
    notes: ''
  });
  const [editing, setEditing] = useState<BudgetLine | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    costCenterId: '',
    ledgerAccountId: '',
    fiscalPeriodId: '',
    budgetedAmount: 0,
    actualAmount: 0,
    variancePercent: 0,
    notes: ''
  });
  const [confirmDel, setConfirmDel] = useState<BudgetLine | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [budgetRes, ledgerRes, periodRes, centerRes] = await Promise.all([
          listBudgetLines({ organizationId: session?.user?.organizationId }),
          listLedgerAccounts({}),
          listFiscalPeriods({ organizationId: session?.user?.organizationId }),
          listCostCenters({ organizationId: session?.user?.organizationId })
        ]);
        setItems(budgetRes.data || []);
        setLedgerAccounts(ledgerRes.data || []);
        setFiscalPeriods(periodRes.data || []);
        setCostCenters(centerRes.data || []);
        
        if (session?.user?.organizationId) {
          setForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
          try {
            const busRes = await listBusinessUnits(session.user.organizationId);
            setBusinessUnits(busRes.data || []);
          } catch (e) {
            console.error('Failed to load business units:', e);
          }
        }
      } catch (e: any) {
        if (e?.response?.status === 403) {
          toast.error('You do not have permission to view budget lines.');
        } else {
          toast.error('Failed to load budget lines');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.ledgerAccountId || !form.fiscalPeriodId || !form.budgetedAmount) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createBudgetLine(form);
      toast.success('Budget Line created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        businessUnitId: '',
        costCenterId: '',
        ledgerAccountId: '',
        fiscalPeriodId: '',
        budgetedAmount: 0,
        actualAmount: 0,
        variancePercent: 0,
        notes: ''
      });
      const res = await listBudgetLines({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create budget line');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.ledgerAccountId || !editForm.fiscalPeriodId || !editForm.budgetedAmount) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateBudgetLine(editing.id, editForm);
      toast.success('Budget Line updated');
      setEditing(null);
      const res = await listBudgetLines({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update budget line');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteBudgetLine(confirmDel.id);
      toast.success('Budget Line deleted');
      setConfirmDel(null);
      const res = await listBudgetLines({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete budget line');
    }
  }

  const columns = useMemo<ColumnDef<BudgetLine>[]>(() => [
    { 
      accessorKey: 'ledgerAccount.accountCode', 
      header: 'Account',
      cell: ({ row }) => {
        const la = row.original.ledgerAccount;
        return la ? `${la.accountCode} - ${la.accountName}` : '-';
      }
    },
    { 
      accessorKey: 'costCenter.code', 
      header: 'Cost Center',
      cell: ({ row }) => {
        const cc = row.original.costCenter;
        return cc ? `${cc.code} - ${cc.name}` : '-';
      }
    },
    { 
      accessorKey: 'fiscalPeriod.periodName', 
      header: 'Period',
      cell: ({ row }) => row.original.fiscalPeriod?.periodName || '-'
    },
    { 
      accessorKey: 'budgetedAmount', 
      header: 'Budgeted',
      cell: ({ row }) => `£${row.original.budgetedAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    },
    { 
      accessorKey: 'actualAmount', 
      header: 'Actual',
      cell: ({ row }) => `£${row.original.actualAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    },
    { 
      accessorKey: 'variance', 
      header: 'Variance',
      cell: ({ row }) => {
        const variance = row.original.variance || (row.original.actualAmount - row.original.budgetedAmount);
        return `£${variance.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
      }
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => {
            const item = row.original;
            setEditing(item);
            setEditForm({
              businessUnitId: (item as any).businessUnit?.id || '',
              costCenterId: item.costCenter?.id || '',
              ledgerAccountId: item.ledgerAccount?.id || '',
              fiscalPeriodId: item.fiscalPeriod?.id || '',
              budgetedAmount: item.budgetedAmount,
              actualAmount: item.actualAmount,
              variancePercent: item.variancePercent || 0,
              notes: (item as any).notes || ''
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
          <Header title="Finance · Budget Lines" />
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
          <Header title="Finance · Budget Lines" />
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
        <Header title="Finance · Budget Lines" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Budget Lines</h1>
                <p className="text-muted-foreground mt-1">Manage budget allocations and tracking</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Budget Line
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Budget Line</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Ledger Account *</label>
                      <select
                        value={form.ledgerAccountId}
                        onChange={(e) => setForm({ ...form, ledgerAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Ledger Account</option>
                        {ledgerAccounts.map(la => (
                          <option key={la.id} value={la.id}>{la.accountCode} - {la.accountName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Fiscal Period *</label>
                      <select
                        value={form.fiscalPeriodId}
                        onChange={(e) => setForm({ ...form, fiscalPeriodId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Fiscal Period</option>
                        {fiscalPeriods.map(fp => (
                          <option key={fp.id} value={fp.id}>{fp.periodName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Cost Center</label>
                      <select
                        value={form.costCenterId}
                        onChange={(e) => setForm({ ...form, costCenterId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {costCenters.map(cc => (
                          <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Budgeted Amount *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.budgetedAmount}
                          onChange={(e) => setForm({ ...form, budgetedAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Actual Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.actualAmount}
                          onChange={(e) => setForm({ ...form, actualAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={3}
                      />
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
                    <h2 className="text-xl font-bold">Edit Budget Line</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Ledger Account *</label>
                      <select
                        value={editForm.ledgerAccountId}
                        onChange={(e) => setEditForm({ ...editForm, ledgerAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Ledger Account</option>
                        {ledgerAccounts.map(la => (
                          <option key={la.id} value={la.id}>{la.accountCode} - {la.accountName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Fiscal Period *</label>
                      <select
                        value={editForm.fiscalPeriodId}
                        onChange={(e) => setEditForm({ ...editForm, fiscalPeriodId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Fiscal Period</option>
                        {fiscalPeriods.map(fp => (
                          <option key={fp.id} value={fp.id}>{fp.periodName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Cost Center</label>
                      <select
                        value={editForm.costCenterId}
                        onChange={(e) => setEditForm({ ...editForm, costCenterId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {costCenters.map(cc => (
                          <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Budgeted Amount *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.budgetedAmount}
                          onChange={(e) => setEditForm({ ...editForm, budgetedAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Actual Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.actualAmount}
                          onChange={(e) => setEditForm({ ...editForm, actualAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Notes</label>
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={3}
                      />
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
                    Are you sure you want to delete this budget line? This action cannot be undone.
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

