'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listShifts, createShift, updateShift, deleteShift, listEmployees, listBusinessUnits, listLocations } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type Shift = {
  id: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: 'regular' | 'opening' | 'closing' | 'split' | 'on_call';
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  employee?: { id: string; firstName: string; lastName: string };
};

export default function ShiftsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    businessUnitId: '',
    locationId: '',
    shiftDate: '',
    startTime: '',
    endTime: '',
    breakMinutes: 0,
    shiftType: 'regular' as 'regular' | 'opening' | 'closing' | 'split' | 'on_call',
    notes: '',
    status: 'scheduled' as 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  });
  const [editing, setEditing] = useState<Shift | null>(null);
  const [editForm, setEditForm] = useState({
    locationId: '',
    shiftDate: '',
    startTime: '',
    endTime: '',
    breakMinutes: 0,
    shiftType: 'regular' as 'regular' | 'opening' | 'closing' | 'split' | 'on_call',
    notes: '',
    status: 'scheduled' as 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  });
  const [confirmDel, setConfirmDel] = useState<Shift | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [shiftsRes, empRes] = await Promise.all([
          listShifts({}),
          listEmployees({ organizationId: session?.user?.organizationId })
        ]);
        setItems(shiftsRes.data || []);
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
        toast.error('Failed to load shifts');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId || !form.businessUnitId || !form.shiftDate || !form.startTime || !form.endTime) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createShift({
        ...form,
        breakMinutes: parseInt(form.breakMinutes.toString())
      });
      toast.success('Shift created');
      setShowCreate(false);
      setForm({
        employeeId: '',
        businessUnitId: '',
        locationId: '',
        shiftDate: '',
        startTime: '',
        endTime: '',
        breakMinutes: 0,
        shiftType: 'regular',
        notes: '',
        status: 'scheduled'
      });
      const res = await listShifts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create shift');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateShift(editing.id, {
        ...editForm,
        breakMinutes: parseInt(editForm.breakMinutes.toString())
      });
      toast.success('Shift updated');
      setEditing(null);
      const res = await listShifts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update shift');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteShift(confirmDel.id);
      toast.success('Shift deleted');
      setConfirmDel(null);
      const res = await listShifts({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete shift');
    }
  }

  const columns = useMemo<ColumnDef<Shift>[]>(() => [
    { 
      accessorKey: 'employee',
      header: 'Employee',
      cell: ({ row }) => row.original.employee ? `${row.original.employee.firstName} ${row.original.employee.lastName}` : '-'
    },
    { 
      accessorKey: 'shiftDate', 
      header: 'Date',
      cell: ({ row }) => row.original.shiftDate ? new Date(row.original.shiftDate).toLocaleDateString() : '-'
    },
    { accessorKey: 'startTime', header: 'Start Time' },
    { accessorKey: 'endTime', header: 'End Time' },
    { 
      accessorKey: 'shiftType', 
      header: 'Type',
      cell: ({ row }) => row.original.shiftType.replace(/_/g, ' ').toUpperCase()
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
              shiftDate: item.shiftDate,
              startTime: item.startTime,
              endTime: item.endTime,
              breakMinutes: (item as any).breakMinutes || 0,
              shiftType: item.shiftType,
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
          <Header title="HR · Shifts" />
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
          <Header title="HR · Shifts" />
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
        <Header title="HR · Shifts" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Shifts</h1>
                <p className="text-muted-foreground mt-1">Schedule and manage work shifts</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Shift
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Shift</h2>
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
                        <label className="block text-sm font-medium mb-1">Shift Date *</label>
                        <input
                          type="date"
                          value={form.shiftDate}
                          onChange={(e) => setForm({ ...form, shiftDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Shift Type</label>
                        <select
                          value={form.shiftType}
                          onChange={(e) => setForm({ ...form, shiftType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="regular">Regular</option>
                          <option value="opening">Opening</option>
                          <option value="closing">Closing</option>
                          <option value="split">Split</option>
                          <option value="on_call">On Call</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Time *</label>
                        <input
                          type="time"
                          value={form.startTime}
                          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">End Time *</label>
                        <input
                          type="time"
                          value={form.endTime}
                          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
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
                    <h2 className="text-xl font-bold">Edit Shift</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Shift Date</label>
                        <input
                          type="date"
                          value={editForm.shiftDate}
                          onChange={(e) => setEditForm({ ...editForm, shiftDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="no_show">No Show</option>
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
                    Are you sure you want to delete this shift? This action cannot be undone.
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

