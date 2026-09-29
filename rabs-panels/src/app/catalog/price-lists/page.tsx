'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { 
  listPriceLists, createPriceList, updatePriceList, deletePriceList,
  listOrganizations, listBusinessUnits
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2, Plus, X, DollarSign } from 'lucide-react';

type PriceList = {
  id: string;
  name: string;
  code: string;
  type: 'retail' | 'wholesale' | 'channel' | 'customer_tier' | 'region';
  currency: string;
  validFrom?: string | null;
  validUntil?: string | null;
  isDefault: boolean;
  status: 'active' | 'inactive';
  organization?: {
    id: string;
    name: string;
  };
  businessUnit?: {
    id: string;
    code: string;
    name: string;
  } | null;
  [key: string]: any;
};

export default function PriceListsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PriceList[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    organizationId: '',
    businessUnitId: '',
    name: '',
    code: '',
    type: 'retail' as 'retail' | 'wholesale' | 'channel' | 'customer_tier' | 'region',
    currency: 'GBP',
    validFrom: '',
    validUntil: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive'
  });
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    name: '',
    code: '',
    type: 'retail' as 'retail' | 'wholesale' | 'channel' | 'customer_tier' | 'region',
    currency: 'GBP',
    validFrom: '',
    validUntil: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive'
  });
  const [confirmDel, setConfirmDel] = useState<PriceList | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [priceListsRes, orgsRes] = await Promise.all([
          listPriceLists({ organizationId: session?.user?.organizationId }),
          listOrganizations()
        ]);
        setItems(priceListsRes.data || []);
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
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view price lists.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load price lists');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.organizationId || !form.name || !form.code) {
      toast.error('Please fill in required fields (Organization, Name, Code)');
      return;
    }
    try {
      const res = await createPriceList({
        organizationId: form.organizationId,
        businessUnitId: form.businessUnitId || undefined,
        name: form.name,
        code: form.code,
        type: form.type,
        currency: form.currency,
        validFrom: form.validFrom || undefined,
        validUntil: form.validUntil || undefined,
        isDefault: form.isDefault,
        status: form.status
      });
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        organizationId: session.user.organizationId || '',
        businessUnitId: '',
        name: '',
        code: '',
        type: 'retail',
        currency: 'GBP',
        validFrom: '',
        validUntil: '',
        isDefault: false,
        status: 'active'
      });
      toast.success('Price list created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  useEffect(() => {
    if (form.organizationId) {
      listBusinessUnits(form.organizationId).then(res => {
        setBusinessUnits(res.data || []);
        setForm(prev => ({ ...prev, businessUnitId: '' }));
      }).catch(e => {
        console.error('Failed to load business units:', e);
        setBusinessUnits([]);
      });
    } else {
      setBusinessUnits([]);
    }
  }, [form.organizationId]);

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updatePriceList(editing.id, {
        businessUnitId: editForm.businessUnitId || undefined,
        name: editForm.name,
        code: editForm.code,
        type: editForm.type,
        currency: editForm.currency,
        validFrom: editForm.validFrom || undefined,
        validUntil: editForm.validUntil || undefined,
        isDefault: editForm.isDefault,
        status: editForm.status
      });
      
      setItems(items.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Price list updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deletePriceList(confirmDel.id);
      setItems(items.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Price list deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
    }
  }

  const columns = useMemo<ColumnDef<PriceList>[]>(() => [
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
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const type = row.original.type;
        const labels: Record<string, string> = {
          retail: 'Retail',
          wholesale: 'Wholesale',
          channel: 'Channel',
          customer_tier: 'Customer Tier',
          region: 'Region'
        };
        return <span className="text-sm">{labels[type] || type}</span>;
      }
    },
    {
      accessorKey: 'currency',
      header: 'Currency',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.currency}</span>
    },
    {
      accessorKey: 'businessUnit',
      header: 'Business Unit',
      cell: ({ row }) => row.original.businessUnit?.name || '-'
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
                  businessUnitId: item.businessUnit?.id || '',
                  name: item.name,
                  code: item.code,
                  type: item.type,
                  currency: item.currency,
                  validFrom: item.validFrom || '',
                  validUntil: item.validUntil || '',
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
          <Header title="Catalog · Price Lists" />
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
          <Header title="Catalog · Price Lists" />
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
        <Header title="Catalog · Price Lists" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                  <DollarSign className="h-8 w-8" />
                  Price Lists
                </h1>
                <p className="text-muted-foreground mt-1">Manage pricing tiers and lists</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Price List
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Price List</h3>
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
                          className="select"
                          required
                        >
                          <option value="">Select...</option>
                          {organizations.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Business Unit</label>
                        <select
                          value={form.businessUnitId}
                          onChange={e => setForm(prev => ({ ...prev, businessUnitId: e.target.value }))}
                          className="select"
                        >
                          <option value="">None</option>
                          {businessUnits.map(bu => (
                            <option key={bu.id} value={bu.id}>{bu.name}</option>
                          ))}
                        </select>
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
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={form.type}
                          onChange={e => setForm(prev => ({ ...prev, type: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="retail">Retail</option>
                          <option value="wholesale">Wholesale</option>
                          <option value="channel">Channel</option>
                          <option value="customer_tier">Customer Tier</option>
                          <option value="region">Region</option>
                        </select>
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
                        <label className="block text-sm font-medium mb-1.5">Valid From</label>
                        <input
                          type="date"
                          value={form.validFrom}
                          onChange={e => setForm(prev => ({ ...prev, validFrom: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Valid Until</label>
                        <input
                          type="date"
                          value={form.validUntil}
                          onChange={e => setForm(prev => ({ ...prev, validUntil: e.target.value }))}
                          className="input"
                        />
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
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.isDefault}
                          onChange={e => setForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-sm">Set as default price list</span>
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
                    <h3 className="text-lg font-semibold">Edit Price List</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
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
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={editForm.type}
                          onChange={e => setEditForm(prev => ({ ...prev, type: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="retail">Retail</option>
                          <option value="wholesale">Wholesale</option>
                          <option value="channel">Channel</option>
                          <option value="customer_tier">Customer Tier</option>
                          <option value="region">Region</option>
                        </select>
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
                        <label className="block text-sm font-medium mb-1.5">Valid From</label>
                        <input
                          type="date"
                          value={editForm.validFrom}
                          onChange={e => setEditForm(prev => ({ ...prev, validFrom: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Valid Until</label>
                        <input
                          type="date"
                          value={editForm.validUntil}
                          onChange={e => setEditForm(prev => ({ ...prev, validUntil: e.target.value }))}
                          className="input"
                        />
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
                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editForm.isDefault}
                          onChange={e => setEditForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-sm">Set as default price list</span>
                      </label>
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

