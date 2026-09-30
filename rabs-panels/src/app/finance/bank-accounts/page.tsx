'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount, listOrganizations, listBusinessUnits, listLedgerAccounts } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type BankAccount = {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber?: string;
  currency: string;
  currentBalance: number;
  isDefault: boolean;
  status: 'active' | 'inactive' | 'closed';
  organization?: { id: string; name: string };
  businessUnit?: { id: string; name: string } | null;
};

export default function BankAccountsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BankAccount[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    businessUnitId: '',
    accountName: '',
    bankName: '',
    accountNumber: '',
    routingNumber: '',
    iban: '',
    swiftCode: '',
    currency: 'GBP',
    currentBalance: 0,
    ledgerAccountId: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive' | 'closed'
  });
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    accountName: '',
    bankName: '',
    accountNumber: '',
    routingNumber: '',
    iban: '',
    swiftCode: '',
    currency: 'GBP',
    currentBalance: 0,
    ledgerAccountId: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive' | 'closed'
  });
  const [confirmDel, setConfirmDel] = useState<BankAccount | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [accountsRes, orgsRes, ledgerRes] = await Promise.all([
          listBankAccounts({ organizationId: session?.user?.organizationId }),
          listOrganizations(),
          listLedgerAccounts({})
        ]);
        setItems(accountsRes.data || []);
        setOrganizations(orgsRes.data || []);
        setLedgerAccounts(ledgerRes.data || []);
        
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
          toast.error('You do not have permission to view bank accounts.');
        } else {
          toast.error('Failed to load bank accounts');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.accountName || !form.bankName) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createBankAccount(form);
      toast.success('Bank Account created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        businessUnitId: '',
        accountName: '',
        bankName: '',
        accountNumber: '',
        routingNumber: '',
        iban: '',
        swiftCode: '',
        currency: 'GBP',
        currentBalance: 0,
        ledgerAccountId: '',
        isDefault: false,
        status: 'active'
      });
      const res = await listBankAccounts({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create bank account');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.accountName || !editForm.bankName) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateBankAccount(editing.id, editForm);
      toast.success('Bank Account updated');
      setEditing(null);
      const res = await listBankAccounts({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update bank account');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteBankAccount(confirmDel.id);
      toast.success('Bank Account deleted');
      setConfirmDel(null);
      const res = await listBankAccounts({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete bank account');
    }
  }

  const columns = useMemo<ColumnDef<BankAccount>[]>(() => [
    { accessorKey: 'accountName', header: 'Account Name' },
    { accessorKey: 'bankName', header: 'Bank Name' },
    { 
      accessorKey: 'accountNumber', 
      header: 'Account Number',
      cell: ({ row }) => row.original.accountNumber || '-'
    },
    { accessorKey: 'currency', header: 'Currency' },
    { 
      accessorKey: 'currentBalance', 
      header: 'Balance',
      cell: ({ row }) => `${row.original.currency} ${row.original.currentBalance.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    },
    {
      accessorKey: 'isDefault',
      header: 'Default',
      cell: ({ row }) => row.original.isDefault ? 'Yes' : 'No'
    },
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
              accountName: item.accountName,
              bankName: item.bankName,
              accountNumber: item.accountNumber || '',
              routingNumber: (item as any).routingNumber || '',
              iban: (item as any).iban || '',
              swiftCode: (item as any).swiftCode || '',
              currency: item.currency,
              currentBalance: item.currentBalance,
              ledgerAccountId: (item as any).ledgerAccount?.id || '',
              isDefault: item.isDefault,
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
          <Header title="Finance · Bank Accounts" />
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
          <Header title="Finance · Bank Accounts" />
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
        <Header title="Finance · Bank Accounts" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Bank Accounts</h1>
                <p className="text-muted-foreground mt-1">Manage bank account information</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Bank Account
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Bank Account</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
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
                    <div>
                      <label className="block text-sm font-medium mb-1">Bank Name *</label>
                      <input
                        type="text"
                        value={form.bankName}
                        onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Number</label>
                        <input
                          type="text"
                          value={form.accountNumber}
                          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Routing Number</label>
                        <input
                          type="text"
                          value={form.routingNumber}
                          onChange={(e) => setForm({ ...form, routingNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">IBAN</label>
                        <input
                          type="text"
                          value={form.iban}
                          onChange={(e) => setForm({ ...form, iban: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">SWIFT Code</label>
                        <input
                          type="text"
                          value={form.swiftCode}
                          onChange={(e) => setForm({ ...form, swiftCode: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Currency *</label>
                        <input
                          type="text"
                          value={form.currency}
                          onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Current Balance</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.currentBalance}
                          onChange={(e) => setForm({ ...form, currentBalance: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Ledger Account</label>
                      <select
                        value={form.ledgerAccountId}
                        onChange={(e) => setForm({ ...form, ledgerAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {ledgerAccounts.map(la => (
                          <option key={la.id} value={la.id}>{la.accountCode} - {la.accountName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isDefault"
                        checked={form.isDefault}
                        onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="isDefault" className="text-sm">Is Default</label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="closed">Closed</option>
                      </select>
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
                    <h2 className="text-xl font-bold">Edit Bank Account</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
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
                    <div>
                      <label className="block text-sm font-medium mb-1">Bank Name *</label>
                      <input
                        type="text"
                        value={editForm.bankName}
                        onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Account Number</label>
                        <input
                          type="text"
                          value={editForm.accountNumber}
                          onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Routing Number</label>
                        <input
                          type="text"
                          value={editForm.routingNumber}
                          onChange={(e) => setEditForm({ ...editForm, routingNumber: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">IBAN</label>
                        <input
                          type="text"
                          value={editForm.iban}
                          onChange={(e) => setEditForm({ ...editForm, iban: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">SWIFT Code</label>
                        <input
                          type="text"
                          value={editForm.swiftCode}
                          onChange={(e) => setEditForm({ ...editForm, swiftCode: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Currency *</label>
                        <input
                          type="text"
                          value={editForm.currency}
                          onChange={(e) => setEditForm({ ...editForm, currency: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          maxLength={3}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Current Balance</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.currentBalance}
                          onChange={(e) => setEditForm({ ...editForm, currentBalance: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Ledger Account</label>
                      <select
                        value={editForm.ledgerAccountId}
                        onChange={(e) => setEditForm({ ...editForm, ledgerAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {ledgerAccounts.map(la => (
                          <option key={la.id} value={la.id}>{la.accountCode} - {la.accountName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="editIsDefault"
                        checked={editForm.isDefault}
                        onChange={(e) => setEditForm({ ...editForm, isDefault: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="editIsDefault" className="text-sm">Is Default</label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="closed">Closed</option>
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
                    Are you sure you want to delete "{confirmDel.accountName}"? This action cannot be undone.
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

