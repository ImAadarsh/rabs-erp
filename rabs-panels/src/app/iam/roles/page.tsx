'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listRoles, createRole, assignRole, listUsers, updateRole, listOrganizations, listBusinessUnits, listLocations } from '@/lib/api';
import { toast } from 'sonner';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { RichDataTable } from '@/components/rich-data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, UserPlus, Settings } from 'lucide-react';
import { NAV_MODULES, type NavModule } from '@/lib/nav-pages.generated';
import { builtInPagesForRoles } from '@/lib/page-access';
import { useApiAccess } from '@/hooks/use-api-access';

type Role = {
  id: string;
  name: string;
  code: string;
  [key: string]: any;
};

function savedPages(role: Role): string[] {
  const pages = role.permissions?.pages;
  return Array.isArray(pages) ? pages.filter((p: unknown): p is string => typeof p === 'string' && !!p) : [];
}

export default function RolesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN']);
  const { can } = useApiAccess();
  const canCreateRole = can('POST', '/api/iam/roles');
  const canEditPages = can('PATCH', '/api/iam/roles/:id');
  const canAssignRole = can('POST', '/api/iam/roles/assign');
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', code: '' });
  const [assignForm, setAssignForm] = useState({ userId: '', roleId: '', organizationId: '', businessUnitId: '', locationId: '' });
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [pagePermissions, setPagePermissions] = useState<Record<string, boolean>>({});
  const [permissionFilter, setPermissionFilter] = useState('');
  const [showingBuiltInPages, setShowingBuiltInPages] = useState(false);
  // Pages whose data the role's API access covers; anything else would open as a 403 page.
  const roleApiPages = useMemo(
    () => new Set(selectedRole ? builtInPagesForRoles([selectedRole.code]) : []),
    [selectedRole]
  );

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [r, u, orgs] = await Promise.all([listRoles(), listUsers(), listOrganizations()]);
        setRoles(r.data);
        setUsers(u.data);
        setOrganizations(orgs.data || []);
        
        // Set default organization to current user's organization
        if (session?.user?.organizationId) {
          setAssignForm(prev => ({ ...prev, organizationId: session.user.organizationId }));
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
      } catch {
        toast.error('Failed to load roles');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    try {
      const res = await createRole({
        organizationId: session.user.organizationId,
        name: createForm.name,
        code: createForm.code
      });
      setRoles([res.data, ...roles]);
      setShowCreate(false);
      setCreateForm({ name: '', code: '' });
      toast.success('Role created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Create failed');
    }
  }

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignForm.organizationId || !assignForm.businessUnitId || !assignForm.locationId) {
      toast.error('Please select organization, business unit, and location');
      return;
    }
    try {
      await assignRole({ 
        userId: assignForm.userId, 
        roleId: assignForm.roleId,
        businessUnitId: assignForm.businessUnitId,
        locationId: assignForm.locationId
      });
      setShowAssign(false);
      setAssignForm({ userId: '', roleId: '', organizationId: session?.user?.organizationId || '', businessUnitId: '', locationId: '' });
      toast.success('Role assigned');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Assign failed');
    }
  }

  // Load business units when organization changes
  useEffect(() => {
    if (assignForm.organizationId) {
      listBusinessUnits(assignForm.organizationId).then(res => {
        setBusinessUnits(res.data || []);
        setAssignForm(prev => ({ ...prev, businessUnitId: '', locationId: '' }));
      }).catch(e => {
        console.error('Failed to load business units:', e);
        setBusinessUnits([]);
      });
    } else {
      setBusinessUnits([]);
      setLocations([]);
    }
  }, [assignForm.organizationId]);

  // Load locations when business unit changes
  useEffect(() => {
    if (assignForm.businessUnitId) {
      listLocations(assignForm.businessUnitId).then(res => {
        setLocations(res.data || []);
        setAssignForm(prev => ({ ...prev, locationId: '' }));
      }).catch(e => {
        console.error('Failed to load locations:', e);
        setLocations([]);
      });
    } else {
      setLocations([]);
    }
  }, [assignForm.businessUnitId]);

  function openPermissionsEditor(role: Role) {
    setSelectedRole(role);
    const saved = savedPages(role);
    // No saved pages = unrestricted today; tick what the role can already open so saving keeps that access.
    const granted = saved.length > 0 ? saved : builtInPagesForRoles([role.code]);
    const pages: Record<string, boolean> = {};
    granted.forEach((key) => { pages[key] = true; });
    setPagePermissions(pages);
    setShowingBuiltInPages(saved.length === 0);
    setPermissionFilter('');
    setShowPermissions(true);
  }

  function setModulePages(mod: NavModule, enabled: boolean) {
    setPagePermissions((prev) => {
      const next = { ...prev };
      mod.pages.forEach((page) => { if (roleApiPages.has(page.key)) next[page.key] = enabled; });
      return next;
    });
  }

  async function savePermissions() {
    if (!selectedRole) return;
    try {
      const pageKeys = Object.entries(pagePermissions)
        .filter(([key, enabled]) => enabled && roleApiPages.has(key))
        .map(([key, _]) => key);
      
      const current = selectedRole.permissions;
      const permissions = {
        ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
        pages: pageKeys
      };
      
      await updateRole(selectedRole.id, { permissions });
      // Update local state
      setRoles(roles.map(r => r.id === selectedRole.id ? { ...r, permissions } : r));
      setShowPermissions(false);
      setSelectedRole(null);
      toast.success('Permissions updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to update permissions');
    }
  }

  const columns = useMemo<ColumnDef<Role>[]>(() => [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: (info) => <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: (info) => <span className="font-medium">{info.getValue() as string}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const role = info.row.original;
        return (
          <button
            onClick={() => openPermissionsEditor(role)}
            className="btn btn-outline btn-sm flex items-center gap-2"
          >
            <Settings size={14} />
            {canEditPages ? 'Edit Pages' : 'View Pages'}
          </button>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [canEditPages]);

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header
          title="IAM · Roles"
          actions={[
            ...(canCreateRole ? [{ label: 'New Role', onClick: () => setShowCreate(true), icon: <Plus size={16} /> }] : []),
            ...(canAssignRole ? [{ label: 'Assign Role', onClick: () => setShowAssign(true), icon: <UserPlus size={16} /> }] : [])
          ]}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Roles</h2>
              <p className="text-muted-foreground">Manage roles and permissions.</p>
            </div>
            <div className="flex gap-2">
              {canAssignRole && <button className="btn btn-outline" onClick={() => setShowAssign(true)}>Assign Role</button>}
              {canCreateRole && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Role</button>}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center rounded-2xl border border-border bg-card/50 animate-pulse">
              Loading roles...
            </div>
          ) : (
            <RichDataTable
              columns={columns}
              data={roles}
              searchPlaceholder="Search roles..."
            />
          )}

          {showCreate && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-semibold mb-4">Create Role</h3>
                <form onSubmit={onCreate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Name</label>
                    <input className="input" required
                      value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Code</label>
                    <input className="input" required
                      value={createForm.code} onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Create Role</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showAssign && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Assign Role to User</h3>
                <form onSubmit={onAssign} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Organization *</label>
                      <select className="select" required
                        value={assignForm.organizationId} 
                        onChange={(e) => setAssignForm({ ...assignForm, organizationId: e.target.value, businessUnitId: '', locationId: '' })}>
                        <option value="">Select organization</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Business Unit *</label>
                      <select className="select" required
                        disabled={!assignForm.organizationId}
                        value={assignForm.businessUnitId} 
                        onChange={(e) => setAssignForm({ ...assignForm, businessUnitId: e.target.value, locationId: '' })}>
                        <option value="">{assignForm.organizationId ? 'Select business unit' : 'Select organization first'}</option>
                        {businessUnits.map((bu) => (
                          <option key={bu.id} value={bu.id}>{bu.code} - {bu.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Location *</label>
                      <select className="select" required
                        disabled={!assignForm.businessUnitId}
                        value={assignForm.locationId} 
                        onChange={(e) => setAssignForm({ ...assignForm, locationId: e.target.value })}>
                        <option value="">{assignForm.businessUnitId ? 'Select location' : 'Select business unit first'}</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>{loc.code} - {loc.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">User *</label>
                    <select className="select" required
                      value={assignForm.userId} onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}>
                      <option value="">Select user</option>
                      {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.email} {u.firstName || u.lastName ? `(${u.firstName || ''} ${u.lastName || ''})`.trim() : ''}</option>
                      ))}
                    </select>
                  </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1.5">Role *</label>
                    <select className="select" required
                      value={assignForm.roleId} onChange={(e) => setAssignForm({ ...assignForm, roleId: e.target.value })}>
                      <option value="">Select role</option>
                      {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.code} - {r.name}</option>
                      ))}
                    </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button type="button" className="btn btn-outline" onClick={() => {
                      setShowAssign(false);
                      setAssignForm({ userId: '', roleId: '', organizationId: session?.user?.organizationId || '', businessUnitId: '', locationId: '' });
                    }}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Assign Role</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {showPermissions && selectedRole && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-4xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold">{canEditPages ? 'Edit Page Permissions' : 'Page Permissions'}</h3>
                    <p className="text-sm text-muted-foreground mt-1">Role: <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{selectedRole.code}</span> - {selectedRole.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowPermissions(false);
                      setSelectedRole(null);
                      setPagePermissions({});
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-4 mb-6">
                  <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/40 px-3 py-2">
                    Selected pages are enforced in the menu, on direct page links and on the API (users see a “No access” screen otherwise).
                    Leaving every page unticked puts this role back on its built-in access (the pages pre-ticked when nothing is saved);
                    a user holding any role without saved pages gets the built-in access of all their roles.
                    Super Administrator always has full access. Changes apply on the user&apos;s next page load.
                  </p>
                  {!canEditPages && (
                    <p className="text-xs rounded-lg border border-border bg-muted/40 px-3 py-2">
                      Read-only: only a Super Administrator can change role page permissions.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Greyed-out pages are outside this role&apos;s built-in access: the API refuses their data for this role, so they cannot be granted here.
                  </p>
                  {showingBuiltInPages && (
                    <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2">
                      No pages are saved for this role yet, so it currently uses its built-in access. The ticked pages are the ones it can open today;
                      saving them restricts the role to exactly these pages.
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Select which pages this role can access ({Object.entries(pagePermissions).filter(([k, on]) => on && roleApiPages.has(k)).length} selected):
                    </p>
                    <input
                      className="input sm:max-w-[220px]"
                      placeholder="Filter pages..."
                      value={permissionFilter}
                      onChange={(e) => setPermissionFilter(e.target.value)}
                    />
                  </div>
                  {NAV_MODULES.map((mod) => {
                    const q = permissionFilter.trim().toLowerCase();
                    const visible = q
                      ? mod.pages.filter((p) => `${mod.module} ${p.label} ${p.path}`.toLowerCase().includes(q))
                      : mod.pages;
                    if (visible.length === 0) return null;
                    const grantable = mod.pages.filter((p) => roleApiPages.has(p.key));
                    const selectedCount = grantable.filter((p) => pagePermissions[p.key]).length;
                    const allSelected = grantable.length > 0 && selectedCount === grantable.length;
                    return (
                      <div key={mod.module} className="rounded-xl border border-border">
                        <label className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 rounded-t-xl cursor-pointer">
                          <span className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              className="w-4 h-4 cursor-pointer accent-[#A31F24]"
                              checked={allSelected}
                              disabled={!canEditPages || grantable.length === 0}
                              ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && !allSelected; }}
                              onChange={(e) => setModulePages(mod, e.target.checked)}
                            />
                            <span className="font-semibold text-sm">{mod.module}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {selectedCount}/{grantable.length}{canEditPages ? ' · Select all' : ''}
                          </span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                          {visible.map((page) => {
                            const apiAllows = roleApiPages.has(page.key);
                            return (
                            <label
                              key={`${mod.module}-${page.key}`}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg ${apiAllows ? 'hover:bg-primary/5 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                              title={apiAllows ? undefined : 'The API refuses this page’s data for this role'}
                            >
                              <input
                                type="checkbox"
                                className="w-4 h-4 cursor-pointer accent-[#A31F24]"
                                checked={apiAllows && (pagePermissions[page.key] || false)}
                                disabled={!canEditPages || !apiAllows}
                                onChange={(e) => setPagePermissions((prev) => ({ ...prev, [page.key]: e.target.checked }))}
                              />
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{page.label}</div>
                                <div className="text-xs text-muted-foreground font-mono truncate">{page.path}</div>
                              </div>
                            </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setShowPermissions(false);
                      setSelectedRole(null);
                      setPagePermissions({});
                    }}
                  >
                    {canEditPages ? 'Cancel' : 'Close'}
                  </button>
                  {canEditPages && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={savePermissions}
                    >
                      Save Permissions
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
