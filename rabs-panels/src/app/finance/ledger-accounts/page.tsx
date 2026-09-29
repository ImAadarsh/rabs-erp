'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listLedgerAccounts, createLedgerAccount, updateLedgerAccount, deleteLedgerAccount, listChartOfAccounts } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type LedgerAccount = {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost_of_goods_sold';
  normalBalance: 'debit' | 'credit';
  isSystem: boolean;
  isActive: boolean;
  chartOfAccounts?: { id: string; name: string };
  parentAccount?: { id: string; accountCode: string; accountName: string } | null;
};

export default function LedgerAccountsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LedgerAccount[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [parentAccounts, setParentAccounts] = useState<LedgerAccount[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    chartOfAccountsId: '',
    parentAccountId: '',
    accountCode: '',
    accountName: '',
    accountType: 'asset' as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost_of_goods_sold',
    accountSubtype: '',
    normalBalance: 'debit' as 'debit' | 'credit',
    description: '',
    isActive: true
  });
  const [editing, setEditing] = useState<LedgerAccount | null>(null);
  const [editForm, setEditForm] = useState({
    parentAccountId: '',
    accountCode: '',
    accountName: '',
    accountType: 'asset' as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost_of_goods_sold',
    accountSubtype: '',
    normalBalance: 'debit' as 'debit' | 'credit',
    description: '',
    isActive: true
  });
  const [confirmDel, setConfirmDel] = useState<LedgerAccount | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [accountsRes, coaRes] = await Promise.all([
          listLedgerAccounts({}),
          listChartOfAccounts({ organizationId: session?.user?.organizationId })
        ]);
        setItems(accountsRes.data || []);
        setChartOfAccounts(coaRes.data || []);
        setParentAccounts(accountsRes.data || []);
      } catch (e: any) {
        if (e?.response?.status === 403) {
          toast.error('You do not have permission to view ledger accounts.');
        } else {
          toast.error('Failed to load ledger accounts');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  useEffect(() => {
    if (form.chartOfAccountsId) {
      const coaAccounts = items.filter(a => a.chartOfAccounts?.id === form.chartOfAccountsId);
      setParentAccounts(coaAccounts);
    }
  }, [form.chartOfAccountsId, items]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.chartOfAccountsId || !form.accountCode || !form.accountName) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createLedgerAccount(form);
      toast.success('Ledger Account created');
      setShowCreate(false);
      setForm({
        chartOfAccountsId: '',
        parentAccountId: '',
        accountCode: '',
        accountName: '',
        accountType: 'asset',
        accountSubtype: '',
        normalBalance: 'debit',
        description: '',
        isActive: true
      });
      const res = await listLedgerAccounts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create ledger account');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.accountCode || !editForm.accountName) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateLedgerAccount(editing.id, editForm);
      toast.success('Ledger Account updated');
      setEditing(null);
      const res = await listLedgerAccounts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update ledger account');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteLedgerAccount(confirmDel.id);
      toast.success('Ledger Account deleted');
      setConfirmDel(null);
      const res = await listLedgerAccounts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete ledger account');
    }
  }

  const columns = useMemo<ColumnDef<LedgerAccount>[]>(() => [
    { accessorKey: 'accountCode', header: 'Account Code' },
    { accessorKey: 'accountName', header: 'Account Name' },
    { 
      accessorKey: 'accountType', 
      header: 'Type',
      cell: ({ row }) => row.original.accountType.replace(/_/g, ' ').toUpperCase()
    },
    { 
      accessorKey: 'normalBalance', 
      header: 'Normal Balance',
      cell: ({ row }) => row.original.normalBalance.toUpperCase()
    },
    {
      accessorKey: 'isActive',
      header: 'Active',
      cell: ({ row }) => row.original.isActive ? 'Yes' : 'No'
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => {
            setEditing(row.original);
            setEditForm({
              parentAccountId: row.original.parentAccount?.id || '',
              accountCode: row.original.accountCode,
              accountName: row.original.accountName,
              accountType: row.original.accountType,
              accountSubtype: '',
              normalBalance: row.original.normalBalance,
              description: '',
              isActive: row.original.isActive
            });
          }} className="p-1.5 hover:bg-muted rounded">
            <Pencil size={16} />
          </button>
          {!row.original.isSystem && (
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
          <Header title="Finance · Ledger Accounts" />
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
          <Header title="Finance · Ledger Accounts" />
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
        <Header title="Finance · Ledger Accounts" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Ledger Accounts</h1>
                <p className="text-muted-foreground mt-1">Manage general ledger accounts</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Ledger Account
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Ledger Account</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Chart of Accounts *</label>
                      <select
                        value={form.chartOfAccountsId}
                        onChange={(e) => setForm({ ...form, chartOfAccountsId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Chart of Accounts</option>
                        {chartOfAccounts.map(coa => (
                          <option key={coa.id} value={coa.id}>{coa.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Parent Account</label>
                      <select
                        value={form.parentAccountId}
                        onChange={(e) => setForm({ ...form, parentAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {parentAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.accountCode} - {acc.accountName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Code *</label>
                        <input
                          type="text"
                          value={form.accountCode}
                          onChange={(e) => setForm({ ...form, accountCode: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Name *</label>
                        <input
                          type="text"
                          value={form.accountName}
                          onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Type *</label>
                        <select
                          value={form.accountType}
                          onChange={(e) => setForm({ ...form, accountType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="asset">Asset</option>
                          <option value="liability">Liability</option>
                          <option value="equity">Equity</option>
                          <option value="revenue">Revenue</option>
                          <option value="expense">Expense</option>
                          <option value="cost_of_goods_sold">Cost of Goods Sold</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Normal Balance *</label>
                        <select
                          value={form.normalBalance}
                          onChange={(e) => setForm({ ...form, normalBalance: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="debit">Debit</option>
                          <option value="credit">Credit</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Account Subtype</label>
                      <input
                        type="text"
                        value={form.accountSubtype}
                        onChange={(e) => setForm({ ...form, accountSubtype: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={form.isActive}
                        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="isActive" className="text-sm">Is Active</label>
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
                    <h2 className="text-xl font-bold">Edit Ledger Account</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Parent Account</label>
                      <select
                        value={editForm.parentAccountId}
                        onChange={(e) => setEditForm({ ...editForm, parentAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {items.filter(a => a.id !== editing.id).map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.accountCode} - {acc.accountName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Code *</label>
                        <input
                          type="text"
                          value={editForm.accountCode}
                          onChange={(e) => setEditForm({ ...editForm, accountCode: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Name *</label>
                        <input
                          type="text"
                          value={editForm.accountName}
                          onChange={(e) => setEditForm({ ...editForm, accountName: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Type *</label>
                        <select
                          value={editForm.accountType}
                          onChange={(e) => setEditForm({ ...editForm, accountType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="asset">Asset</option>
                          <option value="liability">Liability</option>
                          <option value="equity">Equity</option>
                          <option value="revenue">Revenue</option>
                          <option value="expense">Expense</option>
                          <option value="cost_of_goods_sold">Cost of Goods Sold</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Normal Balance *</label>
                        <select
                          value={editForm.normalBalance}
                          onChange={(e) => setEditForm({ ...editForm, normalBalance: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="debit">Debit</option>
                          <option value="credit">Credit</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Account Subtype</label>
                      <input
                        type="text"
                        value={editForm.accountSubtype}
                        onChange={(e) => setEditForm({ ...editForm, accountSubtype: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="editIsActive"
                        checked={editForm.isActive}
                        onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="editIsActive" className="text-sm">Is Active</label>
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
                    Are you sure you want to delete "{confirmDel.accountCode} - {confirmDel.accountName}"? This action cannot be undone.
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

