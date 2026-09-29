'use client';

/**
 * Shared list-page filter bar.
 *
 * Renders a search box plus a row of "primary" filters, with the remaining
 * "advanced" filters tucked into a collapsible panel. Filter values are held by
 * the parent as a flat `Record<string, string>` so they map straight onto API
 * query params.
 */

import React, { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X, RotateCcw, ChevronDown } from 'lucide-react';

export type FilterFieldType = 'select' | 'text' | 'number' | 'date';

export interface FilterField {
  /** Query-param key, e.g. `paymentStatus`. */
  key: string;
  label: string;
  type: FilterFieldType;
  /** Options for `select` fields. An "All" option is prepended automatically. */
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  /** Show in the always-visible row rather than the advanced panel. */
  primary?: boolean;
}

export interface FilterBarProps {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Rendered on the right-hand side, e.g. Add / Export / Sync buttons. */
  actions?: React.ReactNode;
  /** Small stat chips rendered under the filters, e.g. result count and value. */
  stats?: Array<{ label: string; value: string }>;
  loading?: boolean;
}

function useDebouncedCallback(fn: (v: string) => void, delay: number) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  return React.useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(value), delay);
    },
    [fn, delay]
  );
}

export function FilterBar({
  fields,
  values,
  onChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  actions,
  stats,
  loading
}: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchValue);

  const debouncedSearch = useDebouncedCallback(onSearchChange, 350);

  React.useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  const primaryFields = useMemo(() => fields.filter((f) => f.primary), [fields]);
  const advancedFields = useMemo(() => fields.filter((f) => !f.primary), [fields]);

  const activeFilters = useMemo(
    () =>
      fields
        .filter((f) => values[f.key] !== undefined && values[f.key] !== '')
        .map((f) => {
          const raw = values[f.key];
          const label =
            f.type === 'select'
              ? (f.options?.find((o) => o.value === raw)?.label ?? raw)
              : raw;
          return { key: f.key, field: f.label, label };
        }),
    [fields, values]
  );

  const activeCount = activeFilters.length;

  const setValue = (key: string, value: string) => onChange({ ...values, [key]: value });

  const clearAll = () => {
    onChange({});
    setLocalSearch('');
    onSearchChange('');
  };

  const renderField = (f: FilterField) => {
    const value = values[f.key] ?? '';
    if (f.type === 'select') {
      return (
        <label key={f.key} className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{f.label}</span>
          <select
            className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={value}
            onChange={(e) => setValue(f.key, e.target.value)}
          >
            <option value="">All</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label key={f.key} className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{f.label}</span>
        <input
          type={f.type}
          step={f.type === 'number' ? '0.01' : undefined}
          placeholder={f.placeholder}
          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          value={value}
          onChange={(e) => setValue(f.key, e.target.value)}
        />
      </label>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      {/* Search + primary filters + actions */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Search</span>
            <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-muted-foreground" />
            <input
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                debouncedSearch(e.target.value);
              }}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {primaryFields.map((f) => (
            <div key={f.key} className="min-w-[150px]">{renderField(f)}</div>
          ))}

          {advancedFields.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm hover:bg-muted"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Advanced
              {activeCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {activeCount}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>
          )}

          {(activeCount > 0 || localSearch) && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-muted"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {/* Advanced panel */}
      {showAdvanced && advancedFields.length > 0 && (
        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {advancedFields.map(renderField)}
        </div>
      )}

      {/* Active filter chips */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {activeFilters.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
            >
              <span className="text-muted-foreground">{f.field}:</span>
              <span className="font-medium">{f.label}</span>
              <button
                type="button"
                onClick={() => setValue(f.key, '')}
                className="rounded-full p-0.5 hover:bg-background"
                aria-label={`Clear ${f.field} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Result stats */}
      {stats && stats.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
          {stats.map((s) => (
            <span key={s.label} className="text-muted-foreground">
              {s.label}: <span className="font-semibold text-foreground">{s.value}</span>
            </span>
          ))}
          {loading && <span className="text-xs text-muted-foreground">Updating…</span>}
        </div>
      )}
    </div>
  );
}
