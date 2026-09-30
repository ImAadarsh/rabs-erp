'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { listPayments, listOrderSyncConnections, syncAllChannelOrders, type OrderSyncConnection } from '@/lib/api';
import { CreditCard, Eye, ArrowDownToLine, RefreshCw, Store, Monitor, X, Download } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

type Payment = {
  id: string;
  transactionId?: string | null;
  reference?: string | null;
  paymentMethod?: string;
  paymentType?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  paymentDate?: string;
  payerName?: string | null;
  payerEmail?: string | null;
  notes?: string | null;
  gatewayResponse?: any;
  order?: {
    id: string;
    orderNumber?: string;
    channel?: string;
    channelOrderNumber?: string | null;
    channelConnection?: { id: string; name: string; storeUrl?: string | null } | null;
  } | null;
  paymentGateway?: { id: string; name: string } | null;
};

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'POS / EPOS',
  woocommerce: 'WooCommerce',
  shopify: 'Shopify',
  amazon: 'Amazon',
  ebay: 'eBay',
  etsy: 'Etsy',
  tiktok: 'TikTok',
  wix: 'Wix',
  b2b_portal: 'B2B Portal',
  phone: 'Phone',
  email: 'Email',
  other: 'Other'
};

const badge = (variant: string) => {
  const base = 'px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border ';
  if (variant === 'success') return base + 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  if (variant === 'destructive') return base + 'bg-red-500/10 text-red-600 border-red-500/20';
  if (variant === 'warning') return base + 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
  if (variant === 'secondary') return base + 'bg-muted text-muted-foreground border-border';
  return base + 'bg-muted text-foreground border-border';
};

