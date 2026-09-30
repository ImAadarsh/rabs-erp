'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, User, RefreshCw } from 'lucide-react';

type Customer = {
  id: string;
  customerNumber?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  customerType?: string;
  tier?: string;
  status?: string;
  [key: string]: any;
};

export default function CustomersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Customer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: '',
    phone: '',
    firstName: '',
    lastName: '',
    companyName: '',
    customerType: 'individual' as 'individual' | 'business' | 'wholesale' | 'vip',
    tier: 'standard' as 'standard' | 'silver' | 'gold' | 'platinum',
    status: 'active' as 'active' | 'inactive' | 'blocked'
  });
  const [editing, setEditing] = useState<Customer | null>(null);
  const [confirmDel, setConfirmDel] = useState<Customer | null>(null);

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  const orgId = session?.user?.organizationId;

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await listCustomers({ organizationId: orgId, search: search || undefined, ...filters });
      setItems(res.data || []);
      setTotalCount(res.pagination?.total ?? res.data?.length ?? 0);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [orgId, search, filters]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void loadData();
  }, [hydrated, hasAccess, router, session?.accessToken, loadData]);

  const filterFields = useMemo<FilterField[]>(() => [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      primary: true,
      options: ['active', 'inactive', 'blocked'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'customerType',
      label: 'Type',
      type: 'select',
      primary: true,
      options: ['individual', 'business', 'wholesale', 'vip'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'tier',
      label: 'Tier',
      type: 'select',
      primary: true,
      options: ['standard', 'silver', 'gold', 'platinum'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'hasEmail',
      label: 'Email on file',
      type: 'select',
      options: [
        { value: 'true', label: 'Has email' },
        { value: 'false', label: 'No email' }
      ]
    },
    {
      key: 'marketingOptIn',
      label: 'Marketing opt-in',
      type: 'select',
      options: [
        { value: 'true', label: 'Opted in' },
        { value: 'false', label: 'Not opted in' }
      ]
    },
    { key: 'createdFrom', label: 'Created from', type: 'date' },
    { key: 'createdTo', label: 'Created to', type: 'date' },
    {
      key: 'sortBy',
      label: 'Sort by',
      type: 'select',
      options: [
        { value: 'createdAt', label: 'Created' },
        { value: 'lastName', label: 'Last name' },
        { value: 'email', label: 'Email' },
        { value: 'lifetimeValue', label: 'Lifetime value' },
        { value: 'totalOrders', label: 'Total orders' }
      ]
    },
    {
      key: 'sortDir',
      label: 'Sort direction',
      type: 'select',
      options: [
        { value: 'DESC', label: 'Descending' },
        { value: 'ASC', label: 'Ascending' }
      ]
    }
  ], []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.organizationId) {
      toast.error('Organization ID required');
      return;
    }
    try {
      const res = await createCustomer({
        organizationId: session.user.organizationId,
        ...form
      });
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      setForm({ email: '', phone: '', firstName: '', lastName: '', companyName: '', customerType: 'individual', tier: 'standard', status: 'active' });
      toast.success('Customer created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create customer');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateCustomer(editing.id, form);
      setItems(prev => prev.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Customer updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update customer');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteCustomer(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Customer deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete customer');
    }
  }

  const columns = useMemo<ColumnDef<Customer>[]>(() => [
    {
      accessorKey: 'customerNumber',
      header: 'Customer #',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <User size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.customerNumber || '-'}</span>
        </div>
      )
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const c = row.original;
        return c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || '-';
      }
    },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'customerType', header: 'Type' },
    { accessorKey: 'tier', header: 'Tier' },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                email: row.original.email || '',
                phone: row.original.phone || '',
                firstName: row.original.firstName || '',
                lastName: row.original.lastName || '',
                companyName: row.original.companyName || '',
                customerType: (row.original.customerType || 'individual') as any,
                tier: (row.original.tier || 'standard') as any,
                status: (row.original.status || 'active') as any
              });
            }}
            className="p-1 hover:bg-muted rounded"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => setConfirmDel(row.original)} className="p-1 hover:bg-muted rounded text-red-500">
            <Trash2 className="h-4 w-4" />
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
          <Header title="Orders · Customers" />
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
          <Header title="Orders · Customers" />
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
        <Header title="Orders · Customers" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">Customers</h1>
                <p className="text-muted-foreground mt-1">
                  Customer records, including those created automatically from channel orders
                </p>
              </div>
            </div>

            <FilterBar
              fields={filterFields}
              values={filters}
              onChange={setFilters}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Name, email, phone, company, customer #…"
              loading={loading}
              stats={[{ label: 'Customers', value: String(totalCount) }]}
              actions={
                <>
                  <button
                    onClick={() => void loadData()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  {hasAccess && (
                    <button
                      onClick={() => setShowCreate(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-600"
                    >
                      <Plus className="h-4 w-4" />
                      Add Customer
                    </button>
                  )}
                </>
              }
            />

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading customers...</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-2">
                <RichDataTable columns={columns} data={items} hideSearch />
              </div>
            )}

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Customer</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">First Name</label>
                        <input
                          type="text"
                          value={form.firstName}
                          onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Last Name</label>
                        <input
                          type="text"
                          value={form.lastName}
                          onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Company Name</label>
                        <input
                          type="text"
                          value={form.companyName}
                          onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Email</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Phone</label>
                        <input
                          type="text"
                          value={form.phone}
                          onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Customer Type</label>
                        <select
                          value={form.customerType}
                          onChange={e => setForm(prev => ({ ...prev, customerType: e.target.value as any }))}
                          className="select"
                        >
                          <option value="individual">Individual</option>
                          <option value="business">Business</option>
                          <option value="wholesale">Wholesale</option>
                          <option value="vip">VIP</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Tier</label>
                        <select
                          value={form.tier}
                          onChange={e => setForm(prev => ({ ...prev, tier: e.target.value as any }))}
                          className="select"
                        >
                          <option value="standard">Standard</option>
                          <option value="silver">Silver</option>
                          <option value="gold">Gold</option>
                          <option value="platinum">Platinum</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600">
                        Create
                      </button>
                      <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Modal */}
            {editing && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit Customer</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">First Name</label>
                        <input
                          type="text"
                          value={form.firstName}
                          onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Last Name</label>
                        <input
                          type="text"
                          value={form.lastName}
                          onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Company Name</label>
                        <input
                          type="text"
                          value={form.companyName}
                          onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Email</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Phone</label>
                        <input
                          type="text"
                          value={form.phone}
                          onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Customer Type</label>
                        <select
                          value={form.customerType}
                          onChange={e => setForm(prev => ({ ...prev, customerType: e.target.value as any }))}
                          className="select"
                        >
                          <option value="individual">Individual</option>
                          <option value="business">Business</option>
                          <option value="wholesale">Wholesale</option>
                          <option value="vip">VIP</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Tier</label>
                        <select
                          value={form.tier}
                          onChange={e => setForm(prev => ({ ...prev, tier: e.target.value as any }))}
                          className="select"
                        >
                          <option value="standard">Standard</option>
                          <option value="silver">Silver</option>
                          <option value="gold">Gold</option>
                          <option value="platinum">Platinum</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <button type="submit" className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-600">
                        Update
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete Confirmation */}
            {confirmDel && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border p-6">
                  <h3 className="text-lg font-semibold mb-2">Delete Customer</h3>
                  <p className="text-muted-foreground mb-4">Are you sure you want to delete this customer? This action cannot be undone.</p>
                  <div className="flex gap-2">
                    <button onClick={onDelete} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                      Delete
                    </button>
                    <button onClick={() => setConfirmDel(null)} className="px-4 py-2 bg-muted rounded hover:bg-muted/80">
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

