'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listEmploymentContracts, createEmploymentContract, updateEmploymentContract, deleteEmploymentContract, listEmployees, listBusinessUnits, listLocations, listCostCenters } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type EmploymentContract = {
  id: string;
  jobTitle: string;
  department?: string;
  contractType: 'permanent' | 'fixed_term' | 'contract' | 'zero_hours';
  startDate: string;
  endDate?: string;
  salaryAmount: number;
  salaryCurrency: string;
  salaryPeriod: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual';
  status: 'draft' | 'active' | 'expired' | 'terminated';
  employee?: { id: string; firstName: string; lastName: string };
  businessUnit?: { id: string; name: string };
};

export default function EmploymentContractsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EmploymentContract[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    businessUnitId: '',
    locationId: '',
    costCenterId: '',
    jobTitle: '',
    department: '',
    reportingTo: '',
    contractType: 'permanent' as 'permanent' | 'fixed_term' | 'contract' | 'zero_hours',
    startDate: '',
    endDate: '',
    salaryAmount: 0,
    salaryCurrency: 'GBP',
    salaryPeriod: 'annual' as 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual',
    workingHoursPerWeek: '',
    probationPeriodDays: '',
    noticePeriodDays: '',
    contractDocumentUrl: '',
    isCurrent: true,
    status: 'draft' as 'draft' | 'active' | 'expired' | 'terminated'
  });
  const [editing, setEditing] = useState<EmploymentContract | null>(null);
  const [editForm, setEditForm] = useState({
    businessUnitId: '',
    locationId: '',
    costCenterId: '',
    jobTitle: '',
    department: '',
    reportingTo: '',
    contractType: 'permanent' as 'permanent' | 'fixed_term' | 'contract' | 'zero_hours',
    startDate: '',
    endDate: '',
    salaryAmount: 0,
    salaryCurrency: 'GBP',
    salaryPeriod: 'annual' as 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual',
    workingHoursPerWeek: '',
    probationPeriodDays: '',
    noticePeriodDays: '',
    contractDocumentUrl: '',
    isCurrent: true,
    status: 'draft' as 'draft' | 'active' | 'expired' | 'terminated'
  });
  const [confirmDel, setConfirmDel] = useState<EmploymentContract | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [contractsRes, empRes, costRes] = await Promise.all([
          listEmploymentContracts({}),
          listEmployees({ organizationId: session?.user?.organizationId }),
          listCostCenters({ organizationId: session?.user?.organizationId })
        ]);
        setItems(contractsRes.data || []);
        setEmployees(empRes.data || []);
        setCostCenters(costRes.data || []);
        
        if (session?.user?.organizationId) {
          try {
            const buRes = await listBusinessUnits(session.user.organizationId);
            setBusinessUnits(buRes.data || []);
            if (buRes.data?.length > 0) {
              const locRes = await listLocations(buRes.data[0].id, session.user.organizationId);
              setLocations(locRes.data || []);
            }
          } catch (e) {
            console.error('Failed to load business units:', e);
          }
        }
      } catch (e: any) {
        toast.error('Failed to load employment contracts');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId || !form.businessUnitId || !form.jobTitle || !form.startDate || !form.salaryAmount) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createEmploymentContract({
        ...form,
        salaryAmount: parseFloat(form.salaryAmount.toString()),
        workingHoursPerWeek: form.workingHoursPerWeek ? parseFloat(form.workingHoursPerWeek) : undefined,
        probationPeriodDays: form.probationPeriodDays ? parseInt(form.probationPeriodDays) : undefined,
        noticePeriodDays: form.noticePeriodDays ? parseInt(form.noticePeriodDays) : undefined
      });
      toast.success('Employment Contract created');
      setShowCreate(false);
      setForm({
        employeeId: '',
        businessUnitId: '',
        locationId: '',
        costCenterId: '',
        jobTitle: '',
        department: '',
        reportingTo: '',
        contractType: 'permanent',
        startDate: '',
        endDate: '',
        salaryAmount: 0,
        salaryCurrency: 'GBP',
        salaryPeriod: 'annual',
        workingHoursPerWeek: '',
        probationPeriodDays: '',
        noticePeriodDays: '',
        contractDocumentUrl: '',
        isCurrent: true,
        status: 'draft'
      });
      const res = await listEmploymentContracts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create employment contract');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.jobTitle || !editForm.startDate) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateEmploymentContract(editing.id, {
        ...editForm,
        salaryAmount: editForm.salaryAmount ? parseFloat(editForm.salaryAmount.toString()) : undefined,
        workingHoursPerWeek: editForm.workingHoursPerWeek ? parseFloat(editForm.workingHoursPerWeek) : undefined,
        probationPeriodDays: editForm.probationPeriodDays ? parseInt(editForm.probationPeriodDays) : undefined,
        noticePeriodDays: editForm.noticePeriodDays ? parseInt(editForm.noticePeriodDays) : undefined
      });
      toast.success('Employment Contract updated');
      setEditing(null);
      const res = await listEmploymentContracts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update employment contract');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteEmploymentContract(confirmDel.id);
      toast.success('Employment Contract deleted');
      setConfirmDel(null);
      const res = await listEmploymentContracts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete employment contract');
    }
  }

  const columns = useMemo<ColumnDef<EmploymentContract>[]>(() => [
    { 
      accessorKey: 'employee',
      header: 'Employee',
      cell: ({ row }) => row.original.employee ? `${row.original.employee.firstName} ${row.original.employee.lastName}` : '-'
    },
    { accessorKey: 'jobTitle', header: 'Job Title' },
    { 
      accessorKey: 'contractType', 
      header: 'Type',
      cell: ({ row }) => row.original.contractType.replace(/_/g, ' ').toUpperCase()
    },
    { 
      accessorKey: 'startDate', 
      header: 'Start Date',
      cell: ({ row }) => row.original.startDate ? new Date(row.original.startDate).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'salaryAmount', 
      header: 'Salary',
      cell: ({ row }) => `${row.original.salaryCurrency} ${row.original.salaryAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}/${row.original.salaryPeriod}`
    },
    { accessorKey: 'status', header: 'Status' },
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
              costCenterId: (item as any).costCenter?.id || '',
              jobTitle: item.jobTitle,
              department: item.department || '',
              reportingTo: (item as any).reportingTo?.id || '',
              contractType: item.contractType,
              startDate: item.startDate,
              endDate: item.endDate || '',
              salaryAmount: item.salaryAmount,
              salaryCurrency: item.salaryCurrency,
              salaryPeriod: item.salaryPeriod,
              workingHoursPerWeek: (item as any).workingHoursPerWeek?.toString() || '',
              probationPeriodDays: (item as any).probationPeriodDays?.toString() || '',
              noticePeriodDays: (item as any).noticePeriodDays?.toString() || '',
              contractDocumentUrl: (item as any).contractDocumentUrl || '',
              isCurrent: (item as any).isCurrent ?? true,
              status: item.status
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
          <Header title="HR · Employment Contracts" />
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
          <Header title="HR · Employment Contracts" />
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
        <Header title="HR · Employment Contracts" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Employment Contracts</h1>
                <p className="text-muted-foreground mt-1">Manage employment contracts and agreements</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Contract
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-3xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Employment Contract</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Employee *</label>
                      <select
                        value={form.employeeId}
                        onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="">Select Employee</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeNumber})</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Business Unit *</label>
                        <select
                          value={form.businessUnitId}
                          onChange={(e) => setForm({ ...form, businessUnitId: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="">Select Business Unit</option>
                          {businessUnits.map(bu => (
                            <option key={bu.id} value={bu.id}>{bu.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Location</label>
                        <select
                          value={form.locationId}
                          onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="">None</option>
                          {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Job Title *</label>
                      <input
                        type="text"
                        value={form.jobTitle}
                        onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Contract Type *</label>
                        <select
                          value={form.contractType}
                          onChange={(e) => setForm({ ...form, contractType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        >
                          <option value="permanent">Permanent</option>
                          <option value="fixed_term">Fixed Term</option>
                          <option value="contract">Contract</option>
                          <option value="zero_hours">Zero Hours</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select
                          value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="terminated">Terminated</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Date *</label>
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End Date</label>
                        <input
                          type="date"
                          value={form.endDate}
                          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Salary Amount *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.salaryAmount}
                          onChange={(e) => setForm({ ...form, salaryAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Currency</label>
                        <input
                          type="text"
                          value={form.salaryCurrency}
                          onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          maxLength={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Salary Period</label>
                        <select
                          value={form.salaryPeriod}
                          onChange={(e) => setForm({ ...form, salaryPeriod: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annual</option>
                        </select>
                      </div>
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
                    <h2 className="text-xl font-bold">Edit Employment Contract</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Job Title *</label>
                      <input
                        type="text"
                        value={editForm.jobTitle}
                        onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Contract Type</label>
                        <select
                          value={editForm.contractType}
                          onChange={(e) => setEditForm({ ...editForm, contractType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="permanent">Permanent</option>
                          <option value="fixed_term">Fixed Term</option>
                          <option value="contract">Contract</option>
                          <option value="zero_hours">Zero Hours</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="expired">Expired</option>
                          <option value="terminated">Terminated</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Date</label>
                        <input
                          type="date"
                          value={editForm.startDate}
                          onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End Date</label>
                        <input
                          type="date"
                          value={editForm.endDate}
                          onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Salary Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.salaryAmount}
                          onChange={(e) => setEditForm({ ...editForm, salaryAmount: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Currency</label>
                        <input
                          type="text"
                          value={editForm.salaryCurrency}
                          onChange={(e) => setEditForm({ ...editForm, salaryCurrency: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          maxLength={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Salary Period</label>
                        <select
                          value={editForm.salaryPeriod}
                          onChange={(e) => setEditForm({ ...editForm, salaryPeriod: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="annual">Annual</option>
                        </select>
                      </div>
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
                    Are you sure you want to delete this employment contract? This action cannot be undone.
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

