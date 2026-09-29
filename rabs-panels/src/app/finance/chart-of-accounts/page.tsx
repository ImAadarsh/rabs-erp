'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listChartOfAccounts, createChartOfAccounts, updateChartOfAccounts, deleteChartOfAccounts, listOrganizations, listBusinessUnits } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type ChartOfAccounts = {
  id: string;
  name: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
  organization?: { id: string; name: string };
  businessUnit?: { id: string; name: string } | null;
  createdAt: string;
};

export default function ChartOfAccountsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ChartOfAccounts[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    businessUnitId: '',
    name: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive'
  });
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [editing, setEditing] = useState<ChartOfAccounts | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    name: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive'
  });
  const [confirmDel, setConfirmDel] = useState<ChartOfAccounts | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [itemsRes, orgsRes] = await Promise.all([
          listChartOfAccounts({ organizationId: session?.user?.organizationId }),
          listOrganizations()
        ]);
        setItems(itemsRes.data || []);
        setOrganizations(orgsRes.data || []);
        
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
          toast.error('You do not have permission to view chart of accounts.');
        } else {
          toast.error('Failed to load chart of accounts');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.name) {
      toast.error('Please fill in required fields (Organization, Name)');
      return;
    }
    try {
      await createChartOfAccounts(form);
      toast.success('Chart of Accounts created');
      setShowCreate(false);
      setForm({ organizationId: session?.user?.organizationId || '', businessUnitId: '', name: '', isDefault: false, status: 'active' });
      const res = await listChartOfAccounts({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create chart of accounts');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.name) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateChartOfAccounts(editing.id, editForm);
      toast.success('Chart of Accounts updated');
      setEditing(null);
      const res = await listChartOfAccounts({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update chart of accounts');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteChartOfAccounts(confirmDel.id);
      toast.success('Chart of Accounts deleted');
      setConfirmDel(null);
      const res = await listChartOfAccounts({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete chart of accounts');
    }
  }

  const columns = useMemo<ColumnDef<ChartOfAccounts>[]>(() => [
    { accessorKey: 'name', header: 'Name' },
    { 
      accessorKey: 'organization.name', 
      header: 'Organization',
      cell: ({ row }) => row.original.organization?.name || '-'
    },
    { 
      accessorKey: 'businessUnit.name', 
      header: 'Business Unit',
      cell: ({ row }) => row.original.businessUnit?.name || '-'
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
            setEditing(row.original);
            setEditForm({
              businessUnitId: row.original.businessUnit?.id || '',
              name: row.original.name,
              isDefault: row.original.isDefault,
              status: row.original.status
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
          <Header title="Finance · Chart of Accounts" />
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
          <Header title="Finance · Chart of Accounts" />
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
        <Header title="Finance · Chart of Accounts" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Chart of Accounts</h1>
                <p className="text-muted-foreground mt-1">Manage account structures</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Chart of Accounts
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Chart of Accounts</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Organization *</label>
                      <select
                        value={form.organizationId}
                        onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Organization</option>
                        {organizations.map(org => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Business Unit</label>
                      <select
                        value={form.businessUnitId}
                        onChange={(e) => setForm({ ...form, businessUnitId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {businessUnits.map(bu => (
                          <option key={bu.id} value={bu.id}>{bu.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
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
                        onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
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
                    <h2 className="text-xl font-bold">Edit Chart of Accounts</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Business Unit</label>
                      <select
                        value={editForm.businessUnitId}
                        onChange={(e) => setEditForm({ ...editForm, businessUnitId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {businessUnits.map(bu => (
                          <option key={bu.id} value={bu.id}>{bu.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Name *</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
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
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'active' | 'inactive' })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
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
                    Are you sure you want to delete "{confirmDel.name}"? This action cannot be undone.
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

