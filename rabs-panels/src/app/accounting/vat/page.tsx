/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listAccVatReturns,
  createAccVatReturn,
  deleteAccVatReturn,
  listVatCodes,
  exportVatMtdBoxes,
  submitVatMtdPlaceholder,
} from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, accFieldErrors, vatRateFraction, downloadCsv, printElement, printTable } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass, MtdBanner } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

const VAT_BOX_LABELS: Record<string, string> = {
  box1: 'VAT due on sales and other outputs',
  box2: 'VAT due on acquisitions from other EC member states',
  box3: 'Total VAT due (Box 1 + Box 2)',
  box4: 'VAT reclaimed on purchases and other inputs',
  box5: 'Net VAT to pay to HMRC or reclaim (Box 3 − Box 4)',
  box6: 'Total value of sales and other outputs, excluding VAT',
  box7: 'Total value of purchases and other inputs, excluding VAT',
  box8: 'Total value of supplies of goods to EC member states, excluding VAT',
  box9: 'Total value of acquisitions of goods from EC member states, excluding VAT',
};

export default function AccountingVatPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [codes, setCodes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportPreview, setExportPreview] = useState<any>(null);
  const orgId = session?.user?.organizationId;

  const [form, setForm] = useState({
    periodStart: '',
    periodEnd: '',
    scheme: 'standard',
    box1: '',
    box2: '',
    box4: '',
    box6: '',
    box7: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const [vat, vc] = await Promise.all([listAccVatReturns(orgId), listVatCodes(orgId)]);
      setRows(vat.data || []);
      setCodes(vc.data || []);
    } catch (e) {
      toast.error(accApiError(e));
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (hasAccess) load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const next: Record<string, string> = {};
    if (!form.periodStart) next.from = 'Period start is required';
    if (!form.periodEnd) next.to = 'Period end is required';
    if (form.periodStart && form.periodEnd && form.periodEnd < form.periodStart) next.to = 'Period end must be on or after period start';
    setErrors(next);
    if (Object.keys(next).length) return;
    const box = (v: string) => (v.trim() === '' ? undefined : Number(v));
    setSaving(true);
    try {
      await createAccVatReturn({
        organizationId: orgId,
        from: form.periodStart,
        to: form.periodEnd,
        scheme: form.scheme,
        box1: box(form.box1),
        box2: box(form.box2),
        box4: box(form.box4),
        box6: box(form.box6),
        box7: box(form.box7),
      });
      toast.success('VAT return draft created');
      setOpen(false);
      await load();
    } catch (err) {
      setErrors(accFieldErrors(err));
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const [busyId, setBusyId] = useState<string | null>(null);
  const [mtdBlocked, setMtdBlocked] = useState<{ message: string; checks: any[] } | null>(null);

  function boxRows(data: any): { box: number; label: string; value: number }[] {
    if (Array.isArray(data?.rows)) return data.rows;
    const boxes = data?.boxes || {};
    return Object.keys(boxes).map((k) => ({ box: Number(k.replace(/\D/g, '')), label: VAT_BOX_LABELS[k] || k, value: Number(boxes[k] ?? 0) }));
  }

  function exportCsv(data: any) {
    const period = `${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}`;
    downloadCsv(`vat-return-${data.returnNumber || data.id}.csv`, [
      ['VAT return', data.returnNumber || data.id],
      ['Period', period],
      ['Status', `${data.status || 'draft'} (not submitted to HMRC)`],
      [],
      ['Box', 'Description', 'Amount (GBP)'],
      ...boxRows(data).map((r) => [`Box ${r.box}`, r.label, r.value.toFixed(2)]),
    ]);
  }

  function printBoxes(data: any) {
    printElement(
      `VAT Return ${data.returnNumber || data.id}`,
      printTable(
        [{ label: 'Box' }, { label: 'Description' }, { label: 'Amount', num: true }],
        boxRows(data).map((r) => [`Box ${r.box}`, r.label, formatMoney(r.value)])
      ) + '<p class="muted">Prepared in RABS — not submitted to HMRC.</p>',
      `Period ${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}`
    );
  }

  const onExport = useCallback(async (id: string) => {
    setBusyId(String(id));
    try {
      const res = await exportVatMtdBoxes(id);
      const data = (res as any).data || res;
      setExportPreview(data);
      exportCsv(data);
      toast.success('VAT return exported (CSV) — not submitted to HMRC');
    } catch (err) {
      toast.error(accApiError(err, 'Failed to export VAT return'));
    } finally {
      setBusyId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onView = useCallback(async (id: string) => {
    setBusyId(String(id));
    try {
      const res = await exportVatMtdBoxes(id);
      setExportPreview((res as any).data || res);
    } catch (err) {
      toast.error(accApiError(err, 'Failed to load VAT boxes'));
    } finally {
      setBusyId(null);
    }
  }, []);

  const onDelete = useCallback(async (item: any) => {
    if (!confirm(`Delete draft VAT return ${item.returnNumber || item.id}? This cannot be undone.`)) return;
    setBusyId(String(item.id));
    try {
      await deleteAccVatReturn(String(item.id));
      setRows((prev) => prev.filter((r) => String(r.id) !== String(item.id)));
      toast.success('Draft VAT return deleted');
    } catch (err) {
      toast.error(accApiError(err, 'Failed to delete VAT return'));
    } finally {
      setBusyId(null);
    }
  }, []);

  const onSubmitMtd = useCallback(async (id: string) => {
    setBusyId(String(id));
    try {
      await submitVatMtdPlaceholder(id);
    } catch (err: any) {
      const body = err?.response?.data;
      if (body?.meta?.hmrcMtd) {
        setMtdBlocked({ message: body.error?.message || 'Live HMRC MTD submission is not connected.', checks: body.meta.hmrcMtd.checks || [] });
      } else {
        toast.error(accApiError(err));
      }
    } finally {
      setBusyId(null);
    }
  }, []);

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'period',
        header: 'Period',
        cell: ({ row }) => `${formatDate(row.original.periodStart)} – ${formatDate(row.original.periodEnd)}`,
      },
      {
        accessorKey: 'box5',
        header: 'Net VAT (Box 5)',
        cell: ({ row }) => formatMoney(row.original.box5 ?? row.original.netVatDue),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.original.status || 'draft';
          const label = s === 'submitted' ? `${s} (local only)` : s;
          return <span className={statusBadgeClass(s)}>{label}</span>;
        },
      },
      {
        accessorKey: 'mtdReference',
        header: 'MTD ref',
        cell: ({ row }) => row.original.mtdReference || '— not submitted —',
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex gap-3 whitespace-nowrap">
            <button type="button" disabled={busyId !== null} className="text-xs font-semibold text-brand hover:underline disabled:opacity-50" onClick={() => onView(row.original.id)}>
              View boxes
            </button>
            <button type="button" disabled={busyId !== null} className="text-xs font-semibold text-brand hover:underline disabled:opacity-50" onClick={() => onExport(row.original.id)}>
              Export CSV
            </button>
            <button type="button" disabled={busyId !== null} className="text-xs text-muted-foreground hover:underline disabled:opacity-50" onClick={() => onSubmitMtd(row.original.id)}>
              Submit to HMRC…
            </button>
            {(row.original.status || 'draft') === 'draft' ? (
              <button type="button" disabled={busyId !== null} className="text-xs text-destructive hover:underline disabled:opacity-50" onClick={() => onDelete(row.original)}>
                Delete
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [busyId, onView, onExport, onSubmitMtd, onDelete]
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="VAT" />
        <main className="p-6 md:p-8 space-y-4">
          <MtdBanner>
            Returns are prepared here and exported (CSV / print) — they are not sent to HMRC. Live MTD submission needs the VRN, an HMRC Developer Hub application (client ID + secret) and the business to authorise RABS with HMRC (OAuth).
          </MtdBanner>

          {mtdBlocked ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-red-700 dark:text-red-300">Not submitted — live HMRC MTD is not connected</p>
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setMtdBlocked(null)}>Dismiss</button>
              </div>
              <ul className="space-y-1">
                {mtdBlocked.checks.map((c: any) => (
                  <li key={c.key} className="flex gap-2">
                    <span className={c.ok ? 'text-emerald-600' : 'text-red-600'}>{c.ok ? '✓' : '✗'}</span>
                    <span>{c.label}{!c.ok && c.action ? <span className="text-muted-foreground"> — {c.action}</span> : null}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Use “Export CSV” or Print to file this return through HMRC in the meantime.</p>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Schemes:{' '}
              {codes.length
                ? Array.from(new Set(codes.map((c: any) => c.scheme || 'standard'))).join(', ')
                : 'standard / flat-rate / cash (flags in settings)'}
            </div>
            <AccCreateButton
              label="Create VAT Return"
              onClick={() => {
                setForm({ periodStart: '', periodEnd: '', scheme: 'standard', box1: '', box2: '', box4: '', box6: '', box7: '' });
                setErrors({});
                setOpen(true);
              }}
            />
          </div>

          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search VAT returns…" />

          {exportPreview ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold text-sm">VAT return {exportPreview.returnNumber || exportPreview.id}</h3>
                  {exportPreview.periodStart ? (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(exportPreview.periodStart)} – {formatDate(exportPreview.periodEnd)} · {exportPreview.status || 'draft'}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted" onClick={() => exportCsv(exportPreview)}>
                    <Download size={14} /> CSV
                  </button>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted" onClick={() => printBoxes(exportPreview)}>
                    <Printer size={14} /> Print
                  </button>
                  <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setExportPreview(null)}>Close</button>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2 w-20">Box</th>
                    <th className="text-left py-2">Description</th>
                    <th className="text-right py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {boxRows(exportPreview).map((r) => (
                    <tr key={r.box} className={`border-b border-border/40 ${r.box === 5 ? 'font-semibold' : ''}`}>
                      <td className="py-2 font-mono text-xs">Box {r.box}</td>
                      <td className="py-2">{r.label}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-amber-700 dark:text-amber-200">{exportPreview.mtd?.note || 'Export only — not submitted to HMRC.'}</p>
            </div>
          ) : null}

          <div className="glass-panel rounded-2xl border border-border/50 p-4">
            <h3 className="font-semibold text-sm mb-2">VAT codes</h3>
            <div className="flex flex-wrap gap-2">
              {codes.map((c) => (
                <span key={c.code} className="px-2.5 py-1 rounded-lg bg-muted text-xs font-medium">
                  {c.code} · {c.name} · {Math.round(vatRateFraction(c.rate) * 10000) / 100}%
                </span>
              ))}
            </div>
          </div>
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Create VAT Return (draft)" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-3" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Period start" error={errors.from}><input type="date" className={accInputClass} value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required /></AccField>
            <AccField label="Period end" error={errors.to}><input type="date" className={accInputClass} value={form.periodEnd} min={form.periodStart || undefined} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required /></AccField>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave any box blank to calculate it from posted sales invoices and supplier bills in the period. Box 3 and Box 5 are always calculated.
          </p>
          <AccField label="Scheme">
            <select className={accInputClass} value={form.scheme} onChange={(e) => setForm({ ...form, scheme: e.target.value })}>
              <option value="standard">Standard</option>
              <option value="flat_rate">Flat rate</option>
              <option value="cash_accounting">Cash accounting</option>
            </select>
          </AccField>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Box 1 VAT due on sales"><input type="number" step="0.01" className={accInputClass} value={form.box1} onChange={(e) => setForm({ ...form, box1: e.target.value })} /></AccField>
            <AccField label="Box 2 VAT on acquisitions"><input type="number" step="0.01" className={accInputClass} value={form.box2} onChange={(e) => setForm({ ...form, box2: e.target.value })} /></AccField>
            <AccField label="Box 4 VAT reclaimed"><input type="number" step="0.01" className={accInputClass} value={form.box4} onChange={(e) => setForm({ ...form, box4: e.target.value })} /></AccField>
            <AccField label="Box 6 total sales ex VAT"><input type="number" step="0.01" className={accInputClass} value={form.box6} onChange={(e) => setForm({ ...form, box6: e.target.value })} /></AccField>
            <AccField label="Box 7 total purchases ex VAT"><input type="number" step="0.01" className={accInputClass} value={form.box7} onChange={(e) => setForm({ ...form, box7: e.target.value })} /></AccField>
          </div>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Save draft" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
