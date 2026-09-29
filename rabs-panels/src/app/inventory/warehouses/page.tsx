'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, listLocations } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  location?: { id: string; name: string };
  [key: string]: any;
};

export default function WarehousesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    locationId: '',
    code: '',
    name: '',
    type: 'main_hub' as 'main_hub' | 'distribution_center' | 'store' | 'third_party' | 'other',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateProvince: '',
    postalCode: '',
    countryCode: 'GB',
    capacityCubicMeters: '',
    isDefault: false,
    status: 'active' as 'active' | 'inactive' | 'maintenance'
  });
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [confirmDel, setConfirmDel] = useState<Warehouse | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [warehousesRes, locationsRes] = await Promise.all([
          listWarehouses(),
          listLocations(undefined, session?.user?.organizationId)
        ]);
        setItems(warehousesRes.data || []);
        setLocations(locationsRes.data || []);
      } catch (e: any) {
        toast.error('Failed to load warehouses');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.locationId || !form.code || !form.name) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const payload: any = {
        ...form,
        capacityCubicMeters: form.capacityCubicMeters ? parseFloat(form.capacityCubicMeters) : undefined,
        addressLine1: form.addressLine1 || undefined,
        addressLine2: form.addressLine2 || undefined,
        city: form.city || undefined,
        stateProvince: form.stateProvince || undefined,
        postalCode: form.postalCode || undefined
      };
      const res = await createWarehouse(payload);
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      setForm({
        locationId: '',
        code: '',
        name: '',
        type: 'main_hub',
        addressLine1: '',
        addressLine2: '',
        city: '',
        stateProvince: '',
        postalCode: '',
        countryCode: 'GB',
        capacityCubicMeters: '',
        isDefault: false,
        status: 'active'
      });
      toast.success('Warehouse created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create warehouse');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const payload: any = {
        ...form,
        capacityCubicMeters: form.capacityCubicMeters ? parseFloat(form.capacityCubicMeters) : undefined,
        addressLine1: form.addressLine1 || undefined,
        addressLine2: form.addressLine2 || undefined,
        city: form.city || undefined,
        stateProvince: form.stateProvince || undefined,
        postalCode: form.postalCode || undefined
      };
      const res = await updateWarehouse(editing.id, payload);
      setItems(prev => prev.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Warehouse updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update warehouse');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteWarehouse(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Warehouse deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete warehouse');
    }
  }

  const columns = useMemo<ColumnDef<Warehouse>[]>(() => [
    { accessorKey: 'code', header: 'Code' },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'type', header: 'Type' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'location.name', header: 'Location' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => {
            setEditing(row.original);
            setForm({
              locationId: row.original.location?.id || '',
              code: row.original.code,
              name: row.original.name,
              type: row.original.type as any,
              addressLine1: row.original.addressLine1 || '',
              addressLine2: row.original.addressLine2 || '',
              city: row.original.city || '',
              stateProvince: row.original.stateProvince || '',
              postalCode: row.original.postalCode || '',
              countryCode: row.original.countryCode || 'GB',
              capacityCubicMeters: row.original.capacityCubicMeters?.toString() || '',
              isDefault: row.original.isDefault || false,
              status: row.original.status as any
            });
          }} className="p-1 hover:bg-muted rounded">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => setConfirmDel(row.original)} className="p-1 hover:bg-muted rounded text-red-500">
            <Trash2 className="h-4 w-4" />
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
          <Header title="Inventory · Warehouses" />
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
          <Header title="Inventory · Warehouses" />
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
        <Header title="Inventory · Warehouses" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Warehouses</h1>
                <p className="text-muted-foreground mt-1">Manage warehouse locations</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Warehouse
              </button>
            </div>

            <RichDataTable columns={columns} data={items} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Warehouse</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Location *</label>
                        <select
                          value={form.locationId}
                          onChange={e => setForm(prev => ({ ...prev, locationId: e.target.value }))}
                          className="select"
                          required
                        >
                          <option value="">Select...</option>
                          {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
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
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={form.type}
                          onChange={e => setForm(prev => ({ ...prev, type: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="main_hub">Main Hub</option>
                          <option value="distribution_center">Distribution Center</option>
                          <option value="store">Store</option>
                          <option value="third_party">Third Party</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Country Code *</label>
                        <input
                          type="text"
                          maxLength={2}
                          value={form.countryCode}
                          onChange={e => setForm(prev => ({ ...prev, countryCode: e.target.value.toUpperCase() }))}
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
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="maintenance">Maintenance</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600">
                        Create
                      </button>
                      <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                        Cancel
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
                    <h3 className="text-lg font-semibold">Edit Warehouse</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
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
                        <label className="block text-sm font-medium mb-1.5">Type *</label>
                        <select
                          value={form.type}
                          onChange={e => setForm(prev => ({ ...prev, type: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="main_hub">Main Hub</option>
                          <option value="distribution_center">Distribution Center</option>
                          <option value="store">Store</option>
                          <option value="third_party">Third Party</option>
                          <option value="other">Other</option>
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
                          <option value="maintenance">Maintenance</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600">
                        Update
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {confirmDel && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6">
                  <h3 className="text-lg font-semibold mb-2">Delete Warehouse</h3>
                  <p className="text-muted-foreground mb-4">Are you sure you want to delete {confirmDel.name}? This action cannot be undone.</p>
                  <div className="flex gap-2">
                    <button onClick={onDelete} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                      Delete
                    </button>
                    <button onClick={() => setConfirmDel(null)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
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

