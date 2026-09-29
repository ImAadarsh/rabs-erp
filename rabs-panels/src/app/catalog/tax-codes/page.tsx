'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listTaxCodes, createTaxCode, updateTaxCode, deleteTaxCode,
  listOrganizations
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2, Plus, X, Receipt } from 'lucide-react';

type TaxCode = {
  id: string;
  code: string;
  name: string;
  rate: number;
  countryCode?: string | null;
  description?: string | null;
  isDefault: boolean;
  status: 'active' | 'inactive';
  organization?: {
    id: string;
    name: string;
  };
  [key: string]: any;
};

export default function TaxCodesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TaxCode[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    organizationId: '',
    code: '',
    name: '',
    rate: 0.20,
    countryCode: '',
    description: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive'
  });
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  const [editForm, setEditForm] = useState({
    code: '',
    name: '',
    rate: 0.20,
    countryCode: '',
    description: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive'
  });
  const [confirmDel, setConfirmDel] = useState<TaxCode | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [taxCodesRes, orgsRes] = await Promise.all([
          listTaxCodes({ organizationId: session?.user?.organizationId }),
          listOrganizations()
        ]);
        setItems(taxCodesRes.data || []);
        setOrganizations(orgsRes.data || []);
        
        if (session?.user?.organizationId) {
          setForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
        }
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view tax codes.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load tax codes');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.organizationId || !form.code || !form.name) {
      toast.error('Please fill in required fields (Organization, Code, Name)');
      return;
    }
    try {
      const res = await createTaxCode({
        organizationId: form.organizationId,
        code: form.code,
        name: form.name,
        rate: form.rate,
        countryCode: form.countryCode || undefined,
        description: form.description || undefined,
        isDefault: form.isDefault,
        status: form.status
      });
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        organizationId: session.user.organizationId || '',
        code: '',
        name: '',
        rate: 0.20,
        countryCode: '',
        description: '',
        isDefault: false,
        status: 'active'
      });
      toast.success('Tax code created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateTaxCode(editing.id, {
        code: editForm.code,
        name: editForm.name,
        rate: editForm.rate,
        countryCode: editForm.countryCode || undefined,
        description: editForm.description || undefined,
        isDefault: editForm.isDefault,
        status: editForm.status
      });
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Tax code updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteTaxCode(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Tax code deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<TaxCode>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>
    },
    {
      accessorKey: 'rate',
      header: 'Rate',
      cell: ({ row }) => <span>{(row.original.rate * 100).toFixed(2)}%</span>
    },
    {
      accessorKey: 'countryCode',
      header: 'Country',
      cell: ({ row }) => row.original.countryCode || '-'
    },
    {
      accessorKey: 'isDefault',
      header: 'Default',
      cell: ({ row }) => row.original.isDefault ? (
        <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Yes</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const colors = {
          active: 'bg-green-100 text-green-800',
          inactive: 'bg-gray-100 text-gray-800'
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>
            {status}
          </span>
        );
      }
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(item);
                setEditForm({
                  code: item.code,
                  name: item.name,
                  rate: item.rate,
                  countryCode: item.countryCode || '',
                  description: item.description || '',
                  isDefault: item.isDefault,
                  status: item.status
                });
              }}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmDel(item)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      }
    }
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Catalog · Tax Codes" />
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
          <Header title="Catalog · Tax Codes" />
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
        <Header title="Catalog · Tax Codes" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Receipt className="h-8 w-8" />
                  Tax Codes
                </h1>
                <p className="text-muted-foreground mt-1">Manage tax and VAT codes</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Tax Code
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Tax Code</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Organization *</label>
                        <select
                          value={form.organizationId}
                          onChange={e => setForm(prev => ({ ...prev, organizationId: e.target.value }))}
                          className="input"
                          required
                        >
                          <option value="">Select...</option>
                          {organizations.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Code *</label>
                        <input
                          type="text"
                          value={form.code}
                          onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Name *</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Rate * (0.00 - 1.00)</label>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          max="1"
                          value={form.rate}
                          onChange={e => setForm(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                          className="input"
                          required
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          Current: {(form.rate * 100).toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Country Code (ISO 2)</label>
                        <input
                          type="text"
                          maxLength={2}
                          value={form.countryCode}
                          onChange={e => setForm(prev => ({ ...prev, countryCode: e.target.value.toUpperCase() }))}
                          className="input"
                          placeholder="GB"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="input"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={form.description}
                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                          className="select"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.isDefault}
                          onChange={e => setForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-sm">Set as default tax code</span>
                      </label>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setShowCreate(false)}
                        className="btn btn-outline"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {editing && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit Tax Code</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Code *</label>
                        <input
                          type="text"
                          value={editForm.code}
                          onChange={e => setEditForm(prev => ({ ...prev, code: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Name *</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Rate * (0.00 - 1.00)</label>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          max="1"
                          value={editForm.rate}
                          onChange={e => setEditForm(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                          className="input"
                          required
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          Current: {(editForm.rate * 100).toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Country Code</label>
                        <input
                          type="text"
                          maxLength={2}
                          value={editForm.countryCode}
                          onChange={e => setEditForm(prev => ({ ...prev, countryCode: e.target.value.toUpperCase() }))}
                          className="input"
                          placeholder="GB"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={editForm.status}
                          onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="input"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                          className="select"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.isDefault}
                          onChange={e => setEditForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-sm">Set as default tax code</span>
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="px-4 py-2 border rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
                      >
                        Update
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDel && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200">
                  <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
                  <p className="mb-4 text-muted-foreground">Are you sure you want to delete "{confirmDel.name}"? This action cannot be undone.</p>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="btn btn-outline"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={onDelete}
                      className="btn bg-red-600 hover:bg-red-700 text-white"
                    >
                      Delete
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

