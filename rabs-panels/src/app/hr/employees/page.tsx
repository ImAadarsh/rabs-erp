'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listEmployees, createEmployee, updateEmployee, deleteEmployee, listUsers } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { Pencil, Trash2, Plus, Eye, Users } from 'lucide-react';
import { HrModal, HrField, HrModalActions, hrInputClass, hrTextareaClass } from '@/components/hr/hr-modal';

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  hireDate: string;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'temporary' | 'intern';
  status: 'active' | 'on_leave' | 'suspended' | 'terminated';
  organization?: { id: string; name: string };
  user?: { id: string; email: string } | null;
  niNumber?: string;
  taxCode?: string;
  department?: string;
  jobTitle?: string;
};

const emptyForm = {
  organizationId: '',
  userId: '',
  employeeNumber: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  niNumber: '',
  taxCode: '1257L',
  department: '',
  jobTitle: '',
  hireDate: '',
  employmentType: 'full_time' as Employee['employmentType'],
  status: 'active' as Employee['status'],
  notes: '',
};

const GOLD_BTN =
  'inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20';

export default function EmployeesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Employee[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState({
    userId: '',
    employeeNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    hireDate: '',
    employmentType: 'full_time' as Employee['employmentType'],
    status: 'active' as Employee['status'],
    niNumber: '',
    taxCode: '',
    department: '',
    jobTitle: '',
  });
  const [confirmDel, setConfirmDel] = useState<Employee | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [empRes, usersRes] = await Promise.all([
          listEmployees({ organizationId: session?.user?.organizationId }),
          listUsers(),
        ]);
        setItems(empRes.data || []);
        setUsers(usersRes.data || []);
        if (session?.user?.organizationId) {
          setForm((prev) => ({ ...prev, organizationId: session.user.organizationId }));
        }
      } catch (e: any) {
        if (e?.response?.status === 403) {
          toast.error('You do not have permission to view employees.');
        } else {
          toast.error('Failed to load employees');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function refresh() {
    const res = await listEmployees({ organizationId: session?.user?.organizationId });
    setItems(res.data || []);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.employeeNumber || !form.firstName || !form.lastName || !form.hireDate) {
      toast.error('Please fill in required fields');
      return;
    }
    setSaving(true);
    try {
      await createEmployee({
        organizationId: form.organizationId,
        employeeNumber: form.employeeNumber,
        firstName: form.firstName,
        lastName: form.lastName,
        hireDate: form.hireDate,
        employmentType: form.employmentType,
        status: form.status,
        userId: form.userId || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        niNumber: form.niNumber || undefined,
        taxCode: form.taxCode || undefined,
        nationalId: form.niNumber || undefined,
        taxId: form.taxCode || undefined,
        department: form.department || undefined,
        jobTitle: form.jobTitle || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Employee created');
      setShowCreate(false);
      setForm({ ...emptyForm, organizationId: session?.user?.organizationId || '' });
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editForm.employeeNumber || !editForm.firstName || !editForm.lastName) {
      toast.error('Please fill in required fields');
      return;
    }
    setSaving(true);
    try {
      await updateEmployee(editing.id, {
        ...editForm,
        userId: editForm.userId || undefined,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
        niNumber: editForm.niNumber || undefined,
        taxCode: editForm.taxCode || undefined,
        department: editForm.department || undefined,
        jobTitle: editForm.jobTitle || undefined,
      } as any);
      toast.success('Employee updated');
      setEditing(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteEmployee(confirmDel.id);
      toast.success('Employee deleted');
      setConfirmDel(null);
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete employee');
    }
  }

  const columns = useMemo<ColumnDef<Employee>[]>(
    () => [
      { accessorKey: 'employeeNumber', header: 'Employee #' },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <Link href={`/hr/employees/${row.original.id}`} className="font-medium text-brand hover:underline">
            {row.original.firstName} {row.original.lastName}
          </Link>
        ),
      },
      {
        header: 'Role',
        cell: ({ row }) => row.original.jobTitle || row.original.department || '—',
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => row.original.email || '—',
      },
      {
        accessorKey: 'hireDate',
        header: 'Hire Date',
        cell: ({ row }) => (row.original.hireDate ? new Date(row.original.hireDate).toLocaleDateString() : '—'),
      },
      {
        accessorKey: 'employmentType',
        header: 'Type',
        cell: ({ row }) => row.original.employmentType.replace(/_/g, ' '),
      },
      { accessorKey: 'status', header: 'Status' },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Link href={`/hr/employees/${row.original.id}`} className="p-1.5 hover:bg-muted rounded text-brand" title="Employee 360">
              <Eye size={16} />
            </Link>
            <button
              type="button"
              onClick={() => {
                const item = row.original;
                setEditing(item);
                setEditForm({
                  userId: (item as any).user?.id || '',
                  employeeNumber: item.employeeNumber,
                  firstName: item.firstName,
                  lastName: item.lastName,
                  email: item.email || '',
                  phone: item.phone || '',
                  hireDate: item.hireDate,
                  employmentType: item.employmentType,
                  status: item.status,
                  niNumber: item.niNumber || (item as any).nationalId || '',
                  taxCode: item.taxCode || (item as any).taxId || '',
                  department: item.department || '',
                  jobTitle: item.jobTitle || '',
                });
              }}
              className="p-1.5 hover:bg-muted rounded"
            >
              <Pencil size={16} />
            </button>
            <button type="button" onClick={() => setConfirmDel(row.original)} className="p-1.5 hover:bg-muted rounded text-destructive">
              <Trash2 size={16} />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="HR · Employees" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>
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
          <Header title="HR · Employees" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="text-center py-16">
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view this page.</p>
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
        <Header title="HR · Employees" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold">Employees</h1>
                <p className="text-muted-foreground mt-1">UK employee records, NI, tax code &amp; 360 view</p>
              </div>
              <button type="button" onClick={() => setShowCreate(true)} className={GOLD_BTN}>
                <Plus size={16} />
                Create Employee
              </button>
            </div>

            {items.length === 0 ? (
              <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center">
                <Users className="mx-auto text-brand mb-3" size={28} />
                <h2 className="font-semibold text-lg">No employees yet</h2>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first UK employee record to get started.</p>
                <button type="button" onClick={() => setShowCreate(true)} className={GOLD_BTN}>
                  <Plus size={16} /> Create Employee
                </button>
              </div>
            ) : (
              <RichDataTable data={items} columns={columns} />
            )}
          </div>
        </main>
      </div>

      <HrModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Employee" icon={Users} wide>
        <form onSubmit={onCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Employee number *">
              <input className={hrInputClass} required value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} />
            </HrField>
            <HrField label="User account">
              <select className={hrInputClass} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">None</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="First name *">
              <input className={hrInputClass} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </HrField>
            <HrField label="Last name *">
              <input className={hrInputClass} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Email">
              <input type="email" className={hrInputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </HrField>
            <HrField label="Phone">
              <input className={hrInputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Job title">
              <input className={hrInputClass} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </HrField>
            <HrField label="Department">
              <input className={hrInputClass} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="NI number">
              <input className={hrInputClass} value={form.niNumber} onChange={(e) => setForm({ ...form, niNumber: e.target.value })} placeholder="QQ123456C" />
            </HrField>
            <HrField label="Tax code">
              <input className={hrInputClass} value={form.taxCode} onChange={(e) => setForm({ ...form, taxCode: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Hire date *">
              <input type="date" className={hrInputClass} required value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
            </HrField>
            <HrField label="Date of birth">
              <input type="date" className={hrInputClass} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Employment type">
              <select className={hrInputClass} value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value as any })}>
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
                <option value="intern">Intern</option>
              </select>
            </HrField>
            <HrField label="Status">
              <select className={hrInputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="suspended">Suspended</option>
                <option value="terminated">Terminated</option>
              </select>
            </HrField>
          </div>
          <HrField label="Notes">
            <textarea className={hrTextareaClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </HrField>
          <HrModalActions onCancel={() => setShowCreate(false)} submitLabel="Create Employee" submitting={saving} />
        </form>
      </HrModal>

      <HrModal open={!!editing} onClose={() => setEditing(null)} title="Edit Employee" icon={Pencil} wide>
        <form onSubmit={onUpdate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Employee number *">
              <input className={hrInputClass} required value={editForm.employeeNumber} onChange={(e) => setEditForm({ ...editForm, employeeNumber: e.target.value })} />
            </HrField>
            <HrField label="User account">
              <select className={hrInputClass} value={editForm.userId} onChange={(e) => setEditForm({ ...editForm, userId: e.target.value })}>
                <option value="">None</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="First name *">
              <input className={hrInputClass} required value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
            </HrField>
            <HrField label="Last name *">
              <input className={hrInputClass} required value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Email">
              <input type="email" className={hrInputClass} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </HrField>
            <HrField label="Phone">
              <input className={hrInputClass} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Job title">
              <input className={hrInputClass} value={editForm.jobTitle} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} />
            </HrField>
            <HrField label="Department">
              <input className={hrInputClass} value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="NI number">
              <input className={hrInputClass} value={editForm.niNumber} onChange={(e) => setEditForm({ ...editForm, niNumber: e.target.value })} />
            </HrField>
            <HrField label="Tax code">
              <input className={hrInputClass} value={editForm.taxCode} onChange={(e) => setEditForm({ ...editForm, taxCode: e.target.value })} />
            </HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Hire date">
              <input type="date" className={hrInputClass} value={editForm.hireDate} onChange={(e) => setEditForm({ ...editForm, hireDate: e.target.value })} />
            </HrField>
            <HrField label="Employment type">
              <select className={hrInputClass} value={editForm.employmentType} onChange={(e) => setEditForm({ ...editForm, employmentType: e.target.value as any })}>
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
                <option value="intern">Intern</option>
              </select>
            </HrField>
          </div>
          <HrField label="Status">
            <select className={hrInputClass} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}>
              <option value="active">Active</option>
              <option value="on_leave">On leave</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
            </select>
          </HrField>
          <HrModalActions onCancel={() => setEditing(null)} submitLabel="Save" submitting={saving} />
        </form>
      </HrModal>

      <HrModal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Confirm delete" icon={Trash2}>
        <p className="text-sm text-muted-foreground mb-4">
          Delete employee &quot;{confirmDel?.firstName} {confirmDel?.lastName}&quot;? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setConfirmDel(null)} className="h-10 px-4 rounded-xl border border-border text-sm">
            Cancel
          </button>
          <button type="button" onClick={onDelete} className="h-10 px-4 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium">
            Delete
          </button>
        </div>
      </HrModal>
    </div>
  );
}
