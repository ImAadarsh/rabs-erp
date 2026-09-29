'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listASN, createASN, updateASN, deleteASN, listSuppliers, listWarehouses, listPurchaseOrders } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, PackageSearch } from 'lucide-react';

type ASN = {
  id: string;
  asnNumber: string;
  reference?: string;
  expectedDate: string;
  carrier?: string;
  trackingNumber?: string;
  status: string;
  supplier?: { id: string; name: string };
  warehouse?: { id: string; name: string };
  purchaseOrder?: { id: string; poNumber: string } | null;
  [key: string]: any;
};

export default function ASNPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ASN[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ASN | null>(null);
  const [confirmDel, setConfirmDel] = useState<ASN | null>(null);
  
  const [form, setForm] = useState({
    purchaseOrderId: '',
    supplierId: '',
    warehouseId: '',
    asnNumber: '',
    reference: '',
    expectedDate: '',
    carrier: '',
    trackingNumber: '',
    totalPallets: '',
    totalCartons: '',
    status: 'pending' as 'pending' | 'in_transit' | 'arrived' | 'receiving' | 'completed' | 'cancelled',
    notes: ''
  });

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
      const [asnRes, suppliersRes, warehousesRes, poRes] = await Promise.all([
        listASN(),
        listSuppliers(),
        listWarehouses(),
        listPurchaseOrders()
      ]);
      setItems(asnRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setWarehouses(warehousesRes.data || []);
      setPurchaseOrders(poRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load ASN');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId || !form.warehouseId || !form.asnNumber || !form.expectedDate) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const payload: any = {
        organizationId: session?.user?.organizationId,
        supplierId: form.supplierId,
        warehouseId: form.warehouseId,
        asnNumber: form.asnNumber,
        expectedDate: form.expectedDate,
        status: form.status
      };
      if (form.purchaseOrderId) payload.purchaseOrderId = form.purchaseOrderId;
      if (form.reference) payload.reference = form.reference;
      if (form.carrier) payload.carrier = form.carrier;
      if (form.trackingNumber) payload.trackingNumber = form.trackingNumber;
      if (form.totalPallets) payload.totalPallets = parseInt(form.totalPallets);
      if (form.totalCartons) payload.totalCartons = parseInt(form.totalCartons);
      if (form.notes) payload.notes = form.notes;

      const res = await createASN(payload);
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      resetForm();
      toast.success('ASN created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create ASN');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const payload: any = {};
      if (form.asnNumber) payload.asnNumber = form.asnNumber;
      if (form.reference !== undefined) payload.reference = form.reference;
      if (form.expectedDate) payload.expectedDate = form.expectedDate;
      if (form.carrier !== undefined) payload.carrier = form.carrier;
      if (form.trackingNumber !== undefined) payload.trackingNumber = form.trackingNumber;
      if (form.totalPallets) payload.totalPallets = parseInt(form.totalPallets);
      if (form.totalCartons) payload.totalCartons = parseInt(form.totalCartons);
      if (form.status) payload.status = form.status;
      if (form.notes !== undefined) payload.notes = form.notes;

      const res = await updateASN(editing.id, payload);
      setItems(prev => prev.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      resetForm();
      toast.success('ASN updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update ASN');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteASN(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('ASN deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete ASN');
    }
  }

  function resetForm() {
    setForm({
      purchaseOrderId: '',
      supplierId: '',
      warehouseId: '',
      asnNumber: '',
      reference: '',
      expectedDate: '',
      carrier: '',
      trackingNumber: '',
      totalPallets: '',
      totalCartons: '',
      status: 'pending',
      notes: ''
    });
  }

  const columns = useMemo<ColumnDef<ASN>[]>(() => [
    {
      accessorKey: 'asnNumber',
      header: 'ASN Number',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <PackageSearch size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.asnNumber}</span>
        </div>
      )
    },
    {
      accessorKey: 'supplier.name',
      header: 'Supplier',
      cell: ({ row }) => <span className="text-sm">{row.original.supplier?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'warehouse.name',
      header: 'Warehouse',
      cell: ({ row }) => <span className="text-sm">{row.original.warehouse?.name || 'N/A'}</span>
    },
    {
      accessorKey: 'purchaseOrder.poNumber',
      header: 'PO Number',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.purchaseOrder?.poNumber || '—'}</span>
    },
    {
      accessorKey: 'expectedDate',
      header: 'Expected Date',
      cell: ({ row }) => <span className="text-sm">{new Date(row.original.expectedDate).toLocaleDateString()}</span>
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'pending';
        const colors: Record<string, string> = {
          pending: 'bg-yellow-100 text-yellow-800',
          in_transit: 'bg-blue-100 text-blue-800',
          arrived: 'bg-green-100 text-green-800',
          receiving: 'bg-purple-100 text-purple-800',
          completed: 'bg-gray-100 text-gray-800',
          cancelled: 'bg-red-100 text-red-800'
        };
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
            {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              const item = row.original;
              setEditing(item);
              setForm({
                purchaseOrderId: item.purchaseOrder?.id || '',
                supplierId: item.supplier?.id || '',
                warehouseId: item.warehouse?.id || '',
                asnNumber: item.asnNumber,
                reference: item.reference || '',
                expectedDate: new Date(item.expectedDate).toISOString().split('T')[0],
                carrier: item.carrier || '',
                trackingNumber: item.trackingNumber || '',
                totalPallets: item.totalPallets?.toString() || '',
                totalCartons: item.totalCartons?.toString() || '',
                status: item.status as any,
                notes: item.notes || ''
              });
            }}
            className="p-1 hover:bg-muted rounded"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button 
            onClick={() => setConfirmDel(row.original)} 
            className="p-1 hover:bg-muted rounded text-red-500"
            title="Delete"
          >
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
          <Header title="Inventory · ASN" />
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
          <Header title="Inventory · ASN" />
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
        <Header title="Inventory · ASN" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold">Advanced Shipping Notices</h1>
                <p className="text-muted-foreground mt-1">Track inbound shipments from suppliers</p>
              </div>
              <button
                onClick={() => {
                  setShowCreate(true);
                  resetForm();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create ASN
              </button>
            </div>

            <div className="rounded-2xl border border-border bg-card">
              <RichDataTable columns={columns} data={items} searchPlaceholder="Search ASN..." />
            </div>

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create ASN</h3>
                    <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">ASN Number <span className="text-destructive">*</span></label>
                        <input
                          type="text"
                          value={form.asnNumber}
                          onChange={e => setForm(prev => ({ ...prev, asnNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Supplier <span className="text-destructive">*</span></label>
                        <select
                          value={form.supplierId}
                          onChange={e => setForm(prev => ({ ...prev, supplierId: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        >
                          <option value="">Select supplier...</option>
                          {suppliers.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Warehouse <span className="text-destructive">*</span></label>
                        <select
                          value={form.warehouseId}
                          onChange={e => setForm(prev => ({ ...prev, warehouseId: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        >
                          <option value="">Select warehouse...</option>
                          {warehouses.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Purchase Order</label>
                        <select
                          value={form.purchaseOrderId}
                          onChange={e => setForm(prev => ({ ...prev, purchaseOrderId: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">None</option>
                          {purchaseOrders.map(po => (
                            <option key={po.id} value={po.id}>{po.poNumber}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Expected Date <span className="text-destructive">*</span></label>
                        <input
                          type="date"
                          value={form.expectedDate}
                          onChange={e => setForm(prev => ({ ...prev, expectedDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_transit">In Transit</option>
                          <option value="arrived">Arrived</option>
                          <option value="receiving">Receiving</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Reference</label>
                        <input
                          type="text"
                          value={form.reference}
                          onChange={e => setForm(prev => ({ ...prev, reference: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Carrier</label>
                        <input
                          type="text"
                          value={form.carrier}
                          onChange={e => setForm(prev => ({ ...prev, carrier: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Tracking Number</label>
                        <input
                          type="text"
                          value={form.trackingNumber}
                          onChange={e => setForm(prev => ({ ...prev, trackingNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Total Pallets</label>
                        <input
                          type="number"
                          value={form.totalPallets}
                          onChange={e => setForm(prev => ({ ...prev, totalPallets: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Total Cartons</label>
                        <input
                          type="number"
                          value={form.totalCartons}
                          onChange={e => setForm(prev => ({ ...prev, totalCartons: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors">
                        Create
                      </button>
                      <button 
                        type="button" 
                        onClick={() => { setShowCreate(false); resetForm(); }} 
                        className="px-4 py-2 bg-muted rounded hover:bg-muted/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Modal - Similar structure, using editing state */}
            {editing && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit ASN</h3>
                    <button onClick={() => { setEditing(null); resetForm(); }} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    {/* Similar form fields as create, but read-only for supplier/warehouse */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">ASN Number</label>
                        <input
                          type="text"
                          value={form.asnNumber}
                          onChange={e => setForm(prev => ({ ...prev, asnNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Supplier</label>
                        <div className="px-4 py-2 border border-border rounded-lg bg-muted text-muted-foreground">
                          {editing.supplier?.name || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Warehouse</label>
                        <div className="px-4 py-2 border border-border rounded-lg bg-muted text-muted-foreground">
                          {editing.warehouse?.name || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Expected Date</label>
                        <input
                          type="date"
                          value={form.expectedDate}
                          onChange={e => setForm(prev => ({ ...prev, expectedDate: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_transit">In Transit</option>
                          <option value="arrived">Arrived</option>
                          <option value="receiving">Receiving</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Reference</label>
                        <input
                          type="text"
                          value={form.reference}
                          onChange={e => setForm(prev => ({ ...prev, reference: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Carrier</label>
                        <input
                          type="text"
                          value={form.carrier}
                          onChange={e => setForm(prev => ({ ...prev, carrier: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Tracking Number</label>
                        <input
                          type="text"
                          value={form.trackingNumber}
                          onChange={e => setForm(prev => ({ ...prev, trackingNumber: e.target.value }))}
                          className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 transition-colors">
                        Update
                      </button>
                      <button 
                        type="button" 
                        onClick={() => { setEditing(null); resetForm(); }} 
                        className="px-4 py-2 bg-muted rounded hover:bg-muted/80 transition-colors"
                      >
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
                  <h3 className="text-lg font-semibold mb-2">Delete ASN</h3>
                  <p className="text-muted-foreground mb-4">
                    Are you sure you want to delete ASN {confirmDel.asnNumber}? This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={onDelete} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                      Delete
                    </button>
                    <button onClick={() => setConfirmDel(null)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80 transition-colors">
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

