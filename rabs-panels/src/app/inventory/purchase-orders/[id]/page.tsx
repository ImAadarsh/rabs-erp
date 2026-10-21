'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Loader2, Pencil, Trash2, Truck, PackageCheck, Info } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { useApiAccess } from '@/hooks/use-api-access';
import { deletePurchaseOrder, getPurchaseOrder, setPurchaseOrderStatus } from '@/lib/api';
import { PurchaseOrderForm } from '@/components/inventory/purchase-order-form';
import { PurchaseOrderStatusBadge, PO_STATUS_LABELS } from '@/components/inventory/purchase-order-status-badge';
import { LocationStatusBadge } from '@/components/inventory/location-status-badge';

type PoStatus = 'draft' | 'submitted' | 'confirmed' | 'partial_received' | 'received' | 'cancelled';

const ACTION_LABELS: Record<PoStatus, string> = {
  draft: 'Back to draft',
  submitted: 'Submit to supplier',
  confirmed: 'Approve',
  partial_received: 'Mark partially received',
  received: 'Mark received',
  cancelled: 'Cancel PO'
};

const ACTION_CONFIRM: Partial<Record<PoStatus, string>> = {
  cancelled: 'Cancel this purchase order? This cannot be undone.',
  partial_received: 'Mark as partially received? Stock is only booked in through a GRN — this only changes the PO status.',
  received: 'Mark as fully received? Stock is only booked in through a GRN — this only changes the PO status.'
};

