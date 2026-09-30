import { BRAND, BRAND_CONTACT_LINE } from '@/lib/brand';
export function accApiError(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string };
  return e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || fallback;
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

export function printElement(title: string, html: string) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px} .meta{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border-bottom:1px solid #e5e5e5;padding:8px;text-align:left}
      th{font-weight:600;color:#444} .num{text-align:right;font-variant-numeric:tabular-nums}
      .total{font-weight:700} @media print{button{display:none}}
      .brand{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #D4AF37;padding-bottom:12px;margin-bottom:16px}
      .brand img{height:48px} .brand .contact{text-align:right;font-size:11px;color:#555;line-height:1.5}
    </style></head><body>
    <div class="brand"><img src="${window.location.origin}${BRAND.logo ?? ''}" alt="${BRAND.name}" onerror="this.remove()"/><div class="contact">${BRAND.name}<br/>${BRAND_CONTACT_LINE}</div></div>
    <h1>${title}</h1>
    <div class="meta">${BRAND.name} · Accounting · Printed ${new Date().toLocaleString('en-GB')}</div>
    ${html}
    <script>window.onload=()=>window.print()</script>
    </body></html>`);
  w.document.close();
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
