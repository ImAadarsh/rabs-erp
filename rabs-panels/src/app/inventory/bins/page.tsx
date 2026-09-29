'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listBins, createBin, updateBin, deleteBin, listWarehouses } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Package } from 'lucide-react';

type Bin = {
  id: string;
  code: string;
  name?: string;
  warehouse?: { id: string; name: string };
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  binType?: string;
  status?: string;
  [key: string]: any;
};

export default function BinsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Bin[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    warehouseId: '',
    code: '',
    name: '',
    zone: '',
    aisle: '',
    rack: '',
    shelf: '',
    binType: 'standard' as 'standard' | 'bulk' | 'cold_storage' | 'hazmat' | 'quarantine' | 'staging' | 'returns',
    status: 'active' as 'active' | 'inactive' | 'full' | 'maintenance'
  });
  const [editing, setEditing] = useState<Bin | null>(null);
  const [confirmDel, setConfirmDel] = useState<Bin | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  async function loadData() {
    try {
      setLoading(true);
      const [binsRes, warehousesRes] = await Promise.all([
        listBins(),
        listWarehouses()
      ]);
      setItems(binsRes.data || []);
      setWarehouses(warehousesRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load bins');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.warehouseId || !form.code) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const res = await createBin(form);
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      setForm({
        warehouseId: '',
        code: '',
        name: '',
        zone: '',
        aisle: '',
        rack: '',
        shelf: '',
        binType: 'standard',
        status: 'active'
      });
      toast.success('Bin created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create bin');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateBin(editing.id, form);
      setItems(prev => prev.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Bin updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update bin');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteBin(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Bin deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete bin');
    }
  }

  const columns = useMemo<ColumnDef<Bin>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Package size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.code}</span>
        </div>
      )
    },
    { accessorKey: 'name', header: 'Name' },
    {
      accessorKey: 'warehouse',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.warehouse?.name || 'N/A'}</span>
    },
    { accessorKey: 'zone', header: 'Zone' },
    { accessorKey: 'binType', header: 'Type' },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                warehouseId: row.original.warehouse?.id || '',
                code: row.original.code,
                name: row.original.name || '',
                zone: row.original.zone || '',
                aisle: row.original.aisle || '',
                rack: row.original.rack || '',
                shelf: row.original.shelf || '',
                binType: (row.original.binType || 'standard') as any,
                status: (row.original.status || 'active') as any
              });
            }}
            className="p-1 hover:bg-muted rounded"
          >
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
          <Header title="Inventory · Bins" />
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
          <Header title="Inventory · Bins" />
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
        <Header title="Inventory · Bins" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Bins</h1>
                <p className="text-muted-foreground mt-1">Manage warehouse storage bins</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Bin
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading bins...</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card">
                <RichDataTable columns={columns} data={items} searchPlaceholder="Search bins..." />
              </div>
            )}

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Bin</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Warehouse *</label>
                        <select
                          value={form.warehouseId}
                          onChange={e => setForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                          className="select"
                          required
                        >
                          <option value="">Select...</option>
                          {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
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
                        <label className="block text-sm font-medium mb-1.5">Name</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Type</label>
                        <select
                          value={form.binType}
                          onChange={e => setForm(prev => ({ ...prev, binType: e.target.value as any }))}
                          className="select"
                        >
                          <option value="standard">Standard</option>
                          <option value="bulk">Bulk</option>
                          <option value="cold_storage">Cold Storage</option>
                          <option value="hazmat">Hazmat</option>
                          <option value="quarantine">Quarantine</option>
                          <option value="staging">Staging</option>
                          <option value="returns">Returns</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Zone</label>
                        <input
                          type="text"
                          value={form.zone}
                          onChange={e => setForm(prev => ({ ...prev, zone: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Aisle</label>
                        <input
                          type="text"
                          value={form.aisle}
                          onChange={e => setForm(prev => ({ ...prev, aisle: e.target.value }))}
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
                          <option value="full">Full</option>
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

            {/* Edit Modal */}
            {editing && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit Bin</h3>
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
                        <label className="block text-sm font-medium mb-1.5">Name</label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Type</label>
                        <select
                          value={form.binType}
                          onChange={e => setForm(prev => ({ ...prev, binType: e.target.value as any }))}
                          className="select"
                        >
                          <option value="standard">Standard</option>
                          <option value="bulk">Bulk</option>
                          <option value="cold_storage">Cold Storage</option>
                          <option value="hazmat">Hazmat</option>
                          <option value="quarantine">Quarantine</option>
                          <option value="staging">Staging</option>
                          <option value="returns">Returns</option>
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
                          <option value="full">Full</option>
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

            {/* Delete Confirmation */}
            {confirmDel && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6">
                  <h3 className="text-lg font-semibold mb-2">Delete Bin</h3>
                  <p className="text-muted-foreground mb-4">Are you sure you want to delete {confirmDel.code}? This action cannot be undone.</p>
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

