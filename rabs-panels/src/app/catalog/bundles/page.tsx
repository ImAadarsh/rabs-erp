'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listBundles, createBundle, updateBundle, deleteBundle,
  listCatalogItems
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2, Plus, X, Package } from 'lucide-react';

type Bundle = {
  id: string;
  name: string;
  description?: string | null;
  discountPercent?: number | null;
  fixedPrice?: number | null;
  currency: string;
  status: 'active' | 'inactive';
  catalogItem?: {
    id: string;
    sku: string;
    name: string;
  };
  items?: any[];
  [key: string]: any;
};

export default function BundlesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Bundle[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    catalogItemId: '',
    name: '',
    description: '',
    discountPercent: '',
    fixedPrice: '',
    currency: 'GBP',
    status: 'active' as 'active' | 'inactive'
  });
  const [editing, setEditing] = useState<Bundle | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    discountPercent: '',
    fixedPrice: '',
    currency: 'GBP',
    status: 'active' as 'active' | 'inactive'
  });
  const [confirmDel, setConfirmDel] = useState<Bundle | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [bundlesRes, catalogItemsRes] = await Promise.all([
          listBundles(),
          listCatalogItems({ organizationId: session?.user?.organizationId })
        ]);
        setItems(bundlesRes.data || []);
        setCatalogItems(catalogItemsRes.data || []);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view bundles.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load bundles');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.catalogItemId || !form.name) {
      toast.error('Please fill in required fields (Catalog Item, Name)');
      return;
    }
    try {
      const res = await createBundle({
        catalogItemId: form.catalogItemId,
        name: form.name,
        description: form.description || undefined,
        discountPercent: form.discountPercent ? parseFloat(form.discountPercent) : undefined,
        fixedPrice: form.fixedPrice ? parseFloat(form.fixedPrice) : undefined,
        currency: form.currency,
        status: form.status
      });
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        catalogItemId: '',
        name: '',
        description: '',
        discountPercent: '',
        fixedPrice: '',
        currency: 'GBP',
        status: 'active'
      });
      toast.success('Bundle created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateBundle(editing.id, {
        name: editForm.name,
        description: editForm.description || undefined,
        discountPercent: editForm.discountPercent ? parseFloat(editForm.discountPercent) : undefined,
        fixedPrice: editForm.fixedPrice ? parseFloat(editForm.fixedPrice) : undefined,
        currency: editForm.currency,
        status: editForm.status
      });
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Bundle updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteBundle(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Bundle deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<Bundle>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.catalogItem && (
            <div className="text-xs text-muted-foreground">{row.original.catalogItem.sku} - {row.original.catalogItem.name}</div>
          )}
        </div>
      )
    },
    {
      accessorKey: 'discountPercent',
      header: 'Discount',
      cell: ({ row }) => {
        const bundle = row.original;
        if (bundle.discountPercent) {
          return <span>{bundle.discountPercent}%</span>;
        } else if (bundle.fixedPrice) {
          return <span>{bundle.currency} {bundle.fixedPrice.toFixed(2)}</span>;
        }
        return <span className="text-muted-foreground">-</span>;
      }
    },
    {
      accessorKey: 'items',
      header: 'Items',
      cell: ({ row }) => row.original.items?.length || 0
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
                  name: item.name,
                  description: item.description || '',
                  discountPercent: item.discountPercent?.toString() || '',
                  fixedPrice: item.fixedPrice?.toString() || '',
                  currency: item.currency,
                  status: item.status
                });
              }}
              className="p-1 hover:bg-gray-100 rounded"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmDel(item)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ], []);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Catalog · Bundles" />
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
          <Header title="Catalog · Bundles" />
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
        <Header title="Catalog · Bundles" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Package className="h-8 w-8" />
                  Bundles
                </h1>
                <p className="text-muted-foreground mt-1">Manage product bundles and kits</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Bundle
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Bundle</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Catalog Item *</label>
                        <select
                          value={form.catalogItemId}
                          onChange={e => setForm(prev => ({ ...prev, catalogItemId: e.target.value }))}
                          className="select"
                          required
                        >
                          <option value="">Select...</option>
                          {catalogItems.map(item => (
                            <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Name *</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Description</label>
                        <textarea
                          value={form.description}
                          onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                          className="input"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Discount Percent</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={form.discountPercent}
                          onChange={e => setForm(prev => ({ ...prev, discountPercent: e.target.value }))}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Fixed Price</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.fixedPrice}
                          onChange={e => setForm(prev => ({ ...prev, fixedPrice: e.target.value }))}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Currency</label>
                        <select
                          value={form.currency}
                          onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))}
                          className="select"
                        >
                          <option value="GBP">GBP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
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
                    <h3 className="text-lg font-semibold">Edit Bundle</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Name *</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Description</label>
                        <textarea
                          value={editForm.description}
                          onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                          className="input"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Discount Percent</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={editForm.discountPercent}
                          onChange={e => setEditForm(prev => ({ ...prev, discountPercent: e.target.value }))}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Fixed Price</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editForm.fixedPrice}
                          onChange={e => setEditForm(prev => ({ ...prev, fixedPrice: e.target.value }))}
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Currency</label>
                        <select
                          value={editForm.currency}
                          onChange={e => setEditForm(prev => ({ ...prev, currency: e.target.value }))}
                          className="select"
                        >
                          <option value="GBP">GBP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={editForm.status}
                          onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="btn btn-outline"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
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

