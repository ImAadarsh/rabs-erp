export function accApiError(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string };
  return e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || fallback;
}

export function accFieldErrors(err: unknown): Record<string, string> {
  const details = (err as { response?: { data?: { error?: { details?: { path?: (string | number)[]; message?: string }[] } } } })
    ?.response?.data?.error?.details;
  const out: Record<string, string> = {};
  if (!Array.isArray(details)) return out;
  for (const d of details) {
    const key = (d.path || []).join('.');
    if (key && d.message && !out[key]) out[key] = d.message;
  }
  return out;
}

/** VAT code rates are stored as fractions (0.2 = 20%); tolerate legacy percentage values. */
export function vatRateFraction(rate: unknown): number {
  const n = Number(rate) || 0;
  return n > 1 ? n / 100 : n;
}

export function isApiMissing(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 501;
}

export function formatMoney(amount?: number | string | null, currency = 'GBP'): string {
  if (amount == null || amount === '' || Number.isNaN(Number(amount))) return '—';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function statusBadgeClass(status?: string): string {
  const s = (status || '').toLowerCase();
  const base = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border whitespace-nowrap ';
  if (['posted', 'paid', 'approved', 'active', 'reconciled', 'open'].includes(s)) {
    return base + 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  }
  if (['void', 'voided', 'cancelled', 'rejected', 'overdue'].includes(s)) {
    return base + 'bg-red-500/10 text-red-600 border-red-500/20';
  }
  if (['draft', 'pending', 'calculated', 'unmatched'].includes(s)) {
    return base + 'bg-amber-500/10 text-amber-700 border-amber-500/20';
  }
  if (['submitted', 'exported'].includes(s)) {
    return base + 'bg-blue-500/10 text-blue-600 border-blue-500/20';
  }
  return base + 'bg-muted text-muted-foreground border-border';
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type PrintColumn = { label: string; num?: boolean };

/** Plain HTML table for `printElement`; cells are escaped, `footer` rows render bold. */
export function printTable(
  columns: PrintColumn[],
  rows: (string | number | null | undefined)[][],
  footer: (string | number | null | undefined)[][] = []
): string {
  const cell = (tag: 'td' | 'th', c: PrintColumn | undefined, v: unknown) =>
    `<${tag}${c?.num ? ' class="num"' : ''}>${escapeHtml(v)}</${tag}>`;
  const head = `<tr>${columns.map((c) => cell('th', c, c.label)).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((v, i) => cell('td', columns[i], v)).join('')}</tr>`).join('');
  const foot = footer.map((r) => `<tr class="total">${r.map((v, i) => cell('td', columns[i], v)).join('')}</tr>`).join('');
  const empty = rows.length ? '' : `<tr><td colspan="${columns.length}" class="muted">No rows</td></tr>`;
  return `<table><thead>${head}</thead><tbody>${body}${empty}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
}

/**
 * Prints a standalone report (title, optional period/subtitle, body HTML) through a hidden iframe so only the
 * report is printed — not the app chrome — and popup blockers / `noopener` cannot swallow it.
 */
export function printElement(title: string, html: string, subtitle?: string) {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
      @page{margin:14mm}
      body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;color:#111}
      h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px} .meta{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
      th,td{border-bottom:1px solid #e5e5e5;padding:6px 8px;text-align:left;vertical-align:top}
      th{font-weight:600;color:#444;background:#fafafa} .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      tr.total td,.total{font-weight:700;border-top:2px solid #111} .muted{color:#888}
      thead{display:table-header-group} tr{page-break-inside:avoid}
    </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${subtitle ? `${escapeHtml(subtitle)} · ` : ''}RABS Accounting · Printed ${escapeHtml(new Date().toLocaleString('en-GB'))}</div>
    ${html}
    </body></html>`);
  doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => frame.isConnected && frame.remove(), 60000);
  }, 50);
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const v = c == null ? '' : String(c);
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(',')
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
