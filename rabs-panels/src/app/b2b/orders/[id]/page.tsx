'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getB2bOrder } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink } from 'lucide-react';

const gbp = (n: any) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v: any) => (v ? new Date(v).toLocaleString('en-GB') : '—');

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted">{children}</span>;
}

export default function B2bOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || '');
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const orgId = session?.user?.organizationId;

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (!orgId || !id) return;
    getB2bOrder(id, orgId)
      .then((res) => setOrder(res.data))
      .catch((e) => toast.error(e?.response?.data?.error?.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, orgId, id]);

  const shipping = order?.addresses?.find((a: any) => a.addressType === 'shipping');
  const billing = order?.addresses?.find((a: any) => a.addressType === 'billing');
  const fmtAddr = (a: any) => a
    ? [[a.firstName, a.lastName].filter(Boolean).join(' '), a.company, a.addressLine1, a.addressLine2, a.city, a.stateProvince, a.postalCode, a.countryCode, a.phone]
        .filter(Boolean).join('\n')
    : '—';

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Order" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-5">
          <Link href="/b2b/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Back to B2B orders
          </Link>
          {loading ? <div className="text-muted-foreground">Loading...</div> : !order ? (
            <div className="text-muted-foreground">Order not found.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
                  <p className="text-sm text-muted-foreground">
                    Placed {dt(order.orderDate)}{order.createdBy?.email ? ` by staff (${order.createdBy.email})` : ' on the wholesale portal'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>Status: {order.status}</Badge>
                  <Badge>Payment: {order.paymentStatus}</Badge>
                  <Badge>Fulfilment: {order.fulfillmentStatus}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <section className="p-5 rounded-2xl border border-border bg-card space-y-1 text-sm">
                  <h2 className="font-semibold mb-2">Retailer</h2>
                  <div className="font-medium">{order.customer?.companyName || '—'}</div>
                  <div>{[order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ')}</div>
                  <div className="text-muted-foreground">{order.customerEmail}</div>
                  <div className="text-muted-foreground">{order.customerPhone}</div>
                  {order.customer && (
                    <div className="pt-2 text-xs text-muted-foreground">
                      Credit {gbp(order.customer.creditUsed)} used of {gbp(order.customer.creditLimit)} · {order.customer.paymentTerms || 'no terms'}
                    </div>
                  )}
                </section>
                <section className="p-5 rounded-2xl border border-border bg-card text-sm">
                  <h2 className="font-semibold mb-2">Shipping address</h2>
                  <pre className="whitespace-pre-wrap font-sans">{fmtAddr(shipping)}</pre>
                  <div className="mt-2 text-xs text-muted-foreground">Method: {order.shippingMethod || '—'}</div>
                </section>
                <section className="p-5 rounded-2xl border border-border bg-card text-sm">
                  <h2 className="font-semibold mb-2">Billing address</h2>
                  <pre className="whitespace-pre-wrap font-sans">{fmtAddr(billing)}</pre>
                </section>
              </div>

              <section className="rounded-2xl border border-border bg-card overflow-hidden">
                <h2 className="font-semibold px-5 pt-4 pb-2">Items</h2>
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-2">SKU</th>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-right px-3 py-2">Unit</th>
                      <th className="text-right px-3 py-2">VAT</th>
                      <th className="text-right px-3 py-2">Line total</th>
                      <th className="text-left px-5 py-2">Fulfilment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.lines || []).map((l: any) => (
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-5 py-2 font-mono text-xs">{l.sku}</td>
                        <td className="px-3 py-2">{l.name}</td>
                        <td className="px-3 py-2 text-right">{l.quantity}</td>
                        <td className="px-3 py-2 text-right">{gbp(l.unitPrice)}</td>
                        <td className="px-3 py-2 text-right">{gbp(l.taxAmount)}</td>
                        <td className="px-3 py-2 text-right">{gbp(l.lineTotal)}</td>
                        <td className="px-5 py-2">{l.fulfillmentStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-5 py-4 border-t border-border text-sm grid grid-cols-2 max-w-xs ml-auto gap-1">
                  <span className="text-muted-foreground">Subtotal</span><span className="text-right">{gbp(order.subtotal)}</span>
                  <span className="text-muted-foreground">Discount</span><span className="text-right">-{gbp(order.discountAmount)}</span>
                  <span className="text-muted-foreground">Shipping</span><span className="text-right">{gbp(order.shippingAmount)}</span>
                  <span className="text-muted-foreground">VAT</span><span className="text-right">{gbp(order.taxAmount)}</span>
                  <span className="font-semibold">Total</span><span className="text-right font-semibold">{gbp(order.total)}</span>
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="p-5 rounded-2xl border border-border bg-card text-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">Shipments</h2>
                    <Link href="/b2b/shipments" className="text-xs underline">Manage shipments</Link>
                  </div>
                  {(order.shipments || []).length === 0 ? <div className="text-muted-foreground">No shipment yet.</div> : order.shipments.map((s: any) => (
                    <div key={s.id} className="p-3 rounded-lg border border-border space-y-1">
                      <div className="flex justify-between"><b>{s.status}</b><span>{s.carrier || '—'} {s.trackingNumber ? `· ${s.trackingNumber}` : ''}</span></div>
                      <div className="text-xs text-muted-foreground">Dispatched {dt(s.dispatchedAt)} · Delivered {dt(s.deliveredAt)}</div>
                      {(s.events || []).length > 0 && (
                        <ul className="text-xs space-y-0.5 pt-1">
                          {[...s.events].sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt)).map((e: any) => (
                            <li key={e.id}>{dt(e.createdAt)} — {e.message || e.status}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </section>
                <section className="p-5 rounded-2xl border border-border bg-card text-sm space-y-3">
                  <h2 className="font-semibold">Payments</h2>
                  {(order.payments || []).length === 0 ? <div className="text-muted-foreground">No payments recorded.</div> : order.payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between p-3 rounded-lg border border-border">
                      <span>{p.paymentMethod || p.method || p.provider || 'Payment'} · {p.status}</span>
                      <span>{gbp(p.amount)}</span>
                      <span className="text-muted-foreground">{dt(p.createdAt)}</span>
                    </div>
                  ))}
                  {order.customerNotes && (
                    <div>
                      <div className="text-xs text-muted-foreground">Order notes</div>
                      <p>{order.customerNotes}</p>
                    </div>
                  )}
                  <Link href={`/orders/orders/${order.id}`} className="inline-flex items-center gap-1 text-xs underline">
                    Open in Orders module <ExternalLink size={12} />
                  </Link>
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
