'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  listOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  listCustomers,
  listOrderSyncConnections,
  syncAllChannelOrders,
  type OrderSyncConnection
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, ShoppingCart, Eye, Store, Monitor, RefreshCw, Download } from 'lucide-react';
import Link from 'next/link';

type Order = {
  id: string;
  orderNumber: string;
  channel?: string;
  channelOrderNumber?: string;
  channelConnection?: { id: string; name: string; storeUrl?: string | null; channel?: string } | null;
  customerEmail?: string;
  total?: number;
  currency?: string;
  status?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  orderDate?: string;
  [key: string]: any;
};

const CHANNEL_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  ebay: 'eBay',
  tiktok: 'TikTok',
  etsy: 'Etsy',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  wix: 'Wix',
  b2b_portal: 'B2B Portal',
  pos: 'POS / EPOS',
  phone: 'Phone',
  email: 'Email',
  other: 'Other'
};

function StatusPill({ value, tone }: { value?: string; tone: 'status' | 'payment' | 'fulfillment' }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const palettes: Record<string, Record<string, string>> = {
    status: {
      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      processing: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      on_hold: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
      refunded: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
    },
    payment: {
      paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      authorized: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      refunded: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
      failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
    },
    fulfillment: {
      fulfilled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      partially_fulfilled: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      processing: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      pending: 'bg-muted text-muted-foreground',
      cancelled: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
    }
  };
  const cls = palettes[tone][value] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    orderNumber: '',
    channel: 'shopify' as 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wix' | 'b2b_portal' | 'pos' | 'phone' | 'email' | 'other',
    customerId: '',
    customerEmail: '',
    customerPhone: '',
    orderDate: new Date().toISOString().split('T')[0],
    currency: 'GBP',
    subtotal: 0,
    discountAmount: 0,
    shippingAmount: 0,
    taxAmount: 0,
    total: 0,
    paymentStatus: 'pending' as 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'refunded' | 'failed',
    fulfillmentStatus: 'pending' as 'pending' | 'processing' | 'partially_fulfilled' | 'fulfilled' | 'cancelled',
    status: 'pending' as 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded' | 'on_hold'
  });
  const [editing, setEditing] = useState<Order | null>(null);
  const [confirmDel, setConfirmDel] = useState<Order | null>(null);

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<{ totalValue: number; count: number }>({ totalValue: 0, count: 0 });
  const [connections, setConnections] = useState<OrderSyncConnection[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  const orgId = session?.user?.organizationId;

  async function onSyncChannels() {
    if (!orgId || syncing) return;
    try {
      setSyncing(true);
      setSyncProgress('Starting…');
      const result = await syncAllChannelOrders({
        organizationId: orgId,
        updateExisting: true,
        importPayments: true,
        createCustomers: true,
        onProgress: (done, total, name) => setSyncProgress(`${done}/${total}: ${name}`)
      });
      if (result.connections === 0) {
        toast.error('No active POS or website connections found');
        return;
      }
      const t = result.totals;
      toast.success(
        `Synced ${result.connections} channel(s): ${t.ordersCreated} new, ${t.ordersUpdated} updated, ${t.paymentsCreated} payments`
      );
      if (result.failures.length) {
        toast.error(result.failures.map((f) => `${f.name}: ${f.message}`).join(' · '));
      }
      await loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.message || 'Channel sync failed');
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await listOrders({ organizationId: orgId, search: search || undefined, ...filters });
      setItems(res.data || []);
      setSummary({
        totalValue: res.summary?.totalValue ?? 0,
        count: res.summary?.count ?? res.data?.length ?? 0
      });
    } catch {
      toast.error('Failed to load orders');
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

  useEffect(() => {
    if (!hydrated || !hasAccess || !orgId) return;
    listCustomers({ organizationId: orgId })
      .then((res) => setCustomers(res.data || []))
      .catch(() => { /* customers are optional for the create form */ });
    listOrderSyncConnections({ organizationId: orgId })
      .then((res) => setConnections(res.data || []))
      .catch(() => { /* store filter degrades gracefully */ });
  }, [hydrated, hasAccess, orgId]);

  const filterFields = useMemo<FilterField[]>(() => [
    {
      key: 'channel',
      label: 'Channel',
      type: 'select',
      primary: true,
      options: Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))
    },
    {
      key: 'connectionId',
      label: 'Store / Till',
      type: 'select',
      primary: true,
      options: connections.map((c) => ({
        value: c.id,
        label: `${c.kind === 'pos' ? 'POS' : 'Web'} · ${c.name}`
      }))
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      primary: true,
      options: ['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded', 'on_hold']
        .map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
    },
    {
      key: 'paymentStatus',
      label: 'Payment',
      type: 'select',
      primary: true,
      options: ['pending', 'authorized', 'partially_paid', 'paid', 'refunded', 'failed']
        .map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
    },
    {
      key: 'fulfillmentStatus',
      label: 'Fulfillment',
      type: 'select',
      options: ['pending', 'processing', 'partially_fulfilled', 'fulfilled', 'cancelled']
        .map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
    },
    { key: 'dateFrom', label: 'Order date from', type: 'date' },
    { key: 'dateTo', label: 'Order date to', type: 'date' },
    { key: 'minTotal', label: 'Min total', type: 'number', placeholder: '0.00' },
    { key: 'maxTotal', label: 'Max total', type: 'number', placeholder: '0.00' },
    {
      key: 'currency',
      label: 'Currency',
      type: 'select',
      options: ['GBP', 'USD', 'EUR'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'hasLines',
      label: 'Line items',
      type: 'select',
      options: [
        { value: 'true', label: 'Has line items' },
        { value: 'false', label: 'Missing line items' }
      ]
    },
    {
      key: 'sortBy',
      label: 'Sort by',
      type: 'select',
      options: [
        { value: 'orderDate', label: 'Order date' },
        { value: 'createdAt', label: 'Created' },
        { value: 'total', label: 'Total' },
        { value: 'orderNumber', label: 'Order number' }
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
  ], [connections]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.organizationId || !form.orderNumber || !form.total) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const res = await createOrder({
        organizationId: session.user.organizationId,
        ...form,
        orderDate: new Date(form.orderDate).toISOString()
      });
      setItems(prev => [res.data, ...prev]);
      setShowCreate(false);
      setForm({
        orderNumber: '',
        channel: 'shopify',
        customerId: '',
        customerEmail: '',
        customerPhone: '',
        orderDate: new Date().toISOString().split('T')[0],
        currency: 'GBP',
        subtotal: 0,
        discountAmount: 0,
        shippingAmount: 0,
        taxAmount: 0,
        total: 0,
        paymentStatus: 'pending',
        fulfillmentStatus: 'pending',
        status: 'pending'
      });
      toast.success('Order created');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create order');
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const res = await updateOrder(editing.id, {
        ...form,
        orderDate: form.orderDate ? new Date(form.orderDate).toISOString() : undefined
      });
      setItems(prev => prev.map(item => item.id === editing.id ? res.data : item));
      setEditing(null);
      toast.success('Order updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update order');
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteOrder(confirmDel.id);
      setItems(prev => prev.filter(item => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Order deleted');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete order');
    }
  }

  const columns = useMemo<ColumnDef<Order>[]>(() => [
    {
      accessorKey: 'orderNumber',
      header: 'Order #',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <ShoppingCart size={16} className="text-muted-foreground" />
          <div className="min-w-0">
            <span className="block font-medium">{row.original.orderNumber}</span>
            {row.original.channelOrderNumber && (
              <span className="block text-xs text-muted-foreground">
                Ref {row.original.channelOrderNumber}
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => {
        const channel = row.original.channel;
        if (!channel) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {CHANNEL_LABELS[channel] ?? channel}
          </span>
        );
      }
    },
    {
      id: 'store',
      header: 'Store / Source',
      accessorFn: (row) => row.channelConnection?.name ?? '',
      cell: ({ row }) => {
        const conn = row.original.channelConnection;
        if (!conn) return <span className="text-muted-foreground">—</span>;
        const isPos = row.original.channel === 'pos';
        return (
          <div className="flex items-center gap-2">
            {isPos ? (
              <Store size={14} className="shrink-0 text-muted-foreground" />
            ) : (
              <Monitor size={14} className="shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <span className="block font-medium">{conn.name}</span>
              {conn.storeUrl && (
                <span className="block truncate text-xs text-muted-foreground">
                  {conn.storeUrl.replace(/^https?:\/\//, '')}
                </span>
              )}
            </div>
          </div>
        );
      }
    },
    { accessorKey: 'customerEmail', header: 'Customer Email' },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const total = parseFloat(String(row.original.total || '0'));
        const currency = row.original.currency || 'GBP';
        return (
          <span className="whitespace-nowrap font-medium">
            {currency} {total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusPill value={row.original.status} tone="status" />
    },
    {
      accessorKey: 'paymentStatus',
      header: 'Payment',
      cell: ({ row }) => <StatusPill value={row.original.paymentStatus} tone="payment" />
    },
    {
      accessorKey: 'fulfillmentStatus',
      header: 'Fulfillment',
      cell: ({ row }) => <StatusPill value={row.original.fulfillmentStatus} tone="fulfillment" />
    },
    {
      accessorKey: 'orderDate',
      header: 'Date',
      cell: ({ row }) => {
        const date = row.original.orderDate;
        return date ? new Date(date).toLocaleDateString() : '-';
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Link
            href={`/orders/orders/${row.original.id}`}
            className="p-1 hover:bg-muted rounded"
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </Link>
          <button
            onClick={() => {
              setEditing(row.original);
              const order = row.original;
              setForm({
                orderNumber: order.orderNumber || '',
                channel: (order.channel || 'shopify') as any,
                customerId: order.customer?.id || '',
                customerEmail: order.customerEmail || '',
                customerPhone: order.customerPhone || '',
                orderDate: order.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                currency: order.currency || 'GBP',
                subtotal: parseFloat(String(order.subtotal || '0')),
                discountAmount: parseFloat(String(order.discountAmount || '0')),
                shippingAmount: parseFloat(String(order.shippingAmount || '0')),
                taxAmount: parseFloat(String(order.taxAmount || '0')),
                total: parseFloat(String(order.total || '0')),
                paymentStatus: (order.paymentStatus || 'pending') as any,
                fulfillmentStatus: (order.fulfillmentStatus || 'pending') as any,
                status: (order.status || 'pending') as any
              });
            }}
            className="p-1 hover:bg-muted rounded"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => setConfirmDel(row.original)} className="p-1 hover:bg-muted rounded text-red-500" title="Delete">
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
          <Header title="Orders · Orders" />
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
          <Header title="Orders · Orders" />
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
        <Header title="Orders · Orders" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold">Orders</h1>
                <p className="text-muted-foreground mt-1">
                  Sales orders from the POS, linked websites and manual entry
                </p>
              </div>
            </div>

            <FilterBar
              fields={filterFields}
              values={filters}
              onChange={setFilters}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Order #, channel ref, email, phone, store…"
              loading={loading}
              stats={[
                { label: 'Orders', value: String(summary.count) },
                {
                  label: 'Total value',
                  value: summary.totalValue.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP'
                  })
                }
              ]}
              actions={
                <>
                  <button
                    onClick={() => void loadData()}
                    disabled={loading || syncing}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    onClick={() => void onSyncChannels()}
                    disabled={syncing}
                    title="Fetch new orders and update existing ones from POS and linked websites"
                    className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand/20 disabled:opacity-50"
                  >
                    <Download className={`h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
                    {syncing ? (syncProgress || 'Syncing…') : 'Sync Channels'}
                  </button>
                  <Link
                    href="/orders/channel-sync"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Store className="h-4 w-4" />
                    Advanced Sync
                  </Link>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-600"
                  >
                    <Plus className="h-4 w-4" />
                    Add Order
                  </button>
                </>
              }
            />

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading orders...</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-2">
                <RichDataTable columns={columns} data={items} hideSearch />
              </div>
            )}

            {/* Create Modal */}
            {showCreate && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Create Order</h3>
                    <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Order Number *</label>
                        <input
                          type="text"
                          value={form.orderNumber}
                          onChange={e => setForm(prev => ({ ...prev, orderNumber: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Channel *</label>
                        <select
                          value={form.channel}
                          onChange={e => setForm(prev => ({ ...prev, channel: e.target.value as any }))}
                          className="select"
                          required
                        >
                          <option value="amazon">Amazon</option>
                          <option value="ebay">eBay</option>
                          <option value="tiktok">TikTok</option>
                          <option value="etsy">Etsy</option>
                          <option value="shopify">Shopify</option>
                          <option value="woocommerce">WooCommerce</option>
                          <option value="wix">Wix</option>
                          <option value="b2b_portal">B2B Portal</option>
                          <option value="pos">POS</option>
                          <option value="phone">Phone</option>
                          <option value="email">Email</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Customer</label>
                        <select
                          value={form.customerId}
                          onChange={e => setForm(prev => ({ ...prev, customerId: e.target.value }))}
                          className="select"
                        >
                          <option value="">Select customer...</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || c.id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Customer Email</label>
                        <input
                          type="email"
                          value={form.customerEmail}
                          onChange={e => setForm(prev => ({ ...prev, customerEmail: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Order Date *</label>
                        <input
                          type="date"
                          value={form.orderDate}
                          onChange={e => setForm(prev => ({ ...prev, orderDate: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Currency</label>
                        <input
                          type="text"
                          value={form.currency}
                          onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))}
                          className="input"
                          maxLength={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Subtotal</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.subtotal}
                          onChange={e => setForm(prev => ({ ...prev, subtotal: parseFloat(e.target.value) || 0 }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Total *</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.total}
                          onChange={e => setForm(prev => ({ ...prev, total: parseFloat(e.target.value) || 0 }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Payment Status</label>
                        <select
                          value={form.paymentStatus}
                          onChange={e => setForm(prev => ({ ...prev, paymentStatus: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="authorized">Authorized</option>
                          <option value="partially_paid">Partially Paid</option>
                          <option value="paid">Paid</option>
                          <option value="refunded">Refunded</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Fulfillment Status</label>
                        <select
                          value={form.fulfillmentStatus}
                          onChange={e => setForm(prev => ({ ...prev, fulfillmentStatus: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="partially_fulfilled">Partially Fulfilled</option>
                          <option value="fulfilled">Fulfilled</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="processing">Processing</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="refunded">Refunded</option>
                          <option value="on_hold">On Hold</option>
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
                <div className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit Order</h3>
                    <button onClick={() => setEditing(null)} className="p-1 hover:bg-muted rounded-lg">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <form onSubmit={onUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Order Number *</label>
                        <input
                          type="text"
                          value={form.orderNumber}
                          onChange={e => setForm(prev => ({ ...prev, orderNumber: e.target.value }))}
                          className="input"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Channel</label>
                        <select
                          value={form.channel}
                          onChange={e => setForm(prev => ({ ...prev, channel: e.target.value as any }))}
                          className="select"
                        >
                          <option value="amazon">Amazon</option>
                          <option value="ebay">eBay</option>
                          <option value="tiktok">TikTok</option>
                          <option value="etsy">Etsy</option>
                          <option value="shopify">Shopify</option>
                          <option value="woocommerce">WooCommerce</option>
                          <option value="wix">Wix</option>
                          <option value="b2b_portal">B2B Portal</option>
                          <option value="pos">POS</option>
                          <option value="phone">Phone</option>
                          <option value="email">Email</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Customer Email</label>
                        <input
                          type="email"
                          value={form.customerEmail}
                          onChange={e => setForm(prev => ({ ...prev, customerEmail: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Order Date</label>
                        <input
                          type="date"
                          value={form.orderDate}
                          onChange={e => setForm(prev => ({ ...prev, orderDate: e.target.value }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Total</label>
                        <input
                          type="number"
                          step="0.01"
                          value={form.total}
                          onChange={e => setForm(prev => ({ ...prev, total: parseFloat(e.target.value) || 0 }))}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Payment Status</label>
                        <select
                          value={form.paymentStatus}
                          onChange={e => setForm(prev => ({ ...prev, paymentStatus: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="authorized">Authorized</option>
                          <option value="partially_paid">Partially Paid</option>
                          <option value="paid">Paid</option>
                          <option value="refunded">Refunded</option>
                          <option value="failed">Failed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Fulfillment Status</label>
                        <select
                          value={form.fulfillmentStatus}
                          onChange={e => setForm(prev => ({ ...prev, fulfillmentStatus: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="partially_fulfilled">Partially Fulfilled</option>
                          <option value="fulfilled">Fulfilled</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Status</label>
                        <select
                          value={form.status}
                          onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="select"
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="processing">Processing</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="refunded">Refunded</option>
                          <option value="on_hold">On Hold</option>
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
                  <h3 className="text-lg font-semibold mb-2">Delete Order</h3>
                  <p className="text-muted-foreground mb-4">Are you sure you want to delete order {confirmDel.orderNumber}? This action cannot be undone.</p>
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

