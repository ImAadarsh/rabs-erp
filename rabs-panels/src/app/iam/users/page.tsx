'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listUsers, createUser, updateUser, deleteUser, listOrganizations, listRoles, listBusinessUnits, listLocations, assignRole, unassignRole } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Trash2, Plus, X } from 'lucide-react';

type User = {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  status: 'active' | 'inactive' | 'suspended' | 'locked';
  organizationId: string;
  organization?: {
    id: string;
    name: string;
  };
  roleAssignments?: Array<{
    id: string;
    role: {
      id: string;
      name: string;
      code: string;
    };
    businessUnit?: {
      id: string;
      code: string;
      name: string;
    } | null;
    location?: {
      id: string;
      code: string;
      name: string;
    } | null;
  }>;
  [key: string]: any;
};

export default function UsersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    email: '', 
    username: '', 
    firstName: '', 
    lastName: '', 
    organizationId: '',
    businessUnitId: '',
    locationId: '',
    roleId: '',
    password: ''
  });
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    organizationId: '',
    businessUnitId: '',
    locationId: '',
    roleId: '',
    status: 'active' as 'active' | 'inactive' | 'suspended' | 'locked'
  });
  const [editBusinessUnits, setEditBusinessUnits] = useState<any[]>([]);
  const [editLocations, setEditLocations] = useState<any[]>([]);
  const [confirmDel, setConfirmDel] = useState<User | null>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [usersRes, orgsRes, rolesRes] = await Promise.all([
          listUsers(),
          listOrganizations(),
          listRoles()
        ]);
        setItems(usersRes.data);
        setOrganizations(orgsRes.data || []);
        setRoles(rolesRes.data || []);
        
        // Set default organization to current user's organization
        if (session?.user?.organizationId) {
          setForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
          // Load business units and locations for default org
          try {
            const [busRes, locsRes] = await Promise.all([
              listBusinessUnits(session.user.organizationId),
              listLocations(undefined, session.user.organizationId)
            ]);
            setBusinessUnits(busRes.data || []);
            setLocations(locsRes.data || []);
          } catch (e) {
            console.error('Failed to load business units/locations:', e);
          }
        }
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 403) {
          toast.error('You do not have permission to view users. Please contact an administrator.');
        } else if (status === 401) {
          toast.error('Session expired. Please login again.');
          router.replace('/login');
        } else {
          toast.error('Failed to load users');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!form.organizationId || !form.businessUnitId || !form.locationId || !form.roleId) {
      toast.error('Please select organization, business unit, location, and role');
      return;
    }
    try {
      const res = await createUser({
        organizationId: form.organizationId,
        roleId: form.roleId,
        email: form.email,
        username: form.username || undefined,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        password: form.password && form.password.trim() ? form.password : undefined, // Use default if empty
        businessUnitId: form.businessUnitId,
        locationId: form.locationId,
        status: 'active'
      });
      
      setItems([res.data, ...items]);
      setShowCreate(false);
      setForm({ 
        email: '', 
        username: '', 
        firstName: '', 
        lastName: '',
        organizationId: session.user.organizationId || '',
        businessUnitId: '',
        locationId: '',
        roleId: '',
        password: ''
      });
      toast.success('User created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  // Load business units when organization changes (create form)
  useEffect(() => {
    if (form.organizationId) {
      listBusinessUnits(form.organizationId).then(res => {
        setBusinessUnits(res.data || []);
        setForm(prev => ({ ...prev, businessUnitId: '', locationId: '' }));
      }).catch(e => {
        console.error('Failed to load business units:', e);
        setBusinessUnits([]);
      });
    } else {
      setBusinessUnits([]);
      setLocations([]);
    }
  }, [form.organizationId]);

  // Load locations when business unit changes (create form)
  useEffect(() => {
    if (form.businessUnitId) {
      listLocations(form.businessUnitId).then(res => {
        setLocations(res.data || []);
        setForm(prev => ({ ...prev, locationId: '' }));
      }).catch(e => {
        console.error('Failed to load locations:', e);
        setLocations([]);
      });
    } else {
      setLocations([]);
    }
  }, [form.businessUnitId]);

  // Load business units when organization changes (edit form)
  useEffect(() => {
    if (editForm.organizationId) {
      listBusinessUnits(editForm.organizationId).then(res => {
        setEditBusinessUnits(res.data || []);
        setEditForm(prev => ({ ...prev, businessUnitId: '', locationId: '' }));
      }).catch(e => {
        console.error('Failed to load business units:', e);
        setEditBusinessUnits([]);
      });
    } else {
      setEditBusinessUnits([]);
      setEditLocations([]);
    }
  }, [editForm.organizationId]);

  // Load locations when business unit changes (edit form)
  useEffect(() => {
    if (editForm.businessUnitId) {
      listLocations(editForm.businessUnitId).then(res => {
        setEditLocations(res.data || []);
        setEditForm(prev => ({ ...prev, locationId: '' }));
      }).catch(e => {
        console.error('Failed to load locations:', e);
        setEditLocations([]);
      });
    } else {
      setEditLocations([]);
    }
  }, [editForm.businessUnitId]);

  const columns = useMemo<ColumnDef<User>[]>(() => [
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (info) => <span className="font-medium">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'username',
      header: 'Username',
      cell: (info) => info.getValue() || <span className="text-muted-foreground italic">-</span>,
    },
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => [row.firstName, row.lastName].filter(Boolean).join(' '),
      cell: (info) => info.getValue() || <span className="text-muted-foreground italic">-</span>,
    },
    {
      id: 'organization',
      header: 'Organization',
      accessorFn: (row) => row.organization?.name || '-',
      cell: (info) => {
        const org = info.row.original.organization;
        return org ? (
          <span className="font-medium">{org.name}</span>
        ) : (
          <span className="text-muted-foreground italic">-</span>
        );
      },
    },
    {
      id: 'roles',
      header: 'Roles & Assignments',
      accessorFn: (row) => row.roleAssignments?.map((ra: any) => ra.role?.name || ra.role?.code).join(', ') || '-',
      cell: (info) => {
        const roleAssignments = info.row.original.roleAssignments;
        if (!roleAssignments || roleAssignments.length === 0) {
          return <span className="text-muted-foreground italic">-</span>;
        }
        return (
          <div className="flex flex-col gap-2">
            {roleAssignments.map((ra: any, idx: number) => (
              <div
                key={idx}
                className="px-3 py-2 rounded-lg text-xs border border-border bg-card/50 relative group"
              >
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to remove the role "${ra.role?.name || ra.role?.code}" from this user?`)) {
                      try {
                        await unassignRole({
                          userId: info.row.original.id,
                          roleAssignmentId: ra.id
                        });
                        toast.success('Role assignment removed');
                        // Reload users
                        const usersRes = await listUsers();
                        setItems(usersRes.data);
                      } catch (e: any) {
                        toast.error(e?.response?.data?.error?.message ?? 'Failed to remove role assignment');
                      }
                    }
                  }}
                  className="absolute top-1 right-1 p-1 hover:bg-red-50 rounded text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove role assignment"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="font-semibold text-foreground mb-1 pr-6">
                  {ra.role?.name || ra.role?.code || 'Unknown Role'}
                </div>
                <div className="space-y-1 text-muted-foreground">
                  {ra.businessUnit ? (
                    <div className="flex items-center gap-1">
                      <span className="font-medium">BU:</span>
                      <span>{ra.businessUnit.code} - {ra.businessUnit.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground/70 italic">No Business Unit</div>
                  )}
                  {ra.location ? (
                    <div className="flex items-center gap-1">
                      <span className="font-medium">Loc:</span>
                      <span>{ra.location.code} - {ra.location.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground/70 italic">No Location</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const status = info.getValue() as string;
        const colors: Record<string, string> = {
          active: 'bg-green-100 text-green-700 border-green-200',
          inactive: 'bg-gray-100 text-gray-700 border-gray-200',
          suspended: 'bg-red-100 text-red-700 border-red-200',
          locked: 'bg-orange-100 text-orange-700 border-orange-200',
        };
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
            {status}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-primary transition-colors"
            onClick={async () => {
              const user = row.original;
              // Get the first role assignment to pre-populate form
              const roleAssignment = user.roleAssignments?.[0];
              setEditForm({
                email: user.email,
                username: user.username || '',
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                organizationId: user.organizationId || user.organization?.id || '',
                businessUnitId: roleAssignment?.businessUnit?.id || '',
                locationId: roleAssignment?.location?.id || '',
                roleId: roleAssignment?.role?.id || '',
                status: user.status
              });
              // Load business units and locations for the organization
              if (user.organizationId || user.organization?.id) {
                const orgId = user.organizationId || user.organization?.id;
                try {
                  const [busRes, locsRes] = await Promise.all([
                    listBusinessUnits(orgId),
                    listLocations(undefined, orgId)
                  ]);
                  setEditBusinessUnits(busRes.data || []);
                  if (roleAssignment?.businessUnit?.id) {
                    const locRes = await listLocations(roleAssignment.businessUnit.id);
                    setEditLocations(locRes.data || []);
                  } else {
                    setEditLocations(locsRes.data || []);
                  }
                } catch (e) {
                  console.error('Failed to load business units/locations:', e);
                }
              }
              setEditing(user);
            }}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 hover:bg-red-50 rounded-md text-muted-foreground hover:text-red-600 transition-colors"
            onClick={() => setConfirmDel(row.original)}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ], []);

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header
          title="IAM · Users"
          actions={[
            { label: 'Add User', onClick: () => setShowCreate(true), icon: <Plus size={16} /> }
          ]}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Users</h2>
              <p className="text-muted-foreground">Manage user access and permissions.</p>
            </div>
            <button className="btn btn-primary gap-2" onClick={() => setShowCreate(true)}>
              <span>+ New User</span>
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center rounded-2xl border border-border bg-card/50 animate-pulse">
              Loading users...
            </div>
          ) : (
            <RichDataTable
              columns={columns}
              data={items}
              searchPlaceholder="Search users..."
            />
          )}

          {showCreate && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold mb-4">Create User</h3>
                <form onSubmit={onCreate} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Organization *</label>
                      <select 
                        className="select" 
                        required
                        value={form.organizationId} 
                        onChange={(e) => setForm({ ...form, organizationId: e.target.value, businessUnitId: '', locationId: '' })}>
                        <option value="">Select organization</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Business Unit *</label>
                      <select 
                        className="select" 
                        required
                        disabled={!form.organizationId}
                        value={form.businessUnitId} 
                        onChange={(e) => setForm({ ...form, businessUnitId: e.target.value, locationId: '' })}>
                        <option value="">{form.organizationId ? 'Select business unit' : 'Select organization first'}</option>
                        {businessUnits.map((bu) => (
                          <option key={bu.id} value={bu.id}>{bu.code} - {bu.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Location *</label>
                      <select 
                        className="select" 
                        required
                        disabled={!form.businessUnitId}
                        value={form.locationId} 
                        onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                        <option value="">{form.businessUnitId ? 'Select location' : 'Select business unit first'}</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.code} - {loc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Role *</label>
                      <select 
                        className="select" 
                        required
                        value={form.roleId} 
                        onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                        <option value="">Select role</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name} ({role.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Email *</label>
                      <input className="input" type="email" required
                        value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">First name</label>
                      <input className="input"
                        value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Last name</label>
                      <input className="input"
                        value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Username</label>
                      <input className="input"
                        value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Password</label>
                      <input 
                        className="input" 
                        type="password"
                        value={form.password} 
                        onChange={(e) => setForm({ ...form, password: e.target.value })} 
                        placeholder="Leave empty to use the default password"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave empty to use the organisation&apos;s default password (set by an administrator)
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <button 
                      type="button" 
                      className="btn btn-outline" 
                      onClick={() => {
                        setShowCreate(false);
                        setForm({ 
                          email: '', 
                          username: '', 
                          firstName: '', 
                          lastName: '',
                          organizationId: session?.user?.organizationId || '',
                          businessUnitId: '',
                          locationId: '',
                          roleId: '',
                          password: ''
                        });
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">Create User</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {editing && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Edit User</h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!editForm.organizationId || !editForm.businessUnitId || !editForm.locationId || !editForm.roleId) {
                      toast.error('Please select organization, business unit, location, and role');
                      return;
                    }
                    try {
                      // Update user basic info
                      const payload = {
                        email: editForm.email,
                        username: editForm.username || null,
                        firstName: editForm.firstName || null,
                        lastName: editForm.lastName || null,
                        status: editForm.status
                      };
                      const res = await updateUser(editing.id, payload);
                      
                      // Update role assignment
                      try {
                        await assignRole({
                          userId: editing.id,
                          roleId: editForm.roleId,
                          businessUnitId: editForm.businessUnitId,
                          locationId: editForm.locationId
                        });
                      } catch (roleErr: any) {
                        console.error('Failed to update role assignment:', roleErr);
                        const errorMsg = roleErr?.message || roleErr?.response?.data?.error?.message || 'Unknown error';
                        toast.error(`Role assignment failed: ${errorMsg}`);
                      }
                      
                      // Reload users to get updated data
                      const usersRes = await listUsers();
                      setItems(usersRes.data);
                      setEditing(null);
                      setEditForm({
                        email: '',
                        username: '',
                        firstName: '',
                        lastName: '',
                        organizationId: '',
                        businessUnitId: '',
                        locationId: '',
                        roleId: '',
                        status: 'active'
                      });
                      toast.success('User updated');
                    } catch (e: any) {
                      toast.error(e?.response?.data?.error?.message ?? 'Update failed');
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Organization *</label>
                      <select 
                        className="select" 
                        required
                        value={editForm.organizationId} 
                        onChange={(e) => setEditForm({ ...editForm, organizationId: e.target.value, businessUnitId: '', locationId: '' })}>
                        <option value="">Select organization</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Business Unit *</label>
                      <select 
                        className="select" 
                        required
                        disabled={!editForm.organizationId}
                        value={editForm.businessUnitId} 
                        onChange={(e) => setEditForm({ ...editForm, businessUnitId: e.target.value, locationId: '' })}>
                        <option value="">{editForm.organizationId ? 'Select business unit' : 'Select organization first'}</option>
                        {editBusinessUnits.map((bu) => (
                          <option key={bu.id} value={bu.id}>{bu.code} - {bu.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Location *</label>
                      <select 
                        className="select" 
                        required
                        disabled={!editForm.businessUnitId}
                        value={editForm.locationId} 
                        onChange={(e) => setEditForm({ ...editForm, locationId: e.target.value })}>
                        <option value="">{editForm.businessUnitId ? 'Select location' : 'Select business unit first'}</option>
                        {editLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.code} - {loc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Role *</label>
                      <select 
                        className="select" 
                        required
                        value={editForm.roleId} 
                        onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}>
                        <option value="">Select role</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name} ({role.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Email *</label>
                      <input className="input" type="email" required
                        value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">First name</label>
                      <input className="input"
                        value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Last name</label>
                      <input className="input"
                        value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Username</label>
                      <input className="input"
                        value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Status</label>
                      <select className="select"
                        value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="suspended">Suspended</option>
                        <option value="locked">Locked</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button type="button" className="btn btn-outline" onClick={() => {
                      setEditing(null);
                      setEditForm({
                        email: '',
                        username: '',
                        firstName: '',
                        lastName: '',
                        organizationId: '',
                        businessUnitId: '',
                        locationId: '',
                        roleId: '',
                        status: 'active'
                      });
                    }}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save Changes</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {confirmDel && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold mb-2">Delete User</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Are you sure you want to delete <span className="font-medium text-foreground">{confirmDel.email}</span>? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button className="btn btn-outline" onClick={() => setConfirmDel(null)}>Cancel</button>
                  <button
                    className="btn bg-red-600 hover:bg-red-700 text-white shadow-red-600/20"
                    onClick={async () => {
                      try {
                        await deleteUser(confirmDel.id);
                        setItems(items.filter((it) => it.id !== confirmDel.id));
                        setConfirmDel(null);
                        toast.success('User deleted');
                      } catch (e: any) {
                        toast.error(e?.response?.data?.error?.message ?? 'Delete failed');
                      }
                    }}
                  >
                    Delete User
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
