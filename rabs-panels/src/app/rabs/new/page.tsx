/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { UserCheck, AlertTriangle } from 'lucide-react';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Field, Toggle, inputCls, textareaCls } from '@/components/rabs/ui';
import { rabs, errMsg, addDays, isoDay } from '@/lib/rabs-api';

const DRAFT_KEY = 'rabs_enquiry_draft';

type Form = {
  name: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  source: string;
  notes: string;
  title: string;
  bookAppt: boolean;
  apptDate: string;
  apptTime: string;
  purpose: string;
  staffUserId: string;
  apptNotes: string;
};

const blank = (): Form => ({
  name: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  city: 'Stoke-on-Trent',
  postcode: '',
  source: '',
  notes: '',
  title: '',
  bookAppt: true,
  apptDate: addDays(isoDay(), 1),
  apptTime: '10:00',
  purpose: 'measure',
  staffUserId: '',
  apptNotes: ''
});

export default function NewEnquiryPage() {
  const { meta } = useRabs();
  const router = useRouter();
  const [f, setF] = useState<Form>(blank);
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dups, setDups] = useState<any[]>([]);
  const [existing, setExisting] = useState<any | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && (d.name || d.phone)) {
          setF({ ...blank(), ...d });
          setRestored(true);
        }
      }
    } catch {
      /* ignore bad draft */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(f)), 400);
    return () => clearTimeout(t);
  }, [f]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const surveyors = useMemo(() => {
    const s = (meta?.staff || []).filter((u) => u.status === 'active');
    const rank = (u: any) => (u.roles.includes('SURVEYOR') || u.roles.includes('SALES_REP') ? 0 : u.roles.some((r: string) => ['ADMIN', 'OFFICE', 'SUPER_ADMIN'].includes(r)) ? 1 : 2);
    return s.filter((u) => rank(u) < 2).sort((a, b) => rank(a) - rank(b));
  }, [meta]);

  const checkDuplicates = async () => {
    if (existing) return;
    const phone = f.phone.trim();
    const email = f.email.trim();
    if (phone.replace(/\D/g, '').length < 7 && !email.includes('@')) return;
    try {
      setDups(await rabs.get('/customers/duplicates', { phone: phone || undefined, email: email || undefined }));
    } catch {
      /* non-blocking */
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!existing) {
      if (f.name.trim().length < 2) e.name = 'Enter the customer name';
      if (!f.phone.trim() && !f.email.trim()) e.phone = 'Enter a phone number or email';
      if (f.phone.trim() && !/^[+\d][\d\s()-]{6,}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number';
      if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
      if (f.postcode.trim() && !/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(f.postcode.trim())) e.postcode = 'Enter a valid UK postcode';
    }
    if (f.bookAppt && (!f.apptDate || !f.apptTime)) e.apptDate = 'Choose a date and time';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (allowDuplicate = false) => {
    if (!validate()) {
      toast.error('Please check the highlighted fields');
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        title: f.title.trim() || null,
        notes: f.notes.trim() || null,
        allowDuplicate,
        appointment: f.bookAppt
          ? { scheduledAt: new Date(`${f.apptDate}T${f.apptTime}`).toISOString(), purpose: f.purpose, staffUserId: f.staffUserId || null, notes: f.apptNotes.trim() || null }
          : null
      };
      if (existing) body.customerId = existing.id;
      else
        body.customer = {
          name: f.name.trim(),
          phone: f.phone.trim() || null,
          email: f.email.trim() || null,
          addressLine1: f.addressLine1.trim() || null,
          addressLine2: f.addressLine2.trim() || null,
          city: f.city.trim() || null,
          postcode: f.postcode.trim().toUpperCase() || null,
          source: f.source || null
        };
      const res = await rabs.post('/enquiries', body);
      localStorage.removeItem(DRAFT_KEY);
      toast.success(`Job ${res.job.jobNumber} created`);
      router.push(`/rabs/jobs/${res.job.id}`);
    } catch (e: any) {
      if (e?.response?.status === 409 && e.response.data?.error?.details?.duplicates) {
        setDups(e.response.data.error.details.duplicates);
        toast.warning('This customer may already exist — see below');
      } else {
        const fields = e?.response?.data?.error?.fields;
        if (fields) {
          const map: Record<string, string> = {};
          Object.entries(fields).forEach(([k, v]: any) => (map[k] = Array.isArray(v) ? v[0] : String(v)));
          setErrors(map);
        }
        toast.error(errMsg(e));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">New enquiry</h1>
        {restored && (
          <button
            className="text-sm text-muted-foreground underline"
            onClick={() => {
              setF(blank());
              setRestored(false);
              setExisting(null);
              setDups([]);
              localStorage.removeItem(DRAFT_KEY);
            }}
          >
            Clear draft
          </button>
        )}
      </div>
      {restored && <div className="rounded-xl bg-amber-50 text-amber-800 text-sm px-3 py-2">Your unsaved enquiry was restored.</div>}

      <Card title="Customer">
        {existing ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <UserCheck className="text-emerald-600" />
              <div>
                <div className="font-bold">{existing.name}</div>
                <div className="text-xs text-muted-foreground">{[existing.phone, existing.email, existing.postcode].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <Btn size="sm" variant="secondary" onClick={() => setExisting(null)}>
              Change
            </Btn>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Customer name *" error={errors.name} className="sm:col-span-2">
              <input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Mr John Smith" autoComplete="off" />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <input className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} onBlur={checkDuplicates} inputMode="tel" placeholder="07…" />
            </Field>
            <Field label="Email" error={errors.email}>
              <input className={inputCls} value={f.email} onChange={(e) => set('email', e.target.value)} onBlur={checkDuplicates} inputMode="email" type="email" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <input className={inputCls} value={f.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} placeholder="House number & street" />
            </Field>
            <Field label="Address line 2">
              <input className={inputCls} value={f.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
            </Field>
            <Field label="Town / city">
              <input className={inputCls} value={f.city} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field label="Postcode" error={errors.postcode}>
              <input className={inputCls} value={f.postcode} onChange={(e) => set('postcode', e.target.value.toUpperCase())} placeholder="ST6 3HF" autoCapitalize="characters" />
            </Field>
            <Field label="How did they find us?">
              <select className={inputCls} value={f.source} onChange={(e) => set('source', e.target.value)}>
                <option value="">Choose…</option>
                {meta?.leadSources.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {!existing && dups.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
              <AlertTriangle size={16} /> Possible existing customer
            </div>
            {dups.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 dark:bg-black/20 px-3 py-2">
                <div className="text-sm">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{[d.phone, d.email, d.postcode].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="flex gap-2">
                  {d.jobId && (
                    <Link href={`/rabs/jobs/${d.jobId}`} className="text-sm font-semibold underline">
                      Open job
                    </Link>
                  )}
                  <Btn
                    size="sm"
                    onClick={() => {
                      setExisting(d);
                      setDups([]);
                    }}
                  >
                    Use this customer
                  </Btn>
                </div>
              </div>
            ))}
            <Btn size="sm" variant="secondary" loading={saving} onClick={() => submit(true)}>
              Not the same person — create anyway
            </Btn>
          </div>
        )}
      </Card>

      <Card title="Enquiry">
        <div className="space-y-4">
          <Field label="What are they looking for?" hint="e.g. Carpet for lounge & stairs, new bed">
            <input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Notes">
            <textarea className={textareaCls} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the surveyor should know (parking, pets, access)…" />
          </Field>
        </div>
      </Card>

      <Card title="Appointment">
        <div className="space-y-4">
          <Toggle checked={f.bookAppt} onChange={(v) => set('bookAppt', v)} label={<span className="font-semibold">Book a home visit now</span>} />
          {f.bookAppt && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Date *" error={errors.apptDate}>
                <input type="date" className={inputCls} value={f.apptDate} onChange={(e) => set('apptDate', e.target.value)} />
              </Field>
              <Field label="Time *">
                <input type="time" step={900} className={inputCls} value={f.apptTime} onChange={(e) => set('apptTime', e.target.value)} />
              </Field>
              <Field label="Purpose">
                <select className={inputCls} value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
                  {meta?.appointmentPurposes.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Surveyor">
                <select className={inputCls} value={f.staffUserId} onChange={(e) => set('staffUserId', e.target.value)}>
                  <option value="">Unassigned</option>
                  {surveyors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Appointment notes" className="sm:col-span-2">
                <input className={inputCls} value={f.apptNotes} onChange={(e) => set('apptNotes', e.target.value)} placeholder="e.g. Park on the drive" />
              </Field>
            </div>
          )}
        </div>
      </Card>

      <div className="sticky bottom-20 md:bottom-4 z-10">
        <Btn size="lg" className="w-full text-lg" loading={saving} onClick={() => submit(false)}>
          {f.bookAppt ? 'SAVE & BOOK APPOINTMENT' : 'SAVE ENQUIRY'}
        </Btn>
      </div>
    </div>
  );
}
