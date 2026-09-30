'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listKpiRecords, createKpiRecord, updateKpiRecord, deleteKpiRecord, listKpiDefinitions, listEmployees, listBusinessUnits, listLocations } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type KpiRecord = {
  id: string;
  periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  periodStart: string;
  periodEnd: string;
  actualValue: number;
  targetValue?: number;
  variance?: number;
  kpiDefinition?: { id: string; kpiCode: string; kpiName: string };
  employee?: { id: string; firstName: string; lastName: string } | null;
};

export default function KpiRecordsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<KpiRecord[]>([]);
  const [kpiDefinitions, setKpiDefinitions] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    kpiDefinitionId: '',
    businessUnitId: '',
    locationId: '',
    employeeId: '',
    periodType: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    periodStart: '',
    periodEnd: '',
    actualValue: 0,
    targetValue: '',
    variancePercent: '',
    notes: ''
  });
  const [editing, setEditing] = useState<KpiRecord | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    locationId: '',
    employeeId: '',
    periodType: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    periodStart: '',
    periodEnd: '',
    actualValue: 0,
    targetValue: '',
    variancePercent: '',
    notes: ''
  });
  const [confirmDel, setConfirmDel] = useState<KpiRecord | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [recordsRes, kpiRes, empRes] = await Promise.all([
          listKpiRecords({}),
          listKpiDefinitions({ organizationId: session?.user?.organizationId }),
          listEmployees({ organizationId: session?.user?.organizationId })
        ]);
        setItems(recordsRes.data || []);
        setKpiDefinitions(kpiRes.data || []);
        setEmployees(empRes.data || []);
        
        if (session?.user?.organizationId) {
          try {
            const buRes = await listBusinessUnits(session.user.organizationId);
            setBusinessUnits(buRes.data || []);
          } catch (e) {
            console.error('Failed to load business units:', e);
          }
        }
      } catch (e: any) {
        toast.error('Failed to load KPI records');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kpiDefinitionId || !form.periodStart || !form.periodEnd || form.actualValue === undefined) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createKpiRecord({
        ...form,
        actualValue: parseFloat(form.actualValue.toString()),
        targetValue: form.targetValue ? parseFloat(form.targetValue) : undefined,
        variancePercent: form.variancePercent ? parseFloat(form.variancePercent) : undefined
      });
      toast.success('KPI Record created');
      setShowCreate(false);
      setForm({
        kpiDefinitionId: '',
        businessUnitId: '',
        locationId: '',
        employeeId: '',
        periodType: 'monthly',
        periodStart: '',
        periodEnd: '',
        actualValue: 0,
        targetValue: '',
        variancePercent: '',
        notes: ''
      });
      const res = await listKpiRecords({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create KPI record');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateKpiRecord(editing.id, {
        ...editForm,
        actualValue: editForm.actualValue ? parseFloat(editForm.actualValue.toString()) : undefined,
        targetValue: editForm.targetValue ? parseFloat(editForm.targetValue) : undefined,
        variancePercent: editForm.variancePercent ? parseFloat(editForm.variancePercent) : undefined
      });
      toast.success('KPI Record updated');
      setEditing(null);
      const res = await listKpiRecords({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update KPI record');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteKpiRecord(confirmDel.id);
      toast.success('KPI Record deleted');
      setConfirmDel(null);
      const res = await listKpiRecords({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete KPI record');
    }
  }

  const columns = useMemo<ColumnDef<KpiRecord>[]>(() => [
    { 
      accessorKey: 'kpiDefinition',
      header: 'KPI',
      cell: ({ row }) => row.original.kpiDefinition ? `${row.original.kpiDefinition.kpiCode} - ${row.original.kpiDefinition.kpiName}` : '-'
    },
    { 
      accessorKey: 'employee',
      header: 'Employee',
      cell: ({ row }) => row.original.employee ? `${row.original.employee.firstName} ${row.original.employee.lastName}` : '-'
    },
    { 
      accessorKey: 'periodType', 
      header: 'Period Type',
      cell: ({ row }) => row.original.periodType.toUpperCase()
    },
    { 
      accessorKey: 'periodStart', 
      header: 'Period Start',
      cell: ({ row }) => row.original.periodStart ? new Date(row.original.periodStart).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'periodEnd', 
      header: 'Period End',
      cell: ({ row }) => row.original.periodEnd ? new Date(row.original.periodEnd).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'actualValue', 
      header: 'Actual',
      cell: ({ row }) => row.original.actualValue.toLocaleString()
    },
    { 
      accessorKey: 'targetValue', 
      header: 'Target',
      cell: ({ row }) => row.original.targetValue ? row.original.targetValue.toLocaleString() : '-'
    },
    { 
      accessorKey: 'variance', 
      header: 'Variance',
      cell: ({ row }) => row.original.variance ? row.original.variance.toLocaleString() : '-'
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => {
            const item = row.original;
            setEditing(item);
            setEditForm({
              businessUnitId: (item as any).businessUnit?.id || '',
              locationId: (item as any).location?.id || '',
              employeeId: item.employee?.id || '',
              periodType: item.periodType,
              periodStart: item.periodStart,
              periodEnd: item.periodEnd,
              actualValue: item.actualValue,
              targetValue: item.targetValue?.toString() || '',
              variancePercent: (item as any).variancePercent?.toString() || '',
              notes: (item as any).notes || ''
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
          <Header title="HR · KPI Records" />
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
          <Header title="HR · KPI Records" />
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
        <Header title="HR · KPI Records" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">KPI Records</h1>
                <p className="text-muted-foreground mt-1">Track and analyze performance data</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New KPI Record
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create KPI Record</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">KPI Definition *</label>
                      <select
                        value={form.kpiDefinitionId}
                        onChange={(e) => setForm({ ...form, kpiDefinitionId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select KPI Definition</option>
                        {kpiDefinitions.map(kpi => (
                          <option key={kpi.id} value={kpi.id}>{kpi.kpiCode} - {kpi.kpiName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Employee</label>
                      <select
                        value={form.employeeId}
                        onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Period Type *</label>
                        <select
                          value={form.periodType}
                          onChange={(e) => setForm({ ...form, periodType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Actual Value *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.actualValue}
                          onChange={(e) => setForm({ ...form, actualValue: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
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
                    <h2 className="text-xl font-bold">Edit KPI Record</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Actual Value</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.actualValue}
                        onChange={(e) => setEditForm({ ...editForm, actualValue: parseFloat(e.target.value) || 0 })}
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
                    Are you sure you want to delete this KPI record? This action cannot be undone.
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

