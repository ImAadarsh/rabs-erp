'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  createB2bAdminOrder,
  getB2bRetailer,
  listB2bOrders,
  listB2bRetailerCatalog,
  listB2bRetailers,
  listB2bShippingMethods
} from '@/lib/api';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, ShoppingCart, Trash2, X } from 'lucide-react';

type DraftLine = { variantId: string; sku: string; name: string; quantity: number; unitPrice: number; vatRate: number; stock: number };

const gbp = (n: any) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function B2bOrdersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const orgId = session?.user?.organizationId;

  const [showNew, setShowNew] = useState(false);
  const [retailers, setRetailers] = useState<any[]>([]);
  const [shippingMethods, setShippingMethods] = useState<any[]>([]);
  const [retailerId, setRetailerId] = useState('');
  const [retailerDetail, setRetailerDetail] = useState<any>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [shippingCode, setShippingCode] = useState('');
  const [addressId, setAddressId] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'' | 'trade_credit' | 'bank_transfer' | 'pay_on_portal'>('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!orgId) return;
    const res = await listB2bOrders({ organizationId: orgId, limit: 200 });
    setItems(res.data || []);
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load()
      .catch(() => toast.error('Failed to load B2B orders'))
      .finally(() => setLoading(false));
    const preselect = new URLSearchParams(window.location.search).get('new');
    if (preselect && orgId) openNew(preselect);
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  const openNew = async (preselectRetailerId?: string) => {
    if (!orgId) return;
    setLines([]);
    setRetailerId('');
    setRetailerDetail(null);
    setCatalog([]);
    setProductSearch('');
    setShippingCode('');
    setAddressId('');
    setNotes('');
    setPaymentMethod('');
    setShowNew(true);
    try {
      const [r, s] = await Promise.all([
        listB2bRetailers({ organizationId: orgId }),
        listB2bShippingMethods({ organizationId: orgId })
      ]);
      setRetailers((r.data || []).filter((x: any) => x.status !== 'disabled'));
      setShippingMethods((s.data || []).filter((m: any) => m.isActive));
      if (preselectRetailerId) selectRetailer(preselectRetailerId);
    } catch {
      toast.error('Failed to load retailers');
    }
  };

  const selectRetailer = async (id: string) => {
    setRetailerId(id);
    setLines([]);
    setCatalog([]);
    setRetailerDetail(null);
    setAddressId('');
    setPaymentMethod('');
    if (!id || !orgId) return;
    setCatalogLoading(true);
    try {
      const [cat, det] = await Promise.all([listB2bRetailerCatalog(id, orgId), getB2bRetailer(id, orgId)]);
      setCatalog(cat.data || []);
      setRetailerDetail(det.data);
      const addrs = det.data?.customer?.addresses || [];
      const def = addrs.find((a: any) => a.isDefault) || addrs[0];
      if (def) setAddressId(String(def.id));
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to load retailer catalogue');
    } finally {
      setCatalogLoading(false);
    }
  };

  const variantOptions = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    const out: { product: any; variant: any }[] = [];
    for (const p of catalog) {
      for (const v of p.variants || []) {
        const hay = [p.name, p.sku, p.brand, v.sku, v.name, v.barcode].join(' ').toLowerCase();
        if (hay.includes(q)) out.push({ product: p, variant: v });
        if (out.length >= 30) return out;
      }
    }
    return out;
  }, [catalog, productSearch]);

  const addLine = (product: any, variant: any) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variant.id);
      if (existing) return prev.map((l) => (l.variantId === variant.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...prev,
        {
          variantId: variant.id,
          sku: variant.sku || product.sku,
          name: variant.name && variant.name !== product.name ? `${product.name} · ${variant.name}` : product.name,
          quantity: 1,
          unitPrice: Number(variant.casePrice || 0),
          vatRate: Number(variant.vatRate ?? 0.2),
          stock: Number(variant.stockLevel || 0)
        }
      ];
    });
    setProductSearch('');
  };

  const totals = useMemo(() => {
    const net = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const vat = lines.reduce((s, l) => s + l.unitPrice * l.quantity * l.vatRate, 0);
    return { net, vat, gross: net + vat };
  }, [lines]);

  const submit = async () => {
    if (!orgId || !retailerId) {
      toast.error('Select a retailer');
      return;
    }
    if (lines.length === 0) {
      toast.error('Add at least one product');
      return;
    }
    if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || !(l.unitPrice >= 0))) {
      toast.error('Each line needs a whole quantity of at least 1 and a price of £0 or more');
      return;
    }
    if (!paymentMethod) {
      toast.error('Choose a payment method');
      return;
    }
    if (paymentMethod === 'trade_credit' && totals.gross > availableCredit + 0.0001) {
      toast.error(`Order total ${gbp(totals.gross)} is over the retailer's available trade credit (${gbp(availableCredit)})`);
      return;
    }
    setSaving(true);
    try {
      const res = await createB2bAdminOrder({
        organizationId: orgId,
        retailerId,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
        shippingMethodCode: shippingCode || undefined,
        addressId: addressId || undefined,
        customerNotes: notes.trim() || undefined,
        paymentMethod
      });
      toast.success(`Order ${res.data?.orderNumber || ''} created`);
      setShowNew(false);
      await load();
      if (res.data?.id) router.push(`/b2b/orders/${res.data.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create order');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'orderNumber', header: 'Order' },
    { accessorFn: (r) => r.customer?.companyName || r.customerEmail, header: 'Retailer' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'paymentStatus', header: 'Payment' },
    { accessorKey: 'fulfillmentStatus', header: 'Fulfilment' },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => gbp(row.original.total)
    },
    {
      accessorKey: 'orderDate',
      header: 'Date',
      cell: ({ row }) => row.original.orderDate ? new Date(row.original.orderDate).toLocaleString('en-GB') : '—'
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Link
          href={`/b2b/orders/${row.original.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-primary"
        >
          <Eye size={14} /> View
        </Link>
      )
    }
  ], []);

  const addresses = retailerDetail?.customer?.addresses || [];
  const creditLimit = Number(retailerDetail?.customer?.creditLimit || 0);
  const availableCredit = Math.max(0, creditLimit - Number(retailerDetail?.customer?.creditUsed || 0));

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B · Orders" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShoppingCart />
              <div>
                <h1 className="text-xl font-bold">B2B orders</h1>
                <p className="text-sm text-muted-foreground">Orders placed on the wholesale website or created here by staff (channel b2b_portal).</p>
              </div>
            </div>
            <button onClick={() => openNew()} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
              <Plus size={16} /> New B2B order
            </button>
          </div>
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <RichDataTable data={items} columns={columns} searchPlaceholder="Search order number or retailer..." />
          )}
        </main>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-4xl p-6 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">New B2B order</h2>
              <button onClick={() => setShowNew(false)}><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-xs font-medium text-muted-foreground">
                Retailer *
                <select
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background text-sm text-foreground"
                  value={retailerId}
                  onChange={(e) => selectRetailer(e.target.value)}
                >
                  <option value="">Select retailer…</option>
                  {retailers.map((r) => (
                    <option key={r.id} value={r.id}>{r.customer?.companyName || r.email}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Shipping method
                <select
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background text-sm text-foreground"
                  value={shippingCode}
                  onChange={(e) => setShippingCode(e.target.value)}
                >
                  <option value="">No shipping charge</option>
                  {shippingMethods.map((m) => (
                    <option key={m.id} value={m.code}>{m.name} ({gbp(m.price)})</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-muted-foreground">
                Delivery address
                <select
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background text-sm text-foreground"
                  value={addressId}
                  onChange={(e) => setAddressId(e.target.value)}
                  disabled={!retailerId}
                >
                  <option value="">{addresses.length ? 'Select address…' : 'No saved address'}</option>
                  {addresses.map((a: any) => (
                    <option key={a.id} value={a.id}>{[a.addressLine1, a.city, a.postalCode].filter(Boolean).join(', ')}</option>
                  ))}
                </select>
              </label>
            </div>

            {retailerId && (
              <div className="relative">
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm"
                  placeholder={catalogLoading ? 'Loading retailer catalogue…' : `Search ${catalog.length} portal products by name, SKU or barcode`}
                  disabled={catalogLoading}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                {variantOptions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto bg-card border border-border rounded-xl shadow-lg divide-y divide-border">
                    {variantOptions.map(({ product, variant }) => (
                      <button
                        key={variant.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between gap-3"
                        onClick={() => addLine(product, variant)}
                      >
                        <span>
                          <span className="font-mono text-xs mr-2">{variant.sku}</span>
                          {product.name}{variant.name && variant.name !== product.name ? ` · ${variant.name}` : ''}
                        </span>
                        <span className="text-muted-foreground whitespace-nowrap">{gbp(variant.casePrice)} · stock {variant.stockLevel}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!catalogLoading && catalog.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">No products are published to the B2B portal for this retailer (check B2B → Products / Settings).</p>
                )}
              </div>
            )}

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-right px-3 py-2 w-24">Qty (cases)</th>
                    <th className="text-right px-3 py-2 w-32">Price / case (£)</th>
                    <th className="text-right px-3 py-2 w-28">Net</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Search above to add products.</td></tr>
                  ) : lines.map((l) => (
                    <tr key={l.variantId} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div>{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.sku} · stock {l.stock}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-20 border border-border rounded-lg px-2 py-1 bg-background text-right"
                          value={l.quantity}
                          onChange={(e) => setLines((prev) => prev.map((x) => x.variantId === l.variantId ? { ...x, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : x))}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-28 border border-border rounded-lg px-2 py-1 bg-background text-right"
                          value={l.unitPrice}
                          onChange={(e) => setLines((prev) => prev.map((x) => x.variantId === l.variantId ? { ...x, unitPrice: Math.max(0, Number(e.target.value) || 0) } : x))}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{gbp(l.unitPrice * l.quantity)}</td>
                      <td className="px-2">
                        <button onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-xs font-medium text-muted-foreground">
                Payment method *
                <select
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background text-sm text-foreground"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  disabled={!retailerId}
                >
                  <option value="">Select payment method…</option>
                  <option value="trade_credit" disabled={creditLimit <= 0}>
                    Trade credit {retailerId ? `(available ${gbp(availableCredit)} of ${gbp(creditLimit)})` : ''}
                  </option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="pay_on_portal">Retailer pays on the B2B portal</option>
                </select>
                {paymentMethod === 'trade_credit' && (
                  <span className={`block mt-1 ${totals.gross > availableCredit ? 'text-destructive' : ''}`}>
                    The order total (incl. shipping) is charged to the retailer&apos;s credit when saved; orders over the available credit are refused.
                  </span>
                )}
              </label>
              <div />
              <label className="block text-xs font-medium text-muted-foreground">
                Notes
                <textarea
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background text-sm text-foreground"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes for the order"
                />
              </label>
              <div className="text-sm space-y-1 self-end">
                <div className="flex justify-between"><span className="text-muted-foreground">Net</span><span>{gbp(totals.net)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{gbp(totals.vat)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total (excl. shipping)</span><span>{gbp(totals.gross)}</span></div>
                <p className="text-xs text-muted-foreground">Shipping and any free-delivery threshold are applied when the order is saved.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 rounded-xl border border-border text-sm" onClick={() => setShowNew(false)}>Cancel</button>
              <button
                disabled={saving || !retailerId || lines.length === 0 || !paymentMethod}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                onClick={submit}
              >
                {saving ? 'Creating…' : 'Create order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
