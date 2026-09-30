'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listTimeEntries, createTimeEntry, updateTimeEntry, deleteTimeEntry, listEmployees, listBusinessUnits, listLocations } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type TimeEntry = {
  id: string;
  entryDate: string;
  clockInTime: string;
  clockOutTime?: string;
  totalHours?: number;
  overtimeHours: number;
  entryType: 'regular' | 'overtime' | 'holiday' | 'sick' | 'unpaid';
  status: 'pending' | 'approved' | 'rejected';
  employee?: { id: string; firstName: string; lastName: string };
};

export default function TimeEntriesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    businessUnitId: '',
    locationId: '',
    entryDate: '',
    clockInTime: '',
    clockOutTime: '',
    totalHours: '',
    breakMinutes: 0,
    overtimeHours: 0,
    entryType: 'regular' as 'regular' | 'overtime' | 'holiday' | 'sick' | 'unpaid',
    notes: '',
    status: 'pending' as 'pending' | 'approved' | 'rejected'
  });
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [editForm, setEditForm] = useState({
    locationId: '',
    entryDate: '',
    clockInTime: '',
    clockOutTime: '',
    totalHours: '',
    breakMinutes: 0,
    overtimeHours: 0,
    entryType: 'regular' as 'regular' | 'overtime' | 'holiday' | 'sick' | 'unpaid',
    notes: '',
    status: 'pending' as 'pending' | 'approved' | 'rejected'
  });
  const [confirmDel, setConfirmDel] = useState<TimeEntry | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [entriesRes, empRes] = await Promise.all([
          listTimeEntries({}),
          listEmployees({ organizationId: session?.user?.organizationId })
        ]);
        setItems(entriesRes.data || []);
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
        toast.error('Failed to load time entries');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId || !form.businessUnitId || !form.entryDate || !form.clockInTime) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createTimeEntry({
        ...form,
        totalHours: form.totalHours ? parseFloat(form.totalHours) : undefined,
        breakMinutes: parseInt(form.breakMinutes.toString()),
        overtimeHours: parseFloat(form.overtimeHours.toString())
      });
      toast.success('Time Entry created');
      setShowCreate(false);
      setForm({
        employeeId: '',
        businessUnitId: '',
        locationId: '',
        entryDate: '',
        clockInTime: '',
        clockOutTime: '',
        totalHours: '',
        breakMinutes: 0,
        overtimeHours: 0,
        entryType: 'regular',
        notes: '',
        status: 'pending'
      });
      const res = await listTimeEntries({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create time entry');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateTimeEntry(editing.id, {
        ...editForm,
        totalHours: editForm.totalHours ? parseFloat(editForm.totalHours) : undefined,
        breakMinutes: parseInt(editForm.breakMinutes.toString()),
        overtimeHours: parseFloat(editForm.overtimeHours.toString())
      });
      toast.success('Time Entry updated');
      setEditing(null);
      const res = await listTimeEntries({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update time entry');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteTimeEntry(confirmDel.id);
      toast.success('Time Entry deleted');
      setConfirmDel(null);
      const res = await listTimeEntries({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete time entry');
    }
  }

  const columns = useMemo<ColumnDef<TimeEntry>[]>(() => [
    { 
      accessorKey: 'employee',
      header: 'Employee',
      cell: ({ row }) => row.original.employee ? `${row.original.employee.firstName} ${row.original.employee.lastName}` : '-'
    },
    { 
      accessorKey: 'entryDate', 
      header: 'Date',
      cell: ({ row }) => row.original.entryDate ? new Date(row.original.entryDate).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'clockInTime', 
      header: 'Clock In',
      cell: ({ row }) => row.original.clockInTime ? new Date(row.original.clockInTime).toLocaleTimeString() : '-'
    },
    { 
      accessorKey: 'clockOutTime', 
      header: 'Clock Out',
      cell: ({ row }) => row.original.clockOutTime ? new Date(row.original.clockOutTime).toLocaleTimeString() : '-'
    },
    { 
      accessorKey: 'totalHours', 
      header: 'Hours',
      cell: ({ row }) => row.original.totalHours ? row.original.totalHours.toFixed(2) : '-'
    },
    { 
      accessorKey: 'overtimeHours', 
      header: 'Overtime',
      cell: ({ row }) => row.original.overtimeHours.toFixed(2)
    },
    { 
      accessorKey: 'entryType', 
      header: 'Type',
      cell: ({ row }) => row.original.entryType.toUpperCase()
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
              locationId: (item as any).location?.id || '',
              entryDate: item.entryDate,
              clockInTime: item.clockInTime,
              clockOutTime: item.clockOutTime || '',
              totalHours: item.totalHours?.toString() || '',
              breakMinutes: (item as any).breakMinutes || 0,
              overtimeHours: item.overtimeHours,
              entryType: item.entryType,
              notes: (item as any).notes || '',
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
          <Header title="HR · Time Entries" />
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
          <Header title="HR · Time Entries" />
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
        <Header title="HR · Time Entries" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Time Entries</h1>
                <p className="text-muted-foreground mt-1">Track clock-in/out and time worked</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Time Entry
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Time Entry</h2>
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
                          <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                        ))}
                      </select>
                    </div>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Date *</label>
                        <input
                          type="date"
                          value={form.entryDate}
                          onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Type</label>
                        <select
                          value={form.entryType}
                          onChange={(e) => setForm({ ...form, entryType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="regular">Regular</option>
                          <option value="overtime">Overtime</option>
                          <option value="holiday">Holiday</option>
                          <option value="sick">Sick</option>
                          <option value="unpaid">Unpaid</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Clock In Time *</label>
                        <input
                          type="datetime-local"
                          value={form.clockInTime}
                          onChange={(e) => setForm({ ...form, clockInTime: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Clock Out Time</label>
                        <input
                          type="datetime-local"
                          value={form.clockOutTime}
                          onChange={(e) => setForm({ ...form, clockOutTime: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Total Hours</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.totalHours}
                          onChange={(e) => setForm({ ...form, totalHours: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Overtime Hours</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.overtimeHours}
                          onChange={(e) => setForm({ ...form, overtimeHours: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
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
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Edit Time Entry</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Date</label>
                        <input
                          type="date"
                          value={editForm.entryDate}
                          onChange={(e) => setEditForm({ ...editForm, entryDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Entry Type</label>
                        <select
                          value={editForm.entryType}
                          onChange={(e) => setEditForm({ ...editForm, entryType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="regular">Regular</option>
                          <option value="overtime">Overtime</option>
                          <option value="holiday">Holiday</option>
                          <option value="sick">Sick</option>
                          <option value="unpaid">Unpaid</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Clock In Time</label>
                        <input
                          type="datetime-local"
                          value={editForm.clockInTime}
                          onChange={(e) => setEditForm({ ...editForm, clockInTime: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Clock Out Time</label>
                        <input
                          type="datetime-local"
                          value={editForm.clockOutTime}
                          onChange={(e) => setEditForm({ ...editForm, clockOutTime: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
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
                    Are you sure you want to delete this time entry? This action cannot be undone.
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

