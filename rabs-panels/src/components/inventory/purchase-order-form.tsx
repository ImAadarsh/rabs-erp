'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, X } from 'lucide-react';
import {
  createPurchaseOrderWithLines,
  listSuppliers,
  listVariants,
  listWarehouses,
  updatePurchaseOrderWithLines
} from '@/lib/api';
import { FloatingDropdown } from '@/components/inventory/floating-dropdown';
import { activeWarehouses } from '@/components/inventory/location-status-badge';

type FormLine = {
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Percent shown to the user; sent to the API as a fraction. */
  taxPercent: number;
};

const today = () => new Date().toISOString().split('T')[0];
const dateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '');
const round2 = (n: number) => Math.round(n * 100) / 100;
const DEFAULT_TAX_PERCENT = 20;
const CURRENCIES = ['GBP', 'EUR', 'USD'];

/**
 * Create a purchase order, or edit one that is still a draft. Totals are recomputed by the API
 * from the lines; the figures shown here are a preview.
 */
export function PurchaseOrderForm({
  organizationId,
  purchaseOrder,
  onClose,
  onSaved
}: {
  organizationId: string;
  purchaseOrder?: any | null;
  onClose: () => void;
  onSaved: (po: any) => void;
}) {
  const editing = !!purchaseOrder;
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const [form, setForm] = useState(() => ({
    supplierId: purchaseOrder?.supplier?.id ?? '',
    warehouseId: purchaseOrder?.warehouse?.id ?? '',
    poNumber: purchaseOrder?.poNumber ?? '',
    reference: purchaseOrder?.reference ?? '',
    orderDate: dateOnly(purchaseOrder?.orderDate) || today(),
    expectedDeliveryDate: dateOnly(purchaseOrder?.expectedDeliveryDate),
    currency: purchaseOrder?.currency ?? 'GBP',
    shippingCost: purchaseOrder ? Number(purchaseOrder.shippingCost ?? 0) : 0,
    otherCosts: purchaseOrder ? Number(purchaseOrder.otherCosts ?? 0) : 0,
    notes: purchaseOrder?.notes ?? '',
    lines: ((purchaseOrder?.lines ?? []) as any[]).map((l): FormLine => ({
      variantId: String(l.variant?.id ?? ''),
      sku: l.variant?.variantSku ?? '',
      name: l.variant?.name || l.variant?.catalogItem?.name || '',
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      taxPercent: round2(Number(l.taxRate ?? 0) * 100)
    }))
  }));

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listSuppliers({ organizationId })
      .then((s) => setSuppliers(s.data || []))
      .catch(() => toast.error('Failed to load suppliers'));
    listWarehouses()
      .then((w) => setWarehouses(w.data || []))
      .catch(() => toast.error('Failed to load warehouses'));
  }, [organizationId]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      listVariants({ search: term, status: 'active' })
        .then((res) => { if (!cancelled) setResults((res.data || []).slice(0, 30)); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const supplierOptions = suppliers.filter((s) => s.status === 'active' || s.id === form.supplierId);
  const warehouseOptions = activeWarehouses(warehouses);
  const chosen = new Set(form.lines.map((l) => l.variantId));

  function addVariant(v: any) {
    setForm((p) => ({
      ...p,
      lines: [...p.lines, {
        variantId: String(v.id),
        sku: v.variantSku,
        name: v.name || v.catalogItem?.name || '',
        quantity: 1,
        unitPrice: v.costPrice != null ? Number(v.costPrice) : 0,
        taxPercent: DEFAULT_TAX_PERCENT
      }]
    }));
    setSearch('');
    setPickerOpen(false);
  }

  function setLine(idx: number, patch: Partial<FormLine>) {
    setForm((p) => ({ ...p, lines: p.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of form.lines) {
      const net = (l.quantity || 0) * (l.unitPrice || 0);
      subtotal += net;
      tax += net * ((l.taxPercent || 0) / 100);
    }
    const total = subtotal + tax + (form.shippingCost || 0) + (form.otherCosts || 0);
    return { subtotal: round2(subtotal), tax: round2(tax), total: round2(total) };
  }, [form.lines, form.shippingCost, form.otherCosts]);

  const invalidLine = form.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.unitPrice < 0 || l.taxPercent < 0 || l.taxPercent > 100);

  async function save(submit: boolean) {
    if (!form.supplierId || !form.warehouseId || !form.orderDate) {
      toast.error('Choose a supplier, a delivery warehouse and an order date');
      return;
    }
    if (form.lines.length === 0) {
      toast.error('Add at least one product line');
      return;
    }
    if (invalidLine) {
      toast.error('Each line needs a whole quantity of at least 1, a unit cost ≥ 0 and tax between 0 and 100%');
      return;
    }
    const payload = {
      supplierId: form.supplierId,
      warehouseId: form.warehouseId,
      poNumber: form.poNumber.trim() || undefined,
      reference: form.reference.trim() || undefined,
      orderDate: form.orderDate,
      expectedDeliveryDate: form.expectedDeliveryDate || undefined,
      currency: form.currency,
      shippingCost: form.shippingCost || 0,
      otherCosts: form.otherCosts || 0,
      notes: form.notes.trim() || undefined,
      lines: form.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: Math.round(l.taxPercent * 100) / 10000
      }))
    };
    try {
      setSaving(submit ? 'submit' : 'draft');
      let res;
      if (editing) {
        res = await updatePurchaseOrderWithLines(purchaseOrder.id, payload);
        if (submit) res = await updatePurchaseOrderWithLines(purchaseOrder.id, { status: 'submitted' });
      } else {
        res = await createPurchaseOrderWithLines({ organizationId, ...payload, status: submit ? 'submitted' : 'draft' });
      }
      toast.success(`${res.data.poNumber} ${submit ? 'submitted' : 'saved as draft'}`);
      onSaved(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to save purchase order');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{editing ? `Edit ${purchaseOrder.poNumber}` : 'New Purchase Order'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Leave the PO number empty to generate one automatically. Stock is booked in later through ASN / GRN.
        </p>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Supplier <span className="text-destructive">*</span></span>
              <select
                value={form.supplierId}
                onChange={(e) => {
                  const sup = suppliers.find((s) => s.id === e.target.value);
                  setForm((p) => ({ ...p, supplierId: e.target.value, currency: !editing && sup?.currency ? sup.currency : p.currency }));
                }}
                className="select"
              >
                <option value="">Select…</option>
                {supplierOptions.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Deliver to warehouse <span className="text-destructive">*</span></span>
              <select value={form.warehouseId} onChange={(e) => setForm((p) => ({ ...p, warehouseId: e.target.value }))} className="select">
                <option value="">Select…</option>
                {warehouseOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">Only active warehouses are listed.</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">PO number</span>
              <input
                type="text"
                value={form.poNumber}
                onChange={(e) => setForm((p) => ({ ...p, poNumber: e.target.value }))}
                placeholder="Auto (PO-YYYY-00001)"
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Order date <span className="text-destructive">*</span></span>
              <input type="date" value={form.orderDate} onChange={(e) => setForm((p) => ({ ...p, orderDate: e.target.value }))} className="input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Expected delivery</span>
              <input type="date" value={form.expectedDeliveryDate} onChange={(e) => setForm((p) => ({ ...p, expectedDeliveryDate: e.target.value }))} className="input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Currency</span>
              <select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} className="select">
                {[...new Set([form.currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className="mb-1.5 block text-sm font-medium">Supplier reference</span>
              <input type="text" value={form.reference} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} className="input" />
            </label>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium">Lines <span className="text-destructive">*</span></span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search a SKU or product name to add a line…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPickerOpen(true); }}
                onFocus={() => setPickerOpen(true)}
                className="input !pl-9"
              />
              <FloatingDropdown anchor={searchRef.current} open={pickerOpen && search.trim().length >= 2} onClose={() => setPickerOpen(false)}>
                {searching ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
                ) : results.filter((v) => !chosen.has(String(v.id))).length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matching products</div>
                ) : (
                  results.filter((v) => !chosen.has(String(v.id))).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => addVariant(v)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{v.variantSku}</span>
                        <span className="block truncate text-xs text-muted-foreground">{v.name || v.catalogItem?.name || ''}</span>
                      </span>
                      {v.costPrice != null && <span className="shrink-0 text-xs text-muted-foreground">cost {Number(v.costPrice).toFixed(2)}</span>}
                    </button>
                  ))
                )}
              </FloatingDropdown>
            </div>

            {form.lines.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Product</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Qty</th>
                      <th className="w-32 px-3 py-2 text-right font-medium">Unit cost</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Tax %</th>
                      <th className="w-32 px-3 py-2 text-right font-medium">Line total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.lines.map((l, idx) => {
                      const net = (l.quantity || 0) * (l.unitPrice || 0);
                      const gross = net * (1 + (l.taxPercent || 0) / 100);
                      return (
                        <tr key={l.variantId}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{l.sku}</div>
                            {l.name && <div className="truncate text-xs text-muted-foreground">{l.name}</div>}
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={1} step={1} value={l.quantity}
                              onChange={(e) => setLine(idx, { quantity: parseInt(e.target.value, 10) || 0 })}
                              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-right text-sm" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step="0.01" value={l.unitPrice}
                              onChange={(e) => setLine(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-right text-sm" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} max={100} step="0.01" value={l.taxPercent}
                              onChange={(e) => setLine(idx, { taxPercent: parseFloat(e.target.value) || 0 })}
                              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-right text-sm" />
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{gross.toFixed(2)}</td>
                          <td className="px-2">
                            <button type="button" onClick={() => setForm((p) => ({ ...p, lines: p.lines.filter((_, i) => i !== idx) }))}
                              className="rounded p-1 text-muted-foreground hover:text-red-500">
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
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={4}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{form.currency} {totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{form.currency} {totals.tax.toFixed(2)}</span></div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Shipping</span>
                <input type="number" min={0} step="0.01" value={form.shippingCost}
                  onChange={(e) => setForm((p) => ({ ...p, shippingCost: parseFloat(e.target.value) || 0 }))}
                  className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-right text-sm" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Other costs</span>
                <input type="number" min={0} step="0.01" value={form.otherCosts}
                  onChange={(e) => setForm((p) => ({ ...p, otherCosts: parseFloat(e.target.value) || 0 }))}
                  className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-right text-sm" />
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span><span>{form.currency} {totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-muted">
              Cancel
            </button>
            <button type="button" onClick={() => save(false)} disabled={saving !== null}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
              {saving === 'draft' && <Loader2 className="h-4 w-4 animate-spin" />}
              Save draft
            </button>
            <button type="button" onClick={() => save(true)} disabled={saving !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving === 'submit' && <Loader2 className="h-4 w-4 animate-spin" />}
              Save &amp; submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
