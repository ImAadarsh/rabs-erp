'use client';
import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listAffiliates, createAffiliate, updateAffiliate, deleteAffiliate, listAffiliateConversions, listAffiliateLinks, createAffiliatePayout } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Link2, BarChart3 } from 'lucide-react';

function AffiliatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelFilter = searchParams.get('channel');
  const preferB2b = channelFilter === 'b2b' || channelFilter === 'b2b_portal';
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ affiliateCode: '', contactName: '', email: '', commissionType: 'percentage', commissionValue: 0, status: 'pending' });
  const [editing, setEditing] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [conversions, setConversions] = useState<any[]>([]);
  const [b2bOnly, setB2bOnly] = useState(preferB2b);
  const [b2bSummary, setB2bSummary] = useState<any[]>([]);
  const autoOpened = useRef(false);

  const loadData = async () => {
    try {
      const [res, b2b] = await Promise.all([
        listAffiliates(),
        preferB2b
          ? listAffiliateConversions({ channel: 'b2b_portal' }).catch(() => ({ data: [] as any[] }))
          : Promise.resolve({ data: [] as any[] })
      ]);
      setItems(res.data || []);
      if (preferB2b) setB2bSummary(b2b.data || []);
    } catch (e: any) {
      toast.error('Failed to load affiliates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken, preferB2b]);

  useEffect(() => {
    if (!preferB2b || autoOpened.current || loading || items.length === 0) return;
    autoOpened.current = true;
    openDetail(items[0], true);
  }, [preferB2b, loading, items]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await updateAffiliate(editing.id, form);
        toast.success('Affiliate updated');
      } else {
        await createAffiliate({ ...form, organizationId: session?.user?.organizationId });
        toast.success('Affiliate created');
      }
      setShowCreate(false);
      setEditing(null);
      setForm({ affiliateCode: '', contactName: '', email: '', commissionType: 'percentage', commissionValue: 0, status: 'pending' });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error saving affiliate');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteAffiliate(confirmDel.id);
      toast.success('Affiliate deleted');
      setConfirmDel(null);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error deleting affiliate');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (aff: any, b2b = false) => {
    setDetail(aff);
    setB2bOnly(b2b);
    try {
      const [l, c] = await Promise.all([
        listAffiliateLinks(aff.id),
        listAffiliateConversions({ affiliateId: aff.id, channel: b2b ? 'b2b_portal' : undefined })
      ]);
      setLinks(l.data || []);
      setConversions(c.data || []);
    } catch {
      toast.error('Failed to load affiliate detail');
    }
  };

  const handlePayout = async () => {
    if (!detail) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    try {
      await createAffiliatePayout(detail.id, {
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10)
      });
      toast.success('Payout created for last 30 days');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Payout failed');
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'affiliateCode', header: 'Code' },
    { accessorKey: 'contactName', header: 'Contact' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'commissionType', header: 'Commission Type' },
    { accessorKey: 'totalConversions', header: 'Conv' },
    { accessorKey: 'totalRevenue', header: 'Revenue' },
    { accessorKey: 'status', header: 'Status' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <button onClick={() => openDetail(row.original, false)} className="p-1 hover:bg-secondary rounded text-primary" title="Links & conversions">
            <Link2 className="h-4 w-4" />
          </button>
          <button onClick={() => openDetail(row.original, true)} className="p-1 hover:bg-secondary rounded text-primary" title="B2B conversions">
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                affiliateCode: row.original.affiliateCode,
                contactName: row.original.contactName,
                email: row.original.email,
                commissionType: row.original.commissionType,
                commissionValue: row.original.commissionValue,
                status: row.original.status
              });
              setShowCreate(true);
            }}
            className="p-1 hover:bg-secondary rounded text-primary transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setConfirmDel(row.original)}
            className="p-1 hover:bg-destructive/10 rounded text-destructive transition-colors"
            title="Delete"
          >
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
          <Header title="Marketing · Affiliates" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-muted-foreground animate-pulse">Loading...</div>
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
          <Header title="Marketing · Affiliates" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view marketing affiliates.</p>
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
        <Header title="Marketing · Affiliates" />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Affiliates</h1>
              <p className="text-muted-foreground text-sm">
                {preferB2b
                  ? 'B2B portal attribution — clicks and conversions from the wholesale website'
                  : 'Manage referral partners and affiliates'}
              </p>
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setForm({ affiliateCode: '', contactName: '', email: '', commissionType: 'percentage', commissionValue: 0, status: 'pending' });
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Create Affiliate
            </button>
          </div>

          {preferB2b && (
            <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <div className="font-medium">B2B channel filter active</div>
              <p className="text-muted-foreground text-xs mt-1">
                {b2bSummary.length} conversion{b2bSummary.length === 1 ? '' : 's'} with channel <code className="font-mono">b2b_portal</code>
                {b2bSummary[0]
                  ? ` · latest order ${b2bSummary[0].orderId} (£${Number(b2bSummary[0].orderValue).toFixed(2)})`
                  : ''}
                . Use the chart icon on a row to inspect partner links and B2B conversions.
              </p>
            </div>
          )}

          {items.length === 0 ? (
            <div className="bg-card rounded-lg border shadow-sm p-12 text-center space-y-4">
              <p className="font-medium">No affiliates yet</p>
              <p className="text-sm text-muted-foreground">Create a partner to track referral codes and commissions.</p>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm({ affiliateCode: '', contactName: '', email: '', commissionType: 'percentage', commissionValue: 0, status: 'pending' });
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 mx-auto"
              >
                <Plus className="h-4 w-4" /> Create Affiliate
              </button>
            </div>
          ) : (
            <div className="bg-card rounded-lg border shadow-sm">
              <RichDataTable columns={columns} data={items} />
            </div>
          )}

          {showCreate && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-2xl rounded-lg shadow-lg border border-border flex flex-col">
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50 rounded-t-lg">
                  <h3 className="font-semibold">{editing ? 'Edit Affiliate' : 'Create Affiliate'}</h3>
                  <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Code <span className="text-destructive">*</span></label>
                      <input
                        type="text"
                        required
                        value={form.affiliateCode}
                        onChange={e => setForm({ ...form, affiliateCode: e.target.value.toUpperCase() })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Contact Name <span className="text-destructive">*</span></label>
                      <input
                        type="text"
                        required
                        value={form.contactName}
                        onChange={e => setForm({ ...form, contactName: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Email <span className="text-destructive">*</span></label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Status</label>
                      <select
                        value={form.status}
                        onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="pending">Pending</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="terminated">Terminated</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Commission Type</label>
                      <select
                        value={form.commissionType}
                        onChange={e => setForm({ ...form, commissionType: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed_per_sale">Fixed per Sale</option>
                        <option value="tiered">Tiered</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Commission Value</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={form.commissionValue}
                        onChange={e => setForm({ ...form, commissionValue: parseFloat(e.target.value) })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none transition-shadow"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4 flex justify-end gap-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="px-4 py-2 rounded-md hover:bg-secondary/80 text-sm font-medium transition-colors"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      {submitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {detail && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-xl rounded-lg shadow-lg border border-border p-4 space-y-4 max-h-[90vh] overflow-auto">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold">{detail.contactName} · {detail.affiliateCode}</h3>
                    <p className="text-xs text-muted-foreground">{b2bOnly ? 'B2B portal conversions' : 'Links & all conversions'}</p>
                  </div>
                  <button onClick={() => setDetail(null)}><X className="h-5 w-5" /></button>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Tracking links</h4>
                  {links.length === 0 ? <p className="text-xs text-muted-foreground">No links</p> : (
                    <ul className="text-xs space-y-1 font-mono">
                      {links.map((l) => (
                        <li key={l.id}>{l.trackingCode} → {l.originalUrl} ({l.clickCount} clicks)</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Conversions</h4>
                  {conversions.length === 0 ? <p className="text-xs text-muted-foreground">No conversions yet</p> : (
                    <ul className="text-xs space-y-1">
                      {conversions.map((c) => (
                        <li key={c.id}>
                          Order {c.orderId} · £{Number(c.orderValue).toFixed(2)} · commission £{Number(c.commissionAmount).toFixed(2)}
                          {c.channel ? ` · ${c.channel}` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button onClick={handlePayout} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm">
                  Create 30-day payout
                </button>
              </div>
            </div>
          )}

          {confirmDel && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-sm rounded-lg shadow-lg border border-border flex flex-col p-6 text-center">
                <h3 className="text-lg font-bold mb-2">Confirm Delete</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Are you sure you want to delete affiliate "{confirmDel.contactName}"? This action cannot be undone.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setConfirmDel(null)}
                    className="px-4 py-2 rounded-md border border-input hover:bg-secondary/50 text-sm font-medium transition-colors"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={submitting}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors"
                  >
                    {submitting ? 'Deleting...' : 'Delete'}
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

export default function AffiliatesPageWrapped() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <AffiliatesPage />
    </Suspense>
  );
}
