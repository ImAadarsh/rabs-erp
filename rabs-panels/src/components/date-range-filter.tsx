'use client';

import React from 'react';

export type DateRange = { from: string; to: string; preset: DatePreset };
export type DatePreset = '7d' | '30d' | '90d' | 'ytd' | '12m' | 'custom';

const PRESETS: { id: Exclude<DatePreset, 'custom'>; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: '12m', label: '12 months' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function rangeForPreset(preset: Exclude<DatePreset, 'custom'>, now = new Date()): DateRange {
  const to = iso(now);
  const start = new Date(now);
  if (preset === 'ytd') return { from: `${now.getFullYear()}-01-01`, to, preset };
  if (preset === '12m') start.setFullYear(start.getFullYear() - 1);
  else start.setDate(start.getDate() - (preset === '7d' ? 6 : preset === '30d' ? 29 : 89));
  return { from: iso(start), to, preset };
}

/** True when an ISO-ish date string falls inside the inclusive range. */
export function inRange(value: string | Date | null | undefined, range: DateRange): boolean {
  if (!value) return false;
  const d = typeof value === 'string' ? value.slice(0, 10) : iso(value);
  return d >= range.from && d <= range.to;
}

/** Daily (≤ 92 days) or monthly buckets covering the range, for chart x-axes. */
export function bucketsForRange(range: DateRange): { key: string; label: string }[] {
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const out: { key: string; label: string }[] = [];
  if (days <= 92) {
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      out.push({ key: k, label: k.slice(5) });
    }
  } else {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (d <= to) {
      const k = d.toISOString().slice(0, 7);
      out.push({ key: k, label: k });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  }
  return out;
}

/** Bucket key for a date given the buckets returned by bucketsForRange. */
export function bucketKey(value: string | Date, range: DateRange): string {
  const s = typeof value === 'string' ? value : value.toISOString();
  const daily = bucketsForRange(range)[0]?.key.length === 10;
  return daily ? s.slice(0, 10) : s.slice(0, 7);
}

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl border border-border bg-card/60 p-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(rangeForPreset(p.id))}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              value.preset === p.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 text-xs">
        <input
          type="date"
          aria-label="From date"
          className="input !h-9 !w-auto text-xs"
          value={value.from}
          max={value.to}
          onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value, preset: 'custom' })}
        />
        <span className="text-muted-foreground">to</span>
        <input
          type="date"
          aria-label="To date"
          className="input !h-9 !w-auto text-xs"
          value={value.to}
          min={value.from}
          onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value, preset: 'custom' })}
        />
      </div>
    </div>
  );
}
