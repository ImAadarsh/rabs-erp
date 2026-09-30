/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Phone, MapPin, MessageCircle, Pencil, Ruler, FileText, Package, Hammer, Truck, Wallet, History, AlertTriangle, Printer, Plus, Paperclip, CalendarClock, CheckCircle2, RotateCcw, Trash2, UserPlus
} from 'lucide-react';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Empty, NextActionButton, ProgressBar, Row, Spinner, StatusBadge } from '@/components/rabs/ui';
import { AcceptModal, AppointmentModal, BookingModal, CloseModal, ConvertModal, CustomerModal, DeleteJobModal, IssueModal, PaymentModal, VariationModal } from '@/components/rabs/job-modals';
import { Thumbs } from '@/components/rabs/thumbs';
import { rabs, errMsg, gbp, fmtDate, fmtDateTime, num, UNIT_LABEL } from '@/lib/rabs-api';

type ModalKind =
  | null
  | { k: 'appointment' }
  | { k: 'payment'; mode: 'deposit' | 'balance' | 'any' }
  | { k: 'booking'; type: 'fitting' | 'delivery'; existing?: any }
  | { k: 'accept' }
  | { k: 'convert' }
  | { k: 'deleteJob' }
  | { k: 'issue'; resolve?: boolean }
  | { k: 'variation' }
  | { k: 'close'; force: boolean }
  | { k: 'customer' };

