'use client';

/**
 * Unified printable invoice document used across POS, website, and manual
 * orders. Renders from the payload returned by GET /api/finance/invoices/:id.
 */

import React from 'react';
import { BRAND, BRAND_CONTACT_LINE } from '@/lib/brand';

export type InvoiceDocumentData = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  currency: string;
  subtotal: number | string;
  discountAmount?: number | string;
  shippingAmount?: number | string;
  taxAmount?: number | string;
  total: number | string;
  paidAmount?: number | string;
  balanceDue?: number | string;
  paymentTerms?: string | null;
  status: string;
  notes?: string | null;
  footerText?: string | null;
  customerName?: string | null;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
    taxId?: string | null;
  } | null;
  order?: {
    orderNumber?: string;
    channel?: string;
    channelOrderNumber?: string | null;
    orderDate?: string;
    channelConnection?: { name?: string; storeUrl?: string | null } | null;
  } | null;
  billingAddress?: AddressLike | null;
  shippingAddress?: AddressLike | null;
  lines?: Array<{
    id?: string;
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    discountAmount?: number | string;
    taxRate?: number | string;
    taxAmount?: number | string;
    lineTotal: number | string;
  }>;
  payments?: Array<{
    id: string;
    paymentDate?: string;
    amount: number | string;
    currency?: string;
    paymentMethod?: string;
    status?: string;
    transactionId?: string | null;
    reference?: string | null;
  }>;
  seller?: {
    name?: string | null;
    legalName?: string | null;
    taxId?: string | null;
    registrationNumber?: string | null;
    website?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    address?: {
      line1?: string | null;
      line2?: string | null;
      city?: string | null;
      stateProvince?: string | null;
      postalCode?: string | null;
      countryCode?: string | null;
    } | null;
  } | null;
};

