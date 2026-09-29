'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listPromotionalPrices, createPromotionalPrice, updatePromotionalPrice, deletePromotionalPrice,
  listVariants, listPriceLists
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Tag } from 'lucide-react';

type PromotionalPrice = {
  id: string;
  name: string;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  validFrom: string;
  validUntil: string;
  status: 'scheduled' | 'active' | 'expired' | 'cancelled';
  variant?: {
    id: string;
    variantSku: string;
  };
  priceList?: {
    id: string;
    name: string;
  } | null;
  [key: string]: any;
};

export default function PromotionalPricesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PromotionalPrice[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    variantId: '',
    priceListId: '',
    name: '',
    discountType: 'percentage' as 'percentage' | 'fixed_amount',
    discountValue: '',
    validFrom: '',
    validUntil: '',
    status: 'scheduled' as 'scheduled' | 'active' | 'expired' | 'cancelled'
  });
  const [editing, setEditing] = useState<PromotionalPrice | null>(null);
  const [editForm, setEditForm] = useState({
    priceListId: '',
    name: '',
    discountType: 'percentage' as 'percentage' | 'fixed_amount',
    discountValue: '',
    validFrom: '',
    validUntil: '',
    status: 'scheduled' as 'scheduled' | 'active' | 'expired' | 'cancelled'
  });
  const [confirmDel, setConfirmDel] = useState<PromotionalPrice | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [pricesRes, variantsRes, priceListsRes] = await Promise.all([
          listPromotionalPrices(),
          listVariants(),
          listPriceLists({ organizationId: session?.user?.organizationId })
        ]);
        setItems(pricesRes.data || []);
        setVariants(variantsRes.data || []);
        setPriceLists(priceListsRes.data || []);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view promotional prices.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load promotional prices');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.variantId || !form.name || !form.discountValue || !form.validFrom || !form.validUntil) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const res = await createPromotionalPrice({
        variantId: form.variantId,
        priceListId: form.priceListId || undefined,
        name: form.name,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: new Date(form.validUntil).toISOString(),
        status: form.status
      });
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        variantId: '',
        priceListId: '',
        name: '',
        discountType: 'percentage',
        discountValue: '',
        validFrom: '',
        validUntil: '',
        status: 'scheduled'
      });
      toast.success('Promotional price created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updatePromotionalPrice(editing.id, {
        priceListId: editForm.priceListId || null,
        name: editForm.name,
        discountType: editForm.discountType,
        discountValue: parseFloat(editForm.discountValue),
        validFrom: new Date(editForm.validFrom).toISOString(),
        validUntil: new Date(editForm.validUntil).toISOString(),
        status: editForm.status
      });
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Promotional price updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deletePromotionalPrice(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Promotional price deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<PromotionalPrice>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          {row.original.variant && (
            <div className="text-xs text-muted-foreground">Variant: {row.original.variant.variantSku}</div>
          )}
        </div>
      )
    },
    {
      accessorKey: 'discount',
      header: 'Discount',
      cell: ({ row }) => {
        const price = row.original;
        if (price.discountType === 'percentage') {
          return <span>{price.discountValue}%</span>;
        } else {
          return <span>{price.discountValue.toFixed(2)}</span>;
        }
      }
    },
    {
      accessorKey: 'validFrom',
      header: 'Valid From',
      cell: ({ row }) => new Date(row.original.validFrom).toLocaleDateString()
    },
    {
      accessorKey: 'validUntil',
      header: 'Valid Until',
      cell: ({ row }) => new Date(row.original.validUntil).toLocaleDateString()
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const colors = {
          scheduled: 'bg-blue-100 text-blue-800',
          active: 'bg-green-100 text-green-800',
          expired: 'bg-gray-100 text-gray-800',
          cancelled: 'bg-red-100 text-red-800'
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
                  priceListId: item.priceList?.id || '',
                  name: item.name,
                  discountType: item.discountType,
                  discountValue: item.discountValue.toString(),
                  validFrom: new Date(item.validFrom).toISOString().slice(0, 16),
                  validUntil: new Date(item.validUntil).toISOString().slice(0, 16),
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
          <Header title="Catalog · Promotional Prices" />
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
          <Header title="Catalog · Promotional Prices" />
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
        <Header title="Catalog · Promotional Prices" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Tag className="h-8 w-8" />
                  Promotional Prices
                </h1>
                <p className="text-muted-foreground mt-1">Manage time-bound discounts and promotions</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Promotion
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Promotional Price</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Variant *</label>
                        <select
                          value={form.variantId}
                          onChange={e => setForm(prev => ({ ...prev, variantId: e.target.value }))}
                          className="select"
                          required
                        >
                          <option value="">Select...</option>
                          {variants.map(v => (
                            <option key={v.id} value={v.id}>{v.variantSku} - {v.name || 'N/A'}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Price List</label>
                        <select
                          value={form.priceListId}
                          onChange={e => setForm(prev => ({ ...prev, priceListId: e.target.value }))}
                          className="select"
                        >
                          <option value="">None</option>
                          {priceLists.map(pl => (
                            <option key={pl.id} value={pl.id}>{pl.name} ({pl.code})</option>
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
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Discount Type *</label>
                        <select
                          value={form.discountType}
                          onChange={e => setForm(prev => ({ ...prev, discountType: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="percentage">Percentage</option>
                          <option value="fixed_amount">Fixed Amount</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Discount Value *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={form.discountValue}
                          onChange={e => setForm(prev => ({ ...prev, discountValue: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Valid From *</label>
                        <input
                          type="datetime-local"
                          value={form.validFrom}
                          onChange={e => setForm(prev => ({ ...prev, validFrom: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Valid Until *</label>
                        <input
                          type="datetime-local"
                          value={form.validUntil}
                          onChange={e => setForm(prev => ({ ...prev, validUntil: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="cancelled">Cancelled</option>
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
                    <h3 className="text-lg font-semibold">Edit Promotional Price</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1.5">Price List</label>
                        <select
                          value={editForm.priceListId}
                          onChange={e => setEditForm(prev => ({ ...prev, priceListId: e.target.value }))}
                          className="select"
                        >
                          <option value="">None</option>
                          {priceLists.map(pl => (
                            <option key={pl.id} value={pl.id}>{pl.name} ({pl.code})</option>
                          ))}
                        </select>
                      </div>
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
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Discount Type *</label>
                        <select
                          value={editForm.discountType}
                          onChange={e => setEditForm(prev => ({ ...prev, discountType: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="percentage">Percentage</option>
                          <option value="fixed_amount">Fixed Amount</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Discount Value *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editForm.discountValue}
                          onChange={e => setEditForm(prev => ({ ...prev, discountValue: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Valid From *</label>
                        <input
                          type="datetime-local"
                          value={editForm.validFrom}
                          onChange={e => setEditForm(prev => ({ ...prev, validFrom: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Valid Until *</label>
                        <input
                          type="datetime-local"
                          value={editForm.validUntil}
                          onChange={e => setEditForm(prev => ({ ...prev, validUntil: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={editForm.status}
                          onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="cancelled">Cancelled</option>
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

