/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRabs } from '@/components/rabs/shell';
import { Card, Empty, Field, Spinner, StatusBadge, Tabs, inputCls } from '@/components/rabs/ui';
import { JobRow } from '@/components/rabs/job-row';
import { rabs, errMsg, gbp, num, fmtDate, isoDay, addDays } from '@/lib/rabs-api';

type Tab = 'pipeline' | 'sales' | 'outstanding' | 'schedule' | 'purchasing';

export default function ReportsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'pipeline');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'pipeline', label: 'Pipeline' },
          { key: 'sales', label: 'Sales' },
          { key: 'outstanding', label: 'Outstanding' },
          { key: 'schedule', label: 'Fitter schedule' },
          { key: 'purchasing', label: 'To order' }
        ]}
      />
      {tab === 'pipeline' && <Pipeline />}
      {tab === 'sales' && <Sales />}
      {tab === 'outstanding' && <Outstanding />}
      {tab === 'schedule' && <Schedule />}
      {tab === 'purchasing' && <Purchasing />}
    </div>
  );
}

function useReport<T = any>(path: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params || {});
  useEffect(() => {
    setData(null);
    rabs
      .get<T>(path, params)
      .then(setData)
      .catch((e) => setError(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return { data, error };
}

function Err({ e }: { e: string | null }) {
  return e ? <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{e}</div> : null;
}

function Pipeline() {
  const { data, error } = useReport<any[]>('/reports/pipeline');
  if (error) return <Err e={error} />;
  if (!data) return <Spinner />;
  const max = Math.max(1, ...data.map((s) => s.count));
  const open = data.filter((s) => s.code !== 'CLOSED');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Open jobs" value={open.reduce((a, s) => a + s.count, 0)} />
        <Kpi label="Open value" value={gbp(open.reduce((a, s) => a + (s.value || 0), 0))} />
        <Kpi label="Quotes out" value={data.filter((s) => ['QUOTE_DRAFT', 'QUOTE_SENT'].includes(s.code)).reduce((a, s) => a + s.count, 0)} />
        <Kpi label="Closed" value={data.find((s) => s.code === 'CLOSED')?.count ?? 0} />
      </div>
      <Card title="Jobs by status">
        <div className="space-y-2">
          {data.map((s) => (
            <Link key={s.code} href={`/rabs/jobs?status=${s.code}`} className="flex items-center gap-3 group">
              <span className="w-40 shrink-0 text-sm truncate group-hover:underline">{s.label}</span>
              <div className="flex-1 h-7 rounded-lg bg-muted overflow-hidden">
                <div className="h-full rounded-lg flex items-center px-2 text-xs font-bold" style={{ width: `${Math.max(s.count ? 8 : 0, (s.count / max) * 100)}%`, backgroundColor: s.color, color: s.textColor }}>
                  {s.count || ''}
                </div>
              </div>
              <span className="w-24 text-right text-sm text-muted-foreground">{s.value !== undefined ? gbp(s.value) : ''}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Sales() {
  const { can } = useRabs();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(isoDay());
  const { data, error } = useReport<any>('/reports/sales', { from, to });
  const canCost = can('view_costs');
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Field label="From">
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <Err e={error} />
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Accepted quotes" value={data.totals.quotes} />
            <Kpi label="Sales inc VAT" value={gbp(data.totals.gross)} />
            <Kpi label="Sales ex VAT" value={gbp(data.totals.net)} />
            {canCost && data.totals.margin !== undefined ? (
              <Kpi label="Margin" value={gbp(data.totals.margin)} />
            ) : (
              <Kpi label="Conversion" value={data.conversion.quoted ? `${Math.round((data.conversion.accepted / data.conversion.quoted) * 100)}%` : '—'} />
            )}
          </div>
          <Card title={`Conversion: ${data.conversion.accepted} of ${data.conversion.quoted} quotes accepted`} pad={false}>
            <Table
              head={['Month', 'Quotes', 'Ex VAT', 'Inc VAT', ...(canCost ? ['Margin'] : [])]}
              rows={data.byMonth.map((m: any) => [m.month, m.quotes, gbp(m.net), gbp(m.gross), ...(canCost ? [gbp(m.margin)] : [])])}
              empty="No accepted quotes in this period."
            />
          </Card>
          <Card title="By salesperson" pad={false}>
            <Table
              head={['Staff', 'Quotes', 'Ex VAT', 'Inc VAT', ...(canCost ? ['Margin'] : [])]}
              rows={data.byStaff.map((m: any) => [m.name || '—', m.quotes, gbp(m.net), gbp(m.gross), ...(canCost ? [gbp(m.margin)] : [])])}
              empty="No data."
            />
          </Card>
        </>
      )}
    </div>
  );
}

function Outstanding() {
  const { data, error } = useReport<any>('/reports/outstanding');
  if (error) return <Err e={error} />;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Kpi label="Jobs with a balance" value={data.data.length} />
        <Kpi label="Total outstanding" value={gbp(data.total)} />
      </div>
      <Card pad={false}>{data.data.length === 0 ? <Empty>Nothing outstanding.</Empty> : data.data.map((j: any) => <JobRow key={j.id} j={j} />)}</Card>
    </div>
  );
}

function Schedule() {
  const [from, setFrom] = useState(isoDay());
  const { data, error } = useReport<any>('/reports/schedule', { from, to: addDays(from, 13) });
  if (error) return <Err e={error} />;
  const byStaff = new Map<string, any[]>();
  (data?.data || []).forEach((r: any) => {
    const k = r.staffName || 'Unassigned';
    if (!byStaff.has(k)) byStaff.set(k, []);
    byStaff.get(k)!.push(r);
  });
  return (
    <div className="space-y-4">
      <Field label="Starting" className="max-w-xs">
        <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      {!data ? (
        <Spinner />
      ) : byStaff.size === 0 ? (
        <Card>
          <Empty>Nothing booked in the next 14 days.</Empty>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {[...byStaff.entries()].map(([name, rows]) => (
            <Card key={name} title={`${name} (${rows.length})`} pad={false}>
              {rows.map((r) => (
                <Link key={r.id} href={`/rabs/jobs/${r.jobId}`} className="flex items-center gap-3 px-4 py-2.5 border-t border-border/60 hover:bg-muted/60 text-sm">
                  <span className="w-28 shrink-0 font-semibold">
                    {fmtDate(r.scheduledDate).replace(/ \d{4}$/, '')} {r.slot}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    {r.customerName} · <span className="capitalize text-muted-foreground">{r.type}</span>
                  </span>
                  <span className="text-xs text-muted-foreground capitalize">{String(r.status).replace('_', ' ')}</span>
                </Link>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Purchasing() {
  const { data, error } = useReport<any[]>('/reports/purchasing');
  if (error) return <Err e={error} />;
  if (!data) return <Spinner />;
  return (
    <Card title="Materials to order / on order" pad={false}>
      <Table
        head={['Job', 'Item', 'Supplier', 'Short', 'Status', 'Needed by']}
        rows={data.map((r) => [
          <Link key="j" href={`/rabs/jobs/${r.jobId}`} className="font-semibold text-brand">
            {r.jobNumber}
          </Link>,
          <span key="i">
            {r.description}
            <span className="block text-xs text-muted-foreground">{r.customerName}</span>
          </span>,
          r.supplier || '—',
          `${num(r.qtyShort)} ${r.unit === 'm2' ? 'm²' : r.unit}`,
          <StatusBadge key="s" size="sm" label={String(r.status).replace('_', ' ')} color={r.status === 'ordered' ? '#F59E0B' : '#DC2626'} />,
          r.neededBy ? fmtDate(r.neededBy) : 'Not booked'
        ])}
        empty="Nothing to order."
      />
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            {head.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-semibold ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 ${j > 0 ? 'text-right' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
