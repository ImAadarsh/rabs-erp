import { useMemo, useState } from 'react';

export type Column<T> = {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
};

export function DataTable<T extends Record<string, any>>(props: {
  rows: T[];
  columns: Column<T>[];
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  searchKeys?: string[];
  onRowClick?: (row: T) => void;
  emptyText?: string;
}) {
  const { rows, columns, initialSort, searchKeys = [], onRowClick, emptyText = 'No data' } = props;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const query = q.toLowerCase();
      r = r.filter((row) =>
        searchKeys.some((k) => String(row[k] ?? '').toLowerCase().includes(query))
      );
    }
    if (sort) {
      r = [...r].sort((a, b) => {
        const av = a[sort.key] ?? '';
        const bv = b[sort.key] ?? '';
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, q, sort, searchKeys]);

  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key: string, sortable?: boolean) {
    if (!sortable) return;
    setPage(1);
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      return s.dir === 'asc' ? { key, dir: 'desc' } : null;
    });
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <input
          className="w-64 rounded-md border border-zaam-soft bg-[#F5F5F5] p-2 focus:ring-2 focus:ring-brand/40 focus:border-brand outline-none transition-shadow"
          placeholder="Search..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <div className="text-xs text-zaam-grey">{filtered.length} results</div>
      </div>
      <div className="table-shell">
        <div className="w-full overflow-x-auto">
          <table className="min-w-full md:min-w-0 text-sm">
          <thead className="table-head">
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)} className="text-left p-3 cursor-pointer select-none" onClick={() => toggleSort(String(c.key), c.sortable)}>
                  <span>{c.header}</span>
                  {sort?.key === c.key && <span> {sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td className="p-4" colSpan={columns.length}>{emptyText}</td></tr>
            ) : pageRows.map((row, i) => (
              <tr key={i} className="table-row" onClick={() => onRowClick?.(row)}>
                {columns.map((c) => (
                  <td key={String(c.key)} className="p-3">
                    {c.render ? c.render(row) : String(row[c.key as string] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <div>Page {page} of {maxPage}</div>
        <div className="flex gap-2">
          <button className="px-3 py-1 border border-zaam-soft rounded-md disabled:opacity-50 hover:border-brand" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <button className="px-3 py-1 border border-zaam-soft rounded-md disabled:opacity-50 hover:border-brand" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Next</button>
        </div>
      </div>
    </div>
  );
}