const ACTION_CAP: Record<string, string> = {
  book_appointment: 'appointments',
  start_measurement: 'measure',
  create_quote: 'quotes',
  accept_quote: 'accept',
  convert_job: 'accept',
  record_deposit: 'payments',
  check_materials: 'materials',
  book_fitting: 'bookings',
  book_delivery: 'bookings',
  open_fitting: 'fieldwork',
  open_delivery: 'fieldwork',
  collect_balance: 'payments',
  close_job: 'payments',
  resolve_issue: 'bookings'
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, meta } = useRabs();
  const [agg, setAgg] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setAgg(await rabs.get(`/jobs/${id}`));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<any>, msg?: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r?.job && r?.status) setAgg(r);
      else await load();
      if (msg) toast.success(msg);
      return r;
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!agg) return <Spinner />;

  const { job, customer, status, progress, nextAction, money, measurement, currentQuote, materials, bookings, payments, invoice, variations, appointments, timeline, documents } = agg;
  const closed = !!job.closedAt;
  const activeBooking = (type: string) => bookings.find((b: any) => b.type === type && b.status !== 'cancelled' && b.status !== 'complete');
  const roomCount = measurement?.rooms?.length ?? 0;
  const office = can('customers');

  const runNext = async () => {
    if (!nextAction) return;
    switch (nextAction.code) {
      case 'book_appointment':
        return setModal({ k: 'appointment' });
      case 'start_measurement':
        await act(() => rabs.post(`/jobs/${id}/measurement`));
        return router.push(`/rabs/jobs/${id}/measure`);
      case 'create_quote':
        if (!roomCount || measurement.rooms.some((r: any) => !r.productId)) return router.push(`/rabs/jobs/${id}/measure`);
        {
          const q = await act(() => rabs.post(`/jobs/${id}/quotes`));
          if (q) router.push(`/rabs/jobs/${id}/quote`);
        }
        return;
      case 'accept_quote':
        if (currentQuote?.quote?.status === 'draft') return router.push(`/rabs/jobs/${id}/quote`);
        return setModal({ k: 'accept' });
      case 'convert_job':
        return setModal({ k: 'convert' });
      case 'record_deposit':
        return setModal({ k: 'payment', mode: 'deposit' });
      case 'check_materials':
        return act(() => rabs.post(`/jobs/${id}/materials/check`), 'Materials checked');
      case 'book_fitting':
        return setModal({ k: 'booking', type: 'fitting' });
      case 'book_delivery':
        return setModal({ k: 'booking', type: 'delivery' });
      case 'open_fitting':
      case 'open_delivery': {
        const b = activeBooking(nextAction.code === 'open_fitting' ? 'fitting' : 'delivery');
        if (b) return router.push(`/rabs/jobs/${id}/work/${b.id}`);
        return;
      }
      case 'collect_balance':
        return setModal({ k: 'payment', mode: 'balance' });
      case 'close_job':
        return setModal({ k: 'close', force: false });
      case 'resolve_issue':
        return setModal({ k: 'issue', resolve: true });
    }
  };

  const nextSub = (() => {
    if (!nextAction) return undefined;
    if (nextAction.code === 'record_deposit' && money) return `Deposit due ${gbp(money.depositOutstanding)}`;
    if (nextAction.code === 'collect_balance' && money) return `Balance ${gbp(money.balance)}`;
    if (nextAction.code === 'accept_quote' && currentQuote?.quote?.total !== undefined) return `${currentQuote.quote.quoteNumber} · ${gbp(currentQuote.quote.total)}`;
    if (nextAction.code === 'check_materials' && job.materialsStatus === 'pending') return 'Some items need ordering — recheck when they arrive';
    const b = nextAction.code === 'open_fitting' ? activeBooking('fitting') : nextAction.code === 'open_delivery' ? activeBooking('delivery') : null;
    if (b) return `${fmtDate(b.scheduledDate)} ${b.slot || ''} · ${b.staffName || 'Unassigned'}`;
    return undefined;
  })();

  const canNext = nextAction && can(ACTION_CAP[nextAction.code] || 'customers') && !(nextAction.code.startsWith('open_') && !nextSub);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(agg.siteAddress || '')}`;
  const waPhone = (customer.phone || '').replace(/\D/g, '').replace(/^0/, '44');

  const uploadDocs = async (files: FileList | null) => {
    if (!files?.length) return;
    await act(() => rabs.upload(`/jobs/${id}/files`, Array.from(files)), 'Uploaded');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight truncate">{customer.name}</h1>
              {office && (
                <button onClick={() => setModal({ k: 'customer' })} className="p-2.5 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Edit customer">
                  <Pencil size={15} />
                </button>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {job.jobNumber}
              {job.title ? ` · ${job.title}` : ''}
            </div>
          </div>
          <StatusBadge label={status.label} color={status.color} textColor={status.textColor} />
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {customer.phone && (
            <a href={`tel:${customer.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
              <Phone size={15} /> {customer.phone}
            </a>
          )}
          {waPhone.length > 9 && (
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
              <MessageCircle size={15} /> WhatsApp
            </a>
          )}
          {agg.siteAddress && (
            <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-sm hover:bg-muted max-w-full">
              <MapPin size={15} className="shrink-0" /> <span className="truncate">{agg.siteAddress}</span>
            </a>
          )}
        </div>
        {job.hasIssue && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 p-3 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{job.issueNote || 'Issue raised on this job'}</span>
          </div>
        )}
        <div className="mt-4">
          <ProgressBar steps={progress.steps} index={progress.index} closed={closed} />
        </div>
      </div>

      {canNext ? (
        <NextActionButton label={nextAction.label} sub={nextSub} loading={busy} onClick={runNext} />
      ) : closed ? (
        <div className="rounded-2xl bg-neutral-900 text-white px-6 py-5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60">Job closed</div>
            <div className="text-xl font-extrabold">{fmtDate(job.closedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {office && (
              <Btn variant="secondary" icon={<AlertTriangle size={16} />} onClick={() => setModal({ k: 'issue' })}>
                Report snag
              </Btn>
            )}
            {can('admin') && (
              <Btn variant="secondary" icon={<RotateCcw size={16} />} onClick={() => act(() => rabs.post(`/jobs/${id}/reopen`), 'Job reopened')}>
                Reopen
              </Btn>
            )}
          </div>
        </div>
      ) : null}

      {job.convertedAt && <JobSummary job={job} money={money} materials={materials} bookings={bookings} />}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Money */}
          {money && (money.total > 0 || currentQuote) && (
            <Card
              title={
                <span className="inline-flex items-center gap-2">
                  <Wallet size={15} /> Money
                </span>
              }
              actions={
                can('payments') && !closed && job.convertedAt ? (
                  <Btn size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setModal({ k: 'payment', mode: 'any' })}>
                    Payment
                  </Btn>
                ) : null
              }
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MoneyBox label="Job total" value={gbp(money.total || currentQuote?.quote?.total)} />
                <MoneyBox label="Deposit" value={gbp(money.depositRequired)} tone={money.depositMet ? 'ok' : 'warn'} sub={money.depositRequired > 0 ? (money.depositMet ? 'Paid' : 'Outstanding') : 'Not required'} />
                <MoneyBox label="Paid" value={gbp(money.paid)} />
                <MoneyBox label="Balance" value={gbp(money.balance)} tone={money.balance > 0 ? 'warn' : 'ok'} />
              </div>
              {payments.length > 0 && (
                <div className="mt-3 divide-y divide-border/60 text-sm">
                  {payments.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between py-2">
                      <div>
                        <span className="font-semibold capitalize">{p.kind}</span> · <span className="text-muted-foreground">{String(p.method).replace('_', ' ')}</span>
                        <div className="text-xs text-muted-foreground">
                          {fmtDateTime(p.paidAt)} {p.recordedByName ? `· ${p.recordedByName}` : ''} {p.reference ? `· ${p.reference}` : ''}
                        </div>
                      </div>
                      <div className={`font-bold ${p.amount < 0 ? 'text-red-600' : ''}`}>{gbp(p.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {currentQuote && (
                  <Link href={`/rabs/jobs/${id}/print?doc=quote`} target="_blank" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
                    <Printer size={14} /> Quote PDF
                  </Link>
                )}
                {invoice ? (
                  <Link href={`/rabs/jobs/${id}/print?doc=invoice`} target="_blank" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
                    <Printer size={14} /> Invoice {invoice.invoiceNumber}
                  </Link>
                ) : (
                  can('invoices') &&
                  job.convertedAt &&
                  !closed && (
                    <Btn size="sm" variant="secondary" onClick={() => act(() => rabs.post(`/jobs/${id}/invoice`), 'Invoice generated')}>
                      Generate invoice
                    </Btn>
                  )
                )}
              </div>
            </Card>
          )}

          {/* Measurement */}
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <Ruler size={15} /> Measurement
              </span>
            }
            actions={
              measurement && can('measure') ? (
                <Link href={`/rabs/jobs/${id}/measure`} className="text-sm font-semibold text-brand">
                  {job.acceptedQuoteId ? 'View' : 'Open'}
                </Link>
              ) : null
            }
          >
            {!measurement ? (
              <Empty>Not measured yet.</Empty>
            ) : roomCount === 0 ? (
              <Empty>No rooms added yet.</Empty>
            ) : (
              <div className="space-y-3">
                {measurement.rooms.map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.areaM2 > 0 ? `${num(r.lengthM)} × ${num(r.widthM)} m · ${num(r.areaM2)} m² · ${num(r.areaSqyd)} sq yd` : 'Item'}
                          {r.stairs > 0 ? ` · ${r.stairs} stairs` : ''}
                        </div>
                        <div className="text-sm mt-1">{r.product ? `${r.product.name}${r.product.colour ? ` — ${r.product.colour}` : ''}` : <span className="text-red-600">No product chosen</span>}</div>
                        {r.accessories.length > 0 && <div className="text-xs text-muted-foreground mt-0.5">+ {r.accessories.map((a: any) => a.name).join(', ')}</div>}
                      </div>
                      {r.subtotal !== undefined && r.subtotal > 0 && <div className="font-bold text-sm whitespace-nowrap">{gbp(r.subtotal)}</div>}
                    </div>
                    {r.photos.length > 0 && <Thumbs photos={r.photos} />}
                  </div>
                ))}
                {measurement.notes && <div className="text-sm text-muted-foreground">Notes: {measurement.notes}</div>}
              </div>
            )}
          </Card>

          {/* Quote */}
          {(currentQuote || agg.quotes.length > 0) && (
            <Card
              title={
                <span className="inline-flex items-center gap-2">
                  <FileText size={15} /> Quotation
                </span>
              }
              actions={
                can('quotes') && currentQuote ? (
                  <Link href={`/rabs/jobs/${id}/quote`} className="text-sm font-semibold text-brand">
                    Open
                  </Link>
                ) : null
              }
            >
              {currentQuote && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold">
                      {currentQuote.quote.quoteNumber} <span className="text-muted-foreground font-normal">v{currentQuote.quote.version}</span>
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {quoteWord(currentQuote.quote.status)}
                      {currentQuote.quote.acceptedAt ? ` ${fmtDate(currentQuote.quote.acceptedAt)} by ${currentQuote.quote.acceptedByName || 'customer'}` : currentQuote.quote.sentAt ? ` ${fmtDate(currentQuote.quote.sentAt)}` : ''}
                    </div>
                  </div>
                  {currentQuote.quote.total !== undefined && <div className="text-xl font-extrabold">{gbp(currentQuote.quote.total)}</div>}
                </div>
              )}
              {agg.quotes.length > 1 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Versions: {agg.quotes.map((q: any) => `v${q.version} (${quoteWord(q.status)})`).join(' · ')}
                </div>
              )}
            </Card>
          )}

          {/* Materials */}
          {job.convertedAt && (
            <Card
              title={
                <span className="inline-flex items-center gap-2">
                  <Package size={15} /> Materials
                </span>
              }
              actions={
                can('materials') && !closed && !job.completedAt ? (
                  <Btn size="sm" variant="secondary" loading={busy} onClick={() => act(() => rabs.post(`/jobs/${id}/materials/check`), 'Materials checked')}>
                    {materials.length ? 'Recheck stock' : 'Check stock'}
                  </Btn>
                ) : null
              }
            >
              {materials.length === 0 ? (
                <Empty>Not checked yet.</Empty>
              ) : (
                <div className="divide-y divide-border/60">
                  {materials.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{m.description}</div>
                        <div className="text-xs text-muted-foreground">
                          Need {num(m.qtyRequired)} {UNIT_LABEL[m.unit] || m.unit} · reserved {num(m.qtyReserved)}
                          {m.qtyShort > 0 ? ` · short ${num(m.qtyShort)}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <MatBadge status={m.status} />
                        {can('materials') && m.status === 'to_order' && (
                          <Btn size="sm" variant="secondary" onClick={() => act(() => rabs.post(`/materials/${m.id}/status`, { status: 'ordered' }), 'Marked ordered')}>
                            Ordered
                          </Btn>
                        )}
                        {can('materials') && m.status === 'ordered' && (
                          <Btn size="sm" variant="secondary" onClick={() => act(() => rabs.post(`/materials/${m.id}/status`, { status: 'received' }), 'Marked received')}>
                            Received
                          </Btn>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Bookings */}
          {(bookings.length > 0 || (job.convertedAt && can('bookings'))) && (
            <Card
              title={
                <span className="inline-flex items-center gap-2">
                  <Hammer size={15} /> Fitting & delivery
                </span>
              }
              actions={
                can('bookings') && !closed ? (
                  <div className="flex gap-2">
                    {job.requiresFitting && !activeBooking('fitting') && (
                      <Btn size="sm" variant="secondary" icon={<Hammer size={14} />} onClick={() => setModal({ k: 'booking', type: 'fitting' })}>
                        Fitting
                      </Btn>
                    )}
                    {job.requiresDelivery && !activeBooking('delivery') && (
                      <Btn size="sm" variant="secondary" icon={<Truck size={14} />} onClick={() => setModal({ k: 'booking', type: 'delivery' })}>
                        Delivery
                      </Btn>
                    )}
                  </div>
                ) : null
              }
            >
              {bookings.length === 0 ? (
                <Empty>Nothing booked yet.</Empty>
              ) : (
                <div className="space-y-2">
                  {bookings.map((b: any) => (
                    <div key={b.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold capitalize flex items-center gap-2">
                            {b.type === 'fitting' ? <Hammer size={15} /> : <Truck size={15} />} {b.type}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.status === 'complete' ? 'bg-emerald-100 text-emerald-800' : b.status === 'cancelled' ? 'bg-neutral-200 text-neutral-600' : 'bg-blue-100 text-blue-800'}`}>
                              {String(b.status).replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {fmtDate(b.scheduledDate)} {b.slot} · {b.staffName || 'Unassigned'}
                          </div>
                          {b.signedName && <div className="text-xs text-muted-foreground mt-0.5">Signed by {b.signedName}</div>}
                          {b.signatureUrl && (
                            <a href={b.signatureUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.signatureUrl} alt={`Signature of ${b.signedName || 'customer'}`} className="mt-1 h-12 rounded border border-border bg-white" />
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          {b.status !== 'cancelled' && can('fieldwork') && (
                            <Link href={`/rabs/jobs/${id}/work/${b.id}`} className="min-h-[40px] inline-flex items-center px-2 text-sm font-semibold text-brand">
                              {b.status === 'complete' ? 'View' : 'Open'}
                            </Link>
                          )}
                          {can('bookings') && b.status === 'booked' && (
                            <>
                              <button className="min-h-[40px] px-3 rounded-lg border border-border text-sm font-medium" onClick={() => setModal({ k: 'booking', type: b.type, existing: b })}>
                                Reschedule
                              </button>
                              <button className="min-h-[40px] px-3 rounded-lg border border-red-200 text-sm font-medium text-red-600" onClick={() => confirm('Cancel this booking?') && act(() => rabs.post(`/bookings/${b.id}/cancel`), 'Booking cancelled')}>
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {b.photos?.length > 0 && <Thumbs photos={b.photos} />}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Variations */}
          {job.convertedAt && (variations.length > 0 || can('quotes')) && (
            <Card
              title="Variations / extras"
              actions={
                can('quotes') && !closed ? (
                  <Btn size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setModal({ k: 'variation' })}>
                    Add
                  </Btn>
                ) : null
              }
            >
              {variations.length === 0 ? (
                <Empty>No changes to the accepted quote.</Empty>
              ) : (
                <div className="divide-y divide-border/60 text-sm">
                  {variations.map((v: any) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <div className="font-semibold">{v.description}</div>
                        <div className="text-xs text-muted-foreground capitalize">{v.status}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.total !== undefined && <span className="font-bold">{gbp(v.total)}</span>}
                        {v.status === 'pending' && can('quotes') && (
                          <>
                            <Btn size="sm" variant="success" onClick={() => act(() => rabs.post(`/variations/${v.id}/approve`), 'Approved')}>
                              Approve
                            </Btn>
                            <Btn size="sm" variant="secondary" onClick={() => act(() => rabs.post(`/variations/${v.id}/reject`), 'Rejected')}>
                              Reject
                            </Btn>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* Appointments */}
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <CalendarClock size={15} /> Appointments
              </span>
            }
            actions={
              can('appointments') && !closed ? (
                <Btn size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setModal({ k: 'appointment' })}>
                  Book
                </Btn>
              ) : null
            }
          >
            {appointments.length === 0 ? (
              <Empty>None booked.</Empty>
            ) : (
              <div className="space-y-2">
                {appointments.map((a: any) => (
                  <div key={a.id} className="text-sm flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{fmtDateTime(a.scheduledAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {meta?.appointmentPurposes.find((p) => p.value === a.purpose)?.label || a.purpose} · {a.staffName || 'Unassigned'}
                      </div>
                      {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                    </div>
                    <span className={`text-xs font-semibold capitalize ${a.status === 'booked' ? 'text-blue-600' : a.status === 'done' ? 'text-emerald-600' : 'text-muted-foreground line-through'}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Actions */}
          {(office || can('fieldwork')) && (
            <Card title="More">
              <div className="grid grid-cols-2 gap-2">
                {closed ? null : !job.hasIssue ? (
                  <Btn size="sm" variant="secondary" icon={<AlertTriangle size={14} />} onClick={() => setModal({ k: 'issue' })}>
                    Raise issue
                  </Btn>
                ) : (
                  can('bookings') && (
                    <Btn size="sm" variant="secondary" icon={<CheckCircle2 size={14} />} onClick={() => setModal({ k: 'issue', resolve: true })}>
                      Resolve issue
                    </Btn>
                  )
                )}
                {office && (
                  <Btn size="sm" variant="secondary" icon={<Paperclip size={14} />} onClick={() => fileRef.current?.click()}>
                    Attach photo / PDF
                  </Btn>
                )}
                {office && (
                  <Link
                    href={`/rabs/new?customer=${customer.id}`}
                    className="inline-flex items-center justify-center gap-2 h-10 px-3 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted"
                  >
                    <UserPlus size={14} /> New job for customer
                  </Link>
                )}
                {!closed && can('admin') && money && money.balance > 0 && job.convertedAt && (
                  <Btn size="sm" variant="secondary" onClick={() => setModal({ k: 'close', force: true })}>
                    Force close
                  </Btn>
                )}
                {can('admin') && (
                  <Btn size="sm" variant="secondary" className="text-red-600" icon={<Trash2 size={14} />} onClick={() => setModal({ k: 'deleteJob' })}>
                    Delete job
                  </Btn>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => uploadDocs(e.target.files)} />
            </Card>
          )}

          {documents.length > 0 && (
            <Card title="Documents & photos">
              <Thumbs photos={documents} />
            </Card>
          )}

          {/* Timeline */}
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <History size={15} /> Timeline
              </span>
            }
          >
            <ol className="relative border-l-2 border-border ml-2 space-y-3">
              {timeline.map((t: any) => (
                <li key={t.id} className="pl-4 relative">
                  <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-brand" />
                  <div className="text-sm">{t.message}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDateTime(t.createdAt)}
                    {t.userName ? ` · ${t.userName}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      {modal?.k === 'appointment' && <AppointmentModal open onClose={() => setModal(null)} job={job} onDone={(a) => (a?.job ? setAgg(a) : load())} />}
      {modal?.k === 'payment' && <PaymentModal open onClose={() => setModal(null)} job={job} agg={agg} mode={modal.mode} onDone={(a) => (a?.job ? setAgg(a) : load())} />}
      {modal?.k === 'booking' && <BookingModal open onClose={() => setModal(null)} job={job} type={modal.type} existing={modal.existing} onDone={(a) => (a?.job ? setAgg(a) : load())} />}
      {modal?.k === 'accept' && currentQuote && (
        <AcceptModal open onClose={() => setModal(null)} job={job} quote={currentQuote.quote} customerName={customer.name} onDone={(a) => (a?.job ? setAgg(a) : load())} />
      )}
      {modal?.k === 'issue' && <IssueModal open onClose={() => setModal(null)} job={job} resolve={modal.resolve} onDone={(a) => (a?.job ? setAgg(a) : load())} />}
      {modal?.k === 'variation' && <VariationModal open onClose={() => setModal(null)} job={job} onDone={(a) => (a?.job ? setAgg(a) : load())} />}
      {modal?.k === 'close' && <CloseModal open onClose={() => setModal(null)} job={job} force={modal.force} onDone={(a) => (a?.job ? setAgg(a) : load())} />}
      {modal?.k === 'customer' && <CustomerModal open onClose={() => setModal(null)} customer={customer} onDone={load} />}
      {modal?.k === 'convert' && <ConvertModal open onClose={() => setModal(null)} job={job} quote={currentQuote?.quote} onDone={(a) => (a?.job ? setAgg(a) : load())} />}
      {modal?.k === 'deleteJob' && <DeleteJobModal open onClose={() => setModal(null)} job={job} onDeleted={() => router.push('/rabs/jobs')} />}
    </div>
  );
}

function MoneyBox({ label, value, tone, sub }: { label: string; value: string; tone?: 'ok' | 'warn'; sub?: string }) {
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <div className="text-xs text-muted-foreground font-semibold">{label}</div>
      <div className={`text-lg font-extrabold ${tone === 'warn' ? 'text-orange-600' : tone === 'ok' ? 'text-emerald-700' : ''}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function MatBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    reserved: 'bg-emerald-100 text-emerald-800',
    received: 'bg-emerald-100 text-emerald-800',
    to_order: 'bg-red-100 text-red-800',
    ordered: 'bg-amber-100 text-amber-800',
    used: 'bg-neutral-200 text-neutral-700'
  };
  const word: Record<string, string> = { to_order: 'to order', not_tracked: 'not tracked', used: 'used on job' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${map[status] || 'bg-muted'}`}>{word[status] || status}</span>;
}

const QUOTE_WORD: Record<string, string> = { draft: 'draft', sent: 'sent', accepted: 'accepted', superseded: 'replaced by a newer version', declined: 'declined' };
const quoteWord = (s: string) => QUOTE_WORD[s] || s;

/** The things the office asks about most, always at the top: money still owed, are materials ready, when is the fitting/delivery. */
function JobSummary({ job, money, materials, bookings }: { job: any; money: any; materials: any[]; bookings: any[] }) {
  const upcoming = bookings.filter((b) => b.status !== 'cancelled').sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
  const next = upcoming.find((b) => b.status !== 'complete') || upcoming[upcoming.length - 1];
  const shortCount = materials.filter((m) => m.status === 'to_order' || m.status === 'ordered').length;
  const mat =
    job.materialsStatus === 'ready'
      ? { text: 'Ready', tone: 'text-emerald-700' }
      : job.materialsStatus === 'pending'
        ? { text: `${shortCount || 'Some'} item(s) to order`, tone: 'text-red-600' }
        : { text: 'Not checked', tone: 'text-muted-foreground' };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {money && (
        <div className={`rounded-2xl p-4 border-2 ${money.balance > 0.005 ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'}`}>
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Balance to pay</div>
          <div className={`text-3xl font-extrabold ${money.balance > 0.005 ? 'text-orange-600' : 'text-emerald-700'}`}>{gbp(money.balance)}</div>
          <div className="text-xs text-muted-foreground">
            of {gbp(money.total)} · paid {gbp(money.paid)}
          </div>
        </div>
      )}
      <div className="rounded-2xl p-4 border border-border bg-card">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          <Package size={13} /> Materials
        </div>
        <div className={`text-xl font-extrabold ${mat.tone}`}>{mat.text}</div>
      </div>
      <div className="rounded-2xl p-4 border border-border bg-card">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          {next?.type === 'delivery' ? <Truck size={13} /> : <Hammer size={13} />} {next ? (next.type === 'delivery' ? 'Delivery' : 'Fitting') : 'Fitting / delivery'}
        </div>
        {next ? (
          <>
            <div className="text-xl font-extrabold">
              {fmtDate(next.scheduledDate)} {next.slot}
            </div>
            <div className="text-xs text-muted-foreground">
              {next.staffName || 'No one assigned'} · {String(next.status).replace('_', ' ')}
            </div>
          </>
        ) : (
          <div className="text-xl font-extrabold text-muted-foreground">Not booked</div>
        )}
      </div>
    </div>
  );
}
