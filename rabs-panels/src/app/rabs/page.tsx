/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, CalendarClock, Truck, Hammer, Wallet, HardHat, HelpCircle, X } from 'lucide-react';
import { useRabs } from '@/components/rabs/shell';
import { Card, Empty, Spinner, StatusBadge } from '@/components/rabs/ui';
import { JobRow } from '@/components/rabs/job-row';
import { rabs, errMsg, gbp, fmtTime, fmtDate } from '@/lib/rabs-api';

const HELP_KEY = 'rabs_help_seen';

const OFFICE_STEPS = [
  ['New enquiry', 'Type the customer once and book the visit.'],
  ['Open the job', 'The big green button always shows the next step — just press it.'],
  ['Measure', 'Add each room, pick the product, tick accessories, take photos.'],
  ['Quote', 'Built for you from the rooms. Send it, then accept to create the job.'],
  ['Deposit → materials → fitting', 'Take the deposit, check stock, book the fitting or delivery.'],
  ['Balance → closed', 'After sign-off, collect the balance. The job closes when fully paid.']
];
const FIELD_STEPS = [
  ['My work', 'Your fittings and deliveries, today first.'],
  ['On site', 'Press START, tick the checklist, take before and after photos.'],
  ['Finish', 'Customer signs on the phone, then press COMPLETE.'],
  ['Problem?', 'Press Report a problem — the office sees it straight away.']
];

function HowItWorks({ office, onClose }: { office: boolean; onClose: () => void }) {
  const steps = office ? OFFICE_STEPS : FIELD_STEPS;
  return (
    <div className="rounded-2xl border-2 border-brand/40 bg-brand/5 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-lg font-extrabold">How it works</div>
        <button onClick={onClose} className="p-2 -m-2 rounded-lg hover:bg-muted" aria-label="Close help">
          <X size={18} />
        </button>
      </div>
      <ol className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="h-7 w-7 shrink-0 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
            <span className="text-sm">
              <b>{t}</b>
              <span className="block text-muted-foreground">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <button onClick={onClose} className="mt-4 h-11 px-5 rounded-xl bg-brand text-white font-bold">
        Got it
      </button>
    </div>
  );
}

