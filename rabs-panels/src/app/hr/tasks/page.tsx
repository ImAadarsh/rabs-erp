'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listTasks, createTask, updateTask, deleteTask, listUsers, listBusinessUnits, listLocations } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

type Task = {
  id: string;
  title: string;
  description?: string;
  taskType: 'order' | 'project' | 'maintenance' | 'support' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  dueDate?: string;
  assignedTo?: { id: string; email: string } | null;
};

export default function TasksPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Task[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    organizationId: '',
    title: '',
    description: '',
    taskType: 'other' as 'order' | 'project' | 'maintenance' | 'support' | 'other',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    assignedTo: '',
    assignedBy: '',
    businessUnitId: '',
    locationId: '',
    relatedEntityType: '',
    relatedEntityId: '',
    dueDate: '',
    estimatedHours: '',
    notes: ''
  });
  const [editing, setEditing] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    taskType: 'other' as 'order' | 'project' | 'maintenance' | 'support' | 'other',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    assignedTo: '',
    businessUnitId: '',
    locationId: '',
    dueDate: '',
    estimatedHours: '',
    actualHours: '',
    status: 'pending' as 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled',
    notes: ''
  });
  const [confirmDel, setConfirmDel] = useState<Task | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [tasksRes, usersRes] = await Promise.all([
          listTasks({ organizationId: session?.user?.organizationId }),
          listUsers()
        ]);
        setItems(tasksRes.data || []);
        setUsers(usersRes.data || []);
        
        if (session?.user?.organizationId) {
          setForm(prev => ({ ...prev, organizationId: session.user.organizationId, assignedBy: session.user.id }));
          try {
            const buRes = await listBusinessUnits(session.user.organizationId);
            setBusinessUnits(buRes.data || []);
          } catch (e) {
            console.error('Failed to load business units:', e);
          }
        }
      } catch (e: any) {
        toast.error('Failed to load tasks');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId, session?.user?.id]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.title) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await createTask({
        ...form,
        estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined
      });
      toast.success('Task created');
      setShowCreate(false);
      setForm({
        organizationId: session?.user?.organizationId || '',
        title: '',
        description: '',
        taskType: 'other',
        priority: 'medium',
        assignedTo: '',
        assignedBy: session?.user?.id || '',
        businessUnitId: '',
        locationId: '',
        relatedEntityType: '',
        relatedEntityId: '',
        dueDate: '',
        estimatedHours: '',
        notes: ''
      });
      const res = await listTasks({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create task');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.title) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      await updateTask(editing.id, {
        ...editForm,
        estimatedHours: editForm.estimatedHours ? parseFloat(editForm.estimatedHours) : undefined,
        actualHours: editForm.actualHours ? parseFloat(editForm.actualHours) : undefined
      });
      toast.success('Task updated');
      setEditing(null);
      const res = await listTasks({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update task');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteTask(confirmDel.id);
      toast.success('Task deleted');
      setConfirmDel(null);
      const res = await listTasks({ organizationId: session?.user?.organizationId });
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete task');
    }
  }

  const columns = useMemo<ColumnDef<Task>[]>(() => [
    { accessorKey: 'title', header: 'Title' },
    { 
      accessorKey: 'taskType', 
      header: 'Type',
      cell: ({ row }) => row.original.taskType.toUpperCase()
    },
    { 
      accessorKey: 'priority', 
      header: 'Priority',
      cell: ({ row }) => row.original.priority.toUpperCase()
    },
    { 
      accessorKey: 'assignedTo',
      header: 'Assigned To',
      cell: ({ row }) => row.original.assignedTo?.email || '-'
    },
    { 
      accessorKey: 'dueDate', 
      header: 'Due Date',
      cell: ({ row }) => row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : '-'
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
              title: item.title,
              description: item.description || '',
              taskType: item.taskType,
              priority: item.priority,
              assignedTo: item.assignedTo?.id || '',
              businessUnitId: (item as any).businessUnit?.id || '',
              locationId: (item as any).location?.id || '',
              dueDate: item.dueDate || '',
              estimatedHours: (item as any).estimatedHours?.toString() || '',
              actualHours: (item as any).actualHours?.toString() || '',
              status: item.status,
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
          <Header title="HR · Tasks" />
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
          <Header title="HR · Tasks" />
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
        <Header title="HR · Tasks" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Tasks</h1>
                <p className="text-muted-foreground mt-1">Assign and track work tasks</p>
              </div>
              {hasAccess && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                >
                  <Plus size={20} />
                  New Task
                </button>
              )}
            </div>

            <RichDataTable data={items} columns={columns} />

            {showCreate && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto">
                  <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold">Create Task</h2>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Title *</label>
                      <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
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
                        <label className="block text-sm font-medium mb-1">Task Type</label>
                        <select
                          value={form.taskType}
                          onChange={(e) => setForm({ ...form, taskType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="order">Order</option>
                          <option value="project">Project</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="support">Support</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Priority</label>
                        <select
                          value={form.priority}
                          onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Assigned To</label>
                      <select
                        value={form.assignedTo}
                        onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="">None</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.email}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Due Date</label>
                      <input
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
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
                    <h2 className="text-xl font-bold">Edit Task</h2>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded">
                      <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Title *</label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
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
                    Are you sure you want to delete task "{confirmDel.title}"? This action cannot be undone.
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

