/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listFixedAssets, createFixedAsset, depreciateFixedAsset, disposeFixedAsset } from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError, accFieldErrors } from '@/lib/accounting-utils';
import { AccModal, AccField, AccModalActions, AccCreateButton, accInputClass } from '@/components/accounting/acc-modal';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingFixedAssetsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [rows, setRows] = useState<any[]>([]);
  const [stub, setStub] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const orgId = session?.user?.organizationId;
  const [form, setForm] = useState({
    assetCode: '',
    name: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    cost: '',
    residualValue: '0',
    usefulLifeMonths: '36',
    depreciationMethod: 'straight_line',
    reducingRatePercent: '25',
    acquisitionSource: 'bank',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await listFixedAssets(orgId);
      setRows(res.data || []);
      setStub(Boolean((res as any)._stub));
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
    const cost = Number(form.cost);
    const residual = Number(form.residualValue || 0);
    const life = Number(form.usefulLifeMonths);
    const next: Record<string, string> = {};
    if (!form.assetCode.trim()) next.assetCode = 'Asset code is required';
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.purchaseDate) next.purchaseDate = 'Purchase date is required';
    if (!(cost > 0)) next.purchaseCost = 'Cost must be greater than 0';
    if (residual < 0) next.residualValue = 'Residual value cannot be negative';
    else if (cost > 0 && residual >= cost) next.residualValue = 'Residual value must be less than cost';
    if (!Number.isInteger(life) || life < 1) next.usefulLifeMonths = 'Useful life must be at least 1 whole month';
    const ratePct = Number(form.reducingRatePercent);
    if (form.depreciationMethod === 'reducing_balance' && !(ratePct > 0 && ratePct < 100)) {
      next.reducingRate = 'Annual rate must be between 0 and 100%';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await createFixedAsset({
        organizationId: orgId,
        assetCode: form.assetCode.trim(),
        name: form.name.trim(),
        purchaseDate: form.purchaseDate,
        purchaseCost: cost,
        residualValue: residual,
        usefulLifeMonths: life,
        depreciationMethod: form.depreciationMethod,
        reducingRate: form.depreciationMethod === 'reducing_balance' ? Number(form.reducingRatePercent) / 100 : undefined,
        acquisitionSource: form.acquisitionSource,
      });
      toast.success('Fixed asset added');
      setOpen(false);
      await load();
    } catch (err) {
      setErrors(accFieldErrors(err));
      toast.error(accApiError(err, 'Failed to add fixed asset'));
    } finally {
      setSaving(false);
    }
  }

  const [pending, setPending] = useState<{ id: string; action: 'depreciate' | 'dispose' } | null>(null);

  const onDepreciate = useCallback(
    async (asset: any) => {
      const next = [...(asset.schedule || [])]
        .filter((s: any) => s.status === 'scheduled')
        .sort((a: any, b: any) => String(a.periodStart).localeCompare(String(b.periodStart)))[0];
      if (!next) {
        toast.error('No scheduled depreciation remaining for this asset');
        return;
      }
      const id = String(asset.id);
      setPending({ id, action: 'depreciate' });
      try {
        const res: any = await depreciateFixedAsset(id, { scheduleId: next.id });
        const posted = res?.data || { ...next, status: 'posted' };
        setRows((prev) =>
          prev.map((r) =>
            String(r.id) === id
              ? { ...r, schedule: (r.schedule || []).map((s: any) => (String(s.id) === String(next.id) ? { ...s, ...posted, asset: undefined } : s)) }
              : r
          )
        );
        toast.success(`Depreciation posted for period ending ${formatDate(next.periodEnd)}`);
        await load();
      } catch (err) {
        toast.error(accApiError(err, 'Failed to post depreciation'));
      } finally {
        setPending(null);
      }
    },
    [load]
  );

  const onDispose = useCallback(
    async (asset: any) => {
      if (!confirm(`Dispose asset ${asset.assetCode}? A disposal journal will be posted.`)) return;
      const id = String(asset.id);
      setPending({ id, action: 'dispose' });
      try {
        const res: any = await disposeFixedAsset(id, { disposedAt: new Date().toISOString().slice(0, 10), proceeds: 0 });
        const updated = res?.data || { status: 'disposed' };
        setRows((prev) => prev.map((r) => (String(r.id) === id ? { ...r, ...updated, schedule: updated.schedule || r.schedule } : r)));
        toast.success('Asset disposed');
        await load();
      } catch (err) {
        toast.error(accApiError(err, 'Failed to dispose asset'));
      } finally {
        setPending(null);
      }
    },
    [load]
  );

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'assetCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.assetCode}</span> },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'purchaseDate', header: 'Purchased', cell: ({ row }) => formatDate(row.original.purchaseDate) },
      { accessorKey: 'purchaseCost', header: 'Cost', cell: ({ row }) => formatMoney(row.original.purchaseCost ?? row.original.cost) },
      {
        id: 'nbv',
        header: 'NBV',
        cell: ({ row }) => {
          const cost = Number(row.original.purchaseCost ?? row.original.cost ?? 0);
          const posted = (row.original.schedule || [])
            .filter((s: any) => s.status === 'posted')
            .reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0);
          return formatMoney(row.original.status === 'disposed' ? 0 : cost - posted);
        },
      },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{row.original.status}</span> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          if (row.original.status !== 'active') return null;
          const busy = pending?.id === String(row.original.id);
          return (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={pending !== null}
                className="text-xs font-semibold text-brand hover:underline disabled:opacity-50 disabled:no-underline"
                onClick={() => onDepreciate(row.original)}
              >
                {busy && pending?.action === 'depreciate' ? 'Posting…' : 'Depreciate'}
              </button>
              <button
                type="button"
                disabled={pending !== null}
                className="text-xs text-muted-foreground hover:underline disabled:opacity-50 disabled:no-underline"
                onClick={() => onDispose(row.original)}
              >
                {busy && pending?.action === 'dispose' ? 'Disposing…' : 'Dispose'}
              </button>
            </div>
          );
        },
      },
    ],
    [onDepreciate, onDispose, pending]
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Fixed Assets" />
        <main className="p-6 md:p-8 space-y-4">
          {stub ? (
            <p className="text-sm rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              Fixed asset register pending API — depreciate/dispose post journals when live.
            </p>
          ) : null}
          <div className="flex justify-between items-center flex-wrap gap-3">
            <p className="text-sm text-muted-foreground">Register, depreciation schedule, dispose with journal.</p>
            <AccCreateButton
              label="Create Asset"
              onClick={() => {
                setForm({
                  assetCode: `FA-${Date.now().toString().slice(-6)}`,
                  name: '',
                  purchaseDate: new Date().toISOString().slice(0, 10),
                  cost: '',
                  residualValue: '0',
                  usefulLifeMonths: '36',
                  depreciationMethod: 'straight_line',
                  reducingRatePercent: '25',
                  acquisitionSource: 'bank',
                });
                setErrors({});
                setOpen(true);
              }}
            />
          </div>
          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search assets…" />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Add Fixed Asset" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-3" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Asset code" error={errors.assetCode}><input className={accInputClass} value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} required /></AccField>
            <AccField label="Name" error={errors.name}><input className={accInputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></AccField>
            <AccField label="Purchase date" error={errors.purchaseDate}><input type="date" className={accInputClass} value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} required /></AccField>
            <AccField label="Cost" error={errors.purchaseCost}><input type="number" step="0.01" min="0.01" className={accInputClass} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} required /></AccField>
            <AccField label="Residual value" error={errors.residualValue}><input type="number" step="0.01" min="0" className={accInputClass} value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} /></AccField>
            <AccField label="Useful life (months)" error={errors.usefulLifeMonths}><input type="number" min="1" step="1" className={accInputClass} value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} /></AccField>
          </div>
          <AccField label="Depreciation method">
            <select className={accInputClass} value={form.depreciationMethod} onChange={(e) => setForm({ ...form, depreciationMethod: e.target.value })}>
              <option value="straight_line">Straight line</option>
              <option value="reducing_balance">Reducing balance</option>
            </select>
          </AccField>
          {form.depreciationMethod === 'reducing_balance' ? (
            <AccField label="Annual reducing-balance rate (%)" error={errors.reducingRate}>
              <input type="number" min="0.01" max="99.99" step="0.01" className={accInputClass} value={form.reducingRatePercent} onChange={(e) => setForm({ ...form, reducingRatePercent: e.target.value })} />
            </AccField>
          ) : null}
          <AccField label="Paid from (acquisition journal)">
            <select className={accInputClass} value={form.acquisitionSource} onChange={(e) => setForm({ ...form, acquisitionSource: e.target.value })}>
              <option value="bank">Bank (1000) — paid now</option>
              <option value="creditor">Trade creditors (2000) — owed to supplier</option>
              <option value="already_recorded">Already recorded in the ledger (e.g. via a supplier bill)</option>
            </select>
          </AccField>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Add asset" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
