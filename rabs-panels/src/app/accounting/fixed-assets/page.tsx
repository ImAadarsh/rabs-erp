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
import { formatMoney, formatDate, statusBadgeClass, accApiError } from '@/lib/accounting-utils';
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
  });

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
    setSaving(true);
    try {
      await createFixedAsset({
        organizationId: orgId,
        ...form,
        cost: Number(form.cost),
        residualValue: Number(form.residualValue || 0),
        usefulLifeMonths: Number(form.usefulLifeMonths),
        status: 'active',
      });
      toast.success('Fixed asset added');
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(accApiError(err, 'Fixed assets require /api/accounting'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      { accessorKey: 'assetCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.assetCode}</span> },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'purchaseDate', header: 'Purchased', cell: ({ row }) => formatDate(row.original.purchaseDate) },
      { accessorKey: 'cost', header: 'Cost', cell: ({ row }) => formatMoney(row.original.cost) },
      { accessorKey: 'netBookValue', header: 'NBV', cell: ({ row }) => formatMoney(row.original.netBookValue ?? row.original.cost) },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={statusBadgeClass(row.original.status)}>{row.original.status}</span> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.status === 'active' ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs font-semibold text-brand hover:underline"
                onClick={async () => {
                  try {
                    await depreciateFixedAsset(row.original.id);
                    toast.success('Depreciation journal posted');
                    await load();
                  } catch (err) {
                    toast.error(accApiError(err));
                  }
                }}
              >
                Depreciate
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={async () => {
                  try {
                    await disposeFixedAsset(row.original.id, { disposalDate: new Date().toISOString().slice(0, 10) });
                    toast.success('Asset disposed');
                    await load();
                  } catch (err) {
                    toast.error(accApiError(err));
                  }
                }}
              >
                Dispose
              </button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
                setForm((f) => ({ ...f, assetCode: `FA-${Date.now().toString().slice(-6)}` }));
                setOpen(true);
              }}
            />
          </div>
          <RichDataTable columns={columns} data={rows} searchPlaceholder="Search assets…" />
        </main>
      </div>

      <AccModal open={open} onClose={() => setOpen(false)} title="Add Fixed Asset" icon={Plus} wide>
        <form onSubmit={onCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <AccField label="Asset code"><input className={accInputClass} value={form.assetCode} onChange={(e) => setForm({ ...form, assetCode: e.target.value })} required /></AccField>
            <AccField label="Name"><input className={accInputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></AccField>
            <AccField label="Purchase date"><input type="date" className={accInputClass} value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} required /></AccField>
            <AccField label="Cost"><input type="number" step="0.01" className={accInputClass} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} required /></AccField>
            <AccField label="Residual value"><input type="number" step="0.01" className={accInputClass} value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} /></AccField>
            <AccField label="Useful life (months)"><input type="number" className={accInputClass} value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} /></AccField>
          </div>
          <AccField label="Depreciation method">
            <select className={accInputClass} value={form.depreciationMethod} onChange={(e) => setForm({ ...form, depreciationMethod: e.target.value })}>
              <option value="straight_line">Straight line</option>
              <option value="reducing_balance">Reducing balance</option>
            </select>
          </AccField>
          <AccModalActions onCancel={() => setOpen(false)} submitLabel="Add asset" submitting={saving} />
        </form>
      </AccModal>
    </div>
  );
}
