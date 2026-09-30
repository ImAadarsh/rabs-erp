/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Plus, Trash2, RefreshCw, Send, Save, CheckCircle2, Copy, XCircle } from 'lucide-react';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Field, Modal, Row, Spinner, StatusBadge, inputCls, textareaCls } from '@/components/rabs/ui';
import { AcceptModal } from '@/components/rabs/job-modals';
import { rabs, errMsg, gbp, num, fmtDate, UNIT_LABEL } from '@/lib/rabs-api';

const LINE_LABEL: Record<string, string> = { product: 'Product', accessory: 'Accessory', labour: 'Fitting', custom: 'Extra', delivery: 'Delivery' };

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useRabs();
  const [agg, setAgg] = useState<any>(null);
  const [q, setQ] = useState<{ quote: any; lines: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [accept, setAccept] = useState(false);
  const [addLine, setAddLine] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await rabs.get(`/jobs/${id}`);
      setAgg(a);
      if (a.currentQuote) setQ(await rabs.get(`/quotes/${a.currentQuote.quote.id}`));
      else setQ(null);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<any>, msg?: string, after?: (r: any) => void) => {
    setBusy(key);
    try {
      const r = await fn();
      if (msg) toast.success(msg);
      if (after) after(r);
      else await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!agg) return <Spinner />;

  const { job, customer, status } = agg;

  if (!q) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Back id={id} title="Quotation" sub={`${customer.name} · ${job.jobNumber}`} />
        <Card>
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-muted-foreground">No quotation yet. It is built automatically from the measured rooms.</p>
            <Btn size="lg" loading={busy === 'create'} onClick={() => run('create', () => rabs.post(`/jobs/${id}/quotes`), 'Quotation created')}>
              CREATE QUOTATION
            </Btn>
            <div>
              <Link href={`/rabs/jobs/${id}/measure`} className="text-sm text-brand font-semibold">
                Go to measurement
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const quote = q.quote;
  const draft = quote.status === 'draft';
  const editable = draft && can('quotes');
  const canPrice = can('view_prices');
  const canCost = can('view_costs');
  const groups = groupLines(q.lines);

  const patchQuote = (body: any) => run('patch', () => rabs.patch(`/quotes/${quote.id}`, body), undefined, (r) => setQ(r));
  const patchLine = (lineId: string, body: any) => run(`line${lineId}`, () => rabs.patch(`/quotes/${quote.id}/lines/${lineId}`, body), undefined, (r) => setQ(r));
  const delLine = (lineId: string) => run(`line${lineId}`, () => rabs.del(`/quotes/${quote.id}/lines/${lineId}`), 'Line removed', (r) => setQ(r));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Back id={id} title={`Quotation ${quote.quoteNumber}`} sub={`${customer.name} · ${job.jobNumber} · v${quote.version}`} />
        <StatusBadge size="sm" label={status.label} color={status.color} textColor={status.textColor} />
      </div>

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <span className={`px-2.5 py-1 rounded-full font-semibold capitalize ${draft ? 'bg-neutral-200 text-neutral-800' : quote.status === 'sent' ? 'bg-amber-100 text-amber-800' : quote.status === 'accepted' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>
          {quote.status}
        </span>
        {quote.validUntil && <span className="text-muted-foreground">Valid until {fmtDate(quote.validUntil)}</span>}
        {quote.acceptedAt && <span className="text-muted-foreground">Accepted {fmtDate(quote.acceptedAt)} by {quote.acceptedByName || 'customer'}</span>}
        <Link href={`/rabs/jobs/${id}/print?doc=quote`} target="_blank" className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border font-semibold hover:bg-muted">
          <Printer size={14} /> Print / PDF
        </Link>
      </div>

      {groups.map(([room, lines]) => (
        <Card key={room} title={room} pad={false}>
          <div className="divide-y divide-border/60">
            {lines.map((l) => (
              <LineRow key={l.id} l={l} editable={editable} canPrice={canPrice} canCost={canCost} busy={busy === `line${l.id}`} onPatch={(b) => patchLine(l.id, b)} onDelete={() => delLine(l.id)} />
            ))}
          </div>
          {canPrice && (
            <div className="px-4 py-2 text-right text-sm font-semibold bg-muted/40 rounded-b-2xl">
              {room} subtotal {gbp(lines.reduce((s, l) => s + (l.lineTotal || 0), 0))}
            </div>
          )}
        </Card>
      ))}

      {editable && (
        <Btn variant="secondary" icon={<Plus size={16} />} onClick={() => setAddLine(true)}>
          Add extra line
        </Btn>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Notes & terms">
          <div className="space-y-3">
            <Field label="Notes on the quote">
              <textarea className={textareaCls} defaultValue={quote.notes || ''} disabled={!editable} onBlur={(e) => e.target.value !== (quote.notes || '') && patchQuote({ notes: e.target.value || null })} />
            </Field>
            <Field label="Valid until">
              <input type="date" className={inputCls} defaultValue={quote.validUntil || ''} disabled={!editable} onBlur={(e) => e.target.value && e.target.value !== quote.validUntil && patchQuote({ validUntil: e.target.value })} />
            </Field>
          </div>
        </Card>

        {canPrice && (
          <Card title="Totals">
            <div className="text-sm">
              <Row label="Subtotal">{gbp(quote.subtotal)}</Row>
              <div className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-muted-foreground">Discount</span>
                {editable ? (
                  <div className="flex items-center gap-1">
                    <select className="h-9 rounded-lg border border-border bg-background px-2 text-sm" value={quote.discountType} onChange={(e) => patchQuote({ discountType: e.target.value, discountValue: e.target.value === 'none' ? 0 : quote.discountValue })}>
                      <option value="none">None</option>
                      <option value="percent">%</option>
                      <option value="fixed">£</option>
                    </select>
                    {quote.discountType !== 'none' && (
                      <input
                        key={`d${quote.discountValue}`}
                        className="w-20 h-9 rounded-lg border border-border bg-background px-2 text-right"
                        inputMode="decimal"
                        defaultValue={quote.discountValue}
                        onBlur={(e) => Number(e.target.value) !== quote.discountValue && patchQuote({ discountValue: Number(e.target.value || 0) })}
                        aria-label="Discount value"
                      />
                    )}
                    <span className="w-20 text-right">−{gbp(quote.discountAmount)}</span>
                  </div>
                ) : (
                  <span>{quote.discountAmount > 0 ? `−${gbp(quote.discountAmount)}` : '—'}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-muted-foreground">Delivery</span>
                {editable ? (
                  <input
                    key={`del${quote.deliveryCharge}`}
                    className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-right"
                    inputMode="decimal"
                    defaultValue={quote.deliveryCharge}
                    onBlur={(e) => Number(e.target.value) !== quote.deliveryCharge && patchQuote({ deliveryCharge: Number(e.target.value || 0) })}
                    aria-label="Delivery charge"
                  />
                ) : (
                  <span>{gbp(quote.deliveryCharge)}</span>
                )}
              </div>
              <Row label="Net">{gbp(quote.netTotal)}</Row>
              <Row label={`VAT ${num((quote.vatRate || 0) * 100)}%`}>{gbp(quote.vatAmount)}</Row>
              <div className="border-t border-border my-1" />
              <Row label="Total" strong>
                {gbp(quote.total)}
              </Row>
              <Row label="Deposit to confirm">{gbp(quote.depositRequired)}</Row>
              <Row label="Balance on completion">{gbp(Math.max(0, (quote.total || 0) - (quote.depositRequired || 0)))}</Row>
              {canCost && quote.costTotal !== undefined && (
                <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Internal — not shown to customer</div>
                  <Row label="Cost">{gbp(quote.costTotal)}</Row>
                  <Row label="Margin">
                    {gbp(quote.marginAmount)} ({num(quote.marginPercent, 1)}%)
                  </Row>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Actions */}
      <div className="sticky bottom-20 md:bottom-4 z-10 rounded-2xl border border-border bg-card/95 backdrop-blur p-3 shadow-lg space-y-2">
        {draft && can('quotes') && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Btn variant="secondary" icon={<Save size={16} />} onClick={() => router.push(`/rabs/jobs/${id}`)}>
              SAVE DRAFT
            </Btn>
            <Btn variant="secondary" icon={<RefreshCw size={16} />} loading={busy === 'rebuild'} onClick={() => confirm('Rebuild all lines from the measurement? Manual line changes will be replaced.') && run('rebuild', () => rabs.post(`/quotes/${quote.id}/rebuild`), 'Rebuilt from measurement')}>
              Rebuild
            </Btn>
            <Btn className="col-span-2 sm:col-span-1" icon={<Send size={16} />} loading={busy === 'send'} onClick={() => run('send', () => rabs.post(`/quotes/${quote.id}/send`), 'Quote marked as sent')}>
              SEND QUOTE
            </Btn>
          </div>
        )}
        {(quote.status === 'sent' || quote.status === 'draft') && can('accept') && (
          <Btn variant="success" size="lg" className="w-full text-lg" icon={<CheckCircle2 size={20} />} onClick={() => setAccept(true)}>
            ACCEPT & CREATE JOB
          </Btn>
        )}
        {quote.status === 'sent' && can('quotes') && (
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="secondary" icon={<Copy size={16} />} loading={busy === 'revise'} onClick={() => run('revise', () => rabs.post(`/quotes/${quote.id}/revise`), 'New version created')}>
              Revise (new version)
            </Btn>
            <Btn variant="secondary" icon={<XCircle size={16} />} loading={busy === 'decline'} onClick={() => confirm('Mark this quote as declined?') && run('decline', () => rabs.post(`/quotes/${quote.id}/decline`), 'Quote declined')}>
              Declined
            </Btn>
          </div>
        )}
        {quote.status === 'accepted' && (
          <Btn size="lg" className="w-full" onClick={() => router.push(`/rabs/jobs/${id}`)}>
            OPEN JOB →
          </Btn>
        )}
        {quote.status === 'declined' && can('quotes') && (
          <Btn className="w-full" icon={<Copy size={16} />} loading={busy === 'revise'} onClick={() => run('revise', () => rabs.post(`/quotes/${quote.id}/revise`), 'New version created')}>
            Create new version
          </Btn>
        )}
      </div>

      {accept && (
        <AcceptModal
          open
          onClose={() => setAccept(false)}
          job={job}
          quote={quote}
          customerName={customer.name}
          onDone={() => {
            router.push(`/rabs/jobs/${id}`);
          }}
        />
      )}
      {addLine && <AddLineModal quoteId={quote.id} rooms={agg.measurement?.rooms || []} onClose={() => setAddLine(false)} onDone={(r) => setQ(r)} />}
    </div>
  );
}

function Back({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <Link href={`/rabs/jobs/${id}`} className="h-10 w-10 shrink-0 rounded-xl border border-border flex items-center justify-center hover:bg-muted" aria-label="Back to job">
        <ArrowLeft size={18} />
      </Link>
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight truncate">{title}</h1>
        <div className="text-sm text-muted-foreground truncate">{sub}</div>
      </div>
    </div>
  );
}

function groupLines(lines: any[]): Array<[string, any[]]> {
  const map = new Map<string, any[]>();
  for (const l of lines) {
    const k = l.roomName || (l.lineType === 'delivery' ? 'Delivery' : 'Extras');
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(l);
  }
  return [...map.entries()];
}

function LineRow({ l, editable, canPrice, canCost, busy, onPatch, onDelete }: { l: any; editable: boolean; canPrice: boolean; canCost: boolean; busy: boolean; onPatch: (b: any) => void; onDelete: () => void }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${busy ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{l.description}</div>
        <div className="text-xs text-muted-foreground">
          {LINE_LABEL[l.lineType] || l.lineType}
          {l.meta?.areaM2 ? ` · ${num(l.meta.areaM2)} m² room` : ''}
          {canCost && l.unitCost !== undefined ? ` · cost ${gbp(l.unitCost)}` : ''}
        </div>
      </div>
      {editable ? (
        <input
          key={`q${l.qty}`}
          className="w-16 h-9 rounded-lg border border-border bg-background px-2 text-right text-sm"
          inputMode="decimal"
          defaultValue={l.qty}
          onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== l.qty && onPatch({ qty: Number(e.target.value) })}
          aria-label="Quantity"
        />
      ) : (
        <span className="text-sm w-16 text-right">{num(l.qty)}</span>
      )}
      <span className="text-xs text-muted-foreground w-10">{UNIT_LABEL[l.unit] || l.unit}</span>
      {canPrice && (
        <>
          {editable ? (
            <input
              key={`p${l.unitPrice}`}
              className="w-20 h-9 rounded-lg border border-border bg-background px-2 text-right text-sm hidden sm:block"
              inputMode="decimal"
              defaultValue={l.unitPrice}
              onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== l.unitPrice && onPatch({ unitPrice: Number(e.target.value) })}
              aria-label="Unit price"
            />
          ) : (
            <span className="text-sm w-20 text-right hidden sm:block">{gbp(l.unitPrice)}</span>
          )}
          <span className="text-sm font-bold w-20 text-right">{gbp(l.lineTotal)}</span>
        </>
      )}
      {editable && (
        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-muted text-red-600" aria-label="Remove line">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function AddLineModal({ quoteId, rooms, onClose, onDone }: { quoteId: string; rooms: any[]; onClose: () => void; onDone: (r: any) => void }) {
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [roomId, setRoomId] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      onDone(await rabs.post(`/quotes/${quoteId}/lines`, { description, qty: Number(qty), unitPrice: Number(unitPrice), roomId: roomId || null }));
      toast.success('Line added');
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Add extra line"
      footer={
        <Btn loading={busy} onClick={save}>
          Add line
        </Btn>
      }
    >
      <Field label="Description">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Move & refit wardrobe" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity">
          <input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Price each ex VAT (£)">
          <input className={inputCls} inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </Field>
      </div>
      <Field label="Room">
        <select className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">General / extras</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
