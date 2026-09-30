/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarClock, Hammer, Truck } from 'lucide-react';
import clsx from 'clsx';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Spinner, inputCls } from '@/components/rabs/ui';
import { rabs, errMsg, fmtDate, fmtTime, isoDay, addDays } from '@/lib/rabs-api';

function monday(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  return addDays(day, -dow);
}

export default function DiaryPage() {
  const { meta } = useRabs();
  const [start, setStart] = useState(() => monday(isoDay()));
  const [staff, setStaff] = useState('');
  const [appts, setAppts] = useState<any[] | null>(null);
  const [work, setWork] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const end = addDays(start, 7);

  useEffect(() => {
    setAppts(null);
    Promise.all([
      rabs.get('/appointments', { from: new Date(`${start}T00:00:00`).toISOString(), to: new Date(`${end}T00:00:00`).toISOString() }),
      rabs.get('/reports/schedule', { from: start, to: addDays(end, -1) }).catch(() => ({ data: [] }))
    ])
      .then(([a, s]) => {
        setAppts(a);
        setWork(s.data || []);
        setError(null);
      })
      .catch((e) => setError(errMsg(e)));
  }, [start, end]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const today = isoDay();

  const itemsFor = (day: string) => {
    const a = (appts || [])
      .filter((x) => isoDay(new Date(x.scheduledAt)) === day && (!staff || x.staffUserId === staff))
      .map((x) => ({ kind: 'appt' as const, sort: fmtTime(x.scheduledAt), ...x }));
    const w = work
      .filter((x) => String(x.scheduledDate).slice(0, 10) === day && (!staff || String(x.staffUserId) === staff))
      .map((x) => ({ kind: x.type as 'fitting' | 'delivery', sort: x.slot === 'PM' ? '13:00' : x.slot === 'Evening' ? '18:00' : '08:00', ...x }));
    return [...a, ...w].sort((p, q) => p.sort.localeCompare(q.sort));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Diary</h1>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" size="sm" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
            <ChevronLeft size={16} />
          </Btn>
          <Btn variant="secondary" size="sm" onClick={() => setStart(monday(isoDay()))}>
            This week
          </Btn>
          <Btn variant="secondary" size="sm" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">
            <ChevronRight size={16} />
          </Btn>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="text-sm text-muted-foreground flex-1">
          {fmtDate(start)} – {fmtDate(addDays(end, -1))}
        </div>
        <select className={clsx(inputCls, 'sm:w-64')} value={staff} onChange={(e) => setStaff(e.target.value)}>
          <option value="">All staff</option>
          {(meta?.staff || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>}
      {!appts ? (
        <Spinner />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {days.map((d) => {
            const items = itemsFor(d);
            return (
              <Card key={d} title={<span className={d === today ? 'text-brand' : ''}>{fmtDate(d)}{d === today ? ' · Today' : ''}</span>} pad={false}>
                {items.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-muted-foreground">Free</div>
                ) : (
                  <div>
                    {items.map((it: any) => (
                      <Link key={`${it.kind}${it.id}`} href={`/rabs/jobs/${it.jobId}`} className="flex items-center gap-3 px-4 py-2.5 border-t border-border/60 hover:bg-muted/60">
                        <span className={clsx('h-9 w-9 shrink-0 rounded-lg flex items-center justify-center', it.kind === 'appt' ? 'bg-blue-100 text-blue-700' : it.kind === 'fitting' ? 'bg-brand/15 text-brand' : 'bg-teal-100 text-teal-700')}>
                          {it.kind === 'appt' ? <CalendarClock size={16} /> : it.kind === 'fitting' ? <Hammer size={16} /> : <Truck size={16} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">
                            {it.kind === 'appt' ? fmtTime(it.scheduledAt) : it.slot} · {it.customerName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate capitalize">
                            {it.kind === 'appt' ? 'Appointment' : it.kind} · {it.staffName || 'Unassigned'} · {it.address}
                          </div>
                        </div>
                        {it.status && it.kind !== 'appt' && <span className="text-[11px] text-muted-foreground capitalize">{String(it.status).replace('_', ' ')}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
