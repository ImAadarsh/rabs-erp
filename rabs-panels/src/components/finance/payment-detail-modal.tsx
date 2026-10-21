'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from 'react';
import { ExternalLink, X } from 'lucide-react';

export const PAYMENT_CHANNEL_LABELS: Record<string, string> = {
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

function money(amount: unknown, currency = 'GBP') {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Channel references can arrive as HTML (e.g. a gateway logo `<img>`); reduce to text, keeping img alt text. */
export function paymentReferenceText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .replace(/<img\b[^>]*?\balt\s*=\s*(["'])(.*?)\1[^>]*>/gi, ' $2 ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);

/** Plain-text reference; a URL becomes an "Open" link. */
export function PaymentReference({ value, className }: { value?: string | null; className?: string }) {
  const text = paymentReferenceText(value);
  if (!text) return null;
  if (isHttpUrl(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        title={text}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1 text-primary hover:underline ${className ?? ''}`}
      >
        Open <ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return <span className={className}>{text}</span>;
}

const humanize = (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : null);

/** Friendly fields pulled from the raw channel/gateway payload; the raw JSON stays behind a toggle. */
function channelFields(raw: any, currency: string): Array<[string, string]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  };
  const out: Array<[string, string]> = [];
  const source = pick('source', 'provider', 'gateway');
  if (source) out.push(['Source system', humanize(String(source)) as string]);
  const tendered = pick('payment_amount_actual', 'amount_tendered', 'tendered');
  if (tendered !== null) out.push(['Amount tendered', money(tendered, currency)]);
  const change = pick('payment_change_actual', 'change', 'change_given');
  if (change !== null && Number(change) !== 0) out.push(['Change given', money(change, currency)]);
  const when = pick('payment_date_time', 'created_at', 'date_paid');
  if (when) {
    const d = new Date(String(when).replace(' ', 'T'));
    out.push(['Recorded at', Number.isNaN(d.getTime()) ? String(when) : d.toLocaleString('en-GB')]);
  }
  const sale = pick('sales_id', 'sale_id', 'order_id', 'transaction_id');
  if (sale) out.push(['Channel sale ref', String(sale)]);
  const cardBrand = pick('card_brand', 'card_type', 'brand');
  if (cardBrand) out.push(['Card', String(cardBrand)]);
  const last4 = pick('last4', 'card_last4', 'last_four');
  if (last4) out.push(['Card ending', `•••• ${last4}`]);
  return out;
}

export function PaymentDetailModal({ payment, onClose }: { payment: any | null; onClose: () => void }) {
  if (!payment) return null;
  const currency = payment.currency || 'GBP';
  const channel = payment.order?.channel;
  const rows = ([
    ['Transaction ID', payment.transactionId || `#${payment.id}`],
    ['Reference', paymentReferenceText(payment.reference) ? <PaymentReference value={payment.reference} /> : null],
    ['Amount', money(payment.amount, currency)],
    ['Status', humanize(payment.status)],
    ['Method', humanize(payment.paymentMethod)],
    ['Type', humanize(payment.paymentType)],
    ['Payment date', payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('en-GB') : null],
    ['Order', payment.order?.orderNumber],
    ['Channel', channel ? (PAYMENT_CHANNEL_LABELS[channel] ?? channel) : null],
    ['Store / Till', payment.order?.channelConnection?.name],
    ['Payer', payment.payerName],
    ['Payer email', payment.payerEmail],
    ['Gateway', payment.paymentGateway?.name],
    ['Failure reason', payment.failureMessage],
    ['Notes', payment.notes]
  ] as Array<[string, ReactNode]>).filter(([, v]) => v);
  const extra = channelFields(payment.gatewayResponse, currency);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Payment details</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {extra.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel details</p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {extra.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {payment.gatewayResponse ? (
          <details className="mt-5 rounded-lg border border-border/60 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none text-muted-foreground">Technical details (for support)</summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-3">
              {JSON.stringify(payment.gatewayResponse, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
