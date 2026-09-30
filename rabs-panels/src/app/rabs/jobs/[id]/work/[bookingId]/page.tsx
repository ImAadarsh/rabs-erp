/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Check, ImagePlus, MapPin, Phone, Play, AlertTriangle, CheckCircle2, Hammer, Truck } from 'lucide-react';
import clsx from 'clsx';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Field, Spinner, inputCls, textareaCls } from '@/components/rabs/ui';
import { IssueModal } from '@/components/rabs/job-modals';
import { SignaturePad, type SignaturePadHandle } from '@/components/rabs/signature-pad';
import { Thumbs } from '@/components/rabs/thumbs';
import { rabs, errMsg, fmtDate, num, UNIT_LABEL } from '@/lib/rabs-api';

export default function WorkPage() {
  const { id, bookingId } = useParams<{ id: string; bookingId: string }>();
  const router = useRouter();
  const { can } = useRabs();
  const [agg, setAgg] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Array<{ label: string; done: boolean }>>([]);
  const [notes, setNotes] = useState('');
  const [signedName, setSignedName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [issue, setIssue] = useState(false);
  const sigRef = useRef<SignaturePadHandle>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const galleryKind = useRef<'before' | 'after'>('after');
  const init = useRef(false);

  const load = useCallback(async () => {
    try {
      const a = await rabs.get(`/jobs/${id}`);
      setAgg(a);
      const b = a.bookings.find((x: any) => x.id === bookingId);
      if (b && !init.current) {
        setChecklist(b.checklist || []);
        setNotes(b.completionNotes || '');
        setSignedName(b.signedName || a.customer.name || '');
        init.current = true;
      }
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id, bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!agg) return <Spinner />;

  const booking = agg.bookings.find((x: any) => x.id === bookingId);
  if (!booking) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">This booking was not found.</div>;

  const { customer, job, measurement } = agg;
  const done = booking.status === 'complete';
  const rooms: any[] = measurement?.rooms || [];
  const before = booking.photos.filter((p: any) => p.kind === 'before');
  const after = booking.photos.filter((p: any) => p.kind === 'after');
  const doneCount = checklist.filter((c) => c.done).length;
  const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(agg.siteAddress || '')}`;

  const step = async (key: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(key);
    try {
      await fn();
      if (msg) toast.success(msg);
      await load();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (i: number) => {
    const next = checklist.map((c, j) => (j === i ? { ...c, done: !c.done } : c));
    setChecklist(next);
    try {
      await rabs.put(`/bookings/${booking.id}/checklist`, { checklist: next });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const saveNotes = async () => {
    if (notes === (booking.completionNotes || '')) return;
    try {
      await rabs.put(`/bookings/${booking.id}/checklist`, { checklist, notes: notes || null });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const upload = (kind: 'before' | 'after', files: FileList | null) => {
    if (!files?.length) return;
    step(`photo-${kind}`, () => rabs.upload(`/bookings/${booking.id}/photos`, Array.from(files), { kind }), `${files.length} ${kind} photo(s) uploaded`);
  };

  const complete = async () => {
    if (after.length === 0) return toast.error('Take at least one "after" photo first');
    if (!booking.signatureFileId) {
      if (!sigRef.current || sigRef.current.isEmpty()) return toast.error('Ask the customer to sign in the box first');
      if (signedName.trim().length < 2) return toast.error('Enter the name of the person signing');
      const ok = await step('sign', () => rabs.post(`/bookings/${booking.id}/signature`, { dataUrl: sigRef.current!.toDataURL(), signedName: signedName.trim() }));
      if (!ok) return;
    }
    const ok = await step('complete', () => rabs.post(`/bookings/${booking.id}/complete`, { notes: notes || null }), `${booking.type === 'fitting' ? 'Fitting' : 'Delivery'} complete — thank you!`);
    if (ok) router.push(can('customers') ? `/rabs/jobs/${id}` : '/rabs/work');
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={can('customers') ? `/rabs/jobs/${id}` : '/rabs/work'} className="h-10 w-10 shrink-0 rounded-xl border border-border flex items-center justify-center hover:bg-muted" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight capitalize flex items-center gap-2">
            {booking.type === 'fitting' ? <Hammer size={20} /> : <Truck size={20} />} {booking.type}
          </h1>
          <div className="text-sm text-muted-foreground">
            {fmtDate(booking.scheduledDate)} {booking.slot} · {job.jobNumber}
          </div>
        </div>
        <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full capitalize', done ? 'bg-emerald-100 text-emerald-800' : booking.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800')}>
          {String(booking.status).replace('_', ' ')}
        </span>
      </div>

      <Card>
        <div className="font-bold text-lg">{customer.name}</div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {customer.phone && (
            <a href={`tel:${customer.phone.replace(/\s/g, '')}`} className="flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-600 text-white font-bold">
              <Phone size={18} /> Call
            </a>
          )}
          <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-blue-600 text-white font-bold">
            <MapPin size={18} /> Directions
          </a>
        </div>
        <div className="text-sm text-muted-foreground mt-3">{agg.siteAddress}</div>
        {booking.instructions && <div className="mt-3 rounded-xl bg-amber-50 text-amber-900 px-3 py-2 text-sm">{booking.instructions}</div>}
        {measurement?.notes && <div className="mt-2 text-sm text-muted-foreground">Survey notes: {measurement.notes}</div>}
      </Card>

      {!done && booking.status === 'booked' && (
        <Btn size="lg" className="w-full text-lg" icon={<Play size={20} />} loading={busy === 'start'} onClick={() => step('start', () => rabs.post(`/bookings/${booking.id}/start`), 'Started — good luck!')}>
          START {booking.type === 'fitting' ? 'FITTING' : 'DELIVERY'}
        </Btn>
      )}

      <Card title={booking.type === 'fitting' ? 'Rooms to fit' : 'Items to deliver'}>
        <div className="space-y-2">
          {rooms.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-3">
              <div className="flex justify-between gap-2">
                <div className="font-bold">{r.name}</div>
                {r.areaM2 > 0 && <div className="text-sm font-semibold">{num(r.areaM2)} m²</div>}
              </div>
              <div className="text-sm text-muted-foreground">
                {r.areaM2 > 0 ? `${num(r.lengthM)} × ${num(r.widthM)} m` : ''}
                {r.stairs ? ` · ${r.stairs} stairs` : ''}
                {r.doors ? ` · ${r.doors} door${r.doors > 1 ? 's' : ''}` : ''}
              </div>
              <div className="text-sm mt-1">
                {r.product ? `${r.product.name}${r.product.colour ? ` — ${r.product.colour}` : ''}` : '—'}
                {r.productQty ? ` × ${num(r.productQty)} ${UNIT_LABEL[r.product?.unit] || ''}` : ''}
              </div>
              {r.accessories.length > 0 && <div className="text-xs text-muted-foreground">{r.accessories.map((a: any) => `${a.name} ${num(a.qty)} ${UNIT_LABEL[a.unit] || a.unit}`).join(' · ')}</div>}
              {r.notes && <div className="text-xs italic text-muted-foreground mt-0.5">{r.notes}</div>}
              {r.photos.length > 0 && <Thumbs photos={r.photos} />}
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Checklist ${doneCount}/${checklist.length}`}>
        <div className="space-y-2">
          {checklist.map((c, i) => (
            <button
              key={i}
              type="button"
              disabled={done}
              onClick={() => toggle(i)}
              className={clsx('w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition', c.done ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border')}
            >
              <span className={clsx('h-7 w-7 shrink-0 rounded-lg border-2 flex items-center justify-center', c.done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-border')}>{c.done && <Check size={18} />}</span>
              <span className={clsx('text-sm font-medium', c.done && 'line-through text-muted-foreground')}>{c.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <PhotoBox title="Before" photos={before} busy={busy === 'photo-before'} disabled={done} onAdd={() => beforeRef.current?.click()} onGallery={() => ((galleryKind.current = 'before'), galleryRef.current?.click())} />
        <PhotoBox title="After" photos={after} busy={busy === 'photo-after'} disabled={done} required onAdd={() => afterRef.current?.click()} onGallery={() => ((galleryKind.current = 'after'), galleryRef.current?.click())} />
      </div>
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => (upload(galleryKind.current, e.target.files), (e.target.value = ''))} />
      <input ref={beforeRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => (upload('before', e.target.files), (e.target.value = ''))} />
      <input ref={afterRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => (upload('after', e.target.files), (e.target.value = ''))} />

      <Card title="Notes">
        <textarea className={textareaCls} value={notes} disabled={done} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Anything the office should know (extra work, snags, leftovers)…" />
      </Card>

      <Card title="Customer sign-off">
        {booking.signatureUrl ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={booking.signatureUrl} alt="Customer signature" className="w-full max-h-48 object-contain rounded-xl border border-border bg-white" />
            <div className="text-sm text-muted-foreground">
              Signed by <b className="text-foreground">{booking.signedName}</b>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">I confirm the work has been completed to my satisfaction.</p>
            <SignaturePad ref={sigRef} />
            <div className="flex gap-2 items-end">
              <Field label="Name of person signing" className="flex-1">
                <input className={inputCls} value={signedName} onChange={(e) => setSignedName(e.target.value)} />
              </Field>
              <Btn variant="secondary" className="h-12" onClick={() => sigRef.current?.clear()}>
                Clear
              </Btn>
            </div>
          </div>
        )}
      </Card>

      {!done ? (
        <div className="space-y-2">
          <Btn variant="success" size="lg" className="w-full text-lg" icon={<CheckCircle2 size={20} />} loading={busy === 'complete' || busy === 'sign'} onClick={complete}>
            COMPLETE {booking.type === 'fitting' ? 'FITTING' : 'DELIVERY'}
          </Btn>
          <Btn variant="secondary" className="w-full" icon={<AlertTriangle size={16} />} onClick={() => setIssue(true)}>
            Report a problem
          </Btn>
        </div>
      ) : (
        <div className="rounded-2xl bg-emerald-600 text-white p-5 text-center font-bold text-lg">
          <CheckCircle2 className="inline mr-2" /> Completed {booking.completedAt ? fmtDate(booking.completedAt) : ''}
        </div>
      )}

      {issue && <IssueModal open onClose={() => setIssue(false)} job={job} onDone={() => load()} />}
    </div>
  );
}

function PhotoBox({
  title,
  photos,
  busy,
  disabled,
  required,
  onAdd,
  onGallery
}: {
  title: string;
  photos: any[];
  busy: boolean;
  disabled: boolean;
  required?: boolean;
  onAdd: () => void;
  onGallery: () => void;
}) {
  return (
    <Card title={`${title} (${photos.length})`}>
      {photos.length > 0 && <Thumbs photos={photos} />}
      {required && !disabled && photos.length === 0 && <div className="text-xs text-amber-700 font-semibold">Needed before completing</div>}
      {!disabled && (
        <div className="space-y-2 mt-2">
          <Btn variant="secondary" className="w-full" icon={<Camera size={16} />} loading={busy} onClick={onAdd}>
            {title} photo
          </Btn>
          <Btn variant="secondary" size="sm" className="w-full" icon={<ImagePlus size={14} />} disabled={busy} onClick={onGallery}>
            From phone
          </Btn>
        </div>
      )}
    </Card>
  );
}
