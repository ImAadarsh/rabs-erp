'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listBankTransactions, createBankTransaction, updateBankTransaction, deleteBankTransaction, listBankAccounts, listJournalEntries } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type BankTransaction = {
  id: string;
  transactionDate: string;
  transactionType: 'debit' | 'credit' | 'fee' | 'interest' | 'other';
  amount: number;
  currency: string;
  description?: string;
  reference?: string;
  isReconciled: boolean;
  bankAccount?: { id: string; accountName: string };
};

export default function BankTransactionsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BankTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    bankAccountId: '',
    transactionDate: new Date().toISOString().split('T')[0],
    postDate: '',
    transactionType: 'debit' as 'debit' | 'credit' | 'fee' | 'interest' | 'other',
    amount: 0,
    currency: 'GBP',
    description: '',
    reference: '',
    payeePayer: '',
    balance: 0,
    isReconciled: false,
    journalEntryId: ''
  });
  const [editing, setEditing] = useState<BankTransaction | null>(null);
  const [editForm, setEditForm] = useState({
    transactionDate: '',
    postDate: '',
    transactionType: 'debit' as 'debit' | 'credit' | 'fee' | 'interest' | 'other',
    amount: 0,
    currency: 'GBP',
    description: '',
    reference: '',
    payeePayer: '',
    balance: 0,
    isReconciled: false,
    journalEntryId: ''
  });
  const [confirmDel, setConfirmDel] = useState<BankTransaction | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [transactionsRes, accountsRes] = await Promise.all([
          listBankTransactions({}),
          listBankAccounts({ organizationId: session?.user?.organizationId })
        ]);
        setItems(transactionsRes.data || []);
        setBankAccounts(accountsRes.data || []);
      } catch (e: any) {
        if (e?.response?.status === 403) {
          toast.error('You do not have permission to view bank transactions.');
        } else {
          toast.error('Failed to load bank transactions');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bankAccountId || !form.transactionDate || !form.amount) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createBankTransaction(form);
      toast.success('Bank Transaction created');
      setShowCreate(false);
      setForm({
        bankAccountId: '',
        transactionDate: new Date().toISOString().split('T')[0],
        postDate: '',
        transactionType: 'debit',
        amount: 0,
        currency: 'GBP',
        description: '',
        reference: '',
        payeePayer: '',
        balance: 0,
        isReconciled: false,
        journalEntryId: ''
      });
      const res = await listBankTransactions({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create bank transaction');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.transactionDate || !editForm.amount) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateBankTransaction(editing.id, editForm);
      toast.success('Bank Transaction updated');
      setEditing(null);
      const res = await listBankTransactions({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update bank transaction');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteBankTransaction(confirmDel.id);
      toast.success('Bank Transaction deleted');
      setConfirmDel(null);
      const res = await listBankTransactions({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete bank transaction');
    }
  }

  const columns = useMemo<ColumnDef<BankTransaction>[]>(() => [
    { 
      accessorKey: 'transactionDate', 
      header: 'Date',
      cell: ({ row }) => new Date(row.original.transactionDate).toLocaleDateString()
    },
    { 
      accessorKey: 'bankAccount.accountName', 
      header: 'Bank Account',
      cell: ({ row }) => row.original.bankAccount?.accountName || '-'
    },
    { 
      accessorKey: 'transactionType', 
      header: 'Type',
      cell: ({ row }) => row.original.transactionType.charAt(0).toUpperCase() + row.original.transactionType.slice(1)
    },
    { 
      accessorKey: 'amount', 
      header: 'Amount',
      cell: ({ row }) => `${row.original.currency} ${row.original.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    },
    { 
      accessorKey: 'description', 
      header: 'Description',
      cell: ({ row }) => row.original.description || '-'
    },
    {
      accessorKey: 'isReconciled',
      header: 'Reconciled',
      cell: ({ row }) => row.original.isReconciled ? 'Yes' : 'No'
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => {
            const item = row.original;
            setEditing(item);
            setEditForm({
              transactionDate: item.transactionDate,
              postDate: (item as any).postDate || '',
              transactionType: item.transactionType,
              amount: item.amount,
              currency: item.currency,
              description: item.description || '',
              reference: item.reference || '',
              payeePayer: (item as any).payeePayer || '',
              balance: (item as any).balance || 0,
              isReconciled: item.isReconciled,
              journalEntryId: (item as any).journalEntry?.id || ''
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
          <Header title="Finance · Bank Transactions" />
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
          <Header title="Finance · Bank Transactions" />
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
        <Header title="Finance · Bank Transactions" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Bank Transactions</h1>
                <p className="text-muted-foreground mt-1">Manage bank transaction records</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Transaction
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Bank Transaction</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Bank Account *</label>
                      <select
                        value={form.bankAccountId}
                        onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Bank Account</option>
                        {bankAccounts.map(ba => (
                          <option key={ba.id} value={ba.id}>{ba.accountName} - {ba.bankName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Transaction Date *</label>
                        <input
                          type="date"
                          value={form.transactionDate}
                          onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Post Date</label>
                        <input
                          type="date"
                          value={form.postDate}
                          onChange={(e) => setForm({ ...form, postDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Transaction Type *</label>
                        <select
                          value={form.transactionType}
                          onChange={(e) => setForm({ ...form, transactionType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="debit">Debit</option>
                          <option value="credit">Credit</option>
                          <option value="fee">Fee</option>
                          <option value="interest">Interest</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Amount *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.amount}
                          onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
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
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <input
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Reference</label>
                      <input
                        type="text"
                        value={form.reference}
                        onChange={(e) => setForm({ ...form, reference: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Payee/Payer</label>
                      <input
                        type="text"
                        value={form.payeePayer}
                        onChange={(e) => setForm({ ...form, payeePayer: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Balance</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.balance}
                        onChange={(e) => setForm({ ...form, balance: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isReconciled"
                        checked={form.isReconciled}
                        onChange={(e) => setForm({ ...form, isReconciled: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="isReconciled" className="text-sm">Is Reconciled</label>
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
                    <h2 className="text-xl font-bold">Edit Bank Transaction</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Transaction Date *</label>
                        <input
                          type="date"
                          value={editForm.transactionDate}
                          onChange={(e) => setEditForm({ ...editForm, transactionDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Post Date</label>
                        <input
                          type="date"
                          value={editForm.postDate}
                          onChange={(e) => setEditForm({ ...editForm, postDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Transaction Type *</label>
                        <select
                          value={editForm.transactionType}
                          onChange={(e) => setEditForm({ ...editForm, transactionType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="debit">Debit</option>
                          <option value="credit">Credit</option>
                          <option value="fee">Fee</option>
                          <option value="interest">Interest</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Amount *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.amount}
                          onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
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
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Reference</label>
                      <input
                        type="text"
                        value={editForm.reference}
                        onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Payee/Payer</label>
                      <input
                        type="text"
                        value={editForm.payeePayer}
                        onChange={(e) => setEditForm({ ...editForm, payeePayer: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Balance</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.balance}
                        onChange={(e) => setEditForm({ ...editForm, balance: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="editIsReconciled"
                        checked={editForm.isReconciled}
                        onChange={(e) => setEditForm({ ...editForm, isReconciled: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="editIsReconciled" className="text-sm">Is Reconciled</label>
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
                    Are you sure you want to delete this transaction? This action cannot be undone.
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