type AddressLike = {
  name?: string | null;
  company?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  stateProvince?: string | null;
  postalCode?: string;
  countryCode?: string;
  phone?: string | null;
  email?: string | null;
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

function money(amount: number | string | undefined | null, currency = 'GBP') {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAddress(a?: AddressLike | null) {
  if (!a) return null;
  const lines = [
    a.name || a.company,
    a.company && a.name ? a.company : null,
    a.addressLine1,
    a.addressLine2,
    [a.city, a.stateProvince, a.postalCode].filter(Boolean).join(', '),
    a.countryCode
  ].filter(Boolean);
  return lines.length ? lines : null;
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    partially_paid: 'bg-amber-100 text-amber-800 border-amber-200',
    sent: 'bg-blue-100 text-blue-800 border-blue-200',
    viewed: 'bg-blue-100 text-blue-800 border-blue-200',
    draft: 'bg-slate-100 text-slate-700 border-slate-200',
    overdue: 'bg-red-100 text-red-800 border-red-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
    written_off: 'bg-purple-100 text-purple-800 border-purple-200'
  };
  return map[status] ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

export function UnifiedInvoiceDocument({
  invoice,
  className = ''
}: {
  invoice: InvoiceDocumentData;
  className?: string;
}) {
  const currency = invoice.currency || 'GBP';
  const seller = invoice.seller;
  const customerLabel =
    invoice.customerName ||
    invoice.customer?.companyName ||
    [invoice.customer?.firstName, invoice.customer?.lastName].filter(Boolean).join(' ') ||
    invoice.customer?.email ||
    'Customer';

  const billing = formatAddress(invoice.billingAddress);
  const shipping = formatAddress(invoice.shippingAddress);
  const sellerAddr = seller?.address
    ? [
        seller.address.line1,
        seller.address.line2,
        [seller.address.city, seller.address.stateProvince, seller.address.postalCode]
          .filter(Boolean)
          .join(', '),
        seller.address.countryCode
      ].filter(Boolean)
    : [];

  const paid = Number(invoice.paidAmount ?? 0);
  const total = Number(invoice.total ?? 0);
  const balance =
    invoice.balanceDue != null ? Number(invoice.balanceDue) : Math.max(0, total - paid);

  const channel = invoice.order?.channel;
  const store = invoice.order?.channelConnection?.name;

  return (
    <article
      className={`invoice-document mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-sm print:max-w-none print:shadow-none ${className}`}
    >
      <div className="border border-slate-200 print:border-0">
        {/* Letterhead */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 px-8 py-7">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-4">
              {seller?.logoUrl || BRAND.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={seller?.logoUrl || BRAND.logo || ''}
                  alt={seller?.name || BRAND.name}
                  className="h-14 w-auto max-w-[160px] object-contain"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand/15 text-lg font-bold text-brand-700">
                  {(seller?.name || BRAND.name).slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {seller?.legalName || seller?.name || 'Invoice'}
                </h1>
                {seller?.legalName && seller?.name && seller.legalName !== seller.name && (
                  <p className="text-sm text-slate-500">Trading as {seller.name}</p>
                )}
                <div className="mt-2 space-y-0.5 text-xs leading-relaxed text-slate-600">
                  {sellerAddr.map((line) => (
                    <div key={String(line)}>{line}</div>
                  ))}
                  {seller?.taxId && <div>VAT / Tax ID: {seller.taxId}</div>}
                  {seller?.registrationNumber && <div>Company No: {seller.registrationNumber}</div>}
                  {(seller?.email || seller?.phone || seller?.website) && (
                    <div className="pt-1">
                      {[seller.email, seller.phone, seller.website].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Invoice</p>
            <p className="mt-1 font-mono text-xl font-bold">{invoice.invoiceNumber}</p>
            <span
              className={`mt-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusClass(invoice.status)}`}
            >
              {invoice.status.replace(/_/g, ' ')}
            </span>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-end gap-3">
                <dt className="text-slate-500">Invoice date</dt>
                <dd className="min-w-[7rem] font-medium">{fmtDate(invoice.invoiceDate)}</dd>
              </div>
              <div className="flex justify-end gap-3">
                <dt className="text-slate-500">Due date</dt>
                <dd className="min-w-[7rem] font-medium">
                  {invoice.dueDate ? fmtDate(invoice.dueDate) : 'On receipt'}
                </dd>
              </div>
              {invoice.paymentTerms && (
                <div className="flex justify-end gap-3">
                  <dt className="text-slate-500">Terms</dt>
                  <dd className="min-w-[7rem] font-medium">{invoice.paymentTerms}</dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        {/* Parties + order context */}
        <section className="grid gap-6 border-b border-slate-200 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bill to</h2>
            <p className="mt-2 text-base font-semibold">{customerLabel}</p>
            <div className="mt-1 space-y-0.5 text-sm text-slate-600">
              {billing?.map((l) => (
                <div key={String(l)}>{l}</div>
              ))}
              {!billing && invoice.customer?.email && <div>{invoice.customer.email}</div>}
              {!billing && invoice.customer?.phone && <div>{invoice.customer.phone}</div>}
              {invoice.customer?.taxId && <div>Tax ID: {invoice.customer.taxId}</div>}
            </div>
          </div>

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ship to</h2>
            {shipping ? (
              <div className="mt-2 space-y-0.5 text-sm text-slate-600">
                {shipping.map((l) => (
                  <div key={String(l)}>{l}</div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">Same as billing / collection</p>
            )}
          </div>

          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Order reference
            </h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Order #</dt>
                <dd className="font-medium">{invoice.order?.orderNumber || '—'}</dd>
              </div>
              {invoice.order?.channelOrderNumber && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Channel ref</dt>
                  <dd className="font-medium">{invoice.order.channelOrderNumber}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Channel</dt>
                <dd className="font-medium">
                  {channel ? CHANNEL_LABELS[channel] ?? channel : '—'}
                </dd>
              </div>
              {store && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Store / Till</dt>
                  <dd className="text-right font-medium">{store}</dd>
                </div>
              )}
              {invoice.order?.orderDate && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Order date</dt>
                  <dd className="font-medium">{fmtDate(invoice.order.orderDate)}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        {/* Lines */}
        <section className="px-8 py-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-900 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-3 font-semibold">Description</th>
                <th className="pb-2 pr-3 text-right font-semibold">Qty</th>
                <th className="pb-2 pr-3 text-right font-semibold">Unit price</th>
                <th className="pb-2 pr-3 text-right font-semibold">Tax</th>
                <th className="pb-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines ?? []).map((line, idx) => (
                <tr key={line.id ?? idx} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3 font-medium text-slate-800">{line.description}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{Number(line.quantity)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    {money(line.unitPrice, currency)}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums text-slate-500">
                    {Number(line.taxAmount ?? 0) > 0
                      ? money(line.taxAmount, currency)
                      : Number(line.taxRate ?? 0) > 0
                        ? `${(Number(line.taxRate) * (Number(line.taxRate) <= 1 ? 100 : 1)).toFixed(0)}%`
                        : '—'}
                  </td>
                  <td className="py-3 text-right font-medium tabular-nums">
                    {money(line.lineTotal, currency)}
                  </td>
                </tr>
              ))}
              {(invoice.lines ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No line items
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <dl className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between gap-8">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="tabular-nums">{money(invoice.subtotal, currency)}</dd>
              </div>
              {Number(invoice.discountAmount ?? 0) > 0 && (
                <div className="flex justify-between gap-8">
                  <dt className="text-slate-500">Discount</dt>
                  <dd className="tabular-nums">−{money(invoice.discountAmount, currency)}</dd>
                </div>
              )}
              {Number(invoice.shippingAmount ?? 0) > 0 && (
                <div className="flex justify-between gap-8">
                  <dt className="text-slate-500">Shipping</dt>
                  <dd className="tabular-nums">{money(invoice.shippingAmount, currency)}</dd>
                </div>
              )}
              {Number(invoice.taxAmount ?? 0) > 0 && (
                <div className="flex justify-between gap-8">
                  <dt className="text-slate-500">Tax / VAT</dt>
                  <dd className="tabular-nums">{money(invoice.taxAmount, currency)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-8 border-t border-slate-900 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(invoice.total, currency)}</dd>
              </div>
              <div className="flex justify-between gap-8">
                <dt className="text-slate-500">Paid</dt>
                <dd className="tabular-nums text-emerald-700">{money(paid, currency)}</dd>
              </div>
              <div className="flex justify-between gap-8 font-semibold">
                <dt>Balance due</dt>
                <dd className={`tabular-nums ${balance > 0.009 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {money(balance, currency)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Payments */}
        {(invoice.payments?.length ?? 0) > 0 && (
          <section className="border-t border-slate-200 px-8 py-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Payments received
            </h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="pb-1 font-semibold">Date</th>
                  <th className="pb-1 font-semibold">Method</th>
                  <th className="pb-1 font-semibold">Reference</th>
                  <th className="pb-1 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments!.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2">{fmtDate(p.paymentDate)}</td>
                    <td className="py-2 capitalize">{p.paymentMethod?.replace(/_/g, ' ') || '—'}</td>
                    <td className="py-2 font-mono text-xs text-slate-500">
                      {p.reference || p.transactionId || '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {money(p.amount, p.currency || currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Notes / footer */}
        {(invoice.notes || invoice.footerText) && (
          <section className="border-t border-slate-200 px-8 py-5 text-sm text-slate-600">
            {invoice.notes && (
              <div className="mb-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Notes
                </h2>
                <p className="mt-1 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}
            {invoice.footerText && (
              <p className="whitespace-pre-wrap text-xs text-slate-500">{invoice.footerText}</p>
            )}
          </section>
        )}

        <footer className="border-t border-slate-100 bg-slate-50 px-8 py-4 text-center text-[11px] text-slate-400 print:bg-white">
          <div>Thank you for your business · {BRAND.name} · {invoice.invoiceNumber}</div>
          <div className="mt-0.5">{BRAND_CONTACT_LINE}</div>
        </footer>
      </div>
    </article>
  );
}
