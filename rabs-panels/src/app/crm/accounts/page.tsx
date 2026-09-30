'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import { listCrmAccounts, createCustomer } from '@/lib/api';
import { crmApiError, displayName } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Building2, Plus, Eye, AlertCircle, ExternalLink, Send } from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';

export default function CrmAccountsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [apiMissing, setApiMissing] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    companyName: '',
    customerType: 'business' as const,
  });
  const [saving, setSaving] = useState(false);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listCrmAccounts({
        organizationId: orgId,
        search: search || undefined,
        ownerUserId: filters.ownerUserId || undefined,
      });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(crmApiError(err, 'Failed to load accounts'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, search, filters]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await createCustomer({
        organizationId: orgId,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        companyName: form.companyName || undefined,
        customerType: form.customerType,
      });
      toast.success('Customer created — opening Account 360');
      setShowCreate(false);
      router.push(`/crm/accounts/${res.data.id}`);
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create customer'));
    } finally {
      setSaving(false);
    }
  }

  const filterFields = useMemo<FilterField[]>(() => [], []);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'name',
      header: 'Account',
      accessorFn: (r) => displayName(r),
      cell: (info) => (
        <Link href={`/crm/accounts/${info.row.original.id}`} className="font-semibold text-brand hover:underline">
          {info.getValue() as string}
        </Link>
      ),
    },
    {
      accessorKey: 'companyName',
      header: 'Company',
      cell: (i) => (i.getValue() as string) || '—',
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: (i) => (i.getValue() as string) || '—',
    },
    {
      id: 'owner',
      header: 'Owner',
      cell: (info) => {
        const o = info.row.original.crmOwner || info.row.original.owner;
        if (!o) return <span className="text-muted-foreground">—</span>;
        const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || '—';
        return <span className="text-sm">{name}</span>;
      },
    },
    {
      id: 'erp',
      header: 'ERP ID',
      cell: (info) => (
        <span className="font-mono text-xs text-muted-foreground">#{info.row.original.id}</span>
      ),
    },
    {
      id: 'open',
      header: 'Open',
      cell: (info) => {
        const r = info.row.original;
        return (
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-border bg-muted/40">
              {r.openTicketsCount ?? 0} tix
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-brand/25 bg-brand/10 text-brand">
              {r.openDealsCount ?? 0} deals
            </span>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => (
        <Link href={`/crm/accounts/${info.row.original.id}`} className="p-2 rounded-lg hover:bg-muted text-muted-foreground inline-flex">
          <Eye size={16} />
        </Link>
      ),
    },
  ], []);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="CRM Accounts"
          actions={[
            { label: 'Open in Orders', onClick: () => router.push('/orders/customers'), icon: <ExternalLink size={16} />, variant: 'secondary' },
            { label: 'New Account', onClick: () => setShowCreate(true), icon: <Plus size={18} /> },
          ]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Accounts API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">GET /api/crm/accounts</code>.</div>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Accounts mirror ERP customers. Prefer{' '}
            <button type="button" onClick={() => router.push('/orders/customers')} className="text-brand hover:underline font-medium">
              Open in Orders
            </button>{' '}
            for full customer management, or create a lightweight account here.
          </p>

          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search accounts…"
            stats={[{ label: 'Accounts', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />

          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <Building2 className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No accounts yet</p>
              <p className="text-sm mt-1">CRM accounts are ERP customers. Create one here or open Orders.</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                >
                  <Plus size={16} /> New Account
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/orders/customers')}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium border border-border bg-background hover:bg-muted"
                >
                  <ExternalLink size={16} /> Open in Orders
                </button>
              </div>
            </div>
          ) : (
            <RichDataTable data={items} columns={columns} hideSearch />
          )}
        </main>
      </div>

      <CrmModal open={showCreate} onClose={() => setShowCreate(false)} title="New Account" icon={Building2}>
        <form onSubmit={handleCreate} className="space-y-4">
          <p className="text-xs text-muted-foreground">Creates an ERP customer. Account 360 id matches the customer id.</p>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="First name">
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className={crmInputClass}
                placeholder="First name"
              />
            </CrmField>
            <CrmField label="Last name">
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className={crmInputClass}
                placeholder="Last name"
              />
            </CrmField>
          </div>
          <CrmField label="Company">
            <input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className={crmInputClass}
              placeholder="Trading name"
            />
          </CrmField>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={crmInputClass}
                placeholder="buyer@shop.co.uk"
              />
            </CrmField>
            <CrmField label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={crmInputClass}
                placeholder="+44…"
              />
            </CrmField>
          </div>
          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel="Create Account"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
