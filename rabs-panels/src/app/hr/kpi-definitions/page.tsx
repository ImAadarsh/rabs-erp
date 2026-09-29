'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listKpiDefinitions, createKpiDefinition, updateKpiDefinition, deleteKpiDefinition } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type KpiDefinition = {
  id: string;
  kpiCode: string;
  kpiName: string;
  kpiCategory: 'sales' | 'operations' | 'finance' | 'customer_service' | 'hr' | 'marketing' | 'other';
  unitOfMeasure?: string;
  targetValue?: number;
  isHigherBetter: boolean;
  isActive: boolean;
};

export default function KpiDefinitionsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<KpiDefinition[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    kpiCode: '',
    kpiName: '',
    kpiCategory: 'hr' as 'sales' | 'operations' | 'finance' | 'customer_service' | 'hr' | 'marketing' | 'other',
    description: '',
    unitOfMeasure: '',
    targetValue: '',
    calculationMethod: '',
    isHigherBetter: true,
    isActive: true
  });
  const [editing, setEditing] = useState<KpiDefinition | null>(null);
  const [editForm, setEditForm] = useState({
    kpiCode: '',
    kpiName: '',
    kpiCategory: 'hr' as 'sales' | 'operations' | 'finance' | 'customer_service' | 'hr' | 'marketing' | 'other',
    description: '',
    unitOfMeasure: '',
    targetValue: '',
    calculationMethod: '',
    isHigherBetter: true,
    isActive: true
  });
  const [confirmDel, setConfirmDel] = useState<KpiDefinition | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const res = await listKpiDefinitions({ organizationId: session?.user?.organizationId });
        setItems(res.data || []);
        if (session?.user?.organizationId) {
          setForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
        }
      } catch (e: any) {
        toast.error('Failed to load KPI definitions');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.kpiCode || !form.kpiName) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createKpiDefinition({
        ...form,
        targetValue: form.targetValue ? parseFloat(form.targetValue) : undefined
      });
      toast.success('KPI Definition created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        kpiCode: '',
        kpiName: '',
        kpiCategory: 'hr',
        description: '',
        unitOfMeasure: '',
        targetValue: '',
        calculationMethod: '',
        isHigherBetter: true,
        isActive: true
      });
      const res = await listKpiDefinitions({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create KPI definition');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.kpiCode || !editForm.kpiName) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateKpiDefinition(editing.id, {
        ...editForm,
        targetValue: editForm.targetValue ? parseFloat(editForm.targetValue) : undefined
      });
      toast.success('KPI Definition updated');
      setEditing(null);
      const res = await listKpiDefinitions({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update KPI definition');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteKpiDefinition(confirmDel.id);
      toast.success('KPI Definition deleted');
      setConfirmDel(null);
      const res = await listKpiDefinitions({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete KPI definition');
    }
  }

  const columns = useMemo<ColumnDef<KpiDefinition>[]>(() => [
    { accessorKey: 'kpiCode', header: 'KPI Code' },
    { accessorKey: 'kpiName', header: 'KPI Name' },
    { 
      accessorKey: 'kpiCategory', 
      header: 'Category',
      cell: ({ row }) => row.original.kpiCategory.replace(/_/g, ' ').toUpperCase()
    },
    { 
      accessorKey: 'unitOfMeasure', 
      header: 'Unit',
      cell: ({ row }) => row.original.unitOfMeasure || '-'
    },
    { 
      accessorKey: 'targetValue', 
      header: 'Target',
      cell: ({ row }) => row.original.targetValue ? row.original.targetValue.toLocaleString() : '-'
    },
    {
      accessorKey: 'isActive',
      header: 'Active',
      cell: ({ row }) => row.original.isActive ? 'Yes' : 'No'
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => {
            const item = row.original;
            setEditing(item);
            setEditForm({
              kpiCode: item.kpiCode,
              kpiName: item.kpiName,
              kpiCategory: item.kpiCategory,
              description: (item as any).description || '',
              unitOfMeasure: item.unitOfMeasure || '',
              targetValue: item.targetValue?.toString() || '',
              calculationMethod: (item as any).calculationMethod || '',
              isHigherBetter: item.isHigherBetter,
              isActive: item.isActive
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
          <Header title="HR · KPI Definitions" />
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
          <Header title="HR · KPI Definitions" />
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
        <Header title="HR · KPI Definitions" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">KPI Definitions</h1>
                <p className="text-muted-foreground mt-1">Define and manage performance metrics</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New KPI Definition
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create KPI Definition</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">KPI Code *</label>
                        <input
                          type="text"
                          value={form.kpiCode}
                          onChange={(e) => setForm({ ...form, kpiCode: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">KPI Category *</label>
                        <select
                          value={form.kpiCategory}
                          onChange={(e) => setForm({ ...form, kpiCategory: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="sales">Sales</option>
                          <option value="operations">Operations</option>
                          <option value="finance">Finance</option>
                          <option value="customer_service">Customer Service</option>
                          <option value="hr">HR</option>
                          <option value="marketing">Marketing</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">KPI Name *</label>
                      <input
                        type="text"
                        value={form.kpiName}
                        onChange={(e) => setForm({ ...form, kpiName: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Unit of Measure</label>
                        <input
                          type="text"
                          value={form.unitOfMeasure}
                          onChange={(e) => setForm({ ...form, unitOfMeasure: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Target Value</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.targetValue}
                          onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isHigherBetter"
                        checked={form.isHigherBetter}
                        onChange={(e) => setForm({ ...form, isHigherBetter: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="isHigherBetter" className="text-sm">Higher is Better</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={form.isActive}
                        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="isActive" className="text-sm">Active</label>
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
                    <h2 className="text-xl font-bold">Edit KPI Definition</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">KPI Name *</label>
                      <input
                        type="text"
                        value={editForm.kpiName}
                        onChange={(e) => setEditForm({ ...editForm, kpiName: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="editIsActive"
                        checked={editForm.isActive}
                        onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label htmlFor="editIsActive" className="text-sm">Active</label>
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
                    Are you sure you want to delete KPI definition "{confirmDel.kpiName}"? This action cannot be undone.
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

