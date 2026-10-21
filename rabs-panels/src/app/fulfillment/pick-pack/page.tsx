'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listPickPackQueue, markPickPackStage } from '@/lib/api';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Box, ClipboardCheck, Package, Printer, RefreshCw, Truck, X } from 'lucide-react';

type Stage = 'to_pick' | 'picked' | 'packed';

/** One A4 pick list per order; only visible when printing (see `.print-sheet` in globals.css). */
function PickListSheet({ orders }: { orders: any[] }) {
  const printedAt = new Date().toLocaleString('en-GB');
  return (
    <div className="print-sheet hidden print:block bg-white text-black text-[12px]">
      {orders.map((o, idx) => (
        <section key={o.id} className="p-[12mm]" style={idx < orders.length - 1 ? { breakAfter: 'page' } : undefined}>
          <div className="flex items-start justify-between border-b-2 border-black pb-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest">Pick list</div>
              <div className="text-2xl font-bold">{o.orderNumber}</div>
              <div className="mt-1">
                {o.channel} · Ordered {o.orderDate ? new Date(o.orderDate).toLocaleDateString('en-GB') : '—'}
                {o.shippingMethod ? ` · ${o.shippingMethod}` : ''}
              </div>
            </div>
            <div className="text-right text-[11px]">
              <div>Printed {printedAt}</div>
              <div>{o.itemCount} item(s) · {o.lines.length} line(s)</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider">Ship to</div>
              {o.shippingAddress ? (
                <div className="mt-1 leading-snug">
                  {o.shippingAddress.name && <div className="font-semibold">{o.shippingAddress.name}</div>}
                  {o.shippingAddress.company && <div>{o.shippingAddress.company}</div>}
                  {o.shippingAddress.lines.map((line: string, i: number) => <div key={i}>{line}</div>)}
                  {o.shippingAddress.phone && <div>Tel: {o.shippingAddress.phone}</div>}
                </div>
              ) : (
                <div className="mt-1">{o.shipTo || 'No shipping address on the order'}</div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider">Customer</div>
              <div className="mt-1">{o.customerName || '—'}</div>
              {o.customerEmail && <div>{o.customerEmail}</div>}
              {o.customerNotes && (
                <div className="mt-2">
                  <span className="font-semibold">Note: </span>{o.customerNotes}
                </div>
              )}
            </div>
          </div>

          {o.lines.length === 0 ? (
            <div className="mt-6 border border-black p-4 font-semibold">This order has no order lines to pick.</div>
          ) : (
            <table className="mt-5 w-full border-collapse">
              <thead>
                <tr className="border-b border-black text-left text-[10px] uppercase tracking-wider">
                  <th className="py-2 pr-2 w-8">✓</th>
                  <th className="py-2 pr-2">Bin / location</th>
                  <th className="py-2 pr-2">SKU</th>
                  <th className="py-2 pr-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l: any) => (
                  <tr key={l.id} className="border-b border-gray-400 align-top" style={{ breakInside: 'avoid' }}>
                    <td className="py-2 pr-2"><span className="inline-block h-4 w-4 border border-black" /></td>
                    <td className="py-2 pr-2">{l.bins?.length ? l.bins.slice(0, 3).join(', ') : l.variantId ? '—' : 'Not in catalogue'}</td>
                    <td className="py-2 pr-2 font-mono">{l.sku || l.variantSku || '—'}</td>
                    <td className="py-2 pr-2">{l.name}</td>
                    <td className="py-2 text-right text-base font-bold">{l.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-10 grid grid-cols-2 gap-10 text-[11px]">
            <div className="border-t border-black pt-1">Picked by / date</div>
            <div className="border-t border-black pt-1">Packed by / date</div>
          </div>
        </section>
      ))}
    </div>
  );
}

const STAGE_LABEL: Record<Stage, string> = { to_pick: 'To pick', picked: 'Picked', packed: 'Packed' };
const STAGE_STYLE: Record<Stage, string> = {
  to_pick: 'bg-amber-500/10 text-amber-700',
  picked: 'bg-blue-500/10 text-blue-700',
  packed: 'bg-emerald-500/10 text-emerald-700'
};

export default function PickPackPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER']);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<Stage | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickList, setPickList] = useState<any | null>(null);
  const [printOrders, setPrintOrders] = useState<any[]>([]);
  const orgId = session?.user?.organizationId;

  const printPickLists = (orders: any[]) => {
    if (!orders.length) {
      toast.error('No orders to print');
      return;
    }
    setPrintOrders(orders);
  };

  useEffect(() => {
    if (!printOrders.length) return;
    // Wait for the sheet to render before opening the print dialog.
    const id = window.setTimeout(() => window.print(), 50);
    return () => window.clearTimeout(id);
  }, [printOrders]);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await listPickPackQueue(orgId);
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load pick/pack queue');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  const advance = async (row: any, stage: 'picked' | 'packed') => {
    setBusyId(row.id);
    try {
      await markPickPackStage(row.id, stage, orgId);
      setItems((prev) => prev.map((o) => (o.id === row.id
        ? { ...o, stage, status: 'processing', fulfillmentStatus: 'processing', lines: o.lines.map((l: any) => ({ ...l, fulfillmentStatus: stage })) }
        : o)));
      setPickList((p: any) => (p?.id === row.id ? null : p));
      toast.success(`${row.orderNumber} marked ${stage}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => ({
    to_pick: items.filter((o) => o.stage === 'to_pick').length,
    picked: items.filter((o) => o.stage === 'picked').length,
    packed: items.filter((o) => o.stage === 'packed').length
  }), [items]);

  const rows = useMemo(() => (stageFilter ? items.filter((o) => o.stage === stageFilter) : items), [items, stageFilter]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'orderNumber',
      header: 'Order',
      cell: ({ row }) => (
        <Link href={`/orders/orders/${row.original.id}`} className="underline font-medium">{row.original.orderNumber}</Link>
      )
    },
    { accessorKey: 'channel', header: 'Channel' },
    { accessorKey: 'customerName', header: 'Customer' },
    {
      accessorKey: 'orderDate',
      header: 'Ordered',
      cell: ({ row }) => (row.original.orderDate ? new Date(row.original.orderDate).toLocaleDateString('en-GB') : '—')
    },
    { accessorKey: 'itemCount', header: 'Items' },
    { accessorKey: 'shippingMethod', header: 'Shipping', cell: ({ row }) => row.original.shippingMethod || '—' },
    {
      accessorKey: 'stage',
      header: 'Stage',
      cell: ({ row }) => (
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STAGE_STYLE[row.original.stage as Stage]}`}>
          {STAGE_LABEL[row.original.stage as Stage]}
        </span>
      )
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const o = row.original;
        const busy = busyId === o.id;
        return (
          <div className="flex flex-wrap gap-1">
            <button className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1" onClick={() => setPickList(o)}>
              <ClipboardCheck className="h-3 w-3" /> Pick list
            </button>
            {o.stage === 'to_pick' && o.lines.length === 0 && (
              <span className="text-xs px-2 py-1 text-amber-700 inline-flex items-center gap-1" title="Add the order's items before picking">
                <AlertTriangle className="h-3 w-3" /> No lines
              </span>
            )}
            {o.stage === 'to_pick' && o.lines.length > 0 && (
              <button disabled={busy} className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1 disabled:opacity-50" onClick={() => advance(o, 'picked')}>
                <Package className="h-3 w-3" /> Mark picked
              </button>
            )}
            {o.stage === 'picked' && (
              <button disabled={busy} className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1 disabled:opacity-50" onClick={() => advance(o, 'packed')}>
                <Box className="h-3 w-3" /> Mark packed
              </button>
            )}
            {o.stage === 'packed' && (
              <Link href={`/fulfillment/shipments?orderId=${o.id}`} className="text-xs px-2 py-1 border rounded inline-flex items-center gap-1 bg-primary text-primary-foreground">
                <Truck className="h-3 w-3" /> Ship
              </Link>
            )}
          </div>
        );
      }
    }
  ], [busyId, orgId]);

  return (
    <div className="min-h-screen app-surface print:bg-white">
      <div className="no-print">
        <Sidebar />
      </div>
      <div className="no-print flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Fulfillment · Pick & Pack" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Package />
              <div>
                <h1 className="text-xl font-bold">Pick & pack</h1>
                <p className="text-sm text-muted-foreground">
                  Confirmed and processing orders waiting to be fulfilled. Pick the items, pack them, then create a shipment.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => printPickLists(rows.filter((o) => o.stage === 'to_pick' && o.lines.length > 0))}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                title="Print one pick list per order that is still to pick (respects the stage filter)"
              >
                <Printer className="h-4 w-4" /> Print pick lists
              </button>
              <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {([['', 'All open', items.length], ['to_pick', 'To pick', counts.to_pick], ['picked', 'Picked', counts.picked], ['packed', 'Packed – ready to ship', counts.packed]] as const).map(([key, label, n]) => (
              <button
                key={label}
                onClick={() => setStageFilter(key as Stage | '')}
                className={`text-left p-4 rounded-2xl border bg-card transition-colors ${stageFilter === key ? 'border-primary' : 'border-border hover:border-primary/40'}`}
              >
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="text-2xl font-bold">{n}</div>
              </button>
            ))}
          </div>

          {loading && items.length === 0 ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : (
            <RichDataTable data={rows} columns={columns} searchPlaceholder="Search order, customer, channel..." />
          )}
        </main>
      </div>

      {pickList && (
        <div className="no-print fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-3xl p-6 space-y-4 max-h-[85vh] overflow-auto">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="font-bold">Pick list · {pickList.orderNumber}</h2>
                <p className="text-sm text-muted-foreground">{pickList.customerName}{pickList.shipTo ? ` · ${pickList.shipTo}` : ''}</p>
              </div>
              <button onClick={() => setPickList(null)}><X size={18} /></button>
            </div>
            {pickList.lines.length === 0 ? (
              <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">This order has no order lines, so there is nothing to pick.</p>
                  <p className="mt-1 text-muted-foreground">
                    Open the order and add its items under <span className="font-medium">Order Lines → Add Line</span>, then come back to pick and pack it.
                  </p>
                  <Link href={`/orders/orders/${pickList.id}`} className="mt-2 inline-block font-medium underline">
                    Open order {pickList.orderNumber}
                  </Link>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2">Bin / location</th>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pickList.lines.map((l: any) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-2 text-xs">{l.bins?.length ? l.bins.slice(0, 3).join(', ') : l.variantId ? '—' : <span className="text-amber-600">Not in catalogue</span>}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.sku || l.variantSku || '—'}</td>
                      <td className="px-3 py-2">
                        {l.name}
                        {!l.variantId && <div className="text-[11px] text-amber-700">Not linked to a catalog product</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{l.quantity}</td>
                      <td className="px-3 py-2">{l.fulfillmentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-xl border border-border text-sm inline-flex items-center gap-2"
                onClick={() => printPickLists([pickList])}
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              {pickList.lines.length > 0 && pickList.stage === 'to_pick' && (
                <button className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold" onClick={() => advance(pickList, 'picked')}>
                  Mark all picked
                </button>
              )}
              {pickList.stage === 'picked' && (
                <button className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold" onClick={() => advance(pickList, 'packed')}>
                  Mark packed
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <PickListSheet orders={printOrders} />
    </div>
  );
}
