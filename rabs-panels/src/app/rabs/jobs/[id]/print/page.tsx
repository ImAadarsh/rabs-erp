/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { BrandWordmark } from '@/components/brand-wordmark';
import { useRabs } from '@/components/rabs/shell';
import { rabs, errMsg, gbp, num, fmtDate, UNIT_LABEL } from '@/lib/rabs-api';

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintDoc />
    </Suspense>
  );
}

function PrintDoc() {
  const { id } = useParams<{ id: string }>();
  const doc = useSearchParams().get('doc') === 'invoice' ? 'invoice' : 'quote';
  const { meta } = useRabs();
  const [agg, setAgg] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const a = await rabs.get(`/jobs/${id}`);
        setAgg(a);
        if (a.currentQuote) setQuote(await rabs.get(`/quotes/${a.currentQuote.quote.id}`));
      } catch (e) {
        setError(errMsg(e));
      }
    })();
  }, [id]);

  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!agg || !meta) return <div className="p-6 text-neutral-500">Preparing document…</div>;

  const company = meta.settings.companyDetails || {};
  const { customer, job, invoice, payments } = agg;
  const isInvoice = doc === 'invoice';
  if (isInvoice && !invoice) return <div className="p-6">No invoice has been generated for this job yet.</div>;
  if (!isInvoice && !quote) return <div className="p-6">No quotation for this job yet.</div>;
  const q = quote?.quote;

  type L = { room: string; description: string; qty: number; unit: string; unitPrice: number; total: number };
  const lines: L[] = isInvoice
    ? (invoice.lines || []).map((l: any) => ({ room: l.room || (l.type === 'variation' ? 'Variations' : l.type === 'delivery' || l.type === 'discount' ? '' : 'Extras'), description: l.description, qty: l.qty, unit: l.unit, unitPrice: l.unitPrice, total: l.total }))
    : quote.lines.map((l: any) => ({ room: l.roomName || 'Extras', description: l.description, qty: l.qty, unit: UNIT_LABEL[l.unit] || l.unit, unitPrice: l.unitPrice, total: l.lineTotal }));
  const groups = new Map<string, L[]>();
  lines.forEach((l) => {
    const k = l.room || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  });

  const number = isInvoice ? invoice.invoiceNumber : `${q.quoteNumber}${q.version > 1 ? ` v${q.version}` : ''}`;
  const date = isInvoice ? invoice.issuedAt : q.sentAt || q.createdAt;
  const paid = isInvoice ? invoice.paidAmount : 0;
  // Always the rate the document was priced at, never today's setting (historic quotes keep their VAT).
  const vatRate = !isInvoice
    ? Number(q.vatRate)
    : q?.status === 'accepted'
      ? Number(q.vatRate)
      : invoice.netTotal > 0
        ? Math.round((invoice.vatAmount / invoice.netTotal) * 1000) / 1000
        : Number(meta.settings.vatRate || 0);

  return (
    <div className="min-h-screen bg-neutral-100 print:bg-white text-neutral-900">
      <div className="print:hidden sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-semibold">
          {isInvoice ? 'Invoice' : 'Quotation'} {number}
        </span>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white font-semibold">
          <Printer size={16} /> Print / Save PDF
        </button>
      </div>
      <div className="max-w-[210mm] mx-auto bg-white my-6 print:my-0 p-8 md:p-12 shadow print:shadow-none text-[13px] leading-relaxed">
        <div className="flex items-start justify-between gap-6 border-b-4 border-brand pb-5">
          <div>
            <BrandWordmark tone="onLight" size="md" />
            {company.tagline && <div className="text-xs text-neutral-500 mt-1">{company.tagline}</div>}
          </div>
          <div className="text-right text-xs text-neutral-600">
            <div className="font-bold text-neutral-900">{company.name || 'RABS Carpets & Furniture'}</div>
            {company.address && <div>{company.address}</div>}
            {company.phone && <div>Tel {company.phone}</div>}
            {company.email && <div>{company.email}</div>}
            {company.vatNumber && <div>VAT {company.vatNumber}</div>}
          </div>
        </div>

        <div className="flex justify-between gap-6 mt-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 font-bold">{isInvoice ? 'Invoice to' : 'Prepared for'}</div>
            <div className="font-bold text-base">{customer.name}</div>
            <div>{customer.addressLine1}</div>
            {customer.addressLine2 && <div>{customer.addressLine2}</div>}
            <div>{[customer.city, customer.postcode].filter(Boolean).join(' ')}</div>
            {customer.phone && <div className="text-neutral-600">{customer.phone}</div>}
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold tracking-tight">{isInvoice ? 'INVOICE' : 'QUOTATION'}</div>
            <table className="ml-auto mt-2 text-xs">
              <tbody>
                <tr>
                  <td className="pr-3 text-neutral-500">Number</td>
                  <td className="font-bold">{number}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-neutral-500">Date</td>
                  <td>{fmtDate(date)}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-neutral-500">Job</td>
                  <td>{job.jobNumber}</td>
                </tr>
                {!isInvoice && q.validUntil && (
                  <tr>
                    <td className="pr-3 text-neutral-500">Valid until</td>
                    <td>{fmtDate(q.validUntil)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {agg.siteAddress && agg.siteAddress !== customer.address && <div className="mt-3 text-xs text-neutral-600">Site: {agg.siteAddress}</div>}

        <table className="w-full mt-6 border-collapse">
          <thead>
            <tr className="bg-neutral-900 text-white text-xs">
              <th className="text-left px-2 py-2">Description</th>
              <th className="text-right px-2 py-2 w-16">Qty</th>
              <th className="text-right px-2 py-2 w-24">Price</th>
              <th className="text-right px-2 py-2 w-24">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([room, ls]) => (
              <GroupRows key={room || 'none'} room={room} lines={ls} />
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <table className="text-sm w-72">
            <tbody>
              {!isInvoice && (
                <>
                  <TRow label="Subtotal" value={gbp(q.subtotal)} />
                  {q.discountAmount > 0 && <TRow label={`Discount${q.discountType === 'percent' ? ` (${num(q.discountValue)}%)` : ''}`} value={`−${gbp(q.discountAmount)}`} />}
                  {q.deliveryCharge > 0 && <TRow label="Delivery" value={gbp(q.deliveryCharge)} />}
                </>
              )}
              <TRow label="Total before VAT" value={gbp(isInvoice ? invoice.netTotal : q.netTotal)} />
              <TRow label={`VAT ${num((vatRate || 0) * 100)}%`} value={gbp(isInvoice ? invoice.vatAmount : q.vatAmount)} />
              <tr className="border-t-2 border-neutral-900">
                <td className="py-2 font-extrabold text-base">Total</td>
                <td className="py-2 text-right font-extrabold text-base">{gbp(isInvoice ? invoice.total : q.total)}</td>
              </tr>
              {isInvoice ? (
                <>
                  <TRow label="Paid" value={`−${gbp(paid)}`} />
                  <tr className="bg-brand/10">
                    <td className="py-2 px-1 font-bold">Balance due</td>
                    <td className="py-2 px-1 text-right font-bold">{gbp(invoice.balance)}</td>
                  </tr>
                </>
              ) : (
                q.depositRequired > 0 && (
                  <>
                    <TRow label="Deposit to confirm order" value={gbp(q.depositRequired)} />
                    <TRow label="Balance on completion" value={gbp(q.total - q.depositRequired)} />
                  </>
                )
              )}
            </tbody>
          </table>
        </div>

        {isInvoice && payments?.length > 0 && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-1">Payments received</div>
            <table className="w-full text-xs">
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-neutral-200">
                    <td className="py-1">{fmtDate(p.paidAt)}</td>
                    <td className="py-1 capitalize">
                      {p.kind} · {String(p.method).replace('_', ' ')}
                    </td>
                    <td className="py-1 text-right">{gbp(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isInvoice && (q.notes || meta.settings.quoteTerms) && (
          <div className="mt-8 text-xs text-neutral-600 space-y-2">
            {q.notes && <p className="whitespace-pre-line">{q.notes}</p>}
            {meta.settings.quoteTerms && <p className="whitespace-pre-line">{meta.settings.quoteTerms}</p>}
          </div>
        )}
        {!isInvoice && (
          <div className="mt-10 grid grid-cols-2 gap-8 text-xs">
            <div className="border-t border-neutral-400 pt-1">Customer signature</div>
            <div className="border-t border-neutral-400 pt-1">Date</div>
          </div>
        )}
        {meta.settings.documentFooter && <div className="mt-10 pt-3 border-t text-center text-[11px] text-neutral-500 whitespace-pre-line">{meta.settings.documentFooter}</div>}
      </div>
    </div>
  );
}

function GroupRows({ room, lines }: { room: string; lines: Array<{ description: string; qty: number; unit: string; unitPrice: number; total: number }> }) {
  return (
    <>
      {room && (
        <tr>
          <td colSpan={4} className="pt-3 pb-1 px-2 font-bold text-brand-700 border-b border-neutral-300">
            {room}
          </td>
        </tr>
      )}
      {lines.map((l, i) => (
        <tr key={i} className="border-b border-neutral-100">
          <td className="px-2 py-1.5">{l.description}</td>
          <td className="px-2 py-1.5 text-right whitespace-nowrap">
            {num(l.qty)} {l.unit}
          </td>
          <td className="px-2 py-1.5 text-right">{gbp(l.unitPrice)}</td>
          <td className="px-2 py-1.5 text-right font-semibold">{gbp(l.total)}</td>
        </tr>
      ))}
    </>
  );
}

function TRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-1 text-neutral-600">{label}</td>
      <td className="py-1 text-right">{value}</td>
    </tr>
  );
}
