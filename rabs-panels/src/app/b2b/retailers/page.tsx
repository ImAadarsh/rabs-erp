'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { createB2bRetailer, getB2bRetailer, listB2bRetailers, updateB2bRetailer } from '@/lib/api';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, Store, X } from 'lucide-react';

const EMPTY_FORM = {
  email: '', password: '', companyName: '', firstName: '', lastName: '', phone: '',
  creditLimit: '5000', paymentTerms: '30 Days Net', tier: 'gold' as 'standard' | 'silver' | 'gold' | 'platinum'
};

const FIELDS: { key: keyof typeof EMPTY_FORM; label: string; placeholder: string; type?: string; autoComplete?: string; required?: boolean }[] = [
  { key: 'email', label: 'Login email', placeholder: 'buyer@retailer.co.uk', type: 'email', autoComplete: 'off', required: true },
  { key: 'password', label: 'Temporary password', placeholder: 'At least 6 characters', type: 'password', autoComplete: 'new-password', required: true },
  { key: 'companyName', label: 'Company name', placeholder: 'e.g. Stafford Street Stores' },
  { key: 'firstName', label: 'Contact first name', placeholder: 'First name' },
  { key: 'lastName', label: 'Contact last name', placeholder: 'Last name' },
  { key: 'phone', label: 'Phone', placeholder: '+44 7700 900000', type: 'tel' },
  { key: 'creditLimit', label: 'Credit limit (£)', placeholder: '5000', type: 'number' },
  { key: 'paymentTerms', label: 'Payment terms', placeholder: 'e.g. 30 Days Net' }
];