const money = (v: unknown, currency: string) => `${currency} ${Number(v ?? 0).toFixed(2)}`;
const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');
const userName = (u: any) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : '—');

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'PURCHASING']);
  const { can } = useApiAccess();
  const canUpdate = can('PATCH', '/api/inventory/purchase-orders/:id');
  const canDelete = can('DELETE', '/api/inventory/purchase-orders/:id');
  const canCreateAsn = can('POST', '/api/inventory/asn');
  const [loading, setLoading] = useState(true);
  const [po, setPo] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getPurchaseOrder(id);
      setPo(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load();
  }, [hydrated, hasAccess, router, session?.accessToken, load]);

  async function changeStatus(status: PoStatus) {
    if (!po) return;
    const confirmText = ACTION_CONFIRM[status];
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      setBusy(status);
      await setPurchaseOrderStatus(po.id, status);
      toast.success(`Purchase order ${PO_STATUS_LABELS[status]?.toLowerCase() ?? status}`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to update status');
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!po || !window.confirm(`Delete purchase order ${po.poNumber}?`)) return;
    try {
      setBusy('delete');
      await deletePurchaseOrder(po.id);
      toast.success('Purchase order deleted');
      router.push('/inventory/purchase-orders');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete purchase order');
      setBusy(null);
    }
  }

  if (!hydrated || !hasAccess) return null;

  const currency = po?.currency || 'GBP';
  const transitions: PoStatus[] = canUpdate ? po?.allowedTransitions ?? [] : [];
  const lines: any[] = po?.lines ?? [];
  const canReceive = po && ['submitted', 'confirmed', 'partial_received'].includes(po.status);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Inventory · Purchase Order" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <Link href="/inventory/purchase-orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Purchase orders
            </Link>

            {loading && !po ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : !po ? (
              <div className="text-muted-foreground">Purchase order not found.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold">{po.poNumber}</h1>
                        <PurchaseOrderStatusBadge status={po.status} />
                      </div>
                      <p className="text-muted-foreground mt-1">{po.supplier?.name ?? 'Unknown supplier'}{po.reference ? ` · Ref ${po.reference}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canUpdate && po.status === 'draft' && (
                      <button onClick={() => setEditing(true)} className="btn btn-outline flex items-center gap-2" disabled={!!busy}>
                        <Pencil className="h-4 w-4" /> Edit
                      </button>
                    )}
                    {transitions.map((t) => (
                      <button
                        key={t}
                        onClick={() => changeStatus(t)}
                        disabled={!!busy}
                        className={
                          t === 'cancelled'
                            ? 'px-4 py-2 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50'
                            : t === 'draft'
                              ? 'btn btn-outline'
                              : 'px-4 py-2 bg-brand text-white rounded hover:bg-brand-600 disabled:opacity-50'
                        }
                      >
                        {busy === t ? 'Saving…' : ACTION_LABELS[t]}
                      </button>
                    ))}
                    {canDelete && ['draft', 'cancelled'].includes(po.status) && (
                      <button onClick={onDelete} disabled={!!busy} className="p-2 rounded text-destructive hover:bg-destructive/10" title="Delete purchase order">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {po.status === 'draft' && lines.length === 0 && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" /> Add at least one line (Edit) before submitting this purchase order.
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase text-muted-foreground">Deliver to</div>
                    <div className="mt-1 flex items-center gap-2 font-medium">
                      {po.warehouse?.name ?? '—'}
                      {po.warehouse?.status && po.warehouse.status !== 'active' && <LocationStatusBadge status={po.warehouse.status} />}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase text-muted-foreground">Order date</div>
                    <div className="mt-1 font-medium">{fmtDate(po.orderDate)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase text-muted-foreground">Expected delivery</div>
                    <div className="mt-1 font-medium">{fmtDate(po.expectedDeliveryDate)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase text-muted-foreground">Total</div>
                    <div className="mt-1 text-lg font-semibold">{money(po.total, currency)}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card">
                  <div className="border-b border-border px-4 py-3 font-semibold">Lines</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="px-4 py-2">#</th>
                          <th className="px-4 py-2">SKU</th>
                          <th className="px-4 py-2">Product</th>
                          <th className="px-4 py-2 text-right">Qty</th>
                          <th className="px-4 py-2 text-right">Received</th>
                          <th className="px-4 py-2 text-right">Pending</th>
                          <th className="px-4 py-2 text-right">Unit cost</th>
                          <th className="px-4 py-2 text-right">Tax</th>
                          <th className="px-4 py-2 text-right">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.length === 0 ? (
                          <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No lines yet.</td></tr>
                        ) : lines.map((l) => (
                          <tr key={l.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2 text-muted-foreground">{l.lineNumber}</td>
                            <td className="px-4 py-2 font-mono">{l.variant?.variantSku ?? '—'}</td>
                            <td className="px-4 py-2">{l.variant?.name || l.variant?.catalogItem?.name || '—'}</td>
                            <td className="px-4 py-2 text-right">{l.quantity}</td>
                            <td className="px-4 py-2 text-right">{l.quantityReceived ?? 0}</td>
                            <td className="px-4 py-2 text-right">{l.quantityPending ?? Math.max(0, l.quantity - (l.quantityReceived ?? 0))}</td>
                            <td className="px-4 py-2 text-right">{money(l.unitPrice, currency)}</td>
                            <td className="px-4 py-2 text-right">{(Number(l.taxRate ?? 0) * 100).toFixed(1)}%</td>
                            <td className="px-4 py-2 text-right font-medium">{money(l.lineTotal, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end border-t border-border p-4">
                    <div className="w-full max-w-xs space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(po.subtotal, currency)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{money(po.taxAmount, currency)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{money(po.shippingCost, currency)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Other costs</span><span>{money(po.otherCosts, currency)}</span></div>
                      <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>{money(po.total, currency)}</span></div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4" /> ASNs (expected deliveries)</span>
                      {canReceive && canCreateAsn && (
                        <Link href={`/inventory/asn?purchaseOrderId=${po.id}`} className="text-sm text-primary hover:underline">Create ASN</Link>
                      )}
                    </div>
                    <div className="divide-y divide-border">
                      {(po.asns ?? []).length === 0 ? (
                        <div className="px-4 py-4 text-sm text-muted-foreground">
                          No ASN yet. {canReceive ? 'Create one when the supplier confirms the delivery.' : po.status === 'draft' ? 'Submit the PO first.' : ''}
                        </div>
                      ) : po.asns.map((a: any) => (
                        <Link key={a.id} href="/inventory/asn" className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50">
                          <span className="font-medium">{a.asnNumber}</span>
                          <span className="text-muted-foreground">{fmtDate(a.expectedDate)} · {String(a.status).replace(/_/g, ' ')}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold"><PackageCheck className="h-4 w-4" /> GRNs (goods received)</span>
                      {canReceive && (
                        <Link href="/inventory/grn" className="text-sm text-primary hover:underline">Go to GRN</Link>
                      )}
                    </div>
                    <div className="divide-y divide-border">
                      {(po.grns ?? []).length === 0 ? (
                        <div className="px-4 py-4 text-sm text-muted-foreground">No goods received yet. Receive against this PO&apos;s ASN in GRN to book stock in.</div>
                      ) : po.grns.map((g: any) => (
                        <Link key={g.id} href="/inventory/grn" className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/50">
                          <span className="font-medium">{g.grnNumber}</span>
                          <span className="text-muted-foreground">{fmtDate(g.receivedDate)} · {String(g.status).replace(/_/g, ' ')}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3 text-sm">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase text-muted-foreground">Created by</div>
                    <div className="mt-1">{userName(po.createdBy)} · {fmtDate(po.createdAt)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase text-muted-foreground">Approved by</div>
                    <div className="mt-1">{po.approvedBy ? `${userName(po.approvedBy)} · ${fmtDate(po.approvedAt)}` : '—'}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="text-xs uppercase text-muted-foreground">Notes</div>
                    <div className="mt-1 whitespace-pre-wrap">{po.notes || '—'}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {editing && canUpdate && po && (
        <PurchaseOrderForm
          organizationId={po.organization?.id ?? session?.user?.organizationId ?? ''}
          purchaseOrder={po}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </div>
  );
}