export default function RabsHome() {
  const { can } = useRabs();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    rabs.get('/dashboard').then(setD).catch((e) => setError(errMsg(e)));
    setHelp(localStorage.getItem(HELP_KEY) !== '1');
  }, []);

  if (error) return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  if (!d) return <Spinner />;

  const office = can('customers');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{greeting()}</h1>
          <p className="text-sm text-muted-foreground">{fmtDate(d.today)}</p>
        </div>
        {!help && (
          <button onClick={() => setHelp(true)} className="ml-auto md:ml-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted">
            <HelpCircle size={16} /> How it works
          </button>
        )}
        {office && (
          <Link href="/rabs/new" className="hidden md:inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-brand text-white font-bold shadow-lg shadow-brand/30 hover:bg-brand-600">
            <Plus size={18} /> New enquiry
          </Link>
        )}
      </div>

      {office && (
        <Link href="/rabs/new" className="md:hidden flex items-center justify-center gap-2 h-14 rounded-2xl bg-brand text-white text-lg font-extrabold shadow-lg shadow-brand/30">
          <Plus size={22} /> NEW ENQUIRY
        </Link>
      )}

      {help && (
        <HowItWorks
          office={office}
          onClose={() => {
            localStorage.setItem(HELP_KEY, '1');
            setHelp(false);
          }}
        />
      )}

      {d.myWork?.length > 0 && (
        <Card title="My work" actions={<Link href="/rabs/work" className="text-sm font-semibold text-brand">View all</Link>}>
          <div className="space-y-2">
            {d.myWork.slice(0, 5).map((w: any) => (
              <Link key={w.id} href={`/rabs/jobs/${w.jobId}/work/${w.id}`} className="flex items-center gap-3 rounded-xl border border-border px-3 py-3 hover:bg-muted">
                <HardHat size={20} className="text-brand shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">
                    {w.customerName} · <span className="capitalize">{w.type}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {fmtDate(w.scheduledDate)} {w.slot} · {w.address}
                  </div>
                </div>
                <span className="text-xs font-semibold capitalize text-muted-foreground">{String(w.status).replace('_', ' ')}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {office && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<CalendarClock size={18} />} label="Appointments today" value={d.appointmentsToday.length} href="/rabs/diary" />
          <Stat icon={<Hammer size={18} />} label="Fittings / deliveries today" value={d.workToday.length} href="/rabs/diary" />
          <Stat icon={<Truck size={18} />} label="Materials to order" value={d.byStatus.find((s: any) => s.code === 'MATERIALS_PENDING')?.count ?? 0} href="/rabs/jobs?status=MATERIALS_PENDING" />
          {d.outstanding ? (
            <Stat icon={<Wallet size={18} />} label={`Outstanding (${d.outstanding.jobs} jobs)`} value={gbp(d.outstanding.total)} href="/rabs/reports?tab=outstanding" />
          ) : (
            <Stat icon={<Wallet size={18} />} label="Open jobs" value={d.byStatus.filter((s: any) => s.code !== 'CLOSED').reduce((a: number, s: any) => a + s.count, 0)} href="/rabs/jobs" />
          )}
        </div>
      )}

      {office && (
        <Card title="Pipeline">
          <div className="flex flex-wrap gap-2">
            {d.byStatus
              .filter((s: any) => s.count > 0)
              .map((s: any) => (
                <Link key={s.code} href={`/rabs/jobs?status=${s.code}`} className="inline-flex items-center gap-2 rounded-full border border-border pl-1 pr-3 py-1 hover:bg-muted">
                  <StatusBadge size="sm" label={String(s.count)} color={s.color} textColor={s.textColor} />
                  <span className="text-sm font-medium">{s.label}</span>
                </Link>
              ))}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {office && (
          <Card title="Today" pad={false}>
            {d.appointmentsToday.length === 0 && d.workToday.length === 0 ? (
              <Empty>Nothing booked for today.</Empty>
            ) : (
              <div>
                {d.appointmentsToday.map((a: any) => (
                  <Link key={`a${a.id}`} href={`/rabs/jobs/${a.jobId}`} className="flex items-center gap-3 px-4 py-3 border-b border-border/60 hover:bg-muted/60">
                    <span className="text-sm font-bold w-12 shrink-0">{fmtTime(a.scheduledAt)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{a.customerName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Appointment · {a.staffName || 'Unassigned'} · {a.address}
                      </div>
                    </div>
                  </Link>
                ))}
                {d.workToday.map((b: any) => (
                  <Link key={`b${b.id}`} href={`/rabs/jobs/${b.jobId}`} className="flex items-center gap-3 px-4 py-3 border-b border-border/60 last:border-0 hover:bg-muted/60">
                    <span className="text-sm font-bold w-12 shrink-0">{b.slot}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{b.customerName}</div>
                      <div className="text-xs text-muted-foreground truncate capitalize">
                        {b.type} · {b.staffName || 'Unassigned'} · {b.status.replace('_', ' ')}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}
        {office && (
          <Card title="Needs action" pad={false} actions={<Link href="/rabs/jobs" className="text-sm font-semibold text-brand">All jobs</Link>}>
            {d.needsAction.length === 0 ? <Empty>All caught up.</Empty> : d.needsAction.map((j: any) => <JobRow key={j.id} j={j} />)}
          </Card>
        )}
      </div>

      {!office && d.myWork?.length === 0 && (
        <Card>
          <Empty>No upcoming work assigned to you.</Empty>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-border bg-card p-4 hover:shadow-md transition">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold">
        <span className="text-brand">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
    </Link>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
