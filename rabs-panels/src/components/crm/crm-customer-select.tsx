'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronsUpDown, Check, Search } from 'lucide-react';
import { crmInputClass } from './crm-modal';

export type CrmCustomerOption = {
  id: string;
  label: string;
  sublabel?: string;
};

/** Searchable customer/account picker for CRM create forms. */
export function CrmCustomerSelect({
  value,
  onChange,
  options,
  placeholder = 'Search customers…',
  required,
  allowEmpty,
  emptyLabel = 'No customer',
}: {
  value: string;
  onChange: (id: string) => void;
  options: CrmCustomerOption[];
  placeholder?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => String(o.id) === String(value));

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return options.slice(0, 80);
    return options
      .filter((o) =>
        [o.label, o.sublabel, o.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(query))
      )
      .slice(0, 80);
  }, [options, q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      {required && !value ? (
        <input tabIndex={-1} required className="sr-only" value="" onChange={() => undefined} aria-hidden />
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${crmInputClass} justify-between text-left inline-flex items-center gap-2`}
      >
        <span className={selected ? 'text-foreground truncate' : 'text-muted-foreground truncate'}>
          {selected ? selected.label : allowEmpty && !value ? emptyLabel : placeholder}
        </span>
        <ChevronsUpDown size={16} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border/60 flex items-center gap-2">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type to filter…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {allowEmpty && (
              <li>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                    setQ('');
                  }}
                >
                  <span className="text-muted-foreground">{emptyLabel}</span>
                  {!value ? <Check size={14} className="text-brand" /> : null}
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-xs text-muted-foreground text-center">No matches</li>
            ) : (
              filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-start justify-between gap-2"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                      setQ('');
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o.label}</span>
                      {o.sublabel ? (
                        <span className="block truncate text-[11px] text-muted-foreground">{o.sublabel}</span>
                      ) : null}
                    </span>
                    {String(value) === String(o.id) ? (
                      <Check size={14} className="text-brand shrink-0 mt-0.5" />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function customerOptionFromRecord(c: any): CrmCustomerOption {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  const label = c.companyName || name || c.email || `Customer #${c.id}`;
  const sublabel = [c.email, c.phone, c.companyName && name ? name : null].filter(Boolean).join(' · ');
  return { id: String(c.id), label, sublabel: sublabel || undefined };
}
