'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, Ban, CheckCircle2, Eye, Loader2, Wallet, X } from 'lucide-react';
import { RichDataTable } from '@/components/rich-data-table';
import { getAffiliatePayout, listAffiliatePayouts, updateAffiliatePayout } from '@/lib/api';

type PayoutStatus = 'pending' | 'approved' | 'processing' | 'paid' | 'failed';

const STATUS_STYLE: Record<PayoutStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-700',
  approved: 'bg-blue-500/10 text-blue-700',
  processing: 'bg-blue-500/10 text-blue-700',
  paid: 'bg-emerald-500/10 text-emerald-700',
  failed: 'bg-red-500/10 text-red-700',
};

const money = (v: unknown, currency = 'GBP') => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(v || 0));
  } catch {
    return `${currency} ${Number(v || 0).toFixed(2)}`;
  }
};
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-GB') : '—');
const amountOf = (p: any) => (p.payoutAmount != null ? p.payoutAmount : Number(p.totalCommission || 0) + Number(p.adjustments || 0));

export function PayoutStatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[status as PayoutStatus] || 'bg-muted'}`}>
      {status}
    </span>
  );
}

/** Approve / mark paid / mark failed, following the payout lifecycle. */
function PayoutActions({ payout, onChanged, compact }: { payout: any; onChanged: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const status = payout.status as PayoutStatus;
  if (status === 'paid' || status === 'failed') return null;

  const set = async (next: PayoutStatus) => {
    if (next === 'paid' && !confirm(`Mark ${payout.payoutNumber} as paid (${money(amountOf(payout), payout.currency)})?`)) return;
    if (next === 'failed' && !confirm(`Mark ${payout.payoutNumber} as failed? Its period can then be paid out again.`)) return;
    setBusy(true);
    try {
      await updateAffiliatePayout(payout.id, { status: next });
      toast.success(`Payout ${payout.payoutNumber} ${next === 'paid' ? 'marked paid' : next}`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const btn = `inline-flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-50 ${compact ? '' : 'bg-background'}`;
  return (
    <>
      {status === 'pending' && (
        <button disabled={busy} onClick={() => void set('approved')} className={btn}>
          <BadgeCheck className="h-3 w-3" /> Approve
        </button>
      )}
      <button disabled={busy} onClick={() => void set('paid')} className={`${btn} text-emerald-700`}>
        <CheckCircle2 className="h-3 w-3" /> Mark paid
      </button>
      <button disabled={busy} onClick={() => void set('failed')} className={`${btn} text-red-700`}>
        <Ban className="h-3 w-3" /> Failed
      </button>
    </>
  );
}

export function AffiliatePayoutDetailModal({
  payoutId,
  onClose,
  onChanged,
}: {
  payoutId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [payout, setPayout] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!payoutId) return;
    setLoading(true);
    try {
      const res = await getAffiliatePayout(payoutId);
      setPayout(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load payout');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [payoutId, onClose]);

  useEffect(() => {
    setPayout(null);
    void load();
  }, [load]);

  if (!payoutId) return null;
  const p = payout;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-auto rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Wallet className="h-4 w-4" /> Payout {p?.payoutNumber || ''}
            </h3>
            {p && (
              <p className="text-xs text-muted-foreground">
                {p.affiliateName} · {p.affiliateCode}
                {p.affiliateEmail ? ` · ${p.affiliateEmail}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {loading && !p ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading payout…
          </div>
        ) : p ? (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-muted-foreground">Status</div><PayoutStatusBadge status={p.status} /></div>
              <div><div className="text-xs text-muted-foreground">Period</div>{day(p.periodStart)} – {day(p.periodEnd)}</div>
              <div><div className="text-xs text-muted-foreground">Conversions</div>{p.totalConversions}</div>
              <div><div className="text-xs text-muted-foreground">Revenue</div>{money(p.totalRevenue, p.currency)}</div>
              <div><div className="text-xs text-muted-foreground">Commission</div>{money(p.totalCommission, p.currency)}</div>
              <div><div className="text-xs text-muted-foreground">Adjustments</div>{money(p.adjustments, p.currency)}</div>
              <div><div className="text-xs text-muted-foreground">Payout amount</div><span className="font-semibold">{money(amountOf(p), p.currency)}</span></div>
              <div><div className="text-xs text-muted-foreground">Method</div>{String(p.paymentMethod || '—').replace(/_/g, ' ')}</div>
              <div><div className="text-xs text-muted-foreground">Created</div>{day(p.createdAt)}</div>
              <div><div className="text-xs text-muted-foreground">Approved</div>{p.approvedAt ? `${day(p.approvedAt)}${p.approvedByName ? ` · ${p.approvedByName}` : ''}` : '—'}</div>
              <div><div className="text-xs text-muted-foreground">Paid</div>{day(p.paidAt)}</div>
            </div>
            {p.notes && <p className="text-sm"><span className="text-muted-foreground">Notes: </span>{p.notes}</p>}

            <div>
              <h4 className="mb-2 text-sm font-medium">Included conversions ({p.conversions?.length || 0})</h4>
              {!p.conversions?.length ? (
                <p className="text-xs text-muted-foreground">No conversions were recorded for this affiliate in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Order</th>
                      <th className="px-3 py-2 text-left">Channel</th>
                      <th className="px-3 py-2 text-right">Order value</th>
                      <th className="px-3 py-2 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.conversions.map((c: any) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="px-3 py-2">{day(c.convertedAt)}</td>
                        <td className="px-3 py-2">
                          <Link href={`/orders/orders/${c.orderId}`} className="underline">{c.orderNumber || `#${c.orderId}`}</Link>
                          {c.orderStatus && <span className="ml-1 text-xs text-muted-foreground">({c.orderStatus})</span>}
                        </td>
                        <td className="px-3 py-2">{c.channel || '—'}</td>
                        <td className="px-3 py-2 text-right">{money(c.orderValue, c.currency)}</td>
                        <td className="px-3 py-2 text-right font-medium">{money(c.commissionAmount, c.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <PayoutActions
                payout={p}
                onChanged={() => {
                  void load();
                  onChanged?.();
                }}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Payouts list: all affiliates (Payouts tab) or a single affiliate (Partner Desk). */
export function AffiliatePayoutsList({
  affiliateId,
  refreshKey = 0,
  compact = false,
}: {
  affiliateId?: string;
  refreshKey?: number;
  compact?: boolean;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAffiliatePayouts(affiliateId ? { affiliateId } : undefined);
      setItems(res.data || []);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  }, [affiliateId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const closeDetail = useCallback(() => setViewing(null), []);

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'payoutNumber', header: 'Payout' },
      ...(affiliateId
        ? []
        : [{
            id: 'affiliate',
            accessorFn: (r: any) => `${r.affiliateName || ''} ${r.affiliateCode || ''}`,
            header: 'Affiliate',
            cell: ({ row }: any) => (
              <span>{row.original.affiliateName || '—'} <span className="text-xs text-muted-foreground">{row.original.affiliateCode}</span></span>
            ),
          } as ColumnDef<any>]),
      {
        id: 'period',
        accessorFn: (r: any) => r.periodStart,
        header: 'Period',
        cell: ({ row }: any) => `${day(row.original.periodStart)} – ${day(row.original.periodEnd)}`,
      },
      { accessorKey: 'totalConversions', header: 'Conversions' },
      {
        id: 'amount',
        accessorFn: (r: any) => Number(amountOf(r)),
        header: 'Amount',
        cell: ({ row }: any) => money(amountOf(row.original), row.original.currency),
      },
      { accessorKey: 'status', header: 'Status', cell: ({ row }: any) => <PayoutStatusBadge status={row.original.status} /> },
      { accessorKey: 'createdAt', header: 'Created', cell: ({ row }: any) => day(row.original.createdAt) },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }: any) => (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setViewing(String(row.original.id))} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
              <Eye className="h-3 w-3" /> View
            </button>
            <PayoutActions payout={row.original} onChanged={() => void load()} compact />
          </div>
        ),
      },
    ],
    [affiliateId, load]
  );

  return (
    <>
      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading payouts…</div>
      ) : compact ? (
        items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No payouts yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Payout</th>
                <th className="px-2 py-1.5 text-left">Period</th>
                <th className="px-2 py-1.5 text-right">Conv.</th>
                <th className="px-2 py-1.5 text-right">Amount</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5 text-left">Created</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="px-2 py-1.5 font-mono">{p.payoutNumber}</td>
                  <td className="px-2 py-1.5">{day(p.periodStart)} – {day(p.periodEnd)}</td>
                  <td className="px-2 py-1.5 text-right">{p.totalConversions}</td>
                  <td className="px-2 py-1.5 text-right">{money(amountOf(p), p.currency)}</td>
                  <td className="px-2 py-1.5"><PayoutStatusBadge status={p.status} /></td>
                  <td className="px-2 py-1.5">{day(p.createdAt)}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => setViewing(String(p.id))} className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
                      <Eye className="h-3 w-3" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <RichDataTable data={items} columns={columns} searchPlaceholder="Search payouts…" />
      )}
      <AffiliatePayoutDetailModal payoutId={viewing} onClose={closeDetail} onChanged={() => void load()} />
    </>
  );
}
