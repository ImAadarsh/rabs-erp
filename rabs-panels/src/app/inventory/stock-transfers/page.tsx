'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import {
  listStockTransfers,
  createStockTransfer,
  deleteStockTransfer,
  listWarehouses,
  listTransferAvailability,
  type TransferAvailability
} from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { ColumnDef } from '@tanstack/react-table';
import { Trash2, Plus, X, ArrowRightLeft, Search, Receipt, Loader2, AlertTriangle } from 'lucide-react';

type StockTransfer = {
  id: string;
  transferNumber: string;
  transferDate: string;
  status: string;
  receivedAt?: string | null;
  fromWarehouse?: { id: string; name: string };
  toWarehouse?: { id: string; name: string };
  lines?: Array<{
    id: string;
    quantitySent: number;
    quantityReceived: number;
    variant?: { variantSku: string };
  }>;
};

type FormLine = {
  variantId: string;
  variantSku: string;
  quantitySent: number;
  available: number;
};

const emptyForm = () => ({
  fromWarehouseId: '',
  toWarehouseId: '',
  transferDate: new Date().toISOString().split('T')[0],
  notes: '',
  lines: [] as FormLine[]
});

export default function StockTransfersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockTransfer[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDel, setConfirmDel] = useState<StockTransfer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState(emptyForm());

  // Stock available at the selected source warehouse, so a transfer can only
  // be built from what is actually there.
  const [stock, setStock] = useState<TransferAvailability[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [variantSearch, setVariantSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const orgId = session?.user?.organizationId;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [transfersRes, warehousesRes] = await Promise.all([
        listStockTransfers({ organizationId: orgId }),
        listWarehouses()
      ]);
      setItems(transfersRes.data || []);
      setWarehouses(warehousesRes.data || []);
    } catch {
      toast.error('Failed to load stock transfers');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void loadData();
  }, [hydrated, hasAccess, router, session?.accessToken, loadData]);

  useEffect(() => {
    if (!form.fromWarehouseId) {
      setStock([]);
      return;
    }
    let cancelled = false;
    setStockLoading(true);
    listTransferAvailability({ warehouseId: form.fromWarehouseId })
      .then((res) => { if (!cancelled) setStock(res.data || []); })
      .catch(() => { if (!cancelled) toast.error('Could not load stock for that warehouse'); })
      .finally(() => { if (!cancelled) setStockLoading(false); });
    return () => { cancelled = true; };
  }, [form.fromWarehouseId]);

  const availableToAdd = useMemo(() => {
    const chosen = new Set(form.lines.map((l) => l.variantId));
    const term = variantSearch.trim().toLowerCase();
    return stock
      .filter((s) => !chosen.has(s.variantId))
      .filter((s) => !term
        || s.variantSku.toLowerCase().includes(term)
        || (s.variantName ?? '').toLowerCase().includes(term))
      .slice(0, 50);
  }, [stock, form.lines, variantSearch]);

  function addLine(entry: TransferAvailability) {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, {
        variantId: entry.variantId,
        variantSku: entry.variantSku,
        quantitySent: 1,
        available: entry.available
      }]
    }));
    setVariantSearch('');
    setPickerOpen(false);
  }

  function removeLine(variantId: string) {
    setForm((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.variantId !== variantId) }));
  }

  function setLineQty(variantId: string, quantitySent: number) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => l.variantId === variantId ? { ...l, quantitySent } : l)
    }));
  }

  const overCommitted = form.lines.filter((l) => l.quantitySent > l.available);
  const invalidQty = form.lines.some((l) => !Number.isFinite(l.quantitySent) || l.quantitySent < 1);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fromWarehouseId || !form.toWarehouseId) {
      toast.error('Choose both a source and a destination warehouse');
      return;
    }
    if (form.fromWarehouseId === form.toWarehouseId) {
      toast.error('From and to warehouses cannot be the same');
      return;
    }
    if (form.lines.length === 0) {
      toast.error('Add at least one product to transfer');
      return;
    }
    if (invalidQty) {
      toast.error('Every line needs a quantity of at least 1');
      return;
    }
    if (overCommitted.length > 0) {
      toast.error(`Not enough stock for ${overCommitted.map((l) => l.variantSku).join(', ')}`);
      return;
    }

    try {
      setSubmitting(true);
      const res = await createStockTransfer({
        organizationId: orgId!,
        fromWarehouseId: form.fromWarehouseId,
        toWarehouseId: form.toWarehouseId,
        transferDate: form.transferDate,
        notes: form.notes || undefined,
        lines: form.lines.map((l) => ({ variantId: l.variantId, quantitySent: l.quantitySent }))
      });

      const created = res.data;
      setItems((prev) => [created, ...prev]);
      setShowCreate(false);
      setForm(emptyForm());
      toast.success(`${created.transferNumber} completed — stock moved`);
      router.push(`/inventory/stock-transfers/${created.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create stock transfer');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!confirmDel) return;
    try {
      await deleteStockTransfer(confirmDel.id);
      setItems((prev) => prev.filter((item) => item.id !== confirmDel.id));
      setConfirmDel(null);
      toast.success('Transfer reversed and deleted — stock returned to source');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to delete stock transfer');
    }
  }

  const columns = useMemo<ColumnDef<StockTransfer>[]>(() => [
    {
      accessorKey: 'transferNumber',
      header: 'Transfer',
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/inventory/stock-transfers/${row.original.id}`)}
          className="flex items-center gap-2 text-left hover:underline"
        >
          <ArrowRightLeft size={16} className="text-muted-foreground" />
          <span className="font-medium">{row.original.transferNumber}</span>
        </button>
      )
    },
    {
      id: 'route',
      header: 'Route',
      accessorFn: (r) => `${r.fromWarehouse?.name ?? ''} ${r.toWarehouse?.name ?? ''}`,
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="truncate">{row.original.fromWarehouse?.name ?? '—'}</div>
          <div className="truncate text-xs text-muted-foreground">
            → {row.original.toWarehouse?.name ?? '—'}
          </div>
        </div>
      )
    },
    {
      id: 'items',
      header: 'Items',
      accessorFn: (r) => r.lines?.length ?? 0,
      cell: ({ row }) => {
        const lines = row.original.lines ?? [];
        const units = lines.reduce((s, l) => s + (l.quantitySent ?? 0), 0);
        return (
          <div className="text-sm">
            <span className="font-medium">{units}</span>
            <span className="text-muted-foreground"> units · {lines.length} SKU{lines.length === 1 ? '' : 's'}</span>
          </div>
        );
      }
    },
    {
      accessorKey: 'transferDate',
      header: 'Date',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {new Date(row.original.transferDate).toLocaleDateString('en-GB')}
        </span>
      )
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'draft';
        const styles: Record<string, string> = {
          draft: 'bg-muted text-muted-foreground border-border',
          submitted: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
          in_transit: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
          received: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
          cancelled: 'bg-red-500/10 text-red-600 border-red-500/20'
        };
        return (
          <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? styles.draft}`}>
            {status === 'received' ? 'Completed' : status.replace(/_/g, ' ')}
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => router.push(`/inventory/stock-transfers/${row.original.id}`)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="View receipt"
          >
            <Receipt className="h-4 w-4" />
          </button>
          <button
            onClick={() => setConfirmDel(row.original)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-red-500"
            title="Reverse and delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ], [router]);

  if (!hydrated || !hasAccess) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Inventory · Stock Transfers" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-center">
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-bold">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <ArrowRightLeft size={24} />
                  </div>
                  Stock Transfers
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Move stock between warehouses. Transfers are approved on creation — the stock moves
                  immediately and a receipt is produced.
                </p>
              </div>
              <button
                onClick={() => { setForm(emptyForm()); setShowCreate(true); }}
                className="inline-flex items-center gap-2 self-start rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 md:self-auto"
              >
                <Plus className="h-4 w-4" />
                New Transfer
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading stock transfers…
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
                <RichDataTable columns={columns} data={items} searchPlaceholder="Search by transfer number or warehouse…" />
              </div>
            )}
          </div>

          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
              <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">New Stock Transfer</h3>
                  <button
                    onClick={() => { setShowCreate(false); setForm(emptyForm()); }}
                    className="rounded-lg p-1 hover:bg-muted"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="mb-5 text-sm text-muted-foreground">
                  The transfer number is generated automatically, and the stock moves as soon as you confirm.
                </p>

                <form onSubmit={onCreate} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium">
                        From warehouse <span className="text-destructive">*</span>
                      </span>
                      <select
                        value={form.fromWarehouseId}
                        onChange={(e) => setForm((p) => ({ ...p, fromWarehouseId: e.target.value, lines: [] }))}
                        className="select"
                        required
                      >
                        <option value="">Select…</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium">
                        To warehouse <span className="text-destructive">*</span>
                      </span>
                      <select
                        value={form.toWarehouseId}
                        onChange={(e) => setForm((p) => ({ ...p, toWarehouseId: e.target.value }))}
                        className="select"
                        required
                      >
                        <option value="">Select…</option>
                        {warehouses.filter((w) => w.id !== form.fromWarehouseId).map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium">
                        Transfer date <span className="text-destructive">*</span>
                      </span>
                      <input
                        type="date"
                        value={form.transferDate}
                        onChange={(e) => setForm((p) => ({ ...p, transferDate: e.target.value }))}
                        className="input"
                        required
                      />
                    </label>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Products <span className="text-destructive">*</span>
                      </span>
                      {form.fromWarehouseId && (
                        <span className="text-xs text-muted-foreground">
                          {stockLoading ? 'Loading stock…' : `${stock.length} SKUs in stock here`}
                        </span>
                      )}
                    </div>

                    {!form.fromWarehouseId ? (
                      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        Choose a source warehouse to see what can be transferred.
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Search a SKU or product name to add…"
                            value={variantSearch}
                            onChange={(e) => { setVariantSearch(e.target.value); setPickerOpen(true); }}
                            onFocus={() => setPickerOpen(true)}
                            className="input !pl-9"
                          />
                          {pickerOpen && availableToAdd.length > 0 && (
                            <>
                              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                                {availableToAdd.map((entry) => (
                                  <button
                                    key={entry.variantId}
                                    type="button"
                                    onClick={() => addLine(entry)}
                                    className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-muted"
                                  >
                                    <span className="min-w-0">
                                      <span className="block font-medium">{entry.variantSku}</span>
                                      {entry.variantName && (
                                        <span className="block truncate text-xs text-muted-foreground">
                                          {entry.variantName}
                                        </span>
                                      )}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                      {entry.available} available
                                    </span>
                                  </button>
                                ))}
                              </div>
                              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                            </>
                          )}
                        </div>

                        {form.lines.length > 0 && (
                          <div className="mt-3 overflow-hidden rounded-lg border border-border">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                                  <th className="w-28 px-3 py-2 text-right font-medium">Available</th>
                                  <th className="w-32 px-3 py-2 text-right font-medium">Quantity</th>
                                  <th className="w-10" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {form.lines.map((line) => {
                                  const over = line.quantitySent > line.available;
                                  return (
                                    <tr key={line.variantId}>
                                      <td className="px-3 py-2 font-medium">{line.variantSku}</td>
                                      <td className="px-3 py-2 text-right text-muted-foreground">{line.available}</td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="number"
                                          min={1}
                                          max={line.available}
                                          value={line.quantitySent}
                                          onChange={(e) => setLineQty(line.variantId, parseInt(e.target.value, 10) || 0)}
                                          className={`h-9 w-full rounded-lg border bg-background px-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ${over ? 'border-red-500 text-red-600' : 'border-border'
                                            }`}
                                        />
                                      </td>
                                      <td className="px-2">
                                        <button
                                          type="button"
                                          onClick={() => removeLine(line.variantId)}
                                          className="rounded p-1 text-muted-foreground hover:text-red-500"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {overCommitted.length > 0 && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              Not enough stock for {overCommitted.map((l) => l.variantSku).join(', ')}.
                              Reduce the quantity to continue.
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </label>

                  <div className="flex justify-end gap-2 border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() => { setShowCreate(false); setForm(emptyForm()); }}
                      className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || overCommitted.length > 0 || form.lines.length === 0}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      Transfer stock
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {confirmDel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
                <h3 className="mb-2 text-lg font-semibold">Reverse this transfer?</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Deleting {confirmDel.transferNumber} returns the stock to{' '}
                  {confirmDel.fromWarehouse?.name ?? 'the source warehouse'} and records the reversal in
                  the stock ledger. This cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmDel(null)}
                    className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onDelete}
                    className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                  >
                    Reverse and delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
