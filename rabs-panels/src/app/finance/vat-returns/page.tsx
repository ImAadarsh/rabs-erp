'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listVatReturns, createVatReturn, updateVatReturn, deleteVatReturn, listOrganizations, listBusinessUnits } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type VatReturn = {
  id: string;
  returnNumber: string;
  periodStart: string;
  periodEnd: string;
  vatDueSales: number;
  vatDueAcquisitions: number;
  vatReclaimed: number;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected';
  organization?: { id: string; name: string };
  businessUnit?: { id: string; name: string } | null;
};

export default function VatReturnsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<VatReturn[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    businessUnitId: '',
    returnNumber: '',
    periodStart: '',
    periodEnd: '',
    vatDueSales: 0,
    vatDueAcquisitions: 0,
    vatReclaimed: 0,
    totalValueSales: 0,
    totalValuePurchases: 0,
    totalValueGoodsSupplied: 0,
    totalAcquisitions: 0,
    status: 'draft' as 'draft' | 'submitted' | 'accepted' | 'rejected',
    mtdReference: ''
  });
  const [editing, setEditing] = useState<VatReturn | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    returnNumber: '',
    periodStart: '',
    periodEnd: '',
    vatDueSales: 0,
    vatDueAcquisitions: 0,
    vatReclaimed: 0,
    totalValueSales: 0,
    totalValuePurchases: 0,
    totalValueGoodsSupplied: 0,
    totalAcquisitions: 0,
    status: 'draft' as 'draft' | 'submitted' | 'accepted' | 'rejected',
    mtdReference: ''
  });
  const [confirmDel, setConfirmDel] = useState<VatReturn | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [returnsRes, orgsRes] = await Promise.all([
          listVatReturns({ organizationId: session?.user?.organizationId }),
          listOrganizations()
        ]);
        setItems(returnsRes.data || []);
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
          toast.error('You do not have permission to view VAT returns.');
        } else {
          toast.error('Failed to load VAT returns');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.returnNumber || !form.periodStart || !form.periodEnd) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createVatReturn(form);
      toast.success('VAT Return created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        businessUnitId: '',
        returnNumber: '',
        periodStart: '',
        periodEnd: '',
        vatDueSales: 0,
        vatDueAcquisitions: 0,
        vatReclaimed: 0,
        totalValueSales: 0,
        totalValuePurchases: 0,
        totalValueGoodsSupplied: 0,
        totalAcquisitions: 0,
        status: 'draft',
        mtdReference: ''
      });
      const res = await listVatReturns({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create VAT return');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.returnNumber || !editForm.periodStart || !editForm.periodEnd) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateVatReturn(editing.id, editForm);
      toast.success('VAT Return updated');
      setEditing(null);
      const res = await listVatReturns({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update VAT return');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteVatReturn(confirmDel.id);
      toast.success('VAT Return deleted');
      setConfirmDel(null);
      const res = await listVatReturns({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete VAT return');
    }
  }

  const columns = useMemo<ColumnDef<VatReturn>[]>(() => [
    { accessorKey: 'returnNumber', header: 'Return Number' },
    { 
      accessorKey: 'periodStart', 
      header: 'Period',
      cell: ({ row }) => {
        const start = new Date(row.original.periodStart).toLocaleDateString();
        const end = new Date(row.original.periodEnd).toLocaleDateString();
        return `${start} - ${end}`;
      }
    },
    { 
      accessorKey: 'vatDueSales', 
      header: 'VAT Due Sales',
      cell: ({ row }) => `£${row.original.vatDueSales.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    },
    { 
      accessorKey: 'vatReclaimed', 
      header: 'VAT Reclaimed',
      cell: ({ row }) => `£${row.original.vatReclaimed.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
    },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      cell: ({ row }) => {
        const canEdit = row.original.status === 'draft';
        return (
          <div className="flex gap-2">
            {canEdit && (
              <button onClick={() => {
                const item = row.original;
                setEditing(item);
                setEditForm({
                  businessUnitId: item.businessUnit?.id || '',
                  returnNumber: item.returnNumber,
                  periodStart: item.periodStart,
                  periodEnd: item.periodEnd,
                  vatDueSales: item.vatDueSales,
                  vatDueAcquisitions: item.vatDueAcquisitions,
                  vatReclaimed: item.vatReclaimed,
                  totalValueSales: (item as any).totalValueSales || 0,
                  totalValuePurchases: (item as any).totalValuePurchases || 0,
                  totalValueGoodsSupplied: (item as any).totalValueGoodsSupplied || 0,
                  totalAcquisitions: (item as any).totalAcquisitions || 0,
                  status: item.status,
                  mtdReference: (item as any).mtdReference || ''
                });
              }} className="p-1.5 hover:bg-muted rounded">
                <Pencil size={16} />
              </button>
            )}
            {canEdit && (
              <button onClick={() => setConfirmDel(row.original)} className="p-1.5 hover:bg-muted rounded text-destructive">
                <Trash2 size={16} />
              </button>
            )}
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
          <Header title="Finance · VAT Returns" />
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
          <Header title="Finance · VAT Returns" />
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
        <Header title="Finance · VAT Returns" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">VAT Returns</h1>
                <p className="text-muted-foreground mt-1">Manage VAT return filings</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New VAT Return
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-3xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create VAT Return</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Return Number *</label>
                      <input
                        type="text"
                        value={form.returnNumber}
                        onChange={(e) => setForm({ ...form, returnNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Period Start *</label>
                        <input
                          type="date"
                          value={form.periodStart}
                          onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Period End *</label>
                        <input
                          type="date"
                          value={form.periodEnd}
                          onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">VAT Due Sales</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.vatDueSales}
                          onChange={(e) => setForm({ ...form, vatDueSales: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">VAT Due Acquisitions</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.vatDueAcquisitions}
                          onChange={(e) => setForm({ ...form, vatDueAcquisitions: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">VAT Reclaimed</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.vatReclaimed}
                          onChange={(e) => setForm({ ...form, vatReclaimed: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">MTD Reference</label>
                      <input
                        type="text"
                        value={form.mtdReference}
                        onChange={(e) => setForm({ ...form, mtdReference: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
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
                <div className="bg-card rounded-lg border border-border max-w-3xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Edit VAT Return</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Return Number *</label>
                      <input
                        type="text"
                        value={editForm.returnNumber}
                        onChange={(e) => setEditForm({ ...editForm, returnNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Period Start *</label>
                        <input
                          type="date"
                          value={editForm.periodStart}
                          onChange={(e) => setEditForm({ ...editForm, periodStart: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Period End *</label>
                        <input
                          type="date"
                          value={editForm.periodEnd}
                          onChange={(e) => setEditForm({ ...editForm, periodEnd: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">VAT Due Sales</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.vatDueSales}
                          onChange={(e) => setEditForm({ ...editForm, vatDueSales: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">VAT Due Acquisitions</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.vatDueAcquisitions}
                          onChange={(e) => setEditForm({ ...editForm, vatDueAcquisitions: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">VAT Reclaimed</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.vatReclaimed}
                          onChange={(e) => setEditForm({ ...editForm, vatReclaimed: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">MTD Reference</label>
                      <input
                        type="text"
                        value={editForm.mtdReference}
                        onChange={(e) => setEditForm({ ...editForm, mtdReference: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      />
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
                    Are you sure you want to delete "{confirmDel.returnNumber}"? This action cannot be undone.
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

