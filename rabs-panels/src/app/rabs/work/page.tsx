/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Hammer, Truck, MapPin, Phone, ChevronRight } from 'lucide-react';
import { Card, Empty, Spinner, Tabs } from '@/components/rabs/ui';
import { rabs, errMsg, fmtDate } from '@/lib/rabs-api';

type Scope = 'today' | 'upcoming' | 'all';

export default function MyWorkPage() {
  const [scope, setScope] = useState<Scope>('today');
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    rabs
      .get('/my-work', { scope })
      .then(setRows)
      .catch((e) => setError(errMsg(e)));
  }, [scope]);

  const byDay = new Map<string, any[]>();
  (rows || []).forEach((r) => {
    const d = String(r.scheduledDate).slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(r);
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight">My work</h1>
      <Tabs<Scope>
        value={scope}
        onChange={setScope}
        tabs={[
          { key: 'today', label: 'Today' },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'all', label: 'All' }
        ]}
      />
      {error && <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>}
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <Empty>{scope === 'today' ? 'Nothing booked for you today.' : 'No jobs assigned to you.'}</Empty>
        </Card>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <div key={day} className="space-y-2">
            <div className="text-sm font-bold text-muted-foreground">{fmtDate(day)}</div>
            {list.map((w) => (
              <Link key={w.id} href={`/rabs/jobs/${w.jobId}/work/${w.id}`} className="block rounded-2xl border border-border bg-card p-4 shadow-sm active:scale-[0.99] transition">
                <div className="flex items-start gap-3">
                  <div className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${w.type === 'fitting' ? 'bg-brand/15 text-brand' : 'bg-blue-100 text-blue-700'}`}>
                    {w.type === 'fitting' ? <Hammer size={22} /> : <Truck size={22} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-lg truncate">{w.customerName}</div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${w.status === 'complete' ? 'bg-emerald-100 text-emerald-800' : w.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                        {String(w.status).replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {w.type} · {w.slot || 'Any time'} · {w.jobNumber}
                    </div>
                    <div className="text-sm mt-1 flex items-center gap-1.5">
                      <MapPin size={14} className="shrink-0 text-muted-foreground" /> <span className="truncate">{w.address}</span>
                    </div>
                    {w.customerPhone && (
                      <div className="text-sm flex items-center gap-1.5">
                        <Phone size={14} className="text-muted-foreground" /> {w.customerPhone}
                      </div>
                    )}
                    {w.instructions && <div className="text-xs mt-1 rounded-lg bg-amber-50 text-amber-900 px-2 py-1">{w.instructions}</div>}
                  </div>
                  <ChevronRight className="text-muted-foreground shrink-0 self-center" />
                </div>
              </Link>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
