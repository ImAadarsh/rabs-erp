/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useRabs } from '@/components/rabs/shell';
import { Btn, Card, Empty, Spinner, inputCls } from '@/components/rabs/ui';
import { JobRow } from '@/components/rabs/job-row';
import { rabs, errMsg } from '@/lib/rabs-api';

export default function JobsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <JobsList />
    </Suspense>
  );
}

function JobsList() {
  const { meta } = useRabs();
  const router = useRouter();
  const sp = useSearchParams();
  const status = sp.get('status') || '';
  const [q, setQ] = useState(sp.get('q') || '');
  const [open, setOpen] = useState(sp.get('open') !== '0');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ data: any[]; total: number; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await rabs.get('/jobs', { status: status || undefined, q: q.trim() || undefined, open: !status && open ? '1' : undefined, sort, page, limit: 30 }));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [status, q, open, sort, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const setStatus = (code: string) => {
    setPage(1);
    router.replace(code ? `/rabs/jobs?status=${code}` : '/rabs/jobs');
  };

  const statuses = (meta?.statuses || []).filter((s) => s.isActive !== false);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Jobs</h1>
        <span className="text-sm text-muted-foreground">{data ? `${data.total} found` : ''}</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 md:mx-0 md:px-0 md:flex-wrap">
        <Chip active={!status} onClick={() => setStatus('')} color="#111827">
          All
        </Chip>
        {statuses.map((s) => (
          <Chip key={s.code} active={status === s.code} onClick={() => setStatus(s.code)} color={s.color} textColor={s.textColor}>
            {s.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by name, phone, postcode, job / quote / invoice no."
          className={inputCls}
        />
        <div className="flex gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={clsx(inputCls, 'sm:w-44')}>
            <option value="recent">Recently updated</option>
            <option value="oldest">Oldest first</option>
            <option value="balance">Highest balance</option>
          </select>
          {!status && (
            <Btn variant={open ? 'primary' : 'secondary'} className="h-12 whitespace-nowrap" onClick={() => setOpen((v) => !v)}>
              {open ? 'Open only' : 'Incl. closed'}
            </Btn>
          )}
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>}
      <Card pad={false}>{!data ? <Spinner /> : data.data.length === 0 ? <Empty>No jobs match.</Empty> : data.data.map((j) => <JobRow key={j.id} j={j} />)}</Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Btn variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Btn>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Btn variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Btn>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, color, textColor, children }: { active: boolean; onClick: () => void; color: string; textColor?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx('shrink-0 h-9 px-3.5 rounded-full text-sm font-semibold border transition whitespace-nowrap', active ? 'shadow' : 'bg-card border-border text-foreground/80 hover:bg-muted')}
      style={active ? { backgroundColor: color, borderColor: color, color: textColor || '#fff' } : undefined}
    >
      {!active && <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}