function money(amount: number | string | undefined, currency = 'GBP') {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export default function PaymentsPage() {
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [data, setData] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({ totalValue: 0, count: 0 });
  const [connections, setConnections] = useState<OrderSyncConnection[]>([]);
  const [detail, setDetail] = useState<Payment | null>(null);
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
        `Synced ${result.connections} channel(s): ${t.ordersCreated} new orders, ${t.ordersUpdated} updated, ${t.paymentsCreated} payments`
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
      const res = await listPayments(orgId, { search: search || undefined, ...filters });
      setData(res.data || []);
      setSummary({
        totalValue: res.summary?.totalValue ?? 0,
        count: res.summary?.count ?? res.data?.length ?? 0
      });
    } catch {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [orgId, search, filters]);

  useEffect(() => {
    if (hydrated && hasAccess && orgId) void loadData();
  }, [hydrated, hasAccess, orgId, loadData]);

  useEffect(() => {
    if (!hydrated || !hasAccess || !orgId) return;
    listOrderSyncConnections({ organizationId: orgId })
      .then((res) => setConnections(res.data || []))
      .catch(() => { /* store filter degrades gracefully */ });
  }, [hydrated, hasAccess, orgId]);

  const filterFields = useMemo<FilterField[]>(() => [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      primary: true,
      options: ['pending', 'authorized', 'completed', 'failed', 'refunded', 'cancelled', 'expired']
        .map((v) => ({ value: v, label: v }))
    },
    {
      key: 'paymentMethod',
      label: 'Method',
      type: 'select',
      primary: true,
      options: ['card', 'bank_transfer', 'paypal', 'cash', 'check', 'other']
        .map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
    },
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
      key: 'paymentType',
      label: 'Type',
      type: 'select',
      options: ['sale', 'refund', 'partial_refund', 'authorization', 'capture']
        .map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
    },
    { key: 'dateFrom', label: 'Paid from', type: 'date' },
    { key: 'dateTo', label: 'Paid to', type: 'date' },
    { key: 'minAmount', label: 'Min amount', type: 'number', placeholder: '0.00' },
    { key: 'maxAmount', label: 'Max amount', type: 'number', placeholder: '0.00' },
    {
      key: 'currency',
      label: 'Currency',
      type: 'select',
      options: ['GBP', 'USD', 'EUR'].map((v) => ({ value: v, label: v }))
    },
    {
      key: 'sortBy',
      label: 'Sort by',
      type: 'select',
      options: [
        { value: 'paymentDate', label: 'Payment date' },
        { value: 'amount', label: 'Amount' },
        { value: 'createdAt', label: 'Created' }
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

  const columns = useMemo<ColumnDef<Payment>[]>(() => [
    {
      id: 'transactionId',
      header: 'Transaction',
      accessorFn: (r) => r.transactionId ?? r.id,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-mono text-xs" title={row.original.transactionId ?? ''}>
            {row.original.transactionId || `#${row.original.id}`}
          </div>
          {row.original.reference && (
            <div className="text-xs text-muted-foreground">{row.original.reference}</div>
          )}
        </div>
      )
    },
    {
      id: 'order',
      header: 'Order',
      accessorFn: (r) => r.order?.orderNumber ?? '',
      cell: ({ row }) => {
        const o = row.original.order;
        if (!o) return <span className="text-muted-foreground">—</span>;
        return (
          <Link href={`/orders/orders/${o.id}`} className="text-primary hover:underline">
            <span className="block font-medium">{o.orderNumber}</span>
            {o.channelOrderNumber && (
              <span className="block text-xs text-muted-foreground">Ref {o.channelOrderNumber}</span>
            )}
          </Link>
        );
      }
    },
    {
      id: 'channel',
      header: 'Channel',
      accessorFn: (r) => r.order?.channel ?? '',
      cell: ({ row }) => {
        const channel = row.original.order?.channel;
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
      accessorFn: (r) => r.order?.channelConnection?.name ?? '',
      cell: ({ row }) => {
        const conn = row.original.order?.channelConnection;
        if (!conn) return <span className="text-muted-foreground">—</span>;
        const isPos = row.original.order?.channel === 'pos';
        return (
          <div className="flex items-center gap-2">
            {isPos ? <Store size={14} className="shrink-0 text-muted-foreground" />
                   : <Monitor size={14} className="shrink-0 text-muted-foreground" />}
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
    {
      accessorKey: 'paymentDate',
      header: 'Date',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.paymentDate
            ? new Date(row.original.paymentDate).toLocaleDateString('en-GB')
            : '—'}
        </span>
      )
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-semibold">
          {money(row.original.amount, row.original.currency)}
        </span>
      )
    },
    {
      accessorKey: 'paymentMethod',
      header: 'Method',
      cell: ({ row }) => (
        <span className={badge('outline') + ' capitalize'}>
          {row.original.paymentMethod?.replace(/_/g, ' ') ?? '—'}
        </span>
      )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status || 'pending';
        let v = 'default';
        if (s === 'completed') v = 'success';
        else if (s === 'failed' || s === 'cancelled' || s === 'expired') v = 'destructive';
        else if (s === 'pending' || s === 'authorized') v = 'secondary';
        else if (s === 'refunded') v = 'warning';
        return <span className={badge(v) + ' capitalize'}>{s}</span>;
      }
    },
    {
      id: 'payer',
      header: 'Payer',
      accessorFn: (r) => r.payerName ?? r.payerEmail ?? '',
      cell: ({ row }) => {
        const { payerName, payerEmail } = row.original;
        if (!payerName && !payerEmail) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="text-sm">
            {payerName && <div className="font-medium">{payerName}</div>}
            {payerEmail && <div className="text-xs text-muted-foreground">{payerEmail}</div>}
          </div>
        );
      }
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <button
          onClick={() => setDetail(row.original)}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="View details"
        >
          <Eye size={16} />
        </button>
      )
    }
  ], []);

  const exportCsv = () => {
    if (!data.length) return toast.error('Nothing to export');
    const headers = [
      'Transaction', 'Reference', 'Order', 'Channel', 'Store', 'Date',
      'Amount', 'Currency', 'Method', 'Type', 'Status', 'Payer', 'Payer email'
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = data.map((p) => [
      p.transactionId ?? p.id,
      p.reference ?? '',
      p.order?.orderNumber ?? '',
      p.order?.channel ?? '',
      p.order?.channelConnection?.name ?? '',
      p.paymentDate ? new Date(p.paymentDate).toISOString().slice(0, 10) : '',
      Number(p.amount ?? 0).toFixed(2),
      p.currency ?? '',
      p.paymentMethod ?? '',
      p.paymentType ?? '',
      p.status ?? '',
      p.payerName ?? '',
      p.payerEmail ?? ''
    ].map(escape).join(','));

    const blob = new Blob([[headers.map(escape).join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} payments`);
  };

  if (!hydrated || !hasAccess) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Payments" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="flex w-full flex-col gap-6">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-center">
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-bold">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <CreditCard size={24} />
                  </div>
                  Payments
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Every payment taken across the POS tills, linked websites and manual gateways.
                </p>
              </div>
            </div>

            <FilterBar
              fields={filterFields}
              values={filters}
              onChange={setFilters}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Transaction ID, reference, payer, order #, store…"
              loading={loading}
              stats={[
                { label: 'Payments', value: String(summary.count) },
                {
                  label: 'Total received',
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
                    title="Fetch new orders and payments from POS and linked websites"
                    className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand/20 disabled:opacity-50"
                  >
                    <Download className={`h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
                    {syncing ? (syncProgress || 'Syncing…') : 'Sync Channels'}
                  </button>
                  <button
                    onClick={exportCsv}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                  >
                    <ArrowDownToLine size={16} />
                    Export CSV
                  </button>
                </>
              }
            />

            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading payments…
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
                <RichDataTable columns={columns} data={data} hideSearch />
              </div>
            )}
          </div>
        </main>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Payment details</h3>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {([
                ['Transaction ID', detail.transactionId || `#${detail.id}`],
                ['Reference', detail.reference],
                ['Amount', money(detail.amount, detail.currency)],
                ['Status', detail.status],
                ['Method', detail.paymentMethod?.replace(/_/g, ' ')],
                ['Type', detail.paymentType?.replace(/_/g, ' ')],
                ['Payment date', detail.paymentDate ? new Date(detail.paymentDate).toLocaleDateString('en-GB') : null],
                ['Order', detail.order?.orderNumber],
                ['Channel', detail.order?.channel ? (CHANNEL_LABELS[detail.order.channel] ?? detail.order.channel) : null],
                ['Store / Till', detail.order?.channelConnection?.name],
                ['Payer', detail.payerName],
                ['Payer email', detail.payerEmail],
                ['Gateway', detail.paymentGateway?.name],
                ['Notes', detail.notes]
              ] as Array<[string, string | null | undefined]>)
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 break-words font-medium capitalize">{value}</dd>
                  </div>
                ))}
            </dl>
            {detail.gatewayResponse && (
              <div className="mt-4">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Channel payload
                </p>
                <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(detail.gatewayResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
