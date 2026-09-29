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
  listVatCodes,
  exportVatMtdBoxes,
  submitVatMtdPlaceholder,
} from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, downloadCsv, printElement } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass, MtdBanner } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';

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
    setSaving(true);
    try {
      const box1 = Number(form.box1 || 0);
      const box2 = Number(form.box2 || 0);
      const box3 = box1 + box2;
      const box4 = Number(form.box4 || 0);
      const box5 = box3 - box4;
      await createAccVatReturn({
        organizationId: orgId,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        scheme: form.scheme,
        box1,
        box2,
        box3,
        box4,
        box5,
        box6: Number(form.box6 || 0),
        box7: Number(form.box7 || 0),
        status: 'draft',
        mtdReference: null,
      });
      toast.success('VAT return draft created');
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function onExport(id: string) {
    try {
      const res = await exportVatMtdBoxes(id);
      const data = (res as any).data || res;
      setExportPreview(data);
      const boxes = data.boxes || data;
      downloadCsv(`vat-mtd-boxes-${id}.csv`, [
        ['Box', 'Value'],
        ...Object.entries(boxes).map(([k, v]) => [k, v as any]),
      ]);
      toast.success('VAT box export downloaded — not submitted to HMRC');
    } catch (err) {
      toast.error(accApiError(err));
    }
  }

  async function onFakeSubmit(id: string) {
    try {
      const res = await submitVatMtdPlaceholder(id);
      const msg = (res as any)?.data?.message || (res as any)?.message || 'HMRC credentials required';
      toast.message('MTD submit', { description: msg });
    } catch (err) {
      toast.error(accApiError(err));
    }
  }

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
          <div className="flex gap-2">
            <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => onExport(row.original.id)}>
              Export boxes
            </button>
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => onFakeSubmit(row.original.id)}>
              MTD submit…
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="VAT" />
        <main className="p-6 md:p-8 space-y-4">
          <MtdBanner>
            Returns are drafts with structured box export. Status never implies HMRC acceptance unless a real MTD reference is stored after authenticated submission.
          </MtdBanner>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Schemes:{' '}
              {codes.length
                ? Array.from(new Set(codes.map((c: any) => c.scheme || 'standard'))).join(', ')
                : 'standard / flat-rate / cash (flags in settings)'}
            </div>
            <AccCreateButton label="Create VAT Return" onClick={() => setOpen(true)} />
          </div>

          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search VAT returns…" />

          {exportPreview ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Last MTD box export</h3>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() =>
                    printElement(
                      'VAT MTD Boxes',
                      `<pre>${JSON.stringify(exportPreview, null, 2)}</pre>`
                    )
                  }
                >
                  Print
                </button>
              </div>
              <pre className="text-xs overflow-auto bg-muted/40 p-3 rounded-xl">{JSON.stringify(exportPreview, null, 2)}</pre>
              <p className="text-xs text-amber-700 dark:text-amber-200">{exportPreview.note || 'Export only — not submitted'}</p>
            </div>
          ) : null}

          <div className="glass-panel rounded-2xl border border-border/50 p-4">
            <h3 className="font-semibold text-sm mb-2">VAT codes</h3>
            <div className="flex flex-wrap gap-2">
              {codes.map((c) => (
                <span key={c.code} className="px-2.5 py-1 rounded-lg bg-muted text-xs font-medium">
                  {c.code} · {c.name} · {c.rate}%
                </span>
              ))}
            </div>
          </div>
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Create VAT Return (draft)" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Period start"><input type="date" className={accInputClass} value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required /></AccField>
            <AccField label="Period end"><input type="date" className={accInputClass} value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required /></AccField>
          </div>
          <AccField label="Scheme">
            <select className={accInputClass} value={form.scheme} onChange={(e) => setForm({ ...form, scheme: e.target.value })}>
              <option value="standard">Standard</option>
              <option value="flat_rate">Flat rate</option>
              <option value="cash">Cash accounting</option>
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
