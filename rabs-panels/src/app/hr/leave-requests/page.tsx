'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listLeaveRequests, createLeaveRequest, updateLeaveRequest, deleteLeaveRequest, listEmployees } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type LeaveRequest = {
  id: string;
  leaveType: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'other';
  startDate: string;
  endDate: string;
  totalDays: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  employee?: { id: string; firstName: string; lastName: string };
};

export default function LeaveRequestsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    leaveType: 'vacation' as 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'other',
    startDate: '',
    endDate: '',
    totalDays: 0,
    reason: '',
    notes: ''
  });
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [editForm, setEditForm] = useState({
    leaveType: 'vacation' as 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'other',
    startDate: '',
    endDate: '',
    totalDays: 0,
    reason: '',
    status: 'pending' as 'pending' | 'approved' | 'rejected' | 'cancelled',
    rejectionReason: '',
    notes: ''
  });
  const [confirmDel, setConfirmDel] = useState<LeaveRequest | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [leaveRes, empRes] = await Promise.all([
          listLeaveRequests({}),
          listEmployees({ organizationId: session?.user?.organizationId })
        ]);
        setItems(leaveRes.data || []);
        setEmployees(empRes.data || []);
      } catch (e: any) {
        toast.error('Failed to load leave requests');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  useEffect(() => {
    if (form.startDate && form.endDate) {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      setForm(prev => ({ ...prev, totalDays: diffDays }));
    }
  }, [form.startDate, form.endDate]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId || !form.startDate || !form.endDate) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createLeaveRequest(form);
      toast.success('Leave Request created');
      setShowCreate(false);
      setForm({
        employeeId: '',
        leaveType: 'vacation',
        startDate: '',
        endDate: '',
        totalDays: 0,
        reason: '',
        notes: ''
      });
      const res = await listLeaveRequests({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create leave request');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateLeaveRequest(editing.id, editForm);
      toast.success('Leave Request updated');
      setEditing(null);
      const res = await listLeaveRequests({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update leave request');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteLeaveRequest(confirmDel.id);
      toast.success('Leave Request deleted');
      setConfirmDel(null);
      const res = await listLeaveRequests({});
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete leave request');
    }
  }

  const columns = useMemo<ColumnDef<LeaveRequest>[]>(() => [
    { 
      accessorKey: 'employee',
      header: 'Employee',
      cell: ({ row }) => row.original.employee ? `${row.original.employee.firstName} ${row.original.employee.lastName}` : '-'
    },
    { 
      accessorKey: 'leaveType', 
      header: 'Type',
      cell: ({ row }) => row.original.leaveType.toUpperCase()
    },
    { 
      accessorKey: 'startDate', 
      header: 'Start Date',
      cell: ({ row }) => row.original.startDate ? new Date(row.original.startDate).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'endDate', 
      header: 'End Date',
      cell: ({ row }) => row.original.endDate ? new Date(row.original.endDate).toLocaleDateString() : '-'
    },
    { 
      accessorKey: 'totalDays', 
      header: 'Days',
      cell: ({ row }) => row.original.totalDays
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
              leaveType: item.leaveType,
              startDate: item.startDate,
              endDate: item.endDate,
              totalDays: item.totalDays,
              reason: (item as any).reason || '',
              status: item.status,
              rejectionReason: (item as any).rejectionReason || '',
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
          <Header title="HR · Leave Requests" />
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
          <Header title="HR · Leave Requests" />
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
        <Header title="HR · Leave Requests" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Leave Requests</h1>
                <p className="text-muted-foreground mt-1">Manage vacation and leave requests</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Leave Request
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Leave Request</h2>
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
                      <label className="block text-sm font-medium mb-1">Leave Type *</label>
                      <select
                        value={form.leaveType}
                        onChange={(e) => setForm({ ...form, leaveType: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      >
                        <option value="vacation">Vacation</option>
                        <option value="sick">Sick</option>
                        <option value="personal">Personal</option>
                        <option value="maternity">Maternity</option>
                        <option value="paternity">Paternity</option>
                        <option value="bereavement">Bereavement</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="other">Other</option>
                      </select>
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
                        <label className="block text-sm font-medium mb-1">End Date *</label>
                        <input
                          type="date"
                          value={form.endDate}
                          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Total Days</label>
                      <input
                        type="number"
                        value={form.totalDays}
                        readOnly
                        className="w-full px-3 py-2 border border-border rounded-lg bg-muted"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Reason</label>
                      <textarea
                        value={form.reason}
                        onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        rows={3}
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
                    <h2 className="text-xl font-bold">Edit Leave Request</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
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
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    {editForm.status === 'rejected' && (
                      <div>
                        <label className="block text-sm font-medium mb-1">Rejection Reason</label>
                        <textarea
                          value={editForm.rejectionReason}
                          onChange={(e) => setEditForm({ ...editForm, rejectionReason: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                          rows={3}
                        />
                      </div>
                    )}
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
                    Are you sure you want to delete this leave request? This action cannot be undone.
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

