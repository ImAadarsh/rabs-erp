'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { createBundleItem, deleteBundleItem, getBundle, listVariants, updateBundleItem } from '@/lib/api';

type BundleLine = {
  id: string;
  quantity: number;
  position: number;
  variant?: {
    id: string;
    variantSku: string;
    name?: string | null;
    catalogItem?: { id: string; sku: string; name: string } | null;
  } | null;
};

type VariantOption = {
  id: string;
  variantSku: string;
  name?: string | null;
  catalogItem?: { id: string; sku: string; name: string } | null;
};

function termDelay(search: string) {
  return search.trim() ? 250 : 0;
}

function variantLabel(v: VariantOption | BundleLine['variant']) {
  if (!v) return 'Unknown variant';
  const product = v.catalogItem?.name;
  const variantName = v.name && v.name !== 'Default' && v.name !== product ? ` · ${v.name}` : '';
  return `${product ?? v.name ?? v.variantSku}${variantName}`;
}

function QuantityCell({
  line,
  onSave
}: {
  line: BundleLine;
  onSave: (line: BundleLine, value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(line.quantity));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(String(line.quantity)), [line.quantity]);
  const dirty = draft !== String(line.quantity);
  async function save() {
    setSaving(true);
    try {
      await onSave(line, draft);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
        className="input w-20"
        aria-label={`Quantity of ${variantLabel(line.variant)}`}
      />
      {dirty && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );
}

export function BundleItemsEditor({
  bundle,
  canEdit,
  onClose,
  onCountChange
}: {
  bundle: { id: string; name: string };
  canEdit: boolean;
  onClose: () => void;
  onCountChange: (bundleId: string, lines: BundleLine[]) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<BundleLine[]>([]);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<VariantOption[]>([]);
  const [picked, setPicked] = useState<VariantOption | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);

  async function reload() {
    const res = await getBundle(bundle.id);
    const next: BundleLine[] = [...(res.data?.items || [])].sort(
      (a: BundleLine, b: BundleLine) => (a.position ?? 0) - (b.position ?? 0)
    );
    setLines(next);
    onCountChange(bundle.id, next);
  }

  useEffect(() => {
    reload()
      .catch((e: any) => toast.error(e?.response?.data?.error?.message ?? 'Failed to load bundle items'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.id]);

  useEffect(() => {
    if (!canEdit || (picked && search.trim() === picked.variantSku)) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const term = search.trim();
        const res = await listVariants({ status: 'active', limit: 40, ...(term ? { search: term } : {}) });
        if (!cancelled) setResults(res.data || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, termDelay(search));
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search, canEdit, picked]);

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) {
      toast.error('Search for a product variant and pick it from the list');
      return;
    }
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Quantity must be a whole number of at least 1');
      return;
    }
    setBusy(true);
    try {
      await createBundleItem({
        bundleId: bundle.id,
        variantId: picked.id,
        quantity: qty,
        position: lines.length
      });
      await reload();
      setPicked(null);
      setSearch('');
      setQuantity('1');
      toast.success('Added to bundle');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Could not add item');
    } finally {
      setBusy(false);
    }
  }

  async function changeQuantity(line: BundleLine, value: string) {
    const qty = Math.floor(Number(value));
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error('Quantity must be a whole number of at least 1');
      return;
    }
    if (qty === Number(line.quantity)) return;
    try {
      await updateBundleItem(line.id, { quantity: qty });
      await reload();
      toast.success('Quantity updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Could not update quantity');
    }
  }

  async function removeLine(line: BundleLine) {
    try {
      await deleteBundleItem(line.id);
      await reload();
      toast.success('Removed from bundle');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Could not remove item');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Bundle items · {bundle.name}</h3>
            <p className="text-sm text-muted-foreground">Products (variants) and quantities included in this bundle.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading items…
          </div>
        ) : lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            This bundle has no items yet.{canEdit ? ' Add products below.' : ''}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 font-medium">SKU</th>
                <th className="py-2 font-medium w-44">Quantity</th>
                {canEdit && <th className="py-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-border/60">
                  <td className="py-2">{variantLabel(line.variant)}</td>
                  <td className="py-2 font-mono text-xs">{line.variant?.variantSku ?? '-'}</td>
                  <td className="py-2">
                    {canEdit ? (
                      <QuantityCell line={line} onSave={changeQuantity} />
                    ) : (
                      line.quantity
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-2 text-right">
                      <button
                        onClick={() => void removeLine(line)}
                        className="p-1 hover:bg-muted rounded text-red-600"
                        title="Remove from bundle"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canEdit && (
          <form onSubmit={addLine} className="mt-6 space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-semibold">Add a product</h4>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_auto] gap-3 items-start">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPicked(null);
                  }}
                  placeholder="Search by product name or SKU"
                  className="input !pl-9"
                  aria-label="Search variants"
                />
                {searching && (
                  <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
                {picked && <p className="mt-1 text-xs text-muted-foreground">Selected: {variantLabel(picked)}</p>}
                {!picked && (
                  <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-background">
                    {results.length === 0 && !searching && (
                      <li className="px-3 py-2 text-sm text-muted-foreground">No products match.</li>
                    )}
                    {results.map((v) => (
                      <li key={v.id} className="border-b border-border/60 last:border-0">
                        <button
                          type="button"
                          onClick={() => {
                            setPicked(v);
                            setSearch(variantLabel(v));
                            setResults([]);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        >
                          <span className="font-medium">{variantLabel(v)}</span>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{v.variantSku}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input"
                aria-label="Quantity"
              />
              <button type="submit" disabled={busy || !picked} className="btn btn-primary flex items-center gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
