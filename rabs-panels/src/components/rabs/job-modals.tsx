/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRabs } from './shell';
import { Btn, Field, Modal, Toggle, inputCls, textareaCls } from './ui';
import { rabs, errMsg, gbp, addDays, isoDay } from '@/lib/rabs-api';

type Base = { open: boolean; onClose: () => void; job: any; onDone: (agg: any) => void };

function useSubmit(onDone: (a: any) => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(msg);
      onDone(res);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

export function AppointmentModal({ open, onClose, job, onDone }: Base) {
  const { meta } = useRabs();
  const [date, setDate] = useState(addDays(isoDay(), 1));
  const [time, setTime] = useState('10:00');
  const [purpose, setPurpose] = useState('measure');
  const [staff, setStaff] = useState('');
  const [notes, setNotes] = useState('');
  const { busy, run } = useSubmit(onDone, onClose);
  const staffList = (meta?.staff || []).filter((u) => u.status === 'active' && u.roles.some((r) => ['SURVEYOR', 'SALES_REP', 'ADMIN', 'OFFICE', 'SUPER_ADMIN'].includes(r)));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book appointment"
      footer={
        <Btn
          loading={busy}
          onClick={() =>
            run(
              () => rabs.post(`/jobs/${job.id}/appointments`, { scheduledAt: new Date(`${date}T${time}`).toISOString(), purpose, staffUserId: staff || null, notes: notes || null }),
              'Appointment booked'
            )
          }
        >
          Book appointment
        </Btn>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <input type="time" step={900} className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Purpose">
        <select className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {meta?.appointmentPurposes.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Surveyor">
        <select className={inputCls} value={staff} onChange={(e) => setStaff(e.target.value)}>
          <option value="">Unassigned</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes">
        <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function PaymentModal({ open, onClose, job, onDone, agg, mode }: Base & { agg: any; mode: 'deposit' | 'balance' | 'any' }) {
  const m = agg.money || {};
  const suggested = mode === 'deposit' ? m.depositOutstanding : m.balance;
  const [amount, setAmount] = useState<string>(suggested > 0 ? String(suggested) : '');
  const [method, setMethod] = useState('card');
  const [reference, setReference] = useState('');
  const [refund, setRefund] = useState(false);
  const { busy, run } = useSubmit(onDone, onClose);
  const submit = () =>
    run(async () => {
      if (mode === 'balance' && !agg.invoice) await rabs.post(`/jobs/${job.id}/invoice`);
      return rabs.post(`/jobs/${job.id}/payments`, { amount: Number(amount), method, reference: reference || null, ...(refund ? { kind: 'refund' } : {}) });
    }, refund ? 'Refund recorded' : `Payment of ${gbp(Number(amount))} recorded`);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'deposit' ? 'Record deposit' : mode === 'balance' ? 'Collect balance' : 'Record payment'}
      footer={
        <Btn variant="success" loading={busy} disabled={!(Number(amount) > 0)} onClick={submit}>
          {refund ? 'Record refund' : `Record ${amount ? gbp(Number(amount)) : 'payment'}`}
        </Btn>
      }
    >
      <div className="rounded-xl bg-muted p-3 text-sm grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="font-bold">{gbp(m.total)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Paid</div>
          <div className="font-bold">{gbp(m.paid)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">{mode === 'deposit' ? 'Deposit due' : 'Balance'}</div>
          <div className="font-bold text-brand">{gbp(suggested)}</div>
        </div>
      </div>
      {mode === 'balance' && !agg.invoice && <div className="text-sm text-muted-foreground">The final invoice will be generated automatically from the accepted quote.</div>}
      <Field label="Amount (£)">
        <input className={`${inputCls} text-xl font-bold`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
      </Field>
      <Field label="Method">
        <div className="grid grid-cols-3 gap-2">
          {[
            ['card', 'Card'],
            ['cash', 'Cash'],
            ['bank_transfer', 'Bank'],
            ['finance', 'Finance'],
            ['cheque', 'Cheque'],
            ['other', 'Other']
          ].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMethod(v)} className={`h-11 rounded-xl border text-sm font-semibold ${method === v ? 'bg-brand text-white border-brand' : 'border-border'}`}>
              {l}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Reference (optional)">
        <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Card receipt / transfer ref" />
      </Field>
      {mode === 'any' && <Toggle checked={refund} onChange={setRefund} label="This is a refund to the customer" />}
    </Modal>
  );
}

export function BookingModal({ open, onClose, job, onDone, type, existing }: Base & { type: 'fitting' | 'delivery'; existing?: any }) {
  const { meta } = useRabs();
  const [date, setDate] = useState(existing?.scheduledDate?.slice(0, 10) || addDays(isoDay(), 2));
  const [slot, setSlot] = useState(existing?.slot || 'AM');
  const [staff, setStaff] = useState(existing?.staffUserId || '');
  const [instructions, setInstructions] = useState(existing?.instructions || '');
  const { busy, run } = useSubmit(onDone, onClose);
  const crew = useMemo(() => {
    const want = type === 'fitting' ? ['FITTER'] : ['DRIVER', 'FITTER'];
    const all = (meta?.staff || []).filter((u) => u.status === 'active');
    const primary = all.filter((u) => u.roles.some((r) => want.includes(r)));
    return primary.length ? primary : all;
  }, [meta, type]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${existing ? 'Reschedule' : 'Book'} ${type}`}
      footer={
        <Btn loading={busy} onClick={() => run(() => rabs.post(`/jobs/${job.id}/bookings`, { type, scheduledDate: date, slot, staffUserId: staff || null, instructions: instructions || null }), `${type === 'fitting' ? 'Fitting' : 'Delivery'} booked`)}>
          {existing ? 'Save new date' : `Book ${type}`}
        </Btn>
      }
    >
      <Field label="Date">
        <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Slot">
        <div className="grid grid-cols-4 gap-2">
          {['AM', 'PM', 'All day', 'Evening'].map((s) => (
            <button key={s} type="button" onClick={() => setSlot(s)} className={`h-11 rounded-xl border text-sm font-semibold ${slot === s ? 'bg-brand text-white border-brand' : 'border-border'}`}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label={type === 'fitting' ? 'Fitter' : 'Driver / crew'}>
        <select className={inputCls} value={staff} onChange={(e) => setStaff(e.target.value)}>
          <option value="">Unassigned</option>
          {crew.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Instructions for the team">
        <textarea className={textareaCls} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Access, parking, pets, furniture moving…" />
      </Field>
    </Modal>
  );
}

const CARRIED_FORWARD = [
  'Customer and address',
  'Rooms and measurements',
  'Products and quantities',
  'Accessories',
  'Prices (this approved version)',
  'Deposit and payment details',
  'Notes and photos',
  'Fitting / delivery needs'
];

function ConvertQuestion({ jobNumber }: { jobNumber: string }) {
  return (
    <div className="rounded-xl border-2 border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/30 p-4">
      <div className="text-lg font-extrabold">Convert this quotation into a job?</div>
      <p className="text-sm text-muted-foreground mt-1">Job {jobNumber} keeps its number. Nothing needs typing again — these come across automatically:</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
        {CARRIED_FORWARD.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="text-emerald-700 font-bold">✓</span> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuoteSummary({ quote }: { quote: any }) {
  return (
    <div className="rounded-xl bg-muted p-4 text-center">
      <div className="text-sm text-muted-foreground">
        {quote.quoteNumber} · v{quote.version}
      </div>
      {quote.total !== undefined && <div className="text-3xl font-extrabold mt-1">{gbp(quote.total)}</div>}
      {quote.depositRequired > 0 && <div className="text-sm mt-1">Deposit to confirm: {gbp(quote.depositRequired)}</div>}
    </div>
  );
}

export function AcceptModal({ open, onClose, job, onDone, quote, customerName }: Base & { quote: any; customerName: string }) {
  const [name, setName] = useState(customerName || '');
  const { busy, run } = useSubmit(onDone, onClose);
  const accept = (convert: boolean) =>
    run(() => rabs.post(`/quotes/${quote.id}/accept`, { acceptedByName: name || null, convert }), convert ? `Quote accepted — job ${job.jobNumber} created` : 'Quote accepted');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customer accepts quote"
      footer={
        <>
          <Btn variant="secondary" size="lg" loading={busy} onClick={() => accept(false)}>
            Accept only
          </Btn>
          <Btn variant="success" size="lg" loading={busy} onClick={() => accept(true)}>
            YES — CREATE JOB
          </Btn>
        </>
      }
    >
      <QuoteSummary quote={quote} />
      <Field label="Accepted by">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <ConvertQuestion jobNumber={job.jobNumber} />
      <p className="text-xs text-muted-foreground">Accepting locks these prices and the measurement. Later price changes never alter this quote.</p>
    </Modal>
  );
}

export function ConvertModal({ open, onClose, job, onDone, quote }: Base & { quote: any }) {
  const { busy, run } = useSubmit(onDone, onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create job"
      footer={
        <>
          <Btn variant="secondary" size="lg" onClick={onClose}>
            Not yet
          </Btn>
          <Btn variant="success" size="lg" loading={busy} onClick={() => run(() => rabs.post(`/jobs/${job.id}/convert`), `Job ${job.jobNumber} created`)}>
            YES — CREATE JOB
          </Btn>
        </>
      }
    >
      {quote && <QuoteSummary quote={quote} />}
      <ConvertQuestion jobNumber={job.jobNumber} />
    </Modal>
  );
}

export function DeleteJobModal({ open, onClose, job, onDeleted }: Omit<Base, 'onDone'> & { onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [deleteCustomer, setDeleteCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = confirmText.trim().toUpperCase() === String(job.jobNumber).toUpperCase();
  const submit = async () => {
    setBusy(true);
    try {
      await rabs.del(`/admin/jobs/${job.id}`, { confirm: confirmText.trim(), reason: reason || null, deleteCustomer });
      toast.success(`Job ${job.jobNumber} deleted`);
      onClose();
      onDeleted();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete job"
      footer={
        <Btn variant="danger" size="lg" loading={busy} disabled={!ok} onClick={submit}>
          Delete for good
        </Btn>
      }
    >
      <div className="rounded-xl bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 p-3 text-sm">
        This removes the job, its quotes, payments, invoice, bookings, photos and history. Only use it for mistakes or test records. It cannot be undone.
      </div>
      <Field label={`Type ${job.jobNumber} to confirm`}>
        <input className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" />
      </Field>
      <Field label="Reason">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Test record" />
      </Field>
      <Toggle checked={deleteCustomer} onChange={setDeleteCustomer} label="Also delete the customer (only if they have no other jobs)" />
    </Modal>
  );
}

export function IssueModal({ open, onClose, job, onDone, resolve }: Base & { resolve?: boolean }) {
  const [note, setNote] = useState('');
  const { busy, run } = useSubmit(onDone, onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={resolve ? 'Resolve issue' : 'Raise issue / snag'}
      footer={
        <Btn variant={resolve ? 'success' : 'danger'} loading={busy} onClick={() => run(() => rabs.post(`/jobs/${job.id}/issue${resolve ? '/resolve' : ''}`, { note: note || null }), resolve ? 'Issue resolved' : 'Issue raised')}>
          {resolve ? 'Mark resolved' : 'Raise issue'}
        </Btn>
      }
    >
      {resolve && job.issueNote && <div className="rounded-xl bg-red-50 text-red-800 p-3 text-sm">{job.issueNote}</div>}
      {!resolve && job.closedAt && <div className="rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">This job is closed. Raising a snag reopens it so the problem can be put right.</div>}
      <Field label={resolve ? 'How was it resolved?' : 'What is the problem?'}>
        <textarea className={textareaCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function VariationModal({ open, onClose, job, onDone }: Base) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [approve, setApprove] = useState(true);
  const { busy, run } = useSubmit(onDone, onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add variation (extra / change)"
      footer={
        <Btn loading={busy} onClick={() => run(() => rabs.post(`/jobs/${job.id}/variations`, { description, netAmount: Number(amount), approve }), 'Variation added')}>
          Add variation
        </Btn>
      }
    >
      <Field label="Description">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Extra door bar for WC" />
      </Field>
      <Field label="Amount ex VAT (£)" hint="Use a minus amount for a reduction">
        <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ''))} />
      </Field>
      <Toggle checked={approve} onChange={setApprove} label="Customer has approved this (adds to the invoice now)" />
    </Modal>
  );
}

export function CloseModal({ open, onClose, job, onDone, force }: Base & { force: boolean }) {
  const [reason, setReason] = useState('');
  const { busy, run } = useSubmit(onDone, onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close job"
      footer={
        <Btn loading={busy} onClick={() => run(() => rabs.post(`/jobs/${job.id}/close`, force ? { force: true, reason } : {}), 'Job closed')}>
          Close job
        </Btn>
      }
    >
      {force ? (
        <>
          <div className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">This job is not fully paid. As an admin you can still close it — give a reason for the record.</div>
          <Field label="Reason">
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </>
      ) : (
        <p className="text-sm">All work is complete and the invoice is paid. Close {job.jobNumber}?</p>
      )}
    </Modal>
  );
}

export function CustomerModal({ open, onClose, customer, onDone }: { open: boolean; onClose: () => void; customer: any; onDone: () => void }) {
  const { meta } = useRabs();
  const [c, setC] = useState({ ...customer });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setC((p: any) => ({ ...p, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await rabs.patch(`/customers/${customer.id}`, {
        name: c.name,
        phone: c.phone || null,
        email: c.email || null,
        addressLine1: c.addressLine1 || null,
        addressLine2: c.addressLine2 || null,
        city: c.city || null,
        postcode: c.postcode || null,
        source: c.source || null,
        notes: c.notes || null
      });
      toast.success('Customer updated');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit customer"
      footer={
        <Btn loading={busy} onClick={save}>
          Save
        </Btn>
      }
    >
      <Field label="Name">
        <input className={inputCls} value={c.name || ''} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <input className={inputCls} value={c.phone || ''} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Email">
          <input className={inputCls} value={c.email || ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <input className={inputCls} value={c.addressLine1 || ''} onChange={(e) => set('addressLine1', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Town / city">
          <input className={inputCls} value={c.city || ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Postcode">
          <input className={inputCls} value={c.postcode || ''} onChange={(e) => set('postcode', e.target.value.toUpperCase())} />
        </Field>
      </div>
      <Field label="Source">
        <select className={inputCls} value={c.source || ''} onChange={(e) => set('source', e.target.value)}>
          <option value="">—</option>
          {meta?.leadSources.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Customer notes">
        <textarea className={textareaCls} value={c.notes || ''} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Modal>
  );
}
