'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  cancelDhlShipment,
  getDhlShipmentLabel,
  getFulfillmentShipment,
  trackDhlShipment,
  updateFulfillmentShipmentStatus,
} from '@/lib/api';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Package,
  RefreshCw,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-500/10 text-slate-700',
  created: 'bg-blue-500/10 text-blue-700',
  label_ready: 'bg-blue-500/10 text-blue-700',
  in_transit: 'bg-amber-500/10 text-amber-700',
  delivered: 'bg-emerald-500/10 text-emerald-700',
  cancelled: 'bg-red-500/10 text-red-700',
  failed: 'bg-red-500/10 text-red-700',
};

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB') : '—');

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium break-words">{children}</div>
    </div>
  );
}

export default function ShipmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const shipmentId = params.id as string;
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER']);
  const [shipment, setShipment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId || !shipmentId) return;
    try {
      setLoading(true);
      const res = await getFulfillmentShipment(shipmentId, orgId);
      setShipment(res.data);
    } catch (e: any) {
      setShipment(null);
      toast.error(e?.response?.data?.error?.message || 'Failed to load shipment');
    } finally {
      setLoading(false);
    }
  }, [orgId, shipmentId]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const openLabel = async () => {
    if (shipment.labelUrl) {
      window.open(shipment.labelUrl, '_blank');
      return;
    }
    try {
      const res = await getDhlShipmentLabel(shipment.id);
      if (res.data?.labelUrl) window.open(res.data.labelUrl, '_blank');
      else toast.error('No label available for this shipment');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Label failed');
    }
  };

  if (!hydrated || !hasAccess || !session?.accessToken) return null;

  const s = shipment;
  const open = s && !['cancelled', 'delivered', 'failed'].includes(s.status);
  const addr = s?.shippingAddress;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title={`Fulfillment · Shipment${s?.trackingNumber ? ` ${s.trackingNumber}` : ''}`} />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => router.push('/fulfillment/shipments')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Shipments
              </button>
              {s && (
                <div className="flex flex-wrap items-center gap-2">
                  {s.trackingUrl && (
                    <a
                      href={s.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4" /> Track on {s.carrier}
                    </a>
                  )}
                  {(s.labelUrl || s.viaApi) && (
                    <button onClick={() => void openLabel()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                      <FileText className="h-4 w-4" /> Label
                    </button>
                  )}
                  {s.viaApi && (
                    <button
                      disabled={busy}
                      onClick={() => void run(() => trackDhlShipment({ shipmentId: s.id }), 'Tracking refreshed')}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <MapPin className="h-4 w-4" /> Refresh tracking
                    </button>
                  )}
                  {!s.viaApi && open && (
                    <button
                      disabled={busy}
                      onClick={() => void run(() => updateFulfillmentShipmentStatus(s.id, 'delivered', orgId), 'Marked delivered')}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark delivered
                    </button>
                  )}
                  {open && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const msg = s.viaApi
                          ? 'Cancel/void this DHL shipment? Only works before pickup.'
                          : 'Cancel this shipment? The order goes back to "packed" so it can be re-shipped.';
                        if (!confirm(msg)) return;
                        void run(
                          () => (s.viaApi ? cancelDhlShipment(s.id) : updateFulfillmentShipmentStatus(s.id, 'cancelled', orgId)),
                          'Shipment cancelled'
                        );
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> Cancel
                    </button>
                  )}
                  <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>
              )}
            </div>

            {loading && !s ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : !s ? (
              <div className="rounded-2xl border border-border bg-card py-24 text-center">
                <p className="text-muted-foreground">This shipment does not exist.</p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Truck className="h-6 w-6" />
                      <div>
                        <h1 className="text-xl font-bold">{s.carrier}{s.trackingNumber ? ` · ${s.trackingNumber}` : ''}</h1>
                        <p className="text-sm text-muted-foreground">Shipment #{s.id}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[s.status] || 'bg-muted'}`}>
                      {String(s.status).replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Field label="Order">
                      {s.order ? (
                        <Link href={`/orders/orders/${s.order.id}`} className="underline">{s.order.orderNumber}</Link>
                      ) : '—'}
                    </Field>
                    <Field label="Carrier">{s.carrier}</Field>
                    <Field label="Service">{s.serviceCode || '—'}</Field>
                    <Field label="Tracking number">
                      {s.trackingNumber ? (
                        s.trackingUrl ? (
                          <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                            {s.trackingNumber} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : s.trackingNumber
                      ) : '—'}
                    </Field>
                    <Field label="Carrier status">{s.carrierStatus || '—'}</Field>
                    <Field label="Dispatched">{fmtDate(s.dispatchedAt)}</Field>
                    <Field label="Delivered">{fmtDate(s.deliveredAt)}</Field>
                    <Field label="Created">{fmtDate(s.createdAt)}</Field>
                    <Field label="Weight">{s.weightKg != null ? `${s.weightKg} kg` : '—'}</Field>
                    <Field label="Parcels">{s.pieces ?? '—'}</Field>
                    <Field label="Label">
                      {s.labelUrl ? (
                        <a href={s.labelUrl} target="_blank" rel="noreferrer" className="underline">Open label</a>
                      ) : 'No label'}
                    </Field>
                    {s.cancelledAt && <Field label="Cancelled">{fmtDate(s.cancelledAt)}</Field>}
                  </div>
                  {s.notes && <p className="mt-4 text-sm"><span className="text-muted-foreground">Notes: </span>{s.notes}</p>}
                  {s.lastError && <p className="mt-2 text-sm text-red-700">Last error: {s.lastError}</p>}
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="mb-3 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Ship-to address</h2>
                    {addr ? (
                      <div className="text-sm leading-relaxed">
                        {addr.name && <div className="font-medium">{addr.name}</div>}
                        {addr.company && <div>{addr.company}</div>}
                        <div>{addr.addressLine1}</div>
                        {addr.addressLine2 && <div>{addr.addressLine2}</div>}
                        <div>{[addr.city, addr.stateProvince, addr.postalCode].filter(Boolean).join(', ')}</div>
                        <div>{addr.countryCode}</div>
                        {addr.phone && <div className="mt-1 text-muted-foreground">Tel: {addr.phone}</div>}
                        {addr.email && <div className="text-muted-foreground">{addr.email}</div>}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">The order has no shipping address.</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="mb-3 flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" /> Order</h2>
                    {s.order ? (
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Order number">
                          <Link href={`/orders/orders/${s.order.id}`} className="underline">{s.order.orderNumber}</Link>
                        </Field>
                        <Field label="Channel">{s.order.channel}</Field>
                        <Field label="Customer">{s.order.customerName || s.order.customerEmail || '—'}</Field>
                        <Field label="Order status">{s.order.status} · {s.order.fulfillmentStatus}</Field>
                        <Field label="Order date">{s.order.orderDate ? new Date(s.order.orderDate).toLocaleDateString('en-GB') : '—'}</Field>
                        <Field label="Total">{s.order.currency} {Number(s.order.total || 0).toFixed(2)}</Field>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No linked order.</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="mb-3 flex items-center gap-2 font-semibold"><Box className="h-4 w-4" /> Packages ({s.packages?.length || 0})</h2>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Tracking</th>
                          <th className="px-3 py-2 text-right">Weight</th>
                          <th className="px-3 py-2 text-left">Dimensions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(s.packages || []).map((p: any) => (
                          <tr key={p.number} className="border-t border-border">
                            <td className="px-3 py-2">{p.number}</td>
                            <td className="px-3 py-2 font-mono text-xs">{p.trackingNumber || '—'}</td>
                            <td className="px-3 py-2 text-right">{p.weightKg != null ? `${Number(p.weightKg).toFixed(2)} kg` : '—'}</td>
                            <td className="px-3 py-2">
                              {p.dimensions ? `${p.dimensions.length ?? '?'} × ${p.dimensions.width ?? '?'} × ${p.dimensions.height ?? '?'} cm` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {s.order?.lines?.length > 0 && (
                      <>
                        <h3 className="mb-2 mt-5 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" /> Contents</h3>
                        <ul className="space-y-1 text-sm">
                          {s.order.lines.map((l: any) => (
                            <li key={l.id} className="flex justify-between gap-3 border-t border-border pt-1">
                              <span>{l.name}{l.sku ? <span className="ml-2 font-mono text-xs text-muted-foreground">{l.sku}</span> : null}</span>
                              <span className="font-semibold">× {l.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="mb-3 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4" /> Status history</h2>
                    {s.events?.length ? (
                      <ol className="relative space-y-4 border-l border-border pl-5">
                        {s.events.map((e: any, i: number) => (
                          <li key={i} className="relative">
                            <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                            <div className="text-sm font-medium">{e.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {fmtDate(e.at)}
                              {e.location ? ` · ${e.location}` : ''}
                              {' · '}
                              {e.source === 'carrier' ? `${s.carrier} tracking` : e.source === 'b2b' ? 'B2B portal' : 'ERP'}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">No events recorded yet.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