const gbp = (n: any) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function B2bRetailersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [credsUnlocked, setCredsUnlocked] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const orgId = session?.user?.organizationId;

  const load = async () => {
    if (!orgId) return;
    const res = await listB2bRetailers({ organizationId: orgId });
    setItems(res.data || []);
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load().catch(() => toast.error('Failed to load retailers')).finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  const toggleStatus = async (row: any) => {
    const next = row.status === 'disabled' ? 'active' : 'disabled';
    setTogglingId(row.id);
    try {
      const res = await updateB2bRetailer(row.id, { status: next });
      const updated = res.data;
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated, status: updated?.status ?? next } : r)));
      setDetail((d: any) => (d?.id === row.id ? { ...d, status: updated?.status ?? next } : d));
      toast.success(next === 'disabled' ? 'Login disabled' : 'Login enabled');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update login status');
    } finally {
      setTogglingId(null);
    }
  };

  const openDetail = async (row: any) => {
    if (!orgId) return;
    setDetail({ ...row });
    setDetailLoading(true);
    try {
      const res = await getB2bRetailer(row.id, orgId);
      setDetail(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load retailer');
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorFn: (r) => r.customer?.companyName || r.customer?.customerNumber, header: 'Company' },
    { accessorKey: 'email', header: 'Login email' },
    { accessorFn: (r) => r.customer?.tier, header: 'Tier' },
    {
      accessorFn: (r) => r.customer?.creditLimit,
      header: 'Credit limit',
      cell: ({ row }) => `£${Number(row.original.customer?.creditLimit || 0).toLocaleString()}`
    },
    {
      accessorFn: (r) => r.customer?.creditUsed,
      header: 'Used',
      cell: ({ row }) => `£${Number(row.original.customer?.creditUsed || 0).toLocaleString()}`
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${row.original.status === 'disabled' ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
          {row.original.status}
        </span>
      )
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end">
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-primary"
            onClick={() => openDetail(row.original)}
          >
            <Eye size={14} /> View
          </button>
          <button
            disabled={togglingId === row.original.id}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-primary disabled:opacity-50"
            onClick={() => toggleStatus(row.original)}
          >
            {row.original.status === 'disabled' ? 'Enable' : 'Disable'}
          </button>
        </div>
      )
    }
  ], [togglingId, orgId]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setCredsUnlocked(false);
    setShowCreate(true);
  };

  const create = async () => {
    if (!orgId) return;
    if (!form.email.trim() || form.password.length < 6) {
      toast.error('Login email and a password of at least 6 characters are required');
      return;
    }
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    try {
      await createB2bRetailer({
        organizationId: orgId,
        email: form.email.trim(),
        password: form.password,
        companyName: opt(form.companyName),
        firstName: opt(form.firstName),
        lastName: opt(form.lastName),
        phone: opt(form.phone),
        creditLimit: Number(form.creditLimit) || 0,
        paymentTerms: opt(form.paymentTerms),
        tier: form.tier
      });
      toast.success('Retailer created');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (e: any) {
      const err = e?.response?.data?.error;
      const fieldMsg = Array.isArray(err?.details)
        ? err.details.map((i: any) => `${(i.path || []).join('.')}: ${i.message}`).join('; ')
        : '';
      toast.error(fieldMsg || err?.message || 'Create failed');
    }
  };

  const c = detail?.customer;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Retailers" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Store />
              <div>
                <h1 className="text-xl font-bold">Wholesale retailers</h1>
                <p className="text-sm text-muted-foreground">Portal logins linked to wholesale customers and trade credit.</p>
              </div>
            </div>
            <button onClick={openCreate} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
              <Plus size={16} /> New retailer
            </button>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <RichDataTable data={items} columns={columns} searchPlaceholder="Search retailers..." />
          )}
        </main>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form
            autoComplete="off"
            onSubmit={(e) => { e.preventDefault(); create(); }}
            className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-3 max-h-[90vh] overflow-auto"
          >
            <div className="flex justify-between items-center">
              <h2 className="font-bold">Create retailer login</h2>
              <button type="button" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <label key={f.key} className={`block text-xs font-medium text-muted-foreground ${f.key === 'email' || f.key === 'password' || f.key === 'companyName' ? 'sm:col-span-2' : ''}`}>
                  {f.label}{f.required ? ' *' : ''}
                  <input
                    name={`retailer-${f.key}`}
                    type={f.type || 'text'}
                    autoComplete={f.autoComplete || 'off'}
                    // Browsers skip read-only fields when filling saved ERP logins.
                    readOnly={(f.key === 'email' || f.key === 'password') && !credsUnlocked}
                    onFocus={() => setCredsUnlocked(true)}
                    placeholder={f.placeholder}
                    min={f.type === 'number' ? 0 : undefined}
                    className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background text-sm text-foreground"
                    value={form[f.key] as string}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="block text-xs font-medium text-muted-foreground sm:col-span-2">
                Tier
                <select
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background text-sm text-foreground"
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value as typeof form.tier })}
                >
                  <option value="standard">Standard</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                </select>
              </label>
            </div>
            <button type="submit" className="w-full bg-primary text-primary-foreground py-2 rounded-xl font-semibold">Create</button>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setDetail(null)}>
          <div className="bg-card border-l border-border w-full max-w-xl h-full overflow-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold">{c?.companyName || detail.email}</h2>
                <p className="text-sm text-muted-foreground">{detail.email} · login {detail.status}</p>
              </div>
              <button onClick={() => setDetail(null)}><X size={18} /></button>
            </div>
            {detailLoading && <div className="text-sm text-muted-foreground">Loading details…</div>}

            <section className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Contact</div>{[c?.firstName, c?.lastName].filter(Boolean).join(' ') || '—'}</div>
              <div><div className="text-xs text-muted-foreground">Phone</div>{c?.phone || '—'}</div>
              <div><div className="text-xs text-muted-foreground">Customer email</div>{c?.email || '—'}</div>
              <div><div className="text-xs text-muted-foreground">Customer no.</div>{c?.customerNumber || '—'}</div>
              <div><div className="text-xs text-muted-foreground">Tax / VAT ID</div>{c?.taxId || '—'}</div>
              <div><div className="text-xs text-muted-foreground">Tier</div>{c?.tier || '—'}</div>
              <div><div className="text-xs text-muted-foreground">Last login</div>{detail.lastLoginAt ? new Date(detail.lastLoginAt).toLocaleString('en-GB') : '—'}</div>
              <div><div className="text-xs text-muted-foreground">Created</div>{detail.createdAt ? new Date(detail.createdAt).toLocaleDateString('en-GB') : '—'}</div>
            </section>

            <section className="p-4 rounded-xl border border-border grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Credit limit</div><b>{gbp(c?.creditLimit)}</b></div>
              <div><div className="text-xs text-muted-foreground">Credit used</div><b>{gbp(c?.creditUsed)}</b></div>
              <div><div className="text-xs text-muted-foreground">Available</div><b>{gbp(Number(c?.creditLimit || 0) - Number(c?.creditUsed || 0))}</b></div>
              <div className="col-span-3"><div className="text-xs text-muted-foreground">Payment terms</div>{c?.paymentTerms || '—'}</div>
            </section>

            {Array.isArray(c?.addresses) && c.addresses.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Addresses</h3>
                {c.addresses.map((a: any) => (
                  <div key={a.id} className="text-sm p-3 rounded-lg border border-border">
                    {[a.company, a.addressLine1, a.addressLine2, a.city, a.postalCode, a.countryCode].filter(Boolean).join(', ')}
                    {a.isDefault && <span className="ml-2 text-xs text-primary">Default</span>}
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Orders</h3>
                {detail.stats && (
                  <span className="text-xs text-muted-foreground">{detail.stats.orderCount} orders · {gbp(detail.stats.totalSpend)} spend</span>
                )}
              </div>
              {(detail.orders || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No B2B orders yet.</div>
              ) : (
                <div className="border border-border rounded-xl divide-y divide-border">
                  {detail.orders.slice(0, 20).map((o: any) => (
                    <Link key={o.id} href={`/b2b/orders/${o.id}`} className="flex justify-between px-3 py-2 text-sm hover:bg-muted/40">
                      <span className="font-medium">{o.orderNumber}</span>
                      <span className="text-muted-foreground">{o.status}</span>
                      <span>{gbp(o.total)}</span>
                      <span className="text-muted-foreground">{o.orderDate ? new Date(o.orderDate).toLocaleDateString('en-GB') : '—'}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {(detail.ledger || []).length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold text-sm">Credit ledger</h3>
                <div className="border border-border rounded-xl divide-y divide-border">
                  {detail.ledger.slice(0, 15).map((l: any) => (
                    <div key={l.id} className="flex justify-between px-3 py-2 text-sm">
                      <span>{l.entryType}</span>
                      <span className="text-muted-foreground truncate max-w-[180px]">{l.description || l.reference}</span>
                      <span>{gbp(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-xl border border-border text-sm font-semibold"
                onClick={() => toggleStatus(detail)}
              >
                {detail.status === 'disabled' ? 'Enable login' : 'Disable login'}
              </button>
              <Link href={`/b2b/orders?new=${detail.id}`} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                New order for this retailer
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
